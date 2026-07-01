import type { SupabaseClient } from '@supabase/supabase-js'

export type PayCycleSettings = {
  periodStartAnchor: string // YYYY-MM-DD — month/day template for each cycle year
  payDayAnchor:      string // YYYY-MM-DD — pay day for the reference work window
}

export type FortnightPeriod = {
  start:         Date
  end:           Date
  applyBy:       Date
  payDate:       Date
  lockTime:      Date
  isLocked:      boolean
  isGracePeriod:  boolean
  label:         string
  applyByLabel:  string
  payLabel:      string
  upcomingPays:  { date: Date; label: string }[]
}

const CYCLE_DAYS    = 14  // days between period starts and between pay dates
const WORK_DAYS     = 13  // days of work in each window (apply day follows)
const GRACE_HOURS   = 24  // 24h after last work day to submit (the next calendar day)

const DEFAULT_SETTINGS: PayCycleSettings = {
  periodStartAnchor: '2026-06-15',
  payDayAnchor:      '2026-07-03',
}

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function endOfLocalDay(d: Date): Date {
  const e = new Date(d)
  e.setHours(23, 59, 59, 999)
  return e
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 3_600_000)
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor(
    (startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / 86_400_000
  )
}

function fmtShort(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function fmtFull(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function resolvePayCycleSettings(raw: {
  pay_cycle_period_start?: string | null
  pay_cycle_pay_day?:      string | null
} | null | undefined): PayCycleSettings {
  if (raw?.pay_cycle_period_start && raw?.pay_cycle_pay_day) {
    return {
      periodStartAnchor: raw.pay_cycle_period_start.slice(0, 10),
      payDayAnchor:      raw.pay_cycle_pay_day.slice(0, 10),
    }
  }
  return DEFAULT_SETTINGS
}

/** Most recent reference month/day on or before `at` (e.g. 15 Jun each year). */
function yearAnchorForDate(at: Date, cfg: PayCycleSettings): Date {
  const ref = parseLocalDate(cfg.periodStartAnchor)
  const month = ref.getMonth()
  const day = ref.getDate()
  let candidate = new Date(at.getFullYear(), month, day, 12, 0, 0, 0)
  if (startOfLocalDay(at) < startOfLocalDay(candidate)) {
    candidate = new Date(at.getFullYear() - 1, month, day, 12, 0, 0, 0)
  }
  return candidate
}

/** Days from last work day to pay day, derived from the reference cycle. */
function payOffsetFromWorkEnd(cfg: PayCycleSettings): number {
  const refStart = parseLocalDate(cfg.periodStartAnchor)
  const refWorkEnd = addDays(refStart, WORK_DAYS - 1)
  return daysBetween(refWorkEnd, parseLocalDate(cfg.payDayAnchor))
}

type PeriodCore = {
  index:        number
  start:        Date
  end:          Date
  applyBy:      Date
  payDate:       Date
  lockTime:      Date
  effectiveOpen: Date
}

function buildPeriodCore(
  index: number,
  cfg: PayCycleSettings,
  at: Date,
  prevLockTime?: Date,
): PeriodCore {
  const yearAnchor = yearAnchorForDate(at, cfg)
  const start      = addDays(yearAnchor, index * CYCLE_DAYS)
  const end        = addDays(start, WORK_DAYS - 1)
  const applyBy    = addDays(end, 1)
  const payDate    = addDays(end, payOffsetFromWorkEnd(cfg))
  const lockTime   = addHours(endOfLocalDay(end), GRACE_HOURS)

  let effectiveOpen = startOfLocalDay(start)
  if (prevLockTime && atOrBefore(effectiveOpen, prevLockTime)) {
    effectiveOpen = new Date(prevLockTime.getTime() + 1)
  }

  return { index, start, end, applyBy, payDate, lockTime, effectiveOpen }
}

function atOrBefore(a: Date, b: Date): boolean {
  return a.getTime() <= b.getTime()
}

function periodIndexForDate(at: Date, cfg: PayCycleSettings): number {
  const yearAnchor = yearAnchorForDate(at, cfg)
  const daysSince = daysBetween(yearAnchor, startOfLocalDay(at))
  return Math.max(0, Math.floor(daysSince / CYCLE_DAYS))
}

function toFortnightPeriod(
  core: PeriodCore,
  at: Date,
  opts: { isLocked: boolean; isGracePeriod: boolean }
): FortnightPeriod {
  const upcomingPays = [1, 2, 3].map((offset) => {
    const d = addDays(core.payDate, offset * CYCLE_DAYS)
    return { date: d, label: fmtFull(d) }
  })

  return {
    start:        core.start,
    end:          core.end,
    applyBy:      core.applyBy,
    payDate:       core.payDate,
    lockTime:      core.lockTime,
    isLocked:     opts.isLocked,
    isGracePeriod: opts.isGracePeriod,
    label:        `${fmtShort(core.start)} – ${fmtShort(core.end)}`,
    applyByLabel: fmtFull(core.applyBy),
    payLabel:      fmtFull(core.payDate),
    upcomingPays,
  }
}

/**
 * Which fortnight is open for claim submission right now.
 * Each cycle has 13 work days plus a final apply-by day (24h grace after the last work day).
 * The next period cannot open until submissions for the previous period have closed.
 */
export function computeFortnight(at: Date, settings?: PayCycleSettings | null): FortnightPeriod {
  const cfg = settings ?? DEFAULT_SETTINGS
  const now = at
  const idx = periodIndexForDate(now, cfg)

  for (let i = idx; i >= Math.max(0, idx - 1); i--) {
    const prevLock = i > 0 ? buildPeriodCore(i - 1, cfg, now).lockTime : undefined
    const core     = buildPeriodCore(i, cfg, now, prevLock)

    if (now >= core.effectiveOpen && now <= core.lockTime) {
      const inGrace = now > endOfLocalDay(core.end)
      return toFortnightPeriod(core, now, { isLocked: false, isGracePeriod: inGrace })
    }
  }

  const prevLock = idx > 0 ? buildPeriodCore(idx - 1, cfg, now).lockTime : undefined
  const core     = buildPeriodCore(idx, cfg, now, prevLock)

  return toFortnightPeriod(core, now, {
    isLocked:     true,
    isGracePeriod: false,
  })
}

/** Reference dates for the pay cycle that contains `at`. */
export function referenceCycleForDate(cfg: PayCycleSettings, at = new Date()): PayCycleSettings {
  const idx = periodIndexForDate(at, cfg)
  const core = buildPeriodCore(idx, cfg, at)
  return {
    periodStartAnchor: toLocalDateString(core.start),
    payDayAnchor:      toLocalDateString(core.payDate),
  }
}

export async function fetchPayCycleSettings(
  supabase: SupabaseClient
): Promise<PayCycleSettings> {
  const { data } = await supabase
    .from('admin_settings')
    .select('pay_cycle_period_start, pay_cycle_pay_day')
    .limit(1)
    .maybeSingle()

  return resolvePayCycleSettings(data)
}

export function listFortnightOptions(
  count: number,
  settings?: PayCycleSettings | null,
  at = new Date()
): FortnightPeriod[] {
  const cfg = settings ?? DEFAULT_SETTINGS
  const currentIdx = periodIndexForDate(at, cfg)
  const periods: FortnightPeriod[] = []

  for (let i = currentIdx; i >= currentIdx - count + 1; i--) {
    const prevLock = i > 0 ? buildPeriodCore(i - 1, cfg, at).lockTime : undefined
    const core = buildPeriodCore(i, cfg, at, prevLock)
    const isCurrent = i === currentIdx
    periods.push(
      toFortnightPeriod(core, at, {
        isLocked:     isCurrent ? at > core.lockTime : true,
        isGracePeriod: isCurrent && at > endOfLocalDay(core.end) && at <= core.lockTime,
      })
    )
  }

  return periods
}

export async function getCurrentFortnight(
  supabase: SupabaseClient
): Promise<FortnightPeriod> {
  const settings = await fetchPayCycleSettings(supabase)
  return computeFortnight(new Date(), settings)
}

export function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Locked'
  const days    = Math.floor(ms / (1000 * 60 * 60 * 24))
  const hours   = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  if (days > 0)  return `${days}d ${hours}h remaining`
  if (hours > 0) return `${hours}h ${minutes}m remaining`
  return `${minutes}m remaining`
}

/** @deprecated Use getCurrentFortnight(supabase) on the server. Kept for client preview only. */
export function getCurrentFortnightSync(settings?: PayCycleSettings | null): FortnightPeriod {
  return computeFortnight(new Date(), settings)
}
