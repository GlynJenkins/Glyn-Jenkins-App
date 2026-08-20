import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import {
  formatClaimWeekEnding,
  loadBuildHistoryExportRows,
} from '@/lib/claims/load-site-claim-history'
import { formatSiteCode } from '@/lib/variations/vo-reference'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { siteId } = await params
    const supabase = createServiceClient()

    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id, site_code, name')
      .eq('id', siteId)
      .maybeSingle()

    if (siteError) {
      return apiError('api/admin/sites/[siteId]/build-history/export', siteError)
    }
    if (!site) {
      return NextResponse.json({ error: 'Site not found.' }, { status: 404 })
    }

    const rows = await loadBuildHistoryExportRows(supabase, siteId)
    const sheetRows = rows.map((r) => ({
      Plot:            r.plotNumber,
      Stage:           r.stageName,
      Foreman:         r.entry.foremanName,
      '%':             r.entry.pct,
      Value:           r.entry.value,
      Period:          formatClaimWeekEnding(r.entry.periodEnd),
      'Submitted date': r.entry.submittedAt
        ? new Date(r.entry.submittedAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : '',
      Status:          r.entry.voided
        ? `${r.entry.status} (voided)`
        : r.entry.status,
    }))

    const ws = XLSX.utils.json_to_sheet(
      sheetRows.length > 0
        ? sheetRows
        : [{ Plot: '', Stage: '', Foreman: '', '%': '', Value: '', Period: '', 'Submitted date': '', Status: '' }],
    )
    ws['!cols'] = [
      { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 6 },
      { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 16 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Build history')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const code = formatSiteCode(site.site_code).replace(/[^\w-]+/g, '_')
    const filename = `Build-History_${code}_${new Date().toISOString().slice(0, 10)}.xlsx`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'private, no-store',
      },
    })
  } catch (err) {
    return apiError('api/admin/sites/[siteId]/build-history/export', err)
  }
}
