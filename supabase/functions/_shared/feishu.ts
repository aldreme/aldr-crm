// Shared Feishu (Lark) helpers for edge functions.
//
// - tenant_access_token (cached) obtained from AppID/Secret
// - HS256 JWT sign/verify using Web Crypto (no external deps)
// - AES-256-GCM encrypt/decrypt (used to store user tokens inside the session JWT)
// - multipart media upload helpers (upload_all and chunked upload)

const FEISHU_DOMAIN = "https://open.feishu.cn";

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}

// ---------------------------------------------------------------------------
// Retrying Feishu API fetch
// ---------------------------------------------------------------------------

// Feishu business-level codes that indicate a transient condition worth retrying.
const RETRYABLE_FEISHU_CODES = new Set([
  1254290, // TooManyRequest (rate limit)
  1254291, // write conflict
  1254607, // data not ready yet
  1255040, // request timed out
  1061045, // media: can retry
  1255001, // InternalError
  1255002, // RpcError
  1255003, // MarshalError
  1255004, // UnmarshalError
  1255005, // ConvError
]);

function isRetryableFeishuCode(code: unknown): boolean {
  return typeof code === "number" && RETRYABLE_FEISHU_CODES.has(code);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Full-jitter exponential backoff: random(0, base * 2^attempt). */
function jitteredBackoffDelay(attempt: number, baseDelayMs: number): number {
  return Math.random() * baseDelayMs * Math.pow(2, attempt);
}

export interface FeishuFetchOptions extends RequestInit {
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * Fetch a Feishu API and parse JSON, retrying on network errors, HTTP 429/5xx,
 * and Feishu transient business codes using jittered exponential backoff.
 */
export async function feishuFetchJson(
  url: string,
  init?: RequestInit,
  options: { maxRetries?: number; baseDelayMs?: number } = {},
): Promise<any> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 400;

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      await sleep(jitteredBackoffDelay(attempt, baseDelayMs));
      continue;
    }

    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      await sleep(jitteredBackoffDelay(attempt, baseDelayMs));
      continue;
    }

    let body: any;
    try {
      body = await res.json();
    } catch {
      body = { code: -1, msg: `non-JSON response (status ${res.status})` };
    }

    if (isRetryableFeishuCode(body?.code) && attempt < maxRetries) {
      await sleep(jitteredBackoffDelay(attempt, baseDelayMs));
      continue;
    }

    return body;
  }
}

// ---------------------------------------------------------------------------
// tenant_access_token
// ---------------------------------------------------------------------------

let cachedTenant: { token: string; expiresAt: number } | null = null;

export async function getTenantAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedTenant && cachedTenant.expiresAt > now + 5 * 60 * 1000) {
    return cachedTenant.token;
  }

  const appId = env("FEISHU_APP_ID");
  const appSecret = env("FEISHU_APP_SECRET");

  const data = await feishuFetchJson(
    `${FEISHU_DOMAIN}/open-apis/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    },
  );
  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`failed to get tenant_access_token: ${JSON.stringify(data)}`);
  }

  cachedTenant = {
    token: data.tenant_access_token,
    expiresAt: now + (data.expire ?? 7200) * 1000,
  };
  return cachedTenant.token;
}

// ---------------------------------------------------------------------------
// OAuth (web-app SSO)
// ---------------------------------------------------------------------------

// Scopes requested from the user during SSO.
// - `bitable:app`: list/create/update/delete Base records (and media) under the user identity.
// - `contact:user.base:readonly`: user names/emails/avatars in user fields and `created_by`.
// - `offline_access`: required for Feishu to return a `refresh_token`, so the
//   session can outlive the 2h user_access_token (without it the refresh fails).
const CRM_OAUTH_SCOPES = "bitable:app contact:user.base:readonly offline_access";

export function feishuAuthorizeUrl(redirectUri: string, state: string): string {
  const appId = env("FEISHU_APP_ID");
  const qs =
    `app_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&scope=${encodeURIComponent(CRM_OAUTH_SCOPES)}`;
  return `${FEISHU_DOMAIN}/open-apis/authen/v1/authorize?${qs}`;
}

export interface OAuthTokenResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_token_expires_in?: number;
}

async function oauthTokenRequest(body: Record<string, string>): Promise<OAuthTokenResult> {
  const data = await feishuFetchJson(
    `${FEISHU_DOMAIN}/open-apis/authen/v2/oauth/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    },
  );
  if (data.code !== 0 || !data.access_token) {
    throw new Error(`feishu oauth token error: ${JSON.stringify(data)}`);
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in ?? 7200,
    refresh_token_expires_in: data.refresh_token_expires_in,
  };
}

