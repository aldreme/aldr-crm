// Feishu (Lark) Bitable / CRM shared types.

/** Field `type` values from the Bitable List Fields API. */
export const FIELD_TYPE = {
  Text: 1,
  Number: 2,
  SingleSelect: 3,
  MultiSelect: 4,
  DateTime: 5,
  Checkbox: 7,
  User: 11,
  Phone: 13,
  Url: 15,
  Attachment: 17,
  SingleLink: 18,
  Lookup: 19,
  Formula: 20,
  DuplexLink: 21,
  Location: 22,
  CreatedTime: 1001,
  ModifiedTime: 1002,
  CreatedUser: 1003,
  ModifiedUser: 1004,
  AutoNumber: 1005,
  Button: 3001,
} as const;

export type FieldType = (typeof FIELD_TYPE)[keyof typeof FIELD_TYPE];

export interface SelectOption {
  id: string;
  name: string;
  color: number;
}

export interface FieldDefinition {
  field_id: string;
  field_name: string;
  type: FieldType;
  ui_type: string;
  is_primary: boolean;
  options?: SelectOption[];
  property?: Record<string, unknown>;
}

export interface TableDefinition {
  table_id: string;
  name: string;
  revision?: number;
  fields: FieldDefinition[];
}

export interface FeishuUserRef {
  id: string;
  name?: string;
  en_name?: string;
  email?: string;
  avatar_url?: string;
}

export interface Attachment {
  file_token: string;
  name: string;
  size: number;
  type?: string;
  url?: string;
  tmp_url?: string;
}

export interface UrlValue {
  link: string;
  text?: string;
}

export interface CrmRecord {
  record_id: string;
  created_by?: FeishuUserRef;
  created_time?: number;
  last_modified_by?: FeishuUserRef;
  last_modified_time?: number;
  fields: Record<string, unknown>;
}

export interface CrmSessionUser {
  openId: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

export interface ListCursor {
  t: string | null;
  o: number;
}

export interface ListRecordsResult {
  items: CrmRecord[];
  cursor: ListCursor | null;
  has_more: boolean;
}

export interface UploadedMedia {
  file_token: string;
  name: string;
  size: number;
  type: string;
}

/** Field categories used by the layout engine to group/sort columns. */
export type FieldKind = "editable" | "readonly" | "relation" | "primary";

export function fieldKind(field: FieldDefinition): FieldKind {
  if (field.is_primary) return "primary";
  switch (field.type) {
    case FIELD_TYPE.Formula:
    case FIELD_TYPE.Lookup:
    case FIELD_TYPE.AutoNumber:
    case FIELD_TYPE.CreatedTime:
    case FIELD_TYPE.ModifiedTime:
    case FIELD_TYPE.CreatedUser:
    case FIELD_TYPE.ModifiedUser:
    case FIELD_TYPE.Button:
      return "readonly";
    case FIELD_TYPE.SingleLink:
    case FIELD_TYPE.DuplexLink:
      return "relation";
    default:
      return "editable";
  }
}

/** Whether a field is editable through the create/update record API. */
export function isEditableField(field: FieldDefinition): boolean {
  return fieldKind(field) === "editable";
}

/** Props contract shared by all generated per-table layout components. */
export interface TableLayoutProps {
  table: TableDefinition;
}
