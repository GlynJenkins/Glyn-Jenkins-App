import Link from 'next/link'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import {
  fetchHolidayAllowances,
  fetchHolidayRequests,
} from '@/lib/holidays/queries'
import { currentHolidayYear } from '@/lib/holidays/management'
import HolidayTracker from './_components/HolidayTracker'

export const dynamic = 'force-dynamic'

export default async function AdminHolidaysPage() {
  const { worker } = await requireAdminAccess()
  const year = currentHolidayYear()
  const isAdmin = worker?.role === 'admin' || !worker

  let allowances: Awaited<ReturnType<typeof fetchHolidayAllowances>> = []
  let requests: Awaited<ReturnType<typeof fetchHolidayRequests>> = []
  let setupRequired = false

  try {
    ;[allowances, requests] = await Promise.all([
      fetchHolidayAllowances(year),
      fetchHolidayRequests(),
    ])
  } catch (err) {
    console.error('[Holidays] Failed to load:', err)
    setupRequired = true
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white">Holiday Tracker</h1>
            <p className="text-slate-400 text-xs mt-1">Management · {year}</p>
          </div>
          <Link
            href="/admin"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            ← Admin
          </Link>
        </div>
      </header>

      <div className="px-4 pt-5 pb-16 max-w-lg mx-auto">
        {setupRequired ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-900">
            <p className="font-semibold">Database setup required</p>
            <p className="mt-2 text-amber-800">
              Run the migration{' '}
              <code className="text-xs bg-amber-100 px-1 py-0.5 rounded">add_management_holiday_tracker.sql</code>{' '}
              in the Supabase SQL Editor, then refresh this page.
            </p>
          </div>
        ) : (
          <HolidayTracker
            initial={{
              year,
              isAdmin,
              currentWorkerId: worker?.id ?? null,
              allowances,
              requests,
            }}
          />
        )}
      </div>
    </div>
  )
}
