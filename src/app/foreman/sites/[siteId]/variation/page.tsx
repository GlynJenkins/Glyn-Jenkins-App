import { createServiceClient } from '@/lib/supabase/server'
import { requireForemanAccess } from '@/lib/auth/portal-access'
import { notFound } from 'next/navigation'
import VariationForm from './_components/VariationForm'

export const dynamic = 'force-dynamic'

export default async function VariationPage({
  params,
}: {
  params: Promise<{ siteId: string }>
}) {
  const { siteId } = await params

  const { worker: foreman } = await requireForemanAccess()

  const supabase = createServiceClient()

  // ── Verify site assignment ──────────────────────────
    .from('foreman_site_assignments')
    .select('site_id')
    .eq('foreman_id', foreman.id)
    .eq('site_id', siteId)
    .maybeSingle()

  if (!assignment) notFound()

  const { data: site } = await supabase
    .from('sites')
    .select('id, name')
    .eq('id', siteId)
    .maybeSingle()

  if (!site) notFound()

  // ── Fetch active workers for dropdown ─────────────────────────
  const { data: workers } = await supabase
    .from('workers')
    .select('id, first_name, surname, role')
    .in('role', ['bricklayer', 'labourer', 'apprentice'])
    .eq('status', 'active')
    .order('surname')

  return (
    <VariationForm
      site={site}
      foremanId={foreman.id}
      workers={workers ?? []}
    />
  )
}
