# Go-live checklist — Glyn Jenkins Workforce Portal

Use this before running real payroll through the app.

## 1. Deploy to Vercel

1. Push the repo to GitHub (if not already).
2. Import the project at [vercel.com/new](https://vercel.com/new).
3. Set **Framework Preset** to Next.js.
4. Add all environment variables from `.env.example` (see below).
5. Deploy — note your production URL (e.g. `https://portal.glynjenkins.co.uk`).

## 2. Environment variables (Vercel → Settings → Environment Variables)

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Server only** — never expose to client |
| `RESEND_API_KEY` | Yes | Password reset + rejection emails |
| `RESEND_FROM_EMAIL` | Yes | **Verified domain** (not `onboarding@resend.dev`) |
| `TWILIO_ACCOUNT_SID` | Optional | SMS notifications |
| `TWILIO_AUTH_TOKEN` | Optional | |
| `TWILIO_MESSAGING_SERVICE_SID` | Optional | |
| `ALLOW_LEGACY_ADMIN` | No | **Leave unset in production** — blocks Supabase-only accounts without a worker row |

Copy `.env.example` as a template.

**Common Vercel build error:** `Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL` on `/login` — the Supabase URL variable is missing, empty, or malformed. In Vercel → **Settings → Environment Variables**, set `NEXT_PUBLIC_SUPABASE_URL` to your full project URL (e.g. `https://abcdefgh.supabase.co`), with no quotes or trailing spaces. Enable it for **Production** and **Preview**, then redeploy.

**Common runtime error:** `500 MIDDLEWARE_INVOCATION_FAILED` on login — usually missing Supabase env vars on Vercel, or an older middleware build using the service-role key on the Edge runtime. Ensure all three Supabase variables are set and redeploy after any middleware fix.

**Login says “Could not reach the server”:** open the live site’s login page source (or redeploy logs) and confirm the Supabase URL is exactly `https://YOUR-PROJECT.supabase.co` — a typo like `ttps://…` (missing `h`) or a missing `https://` prefix will break browser login. Fix the variable in Vercel and **redeploy** (`NEXT_PUBLIC_*` values are baked in at build time).

## 3. Supabase configuration

### Authentication → URL Configuration

- **Site URL:** `https://your-production-domain.com`
- **Redirect URLs** (add all that apply):
  ```
  https://your-production-domain.com/**
  https://your-production-domain.com/auth/confirm
  http://localhost:3000/**
  http://localhost:3001/**
  ```

### Database migrations

Run any pending SQL in `supabase/migrations/` via the Supabase SQL editor (e.g. pay cycle settings).

### Backups

In Supabase → **Project Settings → Database**, confirm daily backups are enabled on your plan.

### Row Level Security

The app uses the **service role** on the server for most operations. Ensure RLS policies remain in place as a second layer.

## 4. Resend (email)

1. Add and verify your company domain in [resend.com/domains](https://resend.com/domains).
2. Set `RESEND_FROM_EMAIL` to e.g. `portal@yourdomain.com`.
3. Test forgot-password and claim rejection emails to real addresses.

## 5. Admin accounts (production)

- **Do not** set `ALLOW_LEGACY_ADMIN=true` unless you still need a one-off Supabase-only owner account.
- Create **management** users via worker registration + admin activation, or link existing workers with portal passwords.
- Each admin/foreman should have their **own login** — no shared credentials.

## 6. Security hardening (implemented in code)

- All `/api/*` routes require login except `/api/induction` and `/api/auth/forgot-password`.
- Admin API routes require **management/admin** role (or legacy owner if explicitly allowed).
- Test routes (`/api/test-email`, `/api/test-sms`) return **404 in production**.
- Legacy admin bypass (auth user with no `workers` row) is **disabled in production** by default.
- Foremen can only submit claims/variations for **assigned sites**.

## 7. Post-deploy smoke test

Production URL: **`https://glyn-jenkins-app.vercel.app`**

**Status: Go-live ready (6 Jul 2026)** — migrations applied, env vars confirmed, dry-run payday complete, iPhone PWA installed.

### Automated checks (6 Jul 2026)

| Check | Result |
|-------|--------|
| Home page over HTTPS | Pass — HTTP 200, HSTS enabled |
| `/login` loads | Pass — staff login form renders |
| `/induction` loads | Pass — full registration form renders |
| PWA manifest + icons | Pass — `/manifest.webmanifest`, `/icon`, `/apple-icon` all HTTP 200 |
| Offline fallback | Pass — `/~offline` HTTP 200 |
| Test routes blocked in prod | Pass — `/api/test-email` and `/api/test-sms` return 404 |
| Auth routes protected | Pass — `/admin` and `/foreman` redirect (307) when logged out |
| Read-only foreman claim route | Pass — `/foreman/claim/[id]` deployed (redirects to login) |

### Manual checks

| Stage | Task | Status |
|-------|------|--------|
| 1 | Supabase migrations (`run-all-pending.sql`) | Done |
| 2 | Vercel environment variables confirmed | Done |
| 3 | Logged-in smoke test (foreman + admin flows) | Done |
| 4 | iPhone PWA — Add to Home Screen | Done |
| 5 | End-to-end payday dry run (claim → approve → Bank CSV) | Done |
| 6 | Forgot password email + reset | Done |

Optional extras:

- [ ] **Induction submit** — test registration on `/induction` (skip if you don’t want test data in production)
- [ ] **Email/SMS** — confirm Twilio SMS on approve/reject (if Twilio configured)

### Vercel environment variables

Confirmed in **Vercel → glyn-jenkins-app → Settings → Environment Variables** (Production + Preview) — 6 Jul 2026.

| Variable | Required | Status |
|----------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Confirmed |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Confirmed |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Confirmed |
| `RESEND_API_KEY` | Yes | Confirmed |
| `RESEND_FROM_EMAIL` | Yes | Confirmed |
| `TWILIO_*` | Optional | As configured |
| `ALLOW_LEGACY_ADMIN` | No | Unset in production |

### Supabase migrations

**Applied** — `supabase/migrations/run-all-pending.sql` run successfully in Supabase SQL Editor (6 Jul 2026).

Includes worker induction columns, apprentice `national_insurance` on the ledger, management holidays, and developer variation tables.

## 8. First real payday

**Ready.** Use this flow each fortnight:

1. Foreman submits claim (before apply-by day)
2. Admin approves on **Pending claims**
3. **Booking In** — check totals, edit apprentice tax/NI if needed
4. **Bank CSV** — import to your bank
5. **Excel** — keep as backup/archive if needed

Monitor usage/errors in Vercel and Supabase dashboards around payday.

---

**Need help deploying?** Work through sections 1–3 first, then run the smoke tests in section 7.
