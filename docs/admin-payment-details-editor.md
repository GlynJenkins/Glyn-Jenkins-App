# Cursor Brief — Admin: Update a Worker's Payment Details (bank / UTR / NI)

**Goal:** The office can correct or add a worker's **bank sort code, account number, UTR and NI number** from the admin worker profile — for typos at enrolment, changed banks, or older records missing data — so everyone is set up correctly for payment. Values stay masked on screen at all times; editing never reveals what's currently stored.

**Context (how it works today):** masking on the profile is display-only — full values are stored in `workers` and used in full by the Bank CSV export (`src/lib/cis/ledger-payee.ts`) and CIS statements. The admin PATCH route (`/api/admin/workers/[workerId]`) currently only updates role / portal password / DOB. This brief extends it.

**How to use:** save as `docs/admin-payment-details-editor.md`, do the tasks in order, commit each separately.

---

## Task 1 — API: extend the worker PATCH route

In `src/app/api/admin/workers/[workerId]/route.ts` (guard stays `verifyAdminApiAccess`):

- Accept optional `paymentDetails: { bankSortCode?, bankAccountNumber?, utrNumber?, niNumber? }`. Only provided fields update; omitted fields untouched.
- **Never return current values** in any response — write-only from the client's perspective. Responses confirm success plus the new masked last-4 only.
- Server-side validation (reuse the induction route's rules so the two can't drift):
  - Sort code: 6 digits (accept `12-34-56` or `123456`, store normalised).
  - Account number: 8 digits.
  - UTR: 10 digits.
  - NI: `^[A-Z]{2}\d{6}[A-D]$` (case-insensitive).
  - Bank fields must be updated **as a pair** (sort code + account number together) — reject one without the other: "Enter the sort code and account number together."
- On success also set `payment_details_updated_at = now()` and `payment_details_updated_by` (the admin's name) — small migration:

```sql
alter table workers
  add column if not exists payment_details_updated_at timestamptz,
  add column if not exists payment_details_updated_by text;
```

## Task 2 — UI: "Payment details" card on the worker profile

On `/admin/workers/[workerId]` (in `WorkerProfile.tsx`), add a **Payment details** card:

- **Current state, masked:** "Bank: ••••4-56 · ••••5678", "UTR: ••••7891", "NI: ••••56A" — or an amber **"Not on file"** per missing item (that's the flag that someone can't be paid).
- An **"Update payment details"** button revealing a form with **blank** fields (never pre-filled — no way to read existing numbers out of the app):
  - Sort code, Account number, **Confirm account number** (typed twice; must match — this is where wages go, a silent typo is the worst outcome), UTR, NI. Each field optional, bank pair enforced together.
  - Inline validation matching the server rules.
  - Confirm dialog on save: "Update payment details for Dave Jones? New account ending **5678**. Future payments will use these details."
- After saving: masked display refreshes with the new last-4, plus a quiet note "Payment details updated 14 Aug 2026 by Alex Jenkins" (from the new columns).
- Show the card for **all roles** (employed staff have bank details too; UTR/NI rows shown per role as relevant).

## Task 3 — Guard rails

- Foreman API/pages: no access to any of this (verify the guard).
- The masked profile view, CIS statement export and wages register keep working unchanged with updated details — next Bank CSV export picks up the new account automatically (it reads live worker data at export time; confirm this and note it in the PR).
- Rate-limit is inherited from the admin routes; no extra work needed.

## Task 4 — Verify

- Update a test worker's bank details → masked last-4 changes; export a Bank CSV for a claim involving them → new full account number appears correctly.
- Mismatched "confirm account number" → blocked client-side; single bank field without its pair → blocked server-side too (test with a direct API call).
- Bad formats (5-digit sort code, 9-digit account, 9-digit UTR, malformed NI) → clear errors.
- No API response anywhere contains a full stored number (check the network tab).
- "Updated … by …" note appears after a change.
- Foreman login cannot reach the endpoint.

## Suggested order
Task 1 → 2 → 3 → 4. Commit each separately.

---

## Notes
- **Why fields are never pre-filled:** an admin screen that shows full bank numbers becomes the obvious place for them to leak (screenshots, shoulder-surfing, a compromised admin login). Write-only editing gives the office full control with nothing readable — the same model banks use ("enter your new details", never "here are your current ones").
- If a worker disputes what's on file, the office confirms the **last 4 digits** with them verbally and re-enters the details fresh — same as any payroll department.
- **Bank CSV:** wages register / payroll export prefers the worker's **live** `bank_sort_code` / `bank_account_number` at export time (falling back to ledger payee snapshot only if the worker has no bank on file). After an admin correction, the next Bank CSV uses the new account.
