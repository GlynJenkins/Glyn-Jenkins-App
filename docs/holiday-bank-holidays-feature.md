# Feature Brief — Bank Holidays + holiday for supervisor/contracts roles

**Two related changes to the management Holidays area:**
1. **Include the new roles** — Contracts Manager and Site Supervisor should appear in the holiday tracker so you can allocate leave to them (today it's admin/management only).
2. **Bank holidays** — highlight UK (England & Wales) bank holidays on the calendar, count leave in **working days** (excluding weekends and bank holidays), and account for bank holidays in the allowance so that e.g. an allocation of **35** with **8** bank holidays leaves **27** bookable days.

**Agreed rules (from Alex):**
- **Day counting = working days only** (Mon–Fri, excluding weekends AND bank holidays). This changes today's behaviour, which counts every calendar day — see Task 2.
- **Bank holidays = England & Wales** (~8 per year).
- **Allowance model:** `allocated_days` is the **total** entitlement (e.g. 35, including bank holidays). The system subtracts the year's bank holidays to get the **bookable** pool (e.g. 27). People book discretionary leave against the bookable pool.
- **Holiday year = calendar year (1 Jan–31 Dec), resets each 1 Jan** — this already works in the code; don't change it.

**Current code (for reference):**
- Holiday team is built in `src/lib/holidays/queries.ts` via `TEAM_ROLES = ['admin','management']`.
- Allowances: `management_holiday_allowances (worker_id, year, allocated_days)`, set via admin-only `PATCH /api/admin/holidays/allowances` — which also restricts the target to admin/management.
- Request day-count uses `daysInclusive(start,end)` in `src/lib/holidays/management.ts` (counts every calendar day) — this is what changes.
- Remaining = allocated − approved − pending, all keyed by calendar year.
- **No database migration is needed** — allowances stay as `allocated_days` (the total); bank-holiday subtraction is computed at read time.

**Repo context:** Next.js 15 App Router + Supabase, service-role server-side. Admin holiday pages guard with `requireAdminAccess()`; APIs with `verifyAdminApiAccess()`.

**How to use:** Save as `docs/holiday-bank-holidays-feature.md`, work through it in Cursor one task at a time.

---

## Task 1 — Bank holiday source (England & Wales)

**File (new):** `src/lib/holidays/bank-holidays.ts`

- Fetch the official free feed **`https://www.gov.uk/bank-holidays.json`** server-side, using the `england-and-wales` division. Cache it (Next.js `fetch(url, { next: { revalidate: 86400 } })` — refresh daily is plenty; the data changes once a year).
- Export `getBankHolidays(year)` → returns the events (`{ date, title }`) whose date falls in that calendar year, and `getBankHolidayDates(year)` → a `Set<string>` of `YYYY-MM-DD`.
- Export `bankHolidayCount(year)` → the number of those dates (the gov.uk feed already gives substitute weekday dates, so all count as working-day holidays).
- **Fail gracefully:** if the fetch fails, log it and return an empty list (the app must not break) — the allowance simply won't deduct bank holidays that render, and the calendar shows none, until the feed is reachable again. Consider a small hardcoded fallback for the current + next year as a safety net.

## Task 2 — Count leave in working days

**File:** `src/lib/holidays/management.ts` (+ callers in `queries.ts`)

- Add `countWorkingDays(startDate, endDate, bankHolidayDates: Set<string>)`: number of days from start to end **inclusive** that are Mon–Fri **and not** in `bankHolidayDates`.
- In `validateHolidayRequest` (and wherever a request's `days_requested` is computed/stored), replace `daysInclusive(...)` with `countWorkingDays(..., getBankHolidayDates(year))`.
- If a request works out to **0 working days** (e.g. someone selects only a weekend or a single bank holiday), reject it with a friendly message like "Those dates are already non-working days (weekend/bank holiday)."
- Keep `daysInclusive` if it's used purely for display of the date span; but the **allowance-consuming count** must be working days.

## Task 3 — Allowance maths with bank holidays

**File:** `src/lib/holidays/queries.ts` (`fetchHolidayAllowances`) + the `HolidayAllowanceRow` type

- For each worker, compute:
  - `allocated_days` = the stored total (default 25 today — you'll set 35 etc.)
  - `bank_holiday_days` = `bankHolidayCount(year)`
  - `bookable_days` = `allocated_days − bank_holiday_days`
  - `used_days` / `pending_days` = sums of `days_requested` (now working days) for approved / pending
  - `remaining_days` = `max(0, bookable_days − used_days − pending_days)`
- Return all of these so the UI can show the full breakdown. Update `validateHolidayRequest` to check against **`bookable_days`** (not raw allocated), so nobody can book into the bank-holiday portion.

## Task 4 — Include Contracts Manager & Site Supervisor

**Files:** `src/lib/holidays/queries.ts`, `src/app/api/admin/holidays/allowances/route.ts`

- Add `'contracts_manager'` and `'site_supervisor'` to `TEAM_ROLES` so they appear in the tracker and get allowance rows.
- In the allowances route, add the two roles to the allowed-target check (currently `['admin','management']`). Keep **setting** allowances admin-only (that guard stays).
- (These roles already exist — `add_supervisor_roles` migration is in place.) This is what lets you allocate holiday to them.

## Task 5 — Highlight bank holidays on the calendar

**File:** the team calendar component under `src/app/admin/holidays/_components/` (e.g. `HolidayTeamCalendar`)

- Pass the year's bank holidays (`getBankHolidays(year)`) into the calendar.
- Render each bank-holiday date with a **distinct style** (e.g. a subtle red/orange tint) and a **label/tooltip** with the holiday name ("Bank Holiday — Christmas Day"). A small legend entry ("■ Bank holiday") helps.
- Bank-holiday cells are non-bookable/already-off — make that visually obvious.

## Task 6 — Allowance UI + allocation screen

**Files:** the holiday tracker/allowance components under `src/app/admin/holidays/_components/`

- Where each person's allowance is shown, display the **full breakdown**: `Allocated (total) 35 · Bank holidays 8 · Bookable 27 · Used X · Pending Y · Remaining Z`. Make clear the bank holidays are auto-deducted.
- On the **allocation input** (where admin sets the number), label it clearly as the **total entitlement including bank holidays**, with helper text like "Bank holidays are deducted automatically — enter the full entitlement (e.g. 35)."
- Own-leave request UI (for the people booking) should show their **bookable / remaining** figure, not the raw allocated.

## Task 7 — Verify

- Set a manager's allowance to **35**. With 8 England & Wales bank holidays in the year, their **bookable = 27**; the breakdown shows 35 / 8 / 27.
- Book Mon–Fri of a normal week → **5 days** used. Book a week containing a bank-holiday Monday → **4 days** used (the bank holiday isn't counted).
- Try to book only a Saturday/Sunday or a single bank holiday → rejected as non-working days.
- The team calendar shows the 8 bank holidays highlighted with names.
- A **Contracts Manager** and a **Site Supervisor** now appear in the tracker and can be allocated holiday.
- On 1 Jan the year rolls over — last year's used days don't carry in (already handled by the calendar-year keys; just confirm the new year shows a fresh bookable pool).

---

## Notes
- **England & Wales only.** If you later take on staff in Scotland or Northern Ireland, their bank holidays differ — that'd need a per-worker region and pulling the other divisions from the same gov.uk feed. Out of scope here; say the word if it comes up.
- **Half days:** the field supports halves (`numeric(5,1)`) but the working-day counter returns whole days. If you ever want half-day bookings, that's a small extra — not included now.
- **No migration needed.** Everything is computed from the existing allowance total + the live bank-holiday feed.

## Suggested order
Task 1 → 2 → 3 (core maths) → 4 (roles) → 5 → 6 (UI) → 7 (verify). Commit each separately.
