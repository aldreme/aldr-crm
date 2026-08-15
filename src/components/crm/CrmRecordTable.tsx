import { createRecord, deleteRecord, listRecords, updateRecord } from "@/lib/api/crm-api";
import type { CrmRecord, FieldDefinition, ListCursor, TableDefinition } from "@/lib/types/crm";
import { cn } from "@/lib/utils";
import {
  Button,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from "@heroui/react";
import { Edit, List, Plus, RefreshCw, Table2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCrmTranslation } from "./CrmI18nProvider";
import { useCrmDialog } from "@/store/crm-ui";
import { FieldRenderer, formatFieldValue } from "./FieldRenderer";
import { CrmSplitView } from "./CrmSplitView";
import { RecordForm } from "./RecordForm";

interface CrmRecordTableProps {
  table: TableDefinition;
  /** Fields to display as columns (ordered). Defaults to all non-primary + primary first. */
  columns?: FieldDefinition[];
  /** Optional sort applied to the list (split) view only. */
  sortField?: string;
  sortDirection?: "asc" | "desc";
}

export function CrmRecordTable({ table, columns, sortField, sortDirection }: CrmRecordTableProps) {
  const { t } = useCrmTranslation();
  const dialog = useCrmDialog();
  const [records, setRecords] = useState<CrmRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<ListCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CrmRecord | null>(null);
  const [view, setView] = useState<"table" | "split">("split");
  const [dataVersion, setDataVersion] = useState(0);

  const displayColumns = useMemo(() => {
    if (columns) return columns;
    const primary = table.fields.find((f) => f.is_primary);
    const rest = table.fields.filter((f) => !f.is_primary);
    return primary ? [primary, ...rest] : rest;
  }, [table.fields, columns]);

  const handleError = (err: unknown) => {
    const status = (err as { status?: number })?.status;
    if (status === 401) {
      window.location.href = "/login";
      return;
    }
    setError(err instanceof Error ? err.message : String(err));
  };

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listRecords(table.table_id);
      setRecords(data.items);
      setCursor(data.cursor);
      setHasMore(data.has_more);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }, [table.table_id]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const data = await listRecords(table.table_id, cursor);
      setRecords((prev) => [...prev, ...data.items]);
      setCursor(data.cursor);
      setHasMore(data.has_more);
    } catch (err) {
      handleError(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter((r) => {
      return displayColumns.some((c) =>
        formatFieldValue(c, r.fields?.[c.field_name]).toLowerCase().includes(q),
      );
    });
  }, [records, search, displayColumns]);

  const handleSubmit = async (fields: Record<string, unknown>) => {
    if (editing) {
      await updateRecord(table.table_id, editing.record_id, fields);
    } else {
      await createRecord(table.table_id, fields);
    }
    setDataVersion((v) => v + 1);
    await fetchRecords();
  };

  const handleDelete = async (record: CrmRecord) => {
    const ok = await dialog.confirm({
      title: t("crm.delete"),
      description: t("crm.delete_confirm"),
      confirmLabel: t("crm.delete"),
    });
    if (!ok) return;
    try {
      await deleteRecord(table.table_id, record.record_id);
      setDataVersion((v) => v + 1);
      await fetchRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRefresh = () => {
    setDataVersion((v) => v + 1);
    fetchRecords();
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            {table.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full border border-gray-200 dark:border-zinc-700 p-1">
            <button
              onClick={() => setView("table")}
              title={t("crm.view.table")}
              className={cn(
                "p-2 rounded-full transition-colors",
                view === "table"
                  ? "bg-blue-600 text-white"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300",
              )}
            >
              <Table2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView("split")}
              title={t("crm.view.split")}
              className={cn(
                "p-2 rounded-full transition-colors",
                view === "split"
                  ? "bg-blue-600 text-white"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300",
              )}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          {view === "table" && (
            <Input
              value={search}
              onValueChange={setSearch}
              placeholder={t("crm.search")}
              variant="bordered"
              radius="full"
              className="w-48"
            />
          )}
          <Button
            isIconOnly
            variant="bordered"
            radius="full"
            title={t("crm.refresh")}
            onPress={handleRefresh}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            color="primary"
            radius="full"
            className="shadow-lg shadow-blue-500/20 font-semibold"
            startContent={<Plus className="w-4 h-4" />}
            onPress={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            {t("crm.add_record")}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {view === "split" ? (
        <CrmSplitView
          key={dataVersion}
          table={table}
          columns={displayColumns}
          sortField={sortField}
          sortDirection={sortDirection}
          onEdit={(record) => {
            setEditing(record);
            setFormOpen(true);
          }}
          onDelete={handleDelete}
          onCreate={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
      ) : (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
        {loading ? (
          <div className="w-full">
            <div className="flex items-center gap-6 px-4 py-4 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-800/50">
              {Array.from({ length: Math.min(displayColumns.length, 6) }).map((_, j) => (
                <Skeleton key={j} className="rounded-lg" style={{ flex: j === 0 ? 2 : 1 }}>
                  <div className="h-3 w-full rounded-lg bg-gray-200 dark:bg-zinc-700" />
                </Skeleton>
              ))}
            </div>
            <div className="flex w-full flex-col gap-5 px-4 py-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex w-full items-center gap-4">
                  <Skeleton className="rounded-lg" style={{ width: `${22 + ((i * 11) % 16)}%` }}>
                    <div className="h-4 w-full rounded-lg bg-gray-200 dark:bg-zinc-700" />
                  </Skeleton>
                  <Skeleton className="rounded-lg flex-1">
                    <div className="h-4 w-full rounded-lg bg-gray-200 dark:bg-zinc-700" />
                  </Skeleton>
                  <Skeleton className="rounded-lg flex-1">
                    <div className="h-4 w-full rounded-lg bg-gray-200 dark:bg-zinc-700" />
                  </Skeleton>
                  <Skeleton className="rounded-lg w-16">
                    <div className="h-4 w-full rounded-lg bg-gray-200 dark:bg-zinc-700" />
                  </Skeleton>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Table
            aria-label={`${table.name} records`}
            removeWrapper
            classNames={{
              base: "p-4",
              table: "min-h-[300px]",
              thead: "[&>tr]:first:rounded-xl",
              th: "bg-gray-50/50 dark:bg-zinc-800/50 text-gray-600 dark:text-gray-300 font-semibold uppercase text-[13px] tracking-wide py-4",
              td: "py-3 border-b border-gray-50 dark:border-zinc-800/50",
            }}
          >
            <TableHeader
              columns={[
                ...displayColumns.map((c) => ({ key: c.field_id, label: c.field_name })),
                { key: "__actions__", label: t("crm.actions") },
              ]}
            >
              {(column) => (
                <TableColumn key={column.key} align={column.key === "__actions__" ? "center" : "start"}>
                  {column.label}
                </TableColumn>
              )}
            </TableHeader>
            <TableBody items={filtered} emptyContent={t("crm.empty")}>
              {(record) => (
                <TableRow key={record.record_id} className="hover:bg-gray-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                  {(columnKey) => {
                    if (columnKey === "__actions__") {
                      return (
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Tooltip content={t("crm.edit")}>
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                onPress={() => {
                                  setEditing(record);
                                  setFormOpen(true);
                                }}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            </Tooltip>
                            <Tooltip content={t("crm.delete")} color="danger">
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                color="danger"
                                onPress={() => handleDelete(record)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </Tooltip>
                          </div>
                        </TableCell>
                      );
                    }
                    const field = displayColumns.find((c) => c.field_id === columnKey);
                    return (
                      <TableCell>
                        {field && (
                          <div className={field.is_primary ? "font-semibold" : ""}>
                            <FieldRenderer
                              field={field}
                              value={record.fields?.[field.field_name]}
                              tableId={table.table_id}
                              recordId={record.record_id}
                            />
                          </div>
                        )}
                      </TableCell>
                    );
                  }}
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
        {!loading && hasMore && (
          <div className="flex justify-center p-4 border-t border-gray-50 dark:border-zinc-800/50">
            <Button
              variant="bordered"
              radius="full"
              size="sm"
              isLoading={loadingMore}
              onPress={loadMore}
            >
              {t("crm.load_more")}
            </Button>
          </div>
        )}
        </div>
      )}

      <RecordForm
        table={table}
        record={editing}
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
