import type {
  CrmRecord,
  CrmSessionUser,
  UploadedMedia,
} from "@/lib/types/crm";

// Session id stored client-side. iOS (Safari/Chrome) blocks the cross-site
// httpOnly cookie, so the SPA keeps the session id in localStorage and sends it
// as the `x-crm-session` header on every request.
const SESSION_KEY = "crm_session";

// The edge function's absolute URL (used for top-level navigations and in prod).
const FULL_EDGE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm`;

// Data fetches: in dev we go through the Vite dev proxy (same-origin) to avoid
// the local Supabase gateway's `Access-Control-Allow-Origin: *` breaking
// credentialed requests. In production the browser calls the function
// cross-origin directly.
const EDGE_BASE = import.meta.env.DEV ? "/functions/v1/crm" : FULL_EDGE;

function storedSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function saveSession(id: string): void {
  try {
    localStorage.setItem(SESSION_KEY, id);
  } catch {
    /* ignore */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

async function request<T>(
  action: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const url = `${EDGE_BASE}?action=${encodeURIComponent(action)}`;
  const sessionId = storedSessionId();
  const res = await fetch(url, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      ...(sessionId ? { "x-crm-session": sessionId } : {}),
      ...(options.body !== undefined && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
    body:
      options.body instanceof FormData
        ? options.body
        : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data.detail || data.error || data.message || message;
    } catch {
      /* ignore */
    }
    const error = new Error(message) as Error & { status: number };
    error.status = res.status;
    throw error;
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function loginUrl(redirectTo: string): string {
  return `${FULL_EDGE}?action=login&redirect_to=${encodeURIComponent(redirectTo)}`;
}

export function logout(): Promise<void> {
  return request<void>("logout");
}

export function getSession(): Promise<CrmSessionUser> {
  return request<CrmSessionUser>("session");
}

export function getRecordCount(
  tableId: string,
  fieldName?: string,
): Promise<{ total: number }> {
  return request<{ total: number }>("records.count", {
    method: "POST",
    body: { table_id: tableId, field_name: fieldName },
  });
}

export function listAllRecords(
  tableId: string,
): Promise<{ items: CrmRecord[]; total: number }> {
  return request<{ items: CrmRecord[]; total: number }>("records.listAll", {
    method: "POST",
    body: { table_id: tableId },
  });
}

export function lookupRecords(
  tableId: string,
  fieldName?: string,
): Promise<{ items: CrmRecord[]; total: number }> {
  return request<{ items: CrmRecord[]; total: number }>("records.lookup", {
    method: "POST",
    body: { table_id: tableId, field_name: fieldName ?? null },
  });
}

export interface CountTarget {
  table_id: string;
  field_name?: string;
}

export function getRecordCounts(
  tables: CountTarget[],
): Promise<{ counts: Record<string, number>; errors: Record<string, string> }> {
  return request<{ counts: Record<string, number>; errors: Record<string, string> }>(
    "records.counts",
    {
      method: "POST",
      body: {
        table_ids: tables.map((t) => t.table_id),
        field_names: Object.fromEntries(
          tables.filter((t) => t.field_name).map((t) => [t.table_id, t.field_name]),
        ),
      },
    },
  );
}

export function createRecord(tableId: string, fields: Record<string, unknown>) {
  return request<{ record_id: string }>("records.create", {
    method: "POST",
    body: { table_id: tableId, fields },
  });
}

export function getRecord(tableId: string, recordId: string) {
  return request<{ record: CrmRecord }>("records.get", {
    method: "POST",
    body: { table_id: tableId, record_id: recordId },
  });
}

export function updateRecord(
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>,
) {
  return request<{ record_id: string }>("records.update", {
    method: "POST",
    body: { table_id: tableId, record_id: recordId, fields },
  });
}

export function deleteRecord(tableId: string, recordId: string) {
  return request<{ record_id: string }>("records.delete", {
    method: "POST",
    body: { table_id: tableId, record_id: recordId },
  });
}

export async function uploadMedia(file: File): Promise<UploadedMedia> {
  const form = new FormData();
  form.append("file", file);
  return request<UploadedMedia>("media.upload", {
    method: "POST",
    body: form,
  });
}

export function downloadUrl(
  fileToken: string,
  tableId?: string,
  fieldId?: string,
  recordId?: string,
): string {
  const params = new URLSearchParams({ action: "media.download", file_token: fileToken });
  if (tableId) params.set("table_id", tableId);
  if (fieldId) params.set("field_id", fieldId);
  if (recordId) params.set("record_id", recordId);
  return `${FULL_EDGE}?${params.toString()}`;
}
