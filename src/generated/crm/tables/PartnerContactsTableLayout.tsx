import { CrmRecordTable } from "@/components/crm/CrmRecordTable";
import type { FieldDefinition, TableLayoutProps } from "@/lib/types/crm";

export default function PartnerContactsTableLayout({ table }: TableLayoutProps) {
  const order = ["联系人编号", "联系人", "关联往来单位", "联系电话", "Email", "微信", "职位", "备注"];

  const columns: FieldDefinition[] = order
    .map((name) => table.fields.find((f) => f.field_name === name))
    .filter((f): f is FieldDefinition => Boolean(f));

  return <CrmRecordTable table={table} columns={columns} />;
}
