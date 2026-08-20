/** Shared home-address rules for induction (client + API) and admin edit. */

export type HomeAddressParseOk = { ok: true; value: string }
export type HomeAddressParseErr = { ok: false; error: string }
export type HomeAddressParseResult = HomeAddressParseOk | HomeAddressParseErr

const MIN_LEN = 10
const MAX_LEN = 300

/**
 * Validate a home address for enrolment / admin edit.
 * Required, 10–300 chars after trim.
 */
export function parseHomeAddress(raw: string | null | undefined): HomeAddressParseResult {
  const value = String(raw ?? '').trim().replace(/\r\n/g, '\n')
  if (!value) {
    return { ok: false, error: 'Enter your full home address including postcode.' }
  }
  if (value.length < MIN_LEN || value.length > MAX_LEN) {
    return {
      ok: false,
      error: 'Enter your full home address including postcode.',
    }
  }
  return { ok: true, value }
}
