# Feature Brief — Cost to Complete (per site)

**Goal:** Show a **Cost to Complete** figure for each site: the site's total value, how much has been claimed (drawn down) so far, and how much value is left to complete. It updates automatically as claims are made against the site.

**The maths (all from data the app already holds):** every price-grid lift has a full value (`price_grid.contract_value`) and a claimed percentage (`price_grid.total_claimed_pct`, which rises as claims are booked in and is reversed on reject/withdraw). So per site:
- **Site total** = Σ `contract_value` across the site's cells.
- **Claimed to date** = Σ `contract_value × total_claimed_pct / 100`.
- **Cost to complete (remaining)** = Site total − Claimed = Σ `contract_value × (100 − total_claimed_pct) / 100`.
- **% complete** = Claimed ÷ Site total.

This is the same `contract_value` / `total_claimed_pct` data the claim validator already uses, so it's reliable and needs **no new tables or migration**.

**Decisions baked in (from Alex — change if needed):**
- **Grid only.** Site total = the price grid. Approved **variations are NOT** folded into the total in v1 (they're extra works; see Notes for the easy add-on).
- **Claimed = booked-in.** Uses `total_claimed_pct`, which reflects submitted + approved claims (rejected/withdrawn are reversed out). So "remaining" is what's left after everything currently in the pipeline. (If you'd rather it only count *approved* claims, that's a small tweak — see Notes.)
- **Shown per site**, in the Production Cost section, plus a headline on each site's manage page.

**Repo context:** Next.js 15 App Router + Supabase, service-role server-side. Production Cost lives in `src/lib/production/monthly-costs.ts` + its admin page/components (currently shows actual wages paid per site per month — this is a *separate* number from cost-to-complete; keep both). Admin pages guard with `requireAdminAccess()`.

**How to use:** Save as `docs/cost-to-complete-feature.md`, work through it in Cursor one task at a time.

---

## Task 1 — Cost-to-complete loader

**File (new):** `src/lib/production/cost-to-complete.ts`

- For each **site** (active sites), read its `price_grid` cells (`contract_value, total_claimed_pct`) — page through like the foreman grid loader does (1000-row pages) so large sites are covered.
- Compute per site: `siteTotal`, `claimed`, `remaining`, `pctComplete`.
- Return an array of `{ siteId, siteName, siteTotal, claimed, remaining, pctComplete }`, plus grand totals across all sites (`grandSiteTotal`, `grandClaimed`, `grandRemaining`).
- Round money to pence. Guard against divide-by-zero when `siteTotal` is 0 (show 0% / remaining 0).

## Task 2 — Show it in the Production Cost section

**Files:** the Production Cost admin page + a component under its `_components/`

- Add a **"Cost to Complete"** panel (a table or cards, one row per site) showing: **Site · Total value · Claimed to date · Remaining to complete · % complete** (a progress bar for % complete reads well).
- Add a **grand total** row: total value / claimed / remaining across all sites.
- Keep the existing monthly-wages report as-is — this is a new section on the same page (or a tab). Make clear in a small caption that "Total value" is the priced grid value, and this is separate from actual wages paid.

## Task 3 — Headline on each site's page

**File:** `src/app/admin/sites/[siteId]/page.tsx`

- Near the top of the site page, show a compact **"Cost to complete: £X remaining of £Y (Z% complete)"** summary for that site, using the Task 1 loader for the single site. This is the "on each site" view — an at-a-glance figure whenever you open a site.

## Task 4 — Verify

- Open a site with a fully-imported grid → Total value equals the sum of its lift values (sanity-check against the grid). With nothing claimed, Remaining = Total, 0% complete.
- Book in and approve a claim for some lifts → Claimed rises, Remaining falls by the same amount, % complete goes up. Reject/withdraw it → the figures return.
- The Production Cost section lists every active site with the four figures and a correct grand total.
- Each site's page shows its own remaining/total headline.

---

## Notes / easy extensions
- **Include variations in the total:** to fold approved-but-unclaimed variation value into a site's total, add `Σ variation value for the site` to `siteTotal` (and to remaining until claimed). One extra query in Task 1. Say the word and I'll add it.
- **Margin view (budget vs actual):** because the Production section already has **actual wages paid** per site, you could show **Value claimed vs wages paid = production margin** alongside cost-to-complete. That turns this into a full budget-vs-actual dashboard. Easy follow-on once v1 is in.
- **Approved-only drawdown:** if you want "claimed" to count only *approved* claims (not submitted-awaiting-approval), compute claimed from approved claim allocations instead of `total_claimed_pct`. Small change; current default uses `total_claimed_pct` because it matches the grid colours foremen see.
- **Accuracy caveat:** the total is only as complete as the imported grid. A fully imported site grid gives an accurate, confirmable total; a partially imported grid understates it. Nothing to build — just worth knowing.

## Suggested order
Task 1 → 2 → 3 → 4. Commit each separately.
