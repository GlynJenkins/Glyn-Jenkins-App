import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { signOffBlockedReason } from '@/lib/variations/site-signoff-eligibility'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { submissionId } = await params
    const blocked = await signOffBlockedReason(submissionId)
    if (blocked) {
      return NextResponse.json({ error: blocked }, { status: 400 })
    }

    const formData = await request.formData()
    const siteAgentName = (formData.get('siteAgentName') as string | null)?.trim()
    const signature = formData.get('signature') as File | null

    if (!siteAgentName) {
      return NextResponse.json({ error: 'Site agent name is required.' }, { status: 400 })
    }
    if (!signature || signature.size === 0) {
      return NextResponse.json({ error: 'Signature is required.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const signatureBuffer = Buffer.from(await signature.arrayBuffer())
    const signedAt = new Date()
    const ts = signedAt.getTime()
    const signaturePath = `variations/site-agent/${submissionId}/${ts}-signature.png`

    const { error: uploadError } = await supabase.storage
      .from('worker-documents')
      .upload(signaturePath, signatureBuffer, { contentType: 'image/png', upsert: false })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { error: updateError } = await supabase
      .from('variation_developer_submissions')
      .update({
        site_agent_name:           siteAgentName,
        site_agent_signed_at:      signedAt.toISOString(),
        site_agent_signature_path: signaturePath,
        updated_at:                signedAt.toISOString(),
      })
      .eq('id', submissionId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      siteAgentName,
      siteAgentSignedAt: signedAt.toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sign-off failed.' },
      { status: 500 }
    )
  }
}
