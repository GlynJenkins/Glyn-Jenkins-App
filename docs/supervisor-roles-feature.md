# Feature Brief — Contracts Manager & Site Supervisor roles

**Goal:** Add two new login roles — **Contracts Manager** and **Site Supervisor** — that, once approved, get a **cut-down management area** with access to only four things: **Quality checks, Jetwash, Firesock photos, and Holidays**. Everything else in the admin area (wages/booking-in, variations, production cost, manage sites, workers, settings) stays hidden and blocked for them.

**Agreed behaviour (from Alex):**
- Both roles are **identical** in access.
- They can **do the work**, not just view: complete QA sign-offs, mark plots washed in Jetwash, upload firesock photos.
- **Holidays:** they can **view the team calendar** and **request/manage their own leave**, but **cannot approve/reject** other people's requests.
- They are approved the same way as everyone else: they enrol → status `pending_verification` → an admin activates them.

**How to use:** Save as `docs/supervisor-roles-feature.md`, then work through it in Cursor one task at a time. Test after each.

**Critical security principle — do not violate:** the existing `canAccessAdmin(role)` (admin + management) must **stay** as the gate for all full-admin pages and APIs. The new roles get their own, narrower gate. Never add the new roles to `canAccessAdmin` — that's what keeps wages/variations/workers/settings locked to them.

---

## Task 1 — Define the roles and permission helpers

**File:** `src/lib/worker-access.ts`

- Add a constant: `export const SUPERVISOR_ROLES = ['contracts_manager', 'site_supervisor'] as const`.
- Update `needsPortalLogin(role)` to also return true for `contracts_manager` and `site_supervisor` (they log in).
- **Leave `canAccessAdmin(role)` unchanged** (`admin` / `management` only).
- Add new helpers:
  ```ts
  export function isSupervisorRole(role: string): boolean {
    return role === 'contracts_manager' || role === 'site_supervisor'
  }
  // Anyone allowed into the /admin area at all (full admins OR supervisors):
  export function canAccessManagementArea(role: string): boolean {
    return canAccessAdmin(role) || isSupervisorRole(role)
  }
  // The four areas supervisors are allowed to use:
  export function canAccessQa(role: string): boolean        { return canAccessManagementArea(role) }
  export function canAccessJetwashAdmin(role: string): boolean { return canAccessManagementArea(role) }
  export function canAccessFiresock(role: string): boolean  { return canAccessManagementArea(role) }
  export function canViewHolidays(role: string): boolean    { return canAccessManagementArea(role) }
  // Holiday APPROVAL stays admins-only:
  export function canApproveHolidays(role: string): boolean { return canAccessAdmin(role) }
  ```

## Task 2 — Add the roles to the database (Supabase — you run this)

The role column is almost certainly the `worker_role` enum. In Supabase → SQL Editor, run:
```sql
ALTER TYPE worker_role ADD VALUE IF NOT EXISTS 'contracts_manager';
ALTER TYPE worker_role ADD VALUE IF NOT EXISTS 'site_supervisor';
```
Cursor should also add this as a migration file `supabase/migrations/add_supervisor_roles.sql` for the record. **If** `workers.role` turns out to be a plain `text` column with a `CHECK` constraint instead, the fix is to update that constraint to include the two new values — Cursor can detect which and write the right migration. Either way, **this must be run in Supabase before the roles will save.**

## Task 3 — Add the restricted access guards

**File:** `src/lib/auth/portal-access.ts`

Add, mirroring the existing `requireAdminAccess` / `verifyAdminApiAccess` but using `canAccessManagementArea`:
- `requireManagementAreaAccess()` — for server components (pages). Redirects to `/login` if not logged in, `/pending-approval` if status isn't active, `/access-denied` if the role isn't admin/management/supervisor. Returns `{ user, worker }`.
- `verifyManagementAreaApiAccess()` — the API equivalent, returning 401/403 responses.

Keep the existing `requireAdminAccess` / `verifyAdminApiAccess` exactly as they are for the full-admin pages.

## Task 4 — Restricted dashboard (show only the four tiles)

**File:** `src/app/admin/page.tsx` (and whatever component renders the tile grid)

- Change the page guard from `requireAdminAccess()` to `requireManagementAreaAccess()` so supervisors can load it.
- Read the worker's role. Render tiles conditionally:
  - **Full admins (`canAccessAdmin`)** → all existing tiles (unchanged).
  - **Supervisors (`isSupervisorRole`)** → only **Quality checks, Jetwash, Roof firesocks, Holidays**. Hide Booking in, Variations, Production cost, Manage sites, Workers, Settings.
- Also hide the admin-only summary counts (pending variations/workers) from supervisors so the page doesn't render data they can't reach.

## Task 5 — Open the four areas to supervisors (pages + action APIs)

