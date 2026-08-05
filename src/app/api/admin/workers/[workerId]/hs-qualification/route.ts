import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Short-lived signed URL for a worker's SSSTS/SMSTS certificate. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { workerId } = await params
    const supabase = createServiceClient()

    const { data: worker } = await supabase
      .from('workers')
      .select('first_name, surname, hs_qualification_url, hs_qualification_na')
      .eq('id', workerId)
      .maybeSingle()

    if (!worker?.hs_qualification_url) {
      return NextResponse.json({ error: 'No H&S certificate on file.' }, { status: 404 })
    }

    const { data, error } = await supabase.storage
      .from('worker-documents')
      .createSignedUrl(worker.hs_qualification_url, 3600)

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'Could not generate download link.' }, { status: 500 })
    }

    const ext = worker.hs_qualification_url.split('.').pop() || 'pdf'
    const filename = `${worker.first_name}-${worker.surname}-hs-qualification.${ext}`
      .replace(/\s+/g, '-')
      .toLowerCase()

    return NextResponse.json({ url: data.signedUrl, filename })
  } catch (err) {
    return apiError('api/admin/workers/[workerId]/hs-qualification', err)
  }
}
