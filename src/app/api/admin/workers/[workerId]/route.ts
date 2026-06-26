import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { needsPortalLogin } from '@/lib/worker-access'

export const dynamic = 'force-dynamic'

const ASSIGNABLE_ROLES = [
  'foreman',
  'bricklayer',
  'labourer',
  'apprentice',
  'management',
  'jetwasher',
] as const

type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> }
) {
  const auth = await verifyAdminApiAccess()
  if (!auth.ok) return auth.response

  try {
    const { workerId } = await params
    const body = await request.json() as {
      role?:            string
      portalPassword?:  string
    }

    const { role, portalPassword } = body

    if (!role || !ASSIGNABLE_ROLES.includes(role as AssignableRole)) {
      return NextResponse.json({ error: 'Invalid job role.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: worker, error: fetchError } = await supabase
      .from('workers')
      .select('id, email, role, auth_user_id')
      .eq('id', workerId)
      .maybeSingle()

    if (fetchError || !worker) {
      return NextResponse.json({ error: 'Worker not found.' }, { status: 404 })
    }

    const needsLogin     = needsPortalLogin(role)
    const hadPortalRole  = needsPortalLogin(worker.role)
    const leavingPortal  = hadPortalRole && !needsLogin
    let authUserId       = worker.auth_user_id
    let portalLoginCreated = false
    let portalLoginRevoked = false

    if (needsLogin && !authUserId) {
      if (!worker.email?.trim()) {
        return NextResponse.json(
          { error: 'This worker has no email on file. Email is required to create a portal login.' },
          { status: 400 }
        )
      }
      if (!portalPassword || portalPassword.length < 8) {
        return NextResponse.json(
          { error: 'Set a portal password (at least 8 characters) when promoting to Foreman or Management.' },
          { status: 400 }
        )
      }

      const email = worker.email.trim().toLowerCase()
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: portalPassword,
        email_confirm: true,
      })

      if (authError) {
        const msg = authError.message.toLowerCase().includes('already')
          ? 'An account with this email already exists in Supabase Auth. Link it manually or use a different email.'
          : `Login creation failed: ${authError.message}`
        return NextResponse.json({ error: msg }, { status: 400 })
      }

      authUserId = authData.user.id
      portalLoginCreated = true
    }

    if (leavingPortal && authUserId) {
      await supabase.auth.admin.deleteUser(authUserId)
      authUserId = null
      portalLoginRevoked = true
    }

    if (worker.role === 'foreman' && role !== 'foreman') {
      await supabase
        .from('foreman_site_assignments')
        .delete()
        .eq('foreman_id', workerId)
    }

    const { error: updateError } = await supabase
      .from('workers')
      .update({
        role,
        auth_user_id: authUserId,
        updated_at:   new Date().toISOString(),
      })
      .eq('id', workerId)

    if (updateError) {
      if (portalLoginCreated && authUserId) {
        await supabase.auth.admin.deleteUser(authUserId)
      }
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      role,
      hasPortalLogin: needsLogin && !!authUserId,
      portalLoginCreated,
      portalLoginRevoked,
      previousRole:   worker.role,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error.' },
      { status: 500 }
    )
  }
}
