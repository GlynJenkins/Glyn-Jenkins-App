import { NextResponse } from 'next/server'
import { verifyManagementAreaApiAccess } from '@/lib/auth/portal-access'
import { canApproveHolidays } from '@/lib/worker-access'
import {
  fetchHolidayAllowances,
  fetchHolidayRequests,
} from '@/lib/holidays/queries'
import { currentHolidayYear } from '@/lib/holidays/management'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  const year = currentHolidayYear()
  const [allowances, requests] = await Promise.all([
    fetchHolidayAllowances(year),
    fetchHolidayRequests(),
  ])

  const isAdmin = !auth.worker || canApproveHolidays(auth.worker.role)

  return NextResponse.json({
    year,
    isAdmin,
    currentWorkerId: auth.worker?.id ?? null,
    allowances,
    requests,
  })
}
