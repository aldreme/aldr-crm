// CRM table manifest. Maps each CRM-related Feishu Base table to its statically
// generated per-table layout component. Regenerate schemas via
// `pnpm gen:crm-schema` (testing) / `pnpm gen:crm-schema:prod` (prod).
//
// Testing and prod Feishu bases have different table/field ids, so two schema
// snapshots are committed and the correct one is selected at build time
// (Vite `import.meta.env.PROD`).
import type { ComponentType } from "react";
import type { FieldDefinition, TableDefinition } from "@/lib/types/crm";
import schemaDev from "./schema.dev.json";
import schemaProd from "./schema.prod.json";

const schema = import.meta.env.PROD ? schemaProd : schemaDev;

import BusinessPartnersTableLayout from "./tables/BusinessPartnersTableLayout";
import ContractsTableLayout from "./tables/ContractsTableLayout";
import CustomersTableLayout from "./tables/CustomersTableLayout";
import FollowUpsTableLayout from "./tables/FollowUpsTableLayout";
import LeadsTableLayout from "./tables/LeadsTableLayout";
import OpportunitiesTableLayout from "./tables/OpportunitiesTableLayout";
import PartnerContactsTableLayout from "./tables/PartnerContactsTableLayout";

// Only CRM-related tables are surfaced in the CRM. Finance/accounting and
// production/inventory tables (流水明细, 发票管理, 应付款项, 应收款项, 费用报销,
// 记账凭证, 采购申请, 会计科目, 生产管理, 返工管理, BOM表, 库存管理, 物料库,
// 工序管理, 工序执行表, 供应商管理) are intentionally excluded.
//
// Tables are matched by *name* (stable across the testing and prod Feishu bases)
// rather than by table_id, because table ids differ between bases.
const CRM_TABLE_NAMES = new Set([
  "线索管理", // Leads
  "商机管理", // Opportunities
  "跟进记录", // Follow-ups
  "合同管理", // Contracts
  "客户管理", // Customers
  "往来单位管理", // Accounts / Business Partners
  "往来单位联系人", // Contacts
]);

type TableComponent = ComponentType<{ table: TableDefinition }>;

const components: Record<string, TableComponent> = {
  线索管理: LeadsTableLayout,
  商机管理: OpportunitiesTableLayout,
  跟进记录: FollowUpsTableLayout,
  合同管理: ContractsTableLayout,
  客户管理: CustomersTableLayout,
  往来单位管理: BusinessPartnersTableLayout,
  往来单位联系人: PartnerContactsTableLayout,
};

const slugs: Record<string, string> = {
  线索管理: "leads",
  商机管理: "opportunities",
  跟进记录: "follow-ups",
  合同管理: "contracts",
  客户管理: "customers",
  往来单位管理: "business-partners",
  往来单位联系人: "partner-contacts",
};

interface RawField {
  field_id: string;
  field_name: string;
  type: number;
  ui_type: string;
  is_primary: boolean;
  is_hidden?: boolean;
  options?: { id: string; name: string; color: number }[];
  property?: Record<string, unknown>;
}

interface RawTable {
  table_id: string;
  name: string;
  revision?: number;
  fields: RawField[];
}

interface RawSchema {
  base_token: string;
  tables: RawTable[];
}

export interface TableLayoutDef {
  tableId: string;
  slug: string;
  name: string;
  table: TableDefinition;
  Component: TableComponent;
}

export const tableLayouts: TableLayoutDef[] = (schema as unknown as RawSchema).tables
  .filter((t) => CRM_TABLE_NAMES.has(t.name))
  .map((t) => ({
    tableId: t.table_id,
    slug: slugs[t.name] ?? t.table_id,
    name: t.name,
    table: {
      table_id: t.table_id,
      name: t.name,
      revision: t.revision,
      fields: (t.fields.filter((f) => !f.is_hidden) as FieldDefinition[]),
    },
    Component: components[t.name],
  }));

export function getLayoutByTableId(tableId: string): TableLayoutDef | undefined {
  return tableLayouts.find((l) => l.tableId === tableId);
}

export function getLayoutBySlug(slug: string): TableLayoutDef | undefined {
  return tableLayouts.find((l) => l.slug === slug);
}

// Global map of field_id → select options, used to resolve option ids returned
// by Formula/Lookup fields (which yield option ids, not names).
export const fieldOptionsMap: Map<string, { id: string; name: string; color: number }[]> = (() => {
  const map = new Map<string, { id: string; name: string; color: number }[]>();
  for (const t of (schema as unknown as RawSchema).tables) {
    for (const f of t.fields) {
      if (f.options?.length) map.set(f.field_id, f.options);
    }
  }
  return map;
})();

// Global map of table_id → primary field, used to label records in link pickers.
export const tablePrimaryFieldMap: Map<string, FieldDefinition> = (() => {
  const map = new Map<string, FieldDefinition>();
  for (const t of (schema as unknown as RawSchema).tables) {
    const primary = t.fields.find((f) => f.is_primary);
    if (primary) map.set(t.table_id, primary as FieldDefinition);
  }
  return map;
})();
