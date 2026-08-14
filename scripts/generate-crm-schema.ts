// Fetch the Feishu Base schema (tables + fields) and write a snapshot used to
// statically generate the CRM table pages. Re-running is a no-op when the schema
// fingerprint is unchanged.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

dotenv.config({ path: join(root, ".env") });
dotenv.config({ path: join(root, ".env.local") });
dotenv.config({ path: join(root, ".env.development.local") });

const FEISHU_DOMAIN = "https://open.feishu.cn";
const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const BASE_TOKEN = process.env.FEISHU_BASE_APP_TOKEN;

const OUT_DIR = join(root, "src", "generated", "crm");
const SCHEMA_PATH = join(OUT_DIR, "schema.json");
const FINGERPRINT_PATH = join(OUT_DIR, "fingerprint.txt");

async function tenantToken(): Promise<string> {
  const res = await fetch(`${FEISHU_DOMAIN}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`tenant token error: ${JSON.stringify(data)}`);
  return data.tenant_access_token;
}

async function main() {
  if (!APP_ID || !APP_SECRET || !BASE_TOKEN) {
    throw new Error("missing FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_BASE_APP_TOKEN");
  }

  const token = await tenantToken();

  const tablesRes = await fetch(
    `${FEISHU_DOMAIN}/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables?page_size=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const tablesData = await tablesRes.json();
  if (tablesData.code !== 0) throw new Error(`list tables error: ${JSON.stringify(tablesData)}`);
  const tables = tablesData.data?.items ?? [];

  const result: unknown[] = [];
  for (const table of tables) {
    const fieldsRes = await fetch(
      `${FEISHU_DOMAIN}/open-apis/bitable/v1/apps/${BASE_TOKEN}/tables/${table.table_id}/fields?page_size=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const fieldsData = await fieldsRes.json();
    if (fieldsData.code !== 0) throw new Error(`list fields error: ${JSON.stringify(fieldsData)}`);
    const fields = (fieldsData.data?.items ?? []).map((f: any) => ({
      field_id: f.field_id,
      field_name: f.field_name,
      type: f.type,
      ui_type: f.ui_type,
      is_primary: !!f.is_primary,
      options: f.property?.options ?? undefined,
      property: f.property ?? undefined,
    }));
    result.push({ table_id: table.table_id, name: table.name, revision: table.revision, fields });
  }

  const schema = { base_token: BASE_TOKEN, tables: result };
  const json = JSON.stringify(schema, null, 2);
  const fingerprint = createHash("sha256").update(json).digest("hex");

  if (existsSync(FINGERPRINT_PATH) && readFileSync(FINGERPRINT_PATH, "utf8").trim() === fingerprint) {
    console.log(`schema unchanged (${fingerprint}), skipping regeneration`);
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(SCHEMA_PATH, json);
  writeFileSync(FINGERPRINT_PATH, fingerprint + "\n");
  console.log(`wrote schema.json (${result.length} tables, fingerprint ${fingerprint})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
