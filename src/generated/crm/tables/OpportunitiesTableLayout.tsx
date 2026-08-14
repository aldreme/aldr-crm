import { CrmRecordTable } from "@/components/crm/CrmRecordTable";
import type { FieldDefinition, TableLayoutProps } from "@/lib/types/crm";

export default function OpportunitiesTableLayout({ table }: TableLayoutProps) {
  const order = ["商机名称", "客户名称", "跟进阶段", "业务价值", "跟进销售人员", "预计签单日期", "销售区域", "商机创建时间", "备注"];

  const columns: FieldDefinition[] = order
    .map((name) => table.fields.find((f) => f.field_name === name))
    .filter((f): f is FieldDefinition => Boolean(f));

  return <CrmRecordTable table={table} columns={columns} />;
}
