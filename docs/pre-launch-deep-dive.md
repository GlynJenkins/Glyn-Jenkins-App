# Glyn Jenkins Workforce Portal — Pre-Launch Deep Dive

**Date:** 21 August 2026
**Scope:** Full codebase (80 API routes, auth, payment maths, uploads, storage, config) + data-exposure review, ahead of opening enrolment.
**Bottom line:** The foundations are sound — every API route is access-controlled, the core CIS pay maths is correct, and file uploads are properly validated. But the review found **a cluster of real, launch-blocking issues**: one in how claimed work is tracked (can pay twice / never move the grid), several where sensitive worker data is over-exposed to the browser, a database security setting that depends on migration order, and an email sender that won't actually deliver to workers. **Do not open enrolment until the "Launch blockers" are fixed.** None are hard fixes; most are a few lines each.

How to read severities: **BLOCKER** = fix before anyone enrols or gets paid. **HIGH** = fix in the first week. **MEDIUM/LOW** = tidy up soon. Each item has the file, the real-world scenario, and the fix.

---

## ✅ What's solid (so you know the base is good)

- **Every one of the 80 API routes has an access guard**, and each guard is both called *and* its result checked — no unprotected endpoints, no admin action reachable by a foreman. Role logic (`canAccessAdmin`, `canAccessManagementArea`, foreman/jetwash) is consistent.
- **CIS pay calculation is correct** (`src/lib/cis/calculate-pay.ts`): 20% applied to post-fee taxable pay, employed roles (management/apprentice) exempt from admin+insurance fees, own-insurance waiver, deductions capped so net never goes negative, NaN/negative clamping.
- **Upload validation is genuinely good** (`src/lib/induction/upload-validation.ts`): real magic-byte checking, rejects SVG/HTML (no stored-XSS via uploads), enforces size caps. Filenames are server-generated UUIDs, so no path-traversal via user filenames.
- **Storage bucket is private** (`public: false`), accessed via short-lived signed URLs — no public file URLs anywhere.
- **The `/reveal` endpoint is done right**: admin-only, rate-limited per user, writes an audit row *before* returning, logs only IDs not values.
- **Foreman gang-pickers only select name + role** — no payment data crosses to the foreman side there.
- **`.env.local` is correctly gitignored and was never committed** — your Supabase service key, Twilio and Resend secrets are not in the repo history.
- **Password reset doesn't leak which emails exist** (returns success either way).

---

## 🚫 Launch blockers (fix before enrolment opens)

### B1. Claimed work is tracked as a whole-number percentage — money can be paid twice, or the grid never moves
**File:** `src/app/api/claims/route.ts:210` (and the mirror in reject/withdraw)
`total_claimed_pct` is stored as `Math.round((amount / fullValue) * 100)` — a rounded integer — and this is the **only** record of what's been claimed. Two consequences with real money:
- **Repeat-claim:** a £245 claim on a £50,000 lift is 0.49% → rounds to **0%** → the grid records nothing as claimed → the same £245 can be claimed and paid every fortnight, forever, with the lift never showing progress.
- **Drift on normal partial claims:** claim 75% of a £1,000 lift (£750), then 25% of what's left (£62.50 = 6.25% → records 6%) → the grid says 81% claimed but 81.25% has been paid; the leftover keeps drifting.

**Fix:** track claimed **value in pence** per cell (a `claimed_value` column), not a rounded percentage. Compute remaining from `contract_value − claimed_value`. Derive the display % from the values. This is the single most important fix in this report.

### B2. Claim tracking isn't concurrency-safe — two submissions can both claim the same lift
**File:** `src/app/api/claims/route.ts:205-218`, `src/lib/claims/validate-claim-pool.ts:82-121`
Validation *reads* `total_claimed_pct`, then (several queries later) the route *re-reads and writes* `current + added`. Between the read and the write there's no lock. Two foremen on the same site (or one foreman with two tabs / a double-tap) can both read "0% claimed", both pass validation for the full lift, and both get approved — the lift is paid twice. You proved the app blocks the *simple* double-claim in earlier testing, but that relied on the first claim already being committed; simultaneous submissions slip through.

