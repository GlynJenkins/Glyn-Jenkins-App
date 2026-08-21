# Pre-Launch Deep Dive — Re-check (Round 2)

**Date:** 21 August 2026
**Scope:** Verified each fix from the first review against the actual updated code (fresh snapshot, commit `0678cab`).
**Verdict:** **All 7 launch blockers are fixed in code — and the hardest one (how claimed work is tracked) is done properly.** One blocker (email sender) needs a live confirmation from you that I can't see from the code. Two "high" items still need a touch. Once the email test passes, you're clear to open enrolment from a security/correctness standpoint.

---

## Launch blockers — re-checked

### ✅ B1. Claim money tracking — FIXED (well)
`price_grid` now has a **`claimed_value` in real money** (pence-accurate `numeric(14,2)`), backfilled from existing percentages. The grid still shows a % but it's *derived* from the money, not the source of truth. The £245-on-a-£50k-lift repeat-claim hole is closed — remaining is computed from `contract_value − claimed_value`, so a tiny claim can no longer round to 0%. Migration: `supabase/migrations/price_grid_claimed_value.sql`.

### ✅ B2. Concurrency — FIXED (properly)
Claims now go through a Postgres function `apply_price_grid_claim` that does `SELECT … FOR UPDATE` (a real row lock) and rejects if `claimed + amount > contract`. Two simultaneous submissions can no longer both claim the same lift — the second waits for the lock and then fails with "insufficient remaining value". This is exactly the right fix.

### ✅ B3. Reject/withdraw can't reverse a paid claim — FIXED
The reject route now flips status with `.eq('status','pending')` **and** only reverses the grid if a row was actually flipped — so a reject racing an approval changes nothing, and a double-tap reverses once. Withdraw and `delete-claim-period` are guarded the same way and use the atomic release function. Idempotent and safe.

### ✅ B4. Bank details no longer sent to the browser — FIXED
The wages page now passes rows through `toPublicWagesRegisterRows()`, which strips `payeeSortCode`/`payeeAccountNumber` before they reach the client component. The bank CSV is still built server-side. Verified the client table never receives the raw numbers.

### ✅ B5. UTR masked on the workers list — FIXED
The list now maps to `utr_masked` (`••••7891`) and renders that — full UTRs no longer leave the server.

### ✅ B6. Row-level security on all tables — FIXED (thoroughly)
A new migration `enable_rls_later_tables.sql` enables **and `force`s** RLS on all 8 previously-exposed tables (jetwash, firesock, QA, developer variations, holiday tracker), using `if exists` so it's order-safe. The newer feature tables (site audits, toolbox talks, sensitive_reveals) each enable RLS in their own migration. `force row level security` is stronger than what I asked for — good. **Go-live check:** after running migrations, do the anon-key REST read test on 2–3 of these tables to confirm zero rows come back.

### ⚠️ B7. Email sender — FIXED IN CODE, needs your live confirmation
The hardcoded `onboarding@resend.dev` sandbox fallback is gone from the code (now falls back to a real address). **But two things I can't verify from here:**
1. **Your local `.env.local` still says `RESEND_FROM_EMAIL=onboarding@resend.dev`.** That's only your dev machine — what matters is the **Vercel** env var. Confirm Vercel's `RESEND_FROM_EMAIL` is set to a **verified domain** address, not the sandbox.
2. **Domain mismatch to check:** the code's fallback address is `payroll@glynjenkins.co.uk`, but your company domain is `glynjenkins**ltd**.co.uk`. If the domain you verified in Resend is `glynjenkinsltd.co.uk`, then `payroll@glynjenkins.co.uk` will **fail to send**. Make the `RESEND_FROM_EMAIL` match the domain you actually verified.

**The test that settles it:** trigger one real email (a test payslip or the built-in test-email route) to an address that is **not** your own company email — a personal Gmail, say. If it arrives, B7 is truly done. If it doesn't, the sender/domain still needs fixing. Don't rely on payslips until this passes, because it looks fine when you email yourself.

---

## High items — re-checked

- **✅ H1. Regenerate ledger** now reads and preserves each row's existing `custom_deduction` instead of zeroing it. Your £400-deduction scenario is safe.
- **✅ H3. Logout** now clears all PWA caches, so cached admin pages don't linger on a shared machine (and B4/B5 mean they no longer contain bank/UTR data anyway).
- **✅ H5. Allocations** are now validated — allocation worker IDs are checked to exist and be active/pending before a claim is accepted.
- **🟡 H2. Ledger sync** still prices with *current* fees and doesn't carry a custom deduction — **but** it now only ever fills in ledger rows that are entirely *missing* (a backfill), so it can't wipe an existing deduction. Residual risk is small: an allocation that never got a ledger row, backfilled after a fee change, would use today's fee. Worth a note, not a blocker. If you want it airtight, snapshot the fee values onto the claim at approval and price from those.
- **🟡 H4. Bank CSV leading zeros** — the fix wraps sort code and account in quotes. Important nuance: **quoting alone does not stop Excel/Numbers stripping a leading zero if someone opens and re-saves the file.** The *raw* file is correct, so uploading it straight to the bank (without opening it) is safe — which is the workflow anyway. If your bank process ever involves opening the CSV first, switch to the `.xlsx` export or `="00123456"` text format. Keep the "never open-and-resave the bank CSV" rule.

## Still open from the first review (mediums — tidy-ups, not blockers)

- **M1.** Server logs still print the raw DB error (`route-error.ts`), which on a constraint failure can include row data. Client responses are safely generic; just the server log to tighten. Log `err.code`/`err.message`, not the whole error object.
- **M6.** No custom security headers in `next.config.ts` yet (HSTS, X-Frame-Options/CSP, nosniff, Referrer-Policy, disable `poweredBy`). Cheap hardening — worth adding.
- (M2 logo upload validation, M3 audit-email name escaping, M4 7-day signed link, M5 settings single-row — I didn't individually re-verify these this round; they weren't in the fix set. Fold them into the next tidy-up pass.)

---

## Where this leaves you

The dangerous stuff — paying twice, over-claiming a lift, leaking the workforce's bank details — is **properly resolved**, and the claim-money rework was done the right way (money-accurate, row-locked, idempotent) rather than patched. That's the outcome you wanted before enrolment.

**Before you send the enrolment link:**
1. Run the **live email test** to a non-company address (settles B7).
2. Do the **anon-key RLS spot-check** after migrations (confirms B6 in the live DB).
3. Run **`npm audit --omit=dev`** in Cursor (the dependency check I can't run here).

Do those three and you're clear. I'm happy to do a live end-to-end pass in the browser once you've cleared the test data and loaded the real sites — enrol a worker, submit a claim, approve it, check the payslip and the bank CSV — as the final gate before go-live.

*Re-check method: static verification of each fix against the updated code, including reading the new SQL function and the reject/withdraw/wages/worker-list changes directly. The money paths deserve one more real test pass in the app (single claim, split claim across two foremen, simultaneous submit, withdraw-vs-approve race), which I can drive live when you're ready.*
