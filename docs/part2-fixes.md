# Part 2 Fix Brief — for Cursor

**How to use this:** Save this file into the repo (e.g. `docs/part2-fixes.md`), open Cursor, and work through it **one numbered task at a time** — paste a task into the Cursor agent (or say "implement Task 1 from docs/part2-fixes.md"), review the diff, test, commit, then move to the next. Don't ask Cursor to do all of it in one shot; these touch payroll-critical code and each deserves its own review.

**Repo context to give Cursor if it asks:** Next.js 15 App Router + Supabase. All DB access uses the Supabase **service-role** key server-side (bypasses RLS), so authorization is enforced in code via the `verify*ApiAccess()` / `require*Access()` guards in `src/lib/auth/portal-access.ts`. Money is in pounds, rounded to pence. Do **not** change the auth model; just tighten input handling and transactions.

Tasks are ordered by priority. Tiers 1–2 are the ones that matter before real payroll; Tier 3 is hardening.

---

## TIER 1 — Critical (do first)

### Task 1 — Stop the cell-update route trusting the raw request body
**File:** `src/app/api/cells/[cellId]/route.ts`
**Problem:** the update spreads the whole JSON body (`.update({ ...body, ... })`), so any column (including `site_id`, `plot_number`, `stage_id`, `total_claimed_pct`) can be overwritten by the caller.
**Change:**
- Build an explicit, whitelisted update object — only the fields this route is meant to edit (e.g. `contract_value`, `current_balance`, and whatever the cell editor legitimately sets). Never spread `body`.
- Validate each numeric field server-side: must be a finite number; money fields `>= 0`; any percentage field `0–100`. Reject with 400 otherwise.
- After the update, check the affected row count; if zero rows matched the `cellId`, return 404 (currently a non-existent ID "succeeds" silently).
**Acceptance:** posting an unexpected field (e.g. `site_id`) does not change it; negative money or `total_claimed_pct: 999` is rejected; a bad `cellId` returns 404.

### Task 2 — Make the Excel grid import atomic
**File:** `src/app/api/sites/[siteId]/import/route.ts` (and `src/lib/sites/parse-excel-grid.ts`)
**Problem:** the import deletes all existing `price_grid` cells and `site_stages`, then re-inserts. A failure after the delete leaves the site's grid wiped or half-populated.
**Change (pick one):**
- **Preferred:** move the delete + insert into a single Postgres function (RPC) called via `supabase.rpc(...)` so it runs in one transaction, OR insert the new grid into staging rows and swap atomically.
- **Minimum viable:** fully parse and **validate the entire new grid in memory first**; only if validation passes do the delete + insert; and if any insert fails, restore/abort clearly. Never delete before the new data is validated.
- Also: validate `plotColIndex` / `headerRowIdx` are integers within the sheet's bounds (currently `parseInt` with no NaN/range check), and verify `siteId` exists before touching anything.
**Acceptance:** an import that fails on a bad row leaves the previous grid intact.

---

## TIER 2 — High (do before relying on the app for real work)

### Task 3 — Harden the Excel parser against text-as-money and bad files
**Files:** `src/lib/sites/parse-excel-grid.ts`, `src/app/api/sites/[siteId]/import/route.ts`
**Change:**
- In the value parser (the `parseFloat`-after-strip logic), only accept a cell as a numeric value if the cleaned string **fully matches** a number (e.g. `/^-?\d+(\.\d+)?$/`). Otherwise treat it as a note/blank. This stops "3 Bed House" importing as £3.
- Treat `contract_value === 0` as **present**, not empty, in the "cell has content" / dedupe logic (a real £0 cell is being dropped).
- When two cells map to the same `plot+stage` with **different** values, don't silently keep the last — collect these and return them in the import report as conflicts for the user to resolve.
- Enforce an upload **file-size limit and extension/MIME check** before reading the file.

### Task 4 — Address the `xlsx` dependency vulnerability
**File:** `package.json` + the import code
**Problem:** `xlsx@0.18.5` has known prototype-pollution (CVE-2023-30533) and ReDoS issues, and it parses user-uploaded files.
**Change (choose):**
- **Best:** migrate the import/export code to `exceljs` (actively patched), OR
- Switch to the vendored SheetJS build from their official CDN (not the npm `xlsx`), OR
- If neither is feasible now: keep `xlsx` but ensure Task 3's size/type limits are in place and restrict import to admins only (already the case) — and record this as accepted risk.
**Note for Alex:** this one may be a bigger change; it's fine to do it after Tasks 5–7 if needed, but don't ship real data through the importer long-term on the unpatched version.

### Task 5 — QA sign-off: bind the inspector to the logged-in user + keep history
**File:** `src/app/api/qa/inspections/route.ts` (and `src/lib/qa/generate-inspection-pdf.ts`)
**Problem:** inspector name/date/result/signature come from the form body; the authenticated user (`inspected_by`) is stored but never used for display; and the upsert overwrites a prior completed inspection with no audit trail.
**Change:**
- Use the **authenticated worker** (`auth.worker`) as the source of truth for who signed off. Either stop accepting `inspectorName` from the body and print the authenticated name on the PDF, or store both and reject/flag a mismatch.
- Constrain `result` to a fixed enum (`Pass` / `Fail`) — reject anything else.
- Instead of overwriting a completed inspection in place, keep an **immutable record**: insert a new versioned row (or block re-sign-off and require an explicit "re-inspect" that preserves the prior row). Preserve who/when/prev values.
**Acceptance:** the PDF and stored record always reflect the logged-in inspector; a re-inspection doesn't erase the previous sign-off.

