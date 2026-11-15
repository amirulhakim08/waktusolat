# Deployment

Target: **https://waktusolat.vercel.app** on Vercel, with Supabase as the backend. Nothing in this repository has been deployed yet — the steps below require your Supabase and Vercel accounts.

## Checklist

### Supabase

1. Create a project (region **Southeast Asia (Singapore)** recommended).
2. Apply `supabase/migrations/*.sql` in order (`npx supabase db push` or the SQL editor).
3. Auth → Email provider: **Confirm email ON**. URL configuration: Site URL `https://waktusolat.vercel.app`; Redirect URL `https://waktusolat.vercel.app/auth/callback`.
4. Auth → SMTP: configure a real SMTP provider for verification e-mails (the default mailer is heavily rate-limited).
5. Storage: confirm buckets `media` (public) and `registration-documents` (private) exist (created by migration 3).
6. Realtime: enabled by default. Displays use **public broadcast channels** `display:{mosque_id}`; if you disable "Allow public access" for Realtime, displays fall back to 60-second polling.
7. Run the advisors (Database → Advisors) and resolve any warnings.

### Vercel

1. Import the GitHub repository; framework preset **Next.js**.
2. Environment variables (Production + Preview):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL=https://waktusolat.vercel.app`, `CRON_SECRET`, optionally `RESEND_API_KEY` and `EMAIL_FROM`.
3. Project name `waktusolat` so the default domain is `waktusolat.vercel.app` (if the name is taken, Vercel assigns a different subdomain — verify, and update `NEXT_PUBLIC_SITE_URL` and Supabase redirect URLs accordingly).
4. `vercel.json` sets region `sin1` and a daily cron at 16:05 UTC (00:05 Malaysia time) calling `/api/cron/daily`. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.
5. Deploy, then bootstrap the master once from your machine:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
   MASTER_EMAIL=... MASTER_PASSWORD=... MASTER_NAME="..." npm run bootstrap:master
   ```

### Post-deployment verification

- [ ] `GET /api/time` returns JSON.
- [ ] Register a test mosque → verification e-mail arrives → application appears in `/master/approvals`.
- [ ] Approve → applicant can log in at `/admin`.
- [ ] Upload an image, publish → `/<slug>` shows it within seconds (Realtime) or ≤ 60 s (polling).
- [ ] `/<slug>` shows today's prayer times without warnings (confirms e-Solat access from Vercel).
- [ ] Trigger the cron once manually and check the JSON response for each zone.
- [ ] Use `/admin/prayer-mode` → "Mulakan Mod Solat Sekarang" and watch a TV switch.

## Error logging

Server errors are written with `console.error` and appear in Vercel → Logs. Database errors are visible in Supabase → Logs. For alerting, add a log drain or an APM integration in Vercel.

## Security notes

- The service-role key is only imported in `server-only` modules (`src/lib/supabase/admin.ts`).
- Security headers are set in `next.config.ts`; dashboards cannot be framed by other sites.
- Rate limits: registration 5/hour/IP, login 10/15 min per e-mail and 30/15 min per IP, uploads 60/hour/user, heartbeats 4/min/session.
