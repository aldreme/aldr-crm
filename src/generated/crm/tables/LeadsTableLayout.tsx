import { CrmRecordTable } from "@/components/crm/CrmRecordTable";
import type { FieldDefinition, TableLayoutProps } from "@/lib/types/crm";

export default function LeadsTableLayout({ table }: TableLayoutProps) {
  const order = ["线索名称", "潜在客户名称", "线索状态", "线索负责人", "潜在采购价值", "线索级别", "潜在客户行业", "线索创建时间", "备注"];

  const columns: FieldDefinition[] = order
    .map((name) => table.fields.find((f) => f.field_name === name))
    .filter((f): f is FieldDefinition => Boolean(f));

  return <CrmRecordTable table={table} columns={columns} />;
}
