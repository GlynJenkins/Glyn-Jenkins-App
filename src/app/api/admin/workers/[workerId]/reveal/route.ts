import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizeSortCode } from '@/lib/claims/payroll-csv'
import {
  rateLimitKey,
  SENSITIVE_REVEAL_RATE_LIMIT,
} from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

function adminDisplayName(
  worker: { first_name: string; surname: string } | null,
  userEmail: string | undefined,
): string {
  if (worker) {
    const name = `${worker.first_name} ${worker.surname}`.trim()
    if (name) return name
  }
  return userEmail?.trim() || 'Admin'
}

/** Explicit reveal of full bank / UTR / NI — audited; never part of the profile page payload. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> },
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  const limited = await rateLimitKey(auth.user.id, SENSITIVE_REVEAL_RATE_LIMIT)
  if (!limited.success) {
    return NextResponse.json(
      { error: 'Too many reveals. Please wait a few minutes and try again.' },
      { status: 429 },
    )
  }

  try {
    const { workerId } = await params
    const supabase = createServiceClient()

    const { data: worker, error: fetchError } = await supabase
      .from('workers')
      .select('id, bank_sort_code, bank_account_number, utr_number, ni_number')
      .eq('id', workerId)
      .maybeSingle()

    if (fetchError || !worker) {
      return NextResponse.json({ error: 'Worker not found.' }, { status: 404 })
    }

    const bankSortCode = normalizeSortCode(worker.bank_sort_code) ?? worker.bank_sort_code
    const bankAccountNumber = worker.bank_account_number
      ? worker.bank_account_number.replace(/\D/g, '') || worker.bank_account_number
      : null
    const utrNumber = worker.utr_number
    const niNumber = worker.ni_number

    const fields: string[] = []
    if (bankSortCode && bankAccountNumber) fields.push('bank')
    if (utrNumber) fields.push('utr')
    if (niNumber) fields.push('ni')
    const fieldsLabel = fields.length > 0 ? fields.join(',') : 'none'

    const revealedBy = adminDisplayName(auth.worker, auth.user.email)
    const revealedAt = new Date().toISOString()

    const { error: auditError } = await supabase.from('sensitive_reveals').insert({
      worker_id:   workerId,
      revealed_by: revealedBy,
      revealed_at: revealedAt,
      fields:      fieldsLabel,
    })

    if (auditError) {
      // Log the event only — never the values.
      console.error('[sensitive-reveal] audit insert failed:', auditError.message)
      return apiError('api/admin/workers/[workerId]/reveal', auditError, 'Could not record reveal.')
    }

    console.info(
      `[sensitive-reveal] worker=${workerId} by=${revealedBy} fields=${fieldsLabel}`,
    )

    return NextResponse.json({
      bankSortCode:       bankSortCode || null,
      bankAccountNumber:  bankAccountNumber || null,
      utrNumber:          utrNumber || null,
      niNumber:           niNumber || null,
      revealedAt,
      revealedBy,
      fields: fieldsLabel,
    })
  } catch (err) {
    return apiError('api/admin/workers/[workerId]/reveal', err)
  }
}
