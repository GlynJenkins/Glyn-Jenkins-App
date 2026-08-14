import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireManagementAreaAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { formatWorkerRole } from '@/lib/toolbox-talks/helpers'
import DownloadToolboxTalkPdfButton from '../_components/DownloadToolboxTalkPdfButton'
import { CheckCircle2, AlertCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default async function ToolboxTalkDetailPage({
  params,
}: {
  params: Promise<{ talkId: string }>
}) {
  await requireManagementAreaAccess()
  const { talkId } = await params
  const supabase = createServiceClient()

  const { data: talk } = await supabase
    .from('toolbox_talks')
    .select(`
      id, title, description, status, conducted_at, conducted_by_name, conducted_by_role,
      pdf_path, site_id,
      sites ( id, name ),
      toolbox_talk_attendees (
        id, worker_name, worker_role, signature_path, signed_at
      )
    `)
    .eq('id', talkId)
    .maybeSingle()

  if (!talk) notFound()

  const site = Array.isArray(talk.sites) ? talk.sites[0] : talk.sites
  const attendees = talk.toolbox_talk_attendees ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-3xl mx-auto flex items-start justify-between gap-4">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Toolbox Talk
            </p>
            <h1 className="text-xl font-bold text-white mt-0.5">{talk.title}</h1>
            <p className="text-slate-400 text-sm mt-1">
              {site?.name ?? 'Site'} · {formatWhen(talk.conducted_at)}
            </p>
          </div>
          <Link
            href={`/admin/toolbox-talks?siteId=${talk.site_id}`}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm
                       font-medium rounded-xl transition-colors shrink-0"
          >
            ← Back
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-5 pb-16 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3 text-sm">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Conducted by</p>
            <p className="text-slate-800 font-medium mt-0.5">
              {talk.conducted_by_name}
              {talk.conducted_by_role ? ` · ${formatWorkerRole(talk.conducted_by_role)}` : ''}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Subject of talk</p>
            <p className="text-slate-700 mt-1 whitespace-pre-wrap leading-relaxed">{talk.description}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-semibold text-slate-900 text-sm">
              Attendees ({attendees.length})
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {attendees.map((a) => {
              const signed = !!a.signature_path
              return (
                <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{a.worker_name}</p>
                    <p className="text-xs text-slate-400">{formatWorkerRole(a.worker_role)}</p>
                  </div>
                  {signed ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Signed
                      {a.signed_at ? ` · ${formatWhen(a.signed_at)}` : ''}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                      <AlertCircle className="w-3.5 h-3.5" /> Did not sign
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {talk.pdf_path && <DownloadToolboxTalkPdfButton talkId={talk.id} />}

        {talk.status === 'draft' && (
          <Link
            href={`/admin/toolbox-talks/new?siteId=${talk.site_id}&talkId=${talk.id}`}
            className="block text-center w-full py-3 bg-slate-900 text-white font-semibold rounded-xl"
          >
            Continue signing
          </Link>
        )}
      </main>
    </div>
  )
}
