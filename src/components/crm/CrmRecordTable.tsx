import {
  useCreateRecord,
  useDeleteRecord,
  useFillRecordFields,
  useOwnedRecords,
  useUpdateRecord,
} from "@/lib/api/crm-queries";
import type { CrmRecord, FieldDefinition, TableDefinition } from "@/lib/types/crm";
import { FIELD_TYPE } from "@/lib/types/crm";
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
import { addToast, closeToast } from "@heroui/toast";
import { Edit, List, Plus, RefreshCw, Table2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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

  const { data, isLoading, isError, error, isFetching, refetch } = useOwnedRecords(table.table_id);
  const records = data?.items ?? [];

  const createMutation = useCreateRecord(table.table_id);
  const updateMutation = useUpdateRecord(table.table_id);
  const deleteMutation = useDeleteRecord(table.table_id);
  const computedFieldNames = useMemo(
    () =>
      table.fields
        .filter((f) => f.type === FIELD_TYPE.Formula || f.type === FIELD_TYPE.Lookup)
        .map((f) => f.field_name),
    [table.fields],
  );
  const fillRecordFields = useFillRecordFields(table.table_id, computedFieldNames);

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CrmRecord | null>(null);
  const [view, setView] = useState<"table" | "split">("split");
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [refreshingTable, setRefreshingTable] = useState(false);

  const handleRefresh = async () => {
    setRefreshingTable(true);
    try {
      await refetch();
    } finally {
      setRefreshingTable(false);
    }
  };

  const displayColumns = useMemo(() => {
    if (columns) return columns;
    const primary = table.fields.find((f) => f.is_primary);
    const rest = table.fields.filter((f) => !f.is_primary);
    return primary ? [primary, ...rest] : rest;
  }, [table.fields, columns]);

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
      await updateMutation.mutateAsync({ recordId: editing.record_id, fields });
    } else {
      const { record_id } = await createMutation.mutateAsync(fields);
      // Fill in computed fields (formula/lookup) in the background with a toast.
      const fillPromise = fillRecordFields(record_id);
      const fillId = addToast({
        title: t("crm.syncing_fields"),
        promise: fillPromise,
        color: "primary",
        severity: "primary",
      });
      void fillPromise.then(() => {
        if (fillId) closeToast(fillId);
        addToast({
          title: t("crm.sync_complete"),
          color: "success",
          severity: "success",
          timeout: 2500,
        });
      });
    }
  };

  const handleDelete = async (record: CrmRecord) => {
    const ok = await dialog.confirm({
      title: t("crm.delete"),
      description: t("crm.delete_confirm"),
      confirmLabel: t("crm.delete"),
    });
    if (!ok) return;

    setDeletingRecordId(record.record_id);
    const promise = deleteMutation.mutateAsync(record.record_id);
    const deletingId = addToast({
      title: t("crm.deleting"),
      promise,
      color: "primary",
      severity: "primary",
    });
    try {
      await promise;
      if (deletingId) closeToast(deletingId);
      addToast({
        title: t("crm.record_deleted"),
        color: "success",
        severity: "success",
        timeout: 2500,
      });
    } catch (err) {
      if (deletingId) closeToast(deletingId);
      const message = err instanceof Error ? err.message : String(err);
      addToast({ title: message, color: "danger", severity: "danger", timeout: 5000 });
    } finally {
      setDeletingRecordId(null);
    }
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
            onPress={() => handleRefresh()}
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
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

      {isError && (
        <p className="text-sm text-red-500">
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}

      {view === "split" ? (
        <CrmSplitView
          table={table}
          columns={displayColumns}
          sortField={sortField}
          sortDirection={sortDirection}
          onEdit={(record) => {
            setEditing(record);
            setFormOpen(true);
          }}
          onDelete={handleDelete}
          deletingRecordId={deletingRecordId}
          refreshingTable={refreshingTable}
          onCreate={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
      ) : (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden">
        {isLoading || refreshingTable ? (
          <div className="w-full animate-in fade-in duration-300">
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
            className="animate-in fade-in duration-300"
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
                      const deleting = record.record_id === deletingRecordId;
                      return (
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Tooltip content={t("crm.edit")}>
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                isDisabled={deleting}
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
                                isLoading={deleting}
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