**Fix:** make the claim atomic — a single conditional update (`UPDATE price_grid SET claimed_value = claimed_value + :x WHERE claimed_value + :x <= contract_value`) or a Postgres function/RPC that locks the row. Pairs naturally with B1.

### B3. Reject/withdraw can reverse an already-paid claim and free the lift for re-claiming
**Files:** `src/app/api/claims/[claimId]/reject/route.ts:66`, `src/lib/claims/delete-claim-period.ts:25-44`
The reject route checks `status = 'pending'` when it *reads* the claim, but the final update is `.eq('id', claimId)` with **no status condition** — and the percentage-reversal loop isn't guarded either. Scenario: admin A approves a claim (gang paid, ledger written, cells green); admin B's screen still shows it pending and they hit Reject → the percentages are wound back, the cells free up, the claim is stamped "rejected", and **the same lifts become claimable again → paid twice**. A double-tap on Reject/Withdraw similarly decrements the percentage twice.

**Fix:** gate every state change and every percentage reversal on `WHERE status = 'pending'` (or 'approved' for the approved path), so a claim that already moved on can't be reversed. Make the reversal idempotent.

### B4. Full bank details of the whole workforce are sent to the browser on the wages page
**File:** `src/lib/claims/load-wages-register.ts:30,259` → `src/app/admin/claims/page.tsx:98`
The wages-register row includes each worker's **full sort code and account number**, and the whole row array is passed into a client component (`WagesRegisterTable`) that doesn't even display them. That means every worker's bank details are serialised into the page's data payload and delivered to the browser — readable in devtools/view-source — completely bypassing the masked-and-audited `/reveal` design you specifically built. On a shared office Mac this is the workforce's entire payroll bank list, one keystroke away.

**Fix:** don't select or pass `bank_sort_code`/`bank_account_number` to the client. The bank CSV is already built server-side — the browser never needs the raw numbers. Strip them from the register row type and query.

### B5. Every worker's UTR is rendered in full on the workers list
**File:** `src/app/admin/workers/page.tsx:21` → `src/app/admin/_components/WorkerList.tsx:134`
The workers list selects `utr_number` in full and prints `UTR: {utr_number}` for every worker. The individual profile page carefully masks to last-4; the list page undoes that for everyone at once (and, like B4, ships it to the browser).

**Fix:** mask on the list (`••••7891`) exactly like the profile, or drop the UTR from the list entirely. Don't send full UTRs to the client.

### B6. Newer tables may ship with row-level security OFF, depending on migration order
**File:** `supabase/migrations/enable_row_level_security.sql` vs the per-table migrations
RLS is switched on by a bulk script that loops over existing tables *at the moment it runs*. Several tables created in their own migrations never enable RLS themselves: `jetwash_plot_status`, `firesock_plot_status`, `firesock_plot_photos`, `qa_plot_inspections`, `variation_developer_submissions`, `variation_developer_lines`, `management_holiday_allowances`, `management_holiday_requests`. If the RLS script runs *before* those (your `GO-LIVE.md` lists it as step 1), or any such table is added later, they ship with RLS **off** — and because the anon key is public in the browser bundle, their rows can be read directly from the Supabase REST API by anyone.

**Fix:** add `alter table … enable row level security;` to each table's own migration (belt-and-braces, `if not exists`-safe to re-run), and re-run the bulk RLS script **last** in your go-live order. Then verify: for each table, an anon-key REST read returns zero rows.

### B7. Worker emails (payslips, audit reports) won't actually send — sender is Resend's sandbox address
**File:** `.env.local` → `RESEND_FROM_EMAIL=onboarding@resend.dev`
`onboarding@resend.dev` is Resend's test sender. On it, email only delivers to *your own* verified address — **workers will not receive payslips, and site-audit emails to foremen will silently not arrive.** This looks fine in your own testing (you get yours) and fails for everyone else.

