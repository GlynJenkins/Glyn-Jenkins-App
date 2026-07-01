'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, AlertCircle, Loader2, PoundSterling, Shield, GraduationCap, Sun, Calendar } from 'lucide-react'
import { computeFortnight } from '@/lib/fortnight'

interface Props {
  initialAdminFee:     number
  initialInsuranceFee: number
  initialHolidayRate:  number
  initialCollegeRate:  number
  initialPeriodStart: string
  initialPayDay:      string
}

export default function SettingsForm({
  initialAdminFee, initialInsuranceFee, initialHolidayRate, initialCollegeRate,
  initialPeriodStart, initialPayDay,
}: Props) {
  const router = useRouter()
  const [adminFee,     setAdminFee]     = useState(initialAdminFee.toString())
  const [insuranceFee, setInsuranceFee] = useState(initialInsuranceFee.toString())
  const [holidayRate,  setHolidayRate]  = useState(initialHolidayRate.toString())
  const [collegeRate,  setCollegeRate]  = useState(initialCollegeRate.toString())
  const [periodStart, setPeriodStart]  = useState(initialPeriodStart)
  const [payDay,      setPayDay]      = useState(initialPayDay)
  const [success,      setSuccess]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [busy,         startTransition] = useTransition()

  const cyclePreview = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(payDay)) {
      return null
    }
    return computeFortnight(new Date(), { periodStartAnchor: periodStart, payDayAnchor: payDay })
  }, [periodStart, payDay])

  const handleSave = () => {
    setSuccess(false)
    setError(null)

    const af  = parseFloat(adminFee)
    const inf = parseFloat(insuranceFee)
    const hr  = parseFloat(holidayRate)
    const cr  = parseFloat(collegeRate)

    if (isNaN(af)  || af  < 0) { setError('Admin fee must be a positive number.');    return }
    if (isNaN(inf) || inf < 0) { setError('Insurance fee must be a positive number.'); return }
    if (isNaN(hr)  || hr  < 0) { setError('Holiday day rate must be a positive number.'); return }
    if (isNaN(cr)  || cr  < 0) { setError('College day rate must be a positive number.'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) { setError('Enter a valid booking window start date.'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payDay))      { setError('Enter a valid pay day date.'); return }

    startTransition(async () => {
      const res  = await fetch('/api/admin/settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          global_admin_fee:       af,
          insurance_fee:          inf,
          holiday_day_rate:       hr,
          college_day_rate:       cr,
          pay_cycle_period_start: periodStart,
          pay_cycle_pay_day:      payDay,
        }),
      })
      const json = await res.json()
      if (!res.ok) setError(json.error ?? 'Failed to save.')
      else {
        setSuccess(true)
        router.refresh()
      }
    })
  }

  const inputCls = 'w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-400 bg-white'

  return (
    <div className="space-y-4">

      {/* Admin Fee */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
            <PoundSterling className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800">Global Operative Admin Fee</h2>
            <p className="text-xs text-slate-500">Deducted from every worker&apos;s gross pay each period</p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Fee Amount (£)
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">£</span>
            <input
              type="number"
              min="0"
              step="0.50"
              value={adminFee}
              onChange={(e) => { setAdminFee(e.target.value); setSuccess(false) }}
              className={`${inputCls} pl-8`}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">Currently: £{initialAdminFee.toFixed(2)} per worker per fortnight</p>
        </div>
      </div>

      {/* Insurance Fee */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800">Company Insurance Fee</h2>
            <p className="text-xs text-slate-500">Applied to workers without their own public liability insurance</p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Fee Amount (£)
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">£</span>
            <input
              type="number"
              min="0"
              step="0.50"
              value={insuranceFee}
              onChange={(e) => { setInsuranceFee(e.target.value); setSuccess(false) }}
              className={`${inputCls} pl-8`}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">Currently: £{initialInsuranceFee.toFixed(2)} per worker per fortnight</p>
        </div>
      </div>

      {/* Holiday Day Rate */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
            <Sun className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800">Apprentice Holiday Day Rate</h2>
            <p className="text-xs text-slate-500">Pay per holiday day taken — counts against 28-day annual allowance</p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Rate per Day (£)</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">£</span>
            <input
              type="number" min="0" step="1"
              value={holidayRate}
              onChange={(e) => { setHolidayRate(e.target.value); setSuccess(false) }}
              className={`${inputCls} pl-8`}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">Currently: £{initialHolidayRate.toFixed(2)} per holiday day</p>
        </div>
      </div>

      {/* College Day Rate */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
            <GraduationCap className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800">Apprentice College Day Rate</h2>
            <p className="text-xs text-slate-500">Pay per college day — does not count against holiday allowance</p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Rate per Day (£)</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">£</span>
            <input
              type="number" min="0" step="1"
              value={collegeRate}
              onChange={(e) => { setCollegeRate(e.target.value); setSuccess(false) }}
              className={`${inputCls} pl-8`}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">Currently: £{initialCollegeRate.toFixed(2)} per college day</p>
        </div>
      </div>

      {/* Pay cycle & booking window */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4 text-slate-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800">Pay Cycle & Booking Window</h2>
            <p className="text-xs text-slate-500">
              Fortnightly work periods and pay dates — foremen can only submit claims during the open window
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Reference period start
            </label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => { setPeriodStart(e.target.value); setSuccess(false) }}
              className={inputCls}
            />
            <p className="text-xs text-slate-400 mt-1">First day of a known 13-day work window</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Pay day for that period
            </label>
            <input
              type="date"
              value={payDay}
              onChange={(e) => { setPayDay(e.target.value); setSuccess(false) }}
              className={inputCls}
            />
            <p className="text-xs text-slate-400 mt-1">When that fortnight&apos;s work is paid</p>
          </div>
        </div>

        {cyclePreview && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-sm">
            <p className="font-semibold text-slate-800">Preview (today)</p>
            <div className="grid grid-cols-1 gap-2 text-xs text-slate-600">
              <p>
                <span className="font-medium text-slate-700">Current booking window:</span>{' '}
                {cyclePreview.label}
                {cyclePreview.isLocked
                  ? <span className="text-red-600 font-medium"> · locked</span>
                  : cyclePreview.isGracePeriod
                  ? <span className="text-amber-600 font-medium"> · grace</span>
                  : <span className="text-green-600 font-medium"> · open</span>}
              </p>
              <p>
                <span className="font-medium text-slate-700">Submissions close:</span>{' '}
                {cyclePreview.isLocked
                  ? 'locked now'
                  : cyclePreview.isGracePeriod
                  ? 'apply-by day (day after last work day)'
                  : `${Math.ceil((new Date(cyclePreview.lockTime).getTime() - Date.now()) / 3_600_000)}h remaining`}
              </p>
              <p>
                <span className="font-medium text-slate-700">Pay date for this window:</span>{' '}
                {cyclePreview.payLabel}
              </p>
              <p>
                <span className="font-medium text-slate-700">Upcoming pay days:</span>{' '}
                {cyclePreview.upcomingPays.slice(1).map((p) => p.label).join(', ')}
              </p>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Each cycle is 13 work days plus one apply-by day (e.g. work 15–27 Jun, apply by 28 Jun, paid 3 Jul).
              The next fortnight opens the day after apply-by closes — no overlapping claims.
            </p>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-700 space-y-1">
        <p className="font-semibold">These fees apply to pending claim previews immediately.</p>
        <p>Already approved claims keep the fees that were saved when they were approved.</p>
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          <CheckCircle className="w-4 h-4 shrink-0" />Settings saved successfully.
        </div>
      )}

      {/* Save button */}
      <button
        disabled={busy}
        onClick={handleSave}
        className="w-full flex items-center justify-center gap-2 py-4 bg-slate-900
                   hover:bg-slate-800 text-white font-semibold rounded-xl transition-colors
                   disabled:opacity-50 text-sm"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
        {busy ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  )
}
