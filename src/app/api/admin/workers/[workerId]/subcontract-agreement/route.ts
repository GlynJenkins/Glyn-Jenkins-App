import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Returns a short-lived signed URL to download the worker's signed subcontract PDF. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { workerId } = await params
    const supabase     = createServiceClient()

    const { data: worker } = await supabase
      .from('workers')
      .select('first_name, surname, subcontract_agreement_pdf_url')
      .eq('id', workerId)
      .maybeSingle()

    if (!worker?.subcontract_agreement_pdf_url) {
      return NextResponse.json({ error: 'No signed agreement on file.' }, { status: 404 })
    }

    const { data, error } = await supabase.storage
      .from('worker-documents')
      .createSignedUrl(worker.subcontract_agreement_pdf_url, 3600)

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'Could not generate download link.' }, { status: 500 })
    }

    const filename = `${worker.first_name}-${worker.surname}-subcontract-agreement.pdf`
      .replace(/\s+/g, '-')
      .toLowerCase()

    return NextResponse.json({ url: data.signedUrl, filename })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}
