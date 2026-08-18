import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyManagementAreaApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ auditId: string; itemId: string }> }

async function requireDraftItem(auditId: string, itemId: string) {
  const supabase = createServiceClient()
  const { data: audit } = await supabase
    .from('site_audits')
    .select('id, status')
    .eq('id', auditId)
    .maybeSingle()
  if (!audit) return { error: NextResponse.json({ error: 'Audit not found.' }, { status: 404 }) }
  if (audit.status !== 'draft') {
    return {
      error: NextResponse.json({ error: 'Only draft audits can be edited.' }, { status: 400 }),
    }
  }
  const { data: item } = await supabase
    .from('site_audit_items')
    .select('id, audit_id')
    .eq('id', itemId)
    .eq('audit_id', auditId)
    .maybeSingle()
  if (!item) return { error: NextResponse.json({ error: 'Item not found.' }, { status: 404 }) }
  return { supabase, item }
}

/** PATCH — edit item while draft. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { auditId, itemId } = await params
    const ctx = await requireDraftItem(auditId, itemId)
    if ('error' in ctx) return ctx.error

    const body = await request.json() as { plotNumber?: string; description?: string }
    const updates: Record<string, string> = {}
    if (typeof body.plotNumber === 'string') {
      const plotNumber = body.plotNumber.trim()
      if (!plotNumber || plotNumber.length > 80) {
        return NextResponse.json({ error: 'Plot number is required.' }, { status: 400 })
      }
      updates.plot_number = plotNumber
    }
    if (typeof body.description === 'string') {
      const description = body.description.trim()
      if (!description || description.length > 4000) {
        return NextResponse.json({ error: 'Description is required.' }, { status: 400 })
      }
      updates.description = description
    }
    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
    }

    const { error } = await ctx.supabase
      .from('site_audit_items')
      .update(updates)
      .eq('id', itemId)

    if (error) return apiError('api/admin/site-audits items PATCH', error)
    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError('api/admin/site-audits items PATCH', err)
  }
}

/** DELETE — remove item + photos while draft. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await verifyManagementAreaApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { auditId, itemId } = await params
    const ctx = await requireDraftItem(auditId, itemId)
    if ('error' in ctx) return ctx.error

    const { data: photos } = await ctx.supabase
      .from('site_audit_photos')
      .select('photo_path')
      .eq('item_id', itemId)
    const paths = (photos ?? []).map((p) => p.photo_path)
    if (paths.length) {
      await ctx.supabase.storage.from('worker-documents').remove(paths)
    }

    const { error } = await ctx.supabase
      .from('site_audit_items')
      .delete()
      .eq('id', itemId)

    if (error) return apiError('api/admin/site-audits items DELETE', error)
    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError('api/admin/site-audits items DELETE', err)
  }
}
