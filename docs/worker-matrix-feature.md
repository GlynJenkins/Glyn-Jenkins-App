# Feature Brief — Worker Matrix (+ capture home address at enrolment)

**Goal:** An admin **Worker Matrix** page: every worker with **name, job role, age, phone number and home address**, with **Active and Inactive workers kept separate**, plus search, role filter and an Excel export for the office.

**Blocker discovered:** the induction form has never collected a **home address** (phone/email only), so Part A adds it. **Age** comes from `date_of_birth` (`docs/enrolment-date-of-birth.md`) — build that first if not already done.

**How to use:** save as `docs/worker-matrix-feature.md`, do the tasks in order, commit each separately.

---

## Part A — Capture home address

### Task 1 — Database

```sql
alter table workers add column if not exists home_address text;
```

### Task 2 — Enrolment form + API

- Induction form, personal-details section: required **"Home address"** multi-line textarea (3 rows), placeholder "House number & street, town, postcode". Zod: required, 10–300 chars, message "Enter your full home address including postcode."
- API: parse, validate, save to `home_address`; add to the missing-column fallback like the other new columns.
- Applies to **all roles** (employed included — it's basic HR data).

### Task 3 — Existing workers

- Worker profile: show Home address (or amber "Not on file") with an admin **edit** control (extend the same PATCH route used for DOB/payment details; plain text, same validation).

## Part B — The Worker Matrix

### Task 4 — Page

`/admin/worker-matrix` (guard `requireAdminAccess`), plus a **"Worker Matrix"** tile on the admin dashboard (Workers group):

- **Two tabs: Active and Inactive** (counts in the tab labels). Pending workers appear on neither — they're not on the books yet; show a small link to the Workers pending queue instead.
- Table columns: **Name** (links to the worker profile) · **Job role** · **Age** (from DOB; "—" if not on file) · **Phone** (tap-to-call `tel:` link on mobile) · **Home address**.
- Sort by surname by default; tap column headers to sort by role or age. Search box (name) + role filter chips, same pattern as the workers list.
- Amber "Not on file" markers where DOB/address are missing — doubles as the office's catch-up list; the under-18 badge from the DOB brief shows here too.
- Mobile: the table collapses to cards (name + role headline, age/phone/address beneath) — management will open this on site.

### Task 5 — Excel export

- **"Export Excel"** button → `.xlsx` with **two sheets: "Active" and "Inactive"** (never mixed), columns Name, Job role, Age, Date of birth, Phone, Email, Home address, Start date (inducted), Status.
- Server-generated (same tooling as the wages Excel export), filename `Worker-Matrix_{YYYY-MM-DD}.xlsx`.
- No bank/UTR/NI data anywhere in this export — it's a contact/HR sheet, not a payroll one, and it'll get emailed around; keep payment data out of it.

### Task 6 — Verify

- New enrolment with an address → appears correctly in the matrix with age computed.
- Active and Inactive stay separated (page and export); deactivating a worker moves them across.
- Missing DOB/address show "Not on file"; admin can fill both from the profile and the matrix updates.
- Export opens cleanly (Numbers and Excel), two sheets, no sensitive payment fields.
- Foreman login can't reach the page, API or export.

## Suggested order
Task 1 → 2 → 3 → 4 → 5 → 6. Commit each separately.

---

## Notes
- **Privacy:** age, phone and home address together are personal data — admin/management eyes only, same as the rest of the workers area. The export warning applies doubly: share the spreadsheet only where genuinely needed.
- The planned **training matrix** can later join onto this page (qualifications as extra columns) — keep the table component reusable.
