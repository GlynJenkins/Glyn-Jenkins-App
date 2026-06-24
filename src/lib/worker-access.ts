export const PORTAL_LOGIN_ROLES = ['foreman', 'management'] as const
export const ADMIN_PORTAL_ROLES   = ['admin', 'management'] as const

export function needsPortalLogin(role: string): boolean {
  return role === 'foreman' || role === 'management'
}

export function canAccessAdmin(role: string): boolean {
  return role === 'admin' || role === 'management'
}

export function canAccessForeman(role: string): boolean {
  return role === 'foreman'
}
