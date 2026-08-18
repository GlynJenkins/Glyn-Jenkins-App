/** Shared date-of-birth rules for induction (client + API) and admin display. */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type DobParseOk = { ok: true; value: string; age: number }
export type DobParseErr = { ok: false; error: string }
export type DobParseResult = DobParseOk | DobParseErr

/** Calendar age in whole years on `asOf` (defaults to today, local). */
export function ageFromDateOfBirth(iso: string, asOf: Date = new Date()): number | null {
  if (!ISO_DATE_RE.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  const probe = new Date(y, m - 1, d)
  if (
    Number.isNaN(probe.getTime()) ||
    probe.getFullYear() !== y ||
    probe.getMonth() !== m - 1 ||
    probe.getDate() !== d
  ) {
    return null
  }

  let age = asOf.getFullYear() - y
  const month = asOf.getMonth() + 1
  const day = asOf.getDate()
  if (month < m || (month === m && day < d)) age -= 1
  return age
}

/**
 * Validate an ISO `YYYY-MM-DD` date of birth for enrolment.
 * Minimum age 16; reject future dates and ages over 100.
 */
export function parseDateOfBirth(raw: string | null | undefined): DobParseResult {
  const value = String(raw ?? '').trim().slice(0, 10)
  if (!value) {
    return { ok: false, error: 'Enter your date of birth.' }
  }
  if (!ISO_DATE_RE.test(value)) {
    return { ok: false, error: 'Enter a valid date of birth.' }
  }

  const age = ageFromDateOfBirth(value)
  if (age == null) {
    return { ok: false, error: 'Enter a valid date of birth.' }
  }
  if (age < 0) {
    return { ok: false, error: 'Date of birth cannot be in the future.' }
  }
  if (age < 16) {
    return { ok: false, error: 'You must be at least 16 to register.' }
  }
  if (age > 100) {
    return { ok: false, error: 'Please check the date of birth.' }
  }

  return { ok: true, value, age }
}

export function isUnder18(iso: string | null | undefined): boolean {
  if (!iso) return false
  const age = ageFromDateOfBirth(iso.slice(0, 10))
  return age != null && age >= 0 && age < 18
}

/** e.g. "5 Aug 1990 (36)" — returns null if invalid/missing. */
export function formatDateOfBirthWithAge(iso: string | null | undefined): string | null {
  if (!iso) return null
  const value = iso.slice(0, 10)
  const age = ageFromDateOfBirth(value)
  if (age == null || age < 0) return null
  const [y, m, d] = value.split('-').map(Number)
  const label = new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${label} (${age})`
}
