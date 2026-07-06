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

    const result = buildPayrollCsvRows(rows)

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'No approved payments match these filters. Approve a claim first, or try a different fortnight.' },
        { status: 404 },
      )
    }

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

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
        'X-Payroll-Rows':      String(result.rows.length),
        'X-Payroll-Bank-Ready': String(result.bankReadyCount),
        'X-Payroll-Needs-Bank': String(result.needsBankCount),
        'X-Payroll-Total-Net': result.totalNet.toFixed(2),
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Payroll export failed.' },
      { status: 500 },
    )
  }
}
