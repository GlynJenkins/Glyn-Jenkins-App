# Fix Brief — Toolbox Talks: back navigation, draft delete, PDF logo, amend completed talks

Three issues found in testing the new Toolbox Talks feature, plus one enhancement (Task 4: amend a completed talk). Save as `docs/toolbox-talks-fixes.md`, do the tasks in order, commit each separately.

**Files involved:**
- `src/app/admin/toolbox-talks/_components/ToolboxTalkWizard.tsx`
- `src/app/api/admin/toolbox-talks/route.ts` (+ a new `[talkId]/route.ts`)
- `src/lib/toolbox-talks/generate-toolbox-talk-pdf.ts`

---

## Task 1 — Back button from the signing step (fix wrong subject / wrong names)

**Problem:** Steps 2 and 4 have Back buttons, but Step 3 (attendee signatures) has none. Once "Start signing" creates the draft, there's no way back to correct the title/description or the attendee list — a wrong name or wrong subject is stuck.

**Fix:**
1. Add a **Back** button to the Step 3 footer (same style as the Step 2/4 Back buttons) → returns to Step 2 with the current selections intact. From Step 2 the existing Back already reaches Step 1, so the whole wizard becomes walkable in both directions.
2. Because the draft now exists, going forward again must **update** it rather than create a duplicate:
   - Add `PATCH /api/admin/toolbox-talks/[talkId]` (new `[talkId]/route.ts`, guard `verifyAdminApiAccess`) accepting `{ title, description, attendees: [workerId...] }`. Only allowed while `status = 'draft'`.
   - Server logic: update title/description; **diff the attendee list** — insert rows (with name/role snapshots) for newly added workers, delete rows for removed workers (also delete their signature file from storage if they'd already signed). Attendees who remain keep their rows **and their captured signatures**.
   - In the wizard: when `talk` is non-null, "Start signing" calls PATCH instead of POST, then re-enters Step 3 with the refreshed attendee list.
3. If a worker who has **already signed** is unticked in Step 2, warn before saving: "Dave Jones has already signed — removing them will discard their signature. Continue?"

**Acceptance:** mid-signing you can go back, fix the title or swap a name, and return to signing without losing the signatures already captured (except any you deliberately removed); no duplicate talks are created.

## Task 2 — Delete a draft talk

**Problem:** A draft talk can't be deleted — start one by mistake and it sits there forever (and resuming always drags you into it).

**Fix:**
1. Add `DELETE /api/admin/toolbox-talks/[talkId]` (same new route file, guard `verifyAdminApiAccess`):
   - Only when `status = 'draft'` → delete any signature files under `toolbox-talks/{talkId}/` in storage, then delete the talk row (attendee rows cascade).
   - **Completed talks must return 400** ("Completed talks are a permanent record and can't be deleted.") — they're the audit trail sent to developers; nobody should be able to erase one.
2. UI:
   - On the Step 3 signing screen (draft), add a quiet **"Delete draft"** text button (red, bottom of the card) → confirm dialog ("Delete this draft talk? Any signatures captured will be discarded.") → DELETE → back to the site's talk list.
   - Wherever the site talk list / resume banner shows a draft entry, add a small delete (bin) icon with the same confirm flow.

**Acceptance:** a draft can be deleted from the wizard and from the talk list; a completed talk cannot be deleted from anywhere.

## Task 3 — PDF: logo clashes with the dark header band

**Problem:** In `generate-toolbox-talk-pdf.ts` the company logo is drawn directly onto the dark slate header band (`COLOR_SLATE`). A dark/coloured logo has no contrast against it and looks wrong.

**Fix:** draw a **white plate behind the logo** before drawing it — the standard treatment for logos on dark letterheads:

```ts
if (logo) {
  const scale = Math.min(90 / logo.width, 44 / logo.height)
  const w = logo.width * scale
  const h = logo.height * scale
  const pad = 8
  // White plate behind the logo so it never clashes with the slate band
  page.drawRectangle({
    x: MARGIN - pad,
    y: PAGE_HEIGHT - headerH + 16 - pad,
    width:  w + pad * 2,
    height: h + pad * 2,
    color: COLOR_WHITE,
    // if the pdf-lib version supports it, a slight corner radius looks best;
    // plain rectangle is fine otherwise
  })
  page.drawImage(logo, { x: MARGIN, y: PAGE_HEIGHT - headerH + 16, width: w, height: h })
}
```

Keep the company name / "Toolbox Talk Record" text where it is (it already sits at `MARGIN + 100`, clear of the plate). Check the plate stays inside the 78pt band height — with the current 44pt max logo height and 8pt padding it does (44 + 16 = 60 < 78), but nudge `pad` down if a tall logo touches the band edges.

**If the same logo-on-slate treatment exists in the QA inspection or subcontract PDF generators, apply the identical white-plate fix there too** so all company PDFs match.

**Acceptance:** regenerate a talk PDF — the logo sits on a clean white plate inside the dark band, legible, nothing overlapping; other branded PDFs unchanged or improved to match.

## Task 4 — Amend a completed talk (edit or add to it)

**Goal:** Management can change or add to a completed talk — fix the wording, or add attendees who were missed (they sign as normal) — **without** undermining the talk as a signed record. Edits are open amendments, not silent changes.

**Rules (what keeps the record honest):**
- Amending is admin-only, from the talk detail view (`/admin/toolbox-talks/[talkId]`): an **"Amend talk"** button on completed talks.
- What can change: **title, description, and adding attendees** (new attendees sign pass-the-phone style, exactly like the wizard's Step 3).
- What cannot change: existing attendees and their signatures can't be removed or altered, and the original `conducted_at` date stamp stays — the talk happened when it happened.
- Every amendment requires the manager to **re-sign** at the end (fresh signature), then the PDF **regenerates** and replaces the stored one.
- The record shows it was amended: add `amended_at timestamptz` and `amendment_count int not null default 0` to `toolbox_talks` (small migration for Alex to run — put the SQL at the top of the PR description). On each amend: `amendment_count + 1`, `amended_at = now()`.

```sql
alter table toolbox_talks
  add column if not exists amended_at timestamptz,
  add column if not exists amendment_count int not null default 0;
```

**Build:**
1. Extend `PATCH /api/admin/toolbox-talks/[talkId]` (from Task 1) to also accept completed talks, enforcing the rules above: title/description update allowed; `attendees` may only **add** worker IDs (reject removals of existing rows with a clear 400); sets the talk back to a signable state for the new attendees only.
2. `complete` route: when re-completing an amended talk, require the fresh manager signature, bump `amendment_count`/`amended_at`, regenerate + replace the PDF.
3. UI: "Amend talk" opens the existing wizard pre-loaded at the topic step with fields prefilled; attendee step shows existing attendees locked (ticked, not un-tickable, "signed" badge) with new ones addable; signing step lists **only unsigned/new attendees**; manager sign-off as normal, button label "Save amendment".
4. PDF: when `amendment_count > 0`, add a line in the sign-off block: *"Amended on {amended_at date} — revision {amendment_count + 1}"* in the muted colour. Attendees added after the day keep their true `signed_at` timestamps in the register.

**Acceptance:** a completed talk can have its wording corrected and a missed bricklayer added and signed; the regenerated PDF shows the original talk date, the late signature's real time, and the "Amended on…" line; nothing existing can be removed; a foreman still can't touch any of it.

---

## Task 5 — Verify

- Full run-through: Step 1 → 2 → 3 → back to 2 → change a name and the title → forward → previous signatures intact → complete → PDF header looks right.
- Delete a fresh draft from the wizard and another from the talk list; confirm a completed talk shows no delete option and the API refuses it.
- Amend a completed talk: fix a typo + add one attendee who signs; re-sign as manager; PDF regenerates with the amendment line; original signatures and talk date untouched.
- Foreman login still can't reach any toolbox-talk page or API.

## Suggested order
Task 1 → 2 → 3 → 4 → 5. Commit each separately.
