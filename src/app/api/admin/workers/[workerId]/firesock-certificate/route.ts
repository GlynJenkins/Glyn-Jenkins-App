import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { firesockRequirement } from '@/lib/induction/firesock-requirement'
import {
  extensionForMime,
  validateUpload,
} from '@/lib/induction/upload-validation'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Short-lived signed URL to view the worker's firesock training certificate. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> },
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { workerId } = await params
    const supabase = createServiceClient()

    const { data: worker } = await supabase
      .from('workers')
      .select('first_name, surname, firesock_certificate_url')
      .eq('id', workerId)
      .maybeSingle()

    if (!worker?.firesock_certificate_url) {
      return NextResponse.json({ error: 'No firesock certificate on file.' }, { status: 404 })
    }

    const { data, error } = await supabase.storage
      .from('worker-documents')
      .createSignedUrl(worker.firesock_certificate_url, 3600)

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'Could not generate download link.' }, { status: 500 })
    }

    const filename = `${worker.first_name}-${worker.surname}-firesock-certificate`
      .replace(/\s+/g, '-')
      .toLowerCase()

    return NextResponse.json({ url: data.signedUrl, filename })
  } catch (err) {
    return apiError('api/admin/workers/[workerId]/firesock-certificate', err)
  }
}

/** Admin upload of a firesock training certificate for an existing worker. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> },
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { workerId } = await params
    const supabase = createServiceClient()

    const { data: worker, error: fetchError } = await supabase
      .from('workers')
      .select('id, role, firesock_certificate_url')
      .eq('id', workerId)
      .maybeSingle()

    if (fetchError || !worker) {
      return NextResponse.json({ error: 'Worker not found.' }, { status: 404 })
    }

    if (firesockRequirement(worker.role) === 'hidden') {
      return NextResponse.json(
        { error: 'Firesock certificate is not applicable for this role.' },
        { status: 400 },
      )
    }

    const formData = await request.formData()
    const file = formData.get('firesockCert') as File | null

    const check = await validateUpload(file, 'document', 'Firesock training certificate')
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 })
    }

    const ext = extensionForMime(check.mime)
    const path = `firesock-certificates/${workerId}/${randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('worker-documents')
      .upload(path, check.buffer, { contentType: check.mime, upsert: false })

    if (uploadError) {
      return apiError('api/admin/workers/[workerId]/firesock-certificate', uploadError)
    }

    const { error: updateError } = await supabase
      .from('workers')
      .update({
        firesock_certificate_url: path,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workerId)

    if (updateError) {
      await supabase.storage.from('worker-documents').remove([path])
      return apiError('api/admin/workers/[workerId]/firesock-certificate', updateError)
    }

    if (worker.firesock_certificate_url && worker.firesock_certificate_url !== path) {
      await supabase.storage.from('worker-documents').remove([worker.firesock_certificate_url])
    }

    const { data: signed } = await supabase.storage
      .from('worker-documents')
      .createSignedUrl(path, 3600)

    return NextResponse.json({
      success: true,
      firesock_certificate_url: path,
      url: signed?.signedUrl ?? null,
    })
  } catch (err) {
    return apiError('api/admin/workers/[workerId]/firesock-certificate', err)
  }
}
