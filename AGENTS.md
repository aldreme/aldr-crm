# Project Context: aldr-crm

## Overview

`aldr-crm` is the standalone **CRM** application for **ALDR (Advanced Laboratory
Durable Reliable)**. It is a pure client-side **React (Vite)** SPA that talks to
a [Supabase](https://supabase.com/) **Edge Function** which, in turn, proxies the
[Feishu (Lark)](https://open.feishu.cn/) **Bitable** API (records, fields, media)
and handles Feishu OAuth SSO.

The app was extracted from the marketing site (`aldr-site-astro`) and is
deployed to GitHub Pages at `crm.aldreme.com`.

## Tech Stack

### Core

- **Framework:** [Vite 6](https://vitejs.dev/) + [React 18](https://react.dev/)
- **Routing:** [react-router-dom v6](https://reactrouter.com/) (client-side SPA)
- **Language:** TypeScript (strict)
- **Package Manager:** `pnpm` (Strictly enforced)

### Styling & Design System

- **Tailwind CSS 4**: Utility-first styling.
- **Component Library:** [@heroui/react](https://heroui.com/) for accessible UI
  components.
- **Primitives:** [Radix UI](https://www.radix-ui.com/) (`react-slot` for the
  shadcn-style `button`).
- **Animation:** `tailwindcss-animate`.
- **Icons:** `lucide-react`.
- **Date handling:** `date-fns` + `react-day-picker` (calendar).
- **State:** `jotai` for UI/dialog/cache atoms.
- **Utils:** `clsx` + `tailwind-merge` via `cn()`.

### Backend & Data

- **Edge Function:** `supabase/functions/crm/` — Feishu SSO + Bitable CRUD +
  media upload/download. Depends on the shared helpers in
  `supabase/functions/_shared/` (`feishu.ts`, `supabaseAdmin.ts`).
- **Auth:** Feishu OAuth, surfaced to the SPA via an httpOnly cookie on the
  Supabase function domain. Session state lives in a Postgres table
  (`crm_sessions`, migration kept in `aldr-site-astro`).
- **Generated schema:** `src/generated/crm/` is a snapshot of the Feishu Base
  schema (see `scripts/generate-crm-schema.ts`).

## Key Directory Structure

```text
/
├── index.html              # SPA entry (Vite)
├── scripts/
│   ├── copy-404.mjs        # Copy index.html -> 404.html (GH Pages SPA fallback)
│   └── generate-crm-schema.ts  # Fetch Feishu schema -> src/generated/crm/schema.json
├── src/
│   ├── main.tsx            # ReactDOM entry
│   ├── App.tsx             # BrowserRouter + routes (/login, /, /:slug)
│   ├── index.css           # Tailwind v4 + shadcn CSS vars
│   ├── components/
│   │   ├── crm/            # CRM app components (CrmApp, CrmLayout, tables, forms)
│   │   └── ui/             # Shared primitives (button, calendar)
│   ├── generated/crm/      # schema.json + manifest.ts + per-table layouts (generated)
│   ├── i18n/               # en.json, zh.json (crm.* keys)
│   ├── lib/
│   │   ├── api/crm-api.ts  # Edge function client (fetch wrapper)
│   │   ├── types/crm.ts    # CRM shared types
│   │   └── utils.ts        # cn()
│   └── store/              # jotai atoms (crm-ui.ts, crm-cache.ts)
├── supabase/
│   ├── config.toml         # Local dev config (project_id "aldr-crm")
│   ├── functions/          # crm + _shared (feishu, supabaseAdmin) + .env (secrets)
│   └── migrations/         # crm_sessions schema
├── .github/workflows/deploy.yml  # GitHub Pages deploy
├── tailwind.config.js      # Tailwind + HeroUI config
├── vite.config.ts          # Vite + dev proxy + @ alias
└── package.json
```

## Development Workflow

### Commands

| Command              | Description                                  |
| :------------------- | :------------------------------------------- |
| `pnpm install`       | Install dependencies (Strictly use pnpm)     |
| `pnpm dev`           | Start dev server (http://localhost:5173)     |
| `pnpm build`         | Typecheck + production build + 404 fallback  |
| `pnpm preview`       | Preview production build                     |
| `pnpm typecheck`     | `tsc --noEmit`                               |
| `pnpm gen:crm-schema`| Regenerate `src/generated/crm/schema.dev.json` (testing base) |
| `pnpm gen:crm-schema:prod` | Regenerate `src/generated/crm/schema.prod.json` (prod base) |
| `pnpm exec supabase start`  | Start local Supabase (serves the `crm` function) |
| `pnpm exec supabase stop`   | Stop local Supabase                          |
| `pnpm exec supabase functions deploy crm --project-ref cwekxndxzpymauoxixes` | Deploy the function to prod |

> **Two Feishu bases.** Testing and prod use different Feishu bases with
> different table/field ids, so two snapshots are committed —
> `schema.dev.json` (testing) and `schema.prod.json` (prod). `manifest.ts`
> selects one at build time via `import.meta.env.PROD`, and matches tables by
> **name** (stable across bases), never by id. `pnpm dev` uses the dev snapshot;
> `pnpm build` uses the prod snapshot.

### Deployment

- **Frontend:** GitHub Actions builds and publishes to GitHub Pages
  (`crm.aldreme.com`). `scripts/copy-404.mjs` writes `404.html` so client-side
  routes survive deep links on static hosting.
- **Edge function:** deployed to the shared Supabase project
  (`cwekxndxzpymauoxixes`):
  `pnpm exec supabase link --project-ref cwekxndxzpymauoxixes && pnpm exec supabase functions deploy crm`.
- **Local dev:** `pnpm exec supabase start` serves the `crm` function on
  `http://localhost:54321`; secrets come from `supabase/functions/.env`
  (gitignored). Only one local Supabase stack can bind the default ports at a
  time — stop the `aldr-site-astro` stack before starting this one.

## Conventions & Best Practices

### 1. Coding Style

- **Type Safety:** Strongly typed TypeScript. Use `interface` for object
  definitions.
- **Imports:** Use the `@/*` alias for absolute imports (configured in
  `vite.config.ts` and `tsconfig.json`).
- **File Naming:**
  - React Components: `PascalCase.tsx` (e.g., `CrmRecordTable.tsx`)
  - Utilities: `camelCase.ts` (e.g., `crm-api.ts`)

### 2. Styling (Critical)

- **Aesthetics:** Premium feel — gradients, subtle shadows (`box-shadow`), smooth
  transitions. Avoid flat, boring colors.
- **Composition:** ALWAYS use `cn()` (wraps `clsx` + `tailwind-merge`) when
  merging classes.
  ```tsx
  <div className={cn("bg-white p-4 rounded-lg", className)}>...</div>;
  ```
- **Dark Mode:** All components must support dark mode via `dark:` variants.

### 3. Data Fetching & Edge Function

- All data access goes through `@/lib/api/crm-api` (the `crm` edge function).
  Do not talk to Feishu directly from the client.
- In dev the edge function is called same-origin through the Vite dev proxy
  (targeting the local Supabase at `http://localhost:54321`); in production the
  browser calls it cross-origin directly with `credentials: include`. Run a
  local Supabase with `supabase start` (the `crm` function + `crm_sessions`
  migration live in this repo).
- **Environment:** Vite exposes only `VITE_*` vars to the client.
  - `VITE_SUPABASE_URL` — Supabase project URL (required).
  - `VITE_SUPABASE_KEY` — anon key (reserved for future use).
  - `FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `FEISHU_BASE_APP_TOKEN` — only for
    `pnpm gen:crm-schema` (server-side script, not bundled). The **testing**
    base token lives in `.env.development.local`; the **prod** base token lives
    in `.env.local`. The edge function reads its own `FEISHU_BASE_APP_TOKEN` from
    the function env (`supabase/functions/.env` locally, Supabase secrets in
    prod).

### 4. Internationalization (i18n)

- All user-visible text must be tokenized and pulled from `src/i18n/`
  (`en.json`, `zh.json`) under the `crm.*` namespace, via
  `useCrmTranslation()`.
- Do not hardcode strings in components.

### 5. Routing

- Routes: `/login`, `/` (dashboard), `/:slug` (table).
- Table slugs map to Feishu tables via `src/generated/crm/manifest.ts`
  (`getLayoutBySlug`). Use `react-router-dom` `Link`/`useLocation`/`useParams`
  for navigation; never hardcode `/crm/...` URLs.
