# Feature Brief — Toolbox Talks

**Goal:** A professional Toolbox Talk system on the management side of the app (Management/Admin now; Contracts Manager & Site Supervisor when their areas go live). A manager runs a safety talk on site, records who attended with **real signatures captured on the spot**, signs it off themselves, and the app produces a **branded, date-stamped PDF** ready to send to the developer. Every talk is stored against its site so you can see at a glance how many talks each site has had.

**The process being built (agreed with Alex):**
1. Manager opens a site → **New Toolbox Talk**.
2. Picks a **saved topic** from the library (e.g. Working at Height) or types a fresh **title + description** — with the option to save it as a template for next time.
3. Selects **attendees** from all active registered operatives (bricklayers, labourers, apprentices, jetwashers, foremen — everyone on the portal).
4. **Pass-the-phone signing:** each attendee taps their own name and signs in a signature box, one after another, on the manager's phone/tablet. A progress bar shows e.g. "6 of 8 signed".
5. Manager signs at the bottom, the record is **date/time stamped automatically**, and Submit generates the **branded PDF** (logo, site details, description, attendee signature table, manager sign-off).
6. The talk is stored on the site's record — viewable in-app, counted per site, and the PDF downloadable to send to the developer.

**Repo context:** Next.js 15 App Router + Supabase (service-role server-side; auth enforced by guards in `src/lib/auth/portal-access.ts`). Reuse what already exists:
- **SignaturePad** component (used in induction + QA inspections) — reuse for both attendee and manager signatures.
- **PDF generation** — same library/pattern as the signed subcontract and QA inspection PDFs; same visual language (dark slate header band, orange accents, company name).
- **Gang picker** from Build Fortnightly Claim (search + role filter + tick list) — reuse for attendee selection.
- Supabase **Storage** — store signatures and generated PDFs in a private bucket, served via signed URLs, same as inspection PDFs.

**How to use this brief:** save as `docs/toolbox-talks-feature.md`, do the tasks in order, commit each separately.

---

## Task 1 — Database

New migration (Alex runs it in Supabase SQL editor):

```sql
create table toolbox_talk_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  created_by text,
  created_at timestamptz not null default now()
);

create table toolbox_talks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),
  title text not null,
  description text not null,
  conducted_by_name text not null,          -- snapshot of the logged-in manager's name
  conducted_by_role text,                   -- management / contracts_manager / site_supervisor
  manager_signature_path text,              -- storage path
  conducted_at timestamptz not null default now(),
  pdf_path text,                            -- storage path of generated PDF
  status text not null default 'completed', -- 'draft' | 'completed'
  created_at timestamptz not null default now()
);

create table toolbox_talk_attendees (
  id uuid primary key default gen_random_uuid(),
  talk_id uuid not null references toolbox_talks(id) on delete cascade,
  worker_id uuid references workers(id),
  worker_name text not null,                -- snapshot (survives later role/name changes)
  worker_role text,                         -- snapshot
  signature_path text,                      -- storage path; null until they sign
  signed_at timestamptz
);

create index idx_toolbox_talks_site on toolbox_talks(site_id);
create index idx_toolbox_talk_attendees_talk on toolbox_talk_attendees(talk_id);

alter table toolbox_talk_templates enable row level security;
alter table toolbox_talks enable row level security;
alter table toolbox_talk_attendees enable row level security;
-- No public policies: all access goes through server routes using the service role,
-- matching the rest of the schema.
```

Add a **`toolbox-talks`** folder convention inside the existing private storage bucket for signatures (`toolbox-talks/{talkId}/sig-{attendeeId}.png`, `.../manager.png`) and PDFs (`toolbox-talks/{talkId}/toolbox-talk.pdf`).

**Name/role snapshots matter:** the PDF must forever show who attended as they were on the day, even if a worker is later renamed, made inactive, or changes role.

## Task 2 — API routes

All under `/api/admin/toolbox-talks`, guarded with `verifyAdminApiAccess` (add the supervisor guard variant when those roles land):

- `GET /api/admin/toolbox-talks?siteId=` — list talks for a site (id, title, conducted_at, conducted_by, attendee count, pdf ready?).
- `POST /api/admin/toolbox-talks` — create a talk: `{ siteId, title, description, attendees: [workerId...] }` → creates the talk row (status `draft`) + attendee rows with name/role snapshots. Returns the talk with attendees.
- `POST /api/admin/toolbox-talks/[talkId]/signature` — save one signature: `{ attendeeId | 'manager', dataUrl }` → decode base64 PNG, upload to storage, set `signature_path` + `signed_at`.
- `POST /api/admin/toolbox-talks/[talkId]/complete` — requires manager signature present; generates the PDF (Task 4), stores it, sets `pdf_path`, `status='completed'`, `conducted_at=now()`. Reject (400, clear message) if the manager hasn't signed.
- `GET /api/admin/toolbox-talks/[talkId]/pdf` — stream/redirect a signed URL to the stored PDF.
- Templates: `GET`/`POST`/`DELETE /api/admin/toolbox-talk-templates` — list, save (title + description), delete.

