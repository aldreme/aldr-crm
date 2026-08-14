import { CrmRecordTable } from "@/components/crm/CrmRecordTable";
import type { FieldDefinition, TableLayoutProps } from "@/lib/types/crm";

export default function ContractsTableLayout({ table }: TableLayoutProps) {
  const order = ["合同编号", "项目名称", "客户名称", "合同金额", "项目进度", "签约日期", "交付日期", "签约人员", "应收账款", "备注"];

  const columns: FieldDefinition[] = order
    .map((name) => table.fields.find((f) => f.field_name === name))
    .filter((f): f is FieldDefinition => Boolean(f));

  return (
    <CrmRecordTable table={table} columns={columns} sortField="签约日期" sortDirection="desc" />
  );
}
