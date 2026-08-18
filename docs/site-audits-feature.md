# Feature Brief — Site Audits (weekly/fortnightly site walks)

**Goal:** When Management, Site Supervisor, or Contracts Manager visits a site, they walk the plots in build and record a **Site Audit**: for each item needing action — the **plot number**, a **description**, and **photos**. The finished audit is a **branded, date-stamped PDF** that can be downloaded and shared with the gangs, is stored against the site, **and appears in the foreman portal** for that site's assigned foremen. Each audit is a standalone snapshot report (no open/closed tracking — that can be bolted on later if wanted).

**This complements Quality Checks:** stage inspections sign off a specific plot/stage against a checklist; a Site Audit is a free-roaming walk of the whole site capturing anything that needs actioning.

**Repo context:** Next.js 15 App Router + Supabase. Reuse existing patterns throughout:
- Photo capture/upload as used in variations & QA inspections (compression before upload if `prepareImage` is built — audits mean many photos on a phone).
- PDF generation — same library and house style as the QA inspection / toolbox talk PDFs (slate header band, orange accents, **white plate behind the logo** per `docs/toolbox-talks-fixes.md`).
- Guards: `requireManagementAreaAccess` / `verifyManagementAreaApiAccess` (admin, management, contracts manager, site supervisor). Foreman side: `requireForemanAccess`, and only for **their assigned sites**.
- Storage: private bucket, `site-audits/{auditId}/...`, signed URLs.

**How to use:** save as `docs/site-audits-feature.md`, do the tasks in order, commit each separately.

---

## Task 1 — Database

```sql
create table site_audits (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),
  audited_by_name text not null,           -- snapshot of who walked the site
  audited_by_role text,
  audit_date timestamptz not null default now(),
  general_notes text,                      -- optional overall comments
  status text not null default 'draft',    -- 'draft' | 'completed'
  pdf_path text,
  created_at timestamptz not null default now()
);

create table site_audit_recipients (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references site_audits(id) on delete cascade,
  worker_id uuid references workers(id),
  worker_name text not null,               -- snapshot
  sent_via text not null,                  -- 'email' | 'sms' | 'email,sms'
  sent_at timestamptz not null default now()
);
create index idx_site_audit_recipients_audit on site_audit_recipients(audit_id);
alter table site_audit_recipients enable row level security;

create table site_audit_items (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references site_audits(id) on delete cascade,
  plot_number text not null,
  description text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table site_audit_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references site_audit_items(id) on delete cascade,
  photo_path text not null,
  created_at timestamptz not null default now()
);

create index idx_site_audits_site on site_audits(site_id);
create index idx_site_audit_items_audit on site_audit_items(audit_id);
create index idx_site_audit_photos_item on site_audit_photos(item_id);

alter table site_audits enable row level security;
alter table site_audit_items enable row level security;
alter table site_audit_photos enable row level security;
-- no public policies; service-role via server routes only
```

## Task 2 — API

Admin routes under `/api/admin/site-audits` (guard `verifyManagementAreaApiAccess`):

- `GET ?siteId=` — list a site's audits (date, auditor, item count, pdf ready).
- `POST` — create a draft audit `{ siteId }` → returns the audit id.
- `POST /[auditId]/items` — add an item `{ plotNumber, description }` → returns item id. `PATCH`/`DELETE /[auditId]/items/[itemId]` — edit/remove while draft.
- `POST /[auditId]/items/[itemId]/photos` — upload a photo (validateUpload as image; store under `site-audits/{auditId}/{itemId}/`). `DELETE` to remove while draft.
- `POST /[auditId]/complete` — `{ generalNotes?, recipientWorkerIds? }` → requires ≥1 item; generates the PDF, sets status completed, then **issues the report to the selected foremen**: email via Resend (same pipeline as payslips) with the PDF attached — or a signed link if the PDF is too large to attach (>8 MB) — plus SMS notification via Twilio if configured ("New site audit for {Site} — check your foreman portal"). Record each send in `site_audit_recipients`. Send failures must not fail the completion — the audit completes, failed sends are reported back to the UI for retry.
- `POST /[auditId]/resend` — re-issue to additional/failed recipients after completion.
- Reject completing an audit with zero items ("Add at least one item — or if the site was clean, add a single item saying so.").
- `DELETE /[auditId]` — drafts only (mirror the toolbox-talk rule: completed audits are a record).
- `GET /[auditId]/pdf` — signed URL/stream.

**Items save to the server as they're added** (draft-as-you-go, like toolbox-talk signatures) — a site walk can be an hour on a phone with patchy signal; losing a walk's findings is not acceptable. Photos upload immediately on selection with a per-photo spinner and retry.

Foreman routes (guard `verifyForemanApiAccess`, assigned sites only):
- `GET /api/foreman/site-audits?siteId=` — completed audits only (no drafts).
- `GET /api/foreman/site-audits/[auditId]/pdf` — the PDF, only if the audit belongs to one of their assigned sites.

## Task 3 — Admin UI (mobile-first — this is used walking a site)

