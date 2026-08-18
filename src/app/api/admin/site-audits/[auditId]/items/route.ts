import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ auditId: string }> }

/** POST — add item to draft audit. */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { auditId } = await params
    const supabase = createServiceClient()

    const { data: audit } = await supabase
      .from('site_audits')
      .select('id, status')
      .eq('id', auditId)
      .maybeSingle()

    if (!audit) return NextResponse.json({ error: 'Audit not found.' }, { status: 404 })
    if (audit.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft audits can be edited.' }, { status: 400 })
    }

    const body = await request.json() as { plotNumber?: string; description?: string }
    const plotNumber = body.plotNumber?.trim() ?? ''
    const description = body.description?.trim() ?? ''

    if (!plotNumber || plotNumber.length > 80) {
      return NextResponse.json({ error: 'Plot number is required.' }, { status: 400 })
    }
    if (!description || description.length > 4000) {
      return NextResponse.json({ error: 'Description is required.' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('site_audit_items')
      .select('sort_order')
      .eq('audit_id', auditId)
      .order('sort_order', { ascending: false })
      .limit(1)

    const sortOrder = ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1

    const { data: item, error } = await supabase
      .from('site_audit_items')
      .insert({
        audit_id:    auditId,
        plot_number: plotNumber,
        description,
        sort_order:  sortOrder,
      })
      .select('id, plot_number, description, sort_order')
      .single()

    if (error || !item) {
      return apiError('api/admin/site-audits items POST', error, 'Could not save item.')
    }

    return NextResponse.json({
      item: {
        id:          item.id,
        plotNumber:  item.plot_number,
        description: item.description,
        sortOrder:   item.sort_order,
        photos:      [],
      },
    })
  } catch (err) {
    return apiError('api/admin/site-audits items POST', err)
  }
}
