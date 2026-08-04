export const PORTAL_LOGIN_ROLES = [
  'foreman',
  'management',
  'jetwasher',
  'contracts_manager',
  'site_supervisor',
] as const

export const ADMIN_PORTAL_ROLES = ['admin', 'management'] as const

export const SUPERVISOR_ROLES = ['contracts_manager', 'site_supervisor'] as const

export function needsPortalLogin(role: string): boolean {
  return (
    role === 'foreman' ||
    role === 'management' ||
    role === 'jetwasher' ||
    role === 'contracts_manager' ||
    role === 'site_supervisor'
  )
}

/** Full admin area (wages, variations, sites, workers, settings). Do NOT widen this. */
export function canAccessAdmin(role: string): boolean {
  return role === 'admin' || role === 'management'
}

export function canAccessForeman(role: string): boolean {
  return role === 'foreman'
}

export function canAccessJetwash(role: string): boolean {
  return role === 'jetwasher'
}

export function isSupervisorRole(role: string): boolean {
  return role === 'contracts_manager' || role === 'site_supervisor'
}

/** Anyone allowed into the /admin shell at all (full admins OR supervisors). */
export function canAccessManagementArea(role: string): boolean {
  return canAccessAdmin(role) || isSupervisorRole(role)
}

export function canAccessQa(role: string): boolean {
  return canAccessManagementArea(role)
}

export function canAccessJetwashAdmin(role: string): boolean {
  return canAccessManagementArea(role)
}

export function canAccessFiresock(role: string): boolean {
  return canAccessManagementArea(role)
}

export function canViewHolidays(role: string): boolean {
  return canAccessManagementArea(role)
}

/** Holiday APPROVAL stays admins-only. */
export function canApproveHolidays(role: string): boolean {
  return canAccessAdmin(role)
}
