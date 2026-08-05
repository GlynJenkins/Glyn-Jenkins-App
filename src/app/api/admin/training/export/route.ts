import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import * as XLSX from 'xlsx'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import {
  formatCscsExpiry,
  cscsStatusLabel,
  hsStatusLabel,
  loadTrainingMatrix,
} from '@/lib/training/load-training-matrix'
import { generateTrainingMatrixPdf } from '@/lib/training/generate-training-matrix-pdf'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const format = (request.nextUrl.searchParams.get('format') ?? 'xlsx').toLowerCase()
    if (format !== 'xlsx' && format !== 'pdf') {
      return NextResponse.json({ error: 'format must be xlsx or pdf.' }, { status: 400 })
    }

    const { rows } = await loadTrainingMatrix()
    const stamp = new Date().toISOString().slice(0, 10)

    if (format === 'pdf') {
      const buffer = await generateTrainingMatrixPdf(rows)
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `attachment; filename="training-matrix-${stamp}.pdf"`,
          'Cache-Control':       'no-store',
        },
      })
    }

    const sheetRows = rows.map((r) => ({
      'Name':                 r.name,
      'Trade':                r.trade,
      'Qualification':        r.qualification,
      'CSCS Number':          r.cscsNumber ?? '',
      'CSCS Expiry':          formatCscsExpiry(r.cscsExpiryDate),
      'CSCS Status':          cscsStatusLabel(r.cscsStatus),
      'H&S (SSSTS/SMSTS)':    hsStatusLabel(r.hsStatus),
    }))

    const ws = XLSX.utils.json_to_sheet(sheetRows)
    ws['!cols'] = [
      { wch: 22 }, { wch: 16 }, { wch: 22 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 16 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Training Matrix')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="training-matrix-${stamp}.xlsx"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    return apiError('api/admin/training/export', err)
  }
}
