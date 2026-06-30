/** Safely parse a fetch response that should be JSON (avoids Safari's cryptic parse error). */
export async function parseJsonResponse(res: Response): Promise<{
  ok: boolean
  data: Record<string, unknown>
  error?: string
}> {
  const text = await res.text()

  if (!text.trim()) {
    return {
      ok: false,
      data: {},
      error: res.ok
        ? 'Empty response from server.'
        : `Request failed (${res.status}). Please try again.`,
    }
  }

  try {
    const data = JSON.parse(text) as Record<string, unknown>
    if (res.ok) {
      return { ok: true, data }
    }
    return {
      ok: false,
      data,
      error: typeof data.error === 'string'
        ? data.error
        : `Request failed (${res.status}). Please try again.`,
    }
  } catch {
    if (res.status === 413) {
      return {
        ok: false,
        data: {},
        error: 'Photo is too large. Move closer to the work or retake with a smaller image.',
      }
    }
    return {
      ok: false,
      data: {},
      error: `Request failed (${res.status}). Please try again.`,
    }
  }
}
