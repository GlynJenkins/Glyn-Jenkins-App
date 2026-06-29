import type { QaStageKey } from './stages'

export type QaChecklistItem = {
  key:     string
  label:   string
}

export type QaChecklistValue = 'yes' | 'no' | 'na'

export type QaChecklistAnswers = Record<string, QaChecklistValue | ''>

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
  plate_roof: [
    ...([
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
    ] as QaChecklistItem[]),
    { key: 'firesock_compressed',   label: 'Firesock installed and compressed?' },
    { key: 'insulation_above_sock', label: 'Insulation installed above sock if required?' },
    { key: 'cullen_bracket',        label: 'Cullen bracket installed under wall plate at 1200mm centre (900mm DWH)?' },
    { key: 'wall_ties_spandrel',    label: 'Correct wall ties spacing of 450mm below spandrel panel?' },
  ],
}

const VALID_VALUES = new Set<QaChecklistValue>(['yes', 'no', 'na'])

export function checklistForStage(stage: QaStageKey): QaChecklistItem[] {
  return QA_STAGE_CHECKLISTS[stage] ?? []
}

export function stageHasChecklist(stage: QaStageKey): boolean {
  return checklistForStage(stage).length > 0
}

export function emptyChecklistAnswers(stage: QaStageKey): QaChecklistAnswers {
  return Object.fromEntries(checklistForStage(stage).map((item) => [item.key, '']))
}

export function isChecklistValue(val: unknown): val is QaChecklistValue {
  return typeof val === 'string' && VALID_VALUES.has(val as QaChecklistValue)
}

export function parseChecklistAnswers(raw: unknown): QaChecklistAnswers {
  if (!raw || typeof raw !== 'object') return {}
  const out: QaChecklistAnswers = {}
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (isChecklistValue(val)) {
      out[key] = val
    } else if (val === true) {
      out[key] = 'yes' // legacy boolean checklist
    } else {
      out[key] = ''
    }
  }
  return out
}

export function checklistAllAnswered(stage: QaStageKey, answers: QaChecklistAnswers): boolean {
  return checklistForStage(stage).every((item) => isChecklistValue(answers[item.key]))
}

export function checklistValidForResult(
  stage: QaStageKey,
  answers: QaChecklistAnswers,
  result: string,
): boolean {
  if (!checklistAllAnswered(stage, answers)) return false
  const passing = result === 'Pass' || result === 'Pass with notes'
  if (!passing) return true
  return checklistForStage(stage).every((item) => {
    const v = answers[item.key]
    return v === 'yes' || v === 'na'
  })
}

export function checklistAnswerLabel(value: QaChecklistValue): string {
  if (value === 'yes') return 'Yes'
  if (value === 'no') return 'No'
  return 'N/A'
}

/** @deprecated use checklistAllAnswered */
export function checklistComplete(stage: QaStageKey, answers: QaChecklistAnswers): boolean {
  return checklistAllAnswered(stage, answers)
}
