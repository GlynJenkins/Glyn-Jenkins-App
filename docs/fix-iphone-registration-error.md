# Bug Fix Brief — "The string did not match the expected pattern" on iPhone registration

**Symptom:** Registering with role = Management, everything filled correctly, tap Submit → red banner: **"The string did not match the expected pattern."** Reproduced on **both a laptop and a phone**; in both attempts the photos were taken on an **iPhone**.

**Diagnosis (narrowed down):**
- It is **not** the server, database, or the app's Zod validation — those all return friendly, specific messages.
- It failed on a **laptop as well as a phone**, so it is **not** an iOS-Safari or date-input quirk. The one factor common to both failures is **large iPhone photos**.
- **Cause: the combined photo upload is too large.** iPhone photos are big; three of them (CSCS, ID, SSSTS/SMSTS) easily exceed **Vercel's ~4.5 MB serverless request-body limit**. The file bytes are POSTed through the `/api/induction` route (`req.formData()`), so they count against that limit. Over it, Vercel/the platform rejects the request with a **non-JSON body**, and the client's `const json = await res.json()` throws a parse error that surfaces as this raw browser message (a `DOMException` is an `Error`, so `setServerError(err.message)` shows it verbatim).

Task 1 makes the error understandable; **Task 2 is the actual fix**; Task 3 is minor hardening.

**File:** mainly `src/app/induction/page.tsx` (the `onSubmit` handler and the file/date inputs).

---

## Task 1 — Handle the submit response gracefully (stop showing raw browser errors)

In `onSubmit`, the current code does `const json = await res.json()` before checking `res.ok`. If the response isn't JSON (a 413 "Payload Too Large", a WAF/edge block, an empty body), `res.json()` throws and the raw browser message is shown.

Change it to:
- Check `res.ok` and the status **before** parsing.
- Parse defensively: `const json = await res.json().catch(() => null)`.
- Map known statuses to clear messages, e.g.:
  - `413` (or a failed parse on a non-ok response) → **"Your photos may be too large to upload. Please try smaller photos, or complete this on a computer."**
  - other non-ok → `json?.error ?? 'Registration failed. Please try again.'`
- Wrap the whole handler so any unexpected `DOMException`/error shows a friendly fallback (**"Something went wrong submitting your registration. Please try again, or complete it on a computer."**) and `console.error(err)` for diagnostics — never show `err.message` raw to the user.

**Acceptance:** no scenario shows a raw browser string; the user always gets a plain-English, actionable message.

## Task 2 — Shrink each photo on the device before upload (THE FIX)

Before appending each image to the FormData, convert (if needed) and **downscale + re-encode to JPEG** on the client so uploads are small and consistent. This lets people take normal photos — no screenshots.

Add a helper `prepareImage(file): Promise<File>`:
1. **HEIC handling (important — iPhones shoot HEIC).** If the file is HEIC/HEIF (`file.type` is `image/heic`/`image/heif`, or the name ends `.heic`/`.heif`), convert it to a JPEG blob first using **`heic2any`** (already a dependency: `import heic2any from 'heic2any'`). Some browsers can't draw HEIC to a canvas, so this step must come first.
2. **Resize + compress.** Load the (now-JPEG) image, draw it to a canvas capped at **maxDimension 2000px** (keep aspect ratio), and export via `canvas.toBlob(cb, 'image/jpeg', 0.8)`. Reuse the `canvas.toBlob` pattern already in the signature pad.
3. Return a new `File` (name ending `.jpg`, type `image/jpeg`).
4. If anything fails, fall back to the original file (don't block the user) — the server still validates it.

- Run **CSCS card, ID document, and SSSTS/SMSTS certificate** through `prepareImage` before `fd.append`. A 2000px / 80% JPEG is easily readable and typically **200–400 KB** — three of them stay well under the limit.
- Only process images; pass PDFs through unchanged.
- Show a tiny "Optimising photo…" state while it runs so a big photo doesn't feel frozen.
- Keep the existing server-side file validation as-is.

**Acceptance:** a registration with three full-size iPhone photos (HEIC or JPEG) submits successfully, first time, with no screenshots.

## Task 2b (optional, belt-and-braces) — Upload photos straight to storage

For maximum robustness at scale, upload each file **directly from the browser to Supabase Storage** (via a signed upload URL) and send only the resulting file paths to `/api/induction`. This bypasses the server's ~4.5 MB request limit entirely, so even an un-compressed file would work. Bigger change than Task 2; do it if you want zero reliance on photo size. Task 2 alone solves the immediate problem for 100+ people.

## Task 3 — Make the CSCS expiry date iOS-safe

- Confirm the `<input type="date">` only ever holds/receives an ISO `YYYY-MM-DD` value (react-hook-form should already do this — never `setValue` it with a display-formatted string).
- Defensively, in `onSubmit`, ensure the date value passed to FormData is a plain ISO string (it will be) — no `Date` object.
- If issues persist specifically on iOS, consider a lightweight date picker component instead of the native input. Test on an actual iPhone.

## Task 4 — Verify (on an iPhone)

- Register a **Management** test user on an **iPhone/Safari** with three real iPhone photos → submits successfully, no error banner.
- Force an error (e.g. huge file) → the user sees a clear message about photo size, not a browser string.
- Repeat on desktop → still works.

---

## Immediate workaround (tell staff now)
A laptop does **not** help (the size limit is the same). Until this ships, make the photos smaller before uploading — e.g. **take a screenshot of each document/card and upload the screenshot** (screenshots are much smaller than full camera photos), or lower the camera resolution. The real fix is Task 2 (compress on device), after which normal photos will work.
