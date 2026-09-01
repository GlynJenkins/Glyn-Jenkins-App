# Fix Brief — QA inspection PDF missing snag photos (raised + fix)

**Symptom (reproduced by Alex):** Plot 66 Pre-plaster, Trowbridge Bellway — 2 snags raised with a photo each, foreman uploaded 2 fix photos back. The admin-downloaded inspection PDF shows **no raised-snag photo and no fix photo** (and, depending on path, no snag section at all).

**Root cause (confirmed in code):**
1. `src/lib/qa/load-qa-inspection-pdf.ts` — the PDF **data loader never queries `qa_inspection_snags`** (grep: 0 references). So `input.snags` is `undefined` when the PDF is generated, and the whole snag section is skipped.
2. `src/lib/qa/generate-inspection-pdf.ts:293-308` — the snag section renders **text only** (round, status, description, fix note). It **never embeds the photos** (`raised_photo_path` = your defect photo, `fixed_photo_path` = the foreman's fix photo).

The data is all saved correctly — this is purely the PDF build. The admin download route already regenerates the PDF fresh (`generateQaInspectionPdf(loadQaInspectionPdfData(...))`), so once the loader and template are fixed, existing inspections will produce correct PDFs with no re-inspection needed.

**Files:** `src/lib/qa/load-qa-inspection-pdf.ts`, `src/lib/qa/generate-inspection-pdf.ts`.

---

## Task 1 — Load snags (and their photos) into the PDF input

In `load-qa-inspection-pdf.ts`:

- Query `qa_inspection_snags` for this `inspection_id`, ordered by `round`, then `sort_order`.
- For each snag, download **both** photos with the existing `downloadStorageFile` helper: `raised_photo_path` and `fixed_photo_path`. **Use the same storage bucket the snag routes upload to** — the fix route uploads to path `qa/{site}/{plot}/{stage}/…` (confirm the bucket name in `foreman/qa-snags/[snagId]/fix/route.ts` and `qa/inspections/[inspectionId]/snags/route.ts` and pass that bucket to `downloadStorageFile`, since it currently defaults to `worker-documents`). If a snag has no photo, pass `null` — don't fail the PDF.
- Build `input.snags` as:
  ```ts
  snags: snags.map((s, i) => ({
    round: s.round,
    index: i + 1,
    description: s.description,
    fixed: s.fixed,
    fixedNote: s.fixed_note ?? null,
    fixedAt: s.fixed_at ?? null,
    raisedPhoto: raisedBuffer ?? null,   // Buffer | null
    raisedPhotoMime: mimeFromPath(s.raised_photo_path),
    fixedPhoto: fixedBuffer ?? null,     // Buffer | null
    fixedPhotoMime: mimeFromPath(s.fixed_photo_path),
  }))
  ```
- Extend the `input.snags` type in `generate-inspection-pdf.ts` to carry these photo buffers + mimes.

## Task 2 — Draw the snag photos in the PDF

In `generate-inspection-pdf.ts`, inside the existing `if (input.snags?.length)` block, after each snag's text:

- If `raisedPhoto` present: label **"Raised (defect):"** and draw the image.
- If `fixedPhoto` present: label **"Fixed by foreman:"** and draw the image.
- Lay the two **side by side** where the page width allows (defect left, fix right — the before/after is the whole point), each ~230–250 px wide, aspect-ratio preserved; embed via `embedPng`/`embedJpg` by mime (reuse the inspection-photo embedding pattern already in this file).
- Page-break safety: if the images don't fit in the remaining space, add a new page before drawing (same `ensureSpace`/new-page pattern used for the signature and inspection photos). Never split an image across a page.
- Keep the existing round/status/description/fix-note text above the photos.

## Task 3 — Verify

- Re-download the **Plot 66 Pre-plaster** PDF (no data changes needed) → both snags now show the **raised defect photo** and the **foreman's fix photo** side by side, with round, status FIXED, and the fix note.
- A snag with no fix photo yet (still OPEN) → shows the raised photo only, status OPEN.
- An inspection that passed first time with no snags → PDF unchanged (no snag section).
- Multi-round case (failed, fixed, failed again, fixed, passed) → every round's photos appear in order.
- Check a long snag list flows onto extra pages cleanly with no clipped images.

---

## Note
Nothing about the saved data is wrong, so this needs no migration and no re-inspection of Plot 66 — just re-download after the fix ships. Worth confirming the QA storage bucket name once here so the loader points at the right one; that's the single most likely thing to get wrong.
