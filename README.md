# College Organizer

A single-tenant organizer for coursework, extracurricular commitments, and social plans. The app uses Next.js 16, React 19.2, Tailwind CSS 4, Supabase, and TypeScript.

## Organizer features

- Expandable subtasks with independent completion and progress counts.
- Read-first calendar details for dates, times, locations, notes, and checklist progress.
- Classes-only syllabus import from pasted text or a selectable-text PDF, with an editable duplicate-aware preview.
- JSON backup export and restore, Canvas calendar review, and recurring semester events.

## Requirements

- Node.js 22 or newer (`node-ical` requires Node 22+)
- pnpm 11 (the repository pins the package-manager version)
- A Supabase project

## Local setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Open `.env.local` and paste the four values from your Supabase project and database settings. The file already exists locally and is gitignored.

3. Verify the configuration:

   ```bash
   npm run verify-env
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

The required environment variables are:

- `NEXT_PUBLIC_SUPABASE_URL`: the Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the browser-safe Supabase publishable key.
- `SUPABASE_SECRET_KEY`: the server-only Supabase secret key used by trusted ingestion and seed work. Never expose it to browser code or commit it.
- `DATABASE_URL`: the PostgreSQL connection string used only by the migration runner.

The verifier prints only whether each value is set and whether each connectivity check passed. It never prints credentials.

## Database migrations

SQL migrations live in `supabase/migrations/` and are applied in filename order. After Stage 1 adds the initial migration, run:

```bash
npm run migrate
```

The migration runner connects with `DATABASE_URL`, records each applied filename and checksum in `public._migrations`, and skips unchanged files on later runs. If an applied file changes, the runner stops and asks for a new migration instead of silently replaying edited SQL.

Do not paste migrations into the Supabase dashboard. All current and future migrations should be added as ordered `.sql` files and applied with `npm run migrate`.

## Development seed

Populate the app with realistic tasks and recurring semester events:

```bash
npm run seed
```

Every seeded row has one fixed `import_batch_id`, so reset deletes only this script's data. Reset asks for confirmation and prints the exact row count; use `--yes` only when you intentionally want to skip the prompt:

```bash
npm run seed -- --reset
npm run seed -- --reset --yes
```

## Canvas sync

Stage 1 adds `POST /api/sync-ical`. Canvas sync is always two-phase: first request a read-only preview, review every proposed change, and only then apply the action IDs you approve. After Stage 2, the sidebar's **Sync Canvas** flow provides the normal interface.

For local API use, run the app and request a preview (replace the URL with your Canvas feed):

```bash
curl -sS http://localhost:3000/api/sync-ical -H 'content-type: application/json' --data '{"icalUrl":"https://canvas.example.edu/feeds/calendar.ics","mode":"preview"}'
```

The preview response shape is:

```json
{
  "ok": true,
  "mode": "preview",
  "planId": "sha256 hash",
  "planHash": "sha256 hash",
  "expandedRecurrences": 0,
  "truncated": false,
  "counts": { "create": 0, "update": 0, "adopt": 0, "unchanged": 0 },
  "actions": [],
  "skipped": { "noUid": 0, "noSummary": 0, "cancelled": 0 }
}
```

Applying requires the returned `planId` and `planHash` plus only the action IDs you approved. The server fetches and compares the feed again; a stale plan receives HTTP 409 without writes.

## Verification

Run the required checks before each stage report:

```bash
npx tsc --noEmit
npm run build
```

With the built app running locally, `npm run verify-stage1` performs the temporary, self-cleaning Canvas preview/apply/stale-plan database scenario used by the Stage 1 gate.
