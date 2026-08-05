export type BankHoliday = {
  date: string
  title: string
}

/** Hardcoded England & Wales fallback if the gov.uk feed is unreachable. */
const FALLBACK_BY_YEAR: Record<number, BankHoliday[]> = {
  2026: [
    { date: '2026-01-01', title: "New Year's Day" },
    { date: '2026-04-03', title: 'Good Friday' },
    { date: '2026-04-06', title: 'Easter Monday' },
    { date: '2026-05-04', title: 'Early May bank holiday' },
    { date: '2026-05-25', title: 'Spring bank holiday' },
    { date: '2026-08-31', title: 'Summer bank holiday' },
    { date: '2026-12-25', title: 'Christmas Day' },
    { date: '2026-12-28', title: 'Boxing Day' },
  ],
  2027: [
    { date: '2027-01-01', title: "New Year's Day" },
    { date: '2027-03-26', title: 'Good Friday' },
    { date: '2027-03-29', title: 'Easter Monday' },
    { date: '2027-05-03', title: 'Early May bank holiday' },
    { date: '2027-05-31', title: 'Spring bank holiday' },
    { date: '2027-08-30', title: 'Summer bank holiday' },
    { date: '2027-12-27', title: 'Christmas Day' },
    { date: '2027-12-28', title: 'Boxing Day' },
  ],
}

type GovDivision = {
  division?: string
  events?: { title?: string; date?: string }[]
}

type GovFeed = Record<string, GovDivision>

async function fetchGovUkBankHolidays(): Promise<BankHoliday[] | null> {
  try {
    const res = await fetch('https://www.gov.uk/bank-holidays.json', {
      next: { revalidate: 86_400 },
    })
    if (!res.ok) {
      console.error('[bank-holidays] gov.uk feed HTTP', res.status)
      return null
    }
    const json = (await res.json()) as GovFeed
    const events = json['england-and-wales']?.events ?? []
    return events
      .filter((e): e is { title: string; date: string } => !!e.title && !!e.date)
      .map((e) => ({ date: e.date.slice(0, 10), title: e.title }))
  } catch (err) {
    console.error('[bank-holidays] gov.uk feed failed:', err)
    return null
  }
}

function fallbackForYear(year: number): BankHoliday[] {
  return FALLBACK_BY_YEAR[year] ?? []
}

/** England & Wales bank holidays whose date falls in `year`. */
export async function getBankHolidays(year: number): Promise<BankHoliday[]> {
  const all = await fetchGovUkBankHolidays()
  if (!all) return fallbackForYear(year)

  const inYear = all.filter((e) => e.date.startsWith(`${year}-`))
  if (inYear.length === 0) return fallbackForYear(year)
  return inYear
}

export async function getBankHolidayDates(year: number): Promise<Set<string>> {
  const events = await getBankHolidays(year)
  return new Set(events.map((e) => e.date))
}

export async function bankHolidayCount(year: number): Promise<number> {
  return (await getBankHolidays(year)).length
}
