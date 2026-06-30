import { NextRequest, NextResponse } from 'next/server'
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

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, siteId: data.id })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}
