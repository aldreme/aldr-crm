import type {
  CrmRecord,
  CrmSessionUser,
  ListCursor,
  ListRecordsResult,
  UploadedMedia,
} from "@/lib/types/crm";

// The edge function's absolute URL (used for top-level navigations and in prod).
const FULL_EDGE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm`;

// Data fetches: in dev we go through the Vite dev proxy (same-origin) to avoid
// the local Supabase gateway's `Access-Control-Allow-Origin: *` breaking
// credentialed requests. In production the browser calls the function
// cross-origin directly.
const EDGE_BASE = import.meta.env.DEV ? "/functions/v1/crm" : FULL_EDGE;

async function request<T>(
  action: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const url = `${EDGE_BASE}?action=${encodeURIComponent(action)}`;
  const res = await fetch(url, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
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

export function logoutUrl(): string {
  return `${FULL_EDGE}?action=logout`;
}

export function getSession(): Promise<CrmSessionUser> {
  return request<CrmSessionUser>("session");
}

export function listRecords(
  tableId: string,
  cursor?: ListCursor | null,
  pageSize = 20,
): Promise<ListRecordsResult> {
  return request<ListRecordsResult>("records.list", {
    method: "POST",
    body: { table_id: tableId, cursor: cursor ?? null, page_size: pageSize },
  });
}

export function getRecordCount(tableId: string): Promise<{ total: number }> {
  return request<{ total: number }>("records.count", {
    method: "POST",
    body: { table_id: tableId },
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

export function getRecordCounts(
  tableIds: string[],
): Promise<{ counts: Record<string, number>; errors: Record<string, string> }> {
  return request<{ counts: Record<string, number>; errors: Record<string, string> }>(
    "records.counts",
    { method: "POST", body: { table_ids: tableIds } },
  );
}

export function createRecord(tableId: string, fields: Record<string, unknown>) {
  return request<{ record_id: string }>("records.create", {
    method: "POST",
    body: { table_id: tableId, fields },
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