**Fix:** verify a domain in Resend (e.g. `glynjenkinsltd.co.uk`), set `RESEND_FROM_EMAIL` to something like `noreply@glynjenkinsltd.co.uk` (or a subdomain), and set it in Vercel's env vars, not just locally. Send a test to a non-company email address to confirm delivery before relying on payslips.

---

## 🔴 High (fix in the first week)

### H1. "Regenerate ledger" wipes custom deductions and reprices at today's fees
**File:** `src/app/api/claims/[claimId]/regenerate-ledger/route.ts:56-93`
Regenerating deletes all ledger rows for a claim and reinserts with `custom_deduction: 0` using current fee settings. If you approved a claim with, say, a £400 advance/damage deduction on a worker and later hit Regenerate to fix an unrelated detail, **the £400 deduction vanishes** and the worker is overpaid on the next export. The delete-then-insert also isn't transactional — a mid-way failure can leave some workers with no pay row at all.

**Fix:** carry `custom_deduction`/note forward on regenerate; snapshot the fees that applied at approval (store them on the claim) rather than re-reading current settings; wrap the delete+insert so a failure rolls back.

### H2. Ledger sync reprices historic claims with current fees
**File:** `src/lib/cis/ledger-sync.ts:149-169`
`calculatePayLine` is called without the custom-deduction argument and with *current* `admin_settings`. Running a sync to backfill an old fortnight after you've changed the admin/insurance fee writes the **new** fee onto the **old** claim, so the register disagrees with payslips already sent. Same root cause as H1 — pay should be computed from the fees in force when the claim was approved.

**Fix:** persist the fee values on each claim at approval time and always price from those.

### H3. Cached admin pages keep bank details on disk after logout
**File:** `next.config.ts` (PWA config) + `src/app/admin/_components/LogoutButton.tsx`
The PWA caches admin HTML into the browser's Cache Storage, and logout doesn't clear it. Combined with B4/B5 (which put bank numbers and UTRs into that HTML), a second person on a shared tablet can open devtools → Cache Storage after logout and read the cached payroll pages offline. Fixing B4/B5 removes the sensitive data from the cache; this item removes the cache itself.

