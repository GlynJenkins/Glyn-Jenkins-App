import type { QaStageKey } from './stages'

export type QaChecklistItem = {
  key:     string
  label:   string
}

export const QA_STAGE_CHECKLISTS: Partial<Record<QaStageKey, QaChecklistItem[]>> = {
  joist_lift: [
    { key: 'wall_ties_correct',   label: 'Are wall ties installed correctly?' },
    { key: 'wall_ties_spacing',   label: 'Wall ties correct spacing from window/door max 225mm?' },
    { key: 'dpc_trays',           label: 'DPC trays clean and have correct 75mm turn up?' },
    { key: 'weep_vents',          label: 'Weep vents installed at 450mm spacing?' },
    { key: 'lintels_bedded',      label: 'Lintels bedded correctly?' },
    { key: 'joist_height',        label: 'Correct joist height been achieved?' },
    { key: 'cavity_clean',        label: 'Cavity presenting well and is clean?' },
    { key: 'firesocks_installed', label: 'Firesocks installed and correct ones used?' },
    { key: 'mj_ties',             label: 'Ties to MJ within 225mm of joint and installed every 225mm?' },
    { key: 'internal_plumb',      label: 'Internal block work checked for plumb on each elevation?' },
    { key: 'external_plumb',      label: 'External elevation checked for plumb?' },
  ],
}

export function checklistForStage(stage: QaStageKey): QaChecklistItem[] {
  return QA_STAGE_CHECKLISTS[stage] ?? []
}

export function stageHasChecklist(stage: QaStageKey): boolean {
  return checklistForStage(stage).length > 0
}

export type QaChecklistAnswers = Record<string, boolean>

export function emptyChecklistAnswers(stage: QaStageKey): QaChecklistAnswers {
  return Object.fromEntries(checklistForStage(stage).map((item) => [item.key, false]))
}

export function checklistComplete(stage: QaStageKey, answers: QaChecklistAnswers): boolean {
  const items = checklistForStage(stage)
  if (!items.length) return true
  return items.every((item) => answers[item.key] === true)
}

export function parseChecklistAnswers(raw: unknown): QaChecklistAnswers {
  if (!raw || typeof raw !== 'object') return {}
  const out: QaChecklistAnswers = {}
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    out[key] = val === true
  }
  return out
}
