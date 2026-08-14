// ALDR CRM — Feishu (Lark) Base data source, backed by SSO + Bitable + Drive media.
//
// Single edge function with `action` routing. The browser talks to this function
// directly (with `credentials: include`) so the httpOnly session cookie lives on
// the edge-function origin.
//
// Auth model:
//  - SSO via Feishu web-app OAuth (authorization code flow).
//  - Session = HS256 JWT (httpOnly cookie) containing the user identity and the
//    AES-256-GCM-encrypted user_access_token + refresh_token.
//  - Record CRUD + media use the user_access_token so Feishu's own permission
//    model is authoritative; we additionally enforce created_by ownership.
//
// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  baseAppToken,
  bitableDownloadExtra,
  env,
  exchangeAuthorizationCode,
  feishuAuthorizeUrl,
  feishuFetchJson,
  getUserInfo,
  refreshAccessToken,
  signJwt,
  uploadMedia,
  verifyJwt,
  type FeishuUser,
} from "../_shared/feishu.ts";
import supabase from "../_shared/supabaseAdmin.ts";

const FEISHU_DOMAIN = "https://open.feishu.cn";
const SESSION_COOKIE = "crm_session";
const SESSION_TTL_SEC = 7 * 24 * 60 * 60; // 7 days
const ACCESS_TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh if expiring within 5 min

interface Tokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number; // epoch ms
}

interface Session {
  sessionId: string;
  openId: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  tokens: Tokens;
}

interface Ctx {
  session: Session | null;
  refreshError: string | null;
  req: Request;
}

