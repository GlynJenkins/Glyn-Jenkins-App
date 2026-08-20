import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteClaimPeriod } from '@/lib/claims/delete-claim-period'

const DOC_URL_FIELDS = [
  'cscs_card_url',
  'id_document_url',
  'insurance_certificate_url',
  'hs_qualification_url',
  'firesock_certificate_url',
  'subcontract_signature_url',
  'subcontract_agreement_pdf_url',
] as const

function storagePathFromStored(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  // Stored values are usually bucket-relative paths; tolerate accidental full URLs.
  const marker = '/worker-documents/'
  const idx = trimmed.indexOf(marker)
  if (idx >= 0) return trimmed.slice(idx + marker.length).split('?')[0] || null
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return null
  return trimmed
}

async function nullWorkerRefs(
  supabase: SupabaseClient,
  workerId: string,
): Promise<void> {
  await Promise.all([
    supabase.from('jetwash_plot_status').update({ washed_by: null }).eq('washed_by', workerId),
    supabase.from('qa_plot_inspections').update({ inspected_by: null }).eq('inspected_by', workerId),
    supabase.from('firesock_plot_photos').update({ uploaded_by: null }).eq('uploaded_by', workerId),
    supabase
      .from('management_holiday_requests')
      .update({ reviewed_by: null })
      .eq('reviewed_by', workerId),
    supabase
      .from('variation_claims')
      .update({ worker_id: null, assigned_foreman_id: null, foreman_id: null })
      .or(
        `worker_id.eq.${workerId},assigned_foreman_id.eq.${workerId},foreman_id.eq.${workerId}`,
      ),
    supabase
      .from('variation_developer_submissions')
      .update({ assigned_foreman_id: null, created_by: null })
      .or(`assigned_foreman_id.eq.${workerId},created_by.eq.${workerId}`),
    supabase.from('site_audits').update({ worker_id: null }).eq('worker_id', workerId),
    supabase.from('toolbox_talk_attendees').update({ worker_id: null }).eq('worker_id', workerId),
  ])
}

async function deleteOwnedRows(
  supabase: SupabaseClient,
  workerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ops: Array<[string, PromiseLike<{ error: { message: string } | null }>]> = [
    ['sensitive reveals', supabase.from('sensitive_reveals').delete().eq('worker_id', workerId)],
    ['site audit views', supabase.from('site_audit_views').delete().eq('worker_id', workerId)],
    ['holiday requests', supabase.from('management_holiday_requests').delete().eq('worker_id', workerId)],
    ['holiday allowances', supabase.from('management_holiday_allowances').delete().eq('worker_id', workerId)],
    ['apprentice holiday ledger', supabase.from('apprentice_holiday_ledger').delete().eq('worker_id', workerId)],
    ['CIS ledger', supabase.from('worker_cis_ledger').delete().eq('worker_id', workerId)],
    ['claim allocations', supabase.from('claim_allocations').delete().eq('worker_id', workerId)],
    ['site assignments', supabase.from('foreman_site_assignments').delete().eq('foreman_id', workerId)],
  ]

  for (const [label, promise] of ops) {
    const { error } = await promise
    if (error) {
      return { ok: false, error: `Could not clear ${label}: ${error.message}` }
    }
  }

  return { ok: true }
}

async function deleteForemanClaims(
  supabase: SupabaseClient,
  workerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: claims, error } = await supabase
    .from('claim_periods')
    .select('id, status')
    .eq('foreman_id', workerId)

  if (error) {
    return { ok: false, error: `Could not load claims for this worker: ${error.message}` }
  }

  for (const claim of claims ?? []) {
    // Pending claims still hold grid %. Approved/rejected already reversed or finalised.
    const reverseGridPct = claim.status === 'pending'
    const result = await deleteClaimPeriod(claim.id, { reverseGridPct })
    if (!result.ok) {
      return {
        ok: false,
        error: `Could not remove claim ${claim.id}: ${result.error}`,
      }
    }
  }

  return { ok: true }
}

