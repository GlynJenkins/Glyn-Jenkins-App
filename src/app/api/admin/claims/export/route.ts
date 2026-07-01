import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import {
  filterWagesRegisterRows,
  loadWagesRegisterRows,
  wagesRegisterPeriodKey,
  wagesRegisterToSheetRows,
} from '@/lib/claims/load-wages-register'

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

    const sheetRows = wagesRegisterToSheetRows(rows)
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    ws['!cols'] = [
      { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 12 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 10 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Wages')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    let suffix = new Date().toISOString().slice(0, 10)
    if (periodKey && periodKey !== 'all') {
      const match = allRows.find((r) => wagesRegisterPeriodKey(r) === periodKey)
      if (match) {
        suffix = (match.periodEnd ?? suffix).slice(0, 10)
      }
    }
    const filename = `wages-register-${suffix}.xlsx`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed.' },
      { status: 500 },
    )
  }
}
