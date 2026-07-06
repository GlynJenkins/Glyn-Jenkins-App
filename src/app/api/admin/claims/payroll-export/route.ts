import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import {
  filterWagesRegisterRows,
  loadWagesRegisterRows,
  wagesRegisterPeriodKey,
} from '@/lib/claims/load-wages-register'
import {
  buildPayrollCsvRows,
  payrollCsvContent,
  payrollExportFilename,
  type WorkerBankDetails,
} from '@/lib/claims/payroll-csv'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const foremanId = searchParams.get('foreman') ?? undefined
    const role      = searchParams.get('role') ?? undefined
    const periodKey = searchParams.get('period') ?? undefined

    const supabase = createServiceClient()
    const allRows = await loadWagesRegisterRows(supabase)
    const rows = filterWagesRegisterRows(allRows, { foremanId, role, periodKey })

    const workerIds = [...new Set(rows.map((r) => r.workerId))]
    const bankByWorkerId = new Map<string, WorkerBankDetails>()

    if (workerIds.length > 0) {
      const { data: workers, error } = await supabase
        .from('workers')
        .select('id, bank_sort_code, bank_account_number')
        .in('id', workerIds)

      if (error) throw new Error(error.message)

      for (const w of workers ?? []) {
        bankByWorkerId.set(w.id, {
          sortCode:      w.bank_sort_code ?? null,
          accountNumber: w.bank_account_number ?? null,
        })
      }
    }

    const result = buildPayrollCsvRows(rows, bankByWorkerId)
    const csv = payrollCsvContent(result)

    let periodEnd: string | null = null
    if (periodKey && periodKey !== 'all') {
      const match = allRows.find((r) => wagesRegisterPeriodKey(r) === periodKey)
      periodEnd = match?.periodEnd ?? null
    } else if (rows.length > 0) {
      periodEnd = rows.reduce((latest, r) => {
        if (!r.periodEnd) return latest
        return !latest || r.periodEnd > latest ? r.periodEnd : latest
      }, null as string | null)
    }

    const filename = payrollExportFilename(periodEnd)
    const skippedNote = result.skipped.length > 0
      ? `; ${result.skipped.length} worker(s) skipped (missing bank details or zero pay)`
      : ''

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
        'X-Payroll-Rows':      String(result.rows.length),
        'X-Payroll-Skipped':   String(result.skipped.length),
        'X-Payroll-Total-Net': result.totalNet.toFixed(2),
        'X-Payroll-Note':      `Bank transfer CSV for online banking import${skippedNote}`,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Payroll export failed.' },
      { status: 500 },
    )
  }
}
