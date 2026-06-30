import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizePhotoForPdf } from '@/lib/qa/normalize-photo'
import {
  createManagementDeveloperSubmission,
  normalizePlotNumbers,
  validateForemanPayVsDeveloper,
} from '@/lib/variations/create-management-submission'
import { MATERIAL_UPLIFT_PERCENT } from '@/lib/variations/rates'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const formData = await request.formData()
    const siteId            = formData.get('siteId') as string
    const description       = (formData.get('description') as string)?.trim()
    const plotNumbersRaw    = (formData.get('plotNumbers') as string)?.trim() ?? ''
    const claimMode         = formData.get('claimMode') as string
    const foremanLumpSumRaw = (formData.get('foremanLumpSum') as string)?.trim()
    const assignedForemanId = (formData.get('assignedForemanId') as string)?.trim() || null
    const developerTotalRaw = (formData.get('developerTotal') as string)?.trim()
    const materialUplift    = formData.get('materialUplift') === 'true'
    const photoFiles        = (formData.getAll('photos') as File[]).filter((f) => f?.size > 0)

    if (!siteId || !description) {
      return NextResponse.json({ error: 'Site and description are required.' }, { status: 400 })
    }
    if (!['foreman_payable', 'company_profit'].includes(claimMode)) {
      return NextResponse.json({ error: 'Invalid claim mode.' }, { status: 400 })
    }

    const developerSubtotal = parseFloat(developerTotalRaw)
    if (isNaN(developerSubtotal) || developerSubtotal <= 0) {
      return NextResponse.json({ error: 'Enter a valid developer charge.' }, { status: 400 })
    }

    const foremanLumpSum = claimMode === 'foreman_payable'
      ? parseFloat(foremanLumpSumRaw)
      : null

    if (claimMode === 'foreman_payable' && (isNaN(foremanLumpSum!) || foremanLumpSum! <= 0)) {
      return NextResponse.json({ error: 'Enter a valid foreman pay amount.' }, { status: 400 })
    }

    const uplift = materialUplift
      ? Math.round(developerSubtotal * MATERIAL_UPLIFT_PERCENT) / 100
      : 0
    const developerTotal = Math.round((developerSubtotal + uplift) * 100) / 100

    if (claimMode === 'foreman_payable') {
      const payError = validateForemanPayVsDeveloper(foremanLumpSum!, developerTotal)
      if (payError) {
        return NextResponse.json({ error: payError }, { status: 400 })
      }
    }

    const supabase = createServiceClient()
    const photoPaths: string[] = []

    for (const [index, file] of photoFiles.entries()) {
      const raw = Buffer.from(await file.arrayBuffer())
      const normalized = await normalizePhotoForPdf(raw)
      const path = `variations/management/${siteId}/${Date.now()}-${index}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('worker-documents')
        .upload(path, normalized.buffer, { contentType: normalized.mime, upsert: false })
      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 })
      }
      photoPaths.push(path)
    }

    const result = await createManagementDeveloperSubmission({
      siteId,
      description,
      plotNumbers:       normalizePlotNumbers(plotNumbersRaw),
      claimMode:         claimMode as 'foreman_payable' | 'company_profit',
      foremanLumpSum:    foremanLumpSum,
      assignedForemanId: assignedForemanId || null,
      developerTotal,
      materialUplift,
      photoPaths,
      createdByWorkerId: auth.worker?.id ?? null,
    })

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      developerSubmissionId: result.id,
      materialUpliftNote: materialUplift
        ? `${MATERIAL_UPLIFT_PERCENT}% material uplift applied to developer total.`
        : null,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not create variation.' },
      { status: 500 }
    )
  }
}
