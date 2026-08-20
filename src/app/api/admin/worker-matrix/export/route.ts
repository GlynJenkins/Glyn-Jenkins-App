import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import {
  loadWorkerMatrix,
  workerMatrixToSheetRows,
} from '@/lib/workers/load-worker-matrix'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const supabase = createServiceClient()
    const { active, inactive } = await loadWorkerMatrix(supabase)

    const wb = XLSX.utils.book_new()

    const activeWs = XLSX.utils.json_to_sheet(workerMatrixToSheetRows(active))
    activeWs['!cols'] = [
      { wch: 22 }, { wch: 18 }, { wch: 6 }, { wch: 14 },
      { wch: 14 }, { wch: 28 }, { wch: 36 }, { wch: 14 }, { wch: 10 },
    ]
    XLSX.utils.book_append_sheet(wb, activeWs, 'Active')

    const inactiveWs = XLSX.utils.json_to_sheet(workerMatrixToSheetRows(inactive))
    inactiveWs['!cols'] = activeWs['!cols']
    XLSX.utils.book_append_sheet(wb, inactiveWs, 'Inactive')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const filename = `Worker-Matrix_${new Date().toISOString().slice(0, 10)}.xlsx`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    return apiError('api/admin/worker-matrix/export', err)
  }
}
