import { NextResponse } from 'next/server'
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load sites.' },
      { status: 500 }
    )
  }
}
