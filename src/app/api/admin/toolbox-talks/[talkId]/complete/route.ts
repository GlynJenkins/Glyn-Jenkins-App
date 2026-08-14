import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyManagementAreaApiAccess } from '@/lib/auth/portal-access'
import { loadCompanyBranding, parseSiteDocumentDetails } from '@/lib/documents/company-branding'
import { createServiceClient } from '@/lib/supabase/server'
import {
  generateToolboxTalkPdf,
  toolboxTalkPdfFilename,
} from '@/lib/toolbox-talks/generate-toolbox-talk-pdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Params = { params: Promise<{ talkId: string }> }

async function downloadBytes(
  supabase: ReturnType<typeof createServiceClient>,
  path: string | null,
): Promise<Buffer | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from('worker-documents').download(path)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}

/** Complete talk: require manager signature, generate PDF, mark completed. */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { talkId } = await params
    const supabase = createServiceClient()

    const { data: talk, error: talkError } = await supabase
      .from('toolbox_talks')
      .select(`
        id, site_id, title, description, status,
        conducted_by_name, conducted_by_role, manager_signature_path, pdf_path
      `)
      .eq('id', talkId)
      .maybeSingle()

    if (talkError) return apiError('api/admin/toolbox-talks complete load', talkError)
    if (!talk) return NextResponse.json({ error: 'Talk not found.' }, { status: 404 })
    if (talk.status === 'completed' && talk.pdf_path) {
      return NextResponse.json({ ok: true, talkId, alreadyCompleted: true })
    }
    if (!talk.manager_signature_path) {
      return NextResponse.json(
        { error: 'Manager signature is required before completing the talk.' },
        { status: 400 },
      )
    }

    const { data: site } = await supabase
      .from('sites')
      .select(`
        id, name, site_code, address,
        document_address, developer_name, developer_contact,
        surveyor_name, document_reference
      `)
      .eq('id', talk.site_id)
      .maybeSingle()

    if (!site) {
      return NextResponse.json({ error: 'Site not found.' }, { status: 404 })
    }

    const { data: attendees, error: attError } = await supabase
      .from('toolbox_talk_attendees')
      .select('id, worker_name, worker_role, signature_path, signed_at')
      .eq('talk_id', talkId)
      .order('worker_name')

    if (attError) return apiError('api/admin/toolbox-talks complete attendees', attError)

    const managerSig = await downloadBytes(supabase, talk.manager_signature_path)
    if (!managerSig) {
      return NextResponse.json({ error: 'Manager signature file is missing.' }, { status: 400 })
    }

    const attendeePdfRows = await Promise.all(
      (attendees ?? []).map(async (a) => ({
        name: a.worker_name,
        role: a.worker_role,
        signedAt: a.signed_at ? new Date(a.signed_at) : null,
        signaturePng: await downloadBytes(supabase, a.signature_path),
      })),
    )

    const conductedAt = new Date()
    const company = await loadCompanyBranding()
    const pdfBuffer = await generateToolboxTalkPdf({
      company,
      siteName:        site.name,
      siteCode:        site.site_code,
      siteDocuments:   parseSiteDocumentDetails(site),
      title:           talk.title,
      description:     talk.description,
      conductedByName: talk.conducted_by_name,
      conductedByRole: talk.conducted_by_role,
      conductedAt,
      managerSignaturePng: managerSig,
      attendees: attendeePdfRows,
    })

    const pdfPath = `toolbox-talks/${talkId}/toolbox-talk.pdf`
    const { error: pdfUpError } = await supabase.storage
      .from('worker-documents')
      .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    if (pdfUpError) {
      return apiError('api/admin/toolbox-talks complete pdf', pdfUpError, 'Could not store PDF.')
    }

    const { error: updError } = await supabase
      .from('toolbox_talks')
      .update({
        status:       'completed',
        pdf_path:     pdfPath,
        conducted_at: conductedAt.toISOString(),
      })
      .eq('id', talkId)

    if (updError) {
      return apiError('api/admin/toolbox-talks complete update', updError, 'Could not complete talk.')
    }

    const filename = toolboxTalkPdfFilename({
      siteCode: site.site_code,
      siteName: site.name,
      conductedAt,
      title: talk.title,
    })

    return NextResponse.json({ ok: true, talkId, pdfPath, filename })
  } catch (err) {
    return apiError('api/admin/toolbox-talks/[talkId]/complete', err)
  }
}
