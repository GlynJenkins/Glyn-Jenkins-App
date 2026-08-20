import type { SupabaseClient } from '@supabase/supabase-js'
import { ageFromDateOfBirth, isUnder18 } from '@/lib/induction/date-of-birth'
import { WAGES_ROLE_LABELS } from '@/lib/claims/load-wages-register'

export type WorkerMatrixStatus = 'active' | 'inactive'

export type WorkerMatrixRow = {
  id: string
  firstName: string
  surname: string
  name: string
  role: string
  roleLabel: string
  phone: string
  email: string | null
  homeAddress: string | null
  dateOfBirth: string | null
  age: number | null
  under18: boolean
  createdAt: string
  status: WorkerMatrixStatus
}

export type WorkerMatrixBundle = {
  active: WorkerMatrixRow[]
  inactive: WorkerMatrixRow[]
  pendingCount: number
}

function compareSurname(a: WorkerMatrixRow, b: WorkerMatrixRow): number {
  const bySurname = a.surname.localeCompare(b.surname, 'en', { sensitivity: 'base' })
  if (bySurname !== 0) return bySurname
  return a.firstName.localeCompare(b.firstName, 'en', { sensitivity: 'base' })
}

function mapRow(raw: {
  id: string
  first_name: string
  surname: string
  role: string
  phone: string
  email: string | null
  home_address: string | null
  date_of_birth: string | null
  created_at: string
  status: string
}): WorkerMatrixRow {
  const dob = raw.date_of_birth ? raw.date_of_birth.slice(0, 10) : null
  const age = dob ? ageFromDateOfBirth(dob) : null
  return {
    id:          raw.id,
    firstName:   raw.first_name,
    surname:     raw.surname,
    name:        `${raw.first_name} ${raw.surname}`.trim(),
    role:        raw.role,
    roleLabel:   WAGES_ROLE_LABELS[raw.role] ?? raw.role,
    phone:       raw.phone,
    email:       raw.email,
    homeAddress: raw.home_address?.trim() || null,
    dateOfBirth: dob,
    age:         age != null && age >= 0 ? age : null,
    under18:     isUnder18(dob),
    createdAt:   raw.created_at,
    status:      raw.status as WorkerMatrixStatus,
  }
}

export async function loadWorkerMatrix(
  supabase: SupabaseClient,
): Promise<WorkerMatrixBundle> {
  const [{ data, error }, pendingRes] = await Promise.all([
    supabase
      .from('workers')
      .select(
        'id, first_name, surname, role, phone, email, home_address, date_of_birth, created_at, status',
      )
      .in('status', ['active', 'inactive']),
    supabase
      .from('workers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_verification'),
  ])

  if (error) {
    throw new Error(`Failed to load worker matrix: ${error.message}`)
  }

  const rows = (data ?? []).map(mapRow)
  const active = rows
    .filter((r) => r.status === 'active')
    .sort(compareSurname)
  const inactive = rows
    .filter((r) => r.status === 'inactive')
    .sort(compareSurname)

  return {
    active,
    inactive,
    pendingCount: pendingRes.count ?? 0,
  }
}

export function workerMatrixToSheetRows(rows: WorkerMatrixRow[]) {
  return rows.map((r) => ({
    Name:           r.name,
    'Job role':     r.roleLabel,
    Age:            r.age ?? '',
    'Date of birth': r.dateOfBirth
      ? new Date(
          Number(r.dateOfBirth.slice(0, 4)),
          Number(r.dateOfBirth.slice(5, 7)) - 1,
          Number(r.dateOfBirth.slice(8, 10)),
        ).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '',
    Phone:          r.phone,
    Email:          r.email ?? '',
    'Home address': r.homeAddress ?? '',
    'Start date':   new Date(r.createdAt).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    Status:         r.status === 'active' ? 'Active' : 'Inactive',
  }))
}
