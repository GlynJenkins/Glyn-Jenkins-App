import { createServiceClient } from '@/lib/supabase/server'
import { variationProfit } from '@/lib/variations/submission-totals'
import { formatVariationReference } from '@/lib/variations/vo-reference'

function isPaid(paymentStatus: string, status: string): boolean {
  return paymentStatus === 'paid' || status === 'paid'
}

function countsInAccount(status: string): boolean {
  return status !== 'draft'
}

export type SiteVariationAccountSummary = {
  siteId:         string
  siteName:       string
  siteCode:       string | null
  voCount:        number
  foremanTotal:   number
  developerTotal: number
  profit:         number
  paidAmount:     number
  pendingAmount:  number
}

export type SiteVariationVoRow = {
  id:             string
  reference:      string
  description:    string
  status:         string
  paymentStatus:  string
  foremanTotal:   number
  developerTotal: number
  profit:         number
  isPaid:         boolean
  canTogglePaid:  boolean
  foremanName:    string
  submittedAt:    string | null
}

export async function loadSiteVariationAccountSummaries(): Promise<SiteVariationAccountSummary[]> {
  const supabase = createServiceClient()

  const { data: submissions } = await supabase
    .from('variation_developer_submissions')
    .select(`
      id, site_id, status, payment_status,
      foreman_total, developer_total,
      sites ( id, name, site_code )
    `)

  const bySite = new Map<string, SiteVariationAccountSummary>()

  for (const s of submissions ?? []) {
    const site = Array.isArray(s.sites) ? s.sites[0] : s.sites
    const siteId = s.site_id as string
    const foremanTotal   = Number(s.foreman_total)
    const developerTotal = Number(s.developer_total)
    const profit         = variationProfit(developerTotal, foremanTotal)
    const paid           = isPaid(s.payment_status, s.status)
    const inAccount      = countsInAccount(s.status)

    const existing = bySite.get(siteId)
    if (existing) {
      existing.voCount += 1
      if (inAccount) {
        existing.foremanTotal   += foremanTotal
        existing.developerTotal += developerTotal
        existing.profit         += profit
        if (paid) existing.paidAmount    += developerTotal
        else      existing.pendingAmount += developerTotal
      }
    } else {
      bySite.set(siteId, {
        siteId,
        siteName:       site?.name ?? 'Unknown site',
        siteCode:       site?.site_code ?? null,
        voCount:        1,
        foremanTotal:   inAccount ? foremanTotal : 0,
        developerTotal: inAccount ? developerTotal : 0,
        profit:         inAccount ? profit : 0,
        paidAmount:     inAccount && paid ? developerTotal : 0,
        pendingAmount:  inAccount && !paid ? developerTotal : 0,
      })
    }
  }

  return Array.from(bySite.values()).sort((a, b) => {
    const codeA = a.siteCode ?? ''
    const codeB = b.siteCode ?? ''
    if (codeA !== codeB) return codeA.localeCompare(codeB, undefined, { numeric: true })
    return a.siteName.localeCompare(b.siteName)
  })
}

export async function loadSiteVariationVoRows(siteId: string): Promise<{
  site: { id: string; name: string; siteCode: string | null }
  rows: SiteVariationVoRow[]
  totals: Omit<SiteVariationAccountSummary, 'siteId' | 'siteName' | 'siteCode'>
} | null> {
  const supabase = createServiceClient()

  const { data: site } = await supabase
    .from('sites')
    .select('id, name, site_code')
    .eq('id', siteId)
    .maybeSingle()

  if (!site) return null

  const { data: submissions } = await supabase
    .from('variation_developer_submissions')
    .select(`
      id, description, status, payment_status,
      foreman_total, developer_total, vo_number,
      submitted_to_developer_at, foreman_id
    `)
    .eq('site_id', siteId)
    .order('vo_number', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  const rows: SiteVariationVoRow[] = []
  let foremanTotal   = 0
  let developerTotal = 0
  let profit         = 0
  let paidAmount     = 0
  let pendingAmount  = 0

  for (const s of submissions ?? []) {
    const { data: foreman } = await supabase
      .from('workers')
      .select('first_name, surname')
      .eq('id', s.foreman_id)
      .maybeSingle()

    const fTotal = Number(s.foreman_total)
    const dTotal = Number(s.developer_total)
    const p      = variationProfit(dTotal, fTotal)
    const paid   = isPaid(s.payment_status, s.status)
    const inAccount = countsInAccount(s.status)

    if (inAccount) {
      foremanTotal   += fTotal
      developerTotal += dTotal
      profit         += p
      if (paid) paidAmount    += dTotal
      else      pendingAmount += dTotal
    }

    rows.push({
      id:             s.id,
      reference:      formatVariationReference(site.site_code, s.vo_number),
      description:    s.description,
      status:         s.status,
      paymentStatus:  s.payment_status,
      foremanTotal:   fTotal,
      developerTotal: dTotal,
      profit:         p,
      isPaid:         paid,
      canTogglePaid:  s.status === 'agreed' || s.status === 'paid',
      foremanName:    foreman ? `${foreman.first_name} ${foreman.surname}` : 'Unknown',
      submittedAt:    s.submitted_to_developer_at,
    })
  }

  return {
    site: {
      id:       site.id,
      name:     site.name,
      siteCode: site.site_code,
    },
    rows,
    totals: {
      voCount:        rows.length,
      foremanTotal,
      developerTotal,
      profit,
      paidAmount,
      pendingAmount,
    },
  }
}
