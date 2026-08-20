import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteClaimPeriod } from '@/lib/claims/delete-claim-period'

async function deleteSiteClaims(
  supabase: SupabaseClient,
  siteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: claims, error } = await supabase
    .from('claim_periods')
    .select('id, status')
    .eq('site_id', siteId)

  if (error) {
    return { ok: false, error: `Could not load claims for this site: ${error.message}` }
  }

  for (const claim of claims ?? []) {
    const reverseGridPct = claim.status === 'pending'
    const result = await deleteClaimPeriod(claim.id, { reverseGridPct })
    if (!result.ok) {
      return { ok: false, error: `Could not remove claim ${claim.id}: ${result.error}` }
    }
  }

  return { ok: true }
}

async function deleteSiteVariations(
  supabase: SupabaseClient,
  siteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: claimsErr } = await supabase
    .from('variation_claims')
    .delete()
    .eq('site_id', siteId)
  if (claimsErr) {
    return { ok: false, error: `Could not clear variation claims: ${claimsErr.message}` }
  }

  const { data: submissions, error: subErr } = await supabase
    .from('variation_developer_submissions')
    .select('id')
    .eq('site_id', siteId)

  if (subErr && !/relation|does not exist|PGRST/i.test(subErr.message)) {
    return { ok: false, error: `Could not load developer submissions: ${subErr.message}` }
  }

  for (const row of submissions ?? []) {
    await supabase
      .from('variation_developer_lines')
      .delete()
      .eq('developer_submission_id', row.id)

    const { error: delErr } = await supabase
      .from('variation_developer_submissions')
      .delete()
      .eq('id', row.id)
    if (delErr) {
      return {
        ok: false,
        error: `Could not remove developer submission ${row.id}: ${delErr.message}`,
      }
    }
  }

  return { ok: true }
}

async function deleteSiteTalksAndAudits(
  supabase: SupabaseClient,
  siteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: talks } = await supabase
    .from('toolbox_talks')
    .select('id, pdf_path, manager_signature_path')
    .eq('site_id', siteId)

  for (const talk of talks ?? []) {
    const { data: attendees } = await supabase
      .from('toolbox_talk_attendees')
      .select('signature_path')
      .eq('talk_id', talk.id)

    const paths = [
      talk.pdf_path,
      talk.manager_signature_path,
      ...(attendees ?? []).map((a) => a.signature_path),
    ].filter((p): p is string => !!p && !p.startsWith('http'))

    if (paths.length > 0) {
      await supabase.storage.from('worker-documents').remove(paths)
    }

    await supabase.from('toolbox_talk_attendees').delete().eq('talk_id', talk.id)
    const { error } = await supabase.from('toolbox_talks').delete().eq('id', talk.id)
    if (error) {
      return { ok: false, error: `Could not delete toolbox talk: ${error.message}` }
    }
  }

  const { data: audits } = await supabase
    .from('site_audits')
    .select('id, pdf_path')
    .eq('site_id', siteId)

  for (const audit of audits ?? []) {
    if (audit.pdf_path) {
      await supabase.storage.from('worker-documents').remove([audit.pdf_path])
    }
    // recipients / items / photos / views cascade from site_audits when configured;
    // delete explicitly for older schemas.
    await supabase.from('site_audit_views').delete().eq('audit_id', audit.id)
    const { data: items } = await supabase
      .from('site_audit_items')
      .select('id')
      .eq('audit_id', audit.id)
    for (const item of items ?? []) {
      const { data: photos } = await supabase
        .from('site_audit_photos')
        .select('photo_path')
        .eq('item_id', item.id)
      const photoPaths = (photos ?? []).map((p) => p.photo_path).filter(Boolean)
      if (photoPaths.length > 0) {
        await supabase.storage.from('worker-documents').remove(photoPaths)
      }
      await supabase.from('site_audit_photos').delete().eq('item_id', item.id)
    }
    await supabase.from('site_audit_items').delete().eq('audit_id', audit.id)
    await supabase.from('site_audit_recipients').delete().eq('audit_id', audit.id)
    const { error } = await supabase.from('site_audits').delete().eq('id', audit.id)
    if (error) {
      return { ok: false, error: `Could not delete site audit: ${error.message}` }
    }
  }

  return { ok: true }
}

async function clearSiteGridAndOps(
  supabase: SupabaseClient,
  siteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ops: Array<[string, PromiseLike<{ error: { message: string } | null }>]> = [
    ['price grid', supabase.from('price_grid').delete().eq('site_id', siteId)],
    ['site stages', supabase.from('site_stages').delete().eq('site_id', siteId)],
    ['foreman assignments', supabase.from('foreman_site_assignments').delete().eq('site_id', siteId)],
    ['jetwash plots', supabase.from('jetwash_plot_status').delete().eq('site_id', siteId)],
    ['firesock photos', supabase.from('firesock_plot_photos').delete().eq('site_id', siteId)],
    ['firesock plots', supabase.from('firesock_plot_status').delete().eq('site_id', siteId)],
    ['QA inspections', supabase.from('qa_plot_inspections').delete().eq('site_id', siteId)],
  ]

  for (const [label, promise] of ops) {
    const { error } = await promise
    // Ignore missing tables on older DBs
    if (error && !/relation|does not exist|PGRST/i.test(error.message)) {
      return { ok: false, error: `Could not clear ${label}: ${error.message}` }
    }
  }

  // Ledger rows may keep a site pointer — detach rather than wipe pay history.
  const { error: ledgerErr } = await supabase
    .from('worker_cis_ledger')
    .update({ site_id: null })
    .eq('site_id', siteId)
  if (
    ledgerErr &&
    !/relation|does not exist|PGRST|column/i.test(ledgerErr.message)
  ) {
    return { ok: false, error: `Could not detach ledger rows: ${ledgerErr.message}` }
  }

  return { ok: true }
}

export type DeleteSiteResult =
  | { ok: true }
  | { ok: false; error: string; status?: number }

/**
 * Permanently remove a site and related site-scoped records.
 * Use for clearing test sites; production sites with real pay history should usually be set inactive instead.
 */
export async function deleteSitePermanently(
  supabase: SupabaseClient,
  siteId: string,
): Promise<DeleteSiteResult> {
  const { data: site, error: fetchError } = await supabase
    .from('sites')
    .select('id, name')
    .eq('id', siteId)
    .maybeSingle()

  if (fetchError) {
    return { ok: false, status: 500, error: fetchError.message }
  }
  if (!site) {
    return { ok: false, status: 404, error: 'Site not found.' }
  }

  const claims = await deleteSiteClaims(supabase, siteId)
  if (!claims.ok) return claims

  const variations = await deleteSiteVariations(supabase, siteId)
  if (!variations.ok) return variations

  const talks = await deleteSiteTalksAndAudits(supabase, siteId)
  if (!talks.ok) return talks

  const grid = await clearSiteGridAndOps(supabase, siteId)
  if (!grid.ok) return grid

  const { error: deleteError } = await supabase.from('sites').delete().eq('id', siteId)
  if (deleteError) {
    return {
      ok: false,
      status: 409,
      error:
        `Could not delete this site because other records still reference it (${deleteError.message}). ` +
        'Set it inactive instead, or clear related claims/variations first.',
    }
  }

  return { ok: true }
}
