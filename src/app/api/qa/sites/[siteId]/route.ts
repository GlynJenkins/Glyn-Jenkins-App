import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { fetchQaSiteGrid } from '@/lib/qa/queries'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { siteId } = await params
    const grid = await fetchQaSiteGrid(siteId)
    return NextResponse.json(grid)
  } catch (err) {
    return apiError("api/qa/sites/[siteId]", err)
  }
}
