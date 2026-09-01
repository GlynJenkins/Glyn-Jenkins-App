# Fix Brief — Group CSCS fields + tighten the "no passport" Right to Work option

Two enrolment-form changes on `src/app/induction/page.tsx` (Document Uploads section, ~lines 887–1134), plus a small DB/admin addition for Part B.

---

## Part A — Keep all CSCS fields together

**Problem:** CSCS is split across the Document Uploads section. Current order:
1. CSCS Card (upload)
2. Right to Work block
3. Health & Safety (SSSTS/SMSTS)
4. Firesock training
5. **CSCS Registration Number**  ← stranded at the bottom
6. **CSCS Card Expiry Date**  ← stranded at the bottom

**Fix:** move **CSCS Registration Number** and **CSCS Card Expiry Date** up so they sit **immediately under the CSCS Card upload**, forming one CSCS block. New order:
1. **CSCS Card** — a single grouped block: card upload → registration number → expiry date (optionally under a small "CSCS Card" sub-heading so it reads as one unit).
2. Right to Work
3. Health & Safety (SSSTS/SMSTS)
4. Firesock training

Pure reordering of existing fields — no validation or data changes; the three CSCS inputs keep their current names, register calls, and validation. Just move the two CSCS text/date fields' JSX up beneath the CSCS Card upload.

---

## Part B — Close the "no passport" loophole (UK/Irish citizens without a current passport)

**Concern (valid):** the third option — *"I don't have a UK or Irish passport"* with hint *"Office will arrange a manual check before you start"* — reads like a way to skip providing ID. Some genuine **UK nationals have let their passport lapse or binned it**, and they should be able to enrol — but the wording shouldn't let it become a loophole for people who can't actually prove a right to work.

**Two things make this safe — one already exists, one to add:**

**Already your safeguard (reassurance):** this route does **not** let anyone start work. The **activation gate** blocks any worker from being activated until the office marks right to work *verified* on the profile. So "no passport" registers the person (which you want — you capture their details) but they cannot become active/payable until your office has actually checked alternative evidence. It is a *register-now, verify-before-activate* path, not a skip.

**To add — make the option explicit and capture a declaration:**

1. **Reword the third option** so it's clearly for UK/Irish citizens without a current passport, not a general skip:
   - **Title:** "I'm a UK or Irish citizen without a current passport"
   - **Hint:** "e.g. expired or lost. You'll prove your right to work another way — the office will check your birth certificate + National Insurance document before you can start."
   - (Non-UK/Irish nationals are pushed to the **share code** option — this route is UK/Irish-citizen only.)

2. **Require a declaration when it's selected** — a checkbox that must be ticked to submit on this route:
   *"I confirm I am a UK or Irish citizen and will provide alternative proof of my right to work (such as a birth certificate and National Insurance document) before I start. I understand I cannot be activated until this is checked."*
   - Block submission on the no-passport route unless this is ticked (same pattern as the existing consent checkbox).

3. **Replace the current amber note** (`That's fine — you can still finish registering…`) with a firmer version:
   *"You can register now, but you can't start work until the office has verified your right to work. Please bring your birth certificate and a document showing your National Insurance number (e.g. a payslip, P45/P60, or HMRC letter)."*

4. **Store the declaration** (so there's a record it was made):
   ```sql
   alter table workers
     add column if not exists right_to_work_citizen_declared boolean not null default false;
   ```
   - Induction API: set `true` when the no-passport route is used and the checkbox was ticked; `false`/irrelevant otherwise. Add to the missing-column fallback like the other new columns.

5. **Show it on the admin Right to Work card / register:** for a no-passport worker, display *"Declared UK/Irish citizen — alternative proof required"* alongside the amber "Follow-up" status, so the office knows exactly what to ask for before verifying. The existing "Mark right to work verified" step (with its note field) is where they record the birth-certificate/NI check.

**Net effect:** a genuine UK national with a lapsed passport can still enrol, but they've made an explicit citizenship declaration, the wording makes clear it's not a shortcut, and — the real control — they still can't be activated or paid until your office verifies alternative evidence. Anyone who isn't a UK/Irish citizen is directed to the share-code route instead.

---

## Verify
- Enrolment form: CSCS card, registration number and expiry appear together as one block; Right to Work, SSSTS and Firesock follow separately.
- Selecting "I'm a UK or Irish citizen without a current passport" shows the new wording and requires the declaration checkbox before submit; unticked → blocked with a clear message.
- A no-passport enrolment stores `right_to_work_citizen_declared = true`; the admin RTW card shows the "declared UK/Irish citizen — alternative proof required" note and Follow-up status; activation stays blocked until verified.
- Passport and share-code routes unchanged and still work.
- Registration still succeeds if the new column hasn't been migrated yet (fallback path).

## Notes
- This tightens the *capture and messaging*; the legal check itself is still performed by your office at pending stage (birth certificate + NI, or the online service). Confirm your exact accepted-document list with your employment/immigration adviser and Bellway's requirements.
- If you'd rather the no-passport route be fully blocking (can't even register without office pre-approval), that's a stricter option — say the word — but register-now-verify-before-activate is usually the better balance: you capture the person and their details, and the gate still protects you.
