import { CrmRecordTable } from "@/components/crm/CrmRecordTable";
import type { FieldDefinition, TableLayoutProps } from "@/lib/types/crm";

export default function FollowUpsTableLayout({ table }: TableLayoutProps) {
  const order = ["跟进内容", "跟进类型", "跟进目的", "跟进形式", "跟进人", "跟进评分", "跟进时间", "下次跟进时间"];

  const columns: FieldDefinition[] = order
    .map((name) => table.fields.find((f) => f.field_name === name))
    .filter((f): f is FieldDefinition => Boolean(f));

  return <CrmRecordTable table={table} columns={columns} />;
}
