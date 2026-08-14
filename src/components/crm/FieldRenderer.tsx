import { downloadUrl } from "@/lib/api/crm-api";
import { fieldOptionsMap } from "@/generated/crm/manifest";
import { FIELD_TYPE, type Attachment, type FieldDefinition } from "@/lib/types/crm";
import { format } from "date-fns";

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

export function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

/** Feishu serial date (days since 1899-12-30) → epoch ms. */
function serialToMs(serial: number): number {
  return Math.round((serial - 25569) * 86400000);
}

/** A user object may use snake_case (direct User field) or camelCase (lookup). */
function userName(user: Record<string, unknown>): string {
  return String(user?.name || user?.en_name || user?.enName || user?.email || user?.id || "");
}
function userAvatar(user: Record<string, unknown>): string {
  return String(user?.avatar_url || user?.avatarUrl || "");
}

function userList(value: unknown): Record<string, unknown>[] {
  const isUser = (u: unknown): u is Record<string, unknown> =>
    !!u && typeof u === "object" &&
    (!!(u as Record<string, unknown>).id ||
      !!(u as Record<string, unknown>).name ||
      !!(u as Record<string, unknown>).email ||
      !!(u as Record<string, unknown>).en_name ||
      !!(u as Record<string, unknown>).enName);

  if (Array.isArray(value)) {
    return value.filter(isUser).map((u) => u as Record<string, unknown>);
  }
  // Lookup of a User field: { users: [...] }.
  const users = (value as Record<string, unknown>)?.users;
  if (Array.isArray(users)) {
    return users.filter(isUser).map((u) => u as Record<string, unknown>);
  }
  return [];
}

/** Resolve a select-option id (returned by Formula/Lookup) to its name. */
function resolveOptionId(field: FieldDefinition, id: string): string | null {
  const p = field.property as
    | { type?: { ui_property?: { options?: { id: string; name: string }[] } }; target_field?: string }
    | undefined;

  // Formula: options are embedded in the formula's result ui_property.
  const opts = p?.type?.ui_property?.options;
  if (Array.isArray(opts)) {
    const found = opts.find((o) => o.id === id);
    if (found?.name) return found.name;
  }

  // Lookup: options come from the referenced field.
  if (p?.target_field) {
    const target = fieldOptionsMap.get(p.target_field);
    const found = target?.find((o) => o.id === id);
    if (found?.name) return found.name;
  }

  return null;
}

function resultDataType(field: FieldDefinition): number | undefined {
  const p = field.property as { type?: { data_type?: number } } | undefined;
  return p?.type?.data_type;
}

/** Whether a Formula/Lookup field yields a date (and therefore serial values). */
function isDateResult(field: FieldDefinition): boolean {
  const p = field.property as
    | { type?: { data_type?: number; ui_type?: string }; formatter?: string }
    | undefined;
  if (p?.type?.data_type === 5) return true;
  if (p?.type?.ui_type === "DateTime") return true;
  if (typeof p?.formatter === "string" && /yyyy|MM|dd/.test(p.formatter)) return true;
  return false;
}

function fmtEpoch(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  try {
    return format(new Date(ms), "yyyy-MM-dd HH:mm");
  } catch {
    return "";
  }
}

/** Whether a Number/Formula field represents a currency. */
function isCurrencyField(field: FieldDefinition): boolean {
  if (field.ui_type === "Currency") return true;
  const p = field.property as { type?: { ui_type?: string } } | undefined;
  return p?.type?.ui_type === "Currency";
}

function currencyMeta(field: FieldDefinition): { code: string; decimals: number } {
  const p = field.property as Record<string, any> | undefined;
  let code = "CNY";
  let formatter: string | undefined;
  if (field.ui_type === "Currency") {
    code = p?.currency_code || "CNY";
    formatter = p?.formatter;
  } else {
    code = p?.type?.ui_property?.currency_code || "CNY";
    formatter = p?.type?.ui_property?.formatter;
  }
  let decimals = 2;
  if (typeof formatter === "string") {
    const dot = formatter.lastIndexOf(".");
    if (dot >= 0) {
      decimals = (formatter.slice(dot + 1).match(/0/g) || []).length;
    }
  }
  return { code, decimals };
}

