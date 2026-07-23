import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyJetwashViewAccess } from '@/lib/auth/portal-access'
import { fetchJetwashSiteSummaries } from '@/lib/jetwash/queries'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await verifyJetwashViewAccess()
  if (!auth.ok) return auth.response

  try {
    const sites = await fetchJetwashSiteSummaries()
    return NextResponse.json({ sites })
  } catch (err) {
    return apiError("api/jetwash/sites", err)
  }
}
