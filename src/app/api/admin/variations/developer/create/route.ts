import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createDeveloperSubmissionForClaims } from '@/lib/variations/create-developer-submission'

export async function POST(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { ids } = await request.json() as { ids: string[] }

    if (!ids?.length) {
      return NextResponse.json({ error: 'No variation lines selected.' }, { status: 400 })
    }

    const developerSubmissionId = await createDeveloperSubmissionForClaims(ids)

    if (!developerSubmissionId) {
      return NextResponse.json(
        { error: 'Could not create developer draft. Variation may already have a draft or is no longer pending.' },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, developerSubmissionId })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}
