import type { SupabaseClient } from '@supabase/supabase-js'
import type { QaInspectionState } from './inspection-state'

export type QaSnagRow = {
  id:                string
  inspection_id:     string
  round:             number
  description:       string
  raised_photo_path: string | null
  fixed:             boolean
  fixed_at:          string | null
  fixed_photo_path:  string | null
  fixed_note:        string | null
  fixed_by:          string | null
  sort_order:        number
  created_at:        string
}

export type QaSnagInsert = {
  description: string
  raised_photo_path?: string | null
  sort_order?: number
  round?: number
}

export async function fetchSnagsForInspection(
  supabase: SupabaseClient,
  inspectionId: string,
): Promise<QaSnagRow[]> {
  const { data, error } = await supabase
    .from('qa_inspection_snags')
    .select('*')
    .eq('inspection_id', inspectionId)
    .order('round', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as QaSnagRow[]
}

export async function fetchOpenSnagCountBySite(
  supabase: SupabaseClient,
  siteIds: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const id of siteIds) counts[id] = 0
  if (siteIds.length === 0) return counts

  const { data: inspections, error } = await supabase
    .from('qa_plot_inspections')
    .select('id, site_id')
    .in('site_id', siteIds)
    .eq('status', 'completed')
    .eq('inspection_state', 'failed_open')
  if (error) throw error
  if (!inspections?.length) return counts

  const byInspection = new Map(inspections.map((r) => [r.id, r.site_id]))
  const { data: snags, error: snagErr } = await supabase
    .from('qa_inspection_snags')
    .select('id, inspection_id')
    .in('inspection_id', [...byInspection.keys()])
    .eq('fixed', false)
  if (snagErr) throw snagErr

  for (const snag of snags ?? []) {
    const siteId = byInspection.get(snag.inspection_id)
    if (!siteId) continue
    counts[siteId] = (counts[siteId] ?? 0) + 1
  }
  return counts
}

export async function countAwaitingReinspection(
  supabase: SupabaseClient,
): Promise<number> {
  const { count, error } = await supabase
    .from('qa_plot_inspections')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .eq('inspection_state', 'awaiting_reinspection')
  if (error) throw error
  return count ?? 0
}

export async function insertSnags(
  supabase: SupabaseClient,
  inspectionId: string,
  snags: QaSnagInsert[],
  round: number,
): Promise<void> {
  if (snags.length === 0) return
  const rows = snags.map((s, i) => ({
    inspection_id:     inspectionId,
    round,
    description:       s.description.trim(),
    raised_photo_path: s.raised_photo_path ?? null,
    sort_order:        s.sort_order ?? i,
  }))
  const { error } = await supabase.from('qa_inspection_snags').insert(rows)
  if (error) throw error
}

export async function refreshInspectionStateFromSnags(
  supabase: SupabaseClient,
  inspectionId: string,
): Promise<QaInspectionState> {
  const { data: snags, error } = await supabase
    .from('qa_inspection_snags')
    .select('fixed')
    .eq('inspection_id', inspectionId)
  if (error) throw error

  const list = snags ?? []
  if (list.length === 0) {
    await supabase
      .from('qa_plot_inspections')
      .update({ inspection_state: 'passed', updated_at: new Date().toISOString() })
      .eq('id', inspectionId)
    return 'passed'
  }

  const allFixed = list.every((s) => s.fixed)
  const next: QaInspectionState = allFixed ? 'awaiting_reinspection' : 'failed_open'
  await supabase
    .from('qa_plot_inspections')
    .update({ inspection_state: next, updated_at: new Date().toISOString() })
    .eq('id', inspectionId)
  return next
}

/** Best-effort SMS to assigned foremen — never throws. */
export async function notifySiteForemenSms(
  supabase: SupabaseClient,
  siteId: string,
  body: string,
): Promise<void> {
  try {
    if (
      !process.env.TWILIO_ACCOUNT_SID ||
      !process.env.TWILIO_AUTH_TOKEN ||
      !process.env.TWILIO_MESSAGING_SERVICE_SID
    ) {
      return
    }

    const { data: assignments } = await supabase
      .from('foreman_site_assignments')
      .select('foreman_id')
      .eq('site_id', siteId)
    const ids = (assignments ?? []).map((a) => a.foreman_id)
    if (ids.length === 0) return

    const { data: workers } = await supabase
      .from('workers')
      .select('id, phone')
      .in('id', ids)

    const twilio = (await import('twilio')).default
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    )

    for (const w of workers ?? []) {
      if (!w.phone) continue
      await client.messages.create({
        from: process.env.TWILIO_MESSAGING_SERVICE_SID,
        to:   w.phone,
        body,
      }).catch(() => null)
    }
  } catch (err) {
    console.warn('[QA] Foreman SMS notify failed:', err instanceof Error ? err.message : 'unknown')
  }
}
