import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/route-error'
import { verifyAdminApiAccess } from '@/lib/auth/portal-access'
import { createServiceClient } from '@/lib/supabase/server'
import { needsPortalLogin } from '@/lib/worker-access'
import { parseDateOfBirth } from '@/lib/induction/date-of-birth'

export const dynamic = 'force-dynamic'

const ASSIGNABLE_ROLES = [
  'foreman',
  'bricklayer',
  'labourer',
  'apprentice',
  'management',
  'jetwasher',
  'contracts_manager',
  'site_supervisor',
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
      dateOfBirth?:     string
    }

    const { role, portalPassword, dateOfBirth: dateOfBirthRaw } = body
    const updatingRole = typeof role === 'string'
    const updatingDob = typeof dateOfBirthRaw === 'string'

    if (!updatingRole && !updatingDob) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
    }

    const supabase = createServiceClient()

    if (updatingDob && !updatingRole) {
      const dob = parseDateOfBirth(dateOfBirthRaw)
      if (!dob.ok) {
        return NextResponse.json({ error: dob.error }, { status: 400 })
      }

      const { data: worker, error: fetchError } = await supabase
        .from('workers')
        .select('id')
        .eq('id', workerId)
        .maybeSingle()

      if (fetchError || !worker) {
        return NextResponse.json({ error: 'Worker not found.' }, { status: 404 })
      }

      const { error: updateError } = await supabase
        .from('workers')
        .update({
          date_of_birth: dob.value,
          updated_at:    new Date().toISOString(),
        })
        .eq('id', workerId)

      if (updateError) {
        return apiError('api/admin/workers/[workerId]', updateError)
      }

      return NextResponse.json({ success: true, dateOfBirth: dob.value })
    }

    if (!role || !ASSIGNABLE_ROLES.includes(role as AssignableRole)) {
      return NextResponse.json({ error: 'Invalid job role.' }, { status: 400 })
    }

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

    const updatePayload: Record<string, unknown> = {
      role,
      auth_user_id: authUserId,
      updated_at:   new Date().toISOString(),
    }

    if (updatingDob) {
      const dob = parseDateOfBirth(dateOfBirthRaw)
      if (!dob.ok) {
        return NextResponse.json({ error: dob.error }, { status: 400 })
      }
      updatePayload.date_of_birth = dob.value
    }

    const { error: updateError } = await supabase
      .from('workers')
      .update(updatePayload)
      .eq('id', workerId)

    if (updateError) {
      if (portalLoginCreated && authUserId) {
        await supabase.auth.admin.deleteUser(authUserId)
      }
      return apiError('api/admin/workers/[workerId]', updateError)
    }

    return NextResponse.json({
      success: true,
      role,
      hasPortalLogin: needsLogin && !!authUserId,
      portalLoginCreated,
      portalLoginRevoked,
      previousRole:   worker.role,
      ...(updatingDob ? { dateOfBirth: updatePayload.date_of_birth } : {}),
    })
  } catch (err) {
    return apiError('api/admin/workers/[workerId]', err)
  }
}
