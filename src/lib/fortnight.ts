import type { SupabaseClient } from '@supabase/supabase-js'

export type PayCycleSettings = {
  periodStartAnchor: string // YYYY-MM-DD
  payDayAnchor:      string // YYYY-MM-DD
}

export type FortnightPeriod = {
  start:         Date
  end:           Date
  payDate:       Date
  lockTime:      Date
  isLocked:      boolean
  isGracePeriod:  boolean
  label:         string
  payLabel:      string
  upcomingPays:  { date: Date; label: string }[]
}

const PERIOD_DAYS   = 14
const GRACE_HOURS   = 24

const DEFAULT_SETTINGS: PayCycleSettings = {
  periodStartAnchor: '2025-06-15',
  payDayAnchor:      '2025-07-03',
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

type PeriodCore = {
  index:        number
  start:        Date
  end:          Date
  payDate:       Date
  lockTime:      Date
  effectiveOpen: Date
}

function buildPeriodCore(index: number, cfg: PayCycleSettings, prevLockTime?: Date): PeriodCore {
  const anchor    = parseLocalDate(cfg.periodStartAnchor)
  const payAnchor = parseLocalDate(cfg.payDayAnchor)
  const start     = addDays(anchor, index * PERIOD_DAYS)
  const end       = addDays(start, PERIOD_DAYS - 1)
  const payDate  = addDays(payAnchor, index * PERIOD_DAYS)
  const lockTime = addHours(endOfLocalDay(end), GRACE_HOURS)

  let effectiveOpen = startOfLocalDay(start)
  if (prevLockTime && atOrBefore(effectiveOpen, prevLockTime)) {
    // Next period cannot open until the previous period's grace has ended — prevents overlap
    effectiveOpen = new Date(prevLockTime.getTime() + 1)
  }

  return { index, start, end, payDate, lockTime, effectiveOpen }
}

function atOrBefore(a: Date, b: Date): boolean {
  return a.getTime() <= b.getTime()
}

function periodIndexForDate(at: Date, cfg: PayCycleSettings): number {
  const anchor = parseLocalDate(cfg.periodStartAnchor)
  const daysSince = daysBetween(anchor, startOfLocalDay(at))
  return Math.max(0, Math.floor(daysSince / PERIOD_DAYS))
}

function toFortnightPeriod(
  core: PeriodCore,
  at: Date,
  cfg: PayCycleSettings,
  opts: { isLocked: boolean; isGracePeriod: boolean }
): FortnightPeriod {
  const upcomingPays = [0, 1, 2].map((offset) => {
    const d = addDays(core.payDate, offset * PERIOD_DAYS)
    return { date: d, label: fmtFull(d) }
  })

  return {
    start:        core.start,
    end:          core.end,
    payDate:       core.payDate,
    lockTime:      core.lockTime,
    isLocked:     opts.isLocked,
    isGracePeriod: opts.isGracePeriod,
    label:        `${fmtShort(core.start)} – ${fmtShort(core.end)}`,
    payLabel:      fmtFull(core.payDate),
    upcomingPays,
  }
}

/**
 * Which fortnight is open for claim submission right now.
 * Includes a 24-hour grace after the work window ends. During grace, claims still
 * attach to that fortnight — the next period cannot open until grace ends.
 */
export function computeFortnight(at: Date, settings?: PayCycleSettings | null): FortnightPeriod {
  const cfg = settings ?? DEFAULT_SETTINGS
  const now = at
  const idx = periodIndexForDate(now, cfg)

  // Check current and previous period — grace on the previous blocks the next from opening
  for (let i = idx; i >= Math.max(0, idx - 1); i--) {
    const prevLock = i > 0 ? buildPeriodCore(i - 1, cfg).lockTime : undefined
    const core      = buildPeriodCore(i, cfg, prevLock)

    if (now >= core.effectiveOpen && now <= core.lockTime) {
      const inGrace = now > endOfLocalDay(core.end)
      return toFortnightPeriod(core, now, cfg, { isLocked: false, isGracePeriod: inGrace })
    }
  }

  // Locked — show the calendar period for display, but submissions closed
  const prevLock = idx > 0 ? buildPeriodCore(idx - 1, cfg).lockTime : undefined
  const core      = buildPeriodCore(idx, cfg, prevLock)

  return toFortnightPeriod(core, now, cfg, {
    isLocked:     true,
    isGracePeriod: false,
  })
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
