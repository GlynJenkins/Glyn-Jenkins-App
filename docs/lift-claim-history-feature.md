# Feature Brief — Who Built What: lift claim history on the price grid

**Goal:** Management can see **who claimed every lift** on a site, years after the fact. On the admin price grid: **hover (desktop) or tap (phone) any claimed cell** → a popover showing which foreman claimed it, when, what %, and the claim it belongs to. **Tap a plot number** → the full build history of that plot ("who built plot 30") across all stages. Plus an export for warranty/dispute queries.

**Where the data lives (no new recording needed):** every fortnightly claim row (`claim_periods`) already stores `foreman_id`, `site_id`, `period_start/end`, `submitted_at`, `status`, and `pool_items` — the JSON list of grid cell ids with the % and value claimed from each. Attribution = invert that: cell → list of (claim, foreman, pct, value, date, status). `price_grid.total_claimed_pct` / `cell_color` stay untouched — this is read-only surfacing.

**How to use:** save as `docs/lift-claim-history-feature.md`, do the tasks in order, commit each separately.

---

## Task 1 — History API

`GET /api/admin/sites/[siteId]/claim-history` (guard `verifyAdminApiAccess`):

- Load all `claim_periods` for the site (any status except withdrawn/rejected — but include them flagged, see below) with `id, foreman_id, period_start, period_end, submitted_at, status, pool_items`, join foreman name from `workers`.
- Server-side, build `{ [cellId]: [{ claimId, foremanName, pct, value, periodStart, periodEnd, submittedAt, status }] }` by walking each claim's `pool_items`. Sort each cell's entries oldest-first.
- Include **pending and approved** claims as normal entries; include **rejected/withdrawn** ones only with a `voided: true` flag (they explain why a cell went back to white, and sometimes "who claimed this then withdrew it" is exactly the question).
- Defensive parsing: `pool_items` is JSON that has evolved — skip malformed entries rather than failing the whole response, and tolerate cells that no longer exist (grid re-imports).
- Response can be large on old sites — cache-control private, no-store is fine; it's an admin page.

## Task 2 — Grid popover (the hover/tap)

On the **admin site price grid** (Manage sites → site grid):

- Fetch the history map alongside the grid (or lazily on first hover/tap).
- **Desktop:** hovering a claimed cell (orange/blue/green) shows a tooltip; **mobile:** tapping the cell opens the same as a small popover (dismiss by tapping elsewhere). Content, one line per claim:
  - **"Dave Jones — 50% (£1,240) · w/e 14 Jun 2025 · Approved"**
  - Multiple partial claims stack chronologically, so a cell claimed 25% + 75% by different gangs shows both.
  - Voided entries greyed with "(withdrawn)" / "(rejected)".
- Unclaimed (white) cells: no popover.
- Keep it read-only and light — no layout shift, works inside the existing horizontal-scroll grid.
- **Do not add this to the foreman grid** — foremen shouldn't study each other's money. Admin/management only (supervisor roles inherit later via their guard).

## Task 3 — Plot history ("who built plot 30")

- Tapping the **plot number** (row header) on the admin grid opens a **Plot history** panel/modal: every stage for that plot in build order, each showing stage name, value, and its claim entries (foreman, %, date, status) from the same map — or "Not yet claimed".
- Header answers the question at a glance: **"Plot 30 — built by: Dave Jones (Joist, Plate), Sam Price (Pre-plaster, CML)"** — the distinct foremen with the stages they claimed.
- Include a link to each claim's detail page for the paper trail.

## Task 4 — Export

- On the site grid, an **"Export build history"** button → Excel (`Build-History_{SiteCode}_{YYYY-MM-DD}.xlsx`): one row per cell-claim — Plot, Stage, Foreman, %, Value, Period, Submitted date, Status. Sorted by plot then stage then date.
- This is the file you hand a developer/NHBC/solicitor when a warranty question lands on a plot built three years ago.

## Task 5 — Verify

- On a test site with: a lift claimed 100% by one foreman, a lift split 25/75 across two foremen, and a withdrawn claim → hover/tap shows the right names, percentages, dates and states on all three.
- Plot history for a finished plot lists all stages with the right foremen; "built by" summary correct.
- Excel export matches the popovers.
- Works on iPhone (tap), desktop (hover), and inside the scrolling grid.
- Foreman grid shows **no** attribution anywhere; the history API rejects foreman tokens.

## Suggested order
Task 1 → 2 → 3 → 4 → 5. Commit each separately.

---

## Notes
- **Why compute from `pool_items` instead of a new table:** the history already exists for every claim ever made — a new table would need backfilling and could drift. Computing server-side from the source of truth means day one it works for the whole build history, including everything claimed before this feature existed.
- If old sites ever make the endpoint slow (hundreds of claims), add a materialised `cell_claim_history` view then — the UI won't change.
- Pairs naturally with QA: an inspection failure on a plot + this popover = who to send back, with dates.
