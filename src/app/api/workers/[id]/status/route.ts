import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { id }     = await params
    const { status } = await request.json() as { status: string }

    const allowed = ['active', 'inactive', 'pending_verification']
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { error } = await supabase
      .from('workers')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      return apiError("api/workers/[id]/status", error)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError("api/workers/[id]/status", err)
  }
}
