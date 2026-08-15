import { useOwnedRecords, useRefreshRecord } from "@/lib/api/crm-queries";
import { FIELD_TYPE, type CrmRecord, type FieldDefinition, type TableDefinition } from "@/lib/types/crm";
import { cn } from "@/lib/utils";
import { Button, Skeleton } from "@heroui/react";
import { ChevronLeft, ChevronRight, Edit, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useCrmTranslation } from "./CrmI18nProvider";
import { FieldRenderer, formatFieldValue } from "./FieldRenderer";

const PAGE_SIZE = 20;

interface CrmSplitViewProps {
  table: TableDefinition;
  columns: FieldDefinition[];
  sortField?: string;
  sortDirection?: "asc" | "desc";
  onEdit: (record: CrmRecord) => void;
  onDelete: (record: CrmRecord) => void;
  onCreate: () => void;
  deletingRecordId?: string | null;
  refreshingTable?: boolean;
}

function pageNumbers(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const wanted = new Set([0, total - 1, current - 1, current, current + 1]);
  const sorted = [...wanted].filter((p) => p >= 0 && p < total).sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  let prev = -1;
  for (const p of sorted) {
    if (p - prev > 1) result.push("gap");
    result.push(p);
    prev = p;
  }
  return result;
}

function sortValue(field: FieldDefinition, value: unknown): number | string | null {
  if (value === null || value === undefined || value === "") return null;
  switch (field.type) {
    case FIELD_TYPE.DateTime:
    case FIELD_TYPE.CreatedTime:
    case FIELD_TYPE.ModifiedTime: {
      const ms = typeof value === "number" ? value : Number(value);
      return Number.isFinite(ms) ? ms : null;
    }
    case FIELD_TYPE.Number: {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case FIELD_TYPE.Checkbox:
      return value ? 1 : 0;
    default:
      return formatFieldValue(field, value) || null;
  }
}

// The left panel lists records, so label it as a list rather than reusing the
// page title (e.g. "合同管理" → "合同列表"). The "list" word is localized.
function listPanelTitle(name: string, listWord: string): string {
  const base = name.replace(/管理$/, "");
  return `${base}${listWord}`;
}

export function CrmSplitView({
  table,
  columns,
  sortField,
  sortDirection,
  onEdit,
  onDelete,
  onCreate,
  deletingRecordId,
  refreshingTable = false,
}: CrmSplitViewProps) {
  const { t } = useCrmTranslation();
  const { data, isLoading: loading, isError, error } = useOwnedRecords(table.table_id);
  const { mutation: refreshMutation, refreshingIds } = useRefreshRecord(table.table_id);
  const items = data?.items ?? [];
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const primaryColumn =
    columns.find((c) => c.is_primary) ?? columns[0] ?? table.fields.find((f) => f.is_primary);
  const secondaryColumns = columns.filter((c) => c !== primaryColumn).slice(0, 2);

  const sortedItems = useMemo(() => {
    if (!sortField) return items;
    const field = table.fields.find((f) => f.field_name === sortField);
    if (!field) return items;
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      const av = sortValue(field, a.fields?.[sortField]);
      const bv = sortValue(field, b.fields?.[sortField]);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [items, sortField, sortDirection, table.fields]);

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE));
  const currentItems = useMemo(
    () => sortedItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [sortedItems, page],
  );
  const selected =
    currentItems.find((r) => r.record_id === selectedId) ?? currentItems[0] ?? null;

  // The set of records being refreshed is tracked independently of the
  // selection, so list-item skeletons stay put while switching records or
  // refreshing multiple records concurrently.
  const isRefreshingSelected = !!selected && refreshingIds.has(selected.record_id);
  // The detail panel skeletons for either a single-record refresh or a
  // whole-table refresh.
  const showDetailSkeleton = isRefreshingSelected || refreshingTable;

  const goto = (p: number) => {
    const clamped = Math.min(Math.max(p, 0), totalPages - 1);
    setPage(clamped);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-14rem)] min-h-[480px]">
      {/* Left: paginated list */}
      <div className="lg:w-80 flex-shrink-0 bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-gray-100 dark:border-zinc-800 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 dark:text-white truncate">
              {listPanelTitle(table.name, t("crm.view.split"))}
            </h2>
            <p className="text-xs text-gray-400">
              {sortedItems.length} {t("crm.records")}
            </p>
          </div>
          <Button isIconOnly size="sm" color="primary" variant="flat" radius="full" onPress={onCreate}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isError && (
            <p className="p-3 text-sm text-red-500">
              {error instanceof Error ? error.message : String(error)}
            </p>
          )}
          {loading || refreshingTable ? (
            <div className="p-3 space-y-3 animate-in fade-in duration-300">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="rounded-xl">
                  <div className="h-12 w-full rounded-xl bg-gray-200 dark:bg-zinc-700" />
                </Skeleton>
              ))}
            </div>
          ) : currentItems.length === 0 ? (
            <p className="p-6 text-sm text-gray-400 text-center">{t("crm.empty")}</p>
          ) : (
            <ul className="p-2 space-y-1 animate-in fade-in duration-300">
              {currentItems.map((record) => {
                const active = selected?.record_id === record.record_id;
                const refreshingItem = refreshingIds.has(record.record_id);
                return (
                  <li key={record.record_id}>
                    <button
                      onClick={() => setSelectedId(record.record_id)}
                      className={cn(
                        "w-full text-left rounded-xl px-3 py-2.5 transition-colors",
                        active
                          ? "bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-200 dark:ring-blue-800/50"
                          : "hover:bg-gray-50 dark:hover:bg-zinc-800/50",
                      )}
                    >
                      {refreshingItem ? (
                        <div className="space-y-2 py-0.5 animate-in fade-in duration-200">
                          <Skeleton className="rounded-lg">
                            <div className="h-4 w-3/4 rounded-lg bg-gray-200 dark:bg-zinc-700" />
                          </Skeleton>
                          <Skeleton className="rounded-lg">
                            <div className="h-3 w-1/2 rounded-lg bg-gray-200 dark:bg-zinc-700" />
                          </Skeleton>
                        </div>
                      ) : (
                        <div className="animate-in fade-in duration-200">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {primaryColumn
                              ? formatFieldValue(primaryColumn, record.fields?.[primaryColumn.field_name]) ||
                                record.record_id
                              : record.record_id}
                          </p>
                          {secondaryColumns.length > 0 && (
                            <p className="text-xs text-gray-400 truncate mt-0.5">
                              {secondaryColumns
                                .map((c) => formatFieldValue(c, record.fields?.[c.field_name]))
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-center gap-1 p-3 border-t border-gray-100 dark:border-zinc-800 flex-wrap">
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={() => goto(page - 1)}
            isDisabled={page === 0}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          {pageNumbers(page, totalPages).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-xs text-gray-400">
                …
              </span>
            ) : (
              <Button
                key={p}
                size="sm"
                isIconOnly
                radius="full"
                variant={p === page ? "solid" : "light"}
                color={p === page ? "primary" : "default"}
                className="min-w-0 w-8 h-8"
                onPress={() => goto(p)}
              >
                {p + 1}
              </Button>
            ),
          )}
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={() => goto(page + 1)}
            isDisabled={page >= totalPages - 1}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Right: details */}
      <div className="flex-1 bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-y-auto">
        {selected ? (
          <div className="p-6 h-full flex flex-col">
            <div className="flex items-start justify-between gap-4">
              <div>
                {showDetailSkeleton ? (
                  <div className="space-y-2 animate-in fade-in duration-200">
                    <Skeleton className="rounded-lg">
                      <div className="h-6 w-48 rounded-lg bg-gray-200 dark:bg-zinc-700" />
                    </Skeleton>
                    <Skeleton className="rounded-lg">
                      <div className="h-3 w-24 rounded-lg bg-gray-200 dark:bg-zinc-700" />
                    </Skeleton>
                  </div>
                ) : (
                  <>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white animate-in fade-in duration-200">
                      {primaryColumn
                        ? formatFieldValue(primaryColumn, selected.fields?.[primaryColumn.field_name]) ||
                          selected.record_id
                        : selected.record_id}
                    </h3>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  title={t("crm.refresh")}
                  isLoading={refreshingIds.has(selected.record_id)}
                  onPress={() => refreshMutation.mutate(selected.record_id)}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  isDisabled={selected.record_id === deletingRecordId}
                  onPress={() => onEdit(selected)}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  color="danger"
                  isLoading={selected.record_id === deletingRecordId}
                  onPress={() => onDelete(selected)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {showDetailSkeleton ? (
              <div className="mt-5 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-8 auto-rows-fr animate-in fade-in duration-300">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="flex flex-col justify-center gap-3">
                    <Skeleton className="rounded-lg">
                      <div className="h-4 w-1/3 rounded-lg bg-gray-200 dark:bg-zinc-700" />
                    </Skeleton>
                    <Skeleton className="rounded-lg">
                      <div className="h-5 w-2/3 rounded-lg bg-gray-200 dark:bg-zinc-700" />
                    </Skeleton>
                  </div>
                ))}
              </div>
            ) : (
              <dl className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 animate-in fade-in duration-300">
                {table.fields.map((field) => (
                  <div key={field.field_id} className="flex flex-col gap-1">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      {field.field_name}
                    </dt>
                    <dd className="text-sm text-gray-800 dark:text-gray-200">
                      <FieldRenderer
                        field={field}
                        value={selected.fields?.[field.field_name]}
                        tableId={table.table_id}
                        recordId={selected.record_id}
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center p-6 text-sm text-gray-400">
            {t("crm.no_selection")}
          </div>
        )}
      </div>
    </div>
  );
}
