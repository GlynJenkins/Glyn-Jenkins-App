import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyForemanApiAccess } from '@/lib/auth/portal-access'
import { foremanHasSiteAccess } from '@/lib/auth/foreman-sites'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ auditId: string }> }

/** Read-only completed audit for an assigned foreman. */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await verifyForemanApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { auditId } = await params
    const supabase = createServiceClient()

    const { data: audit, error } = await supabase
      .from('site_audits')
      .select(`
        id, site_id, audited_by_name, audited_by_role, audit_date,
        general_notes, status, pdf_path,
        sites ( id, name, site_code, address )
      `)
      .eq('id', auditId)
      .eq('status', 'completed')
      .maybeSingle()

    if (error) return apiError('api/foreman/site-audits/[auditId] GET', error)
    if (!audit) return NextResponse.json({ error: 'Audit not found.' }, { status: 404 })

    const allowed = await foremanHasSiteAccess(auth.worker.id, audit.site_id)
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    }

    const { data: items } = await supabase
      .from('site_audit_items')
      .select('id, plot_number, description, sort_order')
      .eq('audit_id', auditId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    const itemIds = (items ?? []).map((i) => i.id)
    const { data: photos } = itemIds.length
      ? await supabase
          .from('site_audit_photos')
          .select('id, item_id, photo_path')
          .in('item_id', itemIds)
          .order('created_at', { ascending: true })
      : { data: [] as { id: string; item_id: string; photo_path: string }[] }

    const paths = (photos ?? []).map((p) => p.photo_path)
    const signedMap = new Map<string, string>()
    if (paths.length) {
      const { data: signed } = await supabase.storage
        .from('worker-documents')
        .createSignedUrls(paths, 3600)
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) signedMap.set(s.path, s.signedUrl)
      }
    }

    // Mark viewed when opened (do not clear completed_at if already done).
    const { data: existingView } = await supabase
      .from('site_audit_views')
      .select('completed_at')
      .eq('audit_id', auditId)
      .eq('worker_id', auth.worker.id)
      .maybeSingle()

    await supabase.from('site_audit_views').upsert(
      {
        audit_id:      auditId,
        worker_id:     auth.worker.id,
        seen_at:       new Date().toISOString(),
        completed_at:  existingView?.completed_at ?? null,
      },
      { onConflict: 'audit_id,worker_id' },
    )

    const site = Array.isArray(audit.sites) ? audit.sites[0] : audit.sites

    return NextResponse.json({
      audit: {
        id:            audit.id,
        siteId:        audit.site_id,
        siteName:      site?.name ?? 'Site',
        auditedByName: audit.audited_by_name,
        auditedByRole: audit.audited_by_role,
        auditDate:     audit.audit_date,
        generalNotes:  audit.general_notes,
        pdfReady:      !!audit.pdf_path,
        done:          !!existingView?.completed_at,
        doneAt:        existingView?.completed_at ?? null,
      },
      items: (items ?? []).map((item) => ({
        id:          item.id,
        plotNumber:  item.plot_number,
        description: item.description,
        photos: (photos ?? [])
          .filter((p) => p.item_id === item.id)
          .map((p) => ({
            id:  p.id,
            url: signedMap.get(p.photo_path) ?? null,
          })),
      })),
    })
  } catch (err) {
    return apiError('api/foreman/site-audits/[auditId] GET', err)
  }
}
