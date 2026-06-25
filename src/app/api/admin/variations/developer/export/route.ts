import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { loadDeveloperRegisterRows } from '@/lib/variations/submission-totals'

export const dynamic = 'force-dynamic'

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function paymentLabel(paymentStatus: string, status: string) {
  if (paymentStatus === 'paid' || status === 'paid') return 'Paid'
  return 'Unpaid'
}

export async function GET() {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const rows = await loadDeveloperRegisterRows()

    const sheetRows = rows.map((r) => ({
      'Site':                    r.siteName,
      'Reason for VO':           r.description,
      'Foreman variation cost':  r.foremanTotal,
      'Developer charge':        r.developerTotal,
      'Profit':                  r.profit,
      'Paid / Unpaid':           paymentLabel(r.paymentStatus, r.status),
      'Sent to developer':       formatDate(r.submittedAt),
      'Foreman':                 r.foremanName,
      'Status':                  r.status,
    }))

    const ws = XLSX.utils.json_to_sheet(sheetRows)
    ws['!cols'] = [
      { wch: 22 }, { wch: 36 }, { wch: 18 }, { wch: 16 }, { wch: 10 },
      { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 14 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Developer Variations')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const filename = `developer-variations-${new Date().toISOString().slice(0, 10)}.xlsx`

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
      { status: 500 }
    )
  }
}
