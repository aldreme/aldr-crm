import { FIELD_TYPE, type Attachment, type FieldDefinition } from "@/lib/types/crm";
import { Button, Checkbox, Input, Popover, PopoverContent, PopoverTrigger, Select, SelectItem } from "@heroui/react";
import { CalendarDays, Clock } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { AttachmentUploader } from "./AttachmentUploader";
import { LinkFieldInput } from "./LinkFieldInput";

// ---------------------------------------------------------------------------
// Which field types are editable through a create/update form.
// (User, SingleLink, DuplexLink, Formula, Lookup, AutoNumber, timestamps are
//  intentionally not editable in v1.)
// ---------------------------------------------------------------------------
export function isFormEditable(field: FieldDefinition): boolean {
  switch (field.type) {
    case FIELD_TYPE.Text:
    case FIELD_TYPE.Number:
    case FIELD_TYPE.SingleSelect:
    case FIELD_TYPE.MultiSelect:
    case FIELD_TYPE.DateTime:
    case FIELD_TYPE.Checkbox:
    case FIELD_TYPE.Phone:
    case FIELD_TYPE.Url:
    case FIELD_TYPE.Attachment:
    case FIELD_TYPE.SingleLink:
    case FIELD_TYPE.DuplexLink:
      return true;
    default:
      return false;
  }
}

interface FieldInputProps {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

function DateTimeInput({ field, value, onChange }: FieldInputProps) {
  const hasTime = String((field.property as Record<string, unknown>)?.date_formatter ?? "").includes("HH");
  const ms = value != null && value !== "" ? Number(value) : undefined;
  const date = ms != null && Number.isFinite(ms) ? new Date(ms) : undefined;

  const handleSelect = (d: Date | undefined) => {
    if (!d) {
      onChange(undefined);
      return;
    }
    if (!hasTime) {
      onChange(d.getTime());
      return;
    }
    const base = date ?? new Date();
    const next = new Date(d);
    next.setHours(base.getHours(), base.getMinutes(), 0, 0);
    onChange(next.getTime());
  };

  const handleTime = (v: string) => {
    if (!v) return;
    const [h, m] = v.split(":").map(Number);
    const d = date ?? new Date();
    d.setHours(h || 0, m || 0, 0, 0);
    onChange(d.getTime());
  };

  return (
    <Popover placement="bottom-start">
      <PopoverTrigger>
        <Button
          variant="bordered"
          radius="lg"
          className="w-full justify-between font-normal"
        >
          <span className="truncate flex-1 text-left min-w-0">
            {date ? format(date, hasTime ? "yyyy-MM-dd HH:mm" : "yyyy-MM-dd") : "\u00a0"}
          </span>
          <CalendarDays className="w-4 h-4 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-auto">
        <Calendar mode="single" selected={date} onSelect={handleSelect} initialFocus />
        {hasTime && (
          <div className="flex items-center gap-2 p-3 border-t border-gray-100 dark:border-zinc-800">
            <Clock className="w-4 h-4 text-gray-400" />
            <Input
              type="time"
              size="sm"
              variant="bordered"
              radius="lg"
              value={date ? format(date, "HH:mm") : ""}
              onValueChange={handleTime}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function FieldInput({ field, value, onChange }: FieldInputProps) {
  switch (field.type) {
    case FIELD_TYPE.Text:
      return (
        <Input
          value={typeof value === "string" ? value : ""}
          onValueChange={onChange}
          variant="bordered"
          radius="lg"
        />
      );
    case FIELD_TYPE.Phone:
      return (
        <Input
          type="tel"
          value={typeof value === "string" ? value : ""}
          onValueChange={onChange}
          variant="bordered"
          radius="lg"
        />
      );
    case FIELD_TYPE.Url:
      return (
        <Input
          type="url"
          placeholder="https://"
          value={typeof value === "string" ? value : (value as { link?: string })?.link || ""}
          onValueChange={(v) => onChange({ link: v, text: v })}
          variant="bordered"
          radius="lg"
        />
      );
    case FIELD_TYPE.Number: {
      const num = value === null || value === undefined || value === "" ? "" : String(value);
      return (
        <Input
          type="number"
          inputMode="decimal"
          value={num}
          onValueChange={(v) => {
            if (v === "") return onChange("");
            const parsed = Number(v);
            onChange(Number.isFinite(parsed) ? parsed : v);
          }}
          variant="bordered"
          radius="lg"
        />
      );
    }
    case FIELD_TYPE.SingleSelect:
    case FIELD_TYPE.MultiSelect: {
      const multiple = field.type === FIELD_TYPE.MultiSelect;
      // Record values are option *names*; Select keys are option *ids*.
      const names = value == null ? [] : Array.isArray(value) ? value.map(String) : [String(value)];
      const items = field.options ?? [];
      const selectedKeys = new Set(
        items.filter((o) => names.includes(o.name)).map((o) => o.id),
      );
      return (
        <Select
          aria-label={field.field_name}
          selectionMode={multiple ? "multiple" : "single"}
          selectedKeys={selectedKeys}
          onSelectionChange={(keys) => {
            const ids = Array.from(keys instanceof Set ? keys : [keys]).map(String);
            const picked = items.filter((o) => ids.includes(o.id)).map((o) => o.name);
            onChange(multiple ? picked : (picked[0] ?? ""));
          }}
          variant="bordered"
          radius="lg"
          items={items}
        >
          {(option) => <SelectItem key={option.id}>{option.name}</SelectItem>}
        </Select>
      );
    }
    case FIELD_TYPE.DateTime:
      return <DateTimeInput field={field} value={value} onChange={onChange} />;
    case FIELD_TYPE.Checkbox:
      return (
        <Checkbox isSelected={!!value} onValueChange={onChange} className="py-1">
          {field.field_name}
        </Checkbox>
      );
    case FIELD_TYPE.Attachment:
      return (
        <AttachmentUploader
          value={(Array.isArray(value) ? value : []) as Attachment[]}
          onChange={onChange}
        />
      );
    case FIELD_TYPE.SingleLink:
    case FIELD_TYPE.DuplexLink:
      return <LinkFieldInput field={field} value={value} onChange={onChange} />;
    default:
      return (
        <Input isDisabled value="" placeholder="—" variant="bordered" radius="lg" />
      );
  }
}
