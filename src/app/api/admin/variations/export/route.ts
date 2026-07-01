import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { loadVariationRegisterRows } from '@/lib/variations/load-variation-register-rows'

export const dynamic = 'force-dynamic'

function formatDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export async function GET() {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const rows = await loadVariationRegisterRows()

    const sheetRows = rows.map((r) => ({
      'Reference':         r.reference,
      'Site':              r.siteName,
      'Reason for VO':     r.description,
      'Foreman cost':      r.foremanTotal,
      'Foreman':           r.foremanName,
      'Approved':          formatDate(r.approvedAt),
      'In wage claim':     r.claimed ? 'Yes' : 'No',
      'Developer paid':    r.developerPaid ? 'Yes' : 'No',
      'Developer paid on': formatDate(r.developerPaidAt),
    }))

    const ws = XLSX.utils.json_to_sheet(sheetRows)
    ws['!cols'] = [
      { wch: 12 }, { wch: 22 }, { wch: 36 }, { wch: 14 }, { wch: 18 },
      { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Variations')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const filename = `variations-${new Date().toISOString().slice(0, 10)}.xlsx`

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
