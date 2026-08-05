# Feature Brief — Employed roles at enrolment (Management & Contracts Manager)

**Goal:** When the selected job role at enrolment is **Management** or **Contracts Manager** (both employed, not self-employed), the enrolment form should **not** show the self-employed **subcontract agreement + signature**. Instead show a single tick box: **"I confirm I have signed my employed contract."** (required to submit). All other roles keep the subcontract agreement exactly as now.

**Agreed scope (from Alex):** employed roles = **`management`** and **`contracts_manager`** only. (Apprentices are employed for *pay* purposes but were not mentioned — left unchanged; see Notes if you want them included.)

**Current behaviour (for reference):**
- Role dropdown in `src/app/induction/page.tsx` includes `management` and `contracts_manager`.
- The bottom of the form shows the subcontract agreement text (`src/lib/subcontract-agreement.ts`), a **SignaturePad**, and a required checkbox "I confirm I have read the subcontract agreement…". The client validate() requires `signatureBlob` + `agreedToTerms` for everyone.
- The induction API (`src/app/api/induction/route.ts`) requires the signature, generates the subcontract PDF, and stores it. Non-apprentices are also required to give a **UTR + tax type** (Zod `superRefine`).
- There's an existing `isEmployedWorker(role)` in `calculate-pay.ts`, but it means something different (CIS fee exemption, includes apprentice). **Do not reuse it** for this — define a new helper.

**Repo context:** Next.js 15 App Router + Supabase. Enrolment is the public `/api/induction` route (service-role). No auth change.

**How to use:** Save as `docs/employed-roles-enrolment-feature.md`, work through in Cursor one task at a time.

---

## Task 1 — Define the employed-contract roles

**File:** `src/lib/worker-access.ts` (or a small shared helper)

```ts
export const EMPLOYED_CONTRACT_ROLES = ['management', 'contracts_manager'] as const
export function isEmployedContractRole(role: string): boolean {
  return role === 'management' || role === 'contracts_manager'
}
```
Use this everywhere below. Keep it separate from `isEmployedWorker` (different meaning).

## Task 2 — Enrolment form: swap the agreement block for a tick box

**File:** `src/app/induction/page.tsx`

- The form already watches the selected role (`selectedRole`). When `isEmployedContractRole(selectedRole)` is true:
  - **Hide** the subcontract agreement text, the SignaturePad, and the "I confirm I have read the subcontract agreement…" checkbox.
  - **Show instead** a section titled e.g. "Employed contract" with a required checkbox: **"I confirm I have signed my employed contract with Glyn Jenkins Ltd."** Back it with a state field like `employedContractSigned`.
- For all other roles, render exactly what's there today (no change).

## Task 3 — Validation (client + schema)

**File:** `src/app/induction/page.tsx` (the `validate()` function + the Zod schema)

- In `validate()`:
  - If `isEmployedContractRole(role)`: **do not** require `signatureBlob` or `agreedToTerms`; **do** require `employedContractSigned` (error if unticked, e.g. "Please confirm you have signed your employed contract").
  - Otherwise: keep the existing signature + agreement requirements.
- Mirror this in the Zod schema's `superRefine` so server-and-client agree.
- On submit, append `employedContractSigned` to the form data; only append the `signature` file for non-employed roles.

## Task 4 — Database column

**File (new):** `supabase/migrations/add_employed_contract_signed.sql`
```sql
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS employed_contract_signed boolean NOT NULL DEFAULT false;
```
(Run in Supabase → SQL Editor. No enum change needed.)

## Task 5 — Induction API: skip the subcontract for employed roles

**File:** `src/app/api/induction/route.ts`

- If `isEmployedContractRole(role)`:
  - **Do not require** the `signature` file, and **do not** generate/upload the subcontract PDF.
  - Read the `employedContractSigned` flag; require it to be `true` (400 if not).
  - Store `employed_contract_signed: true`; leave `subcontract_signature_url` / `subcontract_agreement_pdf_url` null.
- For all other roles: unchanged (signature required, PDF generated) — and set `employed_contract_signed: false`.

## Task 6 — RECOMMENDED companion: don't ask employed staff for UTR / CIS tax type

Employed (PAYE) staff don't have a UTR or a CIS tax type — those are self-employed/CIS fields. Today the form requires them for every non-apprentice, which will confuse Management/Contracts Manager enrolments.

- In the form + Zod `superRefine` + API: treat `isEmployedContractRole(role)` like the apprentice case for these fields — **UTR and tax type not required / not collected**, and stored null.
- This is a small, sensible change that goes with the employed-role work. **Confirm you want it** — if you'd rather still capture UTR for these roles, skip this task.

## Task 7 — Worker profile + verify

- **Worker profile** (`WorkerProfile.tsx`): for employed roles, instead of the "Download Signed Subcontract (PDF)" button, show a line like **"Employed contract: Signed ✓"** (from `employed_contract_signed`). For everyone else, unchanged.
- **Verify:**
  - Select **Management** or **Contracts Manager** at enrolment → the subcontract agreement + signature disappear; the "employed contract signed" tick box appears and is required.
  - Submit without ticking it → blocked. Tick it → enrols with no subcontract PDF, `employed_contract_signed = true`.
  - Select any other role → subcontract agreement + signature required exactly as before, and a subcontract PDF is still generated.
  - (If Task 6 done) Management/Contracts Manager enrolments don't ask for UTR or tax type.

---

## Notes
- **Apprentices** are employed for pay purposes (`isEmployedWorker`) but you only asked for Management + Contracts Manager here, so apprentices are unchanged (they still sign the subcontract). If you want apprentices on the employed-contract tick box too, add `'apprentice'` to `EMPLOYED_CONTRACT_ROLES` — but confirm, since it changes their onboarding.
- The "employed contract" itself (the actual signed document) is handled by you/HR outside the app — the tick box is the worker attesting they've signed it. If you later want them to *upload* a copy, that's a small add (a file field like the SSSTS one).

## Suggested order
Task 1 → 2 → 3 → 4 → 5 → 7, with Task 6 if you want it. Commit each separately.
