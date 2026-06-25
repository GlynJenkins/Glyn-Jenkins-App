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

- [ ] Home page loads over HTTPS
- [ ] New worker registration (`/induction`) submits successfully
- [ ] Foreman login → dashboard → site grid → submit claim
- [ ] Admin login → approve/reject claim (check email/SMS)
- [ ] Forgot password → email → reset → login
- [ ] Add to Home Screen on iPhone (PWA manifest + icons)
- [ ] Admin settings: pay cycle dates save correctly

## 8. Still recommended before first real payday

- **Priority 2:** Payroll CSV export (backup if the app is down on payday)
- Monitor usage/errors in Vercel and Supabase dashboards

---

**Need help deploying?** Work through sections 1–3 first, then run the smoke tests in section 7.
