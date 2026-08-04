# Pre-Enrolment Hardening Brief — for Cursor

**Why this exists:** These three items harden the **public worker-registration path** (`/api/induction` + the induction form). They don't matter while only you are testing, but they matter the moment you issue the enrolment link to the whole workforce — that's when the public form goes from private to exposed. Close these **before** sending the link out.

**How to use:** Save as `docs/pre-enrolment-fixes.md`, then in Cursor do one task at a time — "implement Task 1 from docs/pre-enrolment-fixes.md" — review the diff, test, commit, move on.

**Repo context for Cursor:** Next.js 15 App Router + Supabase. `/api/induction` is intentionally public (new starters have no login) — it's listed in `PUBLIC_API_PREFIXES` in `src/middleware.ts`. It uses the Supabase **service-role** key. Do **not** make it require auth; the goal is to keep it public but abuse-resistant. Uploads currently go to the private `worker-documents` bucket via an `uploadFile` helper inside `src/app/api/induction/route.ts`.

Do them in order — Task 1 and 2 are the security ones, Task 3 is compliance.

---

## Task 1 — Rate-limit the public registration endpoint

**Files:** `src/app/api/induction/route.ts` (and apply the same limiter to `src/app/api/auth/forgot-password/route.ts`, the other public endpoint)

**Problem:** No rate-limiting or bot protection. A script can hammer the endpoint to create unlimited worker rows, Supabase Auth users, and file uploads.

**Change — pick ONE approach:**

- **Preferred (proper limiter):** add `@upstash/ratelimit` + `@upstash/redis` (free tier is fine), keyed on client IP. Reject with HTTP 429 when the limit is exceeded. A sane limit for a registration form is e.g. **5 submissions per IP per 10 minutes** and a small global ceiling. Put the limiter in a shared `src/lib/rate-limit.ts` and call it at the top of both public routes.
  ```ts
  // pseudo-shape
  const { success } = await ratelimit.limit(clientIp)
  if (!success) return NextResponse.json({ error: 'Too many attempts. Please try again shortly.' }, { status: 429 })
  ```
- **Add a CAPTCHA instead of / as well as** — Cloudflare Turnstile is free and simple: add the widget to the induction form, and verify the token server-side at the start of the route before doing any work. This stops bots specifically.
- **Minimum viable (no new service):** an in-memory or Supabase-table counter keyed by IP + a short window. Weaker (resets on redeploy, per-instance) but far better than nothing.

**Get the client IP** from the `x-forwarded-for` header (Vercel sets it). Take the first IP in the list.

**Acceptance:** rapid repeated POSTs from one IP start returning 429 (or fail the CAPTCHA check); a normal single registration still works.

---

## Task 2 — Validate uploaded files server-side (type + size)

**File:** `src/app/api/induction/route.ts` (the `uploadFile` helper and the calls that read `cscsCard`, `idDocument`, `insuranceCert`, `signature`)

**Problem:** The route accepts any uploaded file — any type, any size. The client `accept="image/*,.pdf"` is cosmetic and bypassable. A large or malicious file lands straight in storage.

**Change:**
- Define allowed MIME types: images (`image/jpeg`, `image/png`, `image/heic`, `image/webp`) and `application/pdf` for the document/CSCS/insurance; the signature should be `image/png` only.
- Define a per-file size cap (e.g. **10 MB** for documents, **1 MB** for the signature).
- Before uploading each file, validate: it exists, `file.type` is in the allowed set, and `file.size` is within the cap. Reject with a clear 400 (e.g. "ID document must be a PDF or image under 10 MB.") if not.
- Don't trust the filename for the extension — derive it from the validated MIME type when building the storage path.

**Acceptance:** a 50 MB file or a `.exe` renamed to `.pdf` is rejected with a 400; a normal photo/PDF still uploads.

---

## Task 3 — Add a privacy notice + consent to the registration form

**Files:** `src/app/induction/page.tsx` (form UI) and `src/app/api/induction/route.ts` (store consent)

**Problem:** The form collects bank details, NI, UTR and ID scans with no privacy notice or consent. Under UK GDPR, Glyn Jenkins Ltd is the data controller for this and needs to tell people what's collected, why, and for how long.

**Change:**
- Add a short **privacy notice** near the submit button (a paragraph or an expandable panel): what's collected (personal, bank, tax, ID documents), why (to set the worker up for CIS payroll and site access), who it's shared with (HMRC / the company's payroll), how long it's kept, and who to contact. Keep it plain-English.
- Add a **required consent checkbox** ("I confirm the information is accurate and I consent to Glyn Jenkins Ltd storing it for payroll and compliance") that must be ticked before the form can submit.
- On the server, record consent: store a `consent_given_at` timestamp (add the column via a small migration) when the record is created, so you have a record that consent was captured.

**Acceptance:** the form can't be submitted without ticking consent; the privacy text is visible; a `consent_given_at` timestamp is saved with the worker.

---

## Bonus (same route, quick win while you're here)

**Orphaned-file cleanup on failure** — in `src/app/api/induction/route.ts`, files are uploaded to storage *before* the worker row is inserted. If the insert fails, the auth user is cleaned up but the uploaded files are left behind. Add cleanup: on the insert-failure path, delete the files that were already uploaded (you have their storage paths), or upload only after a successful insert.

---

## Not a Cursor task — do this in the product

- **Confirm the enrolment link isn't guessable/over-shared.** The form is public by necessity; rate-limiting (Task 1) is the real protection, but also avoid posting the raw URL anywhere public.
- **Have the privacy-notice wording checked** by whoever handles your compliance/HR — Cursor can place the text, but the exact wording and retention period are a business decision.

## Suggested order
Task 1 (rate-limit) → Task 2 (file validation) → Task 3 (privacy/consent) → Bonus. Each on its own commit. All three should be done before the enrol link goes to the workforce.
