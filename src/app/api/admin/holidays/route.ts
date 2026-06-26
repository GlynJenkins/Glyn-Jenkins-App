import { NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import {
  fetchHolidayAllowances,
  fetchHolidayRequests,
} from '@/lib/holidays/queries'
import { currentHolidayYear } from '@/lib/holidays/management'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  const year = currentHolidayYear()
  const [allowances, requests] = await Promise.all([
    fetchHolidayAllowances(year),
    fetchHolidayRequests(),
  ])

  const isAdmin = auth.worker?.role === 'admin' || auth.worker === null

  return NextResponse.json({
    year,
    isAdmin,
    currentWorkerId: auth.worker?.id ?? null,
    allowances,
    requests,
  })
}
