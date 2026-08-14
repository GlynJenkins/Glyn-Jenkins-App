# Cursor Brief — Enrolment upload safety (do alongside the firesock change)

**Context:** `docs/firesock-training-enrolment.md` adds a fourth photo upload (firesock training certificate) to the induction form. The enrolment form previously failed when combined photo uploads exceeded the platform's ~4.5 MB request limit (see `docs/fix-iphone-registration-error.md`). Adding another photo makes that failure more likely — so the two changes must land together, and enrolment must be regression-tested afterwards.

**Do the tasks in order. Commit each separately.**

---

## Task 1 — Check whether client-side photo compression is already built

Look in `src/app/induction/page.tsx` for a `prepareImage` (or equivalent) helper that downscales/re-encodes photos before they're appended to the FormData.

- **If it exists:** confirm the new firesock certificate upload goes through it too (only images — PDFs pass through unchanged). Then skip to Task 3.
- **If it does not exist:** do Task 2 now — it is required before the firesock upload ships.

## Task 2 — Client-side photo compression (from the earlier brief — now required)

Implement Task 2 of `docs/fix-iphone-registration-error.md` in full:

- `prepareImage(file): Promise<File>` — HEIC/HEIF → JPEG first (`heic2any`, already a dependency), then draw to a canvas capped at **2000px** max dimension, export `canvas.toBlob(cb, 'image/jpeg', 0.8)`, return a new `.jpg` File. On any failure, fall back to the original file.
- Run **every image upload** on the induction form through it before `fd.append`: CSCS card, ID document, SSSTS/SMSTS certificate, insurance certificate, and the new **firesock training certificate**. PDFs pass through untouched.
- Show a brief "Optimising photo…" state per file so big photos don't feel frozen.
- Also implement Task 1 of that brief if not already done (defensive `res.json().catch(() => null)`, map 413 → "Your photos may be too large…", never surface raw browser errors).

**Acceptance:** an enrolment with four full-size iPhone photos (HEIC or JPEG) submits successfully first time; no scenario shows a raw browser error string.

## Task 3 — Deploy/migration ordering note

The firesock brief's DB change is a single nullable column:

```sql
alter table workers add column if not exists firesock_certificate_url text;
```

The induction route must tolerate the column not existing yet (it's included in the missing-column fallback per the firesock brief) — verify that fallback path compiles and strips `firesock_certificate_url` from the retry insert. Alex will run the SQL in Supabase around the same time as the deploy; neither order may break enrolment.

## Task 4 — Regression-test enrolment end to end

After both changes are in, verify every path:

1. **Bricklayer** with four real full-size iPhone photos (including firesock cert) → registers first time.
2. **Bricklayer** without a firesock cert → blocked with the clear message ("Upload your firesock training certificate — you can't register without it."), form data preserved, training link opens in a new tab.
3. **Contracts Manager / Site Supervisor** → optional wording; registers both with and without a certificate.
4. **Management** → no firesock block at all; registers with nothing uploaded (this path broke before — it must stay working).
5. Force an oversized/odd upload → user sees a friendly message about photo size, never "The string did not match the expected pattern" or a raw browser error.
6. Run one enrolment **before** the SQL migration has been applied (or simulate the column missing) → registration still succeeds via the fallback, without the firesock URL saved.

---

**Summary for the commit messages:** photo compression on all induction uploads + firesock upload integrated + enrolment regression-tested (bricklayer / supervisor / management paths).

---

## Implementation status (Aug 2026)

- **Task 1–2:** Done. `prepareInductionImage` (2000px / JPEG 0.8, HEIC via `heic2any`, PDF passthrough, fall back to original) runs on CSCS, ID, insurance, SSSTS/SMSTS, and firesock. Submit shows “Optimising photo…”, never raw browser errors; 413 mapped to the friendly size message. Per-image cap is **850 KB** so four photos stay under Vercel’s ~4.5 MB body limit.
- **Task 3:** Done. Induction insert strips `firesock_certificate_url` (with the other optional columns) when the column is missing.
- **Task 4:** Smoke on device after deploy — bricklayer four-photo + blocked without cert; supervisor optional; management with no firesock block; oversized upload friendly message.