Validation: title ≤ 120 chars, description required (≤ 5,000 chars), at least **one attendee**. Use the standard `apiError(...)` helper — no raw DB errors to the client.

**Unsigned attendees are allowed** (someone got called away): the talk can still be completed, and the PDF marks them "Did not sign". But warn in the UI before completing (Task 3).

## Task 3 — The talk flow (UI)

New pages under the admin area:

**3a. Site talks list — `/admin/toolbox-talks`**
- Site cards showing each site's **talk count** and last talk date, e.g. "Meadow View — 7 talks · last: 12 Aug 2026". Tap a site → its talk history (date, title, who ran it, attendee count, **Download PDF**, **View**).
- Add a **"Toolbox Talks"** tile to the admin dashboard (with the site-management/QA group).
- Also surface the count on each site's page in **Manage sites** ("Toolbox talks: 7 · View").

**3b. New talk wizard — `/admin/toolbox-talks/new?siteId=`** (mobile-first — this is used standing on site):

- **Step 1 — Topic.** Template picker (tap to prefill) + editable **Title** and **Description** ("What is this talk about?" — the description box). A "Save as template" tick box.
- **Step 2 — Attendees.** Reuse the gang-picker pattern: search box + role filter chips, tick names from **all active workers**. Selected count badge.
- **Step 3 — Signatures (pass-the-phone).** A list of the selected names, each with a status chip (**Awaiting signature** / green tick **Signed**). Tapping a name opens a full-screen signature screen: *"[Name] — sign below to confirm you attended this toolbox talk and understood its contents"* with the SignaturePad, Clear, and Confirm. Progress header: **"Signed 6 of 8"**. This is deliberately one-at-a-time and full-screen so the phone can be handed round the gang.
- **Step 4 — Manager sign-off.** Shows a summary (site, title, date, attendee count), the manager's own SignaturePad, and **Complete Talk**. If any attendee hasn't signed, show a clear warning: "2 attendees haven't signed — they'll be marked 'Did not sign' on the record. Continue?"
- On complete → success screen with **Download PDF** and **Back to site talks**.

Draft safety: the talk is created (status `draft`) when Step 2 finishes, and signatures save to the server **as each person signs** — so a dropped connection or closed browser never loses captured signatures. Re-opening a draft resumes at the signing list.

**3c. Talk detail view — `/admin/toolbox-talks/[talkId]`**
Read-only: title, description, site, date, who ran it, attendee table with Signed/Did-not-sign status, and **Download PDF**.

## Task 4 — The branded PDF (the deliverable the developer sees)

Generate with the same library/pattern as the QA inspection PDF. Professional, one document per talk:

- **Header band:** dark slate with the company logo + "GLYN JENKINS LTD" in orange, document title **"Toolbox Talk Record"**, and the talk title beneath.
- **Details block:** Site name & address, site code, date & time of talk, conducted by (name + role), developer/client name (pull from the site's Document details, like variation PDFs do).
- **Talk description:** the full description text under a "Subject of talk" heading.
- **Attendance register:** a clean table — #, Name, Role, Signature (the drawn signature image), Time signed. Unsigned attendees show "Did not sign" in amber instead of a signature.
- **Sign-off block:** "Conducted and verified by" with the manager's signature image, printed name, role, and the date stamp.
- **Footer:** "Glyn Jenkins Ltd — Workforce Portal · Toolbox Talk Record" + page numbers; auto-flow to extra pages if the register is long.

Filename: `Toolbox-Talk_{SiteCode}_{YYYY-MM-DD}_{short-title}.pdf` — tidy when emailed to a developer.

## Task 5 — Verify

- Run a full talk on a phone: template prefill → 4+ attendees across different roles → pass-the-phone signing (including one who doesn't sign) → manager sign-off → PDF downloads and looks right (logo, signatures visible, "Did not sign" shown, date stamp correct).
- Site talk counts increment; the talk appears in the site's history; the PDF re-downloads later from the detail view.
- A foreman login **cannot** reach any `/admin/toolbox-talks` page or API (guards hold).
- Close the browser mid-signing → reopen → draft resumes with signatures intact.

---

## Notes

- **Supervisor roles:** when Contracts Manager / Site Supervisor areas are built (see `docs/supervisor-roles-feature.md`), give them this same Toolbox Talks area — it's a core part of their job. Build the pages so the guard is the only thing that changes.
- **Why signatures via storage, not inline base64 in the DB:** keeps rows small, matches the existing signature handling, and signed URLs keep them private.
- **Legal weight:** the on-screen signing statement ("sign below to confirm you attended and understood") plus the per-signature timestamp is what makes this record stand up if the developer or HSE ever asks.
- **Future (not now):** talk topic packs (pre-written HSE talk content), attendance stats per worker (ties into the training matrix later), and scheduled talk reminders.

## Suggested order
Task 1 → 2 → 3 → 4 → 5. Commit each separately.