For each, change the guard from the admin-only one to allow the management area, and make sure the **action** endpoints accept supervisor roles (they "do the work"):

- **Quality checks** — `src/app/admin/qa/**` pages: use `requireManagementAreaAccess`. The QA inspection submit API (`src/app/api/qa/inspections/route.ts`): update its guard so supervisors can submit sign-offs. (Inspector identity still comes from the logged-in user — keep that.)
- **Jetwash** — `src/app/admin/jetwash/**` pages and the mark-washed API. The existing `verifyJetwashViewAccess` / `verifyJetwashMarkAccess` in `portal-access.ts` currently allow jetwasher + admin/management — **add the supervisor roles** to those so they can view and mark plots washed.
- **Firesock** — `src/app/admin/**` firesock pages and the firesock photo upload API (`src/app/api/firesock/[siteId]/photos/route.ts`). Allow supervisor roles to view and upload photos. Note: firesock upload is currently scoped to a foreman's assigned sites — for supervisors, allow **all sites** (they're not tied to `foreman_site_assignments`). Confirm the delete-photo route also accepts them if you want them to remove photos.
- **Holidays (view + own leave only)** — see Task 6.

## Task 6 — Holidays: view team calendar + own leave, no approvals

**Files:** `src/app/admin/holidays/**`, `src/app/api/admin/holidays/**`

- **Page:** guard with `requireManagementAreaAccess` so supervisors can open it. For supervisor roles, render the **team calendar/tracker in read-only mode** — hide the approve/reject buttons on other people's requests.
- **Their own leave:** let supervisors submit their own holiday request (a `management_holiday_requests` row for `worker_id = themselves`). Make sure the "submit request" API accepts supervisor roles but **forces `worker_id` to the logged-in user** (don't trust a worker_id from the body). They'll need a holiday allowance row — an admin sets that via the existing allowances screen.
- **Approvals stay admin-only:** the approve/reject requests API and the allowances API keep using `verifyAdminApiAccess` (via `canApproveHolidays`). A supervisor calling them gets 403.

## Task 7 — Make the roles assignable + labelled + routed

- **Assignable by admin:** in `src/app/api/admin/workers/[workerId]/route.ts`, add `'contracts_manager'` and `'site_supervisor'` to `ASSIGNABLE_ROLES` so you can promote a worker to these roles from their profile. (Since `needsPortalLogin` now includes them, promoting will prompt for a portal password like foreman/management do.)
- **Registration option (your choice):** decide whether new starters can self-select these roles on the public induction form, or whether only an admin can assign them. **Recommendation: admin-assign only** — don't add them to the public form's role list, so nobody can self-declare as a manager (even though activation still gates it). 
- **Friendly labels:** wherever roles are shown (worker list, worker profile, dashboards), map `contracts_manager` → "Contracts Manager" and `site_supervisor` → "Site Supervisor". Search for where existing roles get their display label and add these.
- **Post-login routing:** wherever the app decides where to send a user after login based on role, route `contracts_manager` and `site_supervisor` to `/admin` (they'll get the restricted dashboard from Task 4).

## Task 8 — Verify the lock holds (do this as the final check)

Log in as a test Contracts Manager (or Site Supervisor) and confirm:
- Dashboard shows **only** QA, Jetwash, Firesock, Holidays.
- They **can** do a QA sign-off, mark a plot washed, upload a firesock photo, view the holiday calendar, and request their own leave.
- They **cannot** reach — by clicking or by typing the URL directly — `/admin/claims`, `/admin/variations`, `/admin/sites`, `/admin/workers`, `/admin/settings`, or production cost. Each should redirect to `/access-denied` (pages) and the corresponding APIs should return 403.
- They **cannot** approve someone else's holiday request.

That URL-typing check matters most: it proves the protection is real access control, not just hidden buttons.

---

## Summary of the permission model (for reference)

| Area | Admin / Management | Contracts Manager / Site Supervisor |
|------|--------------------|--------------------------------------|
| Booking in / wages | ✅ | ❌ |
| Variations | ✅ | ❌ |
| Production cost | ✅ | ❌ |
| Manage sites / price grid | ✅ | ❌ |
| Workers | ✅ | ❌ |
| Settings | ✅ | ❌ |
| Quality checks | ✅ | ✅ (do sign-offs) |
| Jetwash | ✅ | ✅ (mark washed) |
| Firesock photos | ✅ | ✅ (upload) |
| Holidays — team calendar | ✅ | ✅ (view only) |
| Holidays — own leave | ✅ | ✅ (request) |
| Holidays — approve others | ✅ | ❌ |

## Suggested order
Task 1 → 2 (roles exist) → 3 → 4 (they can log in and see the right dashboard) → 5 → 6 (areas work) → 7 (assignable/labelled) → 8 (verify the lock). Commit each separately.
