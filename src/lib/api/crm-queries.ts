import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import type { CrmRecord } from "@/lib/types/crm";
import {
  createRecord,
  deleteRecord,
  getRecord,
  getRecordCounts,
  listAllRecords,
  lookupRecords,
  updateRecord,
  type CountTarget,
} from "./crm-api";

// TanStack Query layer over the `crm` edge function. Each table's owned records
// and each table's full record list (for link pickers) are cached once per
// session. Mutations patch the cached owned-records list in place (no full-table
// refetch) and invalidate the cheaper count/lookup queries.

interface OwnedRecordsData {
  items: CrmRecord[];
  total: number;
}

/** Patch the cached owned-records list for `tableId` without refetching. */
function patchOwnedCache(
  qc: QueryClient,
  tableId: string,
  patch: (items: CrmRecord[]) => CrmRecord[],
) {
  qc.setQueryData<OwnedRecordsData>(["records", tableId, "owned"], (old) => {
    if (!old) return old;
    const items = patch(old.items);
    return { ...old, items, total: items.length };
  });
}

// --- Queries ---------------------------------------------------------------

/** All records the current user owns in `tableId` (table + split views). */
export function useOwnedRecords(tableId: string) {
  return useQuery({
    queryKey: ["records", tableId, "owned"],
    queryFn: () => listAllRecords(tableId),
  });
}

/** All records in `tableId` (no ownership filter) — used by link-field pickers. */
export function useLookupRecords(tableId: string | undefined, fieldName?: string) {
  return useQuery({
    queryKey: ["records", tableId, "lookup", fieldName ?? null],
    queryFn: () => lookupRecords(tableId!, fieldName),
    enabled: !!tableId,
  });
}

/** Record counts for the dashboard. */
export function useTableCounts(tables: CountTarget[]) {
  return useQuery({
    queryKey: ["records", "counts", tables.map((t) => t.table_id).join(",")],
    queryFn: () => getRecordCounts(tables),
  });
}

// --- Mutations -------------------------------------------------------------

export function useCreateRecord(tableId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fields: Record<string, unknown>) => createRecord(tableId, fields),
    onSuccess: (data, fields) => {
      // Show the record immediately from the submitted fields; computed fields
      // fill in via `useFillRecordFields` after the form closes.
      patchOwnedCache(qc, tableId, (items) => [{ record_id: data.record_id, fields }, ...items]);
      qc.invalidateQueries({ queryKey: ["records", tableId, "lookup"] });
      qc.invalidateQueries({ queryKey: ["records", "counts"] });
    },
  });
}

/** Poll a single record with backoff until the given computed (formula/lookup)
 *  field names are populated, then merge the final snapshot. Returns a promise
 *  that resolves once polling finishes, so callers can show a loading indicator
 *  around it. If `computedFieldNames` is empty, a single fetch suffices. */
export function useFillRecordFields(tableId: string, computedFieldNames: string[] = []) {
  const qc = useQueryClient();
  return async (recordId: string): Promise<void> => {
    const delays = [800, 1600, 2400];
    for (let i = 0; i <= delays.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, delays[i - 1]));
      try {
        const { record } = await getRecord(tableId, recordId);
        patchOwnedCache(qc, tableId, (items) =>
          items.map((r) => (r.record_id === recordId ? record : r)),
        );
        if (areComputedFieldsReady(record, computedFieldNames)) return;
      } catch {
        // A transient fetch failure is fine; keep polling for the next delay.
      }
    }
  };
}

function areComputedFieldsReady(record: CrmRecord, names: string[]): boolean {
  if (names.length === 0) return true;
  return names.every((name) => {
    const value = record.fields?.[name];
    if (value === null || value === undefined || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  });
}

export function useUpdateRecord(tableId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recordId, fields }: { recordId: string; fields: Record<string, unknown> }) =>
      updateRecord(tableId, recordId, fields),
    onSuccess: (_data, { recordId, fields }) => {
      patchOwnedCache(qc, tableId, (items) =>
        items.map((r) =>
          r.record_id === recordId ? { ...r, fields: { ...r.fields, ...fields } } : r,
        ),
      );
      qc.invalidateQueries({ queryKey: ["records", tableId, "lookup"] });
    },
  });
}

export function useDeleteRecord(tableId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recordId: string) => deleteRecord(tableId, recordId),
    onSuccess: (_data, recordId) => {
      // Remove only after the deletion succeeds (no optimistic update/rollback).
      patchOwnedCache(qc, tableId, (items) => items.filter((r) => r.record_id !== recordId));
      qc.invalidateQueries({ queryKey: ["records", tableId, "lookup"] });
      qc.invalidateQueries({ queryKey: ["records", "counts"] });
    },
  });
}

/** Refetch a single record and merge it into the owned cache. Tracks the set of
 *  record ids currently being refreshed so multiple concurrent refreshes keep
 *  their own loading state. */
export function useRefreshRecord(tableId: string) {
  const qc = useQueryClient();
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());

  const mutation = useMutation({
    mutationFn: (recordId: string) => getRecord(tableId, recordId),
    onMutate: (recordId) => {
      setRefreshingIds((prev) => new Set(prev).add(recordId));
    },
    onSettled: (_data, _error, recordId) => {
      setRefreshingIds((prev) => {
        const next = new Set(prev);
        next.delete(recordId);
        return next;
      });
    },
    onSuccess: ({ record }, recordId) => {
      patchOwnedCache(qc, tableId, (items) =>
        items.map((r) => (r.record_id === recordId ? record : r)),
      );
    },
  });

  return { mutation, refreshingIds };
}