**3a. Start:** on each site (Manage sites page + the site's toolbox-talks pattern), a **"Site Audits"** entry showing the count and last audit date → `/admin/site-audits?siteId=`: list of audits (date, auditor, items, Download PDF, View) + **"Start site audit"** button. Resume banner if a draft exists (with delete-draft option).

**3b. The walk — `/admin/site-audits/[auditId]` (draft mode):**
- Header: site name, date, auditor (logged-in user), running item count.
- **"Add item"** — the core loop, optimised for one hand on a muddy site:
  1. **Plot number** — quick-pick chips of the site's plot numbers from the price grid (plus free-text for "compound", "scaffold", "general"), most-recently-used first.
  2. **Description** — text box ("What needs actioning?").
  3. **Photos** — camera/library button, multiple photos per item, thumbnails with remove.
  4. **Save item** → appears in the list below, editable until completion.
- Items list grouped by plot, each showing description + photo thumbnails.
- **"Complete audit"** → optional general notes ("Overall site comments — housekeeping, standout good work, etc."), then a **"Send to foremen"** step: the site's **assigned foremen pre-ticked** (untickable, plus tick any other portal-login worker), so issuing the report sends it straight to the right people → confirm → PDF generates and sends → success screen showing delivery status per recipient ("Sent to Dave Jones ✓ · Retry for Sam Price"), with **Download PDF** / **Share** (Web Share API on mobile for WhatsApp) for manual sharing on top.

**3c. Completed view:** read-only audit with items, photos (tap to enlarge), notes, Download PDF, and a **"Sent to"** list (from `site_audit_recipients`) with a **"Send to more people"** button (the resend route).

## Task 4 — The branded PDF

House style, matching the other company PDFs (slate band, orange accents, white logo plate):

- **Header:** logo + GLYN JENKINS LTD, "Site Audit Report", site name.
- **Details block:** site name/code & address, developer (from site Document details), audit date, conducted by (name + role), number of items.
- **Items, grouped by plot:** a bold plot heading ("Plot 14"), then each item: numbered description followed by its photos laid out large enough to be useful (2 per row, ~6–7 cm wide — gangs need to see the defect, not a thumbnail). Photos keep aspect ratio; flow across pages cleanly (never split a photo across pages).
- **General notes** section at the end, then a sign-off line: conducted by, role, date.
- **Footer:** "Glyn Jenkins Ltd — Workforce Portal · Site Audit Report" + page numbers.
- Filename: `Site-Audit_{SiteCode}_{YYYY-MM-DD}.pdf`.

Compress embedded photos (re-encode ~1600px JPEG) so a 30-photo audit doesn't produce a 100 MB PDF — it needs to send over WhatsApp.

## Task 5 — Foreman portal

- **Pop-up on login:** when a foreman lands on their dashboard and one of their assigned sites has an audit they haven't seen yet, show a modal front and centre: **"New site audit — Meadow View, 14 Aug"** with the item count, a **"View audit"** button (straight to it) and "Later". Dismissing or viewing marks it seen (per-foreman `audit_views` row or last-seen timestamp — viewing state is per foreman, not global). Multiple unseen audits → one modal listing them. Don't re-show what's been dismissed; the badge below keeps it findable.
- On the foreman's site card (with Site Price Grid / Submit Variation / Roof Firesocks): a **"Site Audits"** entry with a badge showing the latest audit date, and a **"New"** dot while unseen.
- Opens a read-only list of that site's completed audits → view items/photos in-app + **Download PDF**.
- Foremen see audits only for their assigned sites; drafts never visible.

## Task 6 — Verify

- Full walk on a phone: start audit → 3 items across 2 plots with photos → complete with notes → PDF has grouped plots, readable photos, correct branding, sensible file size.
- Draft survives closing the browser mid-walk; resume shows saved items/photos; draft can be deleted; completed can't.
- Foreman on an assigned site sees the completed audit and downloads the PDF; a foreman NOT assigned to that site gets nothing (API-level test).
- Issuing sends the email (PDF attached) to the pre-ticked assigned foremen; SMS fires if Twilio configured; the "Sent to" list records it; a failed send shows Retry and works.
- Foreman logs in after an audit is issued → the pop-up shows; "View audit" goes straight there; dismissed once, it doesn't reappear — but the "New" dot stays until viewed. A different foreman on the same site still gets their own pop-up.
- Site audit count/date shows on the site; Web Share works on iPhone.

## Suggested order
Task 1 → 2 → 3 → 4 → 5 → 6. Commit each separately.

---

## Notes
- **Standalone reports by choice:** Alex chose snapshot reports over open/closed action tracking. The schema quietly allows adding a `status` to items later if chasing-to-closure is ever wanted — no redesign needed.
- **Supervisor roles:** when Site Supervisor / Contracts Manager areas are built, this (with Toolbox Talks) is core to their job — same pages behind their guard.
- **Audit cadence** (weekly/fortnightly) is left to the humans — no scheduling logic. The site list showing "last audit" date is what prompts an overdue walk. A dashboard nudge ("Sites not audited in 14+ days") is an easy later addition.