function formatCurrencyValue(value: unknown, field: FieldDefinition): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  const { code, decimals } = currencyMeta(field);
  const symbol = code === "CNY" ? "¥" : `${code} `;
  return `${symbol}${n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Best-effort plain-text representation of a field value (for compact cells/sorting). */
export function formatFieldValue(field: FieldDefinition, value: unknown): string {
  if (value === null || value === undefined) return "";

  switch (field.type) {
    case FIELD_TYPE.DateTime:
    case FIELD_TYPE.CreatedTime:
    case FIELD_TYPE.ModifiedTime: {
      const ms = typeof value === "number" ? value : Number(value);
      return fmtEpoch(ms) || String(value);
    }
    case FIELD_TYPE.Checkbox:
      return value ? "✓" : "—";
    case FIELD_TYPE.User:
    case FIELD_TYPE.CreatedUser:
    case FIELD_TYPE.ModifiedUser:
      return userList(value).map(userName).filter(Boolean).join(", ");
    case FIELD_TYPE.Attachment:
      return asList(value).map((a) => (a as Attachment)?.name || "").filter(Boolean).join(", ");
    case FIELD_TYPE.Url:
      if (typeof value === "string") return value;
      return (value as { text?: string; link?: string })?.text || (value as { link?: string })?.link || "";
    case FIELD_TYPE.Formula:
    case FIELD_TYPE.Lookup: {
      if (field.type === FIELD_TYPE.Lookup && (value as Record<string, unknown>)?.users) {
        return userList(value).map(userName).filter(Boolean).join(", ");
      }
      const items = asList(value);
      const texts: string[] = [];
      for (const item of items) {
        if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          if (o.text != null) {
            texts.push(String(o.text));
            continue;
          }
          if (o.value != null) {
            texts.push(
              asList(o.value).map((v) => resolveOptionId(field, String(v)) ?? String(v)).join(", "),
            );
            continue;
          }
        }
        if (typeof item === "number" && isDateResult(field)) {
          texts.push(fmtEpoch(serialToMs(item)));
          continue;
        }
        if (typeof item === "number" && isCurrencyField(field)) {
          texts.push(formatCurrencyValue(item, field));
          continue;
        }
        if (typeof item === "string") {
          texts.push(resolveOptionId(field, item) ?? item);
          continue;
        }
        texts.push(String(item));
      }
      return texts.join(", ");
    }
    case FIELD_TYPE.SingleLink:
    case FIELD_TYPE.DuplexLink:
      return asList(value)
        .map((item) => {
          const o = item as { text?: string; text_arr?: string[] };
          return o?.text || (Array.isArray(o?.text_arr) ? o.text_arr.join(", ") : "");
        })
        .filter(Boolean)
        .join(", ");
    case FIELD_TYPE.Location:
      return (value as { name?: string; full_address?: string; address?: string })?.name ||
        (value as { full_address?: string })?.full_address ||
        (value as { address?: string })?.address ||
        "";
    case FIELD_TYPE.Number:
      return isCurrencyField(field) ? formatCurrencyValue(value, field) : String(value);
    default:
      if (Array.isArray(value)) return value.map(String).join(", ");
      return String(value);
  }
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

interface FieldRendererProps {
  field: FieldDefinition;
  value: unknown;
  tableId?: string;
  recordId?: string;
}

export function FieldRenderer({ field, value, tableId, recordId }: FieldRendererProps) {
  if (value === null || value === undefined || value === "" ||
    (Array.isArray(value) && value.length === 0)) {
    return <span className="text-gray-300 dark:text-zinc-600">—</span>;
  }

  switch (field.type) {
    case FIELD_TYPE.DateTime:
    case FIELD_TYPE.CreatedTime:
    case FIELD_TYPE.ModifiedTime: {
      const ms = typeof value === "number" ? value : Number(value);
      const text = fmtEpoch(ms);
      return text ? <span className="tabular-nums">{text}</span> : <span>{String(value)}</span>;
    }
    case FIELD_TYPE.Checkbox:
      return value ? (
        <span className="text-emerald-500">✓</span>
      ) : (
        <span className="text-gray-300 dark:text-zinc-600">—</span>
      );
    case FIELD_TYPE.User:
    case FIELD_TYPE.CreatedUser:
    case FIELD_TYPE.ModifiedUser:
    case FIELD_TYPE.Lookup: {
      if (field.type === FIELD_TYPE.Lookup && !(value as Record<string, unknown>)?.users &&
        !Array.isArray(value)) {
        // Non-user lookup → fall through to generic text rendering.
        return <span>{formatFieldValue(field, value)}</span>;
      }
      const users = userList(value);
      if (users.length === 0) return <span>{formatFieldValue(field, value)}</span>;
      return (
        <span className="flex items-center gap-1.5 flex-wrap">
          {users.map((u, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              {userAvatar(u) ? (
                <img src={userAvatar(u)} alt="" className="w-5 h-5 rounded-full" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-[10px] text-blue-600 dark:text-blue-400">
                  {userName(u).charAt(0) || "?"}
                </span>
              )}
              <span>{userName(u)}</span>
            </span>
          ))}
        </span>
      );
    }
    case FIELD_TYPE.Attachment:
      return (
        <span className="flex flex-wrap gap-1.5">
          {asList(value).map((a, i) => {
            const att = a as Attachment;
            // Always route through the edge function (which attaches the user's
            // token) rather than Feishu's raw `att.url` — that URL requires auth
            // and returns 99991661 when opened directly in the browser.
            const href = tableId && field.field_id
              ? downloadUrl(att.file_token, tableId, field.field_id, recordId)
              : undefined;
            return href ? (
              <a
                key={i}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
              >
                {att.name || att.file_token}
              </a>
            ) : (
              <span key={i} className="text-xs">{att.name || att.file_token}</span>
            );
          })}
        </span>
      );
    case FIELD_TYPE.Url: {
      const link = typeof value === "string" ? value : (value as { link?: string })?.link || "";
      const text = typeof value === "string" ? value : (value as { text?: string })?.text || link;
      return link ? (
        <a href={link} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
          {text}
        </a>
      ) : (
        <span>{text}</span>
      );
    }
    case FIELD_TYPE.SingleSelect:
    case FIELD_TYPE.MultiSelect:
      return (
        <span className="flex flex-wrap gap-1.5">
          {asList(value).map((v, i) => (
            <span key={i} className="inline-flex px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-xs">
              {String(v)}
            </span>
          ))}
        </span>
      );
    case FIELD_TYPE.Location: {
      const loc = value as { name?: string; full_address?: string; address?: string };
      return <span>{loc.name || loc.full_address || loc.address || ""}</span>;
    }
    case FIELD_TYPE.Number:
      return <span className="tabular-nums">{formatFieldValue(field, value)}</span>;
    case FIELD_TYPE.SingleLink:
    case FIELD_TYPE.DuplexLink:
    case FIELD_TYPE.Formula:
    default:
      return <span>{formatFieldValue(field, value)}</span>;
  }
}
