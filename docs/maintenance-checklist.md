# Maintenance Checklist — Glyn Jenkins Workforce Portal

The hosting (Vercel, Supabase, Upstash, Resend) maintains itself. This checklist is the light, regular touch the **application** needs — mostly security updates and keeping an eye on things. Budget ~15–20 minutes a month.

---

## One-time setup (do these once)

- [ ] **Turn on Dependabot alerts + security updates** on GitHub: your repo → **Settings → Advanced Security** (or "Code security") → enable **"Dependabot alerts"** and **"Dependabot security updates."** (The `.github/dependabot.yml` file already added handles the scheduled monthly update PRs; this toggle is what delivers urgent *security* fixes automatically.)
- [ ] **Enable 2FA** on every account that touches the app: **GitHub, Vercel, Supabase, Upstash, Resend** (and Twilio if used). This is one of the highest-value security steps and takes 10 minutes.
- [ ] **Confirm Supabase daily backups** are on (comes with the Pro plan) so payroll data is recoverable.

---

## Every month (~15 min)

1. **Dependencies** — review any open **Dependabot PRs** in GitHub. Merge the grouped **patch/minor** PR after a quick sanity check. For a **major-version** PR, read its notes and test the key flows before merging. (Alternatively, in Cursor: run `npm audit` and apply fixes.)
2. **Errors** — skim **Vercel → your project → Logs/Observability** for repeating errors over the past month, and **Supabase → Logs** for failed queries. A recurring error is a bug worth fixing.
3. **Storage** — **Supabase → Storage**: check the `worker-documents` bucket size (ID docs + QA/firesock photos grow over time) against your plan limit. Also glance at database size.
4. **Health** — confirm the daily health-check is still green (you'll have been pinged if the site ever went down).

---

## Every quarter (~30–60 min)

- [ ] **Framework updates** — consider bumping Next.js / React / the Node runtime to the latest stable via Cursor, then **test the core flows**: worker registration, foreman claim submit, admin approve, and a payslip. Do this on a branch so it's easy to revert.
- [ ] **Access review** — check who has **Supabase dashboard** and **Vercel** access; remove anyone who has left. If the **service-role key** may have been exposed, rotate it.
- [ ] **Backup restore check** — confirm you could actually restore from a Supabase backup if you needed to.

---

## When a Dependabot **security** alert arrives (act promptly)

These matter most — they mean a package you use has a known vulnerability (exactly like the `xlsx` issue we fixed). Let Dependabot open its fix PR (or bump the package in Cursor), test, and deploy. **Don't sit on "critical" or "high" alerts.**

---

## When something breaks or a user reports a bug

Reconnect the project folder and either fix it in Cursor or ask Claude to review. Keep each change on its own commit so anything can be cleanly reverted.

---

## Numbers to keep an eye on (plan limits)

- **Supabase:** file storage (1 GB free / 100 GB Pro), database size, monthly egress.
- **Resend:** the daily email cap — watch it on a big payday when many payslips send at once.
- **Vercel:** you should be on **Pro** for commercial use regardless of traffic.

---

*Managed infrastructure updates itself; your code and its dependencies do not. This checklist keeps the maintenance side to a predictable, low-effort routine rather than something that surprises you.*
