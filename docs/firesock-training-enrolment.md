# Feature Brief — Mandatory Firesock Training Certificate at Enrolment

**Goal:** Every site-trade worker must complete the ARC Building Solutions firesock training and upload their certificate as part of induction — **registration is blocked without it**. The induction form links to the training with clear instructions, so anyone who hasn't done it yet can do it there and then. Admin can also add certificates against existing workers, and see who's still missing one.

**Training link:** https://www.arcbuildingsolutions.co.uk/protect/knowledge/vle/

**Who needs it — three tiers:**
- **Required (registration blocked without it):** bricklayer, labourer, apprentice, foreman, jetwasher.
- **Optional (shown, but doesn't block):** contracts manager, site supervisor — the block appears with softer wording ("If you already hold a firesock training certificate, upload it here") and the upload is optional; they can register without it.
- **Hidden entirely:** management — like the CIS fields.

Define a small helper (e.g. `firesockRequirement(role): 'required' | 'optional' | 'hidden'`) used by both the form and the API so the two can never disagree.

**Repo context:** the induction form (`src/app/induction/page.tsx`) and API (`src/app/api/induction/route.ts`) already handle conditional required uploads (see the insurance certificate and SSSTS/SMSTS handling) — follow the same patterns: `FileUploadArea` on the client, `validateUpload(file, 'document', ...)` + Supabase Storage on the server. If the image-compression helper from `docs/fix-iphone-registration-error.md` (`prepareImage`) has been built, run this upload through it too.

**How to use:** save as `docs/firesock-training-enrolment.md`, do the tasks in order, commit each separately.

---

## Task 1 — Database

One column (Alex runs in Supabase SQL editor):

```sql
alter table workers add column if not exists firesock_certificate_url text;
```

Nullable on purpose — existing workers registered before this feature won't have one yet (Task 4 covers them).

## Task 2 — Induction form: training card + required upload

In the **documents/uploads section** of the induction form, add a **Firesock Training block** (shown whenever `firesockRequirement(role)` isn't `hidden` — i.e. everyone except Management):

1. An instruction card, styled to stand out (amber/orange border, like an important notice):
   - Heading: **"Firesock training — required"**
   - Text for **required** roles: *"All operatives must complete the free ARC Building Solutions firesock training before working on our sites. You should have received the link already — if you haven't done the training yet, complete it now (it's quick), then upload the certificate you're issued. **You cannot register without it.**"*
   - Text for **optional** roles (contracts manager, site supervisor): *"If you already hold a firesock training certificate, upload it here so it's on your record. If not, you can complete the free training via the link below at any time."* (No blocking language, and the upload is clearly marked optional.)
   - A clearly visible button/link on both variants: **"Open firesock training →"** → `https://www.arcbuildingsolutions.co.uk/protect/knowledge/vle/`, opening in a **new tab** (`target="_blank" rel="noopener"`) so a half-filled form isn't lost.
2. Below the card, a `FileUploadArea`: label **"Firesock training certificate"**, accepting the same file types as the other document uploads (photo or PDF of the certificate is fine). Marked required or optional per the tier.
3. Zod/validation: required only for the **required** tier, with the message **"Upload your firesock training certificate — you can't register without it."** For the optional tier, validate the file only if one is provided. Skip entirely for Management (mirror how UTR/tax are skipped in `superRefine`).

## Task 3 — Induction API

In `src/app/api/induction/route.ts`:

1. Read the new file from the FormData (e.g. `firesockCert`).
2. Use the same `firesockRequirement(role)` helper: **required** tier → reject with a clear 400 if missing — `"Firesock training certificate is required."`; **optional** tier → process the file only if present; **hidden** → ignore any file. Any provided file goes through `validateUpload(firesockCert, 'document', 'Firesock training certificate')` like the other documents.
3. Upload to storage alongside the other induction documents (same bucket/path conventions) and save the path to `workers.firesock_certificate_url` in the insert (`null` when nothing uploaded).
5. Add `firesock_certificate_url` to the missing-column fallback check (the `missingOptionalCol` regex + legacy-row strip) so the route degrades gracefully if the migration hasn't run yet, same as the other newer columns.

## Task 4 — Existing workers: admin upload + missing list

New enrolments are blocked without the cert; existing workers catch up via admin:

1. **Worker profile** (`/admin/workers/[workerId]`): in the documents/qualifications card, show a **Firesock training** row —
   - Uploaded → green tick + **View certificate** (signed URL, like the SSSTS cert).
   - Missing → amber **"Not on file"** badge + an **"Upload certificate"** control so the office can add it (new small endpoint or extend the existing worker PATCH route, guard `verifyAdminApiAccess`, same storage + validation as Task 3). Show the row for every role except Management; for contracts managers / site supervisors without one, use a neutral grey "Not on file" (it's optional for them) rather than amber.
2. **Workers list** (`/admin/workers`): on the Active tab, show a small amber badge (e.g. "No firesock cert") on workers in the **required** tier, and a count at the top — e.g. **"7 active workers missing firesock training"** — that filters the list when tapped. This gives Alex the chase-list as people complete the training. Optional-tier roles don't count towards it.

## Task 5 — Verify

- Register a **bricklayer** without the certificate → blocked with the clear message; the training link opens in a new tab and the form keeps its data.
- Register a bricklayer **with** a certificate (photo and PDF both) → succeeds; cert viewable from the worker's profile.
- Register a **Contracts Manager / Site Supervisor** → the softer optional card shows; registering works both with and without a certificate, and an uploaded one appears on their profile.
- Register a **Management** enrolment → no firesock block shown at all, registers fine with nothing uploaded.
- Existing worker without a cert shows the amber badge; admin uploads one from the profile → badge clears, cert viewable; the missing-count drops.
- Foreman login can't reach the admin upload endpoint.

## Suggested order
Task 1 → 2 → 3 → 4 → 5. Commit each separately.

---

## Notes
- **Why block at enrolment:** firesock installation is inspected and evidenced per plot (Roof Firesocks feature) — proving every installer is trained closes the loop for the developer and keeps warranty/building-control queries painless.
- The certificate has no expiry handling for now — if ARC ever adds renewal dates, a `firesock_certificate_expires` column and the same amber-badge treatment can be bolted on later (would pair well with the planned training matrix).