### Task 6 — QA input & file hardening
**File:** `src/app/api/qa/inspections/route.ts`
**Change:**
- Validate `plotNumber` against the real plots for the site (there's a `fetchDistinctPlotNumbers`-style query) and **sanitise it** (reject `/`, `..`) before using it in any Supabase Storage key.
- Validate the `signature` file is a small PNG (check magic bytes + a size cap) before `embedPng`; return 400 if not.
- Add a **per-file byte-size cap and a max count** for uploaded photos before running them through `sharp`/heic-convert (the current pixel limit doesn't stop large byte payloads).
- On any failure partway through the uploads, **clean up** the objects already written (or upload to a temp path and commit atomically) so storage doesn't accumulate orphans.

### Task 7 — Fix PDF crashes on non-Latin characters (blocks registration)
**Files:** `src/lib/generate-subcontract-pdf.ts`, `src/lib/qa/generate-inspection-pdf.ts`, `src/lib/documents/pdf-letterhead.ts`, `src/lib/firesock/generate-plot-pdf.ts`
**Problem:** these use the standard WinAnsi font; `drawText` throws on any character outside Western-European encoding. For the **subcontract PDF this happens during worker registration**, so a new starter named e.g. *Łukasz* or *José* can't complete onboarding.
**Change:** embed a Unicode TrueType font via `pdf-lib` + `@pdf-lib/fontkit` (e.g. a bundled Noto/DejaVu font) and use it for all user-supplied text, OR sanitise/transliterate text to WinAnsi before drawing. Prefer embedding a font so real names render correctly.
**Acceptance:** a registration with an accented name generates the subcontract PDF successfully.

---

## TIER 3 — Medium / hardening

### Task 8 — Variations
**Files:** `src/lib/variations/vo-reference.ts`, `src/lib/variations/load-variation-register-rows.ts`, `src/app/api/admin/variations/create/route.ts`, `src/lib/variations/create-admin-variation.ts`, `src/app/api/variations/[id]/route.ts`, `src/app/api/variations/batch/route.ts`
- **VO numbers:** allocate and **persist** a `vo_number` when a variation is approved, and read that stored value in the register/export — instead of recomputing from `approved_at` order on every read (which renumbers earlier VOs when one is re-approved).
- **NaN lump sum:** in both the validator and `createAdminVariation`, reject non-finite amounts (`Number.isFinite(amount) && amount > 0`); `?? 0` does not catch `NaN`.
- **Claimed variations:** block a status change (e.g. to `rejected`) when `claimed_in_period_id` is already set, or surface a warning — otherwise a paid variation can vanish from the register.
- **Worker check:** when a foreman submits a variation line, verify the `worker_id` exists and is on their site/crew, not just that it's a UUID.

### Task 9 — Firesock: don't delete evidence photos on a read path
**File:** `src/lib/firesock/queries.ts`
**Problem:** the `syncFiresockPlots` routine deletes `firesock_plot_photos` (storage + DB) during read calls (`fetchFiresockSiteGrid` etc.). A page load can silently destroy uploaded fire-sock evidence.
**Change:** never delete existing photos on a read; move any purge to an explicit user-triggered action, and don't delete plots/photos that already have evidence attached.

### Task 10 — Worker Profile: escape output and mask sensitive fields
**File:** `src/app/admin/workers/[workerId]/_components/WorkerProfile.tsx`
- HTML-escape every interpolated value in the downloadable statement (`printStatement`) — worker name, UTR, site names — to prevent a name containing markup producing a booby-trapped file.
- Mask `utr_number` and `bank_sort_code` / `bank_account_number` (show last 4) rather than sending/rendering them in full, unless there's a clear operational need.

### Task 11 — Consistent authorization on pay-affecting settings
**File:** `src/app/api/admin/settings/route.ts`
- Decide whether **management** should be able to change fees / day rates / pay-cycle dates. Holiday allowances are already admin-only; make the pay-rate settings match that boundary (likely admin-only). Apply consistently.

### Task 12 — Shared cleanup: stop leaking DB errors + add input bounds
**Files:** across the API routes
- Add a small shared helper that logs the real error server-side and returns a **generic** message to the client. Replace the many `return NextResponse.json({ error: err.message })` / `error.message` returns with it.
- Add sensible **upper bounds** to numeric settings (fees, rates, allowances) so a fat-fingered `99999` is rejected.
- (Optional, performance) The dashboard summary endpoints for holidays / jetwash / firesock have N+1 query loops — batch them when convenient; not urgent.

---

## Things that are NOT Cursor tasks — you do these in Supabase

- **Confirm `variation_claims.total_amount` is a generated column** (`hours × rate_per_hour`). Supabase → Table editor → `variation_claims` → the `total_amount` column should show as *Generated*. If it isn't, the fix is a SQL migration (Cursor can write it, you run it): make it generated, or change the loaders to compute `hours * rate_per_hour`.
- **Add DB constraints from Part 1** if not already done: `UNIQUE(claim_allocation_id)` on `worker_cis_ledger`, and a partial unique index on `(foreman_id, period_start, period_end)` for non-rejected claims. Cursor can write these as `.sql` migration files; you run them in the SQL editor.
- Any RPC/transaction function from Task 2 is SQL Cursor writes and you run.

---

## Suggested commit sequence
1, 2 (critical) → 5, 6, 7 (QA + registration) → 3, 4 (import hardening) → 8–12 (medium). Commit and test each before the next; keep each task on its own commit so anything can be reverted cleanly.