**Fix:** on logout, call `caches.delete()` for the admin caches (and ideally don't cache pages that contain any personal data). Fixing B4/B5 is the more important half.

### H4. Bank CSV account numbers with a leading zero get corrupted if the file is opened in Excel
**File:** `src/lib/claims/payroll-csv.ts:50,150`
Account numbers are padded to 8 digits (e.g. `00123456`) and written as bare numbers with a BOM that makes Excel/Numbers auto-open them. Any worker whose account starts with 0 gets that zero stripped by the spreadsheet → payment to a wrong/invalid account. (This is the same class of issue we discussed about not editing the CSV — but here the file is *born* fragile.)

**Fix:** force the account and sort-code columns to text in the export — either quote as a text formula (`="00123456"`) or, better, offer the payroll export as `.xlsx` with those columns explicitly text-formatted. Belt-and-braces with the "never re-save the CSV" habit.

### H5. Worker allocations aren't checked against real workers
**File:** `src/app/api/claims/route.ts:160`, approve route `:100`
The claim validator checks allocation *amounts* sum correctly but never checks each `workerId` is a real, active worker on that foreman's gang. A malformed or spoofed allocation can name any UUID; and if a worker row is later deleted, approval silently skips them (`if (!worker) continue`) — the claim approves, cells go green, but that slice is paid to nobody, with no warning.

**Fix:** validate allocation worker IDs exist and are active (the variation routes already do this — reuse that check); at approval, if any allocation worker can't be resolved, fail loudly instead of skipping.

---

## 🟠 Medium

- **M1. Raw DB errors (with full row data) go to server logs.** `src/lib/api/route-error.ts:14` logs the raw Postgres error, which on constraint failures includes the failing row — bank/NI/UTR in cleartext — into Vercel logs. Client responses are already safely generic; sanitise what's logged too (log the error code/message, not the row).
- **M2. Company-logo upload trusts the client's content-type** (`.../settings/company/logo/route.ts:26`) — no magic-byte check (unlike the induction uploads) and the client-supplied type is reused as the stored content-type, so a file served as `text/html` from the storage origin is possible. Run it through the same `validateUpload` the other images use.
- **M3. Site-audit emails inject worker names into HTML unescaped** (`src/lib/site-audits/send-site-audit.ts:81`). A worker who registers with a name containing a link/markup gets that rendered inside a genuine company email. Escape names before interpolating (you already have an `escapeHtml` helper elsewhere).
- **M4. Over-limit audit PDFs are shared as 7-day signed links** (`send-site-audit.ts:68`) — a forwarded email exposes the PDF for a week; every other signed URL uses 1 hour. Shorten it, or require login to view.
- **M5. `admin_settings` is read inconsistently** — some places `limit(1)` with no `order`, others order by `updated_at`. If more than one settings row ever exists (the PATCH can insert), the fee the foreman is shown and the fee the server prices at can differ, causing penny-mismatch claim failures. Enforce a single settings row (unique constraint) or always order consistently.
- **M6. No custom security headers** (`next.config.ts` has none). Add `Strict-Transport-Security`, `X-Frame-Options: DENY` (or CSP frame-ancestors), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and disable `poweredByHeader`. Cheap hardening against clickjacking/sniffing.
- **M7. Approval isn't fully atomic on the error path** (`approve/route.ts:161-194`) — if the ledger insert throws (not just returns an error), the claim can be left `approved` with no pay rows and nothing flags it. Wrap approve+ledger in a transaction/RPC, or add a post-approve check that every allocation has a ledger row.

## 🟡 Low

- **L1.** No uniqueness on `(claim_period_id, worker_id)` — a duplicated allocation double-charges that worker's fees. Add a unique constraint.
- **L2.** Reject leaves `apprentice_holiday_ledger` rows behind (withdraw cleans them up) — an apprentice can lose holiday days from their allowance. Mirror the withdraw cleanup in reject.
- **L3.** Firesock photo upload is uncapped (`firesock/[siteId]/photos`) — no per-file size or count limit (QA caps at 20). Add a cap.
- **L4.** `date_of_pay` differs between approval (`period_end`) and sync/regenerate (`approved_at`) — cosmetic date disagreement on reconciliation. Pick one.
- **L5.** `gross` is stored unrounded — a foreman entering 3-decimal allocations can leave net a penny off. Round allocations to pence on the way in.
- **L6.** Dependency audit (`npm audit`) couldn't run in this environment (no registry access). **Run `npm audit --omit=dev` in Cursor** and update anything High/Critical before launch — this is the one check I couldn't complete for you.

---

## Suggested order of attack

1. **B7 + B6** first — they're config/ops (email sender, migration order), quick, and independent of code.
2. **B4, B5, H3, M1** — the data-exposure cluster; mostly removing fields from queries. High impact, low effort.
3. **B1 + B2 + B3 together** — the claim-tracking rework (value-in-pence + atomic update + status-guarded reversals). This is the biggest piece; treat it as one change with careful testing (single claim, split claim across two foremen, simultaneous submits, withdraw/reject races).
4. **H1, H2, H5, M7** — ledger/approval correctness.
5. **H4, M2–M6, L1–L6** — hardening and tidy-ups.
6. **L6** — run `npm audit` in Cursor.

I can turn any of these into a focused Cursor brief with the exact code changes — say which and I'll write them. Once B-items are fixed and deployed, I'll re-run this review and do a live end-to-end enrolment + claim + approval test in the browser before you send the link out.

*This review is static analysis plus targeted verification of the live code; it's thorough but not a formal penetration test. The money-path items (B1–B3, H1–H2) especially deserve a careful test pass in Cursor, as they touch how people get paid.*
