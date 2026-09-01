# Feature Brief — Right to Work capture & verification

**Goal:** Collect the correct right-to-work (RTW) evidence at enrolment and verify it on the admin side at pending stage before a worker is activated. Replace the current "Passport or Driving Licence" upload (a driving licence is **not** valid RTW proof) with a streamlined RTW section: **Passport** (default), **Share code** (non-UK/Irish nationals), or **No UK/Irish passport** (rare fallback, non-blocking). Then give the office a logged "Right to work verified" step, gating activation.

**Why now:** From **1 October 2026** RTW checks expand to cover individual sub-contractors and construction labour-supply chains. Civil penalties are £45,000 per worker (first breach) / £60,000 (repeat). PLC housebuilder clients will require this contractually.

**Design principle — streamlined:** default everyone to a single passport photo or a share code; only the small minority of British/Irish citizens without a passport hit the birth-certificate route, and that route does **not block** enrolment (the office arranges it). Don't ask everyone for documents they won't have to hand.

**Repo context:** the RTW document reuses the existing private-bucket + signed-URL + `prepareInductionImage` compression pattern exactly (like `id_document_url`). This is an additive, contained change — it does **not** affect claims, payroll, QA, audits, toolbox talks, firesocks, variations or holidays.

**How to use:** save as `docs/right-to-work-feature.md`, do the tasks in order, commit each separately.

---

## Task 1 — Database

```sql
alter table workers
  add column if not exists right_to_work_method text
    check (right_to_work_method in ('passport','share_code','no_passport_manual')),
  add column if not exists right_to_work_document_url text,   -- passport photo (also serves as ID)
  add column if not exists right_to_work_share_code text,     -- 9-char share code, non-UK/Irish nationals
  add column if not exists right_to_work_status text not null default 'pending'
    check (right_to_work_status in ('pending','verified','follow_up')),
  add column if not exists right_to_work_verified_at timestamptz,
  add column if not exists right_to_work_verified_by text,
  add column if not exists right_to_work_note text;
```

Keep `id_document_url` as-is for backwards compatibility; for the passport route, the passport photo populates **both** the RTW document and serves as the ID (no need to ask for two photos).

## Task 2 — Enrolment form: Right to Work section

Replace the current "Passport or Driving Licence" upload with a **Right to Work** section (shown for all roles):

- A short intro line: *"UK law requires us to check you're allowed to work here. Choose the option that applies to you."*
- **A choice — "How will you prove your right to work?"** (radio):
  1. **I have a passport** (British, Irish, or another passport with a visa/status) → reveal a photo upload ("Photo of your passport photo page"), run through `prepareInductionImage`. **This replaces the old ID upload.**
  2. **I'll provide a share code** (for non-UK/Irish nationals with digital status) → reveal a text field for the **9-character share code** (hint: "starts with W, from your gov.uk account — get one at gov.uk/prove-right-to-work"), plus a note "The office will run the online check using this code and your date of birth." (DOB is already collected.)
  3. **I don't have a UK or Irish passport** → show a reassuring note: *"That's fine — you can still finish registering. The office will arrange your right-to-work check (e.g. birth certificate + National Insurance document) before you start."* **No upload required; does not block submission.**
- Validation: passport route requires the photo; share-code route requires a code (basic shape: ~9 alphanumeric chars); no-passport route requires nothing.
- Remove all "driving licence" wording from the form.

## Task 3 — Induction API

In `src/app/api/induction/route.ts`:
- Parse `rightToWorkMethod`, the passport photo (`rightToWorkDocument`), and `rightToWorkShareCode`.
- Store: passport photo → `right_to_work_document_url` (and mirror to `id_document_url` so existing "ID on file" logic keeps working); share code → `right_to_work_share_code`.
- Set `right_to_work_status`: `'pending'` for passport/share-code routes; `'follow_up'` for the no-passport route (so the office knows to chase it).
- Reuse `validateUpload` + `prepareInductionImage`; add the new columns to the missing-column fallback (`missingOptionalCol` regex) like the other newer columns.
- Never require RTW fields for the insert to *succeed* — a failure here must degrade gracefully, same as the other new columns.

## Task 4 — Admin pending review + profile: verify & gate

On `/admin/workers/[workerId]` (and reflected on the pending card):

- **Right to Work card:**
  - Passport route → **View passport** (signed URL, like other docs).
  - Share code route → show the code and a **"Check on gov.uk →"** button linking to the Home Office employer online checking service (`https://www.gov.uk/view-right-to-work`), plus the worker's DOB for the check.
  - No-passport route → amber **"Follow-up needed — arrange manual check"** note.
  - Current status chip: **Pending / Verified / Follow-up**.
- **"Mark right to work verified"** action (management/admin): records `right_to_work_verified_by` (logged-in user's name) + `right_to_work_verified_at`, an optional note (e.g. "Passport seen, photo matches" or "Share code checked, ref …" or "Birth cert + NI seen in person"), and sets status `'verified'`. This is the record that gives the statutory excuse — who checked, when, how.
- **Gate activation:** block **Activate** while `right_to_work_status <> 'verified'`, with a clear message ("Verify right to work before activating"). Allow a deliberate, logged override for edge cases (records who overrode and when) — but default is blocked.

## Task 5 — Surface status (light touch)

- **Workers list** + **Worker matrix**: add a small **Right to Work** status chip/column (Verified / Pending / Follow-up) so the office can see at a glance who still needs checking. Additive — no rework of those pages.
- Optional: a dashboard count "N workers pending right-to-work verification".

## Task 6 — Verify

- Enrol via **Passport** → passport photo saved, ID-on-file still shows, status Pending, activation blocked until verified.
- Enrol via **Share code** → code stored, admin sees the gov.uk check link + DOB, can mark verified.
- Enrol via **No passport** → submission succeeds (not blocked), status Follow-up, amber flag on admin side.
- "Mark verified" records who/when/how; status → Verified; Activate now allowed.
- No "driving licence" wording remains anywhere.
- A worker still enrols fine if the migration hasn't run (fallback path).
- Foreman logins can't reach the verify action.

## Suggested order
Task 1 → 2 → 3 → 4 → 5 → 6. Commit each separately.

---

## Notes
- **Compliance caveat (build the process, but a human still checks):** a photo uploaded to a form is **not** a completed statutory check. The valid check is a person verifying the original/online status, confirming the photo matches, and recording it — which is exactly what the Task 4 "Mark verified" step captures. The app supports and logs the check; the office performs it.
- **Not legal advice:** given the penalties and the 1 Oct 2026 change, confirm the exact method with an employment/immigration adviser and check what Bellway and other clients contractually require (some mandate a specific method or a certified digital provider).
- **Future option:** a certified digital identity provider (IDSP/IDVT) can do passport-scan + selfie on the worker's phone and return a verified result automatically — the most streamlined + compliant route, but per-check cost and integration. Not needed for launch; the schema here (`right_to_work_method`) leaves room to add an `'idsp'` method later.
- **No knock-on:** reuses existing storage/compression/masking; adds columns only; independent of payroll/claims/QA/etc.
