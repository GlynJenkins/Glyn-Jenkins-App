export const VARIATION_RATES: Record<string, number> = {
  bricklayer: 30,
  labourer:   15,
  apprentice: 10,
}

export const ROLE_LABELS: Record<string, string> = {
  bricklayer: 'Bricklayer',
  labourer:   'Labourer',
  apprentice: 'Apprentice',
}

export const DEVELOPER_ROLES = ['bricklayer', 'labourer', 'apprentice'] as const
export type DeveloperWorkerRole = (typeof DEVELOPER_ROLES)[number]

export const MATERIAL_UPLIFT_PERCENT = 10
