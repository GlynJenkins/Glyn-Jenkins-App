# Cursor Brief — Admin Reveal for Bank / UTR / NI (with audit trail)

**Goal:** Admin/Management can **reveal a worker's full bank details, UTR and NI number** on the worker profile — at **pending** stage (to check details and verify with HMRC before activation) and at active stage (the office currently hand-keys payments into the bank, so they need to read the real numbers). Values stay masked by default; every reveal is logged.

**Context:** masking today is display-only everywhere, with no reveal path. Full values already exist in the `workers` table and are used by the Bank CSV export. This brief adds a controlled read path — the *write* path is `docs/admin-payment-details-editor.md`.

**How to use:** save as `docs/admin-reveal-sensitive-details.md`, do the tasks in order, commit each separately.

---

## Task 1 — Audit table

```sql
create table sensitive_reveals (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id),
  revealed_by text not null,          -- admin's name
  revealed_at timestamptz not null default now(),
  fields text not null                -- e.g. 'bank,utr,ni'
);
create index idx_sensitive_reveals_worker on sensitive_reveals(worker_id);
alter table sensitive_reveals enable row level security;
-- no public policies; service-role access only, like the rest of the schema
```

## Task 2 — Reveal endpoint

`POST /api/admin/workers/[workerId]/reveal` — guard `verifyAdminApiAccess`:

- Returns the worker's full `bank_sort_code` (formatted `12-34-56`), `bank_account_number`, `utr_number`, `ni_number` — nulls where not on file.
- Inserts a `sensitive_reveals` row (worker, admin name, fields returned) on **every call**.
- **Critical: the full values must never be in the normal profile page payload** — only this endpoint returns them, only when explicitly called. The profile page keeps receiving masked values as today.
- Standard admin rate limiting applies; add a modest per-admin cap (e.g. 30 reveals / 10 min) so a compromised session can't bulk-harvest the whole workforce quickly.

## Task 3 — Profile UI

On `/admin/workers/[workerId]` (`WorkerProfile.tsx`), works for **pending and active** workers alike:

- Next to the masked bank / UTR / NI values, an **eye icon "Reveal"** button. Clicking calls the endpoint once and swaps all three to their full values.
- While revealed:
  - Each value gets a **Copy** button (copies the raw digits) — the office is hand-keying these into a bank; copy-paste beats retyping and eliminates transposition errors. Sort code copies without dashes if the bank field wants plain digits (copy as `123456`).
  - Auto-hide after **60 seconds** or when the admin clicks "Hide" / navigates away — masked is always the resting state.
- Below the values, a quiet line from the audit trail: "Last revealed 14 Aug 2026 by Alex Jenkins".
- The pending-worker review screen (where new enrolments are checked before activation) gets the same reveal — this is where the office confirms details and runs the HMRC CIS verification **before** anyone becomes payable.

## Task 4 — Guard rails

- Foreman (and future supervisor) logins: no reveal button, and the endpoint rejects them — test with a direct API call, not just the UI.
- Reveal works on pending, active and inactive workers (leavers sometimes need a final payment).
- Nothing sensitive is written to server logs — log the reveal *event*, never the values.

## Task 5 — Verify

- Reveal on a pending worker → full details show, copy buttons work, auto-hides after 60s, audit row written with the right admin name.
- Refresh the profile → masked again; network tab confirms the page payload only ever contains masked values.
- Two reveals → two audit rows; "Last revealed" line updates.
- Foreman API call → rejected.
- Hammer the endpoint past the cap → rate-limited with a clear message.

## Suggested order
Task 1 → 2 → 3 → 4 → 5. Commit each separately.

---

## Notes
- **Why reveal-on-demand instead of just unmasking:** the office genuinely needs to read these values (manual bank entry now, HMRC verification always) — but a screen that permanently shows full bank details becomes the leak point for screenshots, shoulder-surfing and any compromised admin login. Click-to-reveal with an audit trail gives full access *and* a record of exactly who looked at what, when — which is also good GDPR hygiene for this class of data.
- Once you move to Bank CSV uploads, reveals will naturally become rare (HMRC verification and disputes only) — the audit trail lets you notice if they don't.
- Pairs with `docs/admin-payment-details-editor.md` (fixing details) — the reveal shows a typo, the editor corrects it, on the same card.