async function deleteDeveloperSubmissions(
  supabase: SupabaseClient,
  workerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: rows, error } = await supabase
    .from('variation_developer_submissions')
    .select('id')
    .eq('foreman_id', workerId)

  if (error) {
    // Table may not exist on older DBs — ignore missing relation.
    if (/relation|does not exist|PGRST/i.test(error.message)) return { ok: true }
    return { ok: false, error: `Could not load developer submissions: ${error.message}` }
  }

  for (const row of rows ?? []) {
    await supabase
      .from('variation_developer_lines')
      .delete()
      .eq('developer_submission_id', row.id)

    const { error: delErr } = await supabase
      .from('variation_developer_submissions')
      .delete()
      .eq('id', row.id)
    if (delErr) {
      // If still referenced, null foreman instead of failing the whole delete.
      const { error: nullErr } = await supabase
        .from('variation_developer_submissions')
        .update({ foreman_id: null })
        .eq('id', row.id)
      if (nullErr) {
        return {
          ok: false,
          error: `Could not detach developer submission ${row.id}: ${delErr.message}`,
        }
      }
    }
  }

  return { ok: true }
}

async function removeWorkerDocuments(
  supabase: SupabaseClient,
  worker: Record<(typeof DOC_URL_FIELDS)[number], string | null> & { id: string },
): Promise<void> {
  const paths = DOC_URL_FIELDS
    .map((field) => storagePathFromStored(worker[field]))
    .filter((p): p is string => !!p)

  if (paths.length === 0) return

  // Best-effort — missing files should not block the delete.
  await supabase.storage.from('worker-documents').remove(paths)
}

export type DeleteWorkerResult =
  | { ok: true }
  | { ok: false; error: string; status?: number }

/**
 * Permanently remove a worker and related enrolment / pay / portal data.
 * Intended for clearing test enrolments and mistaken duplicates.
 */
export async function deleteWorkerPermanently(
  supabase: SupabaseClient,
  workerId: string,
  opts: { actingWorkerId?: string | null } = {},
): Promise<DeleteWorkerResult> {
  if (opts.actingWorkerId && opts.actingWorkerId === workerId) {
    return {
      ok: false,
      status: 400,
      error: 'You cannot delete your own account while signed in.',
    }
  }

  const { data: worker, error: fetchError } = await supabase
    .from('workers')
    .select(
      `id, first_name, surname, role, auth_user_id,
       cscs_card_url, id_document_url, insurance_certificate_url,
       hs_qualification_url, firesock_certificate_url,
       subcontract_signature_url, subcontract_agreement_pdf_url`,
    )
    .eq('id', workerId)
    .maybeSingle()

  if (fetchError) {
    return { ok: false, status: 500, error: fetchError.message }
  }
  if (!worker) {
    return { ok: false, status: 404, error: 'Worker not found.' }
  }

  await nullWorkerRefs(supabase, workerId)

  const owned = await deleteOwnedRows(supabase, workerId)
  if (!owned.ok) return owned

  const claims = await deleteForemanClaims(supabase, workerId)
  if (!claims.ok) return claims

  const submissions = await deleteDeveloperSubmissions(supabase, workerId)
  if (!submissions.ok) return submissions

  // Null foreman_id on any leftover claims if deleteClaimPeriod couldn't run
  // (e.g. unexpected statuses) — only if column allows null.
  await supabase.from('claim_periods').update({ foreman_id: null }).eq('foreman_id', workerId)

  await removeWorkerDocuments(supabase, worker)

  const { error: deleteError } = await supabase.from('workers').delete().eq('id', workerId)
  if (deleteError) {
    return {
      ok: false,
      status: 409,
      error:
        `Could not delete this worker because other records still reference them (${deleteError.message}). ` +
        'Clear related claims/variations first, or contact support.',
    }
  }

  if (worker.auth_user_id) {
    await supabase.auth.admin.deleteUser(worker.auth_user_id)
  }

  return { ok: true }
}
