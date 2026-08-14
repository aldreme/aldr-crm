import { lookupRecords } from "@/lib/api/crm-api";
import { tablePrimaryFieldMap } from "@/generated/crm/manifest";
import { linkLookupCacheAtom } from "@/store/crm-cache";
import type { CrmRecord, FieldDefinition } from "@/lib/types/crm";
import { cn } from "@/lib/utils";
import { Button, Input, Popover, PopoverContent, PopoverTrigger } from "@heroui/react";
import { Check, ChevronDown, Search } from "lucide-react";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { formatFieldValue } from "./FieldRenderer";

interface LinkFieldInputProps {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

/** Extract record_ids from a link field value (link objects or raw ids). */
export function extractRecordIds(value: unknown): string[] {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  const ids: string[] = [];
  for (const item of list) {
    if (typeof item === "string") {
      ids.push(item);
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const rids = o.record_ids;
      if (Array.isArray(rids) && rids.length > 0) {
        ids.push(String(rids[0]));
      } else if (o.record_id) {
        ids.push(String(o.record_id));
      }
    }
  }
  return ids.filter(Boolean);
}

export function LinkFieldInput({ field, value, onChange }: LinkFieldInputProps) {
  const tableId = (field.property as { table_id?: string } | undefined)?.table_id;
  const multiple = !!(field.property as { multiple?: boolean } | undefined)?.multiple;
  const primaryField = tableId ? tablePrimaryFieldMap.get(tableId) : undefined;

  const [options, setOptions] = useState<CrmRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const cache = useAtomValue(linkLookupCacheAtom);
  const setCache = useSetAtom(linkLookupCacheAtom);

  useEffect(() => {
    if (!tableId) return;

    const cached = cache[tableId];
    if (cached) {
      setOptions(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    lookupRecords(tableId, primaryField?.field_name)
      .then(({ items }) => {
        if (cancelled) return;
        setCache((prev) => ({ ...prev, [tableId]: items }));
        setOptions(items);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tableId, primaryField, retryKey]);

  const label = (record: CrmRecord): string => {
    if (primaryField) {
      const s = formatFieldValue(primaryField, record.fields?.[primaryField.field_name]);
      if (s) return s;
    }
    return record.record_id;
  };

  const selectedIds = extractRecordIds(value);
  const selectedLabels = selectedIds
    .map((id) => {
      const rec = options.find((r) => r.record_id === id);
      return rec ? label(rec) : id;
    })
    .filter(Boolean);

  const toggle = (id: string) => {
    if (multiple) {
      const next = selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id];
      onChange(next);
    } else {
      onChange([id]);
      setOpen(false);
    }
  };

  const filtered = options.filter((r) =>
    label(r).toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <Popover isOpen={open} onOpenChange={setOpen} placement="bottom-start">
      <PopoverTrigger>
        <Button
          variant="bordered"
          radius="lg"
          className="w-full justify-between font-normal"
          isLoading={loading}
        >
          <span className="truncate flex-1 text-left min-w-0">
            {selectedLabels.length > 0 ? selectedLabels.join(", ") : "\u00a0"}
          </span>
          <ChevronDown className="w-4 h-4 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-80 max-w-[90vw] items-stretch">
        <div className="w-full p-2 border-b border-gray-100 dark:border-zinc-800">
          <Input
            size="sm"
            variant="bordered"
            radius="lg"
            placeholder="Search…"
            value={query}
            onValueChange={setQuery}
            autoFocus
            startContent={<Search className="w-4 h-4 text-gray-400" />}
          />
        </div>
        <div className="w-full max-h-64 overflow-y-auto p-1">
          {error ? (
            <div className="p-3 text-center">
              <p className="text-sm text-red-500">{error}</p>
              <Button
                size="sm"
                variant="bordered"
                radius="full"
                className="mt-2"
                onPress={() => setRetryKey((k) => k + 1)}
              >
                Retry
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-gray-400 text-center">No results</p>
          ) : (
            filtered.map((record) => {
              const selected = selectedIds.includes(record.record_id);
              return (
                <button
                  key={record.record_id}
                  type="button"
                  onClick={() => toggle(record.record_id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-left"
                >
                  <span
                    className={cn(
                      "flex items-center justify-center w-4 h-4 flex-shrink-0 border",
                      multiple ? "rounded" : "rounded-full",
                      selected
                        ? "bg-blue-600 border-blue-600"
                        : "border-gray-300 dark:border-zinc-600",
                    )}
                  >
                    {selected && <Check className="w-3 h-3 text-white" />}
                  </span>
                  <span className="text-sm truncate min-w-0 flex-1">{label(record)}</span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