function unauthorized(ctx: Ctx): Response {
  return json(
    { error: "unauthorized", detail: ctx.refreshError ?? undefined },
    401,
  );
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-crm-session",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

function isHttps(req: Request): boolean {
  return new URL(req.url).protocol === "https:" ||
    req.headers.get("x-forwarded-proto") === "https";
}

function buildSessionCookie(jwt: string, req: Request, maxAgeSec: number): string {
  const secure = isHttps(req) ? "Secure; " : "";
  const sameSite = isHttps(req) ? "SameSite=None; " : "SameSite=Lax; ";
  return `${SESSION_COOKIE}=${jwt}; HttpOnly; ${sameSite}${secure}Path=/; Max-Age=${maxAgeSec}`;
}

function baseFunctionUrl(req: Request): string {
  // The edge runtime rewrites `req.url` to its internal address, so reconstruct
  // the externally-reachable URL from forwarded headers (or an explicit config).
  const configured = Deno.env.get("CRM_FUNCTION_URL");
  if (configured) return configured.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") || "http";
  let host = req.headers.get("x-forwarded-host") || new URL(req.url).host;
  const port = req.headers.get("x-forwarded-port");
  if (port && !host.includes(":")) host = `${host}:${port}`;
  return `${proto}://${host}/functions/v1/crm`;
}

function siteUrl(): string {
  return env("CRM_SITE_URL").replace(/\/$/, "");
}

function readCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

async function getSession(req: Request): Promise<Session | null> {
  const sessionId =
    readCookie(req, SESSION_COOKIE) || req.headers.get("x-crm-session") || null;
  if (!sessionId) return null;

  const { data, error } = await supabase
    .from("crm_sessions")
    .select("id, open_id, name, email, avatar_url, tokens, expires_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;

  return {
    sessionId: data.id,
    openId: data.open_id,
    name: data.name || undefined,
    email: data.email || undefined,
    avatarUrl: data.avatar_url || undefined,
    tokens: data.tokens as Tokens,
  };
}

/** Ensure the user_access_token is still valid; refresh (and persist) if needed. */
async function ensureFreshAccessToken(ctx: Ctx): Promise<string | null> {
  if (!ctx.session) return null;
  const { tokens } = ctx.session;

  if (tokens.accessTokenExpiresAt > Date.now() + ACCESS_TOKEN_REFRESH_MARGIN_MS) {
    return tokens.accessToken;
  }

  try {
    const refreshed = await refreshAccessToken(tokens.refreshToken);
    ctx.session.tokens = {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      accessTokenExpiresAt: Date.now() + refreshed.expires_in * 1000,
    };
    await supabase
      .from("crm_sessions")
      .update({ tokens: ctx.session.tokens })
      .eq("id", ctx.session.sessionId);
    return refreshed.access_token;
  } catch (err) {
    console.error("failed to refresh user access token", err);
    ctx.refreshError = err instanceof Error ? err.message : String(err);
    return null;
  }
}

async function createSession(session: Omit<Session, "sessionId">): Promise<string> {
  const { data, error } = await supabase
    .from("crm_sessions")
    .insert({
      open_id: session.openId,
      name: session.name ?? null,
      email: session.email ?? null,
      avatar_url: session.avatarUrl ?? null,
      tokens: session.tokens,
      expires_at: new Date(Date.now() + SESSION_TTL_SEC * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

// ---------------------------------------------------------------------------
// Auth actions
// ---------------------------------------------------------------------------

async function actionLogin(req: Request, url: URL): Promise<Response> {
  const redirectTo = url.searchParams.get("redirect_to") || `${siteUrl()}/crm`;
  // When relayed through the Astro BFF, the OAuth redirect_uri points at the
  // site's own callback instead of this function.
  const redirectUri = url.searchParams.get("redirect_uri") || baseFunctionUrl(req);
  const secret = env("CRM_JWT_SECRET");
  const state = await signJwt(
    { act: "login", redirect_to: redirectTo, redirect_uri: redirectUri },
    secret,
    600,
  );
  return new Response(null, {
    status: 302,
    headers: { Location: feishuAuthorizeUrl(redirectUri, state) },
  });
}

async function completeLogin(
  code: string,
  redirectUri: string,
): Promise<{ sessionId: string; user: FeishuUser }> {
  const tokenResult = await exchangeAuthorizationCode(code, redirectUri);
  const user = await getUserInfo(tokenResult.access_token);

  const sessionId = await createSession({
    openId: user.open_id,
    name: user.name || user.en_name,
    email: user.email,
    avatarUrl: user.avatar_url,
    tokens: {
      accessToken: tokenResult.access_token,
      refreshToken: tokenResult.refresh_token ?? "",
      accessTokenExpiresAt: Date.now() + tokenResult.expires_in * 1000,
    },
  });

  return { sessionId, user };
}

async function actionCallback(req: Request, url: URL): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return json({ error: "missing code or state" }, 400);
  }

  const secret = env("CRM_JWT_SECRET");
  const statePayload = await verifyJwt(state, secret);
  if (!statePayload || statePayload.act !== "login") {
    return json({ error: "invalid state" }, 400);
  }
  const redirectTo =
    (statePayload.redirect_to as string) || `${siteUrl()}/crm`;
  const redirectUri =
    (statePayload.redirect_uri as string) || baseFunctionUrl(req);

  const { sessionId } = await completeLogin(code, redirectUri);
  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectTo,
      "Set-Cookie": buildSessionCookie(sessionId, req, SESSION_TTL_SEC),
    },
  });
}

/** Server-to-server OAuth code exchange used by the Astro BFF. Returns the
 *  signed session JWT so the caller can set its own (same-origin) cookie. */
async function actionExchangeCode(req: Request, body: any): Promise<Response> {
  const code: string | undefined = body?.code;
  const state: string | undefined = body?.state;
  if (!code || !state) return json({ error: "code and state required" }, 400);

  const secret = env("CRM_JWT_SECRET");
  const statePayload = await verifyJwt(state, secret);
  if (!statePayload || statePayload.act !== "login") {
    return json({ error: "invalid state" }, 400);
  }
  const redirectUri =
    (statePayload.redirect_uri as string) || baseFunctionUrl(req);

  const { sessionId, user } = await completeLogin(code, redirectUri);
  return json({ sessionId, user });
}

async function actionSession(ctx: Ctx): Promise<Response> {
  if (!ctx.session) return unauthorized(ctx);
  return json({
    openId: ctx.session.openId,
    name: ctx.session.name,
    email: ctx.session.email,
    avatarUrl: ctx.session.avatarUrl,
  });
}

async function actionDebug(ctx: Ctx, req: Request): Promise<Response> {
  const cookie = readCookie(req, SESSION_COOKIE);
  const tokens = ctx.session?.tokens;
  const expiresAt = tokens?.accessTokenExpiresAt ?? 0;

  let sessionCount: number | null = null;
  try {
    const { count } = await supabase
      .from("crm_sessions")
      .select("id", { count: "exact", head: true });
    sessionCount = count ?? 0;
  } catch {
    sessionCount = null;
  }

  return json({
    cookiePresent: !!cookie,
    cookieLength: cookie?.length ?? 0,
    sessionValid: !!ctx.session,
    openId: ctx.session?.openId ?? null,
    accessTokenLength: tokens?.accessToken?.length ?? 0,
    refreshTokenLength: tokens?.refreshToken?.length ?? 0,
    refreshTokenPresent: !!(tokens?.refreshToken),
    accessTokenExpiresAt: expiresAt,
    now: Date.now(),
    accessTokenExpired: expiresAt <= Date.now(),
    sessionCount,
  });
}

async function actionLogout(req: Request): Promise<Response> {
  const sessionId = readCookie(req, SESSION_COOKIE);
  if (sessionId) {
    await supabase.from("crm_sessions").delete().eq("id", sessionId);
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${siteUrl()}/crm/login`,
      "Set-Cookie": buildSessionCookie("", req, 0),
    },
  });
}

// ---------------------------------------------------------------------------
// Record actions
// ---------------------------------------------------------------------------

function feishuAuth(userToken: string): Record<string, string> {
  return { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json; charset=utf-8" };
}

async function fetchRecord(userToken: string, tableId: string, recordId: string) {
  const url =
    `${FEISHU_DOMAIN}/open-apis/bitable/v1/apps/${baseAppToken()}/tables/${tableId}/records/${recordId}` +
    "?automatic_fields=true&user_id_type=open_id";
  return await feishuFetchJson(url, { headers: { Authorization: `Bearer ${userToken}` } });
}

function ownsRecord(record: any, openId: string): boolean {
  const createdBy = record?.data?.record?.created_by ?? record?.record?.created_by;
  if (!createdBy) return false;
  return createdBy.id === openId || createdBy.email === openId;
}

async function actionListRecords(ctx: Ctx, body: any): Promise<Response> {
  const userToken = await ensureFreshAccessToken(ctx);
  if (!userToken || !ctx.session) return unauthorized(ctx);

  const tableId: string | undefined = body?.table_id;
  if (!tableId) return json({ error: "table_id required" }, 400);

  // Paginate over the user's *owned* records. Feishu paginates by raw record, so
  // the cursor tracks (Feishu page_token, owned-offset-within-that-page).
  const pageSize = Math.min(Math.max(body?.page_size ?? 20, 1), 100);
  const cursor = (body?.cursor ?? { t: null, o: 0 }) as { t: string | null; o: number };

  let pageToken: string | null = cursor.t ?? null;
  let skip = cursor.o ?? 0;
  const items: any[] = [];

  while (items.length < pageSize) {
    const params = new URLSearchParams({
      page_size: "500",
      automatic_fields: "true",
      user_id_type: "open_id",
    });
    if (pageToken) params.set("page_token", pageToken);

    const url =
      `${FEISHU_DOMAIN}/open-apis/bitable/v1/apps/${baseAppToken()}/tables/${tableId}/records` +
      `?${params.toString()}`;
    const data = await feishuFetchJson(url, { headers: { Authorization: `Bearer ${userToken}` } });
    if (data.code !== 0) {
      return json({ error: data.msg || "list records failed", code: data.code }, 400);
    }

    const d = data.data ?? {};
    const owned = (d.items ?? []).filter(
      (item: any) => item.created_by?.id === ctx.session!.openId,
    );

    const remaining = pageSize - items.length;
    const batch = owned.slice(skip, skip + remaining);
    items.push(...batch);
    skip += batch.length;

    if (items.length >= pageSize) {
      if (skip < owned.length) {
        return json({ items, cursor: { t: pageToken, o: skip }, has_more: true });
      }
      return json({
        items,
        cursor: d.has_more ? { t: d.page_token, o: 0 } : null,
        has_more: !!d.has_more,
      });
    }

    skip = 0;
    if (!d.has_more) {
      return json({ items, cursor: null, has_more: false });
    }
    pageToken = d.page_token;
  }

  return json({ items, cursor: null, has_more: false });
}

async function actionListAllRecords(ctx: Ctx, body: any): Promise<Response> {
  const userToken = await ensureFreshAccessToken(ctx);
  if (!userToken || !ctx.session) return unauthorized(ctx);

  const tableId: string | undefined = body?.table_id;
  if (!tableId) return json({ error: "table_id required" }, 400);

  const items: any[] = [];
  let pageToken: string | undefined;
  let hasMore = true;
  let pages = 0;
  const MAX_PAGES = 100;

  while (hasMore && pages < MAX_PAGES) {
    pages++;
    const params = new URLSearchParams({
      page_size: "500",
      automatic_fields: "true",
      user_id_type: "open_id",
    });
    if (pageToken) params.set("page_token", pageToken);

    const url =
      `${FEISHU_DOMAIN}/open-apis/bitable/v1/apps/${baseAppToken()}/tables/${tableId}/records` +
      `?${params.toString()}`;
    const data = await feishuFetchJson(url, { headers: { Authorization: `Bearer ${userToken}` } });
    if (data.code !== 0) {
      return json({ error: data.msg || "list records failed", code: data.code }, 400);
    }

    const d = data.data ?? {};
    for (const item of d.items ?? []) {
      if (item.created_by?.id === ctx.session!.openId) items.push(item);
    }
    hasMore = !!d.has_more;
    pageToken = d.page_token;
  }

  return json({ items, total: items.length });
}

// Lists records in a table (no created_by filter) — used to populate link
// field pickers. When `field_name` is provided, only that field is returned
// (keeps the response small for large linked tables).
async function actionLookupRecords(ctx: Ctx, body: any): Promise<Response> {
  const userToken = await ensureFreshAccessToken(ctx);
  if (!userToken || !ctx.session) return unauthorized(ctx);

  const tableId: string | undefined = body?.table_id;
  if (!tableId) return json({ error: "table_id required" }, 400);
  const fieldName: string | undefined = body?.field_name;

  const items: any[] = [];
  let pageToken: string | undefined;
  let hasMore = true;
  let pages = 0;
  const MAX_PAGES = 100;

  while (hasMore && pages < MAX_PAGES) {
    pages++;
    const params = new URLSearchParams({
      page_size: "500",
      user_id_type: "open_id",
    });
    if (fieldName) params.set("field_names", JSON.stringify([fieldName]));
    if (pageToken) params.set("page_token", pageToken);

    const url =
      `${FEISHU_DOMAIN}/open-apis/bitable/v1/apps/${baseAppToken()}/tables/${tableId}/records` +
      `?${params.toString()}`;
    const data = await feishuFetchJson(url, { headers: { Authorization: `Bearer ${userToken}` } });
    if (data.code !== 0) {
      return json({ error: data.msg || "lookup records failed", code: data.code }, 400);
    }

    const d = data.data ?? {};
    items.push(...(d.items ?? []));
    hasMore = !!d.has_more;
    pageToken = d.page_token;
  }

  return json({ items, total: items.length });
}

async function actionCountRecords(ctx: Ctx, body: any): Promise<Response> {
  const userToken = await ensureFreshAccessToken(ctx);
  if (!userToken || !ctx.session) return unauthorized(ctx);

  const tableId: string | undefined = body?.table_id;
  if (!tableId) return json({ error: "table_id required" }, 400);

  const params = new URLSearchParams({ page_size: "1", user_id_type: "open_id" });
  const url =
    `${FEISHU_DOMAIN}/open-apis/bitable/v1/apps/${baseAppToken()}/tables/${tableId}/records` +
    `?${params.toString()}`;
  const data = await feishuFetchJson(url, { headers: { Authorization: `Bearer ${userToken}` } });
  if (data.code !== 0) {
    return json({ error: data.msg || "count records failed", code: data.code }, 400);
  }
  return json({ total: data.data?.total ?? 0 });
}

async function actionCountsRecords(ctx: Ctx, body: any): Promise<Response> {
  const userToken = await ensureFreshAccessToken(ctx);
  if (!userToken || !ctx.session) return unauthorized(ctx);

  const tableIds: string[] | undefined = body?.table_ids;
  if (!Array.isArray(tableIds) || tableIds.length === 0) {
    return json({ error: "table_ids array required" }, 400);
  }

  const counts: Record<string, number> = {};
  const errors: Record<string, string> = {};

  // Fetch sequentially to avoid hammering Feishu with parallel requests.
  for (const tableId of tableIds) {
    try {
      const params = new URLSearchParams({ page_size: "1", user_id_type: "open_id" });
      const url =
        `${FEISHU_DOMAIN}/open-apis/bitable/v1/apps/${baseAppToken()}/tables/${tableId}/records` +
        `?${params.toString()}`;
      const data = await feishuFetchJson(url, { headers: { Authorization: `Bearer ${userToken}` } });
      if (data.code !== 0) {
        errors[tableId] = data.msg || `code ${data.code}`;
      } else {
        counts[tableId] = data.data?.total ?? 0;
      }
    } catch (e) {
      errors[tableId] = e instanceof Error ? e.message : String(e);
    }
  }

  return json({ counts, errors });
}

async function actionCreateRecord(ctx: Ctx, body: any): Promise<Response> {
  const userToken = await ensureFreshAccessToken(ctx);
  if (!userToken) return unauthorized(ctx);

  const tableId: string | undefined = body?.table_id;
  const fields: Record<string, unknown> | undefined = body?.fields;
  if (!tableId || !fields) return json({ error: "table_id and fields required" }, 400);

  const url = `${FEISHU_DOMAIN}/open-apis/bitable/v1/apps/${baseAppToken()}/tables/${tableId}/records`;
  const data = await feishuFetchJson(url, {
    method: "POST",
    headers: feishuAuth(userToken),
    body: JSON.stringify({ fields, user_id_type: "open_id" }),
  });
  if (data.code !== 0) {
    return json({ error: data.msg || "create record failed", code: data.code }, 400);
  }
  return json({ record_id: data.data?.record?.record_id }, 201);
}

async function actionUpdateRecord(ctx: Ctx, body: any): Promise<Response> {
  const userToken = await ensureFreshAccessToken(ctx);
  if (!userToken || !ctx.session) return unauthorized(ctx);

  const tableId: string | undefined = body?.table_id;
  const recordId: string | undefined = body?.record_id;
  const fields: Record<string, unknown> | undefined = body?.fields;
  if (!tableId || !recordId || !fields) {
    return json({ error: "table_id, record_id and fields required" }, 400);
  }

  const existing = await fetchRecord(userToken, tableId, recordId);
  if (!ownsRecord(existing, ctx.session.openId)) {
    return json({ error: "forbidden: not the record owner" }, 403);
  }

  const url =
    `${FEISHU_DOMAIN}/open-apis/bitable/v1/apps/${baseAppToken()}/tables/${tableId}/records/${recordId}`;
  const data = await feishuFetchJson(url, {
    method: "PUT",
    headers: feishuAuth(userToken),
    body: JSON.stringify({ fields, user_id_type: "open_id" }),
  });
  if (data.code !== 0) {
    return json({ error: data.msg || "update record failed", code: data.code }, 400);
  }
  return json({ record_id: recordId });
}

async function actionDeleteRecord(ctx: Ctx, body: any): Promise<Response> {
  const userToken = await ensureFreshAccessToken(ctx);
  if (!userToken || !ctx.session) return unauthorized(ctx);

  const tableId: string | undefined = body?.table_id;
  const recordId: string | undefined = body?.record_id;
  if (!tableId || !recordId) return json({ error: "table_id and record_id required" }, 400);

  const existing = await fetchRecord(userToken, tableId, recordId);
  if (!ownsRecord(existing, ctx.session.openId)) {
    return json({ error: "forbidden: not the record owner" }, 403);
  }

  const url =
    `${FEISHU_DOMAIN}/open-apis/bitable/v1/apps/${baseAppToken()}/tables/${tableId}/records/${recordId}`;
  const data = await feishuFetchJson(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${userToken}` },
  });
  if (data.code !== 0) {
    return json({ error: data.msg || "delete record failed", code: data.code }, 400);
  }
  return json({ record_id: recordId });
}

