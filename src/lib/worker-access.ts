export const PORTAL_LOGIN_ROLES = ['foreman', 'management', 'jetwasher'] as const
export const ADMIN_PORTAL_ROLES   = ['admin', 'management'] as const

export function needsPortalLogin(role: string): boolean {
  return role === 'foreman' || role === 'management' || role === 'jetwasher'
}

export function canAccessAdmin(role: string): boolean {
  return role === 'admin' || role === 'management'
}

export function canAccessForeman(role: string): boolean {
  return role === 'foreman'
}

export function canAccessJetwash(role: string): boolean {
  return role === 'jetwasher'
}
