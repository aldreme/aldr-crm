import { CrmRecordTable } from "@/components/crm/CrmRecordTable";
import type { FieldDefinition, TableLayoutProps } from "@/lib/types/crm";

export default function BusinessPartnersTableLayout({ table }: TableLayoutProps) {
  const order = ["单位名称", "单位代码", "往来类型", "所属行业", "企业规模", "联系人", "注册地址", "统一社会信用代码"];

  const columns: FieldDefinition[] = order
    .map((name) => table.fields.find((f) => f.field_name === name))
    .filter((f): f is FieldDefinition => Boolean(f));

  return <CrmRecordTable table={table} columns={columns} />;
}
