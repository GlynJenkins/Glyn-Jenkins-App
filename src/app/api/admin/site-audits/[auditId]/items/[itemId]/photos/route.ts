import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { apiError } from '@/lib/api/route-error'
import { verifyManagementAreaApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { isImageUploadFile } from '@/lib/qa/inspection-photos'
import { normalizePhotoForPdf } from '@/lib/qa/normalize-photo'
import { assertAuditEditable } from '@/lib/site-audits/assert-editable'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

type Params = { params: Promise<{ auditId: string; itemId: string }> }

function asUploadFile(value: FormDataEntryValue | null): File | null {
  if (!value || typeof value === 'string') return null
  // Node / undici may hand back File or a Blob-like upload part.
  const file = value as File
  if (typeof file.arrayBuffer !== 'function' || typeof file.size !== 'number') return null
  if (file.size <= 0) return null
  return file
}

/** POST — upload photo for an item. Optional ?photoId= for DELETE. */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { auditId, itemId } = await params
    const supabase = createServiceClient()

    const { data: audit } = await supabase
      .from('site_audits')
      .select('id, status')
      .eq('id', auditId)
      .maybeSingle()
    if (!audit) return NextResponse.json({ error: 'Audit not found.' }, { status: 404 })
    const blocked = assertAuditEditable(audit.status)
    if (blocked) return blocked

    const { data: item } = await supabase
      .from('site_audit_items')
      .select('id')
      .eq('id', itemId)
      .eq('audit_id', auditId)
      .maybeSingle()
    if (!item) return NextResponse.json({ error: 'Item not found.' }, { status: 404 })

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json(
        { error: 'Photo was too large to upload. Try one photo at a time.' },
        { status: 413 },
      )
    }

    const file = asUploadFile(formData.get('photo'))
    if (!file || !isImageUploadFile(file)) {
      return NextResponse.json({ error: 'A photo is required.' }, { status: 400 })
    }

    const raw = Buffer.from(await file.arrayBuffer())
    let normalized: { buffer: Buffer; mime: string }
    try {
      normalized = await normalizePhotoForPdf(raw)
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Could not process photo.' },
        { status: 400 },
      )
    }

    const path = `site-audits/${auditId}/${itemId}/${randomUUID()}.jpg`
    const { error: uploadError } = await supabase.storage
      .from('worker-documents')
      .upload(path, new Uint8Array(normalized.buffer), {
        contentType: normalized.mime,
        upsert: false,
      })
    if (uploadError) {
      return apiError('api/admin/site-audits photos upload', uploadError, 'Photo upload failed.')
    }

    const { data: photo, error } = await supabase
      .from('site_audit_photos')
      .insert({ item_id: itemId, photo_path: path })
      .select('id, photo_path')
      .single()

    if (error || !photo) {
      await supabase.storage.from('worker-documents').remove([path])
      return apiError('api/admin/site-audits photos insert', error, 'Could not save photo.')
    }

    const { data: signed } = await supabase.storage
      .from('worker-documents')
      .createSignedUrl(path, 3600)

    return NextResponse.json({
      photo: {
        id:  photo.id,
        url: signed?.signedUrl ?? null,
      },
    })
  } catch (err) {
    return apiError('api/admin/site-audits photos POST', err, 'Photo upload failed.')
  }
}

/** DELETE ?photoId= — remove photo from draft item. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { auditId, itemId } = await params
    const photoId = request.nextUrl.searchParams.get('photoId')?.trim()
    if (!photoId) {
      return NextResponse.json({ error: 'photoId is required.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: audit } = await supabase
      .from('site_audits')
      .select('id, status')
      .eq('id', auditId)
      .maybeSingle()
    if (!audit) return NextResponse.json({ error: 'Audit not found.' }, { status: 404 })
    const blocked = assertAuditEditable(audit.status)
    if (blocked) return blocked

    const { data: photo } = await supabase
      .from('site_audit_photos')
      .select('id, photo_path, item_id')
      .eq('id', photoId)
      .maybeSingle()

    if (!photo || photo.item_id !== itemId) {
      return NextResponse.json({ error: 'Photo not found.' }, { status: 404 })
    }

    await supabase.storage.from('worker-documents').remove([photo.photo_path])
    const { error } = await supabase.from('site_audit_photos').delete().eq('id', photoId)
    if (error) return apiError('api/admin/site-audits photos DELETE', error)

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError('api/admin/site-audits photos DELETE', err)
  }
}
