import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DOC_TYPES = {
  cscs: {
    column:   'cscs_card_url',
    label:    'CSCS card',
    fileStem: 'cscs-card',
  },
  id: {
    column:   'id_document_url',
    label:    'ID document',
    fileStem: 'id-document',
  },
  insurance: {
    column:   'insurance_certificate_url',
    label:    'Insurance certificate',
    fileStem: 'insurance-certificate',
  },
  hs: {
    column:   'hs_qualification_url',
    label:    'SSSTS/SMSTS certificate',
    fileStem: 'hs-qualification',
  },
  firesock: {
    column:   'firesock_certificate_url',
    label:    'Firesock training certificate',
    fileStem: 'firesock-certificate',
  },
} as const

type DocType = keyof typeof DOC_TYPES

function isDocType(value: string): value is DocType {
  return value in DOC_TYPES
}

/** Short-lived signed URL for an induction document (CSCS, ID, insurance, H&S, firesock). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> },
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { workerId } = await params
    const type = request.nextUrl.searchParams.get('type')?.trim() ?? ''
    if (!isDocType(type)) {
      return NextResponse.json(
        { error: 'Document type must be cscs, id, insurance, hs, or firesock.' },
        { status: 400 },
      )
    }

    const meta = DOC_TYPES[type]
    const supabase = createServiceClient()

    const { data: worker } = await supabase
      .from('workers')
      .select(`
        first_name, surname,
        cscs_card_url, id_document_url, insurance_certificate_url,
        hs_qualification_url, firesock_certificate_url
      `)
      .eq('id', workerId)
      .maybeSingle()

    if (!worker) {
      return NextResponse.json({ error: 'Worker not found.' }, { status: 404 })
    }

    const path = worker[meta.column as keyof typeof worker] as string | null
    if (!path) {
      return NextResponse.json({ error: `No ${meta.label} on file.` }, { status: 404 })
    }

    const { data, error } = await supabase.storage
      .from('worker-documents')
      .createSignedUrl(path, 3600)

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'Could not generate download link.' }, { status: 500 })
    }

    const ext = path.split('.').pop() || 'jpg'
    const filename = `${worker.first_name}-${worker.surname}-${meta.fileStem}.${ext}`
      .replace(/\s+/g, '-')
      .toLowerCase()

    return NextResponse.json({
      url:      data.signedUrl,
      filename,
      label:    meta.label,
    })
  } catch (err) {
    return apiError('api/admin/workers/[workerId]/documents', err)
  }
}
