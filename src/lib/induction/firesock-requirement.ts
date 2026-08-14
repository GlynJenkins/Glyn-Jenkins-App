/** Who must upload a firesock training certificate at enrolment. */
export type FiresockRequirement = 'required' | 'optional' | 'hidden'

const REQUIRED_ROLES = new Set([
  'bricklayer',
  'labourer',
  'apprentice',
  'foreman',
  'jetwasher',
])

const OPTIONAL_ROLES = new Set([
  'contracts_manager',
  'site_supervisor',
])

export function firesockRequirement(role: string): FiresockRequirement {
  if (REQUIRED_ROLES.has(role)) return 'required'
  if (OPTIONAL_ROLES.has(role)) return 'optional'
  return 'hidden'
}

export const FIRESOCK_TRAINING_URL =
  'https://www.arcbuildingsolutions.co.uk/protect/knowledge/vle/'
