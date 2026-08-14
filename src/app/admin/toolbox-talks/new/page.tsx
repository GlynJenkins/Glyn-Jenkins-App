import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireManagementAreaAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import ToolboxTalkWizard from '../_components/ToolboxTalkWizard'

export const dynamic = 'force-dynamic'

export default async function NewToolboxTalkPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string; talkId?: string }>
}) {
  const { worker } = await requireManagementAreaAccess()
  const { siteId, talkId } = await searchParams
  if (!siteId) notFound()

  const supabase = createServiceClient()
  const { data: site } = await supabase
    .from('sites')
    .select('id, name')
    .eq('id', siteId)
    .maybeSingle()

  if (!site) notFound()

  const { data: workers } = await supabase
    .from('workers')
    .select('id, first_name, surname, role')
    .eq('status', 'active')
    .order('surname')

  const { data: templates } = await supabase
    .from('toolbox_talk_templates')
    .select('id, title, description')
    .order('title')

  let initialTalk = null
  if (talkId) {
    const { data: talk } = await supabase
      .from('toolbox_talks')
      .select(`
        id, site_id, title, description, status,
        conducted_by_name, conducted_by_role, manager_signature_path,
        toolbox_talk_attendees (
          id, worker_id, worker_name, worker_role, signature_path, signed_at
        )
      `)
      .eq('id', talkId)
      .eq('site_id', siteId)
      .maybeSingle()

    if (talk) {
      initialTalk = {
        id: talk.id,
        siteId: talk.site_id,
        siteName: site.name,
        title: talk.title,
        description: talk.description,
        status: talk.status,
        conductedByName: talk.conducted_by_name,
        conductedByRole: talk.conducted_by_role,
        managerSigned: !!talk.manager_signature_path,
        attendees: (talk.toolbox_talk_attendees ?? []).map((a) => ({
          id: a.id,
          workerId: a.worker_id,
          workerName: a.worker_name,
          workerRole: a.worker_role,
          signaturePath: a.signature_path,
          signedAt: a.signed_at,
        })),
      }
    }
  }

  const managerName = worker
    ? `${worker.first_name} ${worker.surname}`.trim()
    : 'Management'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-lg mx-auto flex items-start justify-between gap-4">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              New Toolbox Talk
            </p>
            <h1 className="text-xl font-bold text-white mt-0.5">{site.name}</h1>
            <p className="text-slate-400 text-sm mt-1">Mobile-friendly · pass-the-phone signing</p>
          </div>
          <Link
            href={`/admin/toolbox-talks?siteId=${site.id}`}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm
                       font-medium rounded-xl transition-colors shrink-0"
          >
            Cancel
          </Link>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-5 pb-16">
        <ToolboxTalkWizard
          siteId={site.id}
          siteName={site.name}
          workers={workers ?? []}
          templates={templates ?? []}
          initialTalk={initialTalk}
          managerName={managerName}
        />
      </main>
    </div>
  )
}
