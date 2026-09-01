/**
 * Open a signed document URL without losing the click's user activation.
 * Fetching first then calling window.open() is blocked by Chrome as a popup.
 *
 * Opens a blank tab synchronously, then redirects it once the fetch resolves.
 * Falls back to an anchor click if the blank tab was blocked.
 *
 * Do not pass `noopener` to window.open features — that makes open() return null
 * and we lose the handle needed to set location after the fetch.
 */
export async function openSignedDocument(
  fetchUrl: string,
  options?: {
    /** Called when fetch/open fails (after closing any blank tab). */
    onError?: (message: string) => void
  },
): Promise<boolean> {
  const win = window.open('about:blank', '_blank')
  if (win) {
    try {
      win.opener = null
    } catch {
      /* ignore */
    }
  }

  try {
    const res = await fetch(fetchUrl)
    const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null
    if (!res.ok || !json?.url) {
      throw new Error(json?.error ?? 'Could not open document.')
    }

    if (win && !win.closed) {
      win.location.href = json.url
      return true
    }

    const a = document.createElement('a')
    a.href = json.url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
    return true
  } catch (err) {
    if (win && !win.closed) {
      try {
        win.close()
      } catch {
        /* ignore */
      }
    }
    const message = err instanceof Error ? err.message : 'Could not open document.'
    options?.onError?.(message)
    return false
  }
}
