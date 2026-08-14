import Link from 'next/link'
import { requireManagementAreaAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { formatSiteCode } from '@/lib/variations/vo-reference'
import { ClipboardList, Plus } from 'lucide-react'
import DownloadToolboxTalkPdfButton from './_components/DownloadToolboxTalkPdfButton'
import DeleteDraftTalkButton from './_components/DeleteDraftTalkButton'

export const dynamic = 'force-dynamic'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default async function ToolboxTalksPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>
}) {
  await requireManagementAreaAccess()
  const { siteId } = await searchParams
  const supabase = createServiceClient()

  if (siteId) {
    const { data: site } = await supabase
      .from('sites')
      .select('id, name, site_code, address')
      .eq('id', siteId)
      .maybeSingle()

    if (!site) {
      return (
        <div className="min-h-screen bg-gray-50 p-6">
          <p className="text-slate-600">Site not found.</p>
          <Link href="/admin/toolbox-talks" className="text-orange-600 text-sm underline">Back</Link>
        </div>
      )
    }

    const { data: talks } = await supabase
      .from('toolbox_talks')
      .select(`
        id, title, status, conducted_at, conducted_by_name, pdf_path,
        toolbox_talk_attendees ( id )
      `)
      .eq('site_id', siteId)
      .order('conducted_at', { ascending: false })

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-slate-900 px-5 pt-12 pb-6">
          <div className="max-w-3xl mx-auto flex items-start justify-between gap-4">
            <div>
              <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
                Toolbox Talks
              </p>
              <h1 className="text-xl font-bold text-white mt-0.5">{site.name}</h1>
              <p className="text-slate-400 text-sm mt-1">
                {formatSiteCode(site.site_code)}
                {site.address ? ` · ${site.address}` : ''}
              </p>
            </div>
            <Link
              href="/admin/toolbox-talks"
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm
                         font-medium rounded-xl transition-colors shrink-0"
            >
              ← Sites
            </Link>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 pt-5 pb-16 space-y-4">
          <Link
            href={`/admin/toolbox-talks/new?siteId=${site.id}`}
            className="flex items-center justify-center gap-2 w-full py-3.5 bg-orange-500 hover:bg-orange-600
                       text-white font-semibold text-sm rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Toolbox Talk
          </Link>

          {(talks ?? []).length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-12">No toolbox talks on this site yet.</p>
          ) : (
            <div className="space-y-3">
              {(talks ?? []).map((t) => {
                const count = Array.isArray(t.toolbox_talk_attendees) ? t.toolbox_talk_attendees.length : 0
                const isDraft = t.status === 'draft'
                const isAmending = t.status === 'amending'
                return (
                  <div
                    key={t.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{t.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatDate(t.conducted_at)} · {t.conducted_by_name} · {count} attendee{count === 1 ? '' : 's'}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full shrink-0 ${
                        isDraft
                          ? 'bg-amber-100 text-amber-700'
                          : isAmending
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {isDraft ? 'Draft' : isAmending ? 'Amending' : 'Completed'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isDraft ? (
                        <>
                          <Link
                            href={`/admin/toolbox-talks/new?siteId=${site.id}&talkId=${t.id}`}
                            className="px-3 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
                          >
                            Continue signing
                          </Link>
                          <DeleteDraftTalkButton talkId={t.id} siteId={site.id} />
                        </>
                      ) : isAmending ? (
                        <Link
                          href={`/admin/toolbox-talks/new?siteId=${site.id}&talkId=${t.id}&amend=1`}
                          className="px-3 py-2 bg-orange-600 text-white text-xs font-semibold rounded-lg"
                        >
                          Continue amendment
                        </Link>
                      ) : (
                        <>
                          <Link
                            href={`/admin/toolbox-talks/${t.id}`}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg"
                          >
                            View
                          </Link>
                          {t.pdf_path && (
                            <div className="min-w-[140px]">
                              <DownloadToolboxTalkPdfButton talkId={t.id} />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </main>
      </div>
    )
  }

  // Site cards with talk counts
  const { data: sites } = await supabase
    .from('sites')
    .select('id, name, address, site_code, is_active')
    .eq('is_active', true)
    .order('name')

  const { data: talkRows } = await supabase
    .from('toolbox_talks')
    .select('site_id, conducted_at, status')

  const bySite = new Map<string, { count: number; last: string | null }>()
  for (const t of talkRows ?? []) {
    const cur = bySite.get(t.site_id) ?? { count: 0, last: null }
    cur.count += 1
    if (!cur.last || (t.conducted_at && t.conducted_at > cur.last)) cur.last = t.conducted_at
    bySite.set(t.site_id, cur)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 px-5 pt-12 pb-6">
        <div className="max-w-3xl mx-auto flex items-start justify-between gap-4">
          <div>
            <p className="text-orange-400 text-xs font-semibold tracking-widest uppercase">
              Glyn Jenkins LTD
            </p>
            <h1 className="text-xl font-bold text-white mt-0.5">Toolbox Talks</h1>
            <p className="text-slate-400 text-sm mt-1">Safety talks by site · signatures &amp; PDF records</p>
          </div>
          <Link
            href="/admin"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm
                       font-medium rounded-xl transition-colors shrink-0"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-5 pb-16 space-y-3">
        {(sites ?? []).length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-12">No active sites yet.</p>
        ) : (
          (sites ?? []).map((site) => {
            const stats = bySite.get(site.id) ?? { count: 0, last: null }
            return (
              <Link
                key={site.id}
                href={`/admin/toolbox-talks?siteId=${site.id}`}
                className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm
                           p-4 hover:border-orange-200 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <ClipboardList className="w-5 h-5 text-slate-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 truncate">{site.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {stats.count} talk{stats.count === 1 ? '' : 's'}
                    {stats.last ? ` · last: ${formatDate(stats.last)}` : ''}
                  </p>
                </div>
                <span className="text-xs font-semibold text-orange-600 shrink-0">Open</span>
              </Link>
            )
          })
        )}
      </main>
    </div>
  )
}
