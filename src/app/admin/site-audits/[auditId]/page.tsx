import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchDistinctPlotNumbers } from '@/lib/qa/queries'
import { needsPortalLogin } from '@/lib/worker-access'
import SiteAuditClient from './_components/SiteAuditClient'

export const dynamic = 'force-dynamic'

export default async function SiteAuditPage({
  params,
}: {
  params: Promise<{ auditId: string }>
}) {
  await requireAdminAccess()
  const { auditId } = await params
  const supabase = createServiceClient()

  const { data: audit } = await supabase
    .from('site_audits')
    .select(`
      id, site_id, audited_by_name, audited_by_role, audit_date,
      general_notes, status, pdf_path,
      sites ( id, name, site_code, address )
    `)
    .eq('id', auditId)
    .maybeSingle()

  if (!audit) notFound()

  const site = Array.isArray(audit.sites) ? audit.sites[0] : audit.sites
  if (!site) notFound()

  const { data: items } = await supabase
    .from('site_audit_items')
    .select('id, plot_number, description, sort_order, created_at')
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

  const { data: recipients } = await supabase
    .from('site_audit_recipients')
    .select('id, worker_id, worker_name, sent_via, sent_at, delivery_status, error_message')
    .eq('audit_id', auditId)
    .order('sent_at', { ascending: false })

  const plotNumbers = await fetchDistinctPlotNumbers(audit.site_id)

  const { data: assignedForemen } = await supabase
    .from('foreman_site_assignments')
    .select('foreman_id, workers ( id, first_name, surname, email, phone, role, status )')
    .eq('site_id', audit.site_id)

  const assignedIds = new Set<string>()
  const assignedWorkers: { id: string; name: string; role: string }[] = []
  for (const row of assignedForemen ?? []) {
    const w = Array.isArray(row.workers) ? row.workers[0] : row.workers
    if (!w || w.status !== 'active') continue
    assignedIds.add(w.id)
    assignedWorkers.push({
      id: w.id,
      name: `${w.first_name} ${w.surname}`.trim(),
      role: w.role,
    })
  }

  const { data: portalWorkers } = await supabase
    .from('workers')
    .select('id, first_name, surname, role, status')
    .eq('status', 'active')
    .order('surname')

  const otherRecipients = (portalWorkers ?? [])
    .filter((w) => needsPortalLogin(w.role) && !assignedIds.has(w.id))
    .map((w) => ({
      id: w.id,
      name: `${w.first_name} ${w.surname}`.trim(),
      role: w.role,
    }))

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto">
          <Link
            href={`/admin/site-audits?siteId=${audit.site_id}`}
            className="text-orange-400 text-xs font-semibold tracking-widest uppercase"
          >
            ← Site audits
          </Link>
          <h1 className="text-xl font-bold text-white mt-1">
            {audit.status === 'draft' ? 'Site audit walk' : 'Site audit'}
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">{site.name}</p>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 pt-5 pb-24">
        <SiteAuditClient
          audit={{
            id:            audit.id,
            siteId:        audit.site_id,
            siteName:      site.name,
            auditedByName: audit.audited_by_name,
            auditedByRole: audit.audited_by_role,
            auditDate:     audit.audit_date,
            generalNotes:  audit.general_notes,
            status:        audit.status,
            pdfReady:      !!audit.pdf_path,
          }}
          initialItems={(items ?? []).map((item) => ({
            id:          item.id,
            plotNumber:  item.plot_number,
            description: item.description,
            photos: (photos ?? [])
              .filter((p) => p.item_id === item.id)
              .map((p) => ({
                id:  p.id,
                url: signedMap.get(p.photo_path) ?? null,
              })),
          }))}
          initialRecipients={(recipients ?? []).map((r) => ({
            id:             r.id,
            workerId:       r.worker_id,
            workerName:     r.worker_name,
            sentVia:        r.sent_via,
            sentAt:         r.sent_at,
            deliveryStatus: r.delivery_status,
            errorMessage:   r.error_message,
          }))}
          plotNumbers={plotNumbers}
          assignedForemen={assignedWorkers}
          otherRecipients={otherRecipients}
        />
      </main>
    </div>
  )
}
