# Feature Brief — Right to Work Register (compliance portal)

**Goal:** A dedicated admin **Right to Work register**: one audit-ready page listing every worker with their name, home address, the RTW method + document on file, and **who verified it, on what date and time** — filterable, exportable, and tracking **follow-up dates** for time-limited visas. This is the page you hand a Home Office auditor or a PLC client's compliance team to prove you've checked everyone.

**Builds on:** `docs/right-to-work-feature.md` (already deployed) — the RTW capture + "Mark verified" step already records `right_to_work_method`, `right_to_work_document_url`, `right_to_work_share_code`, `right_to_work_status`, `right_to_work_verified_at`, `right_to_work_verified_by`, `right_to_work_note`, plus the worker's `home_address`. This brief mostly surfaces and exports that, and adds follow-up-date tracking + a permanent check log.

**Why it's worth it:** the verify step protects you per worker; a register gives you (1) a single audit-ready evidence trail for the Home Office / Bellway, (2) instant sight of anyone unverified, and (3) — the genuinely new bit — **re-check reminders for time-limited right to work**, which is where employers most often lose the statutory excuse.

**How to use:** save as `docs/right-to-work-register-feature.md`, do the tasks in order, commit each separately.

---

## Task 1 — Database: follow-up dates + permanent check log

The one thing worth capturing that the single verify step doesn't: **when a check must be repeated**. British/Irish citizens have continuous right to work (no re-check). Visa holders have a date their permission expires — you must re-check before then or lose your protection.

```sql
alter table workers
  add column if not exists right_to_work_type text
    check (right_to_work_type in ('continuous','time_limited')),
  add column if not exists right_to_work_expiry date;   -- follow-up-by date for time_limited

-- Permanent, append-only log of every check / re-check (audit trail that survives edits)
create table if not exists right_to_work_checks (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id) on delete cascade,
  checked_by text not null,            -- name of the admin who verified
  checked_at timestamptz not null default now(),
  method text,                         -- passport / share_code / manual
  outcome text not null,               -- 'verified' | 'follow_up' | 'rejected'
  note text,
  document_url text,                   -- snapshot of the doc used at this check
  created_at timestamptz not null default now()
);
create index if not exists idx_rtw_checks_worker on right_to_work_checks (worker_id);
alter table right_to_work_checks enable row level security;
alter table right_to_work_checks force row level security;
```

- When someone clicks **"Mark right to work verified"** (from the RTW feature), also **insert a row into `right_to_work_checks`** — so you keep the full history (initial check + every re-check), even if the worker's current status is later changed. The worker row holds the *current* state; this table holds the *permanent record*.
- On the verify screen, if the person is a visa holder, capture `right_to_work_type = 'time_limited'` and the `right_to_work_expiry` (their permission end date). British/Irish/settled → `continuous`, no expiry.

## Task 2 — The register page

New page **`/admin/right-to-work`** (guard `requireAdminAccess`; supervisor roles inherit later), plus a **"Right to Work"** tile on the admin dashboard under a Compliance group.

- **Table**, one row per active/pending worker: **Name · Job role · Home address · Method (Passport / Share code / Manual) · Document (View) · Status (Verified / Pending / Follow-up) · Verified by · Verified date & time · Re-check by (expiry)**.
- **Status chips**, colour-coded: green Verified, amber Pending, red Follow-up needed, plus an **orange "Re-check due soon"** for time-limited checks within 30 days of expiry (and red if expired).
- **Filters / tabs:** All · Verified · Pending · Follow-up · **Expiring (≤30 days)** · Expired. Search by name.
- **Counts at top:** e.g. "38 verified · 3 pending · 1 expiring soon" — the at-a-glance compliance health.
- Each row's **View** opens the passport/document (signed URL) or the share code; clicking a worker deep-links to their profile to run/repeat the verification.
- Tapping a worker shows their **check history** (from `right_to_work_checks`) — the full "who checked, when, outcome" trail.

## Task 3 — Export (hand to auditor / client)

- **"Export register"** → Excel (`Right-to-Work-Register_{YYYY-MM-DD}.xlsx`): Name, Role, Address, Method, Status, Verified by, Verified date/time, RTW type, Re-check-by date. No bank/UTR/NI in this export — it's a compliance sheet, not payroll.
- Optional **"Compliance certificate" PDF** for a single worker or the whole site: branded, listing the check details + who verified — the tidy evidence pack a developer's auditor may ask for.

## Task 4 — Re-check reminders (the value-add)

- On the admin dashboard, a count/badge: **"N right-to-work checks due for re-check within 30 days"**, linking to the Expiring filter.
- (When email is verified / via SMS now) an optional weekly nudge to the office listing anyone whose right to work expires soon. In-app badge works regardless.
- A worker whose RTW has **expired** should show a hard red flag on their profile and in the register — losing track of a visa expiry is the classic compliance failure.

## Task 5 — Verify

- Register lists every worker with correct method, address, status, and verifier name + timestamp.
- Verifying a worker adds a `right_to_work_checks` row; the history shows it; re-verifying adds another.
- A time-limited worker with expiry in 20 days shows "Re-check due soon"; expired shows red; continuous shows no expiry.
- Filters and counts are correct; export opens cleanly (Numbers + Excel) with no payment data.
- Foreman logins can't reach the register, export or check log.

## Suggested order
Task 1 → 2 → 3 → 4 → 5. Commit each separately.

---

## Notes
- **Retention:** keep RTW records for the duration of employment/engagement plus the period your adviser recommends after they leave. The append-only `right_to_work_checks` table supports that; don't hard-delete checks.
- **Data minimisation / privacy:** the register is admin/management only, same as the rest of the sensitive area. Keep it out of foreman view and out of any worker-facing export.
- **Not legal advice:** the register helps you *evidence* compliance; the underlying method (and how long to retain) should be confirmed with your employment/immigration adviser and against client (Bellway) requirements.
- **No knock-on:** additive — reuses existing worker data + storage; adds two columns and one log table; independent of payroll/claims/QA/etc.
