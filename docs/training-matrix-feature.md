# Feature Brief — Training Matrix (management side) — v2

**Updated** to include the new self-logged enrolment data: each worker now selects a **trade Qualification** and provides a **Health & Safety (SSSTS/SMSTS)** qualification when they enrol.

**Goal:** A **Training Matrix** page on the management side listing every **active** worker with their name, trade, qualification, CSCS card, and H&S qualification — colour-coded for CSCS expiry, with Excel + PDF export.

**Columns to show:** Name · Trade (role) · **Qualification** · CSCS Card Number · CSCS Expiry · **H&S (SSSTS/SMSTS)**.

**Agreed behaviour:**
- **Qualification column = the worker's logged `bricklayer_qualification`** — one of: NVQ 1, NVQ 2, NVQ 3, City and Guilds, In training (Apprentice), N/A Labourer, N/A Other. (Keep a separate **Trade** column showing their role — Bricklayer, Labourer, etc. — for context.)
- **H&S (SSSTS/SMSTS) column** — status from `hs_qualification_url` / `hs_qualification_na`:
  - has a certificate on file → **"On file"** (with a link to view it)
  - `hs_qualification_na = true` → **"N/A"**
  - neither → **"Not provided"**
  There is **no expiry** captured for the H&S qualification, so it's a presence status, not a date.
- **CSCS expiry colour-coding:** expired = red, expiring within 60 days = amber, valid = green, no card = grey "Not provided". Count summary at the top.
- **Export:** Excel (.xlsx) and PDF of the current matrix.
- **Always current:** shows only `status = 'active'`, newest enrolment first. New starters appear automatically; setting a worker **Inactive** removes them with no extra code. **Don't build a separate sync/removal step — the active filter is the mechanism.**

**Data model (all already exists on `workers` — no migration needed):**
`first_name`, `surname`, `role`, `cscs_number`, `cscs_expiry_date`, `bricklayer_qualification` (the Qualification dropdown value), `hs_qualification_url` (SSSTS/SMSTS certificate storage path), `hs_qualification_na` (boolean), `status`, and the enrolment timestamp. The qualification options live in `src/lib/induction/qualifications.ts` (`TRADE_QUALIFICATIONS`). The Worker Profile page (`src/app/admin/workers/[workerId]/_components/WorkerProfile.tsx`) already displays these fields — reuse its patterns (including how it makes a signed URL to view the H&S certificate).

**Repo context:** Next.js 15 App Router + Supabase, service-role server-side. Management pages guard with `requireAdminAccess()`, APIs with `verifyAdminApiAccess()`. Spreadsheets use `xlsx`; PDFs use `pdf-lib` + the shared `embedPdfFonts`/letterhead helpers.

**How to use:** This replaces the earlier `docs/training-matrix-feature.md`. Work through it in Cursor one task at a time.

---

## Task 1 — Data loader

**File (new):** `src/lib/training/load-training-matrix.ts`

- Query `workers` where `status = 'active'`, selecting: `id, first_name, surname, role, cscs_number, cscs_expiry_date, bricklayer_qualification, hs_qualification_url, hs_qualification_na` and the enrolment timestamp.
- Sort **newest enrolment first**.
- For each row compute:
  - **CSCS status** from `cscs_expiry_date` vs today: `missing` (no number/expiry) / `expired` (past) / `expiring_soon` (≤ 60 days) / `valid`.
  - **H&S status**: `on_file` (has `hs_qualification_url`) / `na` (`hs_qualification_na = true`) / `not_provided` (neither).
  - **Trade label** from `role` (reuse the existing role-label helper).
  - **Qualification** = `bricklayer_qualification` (show as-is; it's already a clean value). If blank, show "—".
- If you want the H&S "view" link to work in the table, generate a **signed URL** for `hs_qualification_url` here (as WorkerProfile does), or expose a small endpoint the row calls on click — signed URLs expire, so generating on demand is cleaner than baking them in.
- Return `{ rows, summary }` where `summary` counts: `total`, and for CSCS `expired` / `expiringSoon` / `valid` / `missing`, and for H&S `hsMissing` (a "chase these" number).
- Put the 60-day threshold in a named constant.

## Task 2 — The Training Matrix page

**File (new):** `src/app/admin/training/page.tsx` (+ a client table component)

- Guard with `requireAdminAccess()`, `export const dynamic = 'force-dynamic'`.
- Header: title "Training Matrix", a **summary row** (e.g. "3 CSCS expired · 5 expiring soon · 42 valid · 8 missing SSSTS/SMSTS"), and the two **export buttons**.
- Table columns:
  1. **Name** (first + surname)
  2. **Trade** (role label)
  3. **Qualification** (`bricklayer_qualification`)
  4. **CSCS Card Number**
  5. **CSCS Expiry** (formatted `DD Mmm YYYY`) with a **colour badge** (red/amber/green/grey)
  6. **H&S (SSSTS/SMSTS)** — "On file" (with a **View** link to the certificate), "N/A", or "Not provided" (amber-ish, since it's worth chasing)
- (Nice-to-have) a sort toggle: "newest first" vs "CSCS expiry soonest first" (handy for chasing renewals). Default newest first.

## Task 3 — Dashboard tile

**File:** `src/app/admin/page.tsx`

- Add a **"Training Matrix"** tile linking to `/admin/training`, subtitle "CSCS, quals & SSSTS/SMSTS". Admin/management visibility.
- Optional: a red badge on the tile if any active worker has an **expired CSCS** card.

## Task 4 — Excel + PDF export

**File (new):** `src/app/api/admin/training/export/route.ts`

- Guard with `verifyAdminApiAccess()`. `format` query param: `xlsx` or `pdf`. Rebuild rows via the Task 1 loader.
- **Excel (`xlsx`)** columns: Name / Trade / Qualification / CSCS Number / CSCS Expiry / CSCS Status / H&S (SSSTS/SMSTS). Filename `training-matrix-<date>.xlsx` (stamp date server-side).
- **PDF (`pdf-lib` + shared fonts/letterhead):** same columns as a branded table.
- **Compliance data only** — Name, Trade, Qualification, CSCS number/expiry, H&S status. **Do NOT include bank/NI/UTR.** For H&S, export the **status text** ("On file" / "N/A" / "Not provided"), not the document itself.

## Task 5 — Verify

- Enrol/activate a worker who selected e.g. "NVQ 2" and uploaded an SSSTS certificate → they appear at the top with Qualification "NVQ 2" and H&S "On file" (View link opens the cert).
- A worker who marked H&S as N/A shows "N/A"; one who somehow has neither shows "Not provided".
- A past CSCS expiry shows red; within 60 days amber; counts at the top match.
- Set a worker **Inactive** → they disappear from the matrix.
- Excel + PDF download, contain the qualification and H&S columns, and **contain no bank/NI/UTR**.
- `/admin/training` is admin/management only (redirects to login when logged out).

---

## Notes
- **Who can see it:** admin/management. If you later want the Contracts Manager / Site Supervisor roles to see it, add `/admin/training` to their allowed areas.
- **If H&S ever needs an expiry:** SSSTS/SMSTS certificates are typically valid ~5 years. You didn't capture an expiry at enrolment, so the matrix treats H&S as presence-only. If you want expiry tracking on it later, add an `hs_qualification_expiry` column + a form field, and the matrix can colour-code it exactly like CSCS. Say the word and I'll spec that.

## Suggested order
Task 1 → 2 → 3 → 4 → 5. Commit each separately.
