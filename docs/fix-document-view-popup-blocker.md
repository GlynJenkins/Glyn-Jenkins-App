# Fix Brief — "View document" buttons blocked by popup blocker

**Symptom:** Clicking **View passport** (worker profile), **View document** (Right to Work register), and other document-view buttons does nothing / "won't load." It is **not** an old-document problem — the API returns a valid signed URL (confirmed: `/api/admin/workers/[id]/documents?type=rtw` returns 200 with a working URL for both new and pre-RTW workers; the passport opens fine when the popup isn't blocked).

**Root cause:** These buttons do `await fetch(...)` to get the signed URL, **then** call `window.open(url, '_blank')`. Opening a new tab *after* an `await` loses the browser's "user activation" from the click, so Chrome's popup blocker silently blocks it — nothing opens. (The subcontract-agreement download works because it uses an anchor-click pattern instead.)

**Affected files (all use the fragile `window.open(json.url, …)` after `await`):**
- `src/app/admin/workers/[workerId]/_components/RightToWorkCard.tsx:88` (View passport)
- `src/app/admin/right-to-work/_components/RightToWorkRegisterTable.tsx:95` (register View document)
- `src/app/admin/workers/[workerId]/_components/WorkerProfile.tsx:884` (firesock cert / doc view)
- `src/app/admin/training/_components/TrainingMatrixTable.tsx:66` (training matrix doc view)

---

## The fix (apply to all four)

Open the new tab **synchronously inside the click handler** (allowed — it's in the user gesture), then point it at the signed URL once the fetch resolves. Fall back to an anchor click if the tab was blocked anyway.

Replace each handler's `await fetch … window.open(json.url, …)` block with this shape:

```ts
const openDoc = async () => {
  setBusy(true); setError(null)
  // Open the tab NOW, in the click gesture, before any await:
  const win = window.open('', '_blank', 'noopener,noreferrer')
  try {
    const res = await fetch(`/api/admin/workers/${id}/documents?type=rtw`)  // (or the relevant URL)
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.url) throw new Error(json?.error ?? 'Could not open document.')
    if (win) {
      win.location.href = json.url            // redirect the already-open tab
    } else {
      // popup still blocked — fall back to an anchor click (rarely blocked)
      const a = document.createElement('a')
      a.href = json.url; a.target = '_blank'; a.rel = 'noopener noreferrer'
      document.body.appendChild(a); a.click(); a.remove()
    }
  } catch (err) {
    if (win) win.close()
    setError(err instanceof Error ? err.message : 'Could not open document.')
  } finally {
    setBusy(false)
  }
}
```

Keep each call's existing fetch URL and busy/error state names — only the open mechanism changes (open blank tab first → redirect it → anchor fallback).

**Optional tidy:** factor this into one shared helper, e.g. `openSignedDocument(fetchUrl, { onError })` in `src/lib/…`, and call it from all four places so the pattern can't drift again.

## Verify

- On a normal Chrome window (not an automation/extension context), click **View passport** on a pending worker → the passport opens in a new tab, no blocked-popup icon.
- Same for the RTW register **View document**, the firesock **View certificate**, and the training-matrix document view.
- Works for both a new worker (has `right_to_work_document_url`) and an older pre-RTW worker (falls back to `id_document_url`).
- An error (e.g. missing file) shows the inline error message, and the blank tab closes rather than hanging.

---

## Note
This is why it looked like "maybe the old document": the passport that predated the RTW feature falls back correctly to the ID upload, so the data was never the problem — the tab was just being blocked before it could load. The fix makes every document-view button reliable across browsers.
