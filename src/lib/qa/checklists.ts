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
    { key: 'wall_ties_spacing',   label: 'Are wall ties correctly spaced from window/door openings (max 225mm)?' },
    { key: 'dpc_trays',           label: 'Are DPC trays clean with a correct 75mm turn-up?' },
    { key: 'weep_vents',          label: 'Are weep vents installed at 450mm spacing?' },
    { key: 'lintels_bedded',      label: 'Are lintels bedded correctly?' },
    { key: 'joist_height',        label: 'Has the correct joist height been achieved?' },
    { key: 'cavity_clean',        label: 'Is the cavity presenting well and clean?' },
    { key: 'firesocks_installed', label: 'Are firesocks installed and are the correct ones used?' },
    { key: 'mj_ties',             label: 'Are ties to MJ within 225mm of the joint and installed every 225mm?' },
    { key: 'internal_plumb',      label: 'Has internal blockwork been checked for plumb on each elevation?' },
    { key: 'external_plumb',      label: 'Has the external elevation been checked for plumb?' },
  ],
  plate_roof: [
    { key: 'wall_ties_correct',   label: 'Are wall ties installed correctly?' },
    { key: 'wall_ties_spacing',   label: 'Are wall ties correctly spaced from window/door openings (max 225mm)?' },
    { key: 'dpc_trays',           label: 'Are DPC trays clean with a correct 75mm turn-up?' },
    { key: 'weep_vents',          label: 'Are weep vents installed at 450mm spacing?' },
    { key: 'lintels_bedded',      label: 'Are lintels bedded correctly?' },
    { key: 'joist_height',        label: 'Has the correct joist height been achieved?' },
    { key: 'cavity_clean',        label: 'Is the cavity presenting well and clean?' },
    { key: 'firesocks_installed', label: 'Are firesocks installed and are the correct ones used?' },
    { key: 'mj_ties',             label: 'Are ties to MJ within 225mm of the joint and installed every 225mm?' },
    { key: 'internal_plumb',      label: 'Has internal blockwork been checked for plumb on each elevation?' },
    { key: 'external_plumb',      label: 'Has the external elevation been checked for plumb?' },
    { key: 'firesock_compressed',   label: 'Is the firesock installed and compressed?' },
    { key: 'insulation_above_sock', label: 'Is insulation installed above the sock if required?' },
    { key: 'cullen_bracket',        label: 'Is the Cullen bracket installed under the wall plate at 1200mm centres (900mm DWH)?' },
    { key: 'wall_ties_spandrel',    label: 'Is wall tie spacing of 450mm correct below the spandrel panel?' },
  ],
  pre_plaster: [
    { key: 'plot_clean',            label: 'Has the plot been cleaned and is it presentable?' },
    { key: 'perimeter_floorboard',  label: 'Is the perimeter floorboard clear of mortar with a 10mm gap?' },
    { key: 'blockwork_filled',      label: 'Is all blockwork fully filled with mortar?' },
    { key: 'lintel_product',        label: 'Is the product under the lintel correct?' },
    { key: 'joists_flushed',        label: 'Are all joists fully flush in between?' },
    { key: 'gable_pointing',        label: 'Has gable blockwork been checked for pointing where required?' },
    { key: 'blockwork_plumb',       label: 'Has blockwork on 4–6 elevations (downstairs and upstairs) been checked for plumb?' },
    { key: 'window_cills',          label: 'Are all window cills bricked and blocked up ready for window board?' },
    { key: 'full_snag',             label: 'Has a full snag of downstairs and upstairs been completed?' },
  ],
  cml: [
    { key: 'jetwashed_clean',       label: 'Has the plot been fully jet-washed and is it clean?' },
    { key: 'requires_reclean',      label: 'Does the plot require a re-clean?' },
    { key: 'elevations_inspected',  label: 'Has a full inspection of all elevations been carried out?' },
    { key: 'doors_windows_lintels', label: 'Have all doors and windows been checked — lintels and components installed?' },
    { key: 'external_skin',         label: 'Has material used on the external skin been built correctly?' },
    { key: 'mortar_pointed',        label: 'Is all mortar work pointed and finished correctly?' },
    { key: 'homeowner_ready',       label: 'Is the plot ready for the homeowner?' },
    { key: 'garages_snagged',       label: 'Have garages been fully snagged and cleaned?' },
    { key: 'screen_walls',          label: 'Are screen walls built correctly and clean?' },
    { key: 'cleaning_in_notes',     label: 'Are any further cleaning requirements listed in observations?' },
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

export function checklistAnswerLabel(value: QaChecklistValue): string {
  if (value === 'yes') return 'Yes'
  if (value === 'no') return 'No'
  return 'N/A'
}

/** @deprecated use checklistAllAnswered */
export function checklistComplete(stage: QaStageKey, answers: QaChecklistAnswers): boolean {
  return checklistAllAnswered(stage, answers)
}
