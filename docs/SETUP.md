# Setup

## Requirements

- Node.js ≥ 20.9 (tested with Node 22)
- A Supabase project (free tier is sufficient to start)
- Optional for tests: PostgreSQL 16 binaries (`initdb`, `pg_ctl`) and Chromium for Playwright

## 1. Install

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where to find it | Exposed to browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same (anon / publishable key) | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | same (service_role / secret key) | **never** |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally | yes |
| `CRON_SECRET` | any long random string | no |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional, for decision e-mails | no |

## 2. Database

Apply the migrations in `supabase/migrations/` in filename order. All objects are created in the **`waktusolat` schema**, so the project can be shared with other apps. Afterwards add `waktusolat` to **Settings → Data API → Exposed schemas**. Either (dedicated project only):

```bash
npx supabase link --project-ref <your-ref>
npx supabase db push
```

or paste each file into the Supabase SQL editor in order:

1. `20261115000100_core_schema.sql` – tables, constraints, triggers
2. `20261115000200_functions_and_rls.sql` – helpers, business functions, RLS, grants
3. `20261115000300_zones_storage.sql` – JAKIM zones, storage buckets
4. `20261115000400_system_settings_audit.sql` – audit trigger

## 3. Supabase Auth settings

- **Authentication → Providers → Email**: enable, **Confirm email = ON**.
- **Authentication → URL Configuration**: Site URL = your site URL (leave unchanged in a shared project); add `http://localhost:3000/auth/callback` and `https://waktusolat.vercel.app/auth/callback` to Redirect URLs.
- Recommended: set a custom SMTP provider (the built-in mailer is rate-limited) and a minimum password length of 10.

## 4. Create the Master Super Admin (once)

```bash
MASTER_EMAIL=you@example.com MASTER_PASSWORD='a-long-strong-password' MASTER_NAME="Nama Anda" \
  npm run bootstrap:master
```

The script uses the service-role key from `.env.local` (export it or prefix it). The public registration form can never create a master; `bootstrap_master()` is executable by `service_role` only.

## 5. Run

```bash
npm run dev
```

- `http://localhost:3000/register` – register a mosque
- `http://localhost:3000/login` – log in (master → `/master`, mosque admin → `/admin`)
- `http://localhost:3000/<slug>` – public TV display

Prayer times are fetched from JAKIM e-Solat on demand (first display load for a zone) and daily by the cron route. To trigger manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily
```

## 6. Tests

```bash
npm run test          # unit tests (no services needed)
npm run test:db       # starts a throwaway PostgreSQL 16 on port 54329 and runs DB tests
npm run build
npm run test:e2e      # Playwright, starts `next start` on port 3100
```

`scripts/test-db.sh stop` shuts the test database down. The DB tests run the real migrations against PostgreSQL with a small stub of the Supabase `auth`/`storage` schemas and roles (`tests/db/supabase-stub.sql`).
