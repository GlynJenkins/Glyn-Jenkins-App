# Management Guide — Glyn Jenkins Workforce Portal

A practical guide to running the portal as **Management / Admin**. This covers the fortnightly payroll cycle, setting up sites, sign-offs, and managing people. Best used on a desktop or laptop.

---

## 1. Getting started

1. Go to the portal and tap **Admin / Foreman Login**; sign in with your email and password.
2. You'll land on the **Dashboard**, which is your menu. The main areas are:
   - **Booking In** — the wages register and paying.
   - **Variations** — extra works.
   - **Production cost** — wages by site.
   - **Manage sites** — price grids and Excel imports.
   - **Jetwash** and **Roof firesocks** — progress tracking.
   - **Quality checks** — stage inspections and sign-off.
   - **Workers** — inductions, profiles, activation.
   - **Holidays** — leave tracker.
   - **Settings** — pay cycle, fees, booking window.

---

## 2. Setting up a site (do this before foremen can claim)

1. **Manage sites → New Site** — enter the name, address and site code.
2. Open the site and fill in **Document details** (developer/client name, contact, site address, surveyor, reference) — these appear on variation PDFs and QA inspections.
3. **Import Excel** — upload the priced grid spreadsheet. This builds the plots × stages with their values. Check the totals at the bottom look right.
4. **Assigned Foremen → Add** — assign the foremen who can book in on this site. Only assigned foremen can claim against it.

Tips: **Add Column** adds a stage; **Clear Grid** wipes the grid (careful — it's destructive). Re-importing replaces the grid.

---

## 3. The fortnightly payroll cycle

This is the core weekly-to-fortnightly routine.

### Approving claims

1. Go to **Booking In → Pending** (or the **Pending claims** screen).
2. Each pending claim shows the foreman, site, period and pool total. Expand **Pool breakdown** to see the **per-worker pay** — gross, admin fee, insurance, CIS tax, and net.
3. Check it looks right. If you need to dock money from a worker, use **Add custom deduction**.
4. Tap **Approve & Pay** to approve — this writes the pay to the wages register and sends payslips (email/SMS if configured). Or **Reject** and add a reason for the foreman.

Once approved, a claim can't be re-approved, and the same lift can't be paid twice — the app enforces this.

### The Wages Register & paying

1. **Booking In** shows the **Wages register** — use the **pay period tabs** to pick a fortnight.
2. Review the totals: Gross, Fees, Tax/CIS, NI, Net.
3. **Apprentices** are employed — you can edit their **tax/NI** here to match your payroll figures.
4. Export with **Bank CSV** (to import into your banking) and **Excel** (for your records).

---

## 4. Variations (extra works)

1. **Variations** shows the VO register and a **Pending** queue.
2. Review a foreman's submitted variation (with photos), and approve it. Approved variations get a **VO number** and can then be claimed in a fortnightly claim.
3. The register tracks foreman cost and developer payment status.

---

## 5. Quality checks (sign-off)

1. **Quality checks** lists your sites and inspection progress.
2. Open a site — it mirrors the price grid (plots × stages: Joist lift, Plate/Roof, Pre plaster, CML).
3. **Tap a stage cell** to inspect that plot/stage. Fill in the checklist (Yes/No/N/A), set the **result (Pass/Fail)**, sign, and add photos. This generates a signed inspection PDF.
4. Completed stages turn **green**. Re-inspecting keeps a history of the previous sign-off.

The inspector is recorded as **you** (the logged-in user), so sign-offs are always attributable.

---

## 6. Jetwash & Roof firesocks

- **Jetwash** — track which plots have been washed, and the pay log.
- **Roof firesocks** — view the evidence photos foremen upload per plot, and the developer PDF.

---

## 7. Managing people (Workers)

1. **Workers** shows **Pending / Active / Inactive** tabs with counts.
2. **New starters** appear under Pending — review their details and **activate** them so they can be used/log in.
3. **View Profile** shows their details, qualification, CSCS, and (for subcontractors) the signed agreement PDF. Bank/UTR are masked for privacy.
4. **Change a job role** on the profile (e.g. promote to Foreman or Management) — **Save role changes**. Promoting to a login role prompts for a portal password.
5. **Set Inactive** removes a leaver from active lists.

---

## 8. Holidays

1. **Holidays** is the leave tracker for **management-level staff**.
2. Set each person's **allowance** for the year (admin only), and **approve/reject** leave requests.

Note: only people with the **Management** (or Admin) role appear here. If someone should be in the tracker but isn't, check their job role is set to Management on their profile.

---

## 9. Settings

**Settings** controls the money and timing rules:

- **Admin fee** and **insurance fee** (deducted from subcontractors, not from management/apprentices).
- **Apprentice holiday** and **college** day rates.
- **Pay cycle & booking window** — the fortnightly work dates and pay day. There's a **"Use current cycle dates"** button that keeps these current; run it if the dates look out of date.

Changes here apply to **pending** claim previews immediately; already-approved claims keep the fees they were approved with.

---

## 10. Production cost

**Production cost** shows **wages paid by site, by month** — useful for tracking spend per site over time.

---

## Quick routine each payday

1. Foremen submit claims before the apply-by day.
2. You **approve** them on **Pending claims** (check the per-worker breakdown).
3. On **Booking In**, review totals and edit apprentice tax/NI if needed.
4. Export the **Bank CSV** and import to your bank; keep the **Excel** as a record.
5. Keep an eye on QA sign-offs, variations, and firesock evidence as sites progress.

---

*This guide covers the current app and will be updated as new features (e.g. training matrix, cost-to-complete, bank-holiday leave) go live. Questions the app can't answer — just ask.*
