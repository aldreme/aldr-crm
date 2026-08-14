import { CrmRecordTable } from "@/components/crm/CrmRecordTable";
import type { FieldDefinition, TableLayoutProps } from "@/lib/types/crm";

// 客户管理 — customer master layout.
// Primary identifier first, then owner/status/rating, then financial rollups,
// then relationship/notes.
export default function CustomersTableLayout({ table }: TableLayoutProps) {
  const order = [
    "客户编码",
    "客户名称",
    "客户所有人",
    "客户状态",
    "信用评级",
    "合同金额总计",
    "年均合同金额",
    "应收账款",
    "BD经理",
    "备注",
  ];

  const columns: FieldDefinition[] = order
    .map((name) => table.fields.find((f) => f.field_name === name))
    .filter((f): f is FieldDefinition => Boolean(f));

  return <CrmRecordTable table={table} columns={columns} />;
}
