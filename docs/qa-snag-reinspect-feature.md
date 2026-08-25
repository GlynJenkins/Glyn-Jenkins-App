# Feature Brief — Quality Checks: snag & re-inspection loop

**Goal:** Turn Quality Checks from a pass/fail stamp into a proper close-out loop. When an inspection isn't perfect, management raises an **itemised snag list**, it's sent to the **foreman** to rectify, the foreman ticks off each item (with a photo), it comes back to the **management side** (Management / Contracts Manager / Site Supervisor) for **re-inspection**, and only a clean re-inspection turns the cell **green**. The grid colour tells you at a glance whose court the ball is in.

**Current state (what exists):** `qa_plot_inspections` already stores a `result` ('Pass'/'Fail'), `form_data`, photos, signature, PDF, and there's a history table (`add_qa_inspection_history.sql`) that archives the prior inspection on re-inspect. **Problem:** the cell goes **green on any completed inspection — even a Fail** (grid colours by `status='completed'`, ignoring `result`). Foremen currently have **no QA visibility at all**. This brief fixes both.

---

## The colour model (traffic light — the "best way to show it")

Four states, so anyone glancing at the grid knows the status and who's responsible:

| Colour | State | Meaning | Whose action |
|---|---|---|---|
| **Grey/white** | `not_inspected` | No inspection yet | — |
| **Green ✓** | `passed` | Inspected, no outstanding snags | Done |
| **Red** | `failed_open` | Inspected, snags raised, sent to foreman | **Foreman** to fix |
| **Amber** | `awaiting_reinspection` | Foreman marked all snags done | **Management** to re-inspect |

Red = foreman's problem, amber = management's problem, green = closed. (This refines your "orange if problems" idea: red for *needs fixing*, amber for *fixed, waiting on us* — so you can instantly separate "chase the foreman" from "go re-inspect".)

**How to use:** save as `docs/qa-snag-reinspect-feature.md`, do the tasks in order, commit each separately.

---

## Task 1 — Database

Add an inspection **state** and a **snags** table. (Keep the existing `result` column for the PDF/history; derive state from it + snag completion.)

```sql
alter table qa_plot_inspections
  add column if not exists inspection_state text not null default 'passed'
    check (inspection_state in ('passed','failed_open','awaiting_reinspection'));

create table if not exists qa_inspection_snags (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references qa_plot_inspections(id) on delete cascade,
  round int not null default 1,               -- 1 = first fail, 2 = failed again after re-inspect...
  description text not null,
  raised_photo_path text,                     -- management's photo of the defect
  fixed boolean not null default false,
  fixed_at timestamptz,
  fixed_photo_path text,                       -- foreman's photo of the fix
  fixed_note text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_qa_snags_inspection on qa_inspection_snags (inspection_id);
alter table qa_inspection_snags enable row level security;
alter table qa_inspection_snags force row level security;
```

Backfill existing rows: `update qa_plot_inspections set inspection_state = case when result = 'Fail' then 'failed_open' else 'passed' end;`

## Task 2 — Inspection form: Pass vs Fail-with-snags

In the QA inspection modal (`QaInspectionGrid.tsx` + `api/qa/inspections`):

- On result **Pass** → `inspection_state = 'passed'`, cell green (as now).
- On result **Fail** → require **at least one snag**: a repeatable "Add snag" list, each with a **description** (required) and an optional **photo** (reuse the inspection photo upload). Save these to `qa_inspection_snags` with `round = current round`. Set `inspection_state = 'failed_open'`.
- Keep the existing signature/PDF generation — the PDF now includes the snag list (Task 5).
- **Notify the foreman** (the site's assigned foreman/foremen): in-app (Task 4 pop-up + badge) and, when email/SMS is live, a message "Quality inspection — Plot 14 Pre-plaster has {n} items to action." Send-failure never blocks the save.

## Task 3 — Foreman side: see snags, fix, tick off

Foremen currently have no QA view — add one, scoped to their **assigned sites only** (`verifyForemanApiAccess`):

- On the foreman's site card, a **"Quality snags"** entry with a red badge showing the count of open items across that site.
- Opens a list grouped by plot/stage, each showing the snag description + management's photo, and for each item a **"Mark done"** control with an optional **photo of the fix** and note.
- When the foreman has ticked **all** snags for an inspection → that inspection flips to **`awaiting_reinspection`** (amber), and management is notified "Plot 14 Pre-plaster is ready for re-inspection." A foreman can't set it green themselves — only mark items fixed.
- Foreman API: `GET /api/foreman/qa-snags?siteId=`, `POST /api/foreman/qa-snags/[snagId]/fix` (guarded, assigned-site check).

## Task 4 — Management side: re-inspection + visibility

- **Grid colours** driven by `inspection_state` (Task 1 table). Amber cells are the re-inspection queue.
- A cell in `failed_open` or `awaiting_reinspection` opens the inspection showing the **snag list with each item's status** (open / fixed, with both photos side by side — defect vs fix).
- **Re-inspect action** (any management-side user — Management / Contracts Manager / Site Supervisor, per your choice; not limited to the original inspector):
  - **All good** → `passed`, cell green. Records the re-inspector + timestamp; archives the round to history.
  - **Still not right** → raise a new round of snags (round + 1), back to `failed_open` (red), foreman notified again. This handles the "failed twice" case cleanly.
- **Site QA summary** shows counts: Passed / Awaiting re-inspection (amber) / With foreman (red) — so a supervisor planning a site visit sees exactly what's waiting for them.
- A small **"Re-inspection due"** indicator on the admin QA dashboard tile (count of amber cells across all sites).

## Task 5 — PDF & history

- The inspection PDF gains a **Snags** section: each item, its round, the defect photo, and — once fixed — the fix photo, note, and who signed it off. A re-inspected pass shows the full close-out trail (raised → fixed → re-inspected), which is exactly what a developer/NHBC wants to see.
- Every round is retained in `qa_inspection_history` so the story of a plot that failed, was fixed, and passed is never lost.

## Task 6 — Verify

- Fail an inspection with 3 snags → cell **red**, foreman notified, foreman sees 3 items.
- Foreman fixes 2 → still red; fixes the 3rd → cell **amber**, management notified.
- Management re-inspects, passes → **green**, PDF shows raised+fixed+re-inspected trail.
- Management re-inspects, fails again → new snag round, back to **red**.
- Grey for never-inspected; site summary counts correct; admin tile shows re-inspection-due count.
- Foreman only sees snags for assigned sites; a non-assigned foreman and the foreman API both reject others' sites.

## Suggested order
Task 1 → 2 → 3 → 4 → 5 → 6. Commit each separately.

---

## Notes
- **Why red *and* amber, not one colour:** the whole value of the loop is knowing whose action is outstanding. One colour for "not perfect" would leave you unable to tell "waiting on the gang" from "waiting on us" at a glance — which is the exact thing you're trying to see.
- **Supervisor roles:** this lives in the management area, so Contracts Manager / Site Supervisor get it automatically once their access is switched on — they're often the ones doing the re-inspection.
- SQL migrations (Task 1) run in Supabase; the rest is code. Notifications degrade gracefully until the email domain is verified — in-app badges/pop-ups work regardless, SMS works now.
