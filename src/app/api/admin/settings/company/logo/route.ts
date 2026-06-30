import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BYTES = 500_000

export async function POST(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const formData = await request.formData()
    const logo = formData.get('logo') as File | null

    if (!logo || logo.size === 0) {
      return NextResponse.json({ error: 'Logo file is required.' }, { status: 400 })
    }
    if (logo.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Logo must be under 500KB.' }, { status: 400 })
    }

    const mime = logo.type.toLowerCase()
    if (!mime.includes('png') && !mime.includes('jpeg') && !mime.includes('jpg')) {
      return NextResponse.json({ error: 'Logo must be PNG or JPEG.' }, { status: 400 })
    }

    const ext = mime.includes('png') ? 'png' : 'jpg'
    const path = `branding/company-logo.${ext}`
    const buffer = Buffer.from(await logo.arrayBuffer())

    const supabase = createServiceClient()
    const { error: uploadError } = await supabase.storage
      .from('worker-documents')
      .upload(path, buffer, { contentType: mime, upsert: true })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: existing } = await supabase
      .from('admin_settings')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const payload = {
      logo_storage_path: path,
      updated_at:        new Date().toISOString(),
    }

    const { error } = existing?.id
      ? await supabase.from('admin_settings').update(payload).eq('id', existing.id)
      : await supabase.from('admin_settings').insert({ ...payload, company_name: 'Glyn Jenkins LTD' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: signed } = await supabase.storage
      .from('worker-documents')
      .createSignedUrl(path, 3600)

    return NextResponse.json({ success: true, logo_url: signed?.signedUrl ?? null })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed.' },
      { status: 500 }
    )
  }
}
