export const QA_STAGES = [
  { key: 'joist_lift',   label: 'Joist lift' },
  { key: 'plate_roof',   label: 'Plate/Roof' },
  { key: 'pre_plaster',  label: 'Pre plaster' },
  { key: 'cml',          label: 'CML' },
] as const

export type QaStageKey = (typeof QA_STAGES)[number]['key']

export const QA_STAGE_KEYS: QaStageKey[] = QA_STAGES.map((s) => s.key)

export function qaStageLabel(key: string): string {
  return QA_STAGES.find((s) => s.key === key)?.label ?? key
}

export function isQaStageKey(key: string): key is QaStageKey {
  return QA_STAGE_KEYS.includes(key as QaStageKey)
}

/** Joist lift and Plate/Roof require a firesock photo (Joist may use N/A instead). */
export function stageRequiresFiresock(stage: QaStageKey): boolean {
  return stage === 'joist_lift' || stage === 'plate_roof'
}

export function stageAllowsFiresockNa(stage: QaStageKey): boolean {
  return stage === 'joist_lift'
}

export function firesockRequirementMet(
  stage: QaStageKey,
  opts: { firesockNa: boolean; hasPhoto: boolean },
): boolean {
  if (!stageRequiresFiresock(stage)) return true
  if (stageAllowsFiresockNa(stage) && opts.firesockNa) return true
  return opts.hasPhoto
}
