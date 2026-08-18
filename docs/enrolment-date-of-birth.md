# Cursor Brief — Add Date of Birth to Enrolment

**Goal:** Collect every worker's date of birth during enrolment, store it, and show it on their admin profile. Applies to **all roles** (trades and employed alike — DOB is standard payroll/HR data).

**Repo context:** induction form `src/app/induction/page.tsx`, API `src/app/api/induction/route.ts`, admin profile `/admin/workers/[workerId]`. Follow the existing patterns for a required field + the missing-column fallback.

**How to use:** save as `docs/enrolment-date-of-birth.md`, do the tasks in order, commit each separately.

---

## Task 1 — Database

Alex runs in the Supabase SQL editor (nullable — existing workers won't have one yet):

```sql
alter table workers add column if not exists date_of_birth date;
```

## Task 2 — Induction form

- Add a required **"Date of birth"** field in the personal-details section (next to name/NI number), using `<input type="date">` exactly like the CSCS expiry field (plain ISO `YYYY-MM-DD` value — no `Date` objects, no display formatting; keep it iOS-safe).
- Zod validation:
  - Required: "Enter your date of birth."
  - Must be a valid past date.
  - **Minimum age 16**: "You must be at least 16 to register." (school leaving age — apprentices can be 16).
  - Sanity cap: reject dates implying age over 100.
- Append to the FormData as the ISO string.

## Task 3 — Induction API

- Parse and re-validate server-side (same rules — never trust the client).
- Save to `workers.date_of_birth` in the insert.
- Add `date_of_birth` to the missing-column fallback (`missingOptionalCol` regex + legacy-row strip) so enrolment still succeeds if the migration hasn't run yet, same as the other newer columns.

## Task 4 — Admin display

- **Worker profile** (`/admin/workers/[workerId]`): show DOB in the personal-details card, formatted `5 Aug 1990` with age in brackets — "5 Aug 1990 (36)". Show "Not on file" for pre-existing workers without one.
- **Under-18 flag:** if a worker's age is under 18, show a small amber **"Under 18"** badge on their profile and in the workers list — young workers have extra site restrictions and the office needs to spot them at a glance.
- DOB is personal data like NI/bank details — show it only in the admin/management area, never on foreman-facing screens.
- (Optional, nice-to-have) Allow admin to add/correct a DOB on existing workers via the same edit route used for the firesock certificate upload.

## Task 5 — Verify

- Register a new worker with a DOB → saves, shows on the profile with the right age.
- Try an under-16 DOB → blocked with the clear message; a 17-year-old registers fine and gets the amber badge.
- Try a future date and a 120-year-old date → both rejected, friendly messages.
- Existing workers' profiles show "Not on file" without errors.
- Works on iPhone Safari (native date wheel) and desktop.
- A registration still succeeds if the DB column is missing (fallback path), just without the DOB saved.

## Suggested order
Task 1 → 2 → 3 → 4 → 5. Commit each separately.
