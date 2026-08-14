import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyManagementAreaApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { toolboxTalkPdfFilename } from '@/lib/toolbox-talks/generate-toolbox-talk-pdf'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ talkId: string }> }

/** Return a short-lived signed URL for the stored toolbox talk PDF. */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { talkId } = await params
    const supabase = createServiceClient()

    const { data: talk } = await supabase
      .from('toolbox_talks')
      .select(`
        id, title, pdf_path, conducted_at, site_id,
        sites ( name, site_code )
      `)
      .eq('id', talkId)
      .maybeSingle()

    if (!talk?.pdf_path) {
      return NextResponse.json({ error: 'PDF not ready yet.' }, { status: 404 })
    }

    const { data, error } = await supabase.storage
      .from('worker-documents')
      .createSignedUrl(talk.pdf_path, 3600)

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'Could not generate download link.' }, { status: 500 })
    }

    const site = Array.isArray(talk.sites) ? talk.sites[0] : talk.sites
    const filename = toolboxTalkPdfFilename({
      siteCode: site?.site_code ?? null,
      siteName: site?.name ?? 'site',
      conductedAt: talk.conducted_at ? new Date(talk.conducted_at) : new Date(),
      title: talk.title,
    })

    return NextResponse.json({ url: data.signedUrl, filename })
  } catch (err) {
    return apiError('api/admin/toolbox-talks/[talkId]/pdf', err)
  }
}
