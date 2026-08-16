# ALDR CRM

Standalone CRM web application for **ALDR (Advanced Laboratory Durable
Reliable)**, built as a React SPA served on GitHub Pages at
[crm.aldreme.com](https://crm.aldreme.com).

The CRM is a thin frontend over **Feishu Base** (the system of record for all
CRM data: leads, opportunities, customers, contracts, follow-ups, partners).
A single **Supabase Edge Function** (`crm`) mediates all Feishu API calls,
performs the OAuth login flow against Feishu, and persists login sessions in
PostgreSQL. The app was extracted from the `aldr-site-astro` monolith and is
now developed independently in this repository.

## Architecture

```text
Browser (React SPA, Vite)
   │  /functions/v1/crm?action=...   (dev: Vite proxy → local Supabase)
   ▼
Supabase Edge Function `crm` (Deno)
   │  Feishu Open Platform API (app_token / user_access_token)
   ▼
Feishu Base (bitable) ── the actual data store
   ▲
Supabase Postgres ── crm_sessions table (login session persistence)
```

- **Frontend**: React 18 + Vite 6 + TypeScript, Tailwind CSS 4, HeroUI
  (`@heroui/react`), TanStack Query (caching + optimistic mutations), React
  Router, Jotai (UI state), lucide-react icons.
- **Backend**: one Supabase Edge Function (`supabase/functions/crm`) that
  routes by `action` query parameter (see
  [Edge Function actions](#edge-function-actions)).
- **Data store**: Feishu Base. The CRM never talks to Feishu directly; all
  Feishu credentials live server-side.

## Repositories & hosting

| Piece          | Location                                                       |
| :------------- | :------------------------------------------------------------- |
| App (this repo) | `git@github.com:aldreme/aldr-crm.git`                         |
| Edge function   | `supabase/functions/crm` (deployed to the shared Supabase project `cwekxndxzpymauoxixes`) |
| Hosting         | GitHub Pages, custom domain `crm.aldreme.com` (see `.github/workflows/deploy.yml`) |

## Getting started

Requirements: Node.js 20+, `pnpm` (version pinned in `package.json`), Docker
(for local Supabase).

```bash
pnpm install

# 1. Copy environment files
cp .env.development.local.example .env.development.local   # if you have a template
# .env.development.local → local dev (Supabase http://localhost:54321, testing Feishu base)
# .env.local              → prod build (Supabase https://cwekxndxzpymauoxixes.supabase.co, prod Feishu base)

# 2. Start local Supabase (needed for the edge function + login flow)
supabase start

# 3. Run the Vite dev server
pnpm dev        # http://localhost:5173
```

> The `.env*` files are gitignored and contain real secrets. Do not commit
> them. `VITE_*` variables are inlined by Vite at build time; `FEISHU_*`
> variables are read only by the schema-generation script (server-side).

### Environment variables

| Variable                  | Where            | Purpose                                             |
| :------------------------ | :--------------- | :-------------------------------------------------- |
| `VITE_SUPABASE_URL`       | `.env*`          | Supabase gateway (dev proxy target / prod REST)     |
| `VITE_SUPABASE_KEY`       | `.env*`          | Supabase anon key                                   |
| `FEISHU_APP_ID`           | `supabase/functions/.env` | Feishu app id (edge function, deployed as secret) |
| `FEISHU_APP_SECRET`       | `supabase/functions/.env` | Feishu app secret (edge function, deployed as secret) |
| `FEISHU_BASE_APP_TOKEN`   | `.env*` + `supabase/functions/.env` | Feishu Base app token (testing base in dev, prod base in prod) |
| `CRM_JWT_SECRET`          | `supabase/functions/.env` | JWT signing of CRM session ids |
| `CRM_SITE_URL`            | `supabase/functions/.env` | Redirect target after Feishu login (`http://localhost:5173` dev, `https://crm.aldreme.com` prod) |
| `CRM_FUNCTION_URL`        | `supabase/functions/.env` | Edge function base URL (dev: `http://localhost:54321/functions/v1/crm`) |

## Two Feishu bases, two schemas

Testing and production use **different Feishu Base instances**, and their
tables/fields have different ids. To keep this manageable:

- `scripts/generate-crm-schema.ts` snapshots a base into
  `src/generated/crm/schema.dev.json` (testing) or
  `schema.prod.json` (prod, via `NODE_ENV=production`).
- `src/generated/crm/manifest.ts` selects the right schema at build time
  (`import.meta.env.PROD`) and maps CRM tables to their generated layout
  components.
- Tables are matched **by name**, not id, because ids differ between bases.
  Finance/production tables are intentionally excluded from the CRM.

Regenerate:

```bash
pnpm gen:crm-schema        # testing base  → schema.dev.json
pnpm gen:crm-schema:prod   # prod base     → schema.prod.json
```

Hidden fields (hidden via the base's grid `view_id`) are captured during
schema generation and filtered out of the manifest.

## Login & session flow

1. App redirects to the edge function (`action=login`) → Feishu OAuth.
2. Feishu redirects back to the edge function (`action=callback`), which
   stores the session in the `crm_sessions` table and redirects the browser
   to `CRM_SITE_URL#session=<sessionId>`.
3. The SPA reads the session id from the URL fragment, persists it in
   `localStorage`, and sends it on every API call via the `x-crm-session`
   header.
4. The edge function resolves the session on every request and refreshes the
   Feishu user token when needed.

The fragment (`#session=...`) + header approach exists because third-party
cookies (the `supabase.co` auth cookie) are blocked on iOS Safari/Chrome;
logout is a plain fetch to the edge function followed by a localStorage
clear.

## Edge Function actions

| Action             | Description                                          |
| :----------------- | :--------------------------------------------------- |
| `login`            | Start Feishu OAuth                                   |
| `callback`         | OAuth callback, persists session, redirects          |
| `exchange_code`    | Exchange Feishu code (used by the login page)        |
| `session`          | Session info for the current `x-crm-session`         |
| `logout`           | Invalidate the session                               |
| `records.list`     | Page through a table's records                       |
| `records.listAll`  | Fetch all records of a table (for lookups)           |
| `records.lookup`   | Lookup records in another table (link fields)        |
| `records.count` / `records.counts` | Record counts (dashboard / table badges) |
| `records.get`      | Single record (used to refresh computed fields after create) |
| `records.create` / `records.update` / `records.delete` | Mutations |
| `media.upload` / `media.download` | Attachment handling              |

Deploy:

```bash
supabase secrets set --env-file ./supabase/functions/.env
supabase functions deploy crm --project-ref <ref>
```

## Frontend notes

- **Query layer** (`src/lib/api/crm-queries.ts`, `src/lib/query-client.ts`):
  TanStack Query with `staleTime`/`gcTime` of Infinity — data is fetched once
  per session and invalidated explicitly. A global 401 handler redirects to
  `/login`.
- **Optimistic mutations**: create/update/delete patch the query cache
  immediately. Creates fetch the created record back (`records.get`, with
  backoff polling) to reconcile formula/lookup fields that Feishu computes
  asynchronously ("Syncing computed fields…" toast).
- **Layouts**: `CrmSplitView` (list + detail on desktop, drill-down on mobile),
  `CrmRecordTable` (data grid with search + pagination), `RecordForm`
  (full-screen bottom sheet on mobile), `CrmLayout` (sidebar drawer on mobile
  with bottom tab bar).
- **i18n**: `src/i18n/en.json` + `src/i18n/zh.json`, default locale `zh`,
  locale switcher in the header.

## Local Supabase specifics

- `supabase/config.toml` sets `[edge_runtime] policy = "per_worker"`. This
  pre-boots workers and avoids "worker did not respond in time" boot failures
  under concurrent requests (a record form fires several link-field lookups at
  once). Downside: **no hot reload** — restart with `supabase stop && supabase
  start` after changing the function.
- `supabase/migrations/20260814000000_create_crm_sessions.sql` creates
  `crm_sessions` with RLS enabled and no anon policies; only `service_role`
  (used by the edge function) can access it.

## Scripts

| Script                       | Description                                          |
| :--------------------------- | :--------------------------------------------------- |
| `pnpm dev`                   | Vite dev server (`http://localhost:5173`)            |
| `pnpm build`                 | Typecheck + build + SPA 404 copy (`dist/`)           |
| `pnpm preview`               | Preview the production build                         |
| `pnpm typecheck`             | `tsc --noEmit`                                       |
| `pnpm gen:crm-schema` / `:prod` | Regenerate Feishu schema snapshots (see above)  |
| `node scripts/copy-404.mjs`  | Copy `index.html` → `404.html` (GitHub Pages SPA fallback) |
| `node scripts/generate-icons.mjs` | Regenerate PWA icons from the favicon           |

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`: build with the prod
Supabase URL, publish `dist/` to GitHub Pages with `peaceiris/actions-gh-pages`,
and keep the `crm.aldreme.com` CNAME. The edge function is deployed manually
(see above) — its prod secrets (`FEISHU_*`, `CRM_JWT_SECRET`,
`CRM_SITE_URL=https://crm.aldreme.com`) must be set on the Supabase project.