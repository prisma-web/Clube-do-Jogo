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
