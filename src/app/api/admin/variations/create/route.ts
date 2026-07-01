import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizePhotoForPdf } from '@/lib/qa/normalize-photo'
import {
  createAdminVariation,
  validateAdminVariationPayload,
  type AdminVariationWorkerInput,
} from '@/lib/variations/create-admin-variation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const formData = await request.formData()
    const siteId = (formData.get('siteId') as string)?.trim()
    const description = (formData.get('description') as string)?.trim()
    const assignedForemanIdRaw = (formData.get('assignedForemanId') as string)?.trim()
    const payType = (formData.get('payType') as string)?.trim()
    const lumpSumRaw = (formData.get('lumpSumAmount') as string)?.trim()
    const workersJson = (formData.get('workers') as string) ?? '[]'
    const photo = formData.get('photo') as File | null

    let workers: AdminVariationWorkerInput[] = []
    try {
      workers = JSON.parse(workersJson)
    } catch {
      return NextResponse.json({ error: 'Invalid worker data.' }, { status: 400 })
    }

    const assignedForemanId =
      assignedForemanIdRaw && assignedForemanIdRaw !== 'none' ? assignedForemanIdRaw : null

    const validationError = validateAdminVariationPayload({
      siteId,
      description,
      assignedForemanId,
      payType,
      lumpSumAmount: lumpSumRaw ? parseFloat(lumpSumRaw) : undefined,
      workers,
    })
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    if (!isUuid(siteId)) {
      return NextResponse.json({ error: 'Invalid site.' }, { status: 400 })
    }
    if (assignedForemanId && !isUuid(assignedForemanId)) {
      return NextResponse.json({ error: 'Invalid foreman.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: site } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('is_active', true)
      .maybeSingle()
    if (!site) {
      return NextResponse.json({ error: 'Site not found.' }, { status: 404 })
    }

    if (assignedForemanId) {
      const { data: foreman } = await supabase
        .from('workers')
        .select('id')
        .eq('id', assignedForemanId)
        .eq('role', 'foreman')
        .eq('status', 'active')
        .maybeSingle()
      if (!foreman) {
        return NextResponse.json({ error: 'Foreman not found.' }, { status: 400 })
      }
    }

    let photoPath: string | null = null
    if (photo && photo.size > 0) {
      let normalized: { buffer: Buffer; mime: string }
      try {
        const raw = Buffer.from(await photo.arrayBuffer())
        normalized = await normalizePhotoForPdf(raw)
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Could not process photo.' },
          { status: 400 }
        )
      }

      photoPath = `variations/admin/${siteId}/${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('worker-documents')
        .upload(photoPath, normalized.buffer, { contentType: normalized.mime, upsert: false })

      if (uploadError) {
        return NextResponse.json({ error: `Photo upload failed: ${uploadError.message}` }, { status: 500 })
      }
    }

    const result = await createAdminVariation({
      siteId,
      description,
      assignedForemanId,
      payType: payType as 'lump_sum' | 'daywork',
      lumpSumAmount: lumpSumRaw ? parseFloat(lumpSumRaw) : undefined,
      workers,
      photoPath,
      createdByWorkerId: auth.worker?.id ?? null,
    })

    return NextResponse.json({ success: true, lines: result.lineCount })
  } catch (err) {
    console.error('[admin/variations/create]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}
