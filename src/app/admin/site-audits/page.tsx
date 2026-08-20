import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireManagementAreaAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import SiteAuditsListClient from './_components/SiteAuditsListClient'

export const dynamic = 'force-dynamic'

export default async function SiteAuditsPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>
}) {
  await requireManagementAreaAccess()
  const { siteId } = await searchParams

  const supabase = createServiceClient()

  if (!siteId) {
    const { data: sites } = await supabase
      .from('sites')
      .select('id, name, is_active')
      .eq('is_active', true)
      .order('name')

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-slate-900 px-5 pt-12 pb-6">
          <div className="max-w-lg mx-auto">
            <Link href="/admin" className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              ← Dashboard
            </Link>
            <h1 className="text-xl font-bold text-white mt-1">Site Audits</h1>
            <p className="text-slate-400 text-sm mt-0.5">Choose a site to walk</p>
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 pt-5 pb-16 space-y-2">
          {(sites ?? []).map((site) => (
            <Link
              key={site.id}
              href={`/admin/site-audits?siteId=${site.id}`}
              className="block bg-white rounded-2xl p-4 border border-gray-100 shadow-sm
                         font-semibold text-slate-900 hover:border-orange-200"
            >
              {site.name}
            </Link>
          ))}
          {!sites?.length && (
            <p className="text-sm text-slate-400 text-center py-12">No active sites.</p>
          )}
        </main>
      </div>
    )
  }

  const { data: site } = await supabase
    .from('sites')
    .select('id, name')
    .eq('id', siteId)
    .maybeSingle()

  if (!site) redirect('/admin/site-audits')

  const { data: audits } = await supabase
    .from('site_audits')
    .select(`
      id, audited_by_name, audited_by_role, audit_date, status, pdf_path,
      site_audit_items ( id )
    `)
    .eq('site_id', siteId)
    .order('audit_date', { ascending: false })

  const auditIds = (audits ?? []).map((a) => a.id)

  const { data: assignedRows } = await supabase
    .from('foreman_site_assignments')
    .select('foreman_id, workers ( id, first_name, surname, status )')
    .eq('site_id', siteId)

  const siteForemen: { id: string; name: string }[] = []
  for (const row of assignedRows ?? []) {
    const w = Array.isArray(row.workers) ? row.workers[0] : row.workers
    if (!w || w.status !== 'active') continue
    siteForemen.push({
      id: w.id,
      name: `${w.first_name} ${w.surname}`.trim(),
    })
  }

  const { data: recipients } = auditIds.length
    ? await supabase
        .from('site_audit_recipients')
        .select('audit_id, worker_id, worker_name')
        .in('audit_id', auditIds)
        .order('sent_at', { ascending: true })
    : { data: [] as { audit_id: string; worker_id: string | null; worker_name: string }[] }

  const workerIds = new Set<string>()
  for (const f of siteForemen) workerIds.add(f.id)
  for (const r of recipients ?? []) {
    if (r.worker_id) workerIds.add(r.worker_id)
  }

  const { data: views } = auditIds.length && workerIds.size
    ? await supabase
        .from('site_audit_views')
        .select('audit_id, worker_id, completed_at')
        .in('audit_id', auditIds)
        .in('worker_id', [...workerIds])
    : { data: [] as { audit_id: string; worker_id: string; completed_at: string | null }[] }

  const doneKey = (auditId: string, workerId: string) => `${auditId}:${workerId}`
  const doneSet = new Set(
    (views ?? [])
      .filter((v) => !!v.completed_at)
      .map((v) => doneKey(v.audit_id, v.worker_id)),
  )

  const recipientsByAudit = new Map<string, { workerId: string | null; workerName: string }[]>()
  for (const r of recipients ?? []) {
    const list = recipientsByAudit.get(r.audit_id) ?? []
    // De-dupe by worker (or name if no worker id)
    const key = r.worker_id ?? `name:${r.worker_name}`
    if (list.some((x) => (x.workerId ?? `name:${x.workerName}`) === key)) continue
    list.push({ workerId: r.worker_id, workerName: r.worker_name })
    recipientsByAudit.set(r.audit_id, list)
  }

  const list = (audits ?? []).map((a) => {
    const issuedTo = recipientsByAudit.get(a.id)
    const assignees = (issuedTo && issuedTo.length > 0)
      ? issuedTo
      : siteForemen.map((f) => ({ workerId: f.id as string | null, workerName: f.name }))

    const assigneeStatus = assignees.map((person) => {
      const done = person.workerId
        ? doneSet.has(doneKey(a.id, person.workerId))
        : false
      return {
        workerId:   person.workerId,
        workerName: person.workerName,
        done,
      }
    })

    const trackable = assigneeStatus.filter((p) => p.workerId)
    const doneCount = trackable.filter((p) => p.done).length
    const overall: 'done' | 'outstanding' | 'partial' | 'none' =
      trackable.length === 0
        ? (assigneeStatus.length ? 'outstanding' : 'none')
        : doneCount === 0
          ? 'outstanding'
          : doneCount === trackable.length
            ? 'done'
            : 'partial'

    return {
      id:            a.id,
      auditedByName: a.audited_by_name,
      auditedByRole: a.audited_by_role,
      auditDate:     a.audit_date,
      status:        a.status,
      pdfReady:      !!a.pdf_path,
      itemCount:     Array.isArray(a.site_audit_items) ? a.site_audit_items.length : 0,
      assignees:     assigneeStatus,
      progress:      overall,
      doneCount,
      assigneeCount: trackable.length || assigneeStatus.length,
    }
  })

  const draft = list.find((a) => a.status === 'draft') ?? null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto">
          <Link
            href="/admin/site-audits"
            className="text-orange-400 text-xs font-semibold tracking-widest uppercase"
          >
            ← All sites
          </Link>
          <h1 className="text-xl font-bold text-white mt-1">Site Audits</h1>
          <p className="text-slate-400 text-sm mt-0.5">{site.name}</p>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 pt-5 pb-16">
        <SiteAuditsListClient
          siteId={siteId}
          siteName={site.name}
          audits={list}
          draft={draft}
        />
      </main>
    </div>
  )
}
