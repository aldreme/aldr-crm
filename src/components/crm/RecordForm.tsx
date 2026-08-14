import { FIELD_TYPE, type CrmRecord, type TableDefinition } from "@/lib/types/crm";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import { useEffect, useMemo, useState } from "react";
import { FieldInput, isFormEditable } from "./FieldInput";
import { extractRecordIds } from "./LinkFieldInput";
import { FieldRenderer } from "./FieldRenderer";
import { useCrmTranslation } from "./CrmI18nProvider";

interface RecordFormProps {
  table: TableDefinition;
  record?: CrmRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (fields: Record<string, unknown>) => Promise<void>;
}

export function RecordForm({ table, record, isOpen, onClose, onSubmit }: RecordFormProps) {
  const { t } = useCrmTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editableFields = useMemo(
    () => table.fields.filter((f) => isFormEditable(f) && !f.is_primary),
    [table.fields],
  );
  const readonlyFields = useMemo(
    () => table.fields.filter((f) => !isFormEditable(f)),
    [table.fields],
  );

  const [values, setValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!isOpen) return;
    const initial: Record<string, unknown> = {};
    for (const field of editableFields) {
      initial[field.field_id] = record?.fields?.[field.field_name];
    }
    setValues(initial);
    setError(null);
    setSaving(false);
  }, [isOpen, record, editableFields]);

  const setField = (fieldId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const fields: Record<string, unknown> = {};
      for (const field of editableFields) {
        const v = values[field.field_id];
        if (v === null || v === undefined || v === "" ||
          (Array.isArray(v) && v.length === 0)) {
          continue;
        }
        // Feishu rejects string values for Number/Currency/Rating/Progress fields
        // (the record API returns them as strings), so coerce numeric strings.
        let value: unknown = v;
        if (field.type === FIELD_TYPE.Number && typeof v === "string") {
          const n = Number(v);
          if (Number.isFinite(n)) value = n;
        }
        // Link fields must be submitted as an array of record_ids.
        if (field.type === FIELD_TYPE.SingleLink || field.type === FIELD_TYPE.DuplexLink) {
          const ids = extractRecordIds(v);
          if (ids.length === 0) continue;
          value = ids;
        }
        fields[field.field_name] = value;
      }
      await onSubmit(fields);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()} backdrop="blur" size="2xl" scrollBehavior="inside">
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h2 className="text-lg font-bold">
                {record ? t("crm.form.title_edit") : t("crm.form.title_create")} · {table.name}
              </h2>
            </ModalHeader>
            <ModalBody className="gap-4">
              {readonlyFields.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 p-4 rounded-2xl bg-gray-50 dark:bg-zinc-800/40 border border-gray-100 dark:border-zinc-800">
                  {readonlyFields.map((field) => (
                    <div key={field.field_id} className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        {field.field_name}
                      </span>
                      <span className="text-sm">
                        <FieldRenderer field={field} value={record?.fields?.[field.field_name]} />
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                {editableFields.map((field) => (
                  <div key={field.field_id} className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {field.field_name}
                      {field.type === 7 ? "" : ""}
                    </label>
                    <FieldInput
                      field={field}
                      value={values[field.field_id]}
                      onChange={(v) => setField(field.field_id, v)}
                    />
                  </div>
                ))}
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                {t("crm.cancel")}
              </Button>
              <Button color="primary" onPress={handleSubmit} isLoading={saving}>
                {t("crm.save")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