// ---------------------------------------------------------------------------
// Media actions
// ---------------------------------------------------------------------------

async function actionUploadMedia(ctx: Ctx, req: Request): Promise<Response> {
  const userToken = await ensureFreshAccessToken(ctx);
  if (!userToken) return unauthorized(ctx);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "multipart/form-data required" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "file required" }, 400);

  const data = new Uint8Array(await file.arrayBuffer());
  const uploaded = await uploadMedia(userToken, {
    name: file.name || "file",
    data,
    type: file.type || undefined,
  });

  return json({
    file_token: uploaded.file_token,
    name: file.name,
    size: data.byteLength,
    type: file.type || "application/octet-stream",
  }, 201);
}

async function actionDownloadMedia(ctx: Ctx, url: URL): Promise<Response> {
  const userToken = await ensureFreshAccessToken(ctx);
  if (!userToken) return unauthorized(ctx);

  const fileToken = url.searchParams.get("file_token");
  if (!fileToken) return json({ error: "file_token required" }, 400);

  const tableId = url.searchParams.get("table_id");
  const fieldId = url.searchParams.get("field_id");
  const recordId = url.searchParams.get("record_id");

  let downloadUrl =
    `${FEISHU_DOMAIN}/open-apis/drive/v1/medias/${fileToken}/download`;
  if (tableId && fieldId && recordId) {
    downloadUrl += `?extra=${encodeURIComponent(bitableDownloadExtra(tableId, fieldId, recordId, fileToken))}`;
  }

  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  if (!res.ok) {
    return json({ error: "download failed", status: res.status }, res.status);
  }

  const headers: Record<string, string> = {};
  const contentType = res.headers.get("content-type");
  const disposition = res.headers.get("content-disposition");
  if (contentType) headers["Content-Type"] = contentType;
  if (disposition) headers["Content-Disposition"] = disposition;

  return new Response(res.body, { status: 200, headers });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function route(req: Request, ctx: Ctx): Promise<Response> {
  const url = new URL(req.url);
  let action = url.searchParams.get("action") || "";

  // The OAuth redirect_uri is the bare function URL (so it can be registered in
  // the Feishu app without a query string). Feishu redirects back with only
  // `?code=...&state=...`, so detect the callback from those params.
  if (!action && url.searchParams.has("code") && url.searchParams.has("state")) {
    action = "callback";
  }

  switch (action) {
    case "login":
      return await actionLogin(req, url);
    case "callback":
      return await actionCallback(req, url);
    case "logout":
      return await actionLogout(req);
    case "session":
      return await actionSession(ctx);
    case "debug":
      return await actionDebug(ctx, req);
    case "media.download":
      return await actionDownloadMedia(ctx, url);
  }

  // JSON-body actions
  if (req.method === "POST") {
    let body: any = {};
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      // media.upload handled separately (multipart)
      if (action === "media.upload") return await actionUploadMedia(ctx, req);
    } else {
      try {
        body = await req.json();
      } catch {
        return json({ error: "invalid JSON body" }, 400);
      }
    }

    switch (action) {
      case "records.list":
        return await actionListRecords(ctx, body);
      case "records.listAll":
        return await actionListAllRecords(ctx, body);
      case "records.lookup":
        return await actionLookupRecords(ctx, body);
      case "records.count":
        return await actionCountRecords(ctx, body);
      case "records.counts":
        return await actionCountsRecords(ctx, body);
      case "records.create":
        return await actionCreateRecord(ctx, body);
      case "records.update":
        return await actionUpdateRecord(ctx, body);
      case "records.delete":
        return await actionDeleteRecord(ctx, body);
      case "exchange_code":
        return await actionExchangeCode(req, body);
    }
  }

  return json({ error: "unknown action", action }, 404);
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  const ctx: Ctx = { session: null, refreshError: null, req };

  try {
    // Resolve session up-front for all actions (cheap, self-contained).
    ctx.session = await getSession(req);

    const response = await route(req, ctx);

    // Merge CORS headers into the response.
    const merged = new Headers(response.headers);
    for (const [k, v] of Object.entries(headers)) {
      if (!merged.has(k)) merged.set(k, v);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: merged,
    });
  } catch (err) {
    console.error("crm function error:", err);
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
      headers,
    );
  }
});
