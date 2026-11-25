<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Production data safety

The Supabase project is a live, non-greenfield production database. Existing production data is important and must always be preserved.

- Treat every schema change as an incremental migration from the current live schema; never recreate, reset, truncate, reseed, or replace the production database.
- Before applying migrations, compare local and remote migration history and inspect every pending statement for destructive or irreversible operations.
- Prefer additive, idempotent, backwards-compatible changes. When a destructive change is genuinely required, use a staged migration with explicit data backfill and verification before removing old structures.
- Never run `supabase db reset`, destructive SQL, or broad data cleanup against the linked/live project.
- Back up or otherwise establish a recoverable path before any migration with meaningful data risk.
- After applying migrations, verify migration history, critical tables/data counts, and the affected application flows.

## Release notes

Every PR either adds a release note in `updates/notes/<slug>.json` for each change a member notices, or carries the label `sem-novidade`. The `release-note` check enforces it. Write notes with the `release-note` skill (`.claude/skills/release-note/SKILL.md`).

## Repository map

One npm workspace: the Next.js web app at the root (`src/`), the Expo app in `apps/mobile`, and two shared packages that both apps import by name. Write shared logic once in a package; do not copy it into the other app. `npm run lint` enforces the boundaries below (rules in `eslint.config.mjs`).

### What goes where

- `packages/domain` (`@clube-do-jogo/domain`): types, rules and pure functions with no dependencies (ranking, progress, ratings, dates, GOTY, rewards, themes, labels, demo data). No Supabase, React, Next, Expo or Node built-ins outside `*.test.ts`, because both apps bundle it.
- `packages/data` (`@clube-do-jogo/data`): all Supabase table access for client code, behind `DataClient` (`src/client.ts`); API route contracts (`src/api-contracts.ts`); database types (`src/database.types.ts`). It may import only `@clube-do-jogo/domain` and `@supabase/supabase-js`.
- Web (`src/`): pages and components in `src/app` and `src/components`; route handlers in `src/app/api/**/route.ts`; server and browser infrastructure in `src/lib` (Supabase clients in `src/lib/supabase/`, push, IGDB, game cache, notes sync). The web builds its single `DataClient` in `src/lib/data.ts` (`createWebDataClient`); UI code gets it from `useApp().dataClient`.
- App (`apps/mobile`): Expo Router screens in `app/`, everything else in `src/` (imported as `@/…`, which in the app means `apps/mobile/src`). It builds its `DataClient` in `src/state/app-provider.tsx`. It must not import the web's `src/`; images under the root `public/` are shared on purpose.

Direct `supabase.from('table')` is allowed only in `packages/data`, `src/app/api/**` and `src/lib/**`. Web UI and the app go through `DataClient`. The one exception is the compare-and-set delete in `src/components/notes-chat.tsx`, which belongs to the formally verified notes sync (see the `formal-verify-notes-sync-web` skill before touching it). `rpc`, realtime channels and `auth` are still called directly from UI code.

### Where to make a common change

- Theme colour: `packages/domain/src/theme-palettes.ts`, then `npm run themes:generate`. The app reads the palette at runtime (`apps/mobile/src/theme/palette.ts`); the web reads the generated CSS. Theme id, name and availability are in `packages/domain/src/themes.ts`.
- User-facing name of a domain concept (vote choice, vote reason, status, role…): `packages/domain/src/labels.ts`. Import it; do not re-type the string in a component, or the two apps drift apart silently. `labels.test.ts` pins the wording, so update it in the same change.
- API route payload: change the route's entry in `packages/data/src/api-contracts.ts` (`apiRoutes`, `ApiContracts`) first. Handlers answer through `contractJson<'route-key'>()` from `src/lib/api-route.ts`, so the handler and every caller (web, app, `packages/data`) stop compiling until they match. `/api/push/worker` is outside the contract on purpose (only the cron calls it).
- Table query used by UI: add or change a method in `packages/data/src/client.ts` (plus the module it delegates to, e.g. `notes.ts`, `goty.ts`); both apps pick it up.

### Generated files

Do not edit these by hand.

- `src/app/theme-tokens.generated.css`: `npm run themes:generate`. `npm run test:domain` fails if it is stale.
- `packages/data/src/database.types.ts`: `scripts/generate-database-types.sh` (`--check` compares without writing). It applies the repo's SQL to a throwaway local Postgres and never connects to production; it needs `psql` and network access to download pinned tools. The SQL files and their order are the `SQL_STEPS` list in that script, so it only reflects SQL that is in the repo.

### Checks

From the root `package.json`:

- `npm run lint`: ESLint over the whole repo, including `apps/mobile` and `packages`.
- `npm run typecheck`: web (`tsconfig.web.json`). It includes `src/` and `packages/domain/src`, but not `packages/data/src` directly: data files are checked only as far as the web imports them.
- `npm run typecheck:mobile`: the app's `tsc` (also reaches the packages through its imports).
- `npm run test:domain`, `npm run test:data`, `npm run test:api`, `npm run test:mobile`: `tsx --test` suites (`packages/*/src/*.test.ts` and `tests/`). `tsx` does not typecheck.
- `npm run test:web` (Playwright) and `npm run build` also run in CI (`.github/workflows/workspaces.yml`), together with all of the above.

### SQL

- `schema.sql` is the base and the root `migration_*.sql` files are older migrations. The order in `README.md` is incomplete; the full order the type generator uses is `SQL_STEPS` in `scripts/generate-database-types.sh`.
- Every SQL file added since September 2026 is in `supabase/migrations/` as `YYYYMMDDHHMMSS_description.sql`. Put new migrations there with a later timestamp, add the file to the end of `SQL_STEPS`, and regenerate `database.types.ts`. Follow "Production data safety" above when applying it.
