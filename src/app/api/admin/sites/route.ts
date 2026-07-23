import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { allocateNextSiteCode } from '@/lib/variations/vo-reference'

export async function POST(request: NextRequest) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { name, address } = await request.json()
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Site name is required.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const siteCode = await allocateNextSiteCode(supabase)
    const { data, error } = await supabase
      .from('sites')
      .insert({
        id:        crypto.randomUUID(),
        name:      name.trim(),
        address:   address?.trim() || null,
        is_active: true,
        site_code: siteCode,
      })
      .select('id')
      .single()

    if (error) return apiError("api/admin/sites", error)
    return NextResponse.json({ success: true, siteId: data.id })
  } catch (err) {
    return apiError("api/admin/sites", err)
  }
}
