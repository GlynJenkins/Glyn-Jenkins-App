import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { siteId } = await params
    const body = await request.json() as {
      document_address?:   string | null
      developer_name?:     string | null
      developer_contact?:  string | null
      surveyor_name?:      string | null
      document_reference?: string | null
    }

    const supabase = createServiceClient()
    const { error } = await supabase
      .from('sites')
      .update({
        document_address:   body.document_address?.trim() || null,
        developer_name:     body.developer_name?.trim() || null,
        developer_contact:  body.developer_contact?.trim() || null,
        surveyor_name:      body.surveyor_name?.trim() || null,
        document_reference: body.document_reference?.trim() || null,
      })
      .eq('id', siteId)

    if (error) return apiError("api/admin/sites/[siteId]/documents", error)
    return NextResponse.json({ success: true })
  } catch (err) {
    return apiError("api/admin/sites/[siteId]/documents", err)
  }
}