export async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string,
): Promise<OAuthTokenResult> {
  return oauthTokenRequest({
    grant_type: "authorization_code",
    client_id: env("FEISHU_APP_ID"),
    client_secret: env("FEISHU_APP_SECRET"),
    code,
    redirect_uri: redirectUri,
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
  return oauthTokenRequest({
    grant_type: "refresh_token",
    client_id: env("FEISHU_APP_ID"),
    client_secret: env("FEISHU_APP_SECRET"),
    refresh_token: refreshToken,
  });
}

export interface FeishuUser {
  open_id: string;
  union_id?: string;
  user_id?: string;
  name?: string;
  en_name?: string;
  email?: string;
  avatar_url?: string;
}

export async function getUserInfo(userAccessToken: string): Promise<FeishuUser> {
  const data = await feishuFetchJson(
    `${FEISHU_DOMAIN}/open-apis/authen/v1/user_info`,
    { headers: { Authorization: `Bearer ${userAccessToken}` } },
  );
  if (data.code !== 0) {
    throw new Error(`feishu user_info error: ${JSON.stringify(data)}`);
  }
  const info = data.data ?? data;
  return {
    open_id: info.open_id,
    union_id: info.union_id,
    user_id: info.user_id,
    name: info.name,
    en_name: info.en_name,
    email: info.email,
    avatar_url: info.avatar_url,
  };
}

// ---------------------------------------------------------------------------
// base64url + JWT (HS256) + AES-GCM
// ---------------------------------------------------------------------------

function b64url(bytes: Uint8Array | ArrayBuffer): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  let str = s.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function signJwt(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSec: number,
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const full = { ...payload, iat: now, exp: now + expiresInSec };
  const encode = (o: object) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const signingInput = `${encode(header)}.${encode(full)}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(sig)}`;
}

export async function verifyJwt(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const key = await hmacKey(secret);
  const expected = b64url(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${h}.${p}`)),
  );
  if (expected !== s) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
    if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function encrypt(plaintext: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(secret);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${b64url(iv)}.${b64url(ct)}`;
}

export async function decrypt(payload: string, secret: string): Promise<string | null> {
  const [ivStr, ctStr] = payload.split(".");
  if (!ivStr || !ctStr) return null;
  try {
    const key = await aesKey(secret);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64urlDecode(ivStr) },
      key,
      b64urlDecode(ctStr),
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Bitable helpers
// ---------------------------------------------------------------------------

export function baseAppToken(): string {
  return env("FEISHU_BASE_APP_TOKEN");
}

// ---------------------------------------------------------------------------
// Media upload helpers
// ---------------------------------------------------------------------------

const MEDIA_MAX_SINGLE_UPLOAD = 20 * 1024 * 1024; // 20 MiB
const MEDIA_CHUNK_SIZE = 4 * 1024 * 1024; // 4 MiB

function bitableExtra(): string {
  return JSON.stringify({ drive_route_token: baseAppToken() });
}

export interface UploadedMedia {
  file_token: string;
}

export interface MediaFile {
  name: string;
  data: Uint8Array<ArrayBuffer>;
  type?: string;
}

/** Upload a file (already read into memory) to the Base, choosing whole or chunked upload. */
export async function uploadMedia(
  userAccessToken: string,
  file: MediaFile,
): Promise<UploadedMedia> {
  const parentType = (file.type ?? "").startsWith("image/") ? "bitable_image" : "bitable_file";

  if (file.data.byteLength <= MEDIA_MAX_SINGLE_UPLOAD) {
    return uploadMediaWhole(userAccessToken, file, parentType);
  }
  return uploadMediaChunked(userAccessToken, file, parentType);
}

async function uploadMediaWhole(
  token: string,
  file: MediaFile,
  parentType: string,
): Promise<UploadedMedia> {
  const form = new FormData();
  form.append("file_name", file.name);
  form.append("parent_type", parentType);
  form.append("parent_node", baseAppToken());
  form.append("size", String(file.data.byteLength));
  form.append("extra", bitableExtra());
  form.append(
    "file",
    new Blob([file.data], { type: file.type ?? "application/octet-stream" }),
    file.name,
  );

  const data = await feishuFetchJson(
    `${FEISHU_DOMAIN}/open-apis/drive/v1/medias/upload_all`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
  );
  if (data.code !== 0 || !data.data?.file_token) {
    throw new Error(`media upload_all failed: ${JSON.stringify(data)}`);
  }
  return { file_token: data.data.file_token };
}

async function uploadMediaChunked(
  token: string,
  file: MediaFile,
  parentType: string,
): Promise<UploadedMedia> {
  // 1) prepare
  const prepareForm = new FormData();
  prepareForm.append("file_name", file.name);
  prepareForm.append("parent_type", parentType);
  prepareForm.append("parent_node", baseAppToken());
  prepareForm.append("size", String(file.data.byteLength));
  prepareForm.append("extra", bitableExtra());

  const prepareData = await feishuFetchJson(
    `${FEISHU_DOMAIN}/open-apis/drive/v1/medias/upload_prepare`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: prepareForm,
    },
  );
  if (prepareData.code !== 0 || !prepareData.data?.upload_id) {
    throw new Error(`media upload_prepare failed: ${JSON.stringify(prepareData)}`);
  }
  const uploadId: string = prepareData.data.upload_id;
  const blockSize: number = prepareData.data.block_size ?? MEDIA_CHUNK_SIZE;
  const blockNum: number = prepareData.data.block_num;

  // 2) upload each part sequentially (no concurrent calls allowed)
  for (let seq = 0; seq < blockNum; seq++) {
    const start = seq * blockSize;
    const end = Math.min(start + blockSize, file.data.byteLength);
    const chunk = file.data.slice(start, end);

    const partForm = new FormData();
    partForm.append("upload_id", uploadId);
    partForm.append("seq", String(seq));
    partForm.append("size", String(chunk.byteLength));
    partForm.append(
      "file",
      new Blob([chunk], { type: file.type ?? "application/octet-stream" }),
      file.name,
    );

    const partData = await feishuFetchJson(
      `${FEISHU_DOMAIN}/open-apis/drive/v1/medias/upload_part`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: partForm,
      },
    );
    if (partData.code !== 0) {
      throw new Error(`media upload_part ${seq} failed: ${JSON.stringify(partData)}`);
    }
  }

  // 3) finish
  const finishForm = new FormData();
  finishForm.append("upload_id", uploadId);
  finishForm.append("block_num", String(blockNum));

  const finishData = await feishuFetchJson(
    `${FEISHU_DOMAIN}/open-apis/drive/v1/medias/upload_finish`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: finishForm,
    },
  );
  if (finishData.code !== 0 || !finishData.data?.file_token) {
    throw new Error(`media upload_finish failed: ${JSON.stringify(finishData)}`);
  }
  return { file_token: finishData.data.file_token };
}

/** Construct the bitablePerm `extra` used when downloading media from a Base with advanced permissions. */
export function bitableDownloadExtra(
  tableId: string,
  fieldId: string,
  recordId: string,
  fileToken: string,
): string {
  return JSON.stringify({
    bitablePerm: {
      tableId,
      attachments: { [fieldId]: { [recordId]: [fileToken] } },
    },
  });
}
