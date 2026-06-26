import { NextResponse } from 'next/server'
import { verifyJetwashMarkAccess } from '@/lib/auth/portal-access'
import { markPlotWashedById } from '@/lib/jetwash/queries'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ recordId: string }> }
) {
  const auth = await verifyJetwashMarkAccess()
  if (!auth.ok) return auth.response

  try {
    const { recordId } = await params
    const result = await markPlotWashedById(recordId, auth.worker?.id ?? null)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success:   true,
      washed_at: result.washed_at,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not mark washed.' },
      { status: 500 }
    )
  }
}
