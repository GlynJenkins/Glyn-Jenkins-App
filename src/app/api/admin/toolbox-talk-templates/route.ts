import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyManagementAreaApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('toolbox_talk_templates')
      .select('id, title, description, created_by, created_at')
      .order('title')

    if (error) return apiError('api/admin/toolbox-talk-templates GET', error, 'Could not load templates.')
    return NextResponse.json({ templates: data ?? [] })
  } catch (err) {
    return apiError('api/admin/toolbox-talk-templates GET', err)
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json() as { title?: string; description?: string }
    const title = body.title?.trim() ?? ''
    const description = body.description?.trim() ?? ''

    if (!title || title.length > 120) {
      return NextResponse.json({ error: 'Title is required (max 120 characters).' }, { status: 400 })
    }
    if (!description || description.length > 5000) {
      return NextResponse.json({ error: 'Description is required (max 5,000 characters).' }, { status: 400 })
    }

    const createdBy = auth.worker
      ? `${auth.worker.first_name} ${auth.worker.surname}`.trim()
      : (auth.user.email ?? null)

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('toolbox_talk_templates')
      .insert({ title, description, created_by: createdBy })
      .select('id, title, description, created_by, created_at')
      .single()

    if (error) return apiError('api/admin/toolbox-talk-templates POST', error, 'Could not save template.')
    return NextResponse.json({ template: data })
  } catch (err) {
    return apiError('api/admin/toolbox-talk-templates POST', err)
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  try {
    const id = request.nextUrl.searchParams.get('id')?.trim()
    if (!id) {
      return NextResponse.json({ error: 'Template id is required.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { error } = await supabase.from('toolbox_talk_templates').delete().eq('id', id)
    if (error) return apiError('api/admin/toolbox-talk-templates DELETE', error, 'Could not delete template.')
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError('api/admin/toolbox-talk-templates DELETE', err)
  }
}
