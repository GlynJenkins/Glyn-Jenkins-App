import { createServiceClient } from '@/lib/supabase/server'
import { requireAdminAccess } from '@/lib/auth/portal-access'
import { loadSiteSignOffQueue } from '@/lib/variations/load-site-signoff-queue'
import { notFound } from 'next/navigation'
import DeveloperAgentSignOffQueue from '../_components/DeveloperAgentSignOffQueue'

export const dynamic = 'force-dynamic'

export default async function SiteDeveloperAgentSignOffPage({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  await requireAdminAccess()
  const { siteId } = await params

  const supabase = createServiceClient()
  const { data: site } = await supabase
    .from('sites')
    .select('id, name, surveyor_name, developer_contact')
    .eq('id', siteId)
    .maybeSingle()

  if (!site) notFound()

  const rows = await loadSiteSignOffQueue(siteId)
  const defaultAgentName = site.surveyor_name?.trim() || site.developer_contact?.trim() || ''

  return (
    <DeveloperAgentSignOffQueue
      siteId={siteId}
      siteName={site.name}
      initialRows={rows}
      defaultAgentName={defaultAgentName}
      backHref="/admin/variations/sign-off"
    />
  )
}
