// -------- DOM Refs --------

function sortElectrodeCutBatches(batches, options = {}) {
  return window.BADB_ELECTRODE_CUT_BATCH_SORT?.sortElectrodeCutBatches(batches, options) ||
    (Array.isArray(batches) ? batches : []);
}

const projectSelect = document.getElementById('battery_project_id');
const projectIdsInput = document.getElementById('battery_project_ids');
const projectFilterSelect = document.getElementById('battery_project_filter_id');
const batteryProjectMultiSelect = document.getElementById('battery-project-multiselect');
const batteryProjectMultiSelectTrigger = document.getElementById('battery-project-multiselect-trigger');
const batteryProjectMultiSelectOptions = document.getElementById('battery-project-multiselect-options');
const createdBySelect = document.getElementById('battery_created_by');
const itemCreatedAtInput = document.getElementById('battery_item_created_at');
const batteryListFilterTextInput = document.getElementById('battery-list-filter-text');
const batteryListFilterStatusSelect = document.getElementById('battery-list-filter-status');
const batteryListFilterFormFactorSelect = document.getElementById('battery-list-filter-form-factor');
const batteryListFilterSummary = document.getElementById('battery-list-filter-summary');
const clearBatteryListFiltersBtn = document.getElementById('clearBatteryListFiltersBtn');

// -------- State --------

function getDefaultMetaState() {
  return {
    project_id: null,
    project_ids: [],
    created_by: null,
    item_created_at: getTodayDateInputValue(),
    form_factor: null,
    battery_notes: null
  };
}

function getDefaultConfigState() {
  return {
    coin: {},
    pouch: {
      pouch_case_size_code: null,
      pouch_case_size_other: null,
      pouch_notes: null
    },
    cylindrical: {}
  };
}

function getDefaultElectrodeSourcesState() {
  return {
    cathode_tape_id: null,
    cathode_cut_batch_id: null,
    cathode_source_notes: null,
    anode_tape_id: null,
    anode_cut_batch_id: null,
    anode_source_notes: null,
    sources: {
      cathode: [],
      anode: []
    }
  };
}

function getElectrodeSourceFieldNames() {
  return Object.keys(getDefaultElectrodeSourcesState())
    .filter(fieldName => fieldName !== 'sources');
}

function normalizeElectrodeSourcesState(electrodeSources) {
  const nextState = getDefaultElectrodeSourcesState();

  getElectrodeSourceFieldNames().forEach((fieldName) => {
    if (Object.prototype.hasOwnProperty.call(electrodeSources || {}, fieldName)) {
      nextState[fieldName] = electrodeSources[fieldName];
    }
  });

  const sourceRows = {
    cathode: normalizeElectrodeSourceRowsForRole(electrodeSources, 'cathode'),
    anode: normalizeElectrodeSourceRowsForRole(electrodeSources, 'anode')
  };

  nextState.sources = sourceRows;
  syncPrimaryElectrodeSourceFields(nextState, 'cathode');
  syncPrimaryElectrodeSourceFields(nextState, 'anode');

  return nextState;
}

function hasElectrodeSourceRowValue(row) {
  return Boolean(
    row &&
    (
      row.is_draft ||
      row.tape_id ||
      row.cut_batch_id ||
      String(row.source_notes || '').trim()
    )
  );
}

function normalizeElectrodeSourceRow(row, role, fallbackSortOrder = 0) {
  return {
    role,
    tape_id: row?.tape_id || null,
    cut_batch_id: row?.cut_batch_id || null,
    source_notes: row?.source_notes ?? null,
    sort_order: Number.isInteger(Number(row?.sort_order))
      ? Number(row.sort_order)
      : fallbackSortOrder,
    is_primary: row?.is_primary === undefined
      ? fallbackSortOrder === 0
      : Boolean(row.is_primary),
    is_draft: Boolean(row?.is_draft)
  };
}

function normalizeElectrodeSourceRowsForRole(electrodeSources, role) {
  const explicitRows =
    electrodeSources?.sources?.[role] ||
    electrodeSources?.[role] ||
    [];
  let rows = Array.isArray(explicitRows)
    ? explicitRows
      .map((row, index) => normalizeElectrodeSourceRow(row, role, index))
      .filter(hasElectrodeSourceRowValue)
    : [];

  if (!rows.length) {
    const legacyRow = normalizeElectrodeSourceRow({
      tape_id: electrodeSources?.[`${role}_tape_id`],
      cut_batch_id: electrodeSources?.[`${role}_cut_batch_id`],
      source_notes: electrodeSources?.[`${role}_source_notes`],
      sort_order: 0,
      is_primary: true
    }, role, 0);

    if (hasElectrodeSourceRowValue(legacyRow)) {
      rows = [legacyRow];
    }
  }

  rows.sort((a, b) => {
    if (Boolean(a.is_primary) !== Boolean(b.is_primary)) {
      return a.is_primary ? -1 : 1;
    }
    return Number(a.sort_order || 0) - Number(b.sort_order || 0);
  });

  rows.forEach((row, index) => {
    row.sort_order = index;
    row.is_primary = index === 0;
  });

  return rows;
}

function getElectrodeSourceRows(role) {
  return Array.isArray(state.electrodeSources?.sources?.[role])
    ? state.electrodeSources.sources[role]
    : [];
}

function getPrimaryElectrodeSource(role) {
  return getElectrodeSourceRows(role)[0] || null;
}

function syncPrimaryElectrodeSourceFields(targetState, role) {
  const primary = Array.isArray(targetState.sources?.[role])
    ? targetState.sources[role][0]
    : null;

  targetState[`${role}_tape_id`] = primary?.tape_id || null;
  targetState[`${role}_cut_batch_id`] = primary?.cut_batch_id || null;
  targetState[`${role}_source_notes`] = primary?.source_notes ?? null;
}

function setElectrodeSourceRows(role, rows) {
  setElectrodeSourcesState({
    ...state.electrodeSources,
    sources: {
      ...(state.electrodeSources.sources || {}),
      [role]: rows
    }
  });
}

function getSelectedSourceBatchIds(role) {
  return getElectrodeSourceRows(role)
    .map(row => row.cut_batch_id)
    .filter(Boolean);
}

function getSiblingSelectedSourceBatchIds(role, row) {
  const rowSortOrder = Number(row?.sort_order ?? 0);
  const selectedBatchId = row?.cut_batch_id ? String(row.cut_batch_id) : '';

  return new Set(
    getElectrodeSourceRows(role)
      .filter(candidate => Number(candidate?.sort_order ?? 0) !== rowSortOrder)
      .map(candidate => candidate.cut_batch_id)
      .filter(Boolean)
      .map(String)
      .filter(batchId => batchId !== selectedBatchId)
  );
}

function getSelectedSourceTapeIds(role) {
  return getElectrodeSourceRows(role)
    .map(row => row.tape_id)
    .filter(Boolean);
}

function getElectrodeSourcesPayloadRows() {
  return ['cathode', 'anode'].flatMap(role =>
    getElectrodeSourceRows(role)
      .filter(row => row.tape_id || row.cut_batch_id || String(row.source_notes || '').trim())
      .map((row, index) => ({
        role,
        tape_id: row.tape_id || null,
        cut_batch_id: row.cut_batch_id || null,
        source_notes: row.source_notes || null,
        sort_order: index,
        is_primary: index === 0
      }))
  );
}

function getDefaultAssemblyState() {
  return {
    coin: {},
    pouch: {},
    cylindrical: {}
  };
}

function getDefaultQcState() {
  return {
    ocv_v: null,
    esr_mohm: null,
    qc_notes: null,
    status: null
  };
}

function getDefaultElectrochemState() {
  return {
    notes: null,
    files: null,
    savedEntries: []
  };
}

function getDefaultBatteryDeleteFlowState() {
  return {
    step: 'idle',
    check: null,
    electrodeDisposition: 'available',
    scrappedReason: '',
    confirmation: ''
  };
}

const state = {
  selection: {
    currentBatteryId: null,
    currentBattery: null,
    batteries: []
  },
  reference: {
    projects: [],
    tapes: [],
    cutBatches: [],
    cathodeBatches: [],
    anodeBatches: [],
    cathodeElectrodes: [],
    anodeElectrodes: []
  },
  stack: {
    selectedCathodes: [],
    selectedAnodes: [],
    targetCathodeCount: null,
    targetAnodeCount: null,
    targetAnodeMode: 'same',
    targetAnodeExcessPercent: null,
    readOnly: false,
    hideSelectionBlocks: false,
    loadedAssemblyComplete: false
  },
  meta: getDefaultMetaState(),
  config: getDefaultConfigState(),
  electrodeSources: getDefaultElectrodeSourcesState(),
  assembly: getDefaultAssemblyState(),
  qc: getDefaultQcState(),
  ui: {
    isRestoringBattery: false,
    isFormOpen: false,
    createButtonMode: 'create',
    isDuplicateDraft: false,
    duplicateSourceBatteryId: null,
    duplicateCopiedAssembly: false,
    sectionState: {},
    deleteFlow: getDefaultBatteryDeleteFlowState()
  },
  snapshots: {
    savedSectionStates: {}
  },
  electrochem: getDefaultElectrochemState()
};

function cloneBatteryDebugValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeProjectIds(values) {
  const source = Array.isArray(values) ? values : [values];
  const ids = [];

  source.forEach((value) => {
    if (value === null || value === undefined || value === '') return;
    const normalized = String(value);
    if (!ids.includes(normalized)) ids.push(normalized);
  });

  return ids;
}

function normalizeNumberId(value) {
  const id = Number(value);
  return Number.isInteger(id) ? id : null;
}

function idsMatch(left, right) {
  const leftId = normalizeNumberId(left);
  const rightId = normalizeNumberId(right);
  return leftId !== null && rightId !== null && leftId === rightId;
}

function idListIncludes(ids, value) {
  return ids.some((id) => idsMatch(id, value));
}

function normalizeElectrodeRecord(electrode) {
  if (!electrode) return null;

  const electrodeId = normalizeNumberId(electrode.electrode_id);
  if (electrodeId === null) return null;

  return {
    ...electrode,
    electrode_id: electrodeId
  };
}

function normalizeElectrodeRecords(electrodes) {
  return (Array.isArray(electrodes) ? electrodes : [])
    .map(normalizeElectrodeRecord)
    .filter(Boolean);
}

function getBatteryDebugSnapshot() {
  return {
    selection: cloneBatteryDebugValue(state.selection),
    reference: cloneBatteryDebugValue(state.reference),
    stack: cloneBatteryDebugValue(state.stack),
    meta: cloneBatteryDebugValue(state.meta),
    config: cloneBatteryDebugValue(state.config),
    electrodeSources: cloneBatteryDebugValue(state.electrodeSources),
    assembly: cloneBatteryDebugValue(state.assembly),
    qc: cloneBatteryDebugValue(state.qc),
    electrochem: cloneBatteryDebugValue(state.electrochem),
    ui: cloneBatteryDebugValue(state.ui),
    snapshots: cloneBatteryDebugValue(state.snapshots)
  };
}

// -------- State Snapshots / Dirty State --------

function serializeFieldset(fieldset) {
  
  const data = {};
  const elements = fieldset.querySelectorAll('input, select, textarea');
  
  elements.forEach(el => {
    
    if (!el.name) return;
    
    if (el.type === 'checkbox') {
      data[el.name] = el.checked;
    } else if (el.type === 'radio') {
      
      if (el.checked) {
        data[el.name] = el.value;
      }
      
    } else {
      
      data[el.name] = el.value || null;
      
    }
    
  });
  
  return data;
  
}

function populateFieldset(fieldset, data) {
  
  if (!fieldset || !data) return;
  
  fieldset.querySelectorAll('[name]').forEach(el => {
    
    const key = el.name;
    
    if (!(key in data)) return;
    
    if (el.type === 'checkbox') {
      el.checked = Boolean(data[key]);
    } else if (el.type === 'radio') {
      el.checked = String(el.value) === String(data[key]);
    } else {
      el.value = data[key] ?? '';
    }
    
  });
  
}

function clearFieldset(fieldset) {
  
  if (!fieldset) return;
  
  fieldset.querySelectorAll('[name]').forEach(el => {
    
    if (el.type === 'checkbox' || el.type === 'radio') {
      el.checked = false;
    } else {
      el.value = '';
    }
    
  });
  
}

const BATTERY_SECTION_KEYS = [
  'battery_meta',
  'battery_config',
  'electrode_sources',
  'battery_stack',
  'battery_assembly',
  'battery_qc',
  'battery_electrochem'
];

const BATTERY_DIRTY_MARKER_IDS = {
  battery_meta: 'dirty-battery-meta',
  battery_config: 'dirty-battery-config',
  electrode_sources: 'dirty-electrode-sources',
  battery_stack: 'dirty-battery-stack',
  battery_assembly: 'dirty-battery-assembly',
  battery_qc: 'dirty-battery-qc',
  battery_electrochem: 'dirty-battery-electrochem'
};

const BATTERY_SECTION_UNLOCK_RULES = {
  battery_meta: null,
  battery_config: 'battery_meta',
  electrode_sources: 'battery_config',
  battery_stack: 'electrode_sources',
  battery_assembly: 'battery_stack',
  battery_qc: 'battery_assembly',
  battery_electrochem: 'battery_qc'
};

const BATTERY_SECTION_UNLOCK_MESSAGES = {
  battery_config: 'Сначала сохраните общую информацию об аккумуляторе.',
  electrode_sources: 'Сначала сохраните конфигурацию элемента.',
  battery_stack: 'Сначала сохраните источники электродов.',
  battery_assembly: 'Сначала сохраните стек электродов.',
  battery_qc: 'Сначала сохраните параметры сборки.',
  battery_electrochem: 'Сначала сохраните результаты выходного контроля.'
};

const BATTERY_PHASE_TWO_SECTIONS = new Set([
  'battery_stack',
  'battery_assembly',
  'battery_qc',
  'battery_electrochem'
]);

const BATTERY_OPEN_STATUS_LABEL = 'Открыт';

const BATTERY_SELECTABLE_STATUS_OPTIONS = [
  { value: 'assembled', label: 'Собран' },
  { value: 'testing', label: 'На тестировании' },
  { value: 'completed', label: 'Завершён' },
  { value: 'failed', label: 'Брак' }
];

const BATTERY_STATUS_LABELS = BATTERY_SELECTABLE_STATUS_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {
  '': BATTERY_OPEN_STATUS_LABEL,
  disassembled: BATTERY_OPEN_STATUS_LABEL
});

function getDefaultBatterySectionLifecycleState() {
  return BATTERY_SECTION_KEYS.reduce((acc, sectionKey) => {
    acc[sectionKey] = {
      isSaved: false,
      isComplete: false,
      isDirty: false,
      isUnlocked: sectionKey === 'battery_meta',
      isLocked: false
    };
    return acc;
  }, {});
}

state.ui.sectionState = getDefaultBatterySectionLifecycleState();

function getCurrentBatteryStackSnapshot() {
  return JSON.stringify({
    targetCathodeCount: state.stack.targetCathodeCount,
    targetAnodeCount: state.stack.targetAnodeCount,
    targetAnodeMode: state.stack.targetAnodeMode,
    selectedCathodes: state.stack.selectedCathodes.map(e => ({
      electrode_id: e.electrode_id,
      electrode_mass_g: e.electrode_mass_g ?? null
    })),
    selectedAnodes: state.stack.selectedAnodes.map(e => ({
      electrode_id: e.electrode_id,
      electrode_mass_g: e.electrode_mass_g ?? null
    }))
  });
}

function getCurrentBatteryElectrochemSnapshot() {
  return JSON.stringify({
    electrochem_notes: state.electrochem.notes ?? '',
    electrochem_files: state.electrochem.files ?? '',
    saved_entries: state.electrochem.savedEntries
  });
}

function getCurrentBatterySectionSnapshot(sectionKey) {
  if (sectionKey === 'battery_stack') {
    return getCurrentBatteryStackSnapshot();
  }

  if (sectionKey === 'battery_electrochem') {
    return getCurrentBatteryElectrochemSnapshot();
  }

  return captureSectionState(sectionKey);
}

function getAllCurrentBatterySectionSnapshots() {
  return BATTERY_SECTION_KEYS.reduce((acc, sectionKey) => {
    acc[sectionKey] = getCurrentBatterySectionSnapshot(sectionKey);
    return acc;
  }, {});
}

function isBatterySectionDirty(sectionKey) {
  return (
    getCurrentBatterySectionSnapshot(sectionKey) !==
    state.snapshots.savedSectionStates[sectionKey]
  );
}

function setBatterySectionLifecycleState(sectionState) {
  state.ui.sectionState = BATTERY_SECTION_KEYS.reduce((acc, sectionKey) => {
    const nextState = sectionState?.[sectionKey] || {};
    acc[sectionKey] = {
      isSaved: Boolean(nextState.isSaved),
      isComplete: Boolean(nextState.isComplete),
      isDirty: Boolean(nextState.isDirty),
      isUnlocked: Boolean(nextState.isUnlocked),
      isLocked: Boolean(nextState.isLocked)
    };
    return acc;
  }, getDefaultBatterySectionLifecycleState());
}

function hasStartedBatterySection(sectionKey) {
  if (sectionKey === 'battery_meta') {
    return hasMeaningfulObjectValue({
      created_by: state.meta.created_by,
      form_factor: state.meta.form_factor,
      battery_notes: state.meta.battery_notes
    });
  }

  if (sectionKey === 'battery_config') {
    const formFactor = state.meta.form_factor;
    const configState =
      formFactor === 'coin' ? state.config.coin
      : isPouchLikeFormFactor(formFactor) ? state.config.pouch
      : formFactor === 'cylindrical' ? state.config.cylindrical
      : null;

    return hasMeaningfulObjectValue(configState);
  }

  if (sectionKey === 'electrode_sources') {
    return getElectrodeSourcesPayloadRows().length > 0;
  }

  if (sectionKey === 'battery_stack') {
    return state.stack.selectedCathodes.length > 0 || state.stack.selectedAnodes.length > 0;
  }

  if (sectionKey === 'battery_assembly') {
    return hasStartedBatteryAssemblySection();
  }

  if (sectionKey === 'battery_qc') {
    return hasMeaningfulObjectValue({
      ocv_v: state.qc.ocv_v,
      esr_mohm: state.qc.esr_mohm,
      qc_notes: state.qc.qc_notes
    });
  }

  if (sectionKey === 'battery_electrochem') {
    return hasMeaningfulObjectValue({
      notes: state.electrochem.notes,
      files: state.electrochem.files
    }) || (Array.isArray(state.electrochem.savedEntries) && state.electrochem.savedEntries.length > 0);
  }

  return false;
}

function isDefaultCoinAssemblyFieldValue(fieldName, value) {
  if (fieldName === 'spacer_thickness_mm') {
    return toFiniteBatteryNumber(value) === 0.5;
  }

  if (fieldName === 'spacer_count') {
    return toFiniteBatteryNumber(value) === 2;
  }

  return false;
}

function hasStartedCoinAssemblySection(assembly) {
  return Object.entries(assembly || {}).some(([fieldName, value]) => (
    hasMeaningfulValue(value) &&
    !isDefaultCoinAssemblyFieldValue(fieldName, value)
  ));
}

function hasStartedBatteryAssemblySection() {
  const formFactor = state.meta.form_factor;

  if (formFactor === 'coin') {
    return hasStartedCoinAssemblySection(state.assembly.coin);
  }

  if (isPouchLikeFormFactor(formFactor)) {
    return hasMeaningfulObjectValue(state.assembly.pouch);
  }

  if (formFactor === 'cylindrical') {
    return hasMeaningfulObjectValue(state.assembly.cylindrical);
  }

  return false;
}

function isBatteryMetaSectionComplete() {
  return Boolean(state.meta.form_factor);
}

function isBatteryConfigSectionComplete() {
  const formFactor = state.meta.form_factor;

  if (formFactor === 'coin') {
    const coin = state.config.coin || {};

    if (!coin.coin_cell_mode || !coin.coin_size_code) {
      return false;
    }

    if (coin.coin_cell_mode === 'half_cell' && !coin.half_cell_type) {
      return false;
    }

    return true;
  }

  if (isPouchLikeFormFactor(formFactor)) {
    const pouch = state.config.pouch || {};

    if (!pouch.pouch_case_size_code) {
      return false;
    }

    if (
      pouch.pouch_case_size_code === 'other' &&
      !String(pouch.pouch_case_size_other || '').trim()
    ) {
      return false;
    }

    return true;
  }

  if (formFactor === 'cylindrical') {
    return Boolean(state.config.cylindrical?.cyl_size_code);
  }

  return false;
}

function isBatterySourcesSectionComplete() {
  const requiredRoles = getRequiredBatterySourceRolesForContext();
  const hasBatteryProject = normalizeProjectIds(state.meta.project_ids).length > 0;
  const roleComplete = {
    cathode: getElectrodeSourceRows('cathode').some(row => row.cut_batch_id),
    anode: getElectrodeSourceRows('anode').some(row => row.cut_batch_id)
  };

  if (requiredRoles.length === 0) return false;

  return hasBatteryProject &&
    requiredRoles.every(role => roleComplete[role]) &&
    Object.keys(roleComplete)
      .filter(role => !requiredRoles.includes(role))
      .every(role => !roleComplete[role]);
}

function isBatteryStackSectionComplete() {
  const formFactor = state.meta.form_factor;
  const coinMode = state.config.coin?.coin_cell_mode || null;
  const halfCellType = state.config.coin?.half_cell_type || null;
  const cathodes = state.stack.selectedCathodes.length;
  const anodes = state.stack.selectedAnodes.length;

  if (formFactor === 'coin' && coinMode === 'half_cell') {
    if (halfCellType === 'cathode_vs_li') {
      return cathodes === 1 && anodes === 0;
    }

    if (halfCellType === 'anode_vs_li') {
      return anodes === 1 && cathodes === 0;
    }

    return false;
  }

  if (formFactor === 'coin') {
    return cathodes === 1 && anodes === 1;
  }

  return cathodes >= 1 &&
    anodes >= 1 &&
    (anodes === cathodes || anodes === cathodes + 1);
}

function isBatteryAssemblySectionComplete() {
  const formFactor = state.meta.form_factor;
  const activeAssembly =
    formFactor === 'coin' ? state.assembly.coin
    : isPouchLikeFormFactor(formFactor) ? state.assembly.pouch
    : formFactor === 'cylindrical' ? state.assembly.cylindrical
    : null;

  if (!activeAssembly) {
    return false;
  }

  if (formFactor === 'coin') {
    return Boolean(
      activeAssembly.separator_id &&
      activeAssembly.electrolyte_id &&
      hasMeaningfulValue(activeAssembly.electrolyte_total_ul) &&
      hasMeaningfulValue(activeAssembly.spacer_thickness_mm) &&
      hasMeaningfulValue(activeAssembly.spacer_count)
    );
  }

  return Boolean(
    activeAssembly.separator_id &&
    activeAssembly.electrolyte_id &&
    hasMeaningfulValue(activeAssembly.electrolyte_total_ul)
  );
}

function isBatteryQcSectionComplete() {
  return hasMeaningfulValue(state.qc.ocv_v) && hasMeaningfulValue(state.qc.esr_mohm);
}

function isBatteryElectrochemSectionComplete() {
  return Array.isArray(state.electrochem.savedEntries) && state.electrochem.savedEntries.length > 0;
}

function isBatterySectionComplete(sectionKey) {
  if (sectionKey === 'battery_meta') return isBatteryMetaSectionComplete();
  if (sectionKey === 'battery_config') return isBatteryConfigSectionComplete();
  if (sectionKey === 'electrode_sources') return isBatterySourcesSectionComplete();
  if (sectionKey === 'battery_stack') return isBatteryStackSectionComplete();
  if (sectionKey === 'battery_assembly') return isBatteryAssemblySectionComplete();
  if (sectionKey === 'battery_qc') return isBatteryQcSectionComplete();
  if (sectionKey === 'battery_electrochem') return isBatteryElectrochemSectionComplete();
  return false;
}

function isBatterySourceSelectionCompleteForStack() {
  const formFactor = state.meta.form_factor;
  const coinMode = state.config.coin?.coin_cell_mode || null;
  const halfCellType = state.config.coin?.half_cell_type || null;

  const hasCathodeSource = getElectrodeSourceRows('cathode')
    .some(row => row.cut_batch_id);
  const hasAnodeSource = getElectrodeSourceRows('anode')
    .some(row => row.cut_batch_id);

  if (formFactor === 'coin' && coinMode === 'half_cell') {
    if (halfCellType === 'cathode_vs_li') return hasCathodeSource && !hasAnodeSource;
    if (halfCellType === 'anode_vs_li') return hasAnodeSource && !hasCathodeSource;
    return false;
  }

  return hasCathodeSource && hasAnodeSource;
}

function getBatterySourceRoleContext() {
  return {
    formFactor: document.getElementById('battery_form_factor')?.value || state.meta.form_factor || null,
    coinMode: document.getElementById('coin_cell_mode')?.value || state.config.coin?.coin_cell_mode || null,
    halfCellType: document.getElementById('coin_half_cell_type')?.value || state.config.coin?.half_cell_type || null
  };
}

function getRequiredBatterySourceRolesForContext(context = getBatterySourceRoleContext()) {
  if (context.formFactor === 'coin' && context.coinMode === 'half_cell') {
    if (context.halfCellType === 'cathode_vs_li') return ['cathode'];
    if (context.halfCellType === 'anode_vs_li') return ['anode'];
    return [];
  }

  if (context.formFactor === 'coin' && context.coinMode === 'full_cell') {
    return ['cathode', 'anode'];
  }

  if (isPouchLikeFormFactor(context.formFactor) || context.formFactor === 'cylindrical') {
    return ['cathode', 'anode'];
  }

  return [];
}

function deriveBatterySectionLifecycleState() {
  return BATTERY_SECTION_KEYS.reduce((acc, sectionKey) => {
    const previousSectionKey = BATTERY_SECTION_UNLOCK_RULES[sectionKey];
    const savedSnapshot = state.snapshots.savedSectionStates[sectionKey] ?? null;
    const isSaved = sectionKey === 'battery_stack'
      ? hasBatteryStackLinksInSnapshot(savedSnapshot)
      : savedSnapshot !== null;
    const isComplete = isSaved && isBatterySectionComplete(sectionKey);
    const isDirty = isSaved
      ? getCurrentBatterySectionSnapshot(sectionKey) !== savedSnapshot
      : hasStartedBatterySection(sectionKey);
    const isPhaseOneSection =
      sectionKey === 'battery_meta' ||
      sectionKey === 'battery_config' ||
      sectionKey === 'electrode_sources';
    const isUnlocked = isPhaseOneSection
      ? true
      : Boolean(state.selection.currentBatteryId) &&
        (
          previousSectionKey === null ||
          Boolean(acc[previousSectionKey]?.isComplete) ||
          isSaved
        );

    acc[sectionKey] = {
      isSaved,
      isComplete,
      isDirty,
      isUnlocked,
      isLocked: false
    };

    return acc;
  }, {});
}

function refreshBatterySectionLifecycleState() {
  setBatterySectionLifecycleState(deriveBatterySectionLifecycleState());
}

function renderBatteryDirtyMarkers() {
  BATTERY_SECTION_KEYS.forEach(sectionKey => {
    const markerId = BATTERY_DIRTY_MARKER_IDS[sectionKey];
    const el = markerId ? document.getElementById(markerId) : null;

    if (el) {
      el.classList.toggle(
        'visible',
        !state.ui.isRestoringBattery && Boolean(state.ui.sectionState?.[sectionKey]?.isDirty)
      );
    }
  });

  renderBatteryStickyHeader();
}

function markSectionSaved(sectionKey) {
  state.snapshots.savedSectionStates[sectionKey] = getCurrentBatterySectionSnapshot(sectionKey);
}

function refreshDirtyState() {
  refreshBatterySectionLifecycleState();
  renderBatteryDirtyMarkers();
}

function markSectionsSaved(sectionKeys) {
  sectionKeys.forEach(sectionKey => {
    markSectionSaved(sectionKey);
  });
  refreshDirtyState();
}

function hasMeaningfulObjectValue(obj) {
  return Boolean(obj) && Object.values(obj).some(value => {
    if (Array.isArray(value)) return value.length > 0;
    return hasMeaningfulValue(value);
  });
}

function markBatterySectionsSaved(sectionKeys) {
  state.snapshots.savedSectionStates = {};
  sectionKeys.forEach(sectionKey => {
    state.snapshots.savedSectionStates[sectionKey] = getCurrentBatterySectionSnapshot(sectionKey);
  });
  refreshDirtyState();
}

function markCurrentBatteryPageClean() {
  state.snapshots.savedSectionStates = getAllCurrentBatterySectionSnapshots();
  refreshDirtyState();
}

function markRestoredBatterySectionsSaved(data) {
  if (!data?.battery?.battery_id) return;
  markCurrentBatteryPageClean();
}

function hasUnsavedBatteryChanges() {
  if (state.ui.isRestoringBattery) return false;
  syncAllSectionStateFromDom();
  refreshDirtyState();
  return BATTERY_SECTION_KEYS.some(sectionKey => Boolean(state.ui.sectionState?.[sectionKey]?.isDirty));
}

const batteryLogoutGuard = {
  hasUnsavedChanges: hasUnsavedBatteryChanges,
  discardUnsavedChanges: clearDirtyFlags
};

window.BADB_PAGE_LOGOUT_GUARD = batteryLogoutGuard;
window.BADB_AUTH?.registerLogoutGuard?.(batteryLogoutGuard);

function getBatteryDirtySnapshot() {
  const currentSnapshots = getAllCurrentBatterySectionSnapshots();
  const savedSnapshots = state.snapshots.savedSectionStates;

  return Object.keys(currentSnapshots).reduce((acc, sectionKey) => {
    acc[sectionKey] = {
      isDirty: Boolean(state.ui.sectionState?.[sectionKey]?.isDirty),
      current: currentSnapshots[sectionKey],
      saved: savedSnapshots[sectionKey] ?? null
    };
    return acc;
  }, {});
}

function installBatteryDebugInspector() {
  window.__batteryDebug = {
    getState: getBatteryDebugSnapshot,
    getDirtyState: getBatteryDirtySnapshot,
    logState() {
      console.log('batteryState', getBatteryDebugSnapshot());
    },
    logDirtyState() {
      console.log('batteryDirtyState', getBatteryDirtySnapshot());
    }
  };
}

function isPouchLikeFormFactor(formFactor) {
  return formFactor === 'pouch' || formFactor === 'prism';
}

function formatBatteryFormFactorLabel(value) {
  const labels = {
    coin: 'Монеточный',
    pouch: 'Пакетный',
    prism: 'Призматическая',
    cylindrical: 'Цилиндрический'
  };

  return labels[value] || value || '—';
}

async function refreshBatteryReferenceData() {
  await Promise.all([
    loadUsers(),
    loadProjects(),
    loadCutBatches(),
    loadSeparators(),
    loadElectrolytes()
  ]);
}

async function refreshBatteryLinkedReferenceData() {
  await Promise.all([
    loadSeparators(),
    loadElectrolytes()
  ]);
}

// -------- State Actions --------

function setBatteries(batteries) {
  state.selection.batteries = batteries;
  renderBatteriesList();
}

function setProjects(projects) {
  state.reference.projects = Array.isArray(projects) ? projects : [];
}

function setCurrentBattery(battery) {
  state.selection.currentBattery = battery || null;
  state.selection.currentBatteryId = battery?.battery_id ?? null;
}

function setMetaState(meta) {
  state.meta = {
    ...getDefaultMetaState(),
    ...(meta || {})
  };
}

function setConfigState(config) {
  state.config = {
    ...getDefaultConfigState(),
    ...(config || {})
  };
}

function setElectrodeSourcesState(electrodeSources) {
  state.electrodeSources = normalizeElectrodeSourcesState(electrodeSources);
}

function setAssemblyState(assembly) {
  state.assembly = {
    ...getDefaultAssemblyState(),
    ...(assembly || {})
  };
}

function setQcState(qc) {
  state.qc = {
    ...getDefaultQcState(),
    ...(qc || {})
  };
}

function setElectrochemState(electrochem) {
  state.electrochem = {
    ...getDefaultElectrochemState(),
    ...(electrochem || {}),
    savedEntries: Array.isArray(electrochem?.savedEntries)
      ? electrochem.savedEntries
      : Array.isArray(state.electrochem?.savedEntries)
        ? state.electrochem.savedEntries
        : []
  };
}

function setSelectedCathodes(cathodes) {
  state.stack.selectedCathodes = normalizeElectrodeRecords(cathodes);
}

function setSelectedAnodes(anodes) {
  state.stack.selectedAnodes = normalizeElectrodeRecords(anodes);
}

function isMultiElectrodeFormFactor(formFactor) {
  return isPouchLikeFormFactor(formFactor) || formFactor === 'cylindrical';
}

function normalizeStackAnodeMode(mode) {
  return mode === 'plus_one' ? 'plus_one' : 'same';
}

function getDefaultStackAnodeMode() {
  const { formFactor } = getStackSelectionContext();
  return isMultiElectrodeFormFactor(formFactor) ? 'plus_one' : 'same';
}

function deriveStackAnodeMode(cathodes, anodes) {
  return Number.isInteger(cathodes) && Number.isInteger(anodes) && anodes === cathodes + 1
    ? 'plus_one'
    : 'same';
}

function computeStackAnodeCount(cathodes, mode) {
  if (!Number.isInteger(cathodes) || cathodes <= 0) return null;
  return cathodes + (normalizeStackAnodeMode(mode) === 'plus_one' ? 1 : 0);
}

function setStackTargetCounts({ cathodes = null, anodes = null, anodeMode = null } = {}) {
  state.stack.targetCathodeCount = cathodes;
  state.stack.targetAnodeCount = anodes;
  state.stack.targetAnodeMode = anodeMode
    ? normalizeStackAnodeMode(anodeMode)
    : Number.isInteger(cathodes) && Number.isInteger(anodes)
      ? deriveStackAnodeMode(cathodes, anodes)
      : getDefaultStackAnodeMode();
}

function setStackTargetCountsFromCurrentStack() {
  setStackTargetCounts({
    cathodes: state.stack.selectedCathodes.length,
    anodes: state.stack.selectedAnodes.length
  });
}

function resetSelectedElectrodes() {
  setSelectedCathodes([]);
  setSelectedAnodes([]);
  setStackTargetCounts();
}

function setTapes(tapes) {
  state.reference.tapes = Array.isArray(tapes) ? tapes : [];
  renderTapeOptions();
}

function setCutBatches(cutBatches) {
  state.reference.cutBatches = sortElectrodeCutBatches(cutBatches);
}

function setCathodeBatches(batches) {
  const primary = getPrimaryElectrodeSource('cathode');
  state.reference.cathodeBatches = sortElectrodeCutBatches(batches, {
    selectedBatchId: primary?.cut_batch_id
  });
  renderCathodeBatchOptions();
}

function setAnodeBatches(batches) {
  const primary = getPrimaryElectrodeSource('anode');
  state.reference.anodeBatches = sortElectrodeCutBatches(batches, {
    selectedBatchId: primary?.cut_batch_id
  });
  renderAnodeBatchOptions();
}

function setCathodeElectrodes(electrodes) {
  state.reference.cathodeElectrodes = normalizeElectrodeRecords(electrodes);
  renderCathodeElectrodeTable();
}

function setAnodeElectrodes(electrodes) {
  state.reference.anodeElectrodes = normalizeElectrodeRecords(electrodes);
  renderAnodeElectrodeTable();
}

function setHideStackSelectionBlocks(shouldHide) {
  state.stack.hideSelectionBlocks = Boolean(shouldHide);
}

function setIsRestoringBattery(isRestoring) {
  state.ui.isRestoringBattery = Boolean(isRestoring);
}

function setBatteryFormOpen(isOpen) {
  state.ui.isFormOpen = Boolean(isOpen);
}

function setLoadedAssemblyComplete(isComplete) {
  state.stack.loadedAssemblyComplete = Boolean(isComplete);
}

function setStackReadOnly(isReadOnly) {
  state.stack.readOnly = Boolean(isReadOnly);
}

function setBatteryCreateButtonMode(mode) {
  state.ui.createButtonMode = mode || 'create';
}

// -------- Sync Helpers --------

function syncMetaStateFromDom() {
  setMetaState({
    project_id: document.getElementById('battery_project_id')?.value || null,
    project_ids: normalizeProjectIds(
      (document.getElementById('battery_project_ids')?.value || '').split(',')
    ),
    created_by: document.getElementById('battery_created_by')?.value || null,
    item_created_at: itemCreatedAtInput?.value || null,
    form_factor: document.getElementById('battery_form_factor')?.value || null,
    battery_notes: document.getElementById('battery_notes')?.value || null
  });
}

function formatDateInputValue(value) {
  if (!value) return '';

  // Date-only fields must stay date-only. Never round-trip a YYYY-MM-DD value
  // through `new Date()` + local getters: a date-only string parses as UTC
  // midnight, and the local getters can shift it across a day boundary on some
  // devices/timezones (the Windows-vs-Mac "future date" bug). Take the leading
  // YYYY-MM-DD date portion verbatim when present (covers both plain dates and
  // ISO timestamps from the API).
  const text = String(value).trim();
  const isoDateMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDateMatch) {
    return isoDateMatch[1];
  }

  // Fallback only for non-ISO inputs (e.g. a Date object passed in): derive the
  // calendar date from local components.
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayDateInputValue() {
  // Build today's date from local calendar components directly (mirrors the
  // backend's getTodayDateString). Do not parse/convert through UTC.
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function syncConfigStateFromDom() {
  setConfigState({
    coin: serializeFieldset(document.getElementById('coin_config')),
    pouch: serializeFieldset(document.getElementById('pouch_config')),
    cylindrical: serializeFieldset(document.getElementById('cyl_config'))
  });
}

function collectElectrodeSourceRowsFromDom(role) {
  const rows = [];
  const primaryRow = normalizeElectrodeSourceRow({
    tape_id: document.getElementById(`${role}_tape_id`)?.value || null,
    cut_batch_id: document.getElementById(`${role}_cut_batch_id`)?.value || null,
    source_notes: document.getElementById(`${role}_source_notes`)?.value || null,
    sort_order: 0,
    is_primary: true
  }, role, 0);

  if (hasElectrodeSourceRowValue(primaryRow)) {
    rows.push(primaryRow);
  }

  document
    .querySelectorAll(`[data-source-row-role="${role}"]`)
    .forEach((rowEl, index) => {
      const row = normalizeElectrodeSourceRow({
        tape_id: rowEl.querySelector('[data-source-field="tape_id"]')?.value || null,
        cut_batch_id: rowEl.querySelector('[data-source-field="cut_batch_id"]')?.value || null,
        source_notes: rowEl.querySelector('[data-source-field="source_notes"]')?.value || null,
        sort_order: index + 1,
        is_primary: false
      }, role, index + 1);

      if (hasElectrodeSourceRowValue(row)) {
        rows.push(row);
      }
    });

  return rows;
}

function syncElectrodeSourcesStateFromDom() {
  setElectrodeSourcesState({
    sources: {
      cathode: collectElectrodeSourceRowsFromDom('cathode'),
      anode: collectElectrodeSourceRowsFromDom('anode')
    }
  });
}

function syncAssemblyStateFromDom() {
  setAssemblyState({
    coin: serializeFieldset(document.getElementById('coin_assembly')),
    pouch: serializeFieldset(document.getElementById('pouch_assembly')),
    cylindrical: serializeFieldset(document.getElementById('cyl_assembly'))
  });
}

function syncQcStateFromDom() {
  setQcState({
    ...serializeFieldset(document.getElementById('battery_qc')),
    status: document.getElementById('battery_status')?.value || null
  });
}

function syncElectrochemStateFromDom() {
  setElectrochemState({
    notes: document.getElementById('electrochem_notes')?.value || null,
    files: document.getElementById('electrochem_files')?.value || null,
    savedEntries: state.electrochem.savedEntries
  });
}

function parsePositiveIntegerInput(inputId) {
  const rawValue = document.getElementById(inputId)?.value || '';
  const value = Number(rawValue);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function parseNonNegativeNumberInput(inputId) {
  const rawValue = document.getElementById(inputId)?.value || '';
  const value = Number(rawValue);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function syncStackTargetCountStateFromDom() {
  const { formFactor } = getStackSelectionContext();

  if (!isMultiElectrodeFormFactor(formFactor)) {
    syncFixedStackTargetCountsFromConfig();
    return;
  }

  const cathodes = parsePositiveIntegerInput('stack_target_cathodes');
  const anodeMode = normalizeStackAnodeMode(state.stack.targetAnodeMode);

  setStackTargetCounts({
    cathodes,
    anodes: computeStackAnodeCount(cathodes, anodeMode),
    anodeMode
  });
}

function setStackAnodeModeFromUi(mode) {
  const anodeMode = normalizeStackAnodeMode(mode);
  const cathodes = state.stack.targetCathodeCount;

  setStackTargetCounts({
    cathodes,
    anodes: computeStackAnodeCount(cathodes, anodeMode),
    anodeMode
  });
}

function syncAllSectionStateFromDom() {
  syncMetaStateFromDom();
  syncConfigStateFromDom();
  syncElectrodeSourcesStateFromDom();
  syncAssemblyStateFromDom();
  syncQcStateFromDom();
  syncElectrochemStateFromDom();
  syncStackTargetCountStateFromDom();
}

function shouldIncludeDirtySnapshotField(el) {
  // System-managed fields can still sync/save normally without making their parent section dirty.
  return Boolean(
    el?.name &&
    !el.closest('[data-dirty-ignore]')
  );
}

function captureNamedState(root) {
  
  if (!root) return 'null';
  
  const fields = Array.from(root.querySelectorAll('[name]'))
    .filter(shouldIncludeDirtySnapshotField)
    .map(el => {
      if (el.type === 'checkbox' || el.type === 'radio') {
        return {
          name: el.name,
          type: el.type,
          value: el.value,
          checked: el.checked
        };
      }

      return {
        name: el.name,
        type: el.type,
        value: el.value ?? ''
      };
    });

  return JSON.stringify(fields);
}

function getActiveConfigFieldset() {
  const formFactor = state.meta.form_factor || document.getElementById('battery_form_factor').value;
  
  if (formFactor === 'coin') return document.getElementById('coin_config');
  if (isPouchLikeFormFactor(formFactor)) return document.getElementById('pouch_config');
  if (formFactor === 'cylindrical') return document.getElementById('cyl_config');
  
  return null;
}

function getActiveAssemblyFieldset() {
  const formFactor = state.meta.form_factor || document.getElementById('battery_form_factor').value;
  
  if (formFactor === 'coin') return document.getElementById('coin_assembly');
  if (isPouchLikeFormFactor(formFactor)) return document.getElementById('pouch_assembly');
  if (formFactor === 'cylindrical') return document.getElementById('cyl_assembly');
  
  return null;
}

function captureSectionState(sectionKey) {
  if (sectionKey === 'battery_meta') {
    return captureNamedState(document.getElementById('battery_meta'));
  }

  if (sectionKey === 'battery_config') {
    return captureNamedState(getActiveConfigFieldset());
  }

  if (sectionKey === 'electrode_sources') {
    return JSON.stringify(getElectrodeSourcesPayloadRows());
  }

  if (sectionKey === 'battery_stack') {
    return JSON.stringify({
      targetCathodeCount: state.stack.targetCathodeCount,
      targetAnodeCount: state.stack.targetAnodeCount,
      targetAnodeMode: state.stack.targetAnodeMode,
      selectedCathodes: state.stack.selectedCathodes.map(e => ({
        electrode_id: e.electrode_id,
        electrode_mass_g: e.electrode_mass_g ?? null
      })),
      selectedAnodes: state.stack.selectedAnodes.map(e => ({
        electrode_id: e.electrode_id,
        electrode_mass_g: e.electrode_mass_g ?? null
      }))
    });
  }

  if (sectionKey === 'battery_assembly') {
    return captureNamedState(getActiveAssemblyFieldset());
  }

  if (sectionKey === 'battery_qc') {
    return captureNamedState(document.getElementById('battery_qc'));
  }

  if (sectionKey === 'battery_electrochem') {
    return JSON.stringify({
      electrochem_notes: document.getElementById('electrochem_notes')?.value ?? '',
      electrochem_files: document.getElementById('electrochem_files')?.value ?? '',
      saved_entries: state.electrochem.savedEntries
    });
  }

  return 'null';
}

function clearDirtyFlags() {
  setBatterySectionLifecycleState(getDefaultBatterySectionLifecycleState());
  renderBatteryDirtyMarkers();
}

function updateDirtyFlags() {
  refreshDirtyState();
  renderBatterySectionLifecycle();
  renderStackUiState();
}

// -------- Render Helpers --------

function getStackSelectionContext() {
  const formFactor = state.meta.form_factor;
  const coinMode = state.config.coin?.coin_cell_mode || null;
  const halfCellType = state.config.coin?.half_cell_type || null;

  return {
    formFactor,
    coinMode,
    halfCellType
  };
}

function isBatteryStackInteractable() {
  return Boolean(state.selection.currentBatteryId) &&
    !state.stack.readOnly;
}

function getStackTargetCounts() {
  const { formFactor, coinMode, halfCellType } = getStackSelectionContext();

  if (formFactor === 'coin' && coinMode === 'half_cell') {
    if (halfCellType === 'cathode_vs_li') return { cathodes: 1, anodes: 0, valid: true, fixed: true };
    if (halfCellType === 'anode_vs_li') return { cathodes: 0, anodes: 1, valid: true, fixed: true };
    return { cathodes: 0, anodes: 0, valid: false, fixed: true };
  }

  if (formFactor === 'coin' && coinMode === 'full_cell') {
    return { cathodes: 1, anodes: 1, valid: true, fixed: true };
  }

  if (isMultiElectrodeFormFactor(formFactor)) {
    const cathodes = state.stack.targetCathodeCount;
    const anodes = state.stack.targetAnodeCount;
    const valid = Number.isInteger(cathodes) &&
      Number.isInteger(anodes) &&
      cathodes > 0 &&
      (anodes === cathodes || anodes === cathodes + 1);

    return {
      cathodes: cathodes || 0,
      anodes: anodes || 0,
      valid,
      fixed: false,
      anodeMode: state.stack.targetAnodeMode
    };
  }

  return { cathodes: 0, anodes: 0, valid: false, fixed: true };
}

function syncFixedStackTargetCountsFromConfig() {
  const targets = getStackTargetCounts();

  if (targets.fixed) {
    setStackTargetCounts({
      cathodes: targets.cathodes,
      anodes: targets.anodes,
      anodeMode: deriveStackAnodeMode(targets.cathodes, targets.anodes)
    });
  }
}

function renderStackTargetCountControls() {
  syncFixedStackTargetCountsFromConfig();

  const { formFactor } = getStackSelectionContext();
  const isMultiElectrodeCell = isMultiElectrodeFormFactor(formFactor);
  const root = document.getElementById('battery_stack_target_counts');
  const cathodesInput = document.getElementById('stack_target_cathodes');
  const anodesInput = document.getElementById('stack_target_anodes');
  const anodeModeButtons = Array.from(document.querySelectorAll('[data-anode-mode]'));
  const hint = document.getElementById('battery_stack_target_hint');

  if (!root) return;

  root.hidden = !state.selection.currentBatteryId || !state.meta.form_factor;

  if (cathodesInput) {
    cathodesInput.value = state.stack.targetCathodeCount ?? '';
    cathodesInput.disabled = !isMultiElectrodeCell || state.stack.readOnly;
  }

  if (anodesInput) {
    anodesInput.value = state.stack.targetAnodeCount ?? '';
    anodesInput.readOnly = true;
    anodesInput.disabled = !isMultiElectrodeCell || state.stack.readOnly;
  }

  anodeModeButtons.forEach((button) => {
    const isPressed = button.dataset.anodeMode === state.stack.targetAnodeMode;
    button.hidden = !isMultiElectrodeCell;
    button.disabled = !isMultiElectrodeCell || state.stack.readOnly;
    button.setAttribute('aria-pressed', String(isPressed));
  });

  if (!hint) return;

  if (!isMultiElectrodeCell) {
    hint.textContent = 'Количество электродов задано типом элемента.';
    return;
  }

  const targets = getStackTargetCounts();
  hint.textContent = targets.valid
    ? 'Аноды рассчитываются автоматически: столько же, сколько катодов, или на один больше.'
    : 'Укажите количество катодов и выберите режим количества анодов.';
}

function getSelectedElectrodesByRole(role) {
  return role === 'cathode'
    ? state.stack.selectedCathodes
    : state.stack.selectedAnodes;
}

function setSelectedElectrodesByRole(role, electrodes) {
  if (role === 'cathode') {
    setSelectedCathodes(electrodes);
  } else {
    setSelectedAnodes(electrodes);
  }
}

function getReferenceElectrodesByRole(role) {
  return role === 'cathode'
    ? state.reference.cathodeElectrodes
    : state.reference.anodeElectrodes;
}

function toggleStackElectrodeSelection(role, electrodeId) {
  const selected = getSelectedElectrodesByRole(role);
  const isSelected = selected.some(el => idsMatch(el.electrode_id, electrodeId));

  if (isSelected) {
    setSelectedElectrodesByRole(
      role,
      selected.filter(el => !idsMatch(el.electrode_id, electrodeId))
    );
    return;
  }

  const electrode = getReferenceElectrodesByRole(role)
    .find(el => idsMatch(el.electrode_id, electrodeId));

  if (!electrode) return;

  if (isCoinSingleSelectionMode()) {
    setSelectedElectrodesByRole(role, [electrode]);
    return;
  }

  setSelectedElectrodesByRole(role, [...selected, electrode]);
}

function handleStackElectrodeClick(event, role) {
  event.stopPropagation();

  if (event.currentTarget.disabled) return;

  toggleStackElectrodeSelection(role, event.currentTarget.value);
  setBatteryNpSelectionFeedback('');
  renderStackSummary();
  renderStackUiState();
  updateDirtyFlags();
}

function renderStackUiState() {
  const stackBuilder = document.getElementById('battery_stack_builder');
  const cathodeBlock = document.querySelector('.stack_cathode_block');
  const anodeBlock = document.querySelector('.stack_anode_block');
  const shouldHide = state.stack.hideSelectionBlocks;
  const { formFactor, coinMode, halfCellType } = getStackSelectionContext();
  const cathodeCheckboxes = Array.from(
    document.querySelectorAll('#stack_cathode_table_body input[type="checkbox"]')
  );
  const anodeCheckboxes = Array.from(
    document.querySelectorAll('#stack_anode_table_body input[type="checkbox"]')
  );
  const selectedCathodeIds = state.stack.selectedCathodes.map(e => normalizeNumberId(e.electrode_id));
  const selectedAnodeIds = state.stack.selectedAnodes.map(e => normalizeNumberId(e.electrode_id));
  const targets = getStackTargetCounts();

  renderStackTargetCountControls();
  renderBatteryFinalizedUiCleanup(isBatteryIdentityLocked());

  if (stackBuilder) {
    stackBuilder.dataset.stackLocked = state.stack.readOnly ? 'true' : 'false';
    stackBuilder.classList.toggle('locked', state.stack.readOnly);
  }

  if (cathodeBlock) {
    cathodeBlock.hidden = shouldHide ||
      (formFactor === 'coin' && coinMode === 'half_cell' && halfCellType === 'anode_vs_li');
  }

  if (anodeBlock) {
    anodeBlock.hidden = shouldHide ||
      (formFactor === 'coin' && coinMode === 'half_cell' && halfCellType === 'cathode_vs_li');
  }

  cathodeCheckboxes.forEach(cb => {
    cb.checked = idListIncludes(selectedCathodeIds, cb.value);
    cb.disabled = cb.dataset.available !== 'true';
  });

  anodeCheckboxes.forEach(cb => {
    cb.checked = idListIncludes(selectedAnodeIds, cb.value);
    cb.disabled = cb.dataset.available !== 'true';
  });

  renderBatteryNpAssist();
  renderAnodeNpGuidance();

  if (state.stack.readOnly || !isBatteryStackInteractable()) {
    cathodeCheckboxes.forEach(cb => { cb.disabled = true; });
    anodeCheckboxes.forEach(cb => { cb.disabled = true; });
    return;
  }

  if (formFactor === 'coin' && coinMode === 'half_cell') {
    cathodeCheckboxes.forEach(cb => {
      if (cb.dataset.available !== 'true') return;
      if (targets.cathodes === 0) {
        cb.disabled = true;
        return;
      }

      if (
        state.stack.selectedCathodes.length >= targets.cathodes &&
        !idListIncludes(selectedCathodeIds, cb.value)
      ) {
        cb.disabled = true;
      }
    });

    anodeCheckboxes.forEach(cb => {
      if (cb.dataset.available !== 'true') return;
      if (targets.anodes === 0) {
        cb.disabled = true;
        return;
      }

      if (
        state.stack.selectedAnodes.length >= targets.anodes &&
        !idListIncludes(selectedAnodeIds, cb.value)
      ) {
        cb.disabled = true;
      }
    });

    return;
  }

  if (formFactor === 'coin' && coinMode === 'full_cell') {
    cathodeCheckboxes.forEach(cb => {
      if (cb.dataset.available !== 'true') return;

      if (
        state.stack.selectedCathodes.length >= targets.cathodes &&
        !idListIncludes(selectedCathodeIds, cb.value)
      ) {
        cb.disabled = true;
      }
    });

    anodeCheckboxes.forEach(cb => {
      if (cb.dataset.available !== 'true') return;

      if (
        state.stack.selectedAnodes.length >= targets.anodes &&
        !idListIncludes(selectedAnodeIds, cb.value)
      ) {
        cb.disabled = true;
      }
    });
    return;
  }

  if (isMultiElectrodeFormFactor(formFactor)) {
    if (!targets.valid) {
      cathodeCheckboxes.forEach(cb => { cb.disabled = true; });
      anodeCheckboxes.forEach(cb => { cb.disabled = true; });
      return;
    }

    cathodeCheckboxes.forEach(cb => {
      if (cb.dataset.available !== 'true') return;

      if (
        state.stack.selectedCathodes.length >= targets.cathodes &&
        !idListIncludes(selectedCathodeIds, cb.value)
      ) {
        cb.disabled = true;
      }
    });

    anodeCheckboxes.forEach(cb => {
      if (cb.dataset.available !== 'true') return;

      if (
        state.stack.selectedAnodes.length >= targets.anodes &&
        !idListIncludes(selectedAnodeIds, cb.value)
      ) {
        cb.disabled = true;
      }
    });
  }
}

function isAvailableElectrodeStatus(statusCode) {
  return Number(statusCode) === 1;
}

function applySavedElectrodeState(data) {
  const hasSavedElectrodes =
  Array.isArray(data.electrodes) && data.electrodes.length > 0;

  setStackReadOnly(hasSavedElectrodes);
  setHideStackSelectionBlocks(
    hasSavedElectrodes ||
    data?.battery?.status === 'assembled'
  );
  renderStackUiState();
}

function resetElectrodeUiState() {
  setStackReadOnly(false);
  setHideStackSelectionBlocks(false);
  renderStackUiState();
}

function hasMeaningfulValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function isCommentField(el) {
  return Boolean(el?.name) && (
    el.name === 'battery_notes' ||
    el.name === 'qc_notes' ||
    el.name === 'electrochem_notes' ||
    el.name.endsWith('_notes')
  );
}

function hasBatteryAssemblySourceRole(data, role) {
  return (Array.isArray(data?.electrode_sources) ? data.electrode_sources : [])
    .some(source =>
      source.role === role &&
      hasMeaningfulValue(source.tape_id) &&
      hasMeaningfulValue(source.cut_batch_id)
    );
}

function getBatteryAssemblyElectrodeRoleCount(data, role) {
  return (Array.isArray(data?.electrodes) ? data.electrodes : [])
    .filter(electrode => electrode.role === role)
    .length;
}

function isBatteryAssemblyComplete(data) {
  const formFactor = data?.battery?.form_factor || null;
  const pouchConfig = data?.pouch_config || null;
  const hasPouchConfig =
    Boolean(pouchConfig?.pouch_case_size_code) &&
    (
      pouchConfig.pouch_case_size_code !== 'other' ||
      Boolean(String(pouchConfig.pouch_case_size_other || '').trim())
    );

  const hasConfig =
    formFactor === 'coin'
      ? Boolean(
        data.coin_config?.coin_cell_mode &&
        data.coin_config?.coin_size_code &&
        (
          data.coin_config.coin_cell_mode !== 'half_cell' ||
          data.coin_config.half_cell_type
        )
      )
    : isPouchLikeFormFactor(formFactor)
      ? hasPouchConfig
    : formFactor === 'cylindrical'
      ? Boolean(data.cyl_config?.cyl_size_code)
    : false;

  const cathodeSources = hasBatteryAssemblySourceRole(data, 'cathode');
  const anodeSources = hasBatteryAssemblySourceRole(data, 'anode');
  const coinMode = data?.coin_config?.coin_cell_mode || null;
  const halfCellType = data?.coin_config?.half_cell_type || null;
  const hasSources =
    formFactor === 'coin' && coinMode === 'half_cell' && halfCellType === 'cathode_vs_li'
      ? cathodeSources && !anodeSources
    : formFactor === 'coin' && coinMode === 'half_cell' && halfCellType === 'anode_vs_li'
      ? anodeSources && !cathodeSources
    : ['coin', 'pouch', 'cylindrical', 'prism'].includes(formFactor)
      ? cathodeSources && anodeSources
    : false;

  const cathodes = getBatteryAssemblyElectrodeRoleCount(data, 'cathode');
  const anodes = getBatteryAssemblyElectrodeRoleCount(data, 'anode');
  const hasElectrodes =
    formFactor === 'coin' && coinMode === 'half_cell' && halfCellType === 'cathode_vs_li'
      ? cathodes === 1 && anodes === 0
    : formFactor === 'coin' && coinMode === 'half_cell' && halfCellType === 'anode_vs_li'
      ? anodes === 1 && cathodes === 0
    : formFactor === 'coin'
      ? cathodes === 1 && anodes === 1
    : isPouchLikeFormFactor(formFactor) || formFactor === 'cylindrical'
      ? cathodes >= 1 && anodes >= 1 && (anodes === cathodes || anodes === cathodes + 1)
    : false;

  const hasAssembly = Boolean(
    data.separator?.separator_id &&
    data.electrolyte?.electrolyte_id &&
    hasMeaningfulValue(data.electrolyte?.electrolyte_total_ul)
  );

  return hasConfig && hasSources && hasElectrodes && hasAssembly;
}

function getBatterySectionRoot(sectionKey) {
  if (sectionKey === 'battery_meta') return document.getElementById('battery_meta');
  if (sectionKey === 'battery_config') return getActiveConfigFieldset();
  if (sectionKey === 'electrode_sources') return document.getElementById('battery_electrode_sources');
  if (sectionKey === 'battery_stack') return document.getElementById('battery_stack_builder');
  if (sectionKey === 'battery_assembly') return getActiveAssemblyFieldset();
  if (sectionKey === 'battery_qc') return document.getElementById('battery_qc');
  if (sectionKey === 'battery_electrochem') return document.getElementById('battery_electrochem');
  return null;
}

function getBatterySectionContainer(sectionKey) {
  if (sectionKey === 'battery_config') return document.getElementById('battery_config');
  if (sectionKey === 'battery_assembly') return document.getElementById('battery_assembly');
  return getBatterySectionRoot(sectionKey);
}

function getBatterySectionSaveButtonId(sectionKey) {
  if (sectionKey === 'battery_meta') return 'battery_create_btn';
  if (sectionKey === 'battery_stack') return 'battery_stack_save_btn';
  if (sectionKey === 'battery_assembly') {
    return state.meta.form_factor === 'coin'
      ? 'coin_assembly_save_btn'
      : isPouchLikeFormFactor(state.meta.form_factor)
        ? 'pouch_assembly_save_btn'
        : 'cyl_assembly_save_btn';
  }
  if (sectionKey === 'battery_qc') return 'battery_qc_save_btn';
  if (sectionKey === 'battery_electrochem') return 'battery_electrochem_save_btn';
  return null;
}

function isBatteryIdentitySection(sectionKey) {
  return (
    sectionKey === 'battery_meta' ||
    sectionKey === 'battery_config' ||
    sectionKey === 'electrode_sources'
  );
}

function isBatteryIdentityLocked() {
  return Boolean(state.stack.readOnly || state.stack.hideSelectionBlocks);
}

function parseBatterySnapshot(snapshot) {
  if (!snapshot) return null;

  try {
    return JSON.parse(snapshot);
  } catch {
    return null;
  }
}

function hasSavedNamedFieldValue(sectionKey, fieldNames) {
  const fields = parseBatterySnapshot(state.snapshots.savedSectionStates[sectionKey]);

  if (!Array.isArray(fields)) return false;

  return fields.some(field =>
    fieldNames.includes(field.name) &&
    hasMeaningfulValue(field.value)
  );
}

function hasBatteryStackLinksInSnapshot(snapshot) {
  const stack = parseBatterySnapshot(snapshot);

  if (!stack) return false;

  return (
    (Array.isArray(stack.selectedCathodes) && stack.selectedCathodes.length > 0) ||
    (Array.isArray(stack.selectedAnodes) && stack.selectedAnodes.length > 0)
  );
}

function hasSavedBatteryStackLinks() {
  return hasBatteryStackLinksInSnapshot(state.snapshots.savedSectionStates.battery_stack);
}

function hasSavedBatteryLifecycleLinks() {
  const sourceRows = parseBatterySnapshot(state.snapshots.savedSectionStates.electrode_sources);
  const hasSavedSourceRows = Array.isArray(sourceRows) &&
    sourceRows.some(row => row?.tape_id && row?.cut_batch_id);

  return (
    hasSavedSourceRows ||
    hasSavedBatteryStackLinks() ||
    hasSavedNamedFieldValue('battery_assembly', [
      'separator_id',
      'electrolyte_id',
      'electrolyte_total_ul'
    ])
  );
}

function shouldDisableBatteryControl(sectionKey, el) {
  const isPhaseTwoSection = BATTERY_PHASE_TWO_SECTIONS.has(sectionKey);
  const hasBattery = Boolean(state.selection.currentBatteryId);

  if (!state.ui.isFormOpen) return true;
  if (isPhaseTwoSection && !hasBattery) return true;
  if (el.id === 'battery_created_by') return true;
  if (el.id === 'battery_status') return true;
  if (sectionKey === 'battery_stack' && el.type === 'checkbox') return false;

  if (
    isBatteryIdentitySection(sectionKey) &&
    isBatteryIdentityLocked() &&
    !isCommentField(el) &&
    el.id !== 'battery_create_btn'
  ) {
    return true;
  }

  return false;
}

function setBatterySectionLockMessage(sectionKey, sectionState) {
  const container = getBatterySectionContainer(sectionKey);

  if (!container) return;

  if (state.ui.isFormOpen) {
    delete container.dataset.lockMessage;
    container.removeAttribute('title');
    return;
  }

  if (!sectionState.isUnlocked) {
    const lockMessage = BATTERY_SECTION_UNLOCK_MESSAGES[sectionKey] || '';
    if (lockMessage) {
      container.dataset.lockMessage = lockMessage;
      container.title = lockMessage;
    }
    return;
  }

  if (sectionState.isLocked) {
    const lockMessage = 'Раздел сохранён. Доступно редактирование только комментариев.';
    container.dataset.lockMessage = lockMessage;
    container.title = lockMessage;
    return;
  }

  if (sectionState.isSaved && !sectionState.isComplete) {
    const lockMessage = 'Раздел сохранён как черновик. Дополните данные и сохраните снова для фиксации.';
    container.dataset.lockMessage = lockMessage;
    container.title = lockMessage;
    return;
  }

  delete container.dataset.lockMessage;
  container.removeAttribute('title');
}

function renderBatterySectionInteractivity(sectionKey) {
  const root = getBatterySectionRoot(sectionKey);
  const saveButtonId = getBatterySectionSaveButtonId(sectionKey);
  const saveButton = saveButtonId ? document.getElementById(saveButtonId) : null;
  const isPhaseTwoSection = BATTERY_PHASE_TWO_SECTIONS.has(sectionKey);
  const hasBattery = Boolean(state.selection.currentBatteryId);
  const isAccessible = Boolean(
    state.ui.isFormOpen &&
    (!isPhaseTwoSection || hasBattery) &&
    !(sectionKey === 'battery_stack' && state.stack.readOnly)
  );

  setBatterySectionLockMessage(sectionKey, state.ui.sectionState?.[sectionKey] || {});

  if (!root) {
    if (saveButton) {
      saveButton.disabled = !isAccessible;
    }
    return;
  }

  root.querySelectorAll('input, select, textarea, button').forEach(el => {
    if (saveButton && el === saveButton) {
      return;
    }

    if (sectionKey === 'battery_stack' && el.type === 'checkbox') {
      return;
    }

    if (el.id === 'battery_status') {
      return;
    }

    const shouldDisable = shouldDisableBatteryControl(sectionKey, el);
    el.disabled = shouldDisable;
    el.readOnly = shouldDisable;
  });

  if (saveButton) {
    saveButton.disabled = !isAccessible;
  }
}

function renderBatterySectionLifecycle() {
  BATTERY_SECTION_KEYS.forEach(sectionKey => {
    renderBatterySectionInteractivity(sectionKey);
  });

  const banner = document.getElementById('assembly_locked_banner');
  const identityLocked = isBatteryIdentityLocked();

  if (banner) {
    banner.classList.toggle(
      'visible',
      identityLocked
    );
  }

  renderBatteryFinalizedUiCleanup(identityLocked);
}

function renderBatteryFinalizedUiCleanup(identityLocked) {
  const projectFilterRow = document.getElementById('battery_project_filter_row');
  const batterySaveButton = document.getElementById('battery_create_btn');
  const stackIntro = document.getElementById('battery_stack_intro');
  const stackTargetIntro = document.getElementById('battery_stack_target_intro');
  const stackTargetHint = document.getElementById('battery_stack_target_hint');
  const stackSaveButton = document.getElementById('battery_stack_save_btn');
  const stackSectionState = state.ui.sectionState?.battery_stack || {};
  const stackSavedAndClean = Boolean(
    stackSectionState.isSaved &&
    !stackSectionState.isDirty &&
    hasSavedBatteryStackLinks()
  );
  const stackSaved = Boolean(
    stackSavedAndClean ||
    state.stack.readOnly ||
    state.stack.hideSelectionBlocks
  );

  if (projectFilterRow) projectFilterRow.hidden = identityLocked;
  if (batterySaveButton) batterySaveButton.hidden = identityLocked;
  if (stackIntro) stackIntro.hidden = stackSaved;
  if (stackTargetIntro) stackTargetIntro.hidden = stackSaved;
  if (stackTargetHint) stackTargetHint.hidden = stackSaved;
  if (stackSaveButton) stackSaveButton.hidden = stackSaved;
}

function renderWorkflowProgressionState() {
  refreshBatterySectionLifecycleState();
  renderBatterySectionLifecycle();
  renderStackUiState();
}

function getSelectedLabel(selectId, fallbackValue = '—') {
  const select = document.getElementById(selectId);
  return select?.selectedOptions?.[0]?.textContent || fallbackValue;
}

function ensureSelectOption(select, value, label) {
  if (!select || value == null || value === '') return;

  const normalizedValue = String(value);
  const hasOption = Array.from(select.options).some(
    option => String(option.value) === normalizedValue
  );

  if (hasOption) return;

  const option = document.createElement('option');
  option.value = normalizedValue;
  option.textContent = label || `#${normalizedValue}`;
  select.appendChild(option);
}

function getBatteryProjectLabel() {
  const battery = state.selection.currentBattery;
  const projectIds = normalizeProjectIds(state.meta.project_ids);

  return (
    battery?.project_names ||
    projectIds.map(getProjectNameById).filter(Boolean).join(', ') ||
    battery?.project_name ||
    ''
  );
}

function normalizeBatteryStatusForDisplay(status) {
  return status === 'disassembled'
    ? ''
    : status || '';
}

function getBatteryStatusLabel(status) {
  const normalizedStatus = normalizeBatteryStatusForDisplay(status);

  return BATTERY_STATUS_LABELS[normalizedStatus] || normalizedStatus || BATTERY_OPEN_STATUS_LABEL;
}

function renderBatteryStatusOptions(select, { includeOpen = false } = {}) {
  const options = [];

  if (includeOpen) {
    options.push({ value: '', label: BATTERY_OPEN_STATUS_LABEL });
  }

  options.push(...BATTERY_SELECTABLE_STATUS_OPTIONS);

  select.replaceChildren(
    ...options.map((option) => new Option(option.label, option.value))
  );
}

function getBatteryStatusControlValue(status) {
  const normalizedStatus = normalizeBatteryStatusForDisplay(status);
  const isSelectable = BATTERY_SELECTABLE_STATUS_OPTIONS.some(
    option => option.value === normalizedStatus
  );

  return isSelectable ? normalizedStatus : 'assembled';
}

function renderBatteryStickyHeader() {
  const header = document.getElementById('battery_sticky_header');
  const labelEl = document.getElementById('battery_sticky_label');
  const metaEl = document.getElementById('battery_sticky_meta');
  const dirtyEl = document.getElementById('battery-global-dirty');

  if (!header || !labelEl || !metaEl) return;

  const isFormOpen = Boolean(state.ui.isFormOpen);
  const hasBattery = Boolean(state.selection.currentBatteryId);

  header.hidden = !isFormOpen;

  if (!isFormOpen) return;

  if (hasBattery) {
    const projectLabel = getBatteryProjectLabel();
    labelEl.textContent = `Аккумулятор #${state.selection.currentBatteryId}${projectLabel ? ` | ${projectLabel}` : ''}`;
  } else {
    labelEl.textContent = 'Новый аккумулятор';
  }

  const metaParts = hasBattery
    ? [
      getSelectedLabel('battery_form_factor', state.meta.form_factor || ''),
      getBatteryStatusLabel(state.selection.currentBattery?.status),
      state.selection.currentBattery?.created_by_name || getSelectedLabel('battery_created_by', '')
    ]
    : ['Заполните общую информацию, затем создайте запись'];

  metaEl.textContent = metaParts.filter(Boolean).join(' — ') || '—';

  if (dirtyEl) {
    const hasDirtySections = BATTERY_SECTION_KEYS.some(sectionKey =>
      Boolean(state.ui.sectionState?.[sectionKey]?.isDirty)
    );

    dirtyEl.classList.toggle(
      'visible',
      !state.ui.isRestoringBattery && hasDirtySections
    );
  }
}

function renderBatteryWorkspaceVisibility() {
  const isFormOpen = Boolean(state.ui.isFormOpen);
  const hasBattery = Boolean(state.selection.currentBatteryId);
  const form = document.querySelector('form[name="battery_assembly_log_form"]');
  const addBtn = document.getElementById('addBatteryBtn');
  const stickyHeader = document.getElementById('battery_sticky_header');
  const header = document.getElementById('battery_header');
  const workspace = document.getElementById('battery_workspace');
  const stackBuilder = document.getElementById('battery_stack_builder');
  const assemblySection = document.getElementById('battery_assembly');
  const qcSection = document.getElementById('battery_qc');
  const electrochemSection = document.getElementById('battery_electrochem');
  const printBtn = document.getElementById('printBatteryBtn');
  const exitBtn = document.getElementById('exitBatteriesBtn');
  const disassembleBtn = document.getElementById('disassembleBatteryBtn');
  const deleteBtn = document.getElementById('deleteBatteryBtn');

  if (form) {
    form.hidden = !isFormOpen;
  }

  if (addBtn) {
    addBtn.hidden = isFormOpen || state.ui.isRestoringBattery;
  }

  if (stickyHeader) {
    stickyHeader.hidden = !isFormOpen;
  }

  if (header) {
    header.hidden = !isFormOpen || !hasBattery;
  }

  if (workspace) {
    workspace.hidden = !isFormOpen;
  }

  [stackBuilder, assemblySection, qcSection, electrochemSection].forEach((section) => {
    if (section) {
      section.hidden = !isFormOpen || !hasBattery;
    }
  });

  if (printBtn) {
    printBtn.hidden = !isFormOpen || !hasBattery;
  }

  if (exitBtn) {
    exitBtn.hidden = !isFormOpen;
  }

  if (disassembleBtn) {
    disassembleBtn.hidden = true;
    disassembleBtn.disabled = true;
    disassembleBtn.title = '';
  }

  if (deleteBtn) {
    deleteBtn.hidden = !isFormOpen || !hasBattery;
  }

  renderBatteryStickyHeader();
}

function renderBatteryHeader() {
  const battery = state.selection.currentBattery;

  document.getElementById('battery_id_label').textContent =
    battery?.battery_id ? `#${battery.battery_id}` : '—';

  document.getElementById('battery_project_label').textContent =
    battery
      ? (
        state.selection.currentBattery?.project_names ||
        normalizeProjectIds(state.meta.project_ids).map(getProjectNameById).join(', ') ||
        state.selection.currentBattery?.project_name ||
        '—'
      )
      : '—';

  document.getElementById('battery_formfactor_label').textContent =
    battery ? getSelectedLabel('battery_form_factor') : '—';

  document.getElementById('battery_operator_label').textContent =
    battery ? getSelectedLabel('battery_created_by') : '—';
}

function renderBatteryCreateButton() {
  const btn = document.getElementById('battery_create_btn');

  if (!btn) return;

  if (state.ui.createButtonMode === 'edit') {
    btn.textContent = 'Сохранить данные аккумулятора';
    btn.dataset.mode = 'update';
    return;
  }

  if (state.ui.createButtonMode === 'createSaved') {
    btn.textContent = 'Сохранить данные аккумулятора';
    btn.dataset.mode = 'update';
    return;
  }

  btn.textContent = 'Создать аккумулятор';
  btn.dataset.mode = 'create';
}

function renderBatteryStatusControl() {
  const select = document.getElementById('battery_status');

  if (!select) return;

  if (!state.selection.currentBatteryId || !state.stack.loadedAssemblyComplete) {
    renderBatteryStatusOptions(select, { includeOpen: true });
    select.disabled = true;
    select.value = '';
    return;
  }

  renderBatteryStatusOptions(select);
  select.disabled = false;
  select.value = getBatteryStatusControlValue(state.selection.currentBattery?.status);
}

function renderMetaForm() {
  const createdBySelect = document.getElementById('battery_created_by');
  const formFactorSelect = document.getElementById('battery_form_factor');

  ensureSelectOption(
    createdBySelect,
    state.meta.created_by,
    state.selection.currentBattery?.created_by_name || `#${state.meta.created_by}`
  );

  projectSelect.value = state.meta.project_id ?? '';
  if (projectIdsInput) {
    projectIdsInput.value = normalizeProjectIds(state.meta.project_ids).join(',');
  }
  createdBySelect.value = state.meta.created_by ?? '';
  if (itemCreatedAtInput) {
    itemCreatedAtInput.max = getTodayDateInputValue();
    itemCreatedAtInput.value = state.meta.item_created_at ?? '';
  }
  formFactorSelect.value = state.meta.form_factor ?? '';

  document.getElementById('battery_notes').value =
    state.meta.battery_notes ?? '';
}

function getProjectNameById(projectId) {
  const project = state.reference.projects.find(
    (item) => String(item.project_id) === String(projectId)
  );
  return project?.name || `#${projectId}`;
}

function getSelectedSourceBatch(role) {
  const batchId = getPrimaryElectrodeSource(role)?.cut_batch_id;
  const batches = role === 'cathode'
    ? state.reference.cathodeBatches
    : state.reference.anodeBatches;

  return batches.find((batch) => String(batch.cut_batch_id) === String(batchId || '')) ||
    state.reference.cutBatches.find((batch) => String(batch.cut_batch_id) === String(batchId || '')) ||
    null;
}

function getSelectedSourceBatches(role) {
  const roleBatches = role === 'cathode'
    ? state.reference.cathodeBatches
    : state.reference.anodeBatches;
  const allBatches = [
    ...roleBatches,
    ...state.reference.cutBatches
  ];

  return getSelectedSourceBatchIds(role)
    .map(batchId => allBatches.find(
      batch => String(batch.cut_batch_id) === String(batchId)
    ))
    .filter(Boolean);
}

function findSourceBatchById(role, batchId) {
  if (!batchId) return null;

  const allBatches = [
    ...getRoleBatchReference(role),
    ...state.reference.cutBatches
  ];

  return allBatches.find(batch => String(batch.cut_batch_id) === String(batchId)) || null;
}

function getFirstKnownBatchProjectId(batch) {
  return getBatchProjectIds(batch)[0] || null;
}

function getBatchTapeId(batch) {
  if (batch?.tape_id) return String(batch.tape_id);

  if (!batch?.tape_name) return null;

  const tape = state.reference.tapes.find(item =>
    item.name === batch.tape_name &&
    (!batch.tape_role || item.role === batch.tape_role)
  );

  return tape?.tape_id ? String(tape.tape_id) : null;
}

function getSourceRowTapeSelect(role, sourceIndex) {
  const index = Number.isInteger(Number(sourceIndex)) ? Number(sourceIndex) : 0;
  return index > 0
    ? document.getElementById(`${role}_tape_id_extra_${index}`)
    : document.getElementById(`${role}_tape_id`);
}

function batchMatchesSelectedTape(batch, tapeId) {
  return !tapeId || String(getBatchTapeId(batch) || '') === String(tapeId);
}

function batchMatchesSelectedProjectFilter(batch) {
  const projectFilterId = projectFilterSelect?.value || '';
  return !projectFilterId || getBatchProjectIds(batch).includes(String(projectFilterId));
}

function backfillSourceRowFromSelectedBatch(role, sourceIndex, batchId) {
  const batch = findSourceBatchById(role, batchId);
  if (!batch) return;

  const rows = getElectrodeSourceRows(role).map(row => ({ ...row }));
  const index = Number.isInteger(Number(sourceIndex)) ? Number(sourceIndex) : 0;
  const row = rows[index];
  if (!row) return;

  const batchTapeId = getBatchTapeId(batch);

  if (batchTapeId) {
    row.tape_id = batchTapeId;
    const tapeSelect = getSourceRowTapeSelect(role, index);
    if (tapeSelect) {
      ensureSelectOption(tapeSelect, batchTapeId, `#${batchTapeId} | выбранная лента`);
      tapeSelect.value = batchTapeId;
    }
  }

  const projectId = getFirstKnownBatchProjectId(batch);
  if (projectId && projectFilterSelect) {
    projectFilterSelect.value = String(projectId);
  }

  setElectrodeSourceRows(role, rows);
}

function clearRoleBatchesIncompatibleWithManualFilters(role, { checkTape = false, checkProject = false } = {}) {
  const rows = getElectrodeSourceRows(role).map(row => {
    if (!row.cut_batch_id) return row;

    const batch = findSourceBatchById(role, row.cut_batch_id);
    if (!batch) return row;

    const tapeMismatch = checkTape && !batchMatchesSelectedTape(batch, row.tape_id);
    const projectMismatch = checkProject && !batchMatchesSelectedProjectFilter(batch);

    if (!tapeMismatch && !projectMismatch) return row;

    return {
      ...row,
      cut_batch_id: null
    };
  });

  setElectrodeSourceRows(role, rows);
}

function getRequiredBatteryProjectRoles() {
  const formFactor = state.meta.form_factor;
  const coinMode = state.config.coin?.coin_cell_mode || null;
  const halfCellType = state.config.coin?.half_cell_type || null;

  if (formFactor === 'coin' && coinMode === 'half_cell') {
    if (halfCellType === 'cathode_vs_li') return ['cathode'];
    if (halfCellType === 'anode_vs_li') return ['anode'];
    return [];
  }

  return ['cathode', 'anode'];
}

function intersectBatteryProjectIds(projectIdGroups) {
  if (!projectIdGroups.length) return [];
  return projectIdGroups
    .slice(1)
    .reduce(
      (acc, group) => acc.filter((projectId) => group.includes(projectId)),
      [...projectIdGroups[0]]
    );
}

function getAllowedBatteryProjectIds() {
  const roles = getRequiredBatteryProjectRoles();
  if (!roles.length) return [];

  const projectGroups = [];

  for (const role of roles) {
    const batches = getSelectedSourceBatches(role);
    if (!batches.length) return [];

    for (const batch of batches) {
      const projectIds = normalizeProjectIds(batch.project_ids || batch.project_id);
      if (!projectIds.length) return [];
      projectGroups.push(projectIds);
    }
  }

  return intersectBatteryProjectIds(projectGroups);
}

function setBatteryProjectIds(projectIds, { render = true } = {}) {
  const normalized = normalizeProjectIds(projectIds);

  state.meta.project_ids = normalized;
  state.meta.project_id = normalized[0] || null;

  if (projectSelect) {
    projectSelect.value = state.meta.project_id || '';
  }
  if (projectIdsInput) {
    projectIdsInput.value = normalized.join(',');
  }

  if (render) {
    renderBatteryProjectMultiSelect();
    updateDirtyFlags();
  }
}

function autoSelectAllowedBatteryProjects() {
  const allowedProjectIds = getAllowedBatteryProjectIds();
  const selected = normalizeProjectIds(state.meta.project_ids)
    .filter((projectId) => allowedProjectIds.includes(projectId));

  setBatteryProjectIds(selected.length ? selected : allowedProjectIds, { render: false });
}

function renderBatteryProjectMultiSelect() {
  if (!batteryProjectMultiSelectOptions || !batteryProjectMultiSelectTrigger) return;

  batteryProjectMultiSelectOptions.innerHTML = '';

  const allowedProjectIds = getAllowedBatteryProjectIds();
  const allowed = new Set(allowedProjectIds);
  const selectedProjectIds = new Set(
    normalizeProjectIds(state.meta.project_ids).filter((projectId) => allowed.has(projectId))
  );

  if (selectedProjectIds.size !== normalizeProjectIds(state.meta.project_ids).length) {
    setBatteryProjectIds(Array.from(selectedProjectIds), { render: false });
  }

  if (!allowedProjectIds.length) {
    const empty = document.createElement('div');
    empty.className = 'field-hint';
    empty.textContent = 'Выберите партии электродов с общим проектом.';
    batteryProjectMultiSelectOptions.appendChild(empty);
    batteryProjectMultiSelectTrigger.textContent = '— нет доступных проектов —';
  } else {
    allowedProjectIds.forEach((projectId) => {
      const label = document.createElement('label');
      label.className = 'multi-select-option';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = projectId;
      checkbox.checked = selectedProjectIds.has(projectId);

      checkbox.addEventListener('change', () => {
        const nextProjectIds = Array.from(
          batteryProjectMultiSelectOptions.querySelectorAll('input[type="checkbox"]:checked')
        ).map((input) => input.value);

        if (!nextProjectIds.length) {
          checkbox.checked = true;
          showBatteryInlineStatus(
            'battery_create_btn',
            'Выберите хотя бы один проект аккумулятора.',
            true
          );
          return;
        }

        setBatteryProjectIds(nextProjectIds);
      });

      const text = document.createElement('span');
      text.textContent = getProjectNameById(projectId);

      label.appendChild(checkbox);
      label.appendChild(text);
      batteryProjectMultiSelectOptions.appendChild(label);
    });

    const selectedNames = Array.from(selectedProjectIds).map(getProjectNameById);
    batteryProjectMultiSelectTrigger.textContent = selectedNames.length
      ? selectedNames.join(', ')
      : '— выбрать проекты —';
  }

  const hint = document.getElementById('battery_project_hint');
  if (hint) {
    if (!allowedProjectIds.length) {
      hint.textContent = 'Проекты аккумулятора появятся после выбора совместимых партий электродов.';
    } else {
      hint.textContent = 'Проекты аккумулятора ограничены проектами выбранных партий электродов.';
    }
  }

  if (projectSelect) {
    projectSelect.value = state.meta.project_id || '';
  }
  if (projectIdsInput) {
    projectIdsInput.value = normalizeProjectIds(state.meta.project_ids).join(',');
  }
}

function setBatteryProjectMultiSelectOpen(isOpen) {
  if (!batteryProjectMultiSelectOptions || !batteryProjectMultiSelectTrigger) return;
  batteryProjectMultiSelectOptions.hidden = !isOpen;
  batteryProjectMultiSelectTrigger.setAttribute('aria-expanded', String(Boolean(isOpen)));
}

function toggleBatteryProjectMultiSelect() {
  setBatteryProjectMultiSelectOpen(batteryProjectMultiSelectOptions?.hidden !== false);
}

function renderConfigForm() {
  populateFieldset(document.getElementById('coin_config'), state.config.coin);
  populateFieldset(document.getElementById('pouch_config'), state.config.pouch);
  populateFieldset(document.getElementById('cyl_config'), state.config.cylindrical);
  renderPouchCaseSizeUi();
}

function canUseMultipleElectrodeSources() {
  const formFactor = state.meta.form_factor || document.getElementById('battery_form_factor')?.value || null;
  return isPouchLikeFormFactor(formFactor) || formFactor === 'cylindrical';
}

function getTapeOptionLabel(tape) {
  const sidednessLabel = formatTapeSidednessLabel(tape.coating_sidedness);
  const statusLabel = getTapeAvailabilityLabel(tape);
  return `#${tape.tape_id} | ${tape.name}${sidednessLabel ? ` | ${sidednessLabel}` : ''}${statusLabel ? ` | ${statusLabel}` : ''} | ${tape.created_by}`;
}

function isTapeUnavailableForSourceSelection(tape) {
  return tape?.availability_status === 'depleted';
}

function getTapeAvailabilityLabel(tape) {
  if (tape?.availability_status === 'depleted') return 'списана / израсходована';
  return '';
}

function getFilteredTapesForRole(role) {
  const projectFilterId = projectFilterSelect?.value || '';

  return state.reference.tapes.filter(tape => {
    if (tape.role !== role) return false;
    if (!projectFilterId) return true;
    const tapeProjectIds = normalizeProjectIds(tape.project_ids || tape.project_id);
    return tapeProjectIds.includes(String(projectFilterId));
  });
}

function renderTapeOptionsForSelect(select, role, selectedTapeId) {
  if (!select) return;

  select.innerHTML = '<option value="">— выбрать ленту —</option>';

  const tapes = getFilteredTapesForRole(role);
  const availableTapes = tapes.filter(tape => !isTapeUnavailableForSourceSelection(tape));
  const unavailableTapes = tapes.filter(isTapeUnavailableForSourceSelection);

  function appendTapeOption(parent, tape) {
    const option = document.createElement('option');
    option.value = tape.tape_id;
    option.textContent = getTapeOptionLabel(tape);
    if (isTapeUnavailableForSourceSelection(tape)) {
      option.className = 'battery-source-unavailable-option';
      option.style.color = '#7a7f88';
    }
    parent.appendChild(option);
  }

  availableTapes.forEach(tape => appendTapeOption(select, tape));

  if (unavailableTapes.length) {
    const group = document.createElement('optgroup');
    group.label = '--- Списанные / израсходованные ---';
    unavailableTapes.forEach(tape => appendTapeOption(group, tape));
    select.appendChild(group);
  }

  const tape = state.reference.tapes.find(
    item => String(item.tape_id) === String(selectedTapeId || '')
  );
  ensureSelectOption(
    select,
    selectedTapeId,
    tape
      ? getTapeOptionLabel(tape)
      : selectedTapeId
        ? `#${selectedTapeId} | сохранённая лента`
        : ''
  );
  select.value = selectedTapeId || '';
}

function getRoleBatchReference(role) {
  return role === 'cathode'
    ? state.reference.cathodeBatches
    : state.reference.anodeBatches;
}

function getUnfilteredCompatibleBatchReference(role) {
  return getLocalCompatibleBatteryCutBatches(null, getSelectedSourceBatchIds(role))
    .filter(batch => !batch.tape_role || batch.tape_role === role);
}

function hasBatchProjectOverlapWithRole(batch, role) {
  const oppositeBatches = getSelectedSourceBatches(role);
  if (!oppositeBatches.length) return true;

  return oppositeBatches.every(oppositeBatch => hasBatchProjectOverlap(batch, oppositeBatch));
}

function renderBatchOptionsForSelect(select, role, row) {
  if (!select) return;

  const selectedBatchId = row?.cut_batch_id || '';
  const oppositeRole = role === 'cathode' ? 'anode' : 'cathode';
  const siblingSelectedBatchIds = getSiblingSelectedSourceBatchIds(role, row);

  select.innerHTML = '<option value="">— выбрать партию —</option>';

  sortElectrodeCutBatches(
    (row?.tape_id ? getRoleBatchReference(role) : getUnfilteredCompatibleBatchReference(role)).filter(batch => (
      (!row?.tape_id || String(batch.tape_id) === String(row.tape_id)) &&
      (!batch.tape_role || batch.tape_role === role) &&
      (
        String(batch.cut_batch_id) === String(selectedBatchId) ||
        !siblingSelectedBatchIds.has(String(batch.cut_batch_id))
      ) &&
      (
        batchMatchesProjectFilter(batch) ||
        String(batch.cut_batch_id) === String(selectedBatchId)
      )
    )),
    { selectedBatchId }
  ).forEach(batch => {
    const option = document.createElement('option');
    option.value = batch.cut_batch_id;

    const hasOverlap = hasBatchProjectOverlapWithRole(batch, oppositeRole);
    option.disabled = !hasOverlap && String(batch.cut_batch_id) !== String(selectedBatchId);
    option.textContent = hasOverlap
      ? formatElectrodeBatchOptionLabel(batch)
      : `${formatElectrodeBatchOptionLabel(batch)} | нет общего проекта`;

    select.appendChild(option);
  });

  ensureSelectOption(
    select,
    selectedBatchId,
    selectedBatchId ? `#${selectedBatchId} | сохранённая партия` : ''
  );
  select.value = selectedBatchId || '';
}

function createAdditionalSourceRowElement(role, row, index) {
  const rowEl = document.createElement('div');
  rowEl.className = 'electrode-source-extra-row';
  rowEl.dataset.sourceRowRole = role;
  rowEl.dataset.sourceRowIndex = String(index + 1);

  const header = document.createElement('div');
  header.className = 'electrode-source-extra-row__header';

  const title = document.createElement('span');
  title.className = 'electrode-source-extra-row__title';
  title.textContent = `${role === 'cathode' ? 'Катодная' : 'Анодная'} партия ${index + 2}`;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'secondary electrode-source-remove-btn';
  removeBtn.textContent = 'Удалить';
  removeBtn.title = 'Удалить источник';
  removeBtn.dataset.sourceRemoveRole = role;
  removeBtn.dataset.sourceRemoveIndex = String(index + 1);

  header.appendChild(title);
  header.appendChild(removeBtn);
  rowEl.appendChild(header);

  const tapeLabel = document.createElement('label');
  const tapeSelectId = `${role}_tape_id_extra_${index + 1}`;
  tapeLabel.setAttribute('for', tapeSelectId);
  tapeLabel.textContent = role === 'cathode' ? 'Катодная лента' : 'Анодная лента';

  const tapeSelect = document.createElement('select');
  tapeSelect.id = tapeSelectId;
  tapeSelect.dataset.sourceField = 'tape_id';
  tapeSelect.dataset.sourceRole = role;
  tapeSelect.dataset.sourceIndex = String(index + 1);
  renderTapeOptionsForSelect(tapeSelect, role, row.tape_id);

  const batchLabel = document.createElement('label');
  const batchSelectId = `${role}_cut_batch_id_extra_${index + 1}`;
  batchLabel.setAttribute('for', batchSelectId);
  batchLabel.textContent = 'Партия вырезанных электродов';

  const batchSelect = document.createElement('select');
  batchSelect.id = batchSelectId;
  batchSelect.dataset.sourceField = 'cut_batch_id';
  batchSelect.dataset.sourceRole = role;
  batchSelect.dataset.sourceIndex = String(index + 1);
  renderBatchOptionsForSelect(batchSelect, role, row);

  const notesLabel = document.createElement('label');
  const notesId = `${role}_source_notes_extra_${index + 1}`;
  notesLabel.setAttribute('for', notesId);
  notesLabel.textContent = 'Заметки';

  const notesInput = document.createElement('textarea');
  notesInput.id = notesId;
  notesInput.dataset.sourceField = 'source_notes';
  notesInput.dataset.sourceRole = role;
  notesInput.dataset.sourceIndex = String(index + 1);
  notesInput.placeholder = role === 'cathode'
    ? 'Комментарии по катодной партии'
    : 'Комментарии по анодной партии';
  notesInput.value = row.source_notes || '';

  rowEl.appendChild(tapeLabel);
  rowEl.appendChild(tapeSelect);
  rowEl.appendChild(document.createElement('br'));
  rowEl.appendChild(batchLabel);
  rowEl.appendChild(batchSelect);
  rowEl.appendChild(document.createElement('br'));
  rowEl.appendChild(notesLabel);
  rowEl.appendChild(notesInput);

  return rowEl;
}

function renderAdditionalSourceRows(role) {
  const container = document.getElementById(`${role}_additional_sources`);
  const addBtn = document.getElementById(`add_${role}_source_btn`);
  const rows = getElectrodeSourceRows(role);
  const additionalRows = rows.slice(1);
  const canAdd = canUseMultipleElectrodeSources() && !isBatteryIdentityLocked();

  if (container) {
    container.innerHTML = '';
    additionalRows.forEach((row, index) => {
      container.appendChild(createAdditionalSourceRowElement(role, row, index));
    });
  }

  if (addBtn) {
    addBtn.hidden = !canAdd;
    addBtn.disabled = !canAdd;
  }
}

function renderElectrodeSourcesForm() {
  const fieldset = document.getElementById('battery_electrode_sources');
  populateFieldset(fieldset, state.electrodeSources);
  renderAdditionalSourceRows('cathode');
  renderAdditionalSourceRows('anode');
}

function ensureBatchMismatchWarning(selectId, warningId) {
  const select = document.getElementById(selectId);

  if (!select) return null;

  let warning = document.getElementById(warningId);

  if (warning) return warning;

  warning = document.createElement('div');
  warning.id = warningId;
  warning.style.color = '#8a5a00';
  warning.style.fontSize = '0.92em';
  warning.style.marginTop = '4px';
  warning.hidden = true;
  select.insertAdjacentElement('afterend', warning);
  return warning;
}

function renderBatchCompatibilityWarnings() {
  const cathodeWarning = ensureBatchMismatchWarning(
    'cathode_cut_batch_id',
    'cathode_cut_batch_warning'
  );
  const anodeWarning = ensureBatchMismatchWarning(
    'anode_cut_batch_id',
    'anode_cut_batch_warning'
  );

  const cathodeBatch = state.reference.cathodeBatches.find(
    batch => String(batch.cut_batch_id) === String(getPrimaryElectrodeSource('cathode')?.cut_batch_id || '')
  );
  const anodeBatch = state.reference.anodeBatches.find(
    batch => String(batch.cut_batch_id) === String(getPrimaryElectrodeSource('anode')?.cut_batch_id || '')
  );

  if (cathodeWarning) {
    const isMismatch =
      Boolean(getPrimaryElectrodeSource('cathode')?.cut_batch_id) &&
      cathodeBatch &&
      cathodeBatch.is_compatibility_match === false;

    cathodeWarning.hidden = !isMismatch;
    cathodeWarning.textContent = isMismatch
      ? 'Сохранённая партия сохранена в списке для истории, но не соответствует текущей конфигурации элемента.'
      : '';
  }

  if (anodeWarning) {
    const isMismatch =
      Boolean(getPrimaryElectrodeSource('anode')?.cut_batch_id) &&
      anodeBatch &&
      anodeBatch.is_compatibility_match === false;

    anodeWarning.hidden = !isMismatch;
    anodeWarning.textContent = isMismatch
      ? 'Сохранённая партия сохранена в списке для истории, но не соответствует текущей конфигурации элемента.'
      : '';
  }

  const sidednessEl = document.getElementById('battery_electrode_sidedness_display');
  if (sidednessEl) {
    const sidedness = deriveSelectedBatterySidedness();
    const label = formatElectrodesSidednessLabel(sidedness);
    sidednessEl.textContent = label ? `Тип электродов: ${label}` : '';
    sidednessEl.hidden = !label;
  }
}

function toFiniteBatteryNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatBatteryCapacity(value, digits = 3) {
  const num = toFiniteBatteryNumber(value);
  return Number.isFinite(num) ? `${num.toFixed(digits)} мАч` : '—';
}

function renderBatteryElectrodeCapacityCell(row) {
  const cell = document.createElement('td');
  cell.className = 'battery-electrode-capacity-cell';
  cell.title = 'Расчётная ёмкость по фактически введённой массе и составу; не измерение после циклирования.';

  const primary = document.createElement('div');
  primary.className = 'battery-electrode-capacity-primary';
  primary.textContent = formatBatteryCapacity(row?.capacity_actual_mAh);
  cell.appendChild(primary);

  const theoreticalCapacity = toFiniteBatteryNumber(row?.capacity_theoretical_mAh);
  if (Number.isFinite(theoreticalCapacity)) {
    const secondary = document.createElement('div');
    secondary.className = 'battery-electrode-capacity-secondary';
    secondary.textContent = `по рецепту: ${formatBatteryCapacity(theoreticalCapacity)}`;
    cell.appendChild(secondary);
  }

  return cell;
}

function formatBatteryArea(value, digits = 3) {
  const num = toFiniteBatteryNumber(value);
  return Number.isFinite(num) ? `${num.toFixed(digits)} см²` : '—';
}

function formatBatteryArealCapacity(value, digits = 3) {
  const num = toFiniteBatteryNumber(value);
  return Number.isFinite(num) ? `${num.toFixed(digits)} мАч/см²` : '—';
}

function formatBatteryElectrolyteRatio(value, digits = 3) {
  const num = toFiniteBatteryNumber(value);
  return Number.isFinite(num) ? `${num.toFixed(digits)} мкл/мАч` : '—';
}

function formatBatteryRatio(value, digits = 3) {
  const num = toFiniteBatteryNumber(value);
  return Number.isFinite(num) ? num.toFixed(digits) : '—';
}

function formatBatteryCapacityDelta(value, digits = 3) {
  const num = toFiniteBatteryNumber(value);
  if (!Number.isFinite(num)) return '—';
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(digits)} мАч`;
}

function sumFiniteBatteryValues(values) {
  const numeric = (Array.isArray(values) ? values : []).filter((value) => Number.isFinite(value));
  if (!numeric.length) return null;
  return numeric.reduce((sum, value) => sum + value, 0);
}

function getBatteryCapacityTotalStatus(rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  if (!sourceRows.length) {
    return { total: 0, missingCount: 0, hasRows: false, isComplete: true };
  }

  let total = 0;
  let missingCount = 0;

  sourceRows.forEach((row) => {
    const capacity = toFiniteBatteryNumber(row?.capacity_actual_mAh);
    if (Number.isFinite(capacity) && capacity > 0) {
      total += capacity;
    } else {
      missingCount += 1;
    }
  });

  return {
    total,
    missingCount,
    hasRows: true,
    isComplete: missingCount === 0
  };
}

function getBatteryElectrodeAreaCm2(row) {
  const directArea = toFiniteBatteryNumber(row?.electrode_area_cm2);
  if (Number.isFinite(directArea) && directArea > 0) return directArea;

  const actualCapacity = toFiniteBatteryNumber(row?.capacity_actual_mAh);
  const actualAreal = toFiniteBatteryNumber(row?.areal_capacity_actual_mAh_cm2);
  if (Number.isFinite(actualCapacity) && actualCapacity > 0 && Number.isFinite(actualAreal) && actualAreal > 0) {
    return actualCapacity / actualAreal;
  }

  const theoreticalCapacity = toFiniteBatteryNumber(row?.capacity_theoretical_mAh);
  const theoreticalAreal = toFiniteBatteryNumber(row?.areal_capacity_theoretical_mAh_cm2);
  if (
    Number.isFinite(theoreticalCapacity) &&
    theoreticalCapacity > 0 &&
    Number.isFinite(theoreticalAreal) &&
    theoreticalAreal > 0
  ) {
    return theoreticalCapacity / theoreticalAreal;
  }

  return null;
}

function sumBatteryElectrodeAreasCm2(rows) {
  return sumFiniteBatteryValues(
    (Array.isArray(rows) ? rows : []).map((row) => getBatteryElectrodeAreaCm2(row))
  );
}

function calculateBatteryArealCapacity(capacity, area) {
  return Number.isFinite(capacity) && capacity > 0 && Number.isFinite(area) && area > 0
    ? capacity / area
    : null;
}

function pickBatteryLimitingArea({ cathodeCapacity, cathodeArea, anodeCapacity, anodeArea }) {
  if (
    Number.isFinite(cathodeCapacity) &&
    Number.isFinite(anodeCapacity) &&
    Number.isFinite(cathodeArea) &&
    Number.isFinite(anodeArea)
  ) {
    return cathodeCapacity <= anodeCapacity ? cathodeArea : anodeArea;
  }

  if (Number.isFinite(cathodeCapacity) && Number.isFinite(cathodeArea)) return cathodeArea;
  if (Number.isFinite(anodeCapacity) && Number.isFinite(anodeArea)) return anodeArea;

  return null;
}

function getEffectiveBatterySelections() {
  const formFactor = state.meta.form_factor;
  const coinCellMode = state.config.coin?.coin_cell_mode || null;
  const halfCellType = state.config.coin?.half_cell_type || null;
  let cathodes = [...state.stack.selectedCathodes];
  let anodes = [...state.stack.selectedAnodes];

  if (formFactor === 'coin' && coinCellMode === 'half_cell') {
    if (halfCellType === 'cathode_vs_li') {
      cathodes = cathodes.slice(0, 1);
      anodes = [];
    }

    if (halfCellType === 'anode_vs_li') {
      anodes = anodes.slice(0, 1);
      cathodes = [];
    }
  }

  if (formFactor === 'coin' && coinCellMode === 'full_cell') {
    cathodes = cathodes.slice(0, 1);
    anodes = anodes.slice(0, 1);
  }

  return { cathodes, anodes, formFactor, coinCellMode, halfCellType };
}

function buildBatteryCapacitySummaryFromSelections() {
  const { cathodes, anodes } = getEffectiveBatterySelections();

  const cathodeCapacityTheoretical = sumFiniteBatteryValues(
    cathodes.map((row) => toFiniteBatteryNumber(row.capacity_theoretical_mAh))
  );
  const cathodeCapacityActual = sumFiniteBatteryValues(
    cathodes.map((row) => toFiniteBatteryNumber(row.capacity_actual_mAh))
  );
  const anodeCapacityTheoretical = sumFiniteBatteryValues(
    anodes.map((row) => toFiniteBatteryNumber(row.capacity_theoretical_mAh))
  );
  const anodeCapacityActual = sumFiniteBatteryValues(
    anodes.map((row) => toFiniteBatteryNumber(row.capacity_actual_mAh))
  );
  const cathodeAreaCm2 = sumBatteryElectrodeAreasCm2(cathodes);
  const anodeAreaCm2 = sumBatteryElectrodeAreasCm2(anodes);

  const limitingCapacityTheoretical =
    Number.isFinite(cathodeCapacityTheoretical) && Number.isFinite(anodeCapacityTheoretical)
      ? Math.min(cathodeCapacityTheoretical, anodeCapacityTheoretical)
      : Number.isFinite(cathodeCapacityTheoretical)
        ? cathodeCapacityTheoretical
        : Number.isFinite(anodeCapacityTheoretical)
          ? anodeCapacityTheoretical
          : null;

  const limitingCapacityActual =
    Number.isFinite(cathodeCapacityActual) && Number.isFinite(anodeCapacityActual)
      ? Math.min(cathodeCapacityActual, anodeCapacityActual)
      : Number.isFinite(cathodeCapacityActual)
        ? cathodeCapacityActual
        : Number.isFinite(anodeCapacityActual)
          ? anodeCapacityActual
          : null;

  const npTheoretical =
    Number.isFinite(cathodeCapacityTheoretical) &&
    cathodeCapacityTheoretical > 0 &&
    Number.isFinite(anodeCapacityTheoretical)
      ? anodeCapacityTheoretical / cathodeCapacityTheoretical
      : null;

  const npActual =
    Number.isFinite(cathodeCapacityActual) &&
    cathodeCapacityActual > 0 &&
    Number.isFinite(anodeCapacityActual)
      ? anodeCapacityActual / cathodeCapacityActual
      : null;

  const cathodeArealCapacityTheoretical = calculateBatteryArealCapacity(cathodeCapacityTheoretical, cathodeAreaCm2);
  const cathodeArealCapacityActual = calculateBatteryArealCapacity(cathodeCapacityActual, cathodeAreaCm2);
  const anodeArealCapacityTheoretical = calculateBatteryArealCapacity(anodeCapacityTheoretical, anodeAreaCm2);
  const anodeArealCapacityActual = calculateBatteryArealCapacity(anodeCapacityActual, anodeAreaCm2);
  const limitingAreaTheoretical = pickBatteryLimitingArea({
    cathodeCapacity: cathodeCapacityTheoretical,
    cathodeArea: cathodeAreaCm2,
    anodeCapacity: anodeCapacityTheoretical,
    anodeArea: anodeAreaCm2
  });
  const limitingAreaActual = pickBatteryLimitingArea({
    cathodeCapacity: cathodeCapacityActual,
    cathodeArea: cathodeAreaCm2,
    anodeCapacity: anodeCapacityActual,
    anodeArea: anodeAreaCm2
  });
  const limitingArealCapacityTheoretical = calculateBatteryArealCapacity(limitingCapacityTheoretical, limitingAreaTheoretical);
  const limitingArealCapacityActual = calculateBatteryArealCapacity(limitingCapacityActual, limitingAreaActual);

  return {
    cathode_count: cathodes.length,
    anode_count: anodes.length,
    cathode_capacity_theoretical_mAh: cathodeCapacityTheoretical,
    cathode_capacity_actual_mAh: cathodeCapacityActual,
    anode_capacity_theoretical_mAh: anodeCapacityTheoretical,
    anode_capacity_actual_mAh: anodeCapacityActual,
    limiting_capacity_theoretical_mAh: limitingCapacityTheoretical,
    limiting_capacity_actual_mAh: limitingCapacityActual,
    np_theoretical: npTheoretical,
    np_actual: npActual,
    cathode_area_cm2: cathodeAreaCm2,
    anode_area_cm2: anodeAreaCm2,
    cathode_areal_capacity_theoretical_mAh_cm2: cathodeArealCapacityTheoretical,
    cathode_areal_capacity_actual_mAh_cm2: cathodeArealCapacityActual,
    anode_areal_capacity_theoretical_mAh_cm2: anodeArealCapacityTheoretical,
    anode_areal_capacity_actual_mAh_cm2: anodeArealCapacityActual,
    limiting_areal_capacity_theoretical_mAh_cm2: limitingArealCapacityTheoretical,
    limiting_areal_capacity_actual_mAh_cm2: limitingArealCapacityActual
  };
}

function shouldShowBatteryNpAssist() {
  const { formFactor, coinMode } = getStackSelectionContext();
  if (formFactor === 'coin') return coinMode === 'full_cell';
  return isMultiElectrodeFormFactor(formFactor);
}

function buildBatteryNpRecommendedAnodeSet({ targetAnodeTotal, targetAnodeCount }) {
  const prescribedCount = Number.isInteger(targetAnodeCount) ? targetAnodeCount : 0;
  const targetTotal = toFiniteBatteryNumber(targetAnodeTotal);

  if (!(prescribedCount > 0) || !(Number.isFinite(targetTotal) && targetTotal > 0)) {
    return {
      perAnodeTarget: null,
      recommendedAnodeIds: new Set(),
      recommendedAnodeTotal: null,
      isComplete: false
    };
  }

  const perAnodeTarget = targetTotal / prescribedCount;
  const availableCandidates = state.reference.anodeElectrodes
    .map((row) => ({
      row,
      electrodeId: normalizeNumberId(row?.electrode_id),
      capacity: toFiniteBatteryNumber(row?.capacity_actual_mAh)
    }))
    .filter((item) =>
      item.electrodeId !== null &&
      Number.isFinite(item.capacity) &&
      item.capacity > 0 &&
      isAvailableElectrodeStatus(item.row?.status_code)
    );

  const aboveTarget = availableCandidates
    .filter((item) => item.capacity >= perAnodeTarget)
    .sort((a, b) =>
      (a.capacity - b.capacity) ||
      ((a.electrodeId ?? 0) - (b.electrodeId ?? 0))
    );
  const belowTarget = availableCandidates
    .filter((item) => item.capacity < perAnodeTarget)
    .sort((a, b) =>
      (b.capacity - a.capacity) ||
      ((a.electrodeId ?? 0) - (b.electrodeId ?? 0))
    );

  const recommendedRows = [];
  [...aboveTarget, ...belowTarget].some((item) => {
    if (recommendedRows.length >= prescribedCount) return true;
    recommendedRows.push(item);
    return false;
  });

  const recommendedAnodeIds = new Set(recommendedRows.map((item) => item.electrodeId));
  const recommendedAnodeTotal = recommendedRows.length
    ? recommendedRows.reduce((sum, item) => sum + item.capacity, 0)
    : null;

  return {
    perAnodeTarget,
    recommendedAnodeIds,
    recommendedAnodeTotal,
    isComplete: recommendedRows.length === prescribedCount
  };
}

function getBatteryNpAssistContext() {
  const { cathodes, anodes } = getEffectiveBatterySelections();
  const cathodeStatus = getBatteryCapacityTotalStatus(cathodes);
  const excessPercent = toFiniteBatteryNumber(state.stack.targetAnodeExcessPercent);
  const hasTarget = Number.isFinite(excessPercent) && excessPercent >= 0;
  const targetRatio = hasTarget ? 1 + (excessPercent / 100) : null;
  const canCalculateTarget =
    shouldShowBatteryNpAssist() &&
    hasTarget &&
    cathodeStatus.hasRows &&
    cathodeStatus.isComplete &&
    cathodeStatus.total > 0;
  const targetAnodeTotal = canCalculateTarget ? cathodeStatus.total * targetRatio : null;
  const targets = getStackTargetCounts();

  const context = {
    cathodes,
    anodes,
    cathodeStatus,
    excessPercent,
    hasTarget,
    targetRatio,
    canCalculateTarget,
    targetAnodeTotal,
    targets,
    perAnodeTarget: null,
    recommendedAnodeIds: new Set(),
    recommendedAnodeTotal: null,
    recommendedAnodeSetComplete: false
  };

  if (canCalculateTarget && targets.valid) {
    const recommendedSet = buildBatteryNpRecommendedAnodeSet({
      targetAnodeTotal,
      targetAnodeCount: targets.anodes
    });

    context.perAnodeTarget = recommendedSet.perAnodeTarget;
    context.recommendedAnodeIds = recommendedSet.recommendedAnodeIds;
    context.recommendedAnodeTotal = recommendedSet.recommendedAnodeTotal;
    context.recommendedAnodeSetComplete = recommendedSet.isComplete;
  }

  return context;
}

function renderBatteryNpDeltaCell() {
  const cell = document.createElement('td');
  cell.className = 'battery-np-delta-cell';
  return cell;
}

function setBatteryNpGuidanceCell(cell, primaryText, secondaryText = '', extraClass = '') {
  cell.classList.toggle('battery-np-best-label', extraClass === 'best');
  cell.replaceChildren();

  const primary = document.createElement('div');
  primary.className = 'battery-np-guidance-primary';
  primary.textContent = primaryText;
  cell.appendChild(primary);

  if (secondaryText) {
    const secondary = document.createElement('div');
    secondary.className = 'battery-np-guidance-secondary';
    secondary.textContent = secondaryText;
    cell.appendChild(secondary);
  }
}

let batteryNpFeedbackTimer = null;

function setBatteryNpSelectionFeedback(message = '') {
  const feedback = document.getElementById('battery_np_select_feedback');
  if (!feedback) return;

  feedback.textContent = message;

  if (batteryNpFeedbackTimer) {
    clearTimeout(batteryNpFeedbackTimer);
    batteryNpFeedbackTimer = null;
  }

  if (message) {
    batteryNpFeedbackTimer = setTimeout(() => {
      feedback.textContent = '';
      batteryNpFeedbackTimer = null;
    }, 2500);
  }
}

function renderAnodeNpGuidance() {
  const context = getBatteryNpAssistContext();
  const selectedIds = context.anodes.map((row) => normalizeNumberId(row.electrode_id));

  document.querySelectorAll('[data-anode-electrode-row="true"]').forEach((rowEl) => {
    const electrodeId = normalizeNumberId(rowEl.dataset.electrodeId);
    const electrode = state.reference.anodeElectrodes.find((row) => idsMatch(row.electrode_id, electrodeId));
    const deltaCell = rowEl.querySelector('.battery-np-delta-cell');
    const isSelected = idListIncludes(selectedIds, electrodeId);
    const isRecommended = electrodeId !== null && context.recommendedAnodeIds.has(electrodeId);

    rowEl.classList.toggle('battery-np-best-candidate', isRecommended);

    if (!deltaCell) return;

    if (!shouldShowBatteryNpAssist()) {
      setBatteryNpGuidanceCell(deltaCell, '—');
      return;
    }

    if (!context.hasTarget) {
      setBatteryNpGuidanceCell(deltaCell, '—');
      return;
    }

    if (!context.canCalculateTarget) {
      setBatteryNpGuidanceCell(deltaCell, '—');
      return;
    }

    const capacity = toFiniteBatteryNumber(electrode?.capacity_actual_mAh);
    if (!(Number.isFinite(capacity) && capacity > 0) || !Number.isFinite(context.perAnodeTarget)) {
      setBatteryNpGuidanceCell(deltaCell, '—');
      return;
    }

    const delta = capacity - context.perAnodeTarget;
    const note = isRecommended
      ? (isSelected ? 'предложен, выбран' : 'предложен')
      : (isSelected ? 'выбран' : '');
    setBatteryNpGuidanceCell(
      deltaCell,
      formatBatteryCapacityDelta(delta),
      note,
      isRecommended ? 'best' : ''
    );
  });
}

function renderBatteryNpAssist() {
  const root = document.getElementById('battery_np_assist');
  const targetLabel = document.getElementById('battery_np_target_label');
  const summaryRoot = document.getElementById('battery_np_summary');
  const selectSuggestedBtn = document.getElementById('battery_np_select_suggested_btn');

  if (!root || !targetLabel || !summaryRoot) return;

  const shouldShow = Boolean(state.selection.currentBatteryId) && shouldShowBatteryNpAssist();
  root.hidden = !shouldShow;

  if (!shouldShow) {
    targetLabel.textContent = '';
    summaryRoot.innerHTML = '';
    if (selectSuggestedBtn) selectSuggestedBtn.disabled = true;
    setBatteryNpSelectionFeedback('');
    return;
  }

  const context = getBatteryNpAssistContext();
  const canSelectSuggested =
    context.recommendedAnodeSetComplete &&
    isBatteryStackInteractable() &&
    !state.stack.readOnly;

  if (selectSuggestedBtn) {
    selectSuggestedBtn.disabled = !canSelectSuggested;
  }

  if (!context.hasTarget) {
    targetLabel.textContent = 'Введите избыток, чтобы рассчитать целевую ёмкость анодов.';
    summaryRoot.innerHTML = '<span>Выберите катоды вручную, затем задайте избыток анода для подсказок по анодам.</span>';
    setBatteryNpSelectionFeedback('');
    return;
  }

  targetLabel.textContent = `Целевой N/P: ${formatBatteryRatio(context.targetRatio)}`;

  if (!context.cathodeStatus.hasRows) {
    summaryRoot.innerHTML = '<span>Выберите катоды, чтобы рассчитать целевую суммарную ёмкость анодов.</span>';
    setBatteryNpSelectionFeedback('');
    return;
  }

  if (!context.cathodeStatus.isComplete || !(context.cathodeStatus.total > 0)) {
    summaryRoot.innerHTML = '<span>Для выбранных катодов не хватает расчётной ёмкости.</span>';
    setBatteryNpSelectionFeedback('');
    return;
  }

  const perAnodeTargetText = Number.isFinite(context.perAnodeTarget)
    ? formatBatteryCapacity(context.perAnodeTarget)
    : '—';
  const recommendedSetText = context.recommendedAnodeSetComplete
    ? formatBatteryCapacity(context.recommendedAnodeTotal)
    : 'недостаточно подходящих анодов';

  summaryRoot.innerHTML = `
    <div class="battery-np-summary-grid">
      <div class="battery-np-summary-item">
        <span>Катоды</span>
        <strong>${escapeHtml(`${context.cathodes.length} / ${context.targets.cathodes || '—'}`)}</strong>
      </div>
      <div class="battery-np-summary-item">
        <span>Σ катодов</span>
        <strong>${escapeHtml(formatBatteryCapacity(context.cathodeStatus.total))}</strong>
      </div>
      <div class="battery-np-summary-item">
        <span>Цель Σ анодов</span>
        <strong>${escapeHtml(formatBatteryCapacity(context.targetAnodeTotal))}</strong>
      </div>
      <div class="battery-np-summary-item">
        <span>Цель на 1 анод</span>
        <strong>${escapeHtml(perAnodeTargetText)}</strong>
      </div>
      <div class="battery-np-summary-item">
        <span>Рекоменд. набор</span>
        <strong>${escapeHtml(recommendedSetText)}</strong>
      </div>
    </div>
    <div class="battery-np-warning">Предложенные аноды подсвечены в таблице. Δ показывает ёмкость анода относительно цели на один анод.</div>
  `;
}

function selectBatteryNpSuggestedAnodes() {
  const context = getBatteryNpAssistContext();
  if (
    !context.recommendedAnodeSetComplete ||
    !isBatteryStackInteractable() ||
    state.stack.readOnly
  ) {
    return;
  }

  const recommendedIds = Array.from(context.recommendedAnodeIds);
  const recommendedAnodes = recommendedIds
    .map((electrodeId) =>
      state.reference.anodeElectrodes.find((row) => idsMatch(row.electrode_id, electrodeId))
    )
    .filter(Boolean);

  if (!recommendedAnodes.length) return;

  setSelectedAnodes(recommendedAnodes);
  renderStackSummary();
  renderStackUiState();
  updateDirtyFlags();
  setBatteryNpSelectionFeedback('Аноды выбраны');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderBatteryCapacityMetric(label, primary, secondary, title = '') {
  return `
    <div class="battery-capacity-item">
      <span class="battery-capacity-label"${title ? ` title="${escapeHtml(title)}"` : ''}>${escapeHtml(label)}</span>
      <span class="battery-capacity-primary">${escapeHtml(primary)}</span>
      <span class="battery-capacity-secondary">${escapeHtml(secondary)}</span>
    </div>
  `;
}

function hasPositiveBatteryValue(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0;
}

function renderBatteryCapacityNestedList(lines) {
  const safeLines = lines.filter(Boolean);
  if (!safeLines.length) return '';

  return `
    <ul>
      ${safeLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
    </ul>
  `;
}

function renderBatteryCapacityFormulaLine(formula) {
  return `<li><span class="battery-capacity-formula">${escapeHtml(formula)}</span></li>`;
}

function renderBatteryCapacityStep(title, bodyHtml) {
  if (!bodyHtml) return '';

  return `
    <li>
      <strong>${escapeHtml(title)}</strong>
      ${bodyHtml}
    </li>
  `;
}

function getBatteryElectrodeSideCount(row) {
  const directSideCount = toFiniteBatteryNumber(row?.side_count);
  if (Number.isFinite(directSideCount) && directSideCount > 0) return directSideCount;

  return row?.coating_sidedness === 'two_sided' ? 2 : 1;
}

function getBatteryGroupSideCount(rows) {
  const sideCounts = (Array.isArray(rows) ? rows : [])
    .map(getBatteryElectrodeSideCount)
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!sideCounts.length) return 1;
  return Math.max(...sideCounts);
}

function describeBatteryElectrodeSidedness(sideCount) {
  return sideCount > 1 ? 'двусторонние' : 'односторонние';
}

function getBatteryLimitingRole(summary, cathodes, anodes) {
  if (
    cathodes.length &&
    anodes.length &&
    hasPositiveBatteryValue(summary.cathode_capacity_actual_mAh) &&
    hasPositiveBatteryValue(summary.anode_capacity_actual_mAh)
  ) {
    return summary.cathode_capacity_actual_mAh <= summary.anode_capacity_actual_mAh ? 'cathode' : 'anode';
  }

  if (cathodes.length && hasPositiveBatteryValue(summary.cathode_capacity_actual_mAh)) return 'cathode';
  if (anodes.length && hasPositiveBatteryValue(summary.anode_capacity_actual_mAh)) return 'anode';
  return null;
}

function renderElectrodeGroupCapacityStep(label, rows, capacity, recipeCapacity, area, arealCapacity) {
  if (!rows.length || !hasPositiveBatteryValue(capacity)) return '';

  const sideCount = getBatteryGroupSideCount(rows);
  const sidednessText = describeBatteryElectrodeSidedness(sideCount);
  const areaText = hasPositiveBatteryValue(area) ? formatBatteryArea(area) : '—';
  const arealText = hasPositiveBatteryValue(arealCapacity) ? formatBatteryArealCapacity(arealCapacity) : '—';
  const perElectrodeCapacity = capacity / rows.length;
  const perElectrodeCapacityText = formatBatteryCapacity(perElectrodeCapacity);
  const perSideCapacity = sideCount > 1 ? perElectrodeCapacity / sideCount : null;
  const perSideArealCapacity = sideCount > 1 && hasPositiveBatteryValue(arealCapacity)
    ? arealCapacity / sideCount
    : null;
  const lines = [
    `Выбрано электродов: ${rows.length}; тип покрытия: ${sidednessText}.`,
    `Расчётная ёмкость одного электрода: ${perElectrodeCapacityText}.`
  ];

  if (hasPositiveBatteryValue(perSideCapacity)) {
    lines.push(`Расчётная ёмкость одной стороны одного электрода: ${formatBatteryCapacity(perSideCapacity)} = ${perElectrodeCapacityText} / ${sideCount}.`);
  }

  lines.push(`Суммарная расчётная ёмкость выбранных электродов: ${formatBatteryCapacity(capacity)}.`);

  if (hasPositiveBatteryValue(recipeCapacity)) {
    lines.push(`Суммарная ёмкость по рецепту: ${formatBatteryCapacity(recipeCapacity)}.`);
  }

  if (hasPositiveBatteryValue(area)) {
    lines.push(`Суммарная геометрическая площадь выбранных электродов: ${areaText}.`);
  }

  if (hasPositiveBatteryValue(area) && hasPositiveBatteryValue(arealCapacity)) {
    lines.push(`Ёмкость на площадь электрода: ${arealText} = ${formatBatteryCapacity(capacity)} / ${areaText}.`);
  }

  if (hasPositiveBatteryValue(perSideArealCapacity)) {
    lines.push(`Ёмкость на площадь одной стороны: ${formatBatteryArealCapacity(perSideArealCapacity)} = ${arealText} / ${sideCount}.`);
  }

  return renderBatteryCapacityStep(label, renderBatteryCapacityNestedList(lines));
}

function renderBatteryCapacityDetails(summary, cathodes, anodes) {
  const steps = [
    renderBatteryCapacityStep(
      'Ёмкость одного электрода',
      `
        <ul>
          ${renderBatteryCapacityFormulaLine('масса покрытия = масса электрода − средняя масса фольги')}
          ${renderBatteryCapacityFormulaLine('масса активного материала = масса покрытия × массовая доля активного материала')}
          ${renderBatteryCapacityFormulaLine('ёмкость электрода = масса активного материала × удельная ёмкость активного материала')}
          ${renderBatteryCapacityFormulaLine('ёмкость на площадь = ёмкость электрода / геометрическая площадь электрода')}
          ${renderBatteryCapacityFormulaLine('для двустороннего покрытия: ёмкость на площадь одной стороны = ёмкость на площадь электрода / 2')}
          <li>${escapeHtml('Это расчётная ёмкость из масс электродов, а не измеренная ёмкость после циклирования.')}</li>
        </ul>
      `
    ),
    renderElectrodeGroupCapacityStep(
      'Катоды',
      cathodes,
      summary.cathode_capacity_actual_mAh,
      summary.cathode_capacity_theoretical_mAh,
      summary.cathode_area_cm2,
      summary.cathode_areal_capacity_actual_mAh_cm2
    ),
    renderElectrodeGroupCapacityStep(
      'Аноды',
      anodes,
      summary.anode_capacity_actual_mAh,
      summary.anode_capacity_theoretical_mAh,
      summary.anode_area_cm2,
      summary.anode_areal_capacity_actual_mAh_cm2
    )
  ].filter(Boolean);

  const stackLines = [];
  if (
    cathodes.length &&
    anodes.length &&
    hasPositiveBatteryValue(summary.cathode_capacity_actual_mAh) &&
    hasPositiveBatteryValue(summary.anode_capacity_actual_mAh)
  ) {
    const limitingRole = getBatteryLimitingRole(summary, cathodes, anodes);
    const limitingLabel = limitingRole === 'cathode' ? 'катоды' : 'аноды';
    const limitingArea = limitingRole === 'cathode' ? summary.cathode_area_cm2 : summary.anode_area_cm2;
    stackLines.push(`Расчётная лимитирующая ёмкость: ${formatBatteryCapacity(summary.limiting_capacity_actual_mAh)} = меньшее из суммарной расчётной ёмкости катодов и анодов; в этом стеке ограничивают ${limitingLabel}.`);
    if (hasPositiveBatteryValue(summary.np_actual)) {
      stackLines.push(`N/P: ${formatBatteryRatio(summary.np_actual)} = суммарная расчётная ёмкость анодов / суммарная расчётная ёмкость катодов.`);
    }
    if (hasPositiveBatteryValue(summary.limiting_areal_capacity_actual_mAh_cm2) && hasPositiveBatteryValue(limitingArea)) {
      stackLines.push(`Лимитирующая ёмкость на площадь: ${formatBatteryArealCapacity(summary.limiting_areal_capacity_actual_mAh_cm2)} = ${formatBatteryCapacity(summary.limiting_capacity_actual_mAh)} / ${formatBatteryArea(limitingArea)}.`);
    }
  } else if (hasPositiveBatteryValue(summary.limiting_capacity_actual_mAh)) {
    const limitingRole = getBatteryLimitingRole(summary, cathodes, anodes);
    const limitingArea = limitingRole === 'cathode' ? summary.cathode_area_cm2 : summary.anode_area_cm2;
    stackLines.push(`Расчётная лимитирующая ёмкость: ${formatBatteryCapacity(summary.limiting_capacity_actual_mAh)} = расчётная ёмкость выбранной стороны.`);
    if (hasPositiveBatteryValue(summary.limiting_areal_capacity_actual_mAh_cm2) && hasPositiveBatteryValue(limitingArea)) {
      stackLines.push(`Лимитирующая ёмкость на площадь: ${formatBatteryArealCapacity(summary.limiting_areal_capacity_actual_mAh_cm2)} = ${formatBatteryCapacity(summary.limiting_capacity_actual_mAh)} / ${formatBatteryArea(limitingArea)}.`);
    }
  }

  if (stackLines.length) {
    steps.push(renderBatteryCapacityStep('Итог для стека', renderBatteryCapacityNestedList(stackLines)));
  }

  if (!steps.length) return '';

  return `
    <details class="battery-capacity-details">
      <summary>Показать расчёт</summary>
      <ol>
        ${steps.join('')}
      </ol>
    </details>
  `;
}

function renderBatteryCapacitySummary() {
  const root = document.getElementById('battery_capacity_summary');
  if (!root) return;

  const summary = buildBatteryCapacitySummaryFromSelections();
  const { cathodes, anodes } = getEffectiveBatterySelections();
  const hasAnySelection = cathodes.length > 0 || anodes.length > 0;
  const hasAnyCapacity =
    Number.isFinite(summary.cathode_capacity_theoretical_mAh) ||
    Number.isFinite(summary.cathode_capacity_actual_mAh) ||
    Number.isFinite(summary.anode_capacity_theoretical_mAh) ||
    Number.isFinite(summary.anode_capacity_actual_mAh);

  if (!hasAnySelection) {
    root.hidden = true;
    root.innerHTML = '';
    renderElectrolyteCapacityRatios();
    return;
  }

  if (!hasAnyCapacity) {
    root.innerHTML = `
      <div class="battery-capacity-grid">
        <div class="battery-capacity-item">
          <span class="battery-capacity-label">Электрохимическая сводка</span>
          <span class="battery-capacity-primary">Недостаточно данных для расчёта</span>
          <span class="battery-capacity-secondary">Проверьте, что для исходных партий рассчитана ёмкость электродов.</span>
        </div>
      </div>
    `;
    root.hidden = false;
    renderElectrolyteCapacityRatios();
    return;
  }

  const metricCards = [];

  if (hasPositiveBatteryValue(summary.limiting_capacity_actual_mAh)) {
    metricCards.push(renderBatteryCapacityMetric(
      'Расчётная ёмкость',
      formatBatteryCapacity(summary.limiting_capacity_actual_mAh),
      `по рецепту: ${formatBatteryCapacity(summary.limiting_capacity_theoretical_mAh)}`,
      'Расчёт по фактически введённым массам электродов. Это не измеренная ёмкость после циклирования.'
    ));
  }

  if (hasPositiveBatteryValue(summary.limiting_areal_capacity_actual_mAh_cm2)) {
    metricCards.push(renderBatteryCapacityMetric(
      'На площадь',
      formatBatteryArealCapacity(summary.limiting_areal_capacity_actual_mAh_cm2),
      `по рецепту: ${formatBatteryArealCapacity(summary.limiting_areal_capacity_theoretical_mAh_cm2)}`,
      'Расчётная лимитирующая ёмкость по фактической массе/составу, нормированная на площадь лимитирующих электродов.'
    ));
  }

  if (cathodes.length && anodes.length && hasPositiveBatteryValue(summary.np_actual)) {
    metricCards.push(renderBatteryCapacityMetric(
      'N/P',
      formatBatteryRatio(summary.np_actual),
      `по рецепту: ${formatBatteryRatio(summary.np_theoretical)}`,
      'N/P по расчётной ёмкости из фактически введённых масс электродов. Вторичная строка — расчётное отношение по рецепту.'
    ));
  }

  root.innerHTML = `
    <div class="battery-capacity-grid">
      ${metricCards.join('')}
    </div>
    ${renderBatteryCapacityDetails(summary, cathodes, anodes)}
  `;
  root.hidden = false;
  renderElectrolyteCapacityRatios();
}

function renderElectrolyteCapacityRatio({ targetId, assemblyState, summary }) {
  const target = document.getElementById(targetId);
  if (!target) return;

  const electrolyteVolume = toFiniteBatteryNumber(assemblyState?.electrolyte_total_ul);
  if (!(Number.isFinite(electrolyteVolume) && electrolyteVolume > 0)) {
    target.hidden = true;
    target.textContent = '';
    return;
  }

  const actualCapacity = toFiniteBatteryNumber(summary?.limiting_capacity_actual_mAh);
  const theoreticalCapacity = toFiniteBatteryNumber(summary?.limiting_capacity_theoretical_mAh);
  const actualRatio =
    Number.isFinite(actualCapacity) && actualCapacity > 0
      ? electrolyteVolume / actualCapacity
      : null;
  const theoreticalRatio =
    Number.isFinite(theoreticalCapacity) && theoreticalCapacity > 0
      ? electrolyteVolume / theoreticalCapacity
      : null;

  const secondary = Number.isFinite(theoreticalRatio)
    ? `; по рецепту: ${formatBatteryElectrolyteRatio(theoreticalRatio)}`
    : '';

  target.textContent = `Электролит / расчётная ёмкость: по факт. массе ${formatBatteryElectrolyteRatio(actualRatio)}${secondary}`;
  target.hidden = false;
}

function renderElectrolyteCapacityRatios() {
  const summary = buildBatteryCapacitySummaryFromSelections();

  renderElectrolyteCapacityRatio({
    targetId: 'coin_electrolyte_capacity_ratio',
    assemblyState: state.assembly.coin,
    summary
  });
  renderElectrolyteCapacityRatio({
    targetId: 'pouch_electrolyte_capacity_ratio',
    assemblyState: state.assembly.pouch,
    summary
  });
  renderElectrolyteCapacityRatio({
    targetId: 'cyl_electrolyte_capacity_ratio',
    assemblyState: state.assembly.cylindrical,
    summary
  });
}

function renderAssemblyForm() {
  populateFieldset(document.getElementById('coin_assembly'), state.assembly.coin);
  populateFieldset(document.getElementById('pouch_assembly'), state.assembly.pouch);
  populateFieldset(document.getElementById('cyl_assembly'), state.assembly.cylindrical);
  renderElectrolyteCapacityRatios();
}

function renderQcForm() {
  populateFieldset(document.getElementById('battery_qc'), state.qc);
}

function renderElectrochemForm() {
  const notesInput = document.getElementById('electrochem_notes');
  const filesInput = document.getElementById('electrochem_files');

  if (notesInput) {
    notesInput.value = state.electrochem.notes ?? '';
  }

  if (filesInput && !state.ui.isRestoringBattery) {
    filesInput.value = state.electrochem.files ?? '';
  }

  renderElectrochemSavedFiles(state.electrochem.savedEntries);
  updateBatteryElectrochemFilesButtonVisibility();
}

function renderBatteryPage() {
  renderBatteriesList();
  renderTapeOptions();
  renderCathodeBatchOptions();
  renderAnodeBatchOptions();

  renderMetaForm();
  renderConfigForm();
  renderElectrodeSourcesForm();
  renderBatteryProjectMultiSelect();
  renderBatchCompatibilityWarnings();
  renderAssemblyForm();
  renderQcForm();
  renderElectrochemForm();

  renderFormFactorSections();
  renderCoinCellModeUi();
  renderHalfCellTypeUi();
  renderStackTables();
  renderBatteryCapacitySummary();
  renderBatteryWorkspaceVisibility();
  renderBatteryDeleteFlow();
  renderBatteryHeader();
  renderBatteryCreateButton();
  renderBatteryStatusControl();
  renderWorkflowProgressionState();
  updateDirtyFlags();
  renderStackUiState();
}

function applyBatteryStatusState(battery, assemblyData) {
  setLoadedAssemblyComplete(isBatteryAssemblyComplete(assemblyData));
  setCurrentBattery({
    ...(state.selection.currentBattery || {}),
    ...battery
  });
  setQcState({
    ...state.qc,
    status: battery?.status || null
  });
  renderBatteryStatusControl();
}

async function refreshBatteryStatusState() {
  if (!state.selection.currentBatteryId) return;

  const res = await fetch(`/api/batteries/${state.selection.currentBatteryId}/assembly`);

  if (!res.ok) {
    await throwBatteryResponseError(res, 'Не удалось обновить статус батареи');
  }

  const assemblyData = await res.json();
  applyBatteryStatusState(assemblyData.battery, assemblyData);
}

async function saveBatteryStatus() {
  if (!state.selection.currentBatteryId) return;

  syncQcStateFromDom();
  const status = state.qc.status || null;

  const res = await fetch(`/api/batteries/${state.selection.currentBatteryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });

  if (!res.ok) {
    await throwBatteryResponseError(res, 'Ошибка сохранения статуса батареи');
  }

  return res.json();
}

async function autoSaveAssembledStatusTransition() {
  if (!state.selection.currentBatteryId || !state.stack.loadedAssemblyComplete) {
    return false;
  }

  const currentStatus = state.selection.currentBattery?.status || null;

  if (currentStatus && currentStatus !== 'disassembled') {
    return false;
  }

  const res = await fetch(`/api/batteries/${state.selection.currentBatteryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'assembled' })
  });

  if (!res.ok) {
    await throwBatteryResponseError(res, 'Ошибка автосохранения статуса assembled');
  }

  setCurrentBattery({
    ...(state.selection.currentBattery || {}),
    status: 'assembled'
  });
  setQcState({
    ...state.qc,
    status: 'assembled'
  });

  return true;
}

const batteryInlineStatusTimers = {};
let batteryPageStatusTimer = null;

function formatBatteryDependencySummary(dependencies) {
  if (!Array.isArray(dependencies) || dependencies.length === 0) {
    return '';
  }

  return dependencies
    .map((dependency) => {
      const label = dependency.label || dependency.key || 'Связанные записи';
      const count = dependency.count ?? dependency.records?.length ?? 0;
      return `${label}: ${count}`;
    })
    .join('; ');
}

function formatBatterySaveError(err, fallback = 'Ошибка сохранения') {
  const payload = err?.responseBody || err;
  const message =
    payload?.error ||
    payload?.message ||
    err?.message ||
    fallback;
  const dependencySummary = formatBatteryDependencySummary(
    payload?.hard_blockers || payload?.dependencies
  );

  return dependencySummary
    ? `${message}. Блокирующие записи: ${dependencySummary}`
    : message;
}

async function buildBatteryResponseError(res, fallback = 'Ошибка запроса') {
  const contentType = res.headers?.get?.('content-type') || '';
  let payload = null;
  let text = '';

  if (contentType.includes('application/json')) {
    payload = await res.json().catch(() => null);
  } else {
    text = await res.text().catch(() => '');
  }

  const message = formatBatterySaveError(
    payload || { error: text || `${fallback}: HTTP ${res.status}` },
    fallback
  );
  const err = new Error(message);
  err.status = res.status;
  err.responseBody = payload;
  return err;
}

async function throwBatteryResponseError(res, fallback) {
  throw await buildBatteryResponseError(res, fallback);
}

function ensureBatteryInlineStatusElement(buttonId) {
  const button = document.getElementById(buttonId);
  if (!button) return null;

  let statusEl = document.getElementById(`${buttonId}__status`);

  if (!statusEl) {
    statusEl = document.createElement('span');
    statusEl.id = `${buttonId}__status`;
    statusEl.className = 'inline_status';
    statusEl.setAttribute('aria-live', 'polite');
    button.insertAdjacentElement('afterend', statusEl);
  }

  return statusEl;
}

function clearBatteryInlineStatus(buttonId) {
  const statusEl = document.getElementById(`${buttonId}__status`);

  if (!statusEl) return;

  statusEl.textContent = '';
  statusEl.classList.remove('is_error');
  statusEl.classList.remove('is_saving');
  statusEl.classList.remove('is-saved');
}

function clearBatteryInlineStatuses() {
  [
    'printBatteryBtn',
    'exitBatteriesBtn',
    'disassembleBatteryBtn',
    'deleteBatteryBtn'
  ].forEach((buttonId) => {
    if (batteryInlineStatusTimers[buttonId]) {
      clearTimeout(batteryInlineStatusTimers[buttonId]);
      delete batteryInlineStatusTimers[buttonId];
    }

    clearBatteryInlineStatus(buttonId);
  });
}

function showBatteryInlineStatus(buttonId, message, isError = false, options = {}) {
  const statusEl = ensureBatteryInlineStatusElement(buttonId);

  if (!statusEl) return;

  if (batteryInlineStatusTimers[buttonId]) {
    clearTimeout(batteryInlineStatusTimers[buttonId]);
  }

  statusEl.textContent = message || '';
  statusEl.classList.toggle('is_error', Boolean(isError));
  statusEl.classList.toggle('is_saving', Boolean(options.isSaving));
  statusEl.classList.toggle('is-saved', Boolean(message && !isError && !options.isSaving));

  const clearAfterMs = options.clearAfterMs ?? (isError ? 18000 : 4000);

  if (message && clearAfterMs) {
    batteryInlineStatusTimers[buttonId] = setTimeout(() => {
      clearBatteryInlineStatus(buttonId);
    }, clearAfterMs);
  }
}

function showBatteryPageStatus(message, isError = false, options = {}) {
  const statusEl = document.querySelector('.save_message');

  if (!statusEl) return;

  if (batteryPageStatusTimer) {
    clearTimeout(batteryPageStatusTimer);
  }

  statusEl.textContent = message || '';
  statusEl.classList.toggle('is_error', Boolean(isError));
  statusEl.classList.toggle('is-saved', Boolean(message && !isError));

  const clearAfterMs = options.clearAfterMs ?? (isError ? 18000 : 5000);

  if (message && clearAfterMs) {
    batteryPageStatusTimer = setTimeout(() => {
      statusEl.textContent = '';
      statusEl.classList.remove('is_error');
      statusEl.classList.remove('is-saved');
    }, clearAfterMs);
  }
}

async function withBatteryInlineSaveStatus(buttonId, task, fallbackError = 'Ошибка сохранения') {
  const button = document.getElementById(buttonId);

  if (button?.disabled || button?.dataset.saving === 'true') return null;

  if (button) {
    button.dataset.saving = 'true';
    button.setAttribute('aria-disabled', 'true');
  }
  showBatteryInlineStatus(buttonId, 'Сохранение...', false, {
    clearAfterMs: 0,
    isSaving: true
  });

  try {
    return await (typeof task === 'function' ? task() : task);
  } catch (err) {
    console.error(err);
    showBatteryInlineStatus(buttonId, formatBatterySaveError(err, fallbackError), true);
    return null;
  } finally {
    if (button && document.getElementById(buttonId) === button) {
      delete button.dataset.saving;
      button.removeAttribute('aria-disabled');
    }
  }
}

function getBatteryDeleteFlowElement() {
  return document.getElementById('battery_delete_flow');
}

function scrollBatteryDeleteFlowIntoView() {
  window.BADB_UI?.scrollToTop();
}

function getBatteryDeleteHardBlockers(check = state.ui.deleteFlow?.check) {
  return Array.isArray(check?.hard_blockers)
    ? check.hard_blockers
    : Array.isArray(check?.dependencies)
      ? check.dependencies
      : [];
}

function getBatteryDeleteOwnedData(check = state.ui.deleteFlow?.check) {
  return Array.isArray(check?.confirmable_owned_data)
    ? check.confirmable_owned_data
    : [];
}

function getBatteryDeleteLinkedElectrodes(check = state.ui.deleteFlow?.check) {
  return Array.isArray(check?.linked_electrodes)
    ? check.linked_electrodes
    : [];
}

function resetBatteryDeleteFlow({ render = false } = {}) {
  state.ui.deleteFlow = getDefaultBatteryDeleteFlowState();

  if (render) {
    renderBatteryDeleteFlow();
  }
}

function setBatteryDeleteFlow(nextFlow) {
  state.ui.deleteFlow = {
    ...getDefaultBatteryDeleteFlowState(),
    ...(state.ui.deleteFlow || {}),
    ...nextFlow
  };
  renderBatteryDeleteFlow();
}

function formatBatteryDeleteDependencyRecords(records) {
  const visibleRecords = (Array.isArray(records) ? records : []).slice(0, 4);

  if (visibleRecords.length === 0) {
    return '';
  }

  const names = visibleRecords.map((record) => {
    const name = record.name || record.file_name || record.id || '';
    return name ? String(name) : 'запись';
  });

  const remainingCount = Math.max(0, (records?.length || 0) - visibleRecords.length);
  return remainingCount > 0
    ? `${names.join(', ')} и ещё ${remainingCount}`
    : names.join(', ');
}

function renderBatteryDeleteDependencyList(dependencies, emptyMessage) {
  if (!Array.isArray(dependencies) || dependencies.length === 0) {
    return `<p>${escapeHtml(emptyMessage)}</p>`;
  }

  return `
    <ul>
      ${dependencies.map((dependency) => {
        const records = formatBatteryDeleteDependencyRecords(dependency.records);
        const count = dependency.count ?? dependency.records?.length ?? 0;
        return `
          <li>
            <strong>${escapeHtml(dependency.label || dependency.key || 'Связанные записи')}</strong>
            ${count ? `(${escapeHtml(count)})` : ''}
            ${records ? ` — ${escapeHtml(records)}` : ''}
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

function formatBatteryDeleteElectrodeLabel(electrode) {
  const roleLabels = {
    cathode: 'катод',
    anode: 'анод'
  };
  const parts = [
    `электрод #${electrode.electrode_id}`,
    electrode.number_in_batch != null ? `№ ${electrode.number_in_batch}` : '',
    roleLabels[electrode.role] || electrode.role || '',
    electrode.cut_batch_id != null ? `партия ${electrode.cut_batch_id}` : ''
  ];

  return parts.filter(Boolean).join(' — ');
}

function renderBatteryDeleteElectrodeList(electrodes) {
  if (!Array.isArray(electrodes) || electrodes.length === 0) {
    return '<p>Связанных электродов нет.</p>';
  }

  return `
    <ul>
      ${electrodes.map((electrode) => `
        <li>${escapeHtml(formatBatteryDeleteElectrodeLabel(electrode))}</li>
      `).join('')}
    </ul>
  `;
}

function renderBatteryDeleteBlocked(flowEl, check) {
  flowEl.innerHTML = `
    <h3>Аккумулятор пока нельзя удалить</h3>
    <p>Сначала уберите блокирующие связи. Подтверждение удаления пока не требуется.</p>
    ${renderBatteryDeleteDependencyList(
      getBatteryDeleteHardBlockers(check),
      'Блокирующих связей не найдено.'
    )}
    <div class="form-actions">
      <button type="button" data-battery-delete-action="cancel">Закрыть</button>
    </div>
  `;
}

function renderBatteryDeleteDispositionStep(flowEl, flow) {
  const disposition = flow.electrodeDisposition || 'available';
  const showReason = disposition === 'scrapped';

  flowEl.innerHTML = `
    <h3>Удаление аккумулятора #${escapeHtml(state.selection.currentBatteryId)}</h3>
    <p>Выберите, что сделать с электродами, которые сейчас связаны с аккумулятором.</p>
    ${renderBatteryDeleteElectrodeList(getBatteryDeleteLinkedElectrodes(flow.check))}
    <label>
      <input
        type="radio"
        name="battery_delete_electrode_disposition"
        value="available"
        ${disposition === 'available' ? 'checked' : ''}
      >
      Вернуть электроды в партию как доступные
    </label>
    <label>
      <input
        type="radio"
        name="battery_delete_electrode_disposition"
        value="scrapped"
        ${disposition === 'scrapped' ? 'checked' : ''}
      >
      Вернуть электроды в партию как списанные
    </label>
    <label ${showReason ? '' : 'hidden'}>
      Причина списания
      <input
        type="text"
        id="battery_delete_scrapped_reason"
        value="${escapeHtml(flow.scrappedReason || '')}"
        placeholder="возвращен из аккумулятора #${escapeHtml(state.selection.currentBatteryId)} при удалении записи"
      >
    </label>
    <div class="form-actions">
      <button type="button" data-battery-delete-action="summary">Дальше</button>
      <button type="button" data-battery-delete-action="cancel">Отмена</button>
    </div>
  `;
}

function renderBatteryDeleteSummaryStep(flowEl, flow) {
  const batteryId = state.selection.currentBatteryId;
  const phrase = `DELETE BATTERY ${batteryId}`;
  const electrodes = getBatteryDeleteLinkedElectrodes(flow.check);
  const dispositionText =
    electrodes.length === 0
      ? 'Связанных электродов нет.'
      : flow.electrodeDisposition === 'scrapped'
        ? 'Электроды будут возвращены в партии как списанные.'
        : 'Электроды будут возвращены в партии как доступные.';

  flowEl.innerHTML = `
    <h3>Подтверждение удаления аккумулятора #${escapeHtml(batteryId)}</h3>
    <p>${escapeHtml(dispositionText)}</p>
    ${flow.electrodeDisposition === 'scrapped' && flow.scrappedReason
      ? `<p>Причина списания: ${escapeHtml(flow.scrappedReason)}</p>`
      : ''
    }
    <p>Будут удалены только данные, принадлежащие записи аккумулятора:</p>
    ${renderBatteryDeleteDependencyList(
      getBatteryDeleteOwnedData(flow.check),
      'Дополнительных записей аккумулятора не найдено.'
    )}
    <p class="record-delete-warning">Это действие нельзя отменить.</p>
    <label>
      Для удаления введите <strong>${escapeHtml(phrase)}</strong>
      <input type="text" id="battery_delete_confirmation" autocomplete="off">
    </label>
    <div class="form-actions">
      <button type="button" class="button-danger" data-battery-delete-action="confirm">Удалить аккумулятор</button>
      ${electrodes.length > 0
        ? '<button type="button" data-battery-delete-action="back">Назад</button>'
        : ''
      }
      <button type="button" data-battery-delete-action="cancel">Отмена</button>
    </div>
  `;
}

function renderBatteryDeleteFlow() {
  const flowEl = getBatteryDeleteFlowElement();

  if (!flowEl) return;

  const flow = state.ui.deleteFlow || getDefaultBatteryDeleteFlowState();
  const isVisible = Boolean(
    state.ui.isFormOpen &&
    state.selection.currentBatteryId &&
    flow.step !== 'idle'
  );

  flowEl.hidden = !isVisible;

  if (!isVisible) {
    flowEl.innerHTML = '';
    return;
  }

  if (flow.step === 'blocked') {
    renderBatteryDeleteBlocked(flowEl, flow.check);
  } else if (flow.step === 'choose-electrodes') {
    renderBatteryDeleteDispositionStep(flowEl, flow);
  } else if (flow.step === 'confirm') {
    renderBatteryDeleteSummaryStep(flowEl, flow);
  }

  attachBatteryDeleteFlowEvents(flowEl);
}

function attachBatteryDeleteFlowEvents(flowEl) {
  flowEl.querySelectorAll('input[name="battery_delete_electrode_disposition"]').forEach((input) => {
    input.addEventListener('change', () => {
      const scrappedReason = document.getElementById('battery_delete_scrapped_reason')?.value || '';
      setBatteryDeleteFlow({
        electrodeDisposition: input.value,
        scrappedReason
      });
    });
  });

  flowEl.querySelectorAll('[data-battery-delete-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.dataset.batteryDeleteAction;

      if (action === 'cancel') {
        resetBatteryDeleteFlow({ render: true });
        return;
      }

      if (action === 'summary') {
        const disposition = flowEl.querySelector('input[name="battery_delete_electrode_disposition"]:checked')?.value || 'available';
        const scrappedReason = document.getElementById('battery_delete_scrapped_reason')?.value || '';
        setBatteryDeleteFlow({
          step: 'confirm',
          electrodeDisposition: disposition,
          scrappedReason
        });
        return;
      }

      if (action === 'back') {
        setBatteryDeleteFlow({ step: 'choose-electrodes' });
        return;
      }

      if (action === 'confirm') {
        await submitBatteryGuidedDelete();
      }
    });
  });
}

async function submitBatteryGuidedDelete() {
  const batteryId = state.selection.currentBatteryId;
  const flow = state.ui.deleteFlow || getDefaultBatteryDeleteFlowState();

  if (!batteryId) return;

  const body = {
    confirmation: document.getElementById('battery_delete_confirmation')?.value || ''
  };

  if (getBatteryDeleteLinkedElectrodes(flow.check).length > 0) {
    body.electrode_disposition = flow.electrodeDisposition || 'available';

    if (body.electrode_disposition === 'scrapped') {
      body.scrapped_reason = flow.scrappedReason || '';
    }
  }

  const result = await withBatteryInlineSaveStatus('deleteBatteryBtn', async () => {
    const res = await fetch(`/api/batteries/${batteryId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      await throwBatteryResponseError(res, 'Ошибка удаления аккумулятора');
    }

    return res.json();
  }, 'Ошибка удаления аккумулятора');

  if (!result) return;

  resetBatteryDeleteFlow();
  resetBatteryPageState();
  await loadBatteries();
  showBatteryPageStatus(`Аккумулятор #${batteryId} удалён.`);
}


// -------- Save --------

async function saveElectrodeStack() {
  const statusTargetId = 'battery_stack_save_btn';

  return withBatteryInlineSaveStatus(statusTargetId, async () => {
  if (!state.selection.currentBatteryId) {
    showBatteryInlineStatus(statusTargetId, 'Сначала создайте элемент.', true);
    return;
  }

  const stack = buildStackPayload();

  if (!stack || stack.length === 0) {
    showBatteryInlineStatus(statusTargetId, 'Стек электродов пуст.', true);
    return;
  }

  if (!validateStackSelection()) {
    return;
  }

  const confirmed = confirm(
    'Сохранить стек электродов?\n\n' +
    'Пока эта карточка аккумулятора открыта, стек можно будет исправить.\n' +
    'После выхода и повторной загрузки аккумулятора сохранённый стек будет заблокирован.'
  );

  if (!confirmed) {
    showBatteryInlineStatus(statusTargetId, 'Сохранение стека отменено.');
    return;
  }

  const res = await fetch(`/api/batteries/battery_electrodes/${state.selection.currentBatteryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stack)
  });
  
  if (!res.ok) {
    await throwBatteryResponseError(res, 'Ошибка сохранения стека');
  }
  
  markSectionsSaved(['battery_stack']);
  await refreshBatteryStatusState();
  await autoSaveAssembledStatusTransition();
  renderBatteryPage();
  
  showBatteryInlineStatus(statusTargetId, 'Стек электродов сохранён.');
  }, 'Ошибка сохранения стека');
}

async function savePayloadSection(routeBase, payload) {
  if (!state.selection.currentBatteryId) {
    throw new Error('Сначала создайте элемент.');
  }

  let res = await fetch(`/api/batteries/${routeBase}/${state.selection.currentBatteryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.status === 404) {
    res = await fetch(`/api/batteries/${routeBase}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        battery_id: state.selection.currentBatteryId,
        ...payload
      })
    });
  }

  if (!res.ok) {
    await throwBatteryResponseError(res, `Ошибка сохранения: ${routeBase}`);
  }

  return res.json();
}

function getActiveAssemblyContext() {
  const formFactor = state.meta.form_factor || document.getElementById('battery_form_factor').value;

  if (formFactor === 'coin') {
    return {
      formFactor,
      fieldsetId: 'coin_assembly',
      configRoute: 'battery_coin_config',
      separatorId: 'coin_separator_id',
      separatorNotesId: 'coin_separator_notes',
      electrolyteId: 'coin_electrolyte_id',
      electrolyteNotesId: 'coin_electrolyte_notes',
      totalVolumeId: 'coin_electrolyte_total_ul'
    };
  }

  if (isPouchLikeFormFactor(formFactor)) {
    return {
      formFactor,
      fieldsetId: 'pouch_assembly',
      configRoute: 'battery_pouch_config',
      separatorId: 'pouch_separator_id',
      separatorNotesId: 'pouch_separator_notes',
      electrolyteId: 'pouch_electrolyte_id',
      electrolyteNotesId: 'pouch_electrolyte_notes',
      totalVolumeId: 'pouch_electrolyte_total_ul'
    };
  }

  if (formFactor === 'cylindrical') {
    return {
      formFactor,
      fieldsetId: 'cyl_assembly',
      configRoute: 'battery_cyl_config',
      separatorId: 'cyl_separator_id',
      separatorNotesId: 'cyl_separator_notes',
      electrolyteId: 'cyl_electrolyte_id',
      electrolyteNotesId: 'cyl_electrolyte_notes',
      totalVolumeId: 'cyl_electrolyte_total_ul'
    };
  }

  return null;
}

function getActiveAssemblySectionState() {
  const ctx = getActiveAssemblyContext();
  if (!ctx) return null;

  return ctx.formFactor === 'coin' ? { ...state.assembly.coin }
    : isPouchLikeFormFactor(ctx.formFactor) ? { ...state.assembly.pouch }
    : ctx.formFactor === 'cylindrical' ? { ...state.assembly.cylindrical }
    : null;
}

function buildBatterySeparatorElectrolytePayloads(sectionState) {
  return {
    separatorPayload: {
      separator_id: sectionState.separator_id ?? null,
      separator_notes: sectionState.separator_notes || null
    },
    electrolytePayload: {
      electrolyte_id: sectionState.electrolyte_id ?? null,
      electrolyte_notes: sectionState.electrolyte_notes || null,
      electrolyte_total_ul: sectionState.electrolyte_total_ul ?? null
    }
  };
}

function hasCopiedBatteryAssemblyDraftPayload() {
  const sectionState = getActiveAssemblySectionState();
  if (!sectionState) return false;

  return Boolean(
    sectionState.separator_id &&
    sectionState.electrolyte_id &&
    hasMeaningfulValue(sectionState.electrolyte_total_ul)
  );
}

async function saveBatterySeparatorElectrolyteConfig({ refreshStatus = false } = {}) {
  if (!state.selection.currentBatteryId) {
    throw new Error('Сначала создайте элемент.');
  }

  syncAssemblyStateFromDom();

  const sectionState = getActiveAssemblySectionState();
  if (!sectionState) {
    throw new Error('Не выбран форм-фактор.');
  }

  const { separatorPayload, electrolytePayload } =
    buildBatterySeparatorElectrolytePayloads(sectionState);

  if (
    !separatorPayload.separator_id ||
    !electrolytePayload.electrolyte_id ||
    !hasMeaningfulValue(electrolytePayload.electrolyte_total_ul)
  ) {
    return false;
  }

  await savePayloadSection('battery_sep_config', separatorPayload);
  await savePayloadSection('battery_electrolyte', electrolytePayload);
  markSectionsSaved(['battery_assembly']);

  if (refreshStatus) {
    await refreshBatteryStatusState();
    await autoSaveAssembledStatusTransition();
  }

  return true;
}

async function saveAssemblyParams() {
  let statusTargetId = 'coin_assembly_save_btn';

  if (!state.selection.currentBatteryId) {
    showBatteryInlineStatus(statusTargetId, 'Сначала создайте элемент.', true);
    return;
  }

  syncMetaStateFromDom();
  syncAssemblyStateFromDom();

  const ctx = getActiveAssemblyContext();

  if (!ctx) {
    showBatteryInlineStatus(statusTargetId, 'Не выбран форм-фактор.', true);
    return;
  }

  statusTargetId = ctx.formFactor === 'coin'
    ? 'coin_assembly_save_btn'
    : isPouchLikeFormFactor(ctx.formFactor)
      ? 'pouch_assembly_save_btn'
      : 'cyl_assembly_save_btn';

  return withBatteryInlineSaveStatus(statusTargetId, async () => {
  try {
    const sectionState = getActiveAssemblySectionState();

    if (!sectionState) {
      throw new Error('Не удалось собрать данные секции сборки');
    }

    const { separatorPayload, electrolytePayload } =
      buildBatterySeparatorElectrolytePayloads(sectionState);

    const configPayload = { ...sectionState };
    delete configPayload.separator_id;
    delete configPayload.separator_notes;
    delete configPayload.electrolyte_id;
    delete configPayload.electrolyte_notes;
    delete configPayload.electrolyte_total_ul;

    // 1. save only the fields that belong to the form-factor config table
    if (Object.keys(configPayload).length > 0) {
      await savePayloadSection(ctx.configRoute, configPayload);
    }

    // 2. save separator
    await savePayloadSection('battery_sep_config', separatorPayload);

    // 3. save electrolyte
    await savePayloadSection('battery_electrolyte', electrolytePayload);
    markSectionsSaved(['battery_assembly']);
    await refreshBatteryStatusState();
    await autoSaveAssembledStatusTransition();
    renderBatteryPage();

    showBatteryInlineStatus(statusTargetId, 'Параметры сборки сохранены.');
  } catch (err) {
    console.error(err);
    showBatteryInlineStatus(
      statusTargetId,
      err.message || 'Ошибка сохранения параметров сборки',
      true
    );
  }
  }, 'Ошибка сохранения параметров сборки');
}


async function saveBatteryQc() {
  const statusTargetId = 'battery_qc_save_btn';

  return withBatteryInlineSaveStatus(statusTargetId, async () => {
  try {
    syncQcStateFromDom();
    const payload = {
      ocv_v: state.qc.ocv_v ?? null,
      esr_mohm: state.qc.esr_mohm ?? null,
      qc_notes: state.qc.qc_notes || null
    };

    await savePayloadSection('battery_qc', payload);
    markSectionsSaved(['battery_qc']);
    renderBatteryPage();
    showBatteryInlineStatus(statusTargetId, 'Результаты QC сохранены.');
  } catch (err) {
    console.error(err);
    showBatteryInlineStatus(statusTargetId, err.message || 'Ошибка сохранения QC', true);
  }
  }, 'Ошибка сохранения QC');
}

function renderElectrochemSavedFiles(entries) {
  const target = document.getElementById('electrochem_files_saved');

  if (!target) return;

  if (!Array.isArray(entries) || entries.length === 0) {
    target.innerHTML = '';
    return;
  }

  target.innerHTML = '';

  entries.forEach((entry, index) => {
    const row = document.createElement('div');
    const deleteBtn = document.createElement('button');

    row.append(`${index + 1}. `);

    if (entry.file_link) {
      const link = document.createElement('a');

      link.href = entry.file_link;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = entry.file_name || entry.file_link;
      row.appendChild(link);

      if (entry.electrochem_notes) {
        row.append(` | ${entry.electrochem_notes}`);
      }
    } else {
      row.append(entry.electrochem_notes || 'Заметка без файла');
    }

    deleteBtn.type = 'button';
    deleteBtn.textContent = '🗑';
    deleteBtn.title = 'Удалить файл';
    deleteBtn.setAttribute('aria-label', `Удалить файл ${entry.file_name || entry.electrochem_notes || index + 1}`);
    deleteBtn.style.marginLeft = '0.5rem';
    deleteBtn.onclick = async () => {
      const fileName = entry.file_name || entry.electrochem_notes || `Файл ${index + 1}`;

      if (!confirm(`Удалить файл "${fileName}"?`)) return;

      try {
        await deleteBatteryElectrochem(entry.battery_electrochem_id);
        setElectrochemState({
          ...state.electrochem,
          savedEntries: state.electrochem.savedEntries.filter(
            (file) => file.battery_electrochem_id !== entry.battery_electrochem_id
          )
        });
        renderElectrochemSavedFiles(state.electrochem.savedEntries);
        markSectionsSaved(['battery_electrochem']);
        renderBatteryPage();
        showBatteryInlineStatus('battery_electrochem_files_save_btn', 'Файл удалён');
      } catch (err) {
        console.error(err);
        showBatteryInlineStatus(
          'battery_electrochem_files_save_btn',
          err.message || 'Ошибка удаления файла электрохимических испытаний',
          true
        );
      }
    };

    row.appendChild(deleteBtn);
    target.appendChild(row);
  });
}

function updateBatteryElectrochemFilesButtonVisibility() {
  const filesInput = document.getElementById('electrochem_files');
  const saveFilesBtn = document.getElementById('battery_electrochem_files_save_btn');

  if (!saveFilesBtn) return;

  saveFilesBtn.hidden = !filesInput?.files || filesInput.files.length === 0;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      const result = typeof reader.result === 'string'
        ? reader.result.split(',')[1]
        : '';
      resolve(result);
    };
    
    reader.onerror = () => {
      reject(new Error(`Не удалось прочитать файл: ${file.name}`));
    };
    
    reader.readAsDataURL(file);
  });
}

async function deleteBatteryElectrochem(electrochemId) {
  const res = await fetch(`/api/batteries/battery_electrochem/${electrochemId}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка удаления файла электрохимических испытаний');
  }
}

async function buildBatteryElectrochemEntries(selectedFiles, notes) {
  return Promise.all(selectedFiles.map(async (file) => ({
    file_name: file.name,
    file_content_base64: await fileToBase64(file),
    electrochem_notes: notes || null
  })));
}

async function postBatteryElectrochem(entries, notes) {
  const res = await fetch('/api/batteries/battery_electrochem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      battery_id: state.selection.currentBatteryId,
      entries,
      electrochem_notes: notes || null
    })
  });

  if (!res.ok) {
    await throwBatteryResponseError(res, 'Ошибка сохранения электрохимических испытаний');
  }

  return res.json();
}

function finishBatteryElectrochemSave(saved) {
  setElectrochemState({
    notes: null,
    files: null,
    savedEntries: Array.isArray(saved) ? saved : []
  });
  renderElectrochemForm();
  markSectionsSaved(['battery_electrochem']);
  renderBatteryPage();
}

async function saveBatteryElectrochemFiles() {
  const statusTargetId = 'battery_electrochem_files_save_btn';

  return withBatteryInlineSaveStatus(statusTargetId, async () => {
    if (!state.selection.currentBatteryId) {
      showBatteryInlineStatus(statusTargetId, 'Сначала создайте элемент.', true);
      return;
    }

    const filesInput = document.getElementById('electrochem_files');
    syncElectrochemStateFromDom();

    const selectedFiles = Array.from(filesInput.files || []);
    const notes = typeof state.electrochem.notes === 'string'
      ? state.electrochem.notes.trim()
      : '';

    if (selectedFiles.length === 0) {
      showBatteryInlineStatus(statusTargetId, 'Выберите файлы.', true);
      return;
    }

    const saved = await postBatteryElectrochem(
      await buildBatteryElectrochemEntries(selectedFiles, notes),
      notes
    );

    finishBatteryElectrochemSave(saved);
    showBatteryInlineStatus(statusTargetId, 'Файлы сохранены.');
  }, 'Ошибка сохранения файлов электрохимических испытаний');
}

async function saveBatteryElectrochem() {
  const statusTargetId = 'battery_electrochem_save_btn';

  return withBatteryInlineSaveStatus(statusTargetId, async () => {
  if (!state.selection.currentBatteryId) {
    showBatteryInlineStatus(statusTargetId, 'Сначала создайте элемент.', true);
    return;
  }

  try {
    const filesInput = document.getElementById('electrochem_files');
    syncElectrochemStateFromDom();

    const selectedFiles = Array.from(filesInput.files || []);
    const notes = typeof state.electrochem.notes === 'string'
      ? state.electrochem.notes.trim()
      : '';

    if (selectedFiles.length === 0 && !notes) {
      showBatteryInlineStatus(statusTargetId, 'Добавьте заметку или файл испытаний.', true);
      return;
    }

    const saved = await postBatteryElectrochem(
      await buildBatteryElectrochemEntries(selectedFiles, notes),
      notes
    );

    finishBatteryElectrochemSave(saved);
    showBatteryInlineStatus(statusTargetId, 'Результаты электрохимических испытаний сохранены.');
  } catch (err) {
    console.error(err);
    showBatteryInlineStatus(
      statusTargetId,
      err.message || 'Ошибка сохранения электрохимических испытаний',
      true
    );
  }
  }, 'Ошибка сохранения электрохимических испытаний');
}


async function updateBatteryMeta(id, data) {
  
  const res = await fetch(`/api/batteries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    await throwBatteryResponseError(res, 'Ошибка обновления аккумулятора');
  }
  
  return res.json();
  
}



// -------- Fetch / Load --------

async function fetchBatteryArray(url, label) {
  const res = await fetch(url);

  if (!res.ok) {
    console.warn(`Failed to load ${label}`, res.status);
    return null;
  }

  const data = await res.json();

  if (!Array.isArray(data)) {
    console.warn(`Unexpected ${label} payload`, data);
    return null;
  }

  return data;
}

async function fetchProjectsReference() {
  return fetchBatteryArray('/api/projects?project_id=0', 'projects');
}

async function fetchUsersReference() {
  return fetchBatteryArray('/api/users', 'users');
}

async function fetchBatteriesReference() {
  return fetchBatteryArray('/api/batteries', 'batteries');
}

async function fetchSeparatorsReference() {
  return fetchBatteryArray('/api/separators', 'separators');
}

async function fetchElectrolytesReference() {
  return fetchBatteryArray('/api/electrolytes', 'electrolytes');
}

async function fetchTapesReference() {
  return fetchBatteryArray('/api/tapes/for-electrodes', 'tapes');
}

async function fetchCutBatchesReference() {
  return fetchBatteryArray('/api/electrodes/electrode-cut-batches', 'electrode cut batches');
}

function renderBatteryReferenceSelect(select, items, {
  placeholder,
  valueKey,
  labelBuilder
}) {
  if (!select) return;

  const current = select.value;
  select.replaceChildren(new Option(placeholder, ''));

  items.forEach(item => {
    const option = document.createElement('option');
    option.value = item[valueKey];
    option.textContent = labelBuilder(item);
    select.appendChild(option);
  });

  select.value = current;
}

async function loadProjects() {
  const data = await fetchProjectsReference();

  if (!data) {
    return;
  }

  setProjects(data);
  renderBatteryReferenceSelect(projectFilterSelect, data, {
    placeholder: '— все проекты —',
    valueKey: 'project_id',
    labelBuilder: (project) => project.name
  });
  renderBatteryProjectMultiSelect();
}

async function loadUsers() {
  const data = await fetchUsersReference();

  if (!data) {
    return;
  }

  renderBatteryReferenceSelect(createdBySelect, data, {
    placeholder: window.BADB_AUTH?.getAuditUserPlaceholder?.() || '— автоматически —',
    valueKey: 'user_id',
    labelBuilder: (user) => user.full_name || user.name
  });
}

async function loadBatteries() {
  const data = await fetchBatteriesReference();

  if (!data) {
    return;
  }

  setBatteries(data);
}


async function loadSeparators() {
  const data = await fetchSeparatorsReference();

  if (!data) {
    return;
  }

  const selects = [
    document.getElementById('coin_separator_id'),
    document.getElementById('pouch_separator_id'),
    document.getElementById('cyl_separator_id')
  ].filter(Boolean);

  selects.forEach(select => {
    renderBatteryReferenceSelect(select, data, {
      placeholder: '— выбрать сепаратор —',
      valueKey: 'sep_id',
      labelBuilder: (separator) => `#${separator.sep_id} | ${separator.name || '—'}`
    });
  });
}

async function loadElectrolytes() {
  const data = await fetchElectrolytesReference();

  if (!data) {
    return;
  }

  const selects = [
    document.getElementById('coin_electrolyte_id'),
    document.getElementById('pouch_electrolyte_id'),
    document.getElementById('cyl_electrolyte_id')
  ].filter(Boolean);

  selects.forEach(select => {
    renderBatteryReferenceSelect(select, data, {
      placeholder: '— выбрать электролит —',
      valueKey: 'electrolyte_id',
      labelBuilder: (electrolyte) => `#${electrolyte.electrolyte_id} | ${electrolyte.name || '—'}`
    });
  });
}


async function loadTapes() {
  const data = await fetchTapesReference();

  if (!data) {
    return;
  }

  setTapes(data);
}

async function loadCutBatches() {
  const data = await fetchCutBatchesReference();

  if (!data) {
    return;
  }

  setCutBatches(data);
}

function getBatteryCutBatchParams(tapeId, selectedBatchIds) {
  const params = new URLSearchParams();

  if (tapeId) {
    params.set('tape_id', String(tapeId));
  }

  const ids = Array.isArray(selectedBatchIds)
    ? selectedBatchIds.filter(Boolean)
    : [selectedBatchIds].filter(Boolean);

  if (ids.length) {
    params.set('selected_batch_ids', ids.join(','));
  }

  return params;
}

async function fetchCompatibleBatteryCutBatches(tapeId, selectedBatchIds = []) {
  if (!state.selection.currentBatteryId) {
    return getLocalCompatibleBatteryCutBatches(tapeId, selectedBatchIds);
  }

  const params = getBatteryCutBatchParams(tapeId, selectedBatchIds);
  const data = await fetchBatteryArray(
    `/api/batteries/${state.selection.currentBatteryId}/electrode-cut-batches?${params.toString()}`,
    'compatible cut batches'
  );

  return data || [];
}

function getExpectedBatteryBatchShape() {
  const formFactor = state.meta.form_factor;
  if (formFactor === 'coin') return 'circle';
  if (isPouchLikeFormFactor(formFactor) || formFactor === 'cylindrical') return 'rectangle';
  return null;
}

function getBatchSidedness(batch) {
  return batch?.coating_sidedness || batch?.tape_coating_sidedness || null;
}

function getLocalCompatibleBatteryCutBatches(tapeId, selectedBatchIds = []) {
  const expectedShape = getExpectedBatteryBatchShape();
  const formFactor = state.meta.form_factor;
  const selectedSet = new Set(
    (Array.isArray(selectedBatchIds) ? selectedBatchIds : [selectedBatchIds])
      .filter(Boolean)
      .map(String)
  );

  const compatible = state.reference.cutBatches.filter((batch) => {
    if (tapeId && String(batch.tape_id) !== String(tapeId)) return false;

    const isSelected = selectedSet.has(String(batch.cut_batch_id));
    const isCompatible =
      expectedShape &&
      batch.shape === expectedShape &&
      batch.target_form_factor === formFactor &&
      (
        formFactor !== 'coin' ||
        getBatchSidedness(batch) === 'one_sided'
      );

    return isSelected || isCompatible;
  });

  return sortElectrodeCutBatches(compatible, { selectedBatchId: selectedSet.values().next().value });
}

async function loadCathodeBatches(tapeId) {
  const selectedBatchIds = getSelectedSourceBatchIds('cathode');

  const data = await fetchCompatibleBatteryCutBatches(tapeId, selectedBatchIds);
  setCathodeBatches(data);
}

async function loadAnodeBatches(tapeId) {
  const selectedBatchIds = getSelectedSourceBatchIds('anode');

  const data = await fetchCompatibleBatteryCutBatches(tapeId, selectedBatchIds);
  setAnodeBatches(data);
}

function mergeCutBatchLists(lists) {
  const byId = new Map();

  lists.flat().forEach((batch) => {
    if (!batch?.cut_batch_id) return;
    byId.set(String(batch.cut_batch_id), batch);
  });

  return Array.from(byId.values());
}

async function loadRoleBatchesForSources(role) {
  const tapeIds = [...new Set(getSelectedSourceTapeIds(role).map(String).filter(Boolean))];
  const selectedBatchIds = getSelectedSourceBatchIds(role);

  if (!tapeIds.length) {
    const batches = await fetchCompatibleBatteryCutBatches(null, selectedBatchIds);
    if (role === 'cathode') setCathodeBatches(batches);
    else setAnodeBatches(batches);
    return;
  }

  const lists = await Promise.all(
    tapeIds.map(tapeId => fetchCompatibleBatteryCutBatches(tapeId, selectedBatchIds))
  );
  const merged = mergeCutBatchLists(lists);

  if (role === 'cathode') setCathodeBatches(merged);
  else setAnodeBatches(merged);
}

async function fetchCutBatchElectrodes(batchId) {
  if (!batchId) {
    return [];
  }

  const data = await fetchBatteryArray(
    `/api/electrodes/electrode-cut-batches/${batchId}/electrodes`,
    'cut batch electrodes'
  );

  return data || [];
}

async function loadCathodeElectrodes(batchId) {
  const data = await fetchCutBatchElectrodes(batchId);
  setCathodeElectrodes(data.filter(e => isAvailableElectrodeStatus(e.status_code)));
}

async function loadAnodeElectrodes(batchId) {
  const data = await fetchCutBatchElectrodes(batchId);
  setAnodeElectrodes(data.filter(e => isAvailableElectrodeStatus(e.status_code)));
}

function mergeElectrodeLists(lists) {
  const byId = new Map();

  lists.flat().forEach((electrode) => {
    if (!electrode?.electrode_id) return;
    byId.set(String(electrode.electrode_id), electrode);
  });

  return Array.from(byId.values());
}

async function loadRoleElectrodesForSources(role) {
  const batchIds = [...new Set(getSelectedSourceBatchIds(role).map(String).filter(Boolean))];

  if (!batchIds.length) {
    if (role === 'cathode') setCathodeElectrodes([]);
    else setAnodeElectrodes([]);
    return;
  }

  const lists = await Promise.all(batchIds.map(fetchCutBatchElectrodes));
  const available = mergeElectrodeLists(lists)
    .filter(e => isAvailableElectrodeStatus(e.status_code));

  if (role === 'cathode') setCathodeElectrodes(available);
  else setAnodeElectrodes(available);
}

async function fetchBatteryAssembly(batteryId) {
  const res = await fetch(`/api/batteries/${batteryId}/assembly`);

  if (!res.ok) {
    throw new Error('Failed to load battery assembly');
  }

  return res.json();
}

function clearBatteryRestoreFieldsets() {
  clearFieldset(document.getElementById('coin_config'));
  clearFieldset(document.getElementById('pouch_config'));
  clearFieldset(document.getElementById('cyl_config'));
  clearFieldset(document.getElementById('coin_assembly'));
  clearFieldset(document.getElementById('pouch_assembly'));
  clearFieldset(document.getElementById('cyl_assembly'));
  clearFieldset(document.getElementById('battery_qc'));
  clearFieldset(document.getElementById('battery_electrode_sources'));
  clearFieldset(document.getElementById('battery_electrochem'));
}

function resetBatterySectionState() {
  setElectrochemState(getDefaultElectrochemState());
  setMetaState(getDefaultMetaState());
  setConfigState(getDefaultConfigState());
  setElectrodeSourcesState(getDefaultElectrodeSourcesState());
  setAssemblyState(getDefaultAssemblyState());
  setQcState(getDefaultQcState());
}

function resetBatteryNpAssistState() {
  state.stack.targetAnodeExcessPercent = null;
  const input = document.getElementById('battery_np_excess_percent');
  if (input) input.value = '';
}

function resetBatteryPageStateForRestore() {
  clearBatteryRestoreFieldsets();
  resetBatterySectionState();
  resetBatteryNpAssistState();
  resetElectrodeSelection();
  resetBatteryDeleteFlow();
}

function applyBatteryMetaToState(data) {
  const battery = data?.battery || {};

  setMetaState({
    project_id: battery.project_id ?? null,
    project_ids: normalizeProjectIds(battery.project_ids || battery.project_id),
    created_by: battery.created_by ?? null,
    item_created_at: formatDateInputValue(battery.item_created_at || battery.created_at),
    form_factor: battery.form_factor ?? null,
    battery_notes: battery.battery_notes ?? battery.notes ?? null
  });

  setCurrentBattery({
    ...(state.selection.currentBattery || {}),
    ...battery
  });
}

function applyBatteryConfigToState(data) {
  setConfigState({
    coin: data?.coin_config || {},
    pouch: data?.pouch_config || {},
    cylindrical: data?.cyl_config || {}
  });
}

function applyElectrodeSourcesToState(data) {
  const nextElectrodeSourcesState = {
    sources: {
      cathode: [],
      anode: []
    }
  };
  let savedCathodeBatchId = '';
  let savedAnodeBatchId = '';

  if (Array.isArray(data?.electrode_sources)) {
    data.electrode_sources.forEach(src => {
      if (src.role === 'cathode') {
        nextElectrodeSourcesState.sources.cathode.push(src);

        if ((src.is_primary || !savedCathodeBatchId) && src.cut_batch_id) {
          savedCathodeBatchId = String(src.cut_batch_id);
        }
      }

      if (src.role === 'anode') {
        nextElectrodeSourcesState.sources.anode.push(src);

        if ((src.is_primary || !savedAnodeBatchId) && src.cut_batch_id) {
          savedAnodeBatchId = String(src.cut_batch_id);
        }
      }
    });
  }

  setElectrodeSourcesState(nextElectrodeSourcesState);

  return { savedCathodeBatchId, savedAnodeBatchId };
}

function applyStackToState(data) {
  resetSelectedElectrodes();

  if (!Array.isArray(data?.electrodes) || data.electrodes.length === 0) {
    return;
  }

  const cathodes = [];
  const anodes = [];

  data.electrodes.forEach(row => {
    const electrode = {
      ...row,
      electrode_id: row.electrode_id,
      electrode_mass_g: row.electrode_mass_g ?? null
    };

    if (row.role === 'cathode') {
      cathodes.push(electrode);
    }

    if (row.role === 'anode') {
      anodes.push(electrode);
    }
  });

  setSelectedCathodes(cathodes);
  setSelectedAnodes(anodes);
  setStackTargetCountsFromCurrentStack();
}

function applyAssemblyToState(data) {
  setAssemblyState({
    coin: {
      ...(data?.coin_config || {}),
      ...(data?.separator || {}),
      ...(data?.electrolyte || {})
    },
    pouch: {
      ...(data?.pouch_config || {}),
      ...(data?.separator || {}),
      ...(data?.electrolyte || {})
    },
    cylindrical: {
      ...(data?.cyl_config || {}),
      ...(data?.separator || {}),
      ...(data?.electrolyte || {})
    }
  });
}

function applyQcToState(data) {
  setQcState({
    ...(data?.qc || {}),
    status: data?.battery?.status || null
  });
}

function applyElectrochemToState(data) {
  setElectrochemState({
    notes: null,
    files: null,
    savedEntries: Array.isArray(data?.electrochem) ? data.electrochem : []
  });
}

function applyBatteryAssemblyDataToState(data) {
  applyBatteryMetaToState(data);
  applyBatteryConfigToState(data);
  const savedBatchIds = applyElectrodeSourcesToState(data);
  applyStackToState(data);
  applyAssemblyToState(data);
  applyQcToState(data);
  applyElectrochemToState(data);
  return savedBatchIds;
}

async function loadSavedSourceBatches() {
  await loadRoleBatchesForSources('cathode');
  await loadRoleBatchesForSources('anode');
}

async function loadSavedStackElectrodes(savedCathodeBatchId, savedAnodeBatchId) {
  if (savedCathodeBatchId || getSelectedSourceBatchIds('cathode').length) {
    await loadRoleElectrodesForSources('cathode');
  }

  if (savedAnodeBatchId || getSelectedSourceBatchIds('anode').length) {
    await loadRoleElectrodesForSources('anode');
  }
}

function finalizeRestoredBatteryPage(data) {
  applySavedElectrodeState(data);
  setBatteryFormOpen(true);
  renderBatteryPage();
  markRestoredBatterySectionsSaved(data);
}

function clearBatteryDuplicateDraftState() {
  state.ui.isDuplicateDraft = false;
  state.ui.duplicateSourceBatteryId = null;
  state.ui.duplicateCopiedAssembly = false;
}

function getBatteryDuplicateDraftDisplayLabel(battery) {
  const notes = String(battery?.battery_notes || battery?.notes || '').trim();
  if (notes) return notes;

  const materialsInfo = formatBatteryActiveMaterials(battery);
  if (materialsInfo) return materialsInfo;

  const projectLabel = getBatteryListProjectLabel(battery);
  if (projectLabel && projectLabel !== '—') return projectLabel;

  return `Аккумулятор #${battery?.battery_id}`;
}

function getBatteryDuplicateDraftNotes(battery) {
  return `${getBatteryDuplicateDraftDisplayLabel(battery)} (копия)`;
}

function applyBatteryMetaToDuplicateDraftState(data, sourceBattery) {
  const battery = data?.battery || {};

  setMetaState({
    project_id: battery.project_id ?? null,
    project_ids: normalizeProjectIds(battery.project_ids || battery.project_id),
    created_by: null,
    item_created_at: getTodayDateInputValue(),
    form_factor: battery.form_factor ?? null,
    battery_notes: getBatteryDuplicateDraftNotes(sourceBattery)
  });
}

function applyBatteryDuplicateDraftDataToState(data, sourceBattery) {
  applyBatteryMetaToDuplicateDraftState(data, sourceBattery);
  applyBatteryConfigToState(data);
  const savedBatchIds = applyElectrodeSourcesToState(data);
  resetSelectedElectrodes();
  resetElectrodeUiState();
  applyAssemblyToState(data);
  setQcState(getDefaultQcState());
  setElectrochemState(getDefaultElectrochemState());
  return savedBatchIds;
}

async function finalizeBatteryDuplicateDraftPage() {
  await loadSavedSourceBatches();
  setCurrentBattery(null);
  setBatteryFormOpen(true);
  setBatteryCreateButtonMode('create');
  setLoadedAssemblyComplete(false);
  state.ui.isDuplicateDraft = true;
  state.ui.duplicateCopiedAssembly = hasCopiedBatteryAssemblyDraftPayload();
  renderBatteryPage();
  refreshDirtyState();
}

async function duplicateBatteryRecord(battery) {
  const batteryId = Number(battery?.battery_id);
  if (!Number.isInteger(batteryId)) {
    throw new Error('Некорректный battery_id');
  }

  if (hasUnsavedBatteryChanges()) {
    const proceed = confirm('Есть несохранённые изменения. Открыть копию без сохранения?');
    if (!proceed) return;
  }

  setIsRestoringBattery(true);

  try {
    const data = await fetchBatteryAssembly(batteryId);

    resetBatteryPageStateForRestore();
    clearBatteryDuplicateDraftState();
    applyBatteryDuplicateDraftDataToState(data, battery);
    state.ui.duplicateSourceBatteryId = batteryId;

    await loadTapes();
    await finalizeBatteryDuplicateDraftPage();

    window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
    showBatteryInlineStatus(
      'battery_create_btn',
      'Черновик копии открыт. Аккумулятор ещё не создан.'
    );
  } catch (err) {
    console.error(err);
    throw err;
  } finally {
    setIsRestoringBattery(false);
  }
}

function getBatteryPrintReportUrl(batteryId) {
  return `/workflow/battery-print.html?battery_id=${encodeURIComponent(batteryId)}`;
}

function openBatteryPrintReport(batteryId) {
  if (!batteryId) return;
  window.BADB_AUTH?.openAuthenticatedWindow(getBatteryPrintReportUrl(batteryId));
}

async function openBatteryRecord(battery) {
  await populateBatteryForm(battery);
  window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
}

// Load a battery for editing
async function loadBatteryAssembly(batteryId) {
  setIsRestoringBattery(true);

  try {
    const data = await fetchBatteryAssembly(batteryId);

    resetBatteryPageStateForRestore();
    const {
      savedCathodeBatchId,
      savedAnodeBatchId
    } = applyBatteryAssemblyDataToState(data);

    applyBatteryStatusState(data.battery, data);
    await loadSavedSourceBatches();
    await loadSavedStackElectrodes(savedCathodeBatchId, savedAnodeBatchId);
    finalizeRestoredBatteryPage(data);
  } catch (err) {
    console.error(err);
  } finally {
    setIsRestoringBattery(false);
  }
}


// -------- Render: Lists / Stack --------

function normalizeBatteryListFilterText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
}

function getBatteryListFilterState() {
  return {
    text: normalizeBatteryListFilterText(batteryListFilterTextInput?.value),
    status: batteryListFilterStatusSelect?.value || '',
    formFactor: batteryListFilterFormFactorSelect?.value || ''
  };
}

function hasActiveBatteryListFilters(filters = getBatteryListFilterState()) {
  return Boolean(filters.text || filters.status || filters.formFactor);
}

function formatBatteryCoinSize(code) {
  return code ? String(code) : '';
}

function formatBatteryBatchGeometry(shape, diameterMm, lengthMm, widthMm) {
  if (shape === 'circle' && diameterMm != null) {
    return `${diameterMm} mm`;
  }

  if (lengthMm != null && widthMm != null) {
    return `${lengthMm}×${widthMm} mm`;
  }

  if (lengthMm != null) return `${lengthMm} mm`;
  if (widthMm != null) return `${widthMm} mm`;

  return '';
}

function formatBatteryPouchSize(battery) {
  const cathodeSize = formatBatteryBatchGeometry(
    battery.cathode_batch_shape,
    battery.cathode_batch_diameter_mm,
    battery.cathode_batch_length_mm,
    battery.cathode_batch_width_mm
  );

  const anodeSize = formatBatteryBatchGeometry(
    battery.anode_batch_shape,
    battery.anode_batch_diameter_mm,
    battery.anode_batch_length_mm,
    battery.anode_batch_width_mm
  );

  if (cathodeSize && anodeSize && cathodeSize === anodeSize) {
    return cathodeSize;
  }

  if (cathodeSize && anodeSize) {
    return `C ${cathodeSize} / A ${anodeSize}`;
  }

  return cathodeSize || anodeSize || '';
}

function formatBatteryVisibleSizeInfo(battery) {
  if (battery.form_factor === 'coin') {
    const electrodeSize = formatBatteryPouchSize(battery);
    return [
      formatBatteryCoinSize(battery.coin_size_code),
      electrodeSize ? `электроды ${electrodeSize}` : ''
    ].filter(Boolean).join(' / ');
  }

  if (isPouchLikeFormFactor(battery.form_factor)) {
    return formatBatteryPouchSize(battery);
  }

  return '';
}

function formatBatteryActiveMaterials(battery) {
  const cathodeMaterials = battery.cathode_active_materials || '';
  const anodeMaterials = battery.anode_active_materials || '';

  if (cathodeMaterials && anodeMaterials) {
    return `C ${cathodeMaterials} / A ${anodeMaterials}`;
  }

  if (cathodeMaterials) {
    return `C ${cathodeMaterials}`;
  }

  if (anodeMaterials) {
    return `A ${anodeMaterials}`;
  }

  return '';
}

function formatBatteryListDate(value, fallbackValue = null) {
  const source = value || fallbackValue;

  if (!source) return '';

  const date = new Date(source);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString('ru-RU');
}

function getBatteryListProjectLabel(battery) {
  return battery.project_names || battery.project_name || '—';
}

function getBatteryListStatusFilterValue(status) {
  return normalizeBatteryStatusForDisplay(status) || 'open';
}

function getBatteryListSearchText(battery) {
  const status = getBatteryStatusLabel(battery.status);
  const createdDate = formatBatteryListDate(battery.item_created_at, battery.created_at);
  const updatedDate = formatBatteryListDate(battery.updated_at, battery.created_at);
  const sizeInfo = formatBatteryVisibleSizeInfo(battery);
  const materialsInfo = formatBatteryActiveMaterials(battery);
  const title = `#${battery.battery_id} | ${getBatteryListProjectLabel(battery)}`;

  return normalizeBatteryListFilterText([
    battery.battery_id,
    `#${battery.battery_id}`,
    title,
    battery.project_names,
    battery.project_name,
    battery.project_id,
    battery.form_factor,
    status,
    createdDate,
    updatedDate,
    materialsInfo,
    sizeInfo,
    battery.notes,
    battery.battery_notes,
    battery.created_by_name,
    battery.created_by
  ].filter(Boolean).join(' '));
}

function matchesBatteryListFilters(battery, filters = getBatteryListFilterState()) {
  if (filters.status && getBatteryListStatusFilterValue(battery.status) !== filters.status) {
    return false;
  }

  if (filters.formFactor && battery.form_factor !== filters.formFactor) {
    return false;
  }

  if (filters.text && !getBatteryListSearchText(battery).includes(filters.text)) {
    return false;
  }

  return true;
}

function updateBatteryListFilterSummary(filteredCount, totalCount) {
  if (!batteryListFilterSummary) return;

  const hasFilters = hasActiveBatteryListFilters();

  if (totalCount === 0) {
    batteryListFilterSummary.textContent = 'Нет аккумуляторов';
    return;
  }

  batteryListFilterSummary.textContent = hasFilters
    ? `Показано ${filteredCount} из ${totalCount}`
    : `Всего: ${totalCount}`;
}

function renderBatteryEmptyListRow(list, totalCount, hasFilters) {
  const emptyRow = document.createElement('li');
  emptyRow.className = 'user-row battery-empty-row';
  emptyRow.textContent = totalCount === 0
    ? 'Аккумуляторы пока не добавлены.'
    : hasFilters
      ? 'Аккумуляторы по выбранным фильтрам не найдены.'
      : 'Аккумуляторы не найдены.';
  list.appendChild(emptyRow);
}

function renderBatteriesList() {
  const list = document.getElementById('batteriesList');

  if (!list) return;

  const batteries = Array.isArray(state.selection.batteries)
    ? state.selection.batteries
    : [];
  const filters = getBatteryListFilterState();
  const hasFilters = hasActiveBatteryListFilters(filters);
  const filteredBatteries = batteries.filter(battery =>
    matchesBatteryListFilters(battery, filters)
  );

  list.innerHTML = '';
  updateBatteryListFilterSummary(filteredBatteries.length, batteries.length);

  if (filteredBatteries.length === 0) {
    renderBatteryEmptyListRow(list, batteries.length, hasFilters);
    return;
  }

  filteredBatteries.forEach(b => {
    
    const li = document.createElement('li');
    li.className = 'user-row battery-list-row';

    const status = getBatteryStatusLabel(b.status);
    const createdDate = formatBatteryListDate(b.item_created_at, b.created_at);
    const updatedDate = formatBatteryListDate(b.updated_at, b.created_at);
    const sizeInfo = formatBatteryVisibleSizeInfo(b);
    const materialsInfo = formatBatteryActiveMaterials(b);
    const projectLabel = getBatteryListProjectLabel(b);
    const operatorLabel = b.created_by_name || b.created_by || '';
    const titleText = materialsInfo || projectLabel;

    const info = document.createElement('button');
    info.type = 'button';
    info.className = 'user-info record-open-button battery-list-open-button';
    info.title = 'Открыть аккумулятор';
    info.setAttribute('aria-label', `Открыть аккумулятор #${b.battery_id}`);

    const titleLine = document.createElement('span');
    titleLine.className = 'battery-list-title-line';

    const title = document.createElement('strong');
    title.className = 'battery-list-title';
    title.textContent = `#${b.battery_id} | ${titleText}`;

    const dateSpan = document.createElement('small');
    dateSpan.className = 'battery-list-secondary';
    dateSpan.title = [
      createdDate ? `Дата создания: ${createdDate}` : '',
      updatedDate ? `Изменено: ${updatedDate}` : ''
    ].filter(Boolean).join('; ');
    if (createdDate || updatedDate) {
      dateSpan.append(' — ');
    }
    if (createdDate) {
      dateSpan.append('создано ');
      const createdDateValue = document.createElement('span');
      createdDateValue.className = 'list-created-date-value';
      createdDateValue.textContent = createdDate;
      dateSpan.appendChild(createdDateValue);
    }
    if (updatedDate) {
      if (createdDate) dateSpan.append(' | ');
      dateSpan.append(`изм. ${updatedDate}`);
    }

    const creatorSpan = document.createElement('small');
    creatorSpan.className = 'battery-list-secondary';
    creatorSpan.textContent = operatorLabel ? ` — ${operatorLabel}` : '';

    titleLine.appendChild(title);
    titleLine.appendChild(dateSpan);
    titleLine.appendChild(creatorSpan);

    const metaLine = document.createElement('span');
    metaLine.className = 'battery-list-meta';
    metaLine.textContent = [
      formatBatteryFormFactorLabel(b.form_factor),
      status,
      sizeInfo,
      materialsInfo ? projectLabel : ''
    ].filter(Boolean).join(' — ');

    info.appendChild(titleLine);
    info.appendChild(metaLine);

    info.addEventListener('click', async () => {
      await openBatteryRecord(b);
    });

    const actions = document.createElement('div');
    actions.className = 'actions';

    const printBtn = document.createElement('button');
    printBtn.type = 'button';
    printBtn.textContent = '🖨️';
    printBtn.title = 'Печать отчёта';
    printBtn.setAttribute('aria-label', `Печать отчёта аккумулятора #${b.battery_id}`);
    printBtn.addEventListener('click', () => {
      openBatteryPrintReport(b.battery_id);
    });

    const duplicateBtn = document.createElement('button');
    duplicateBtn.type = 'button';
    duplicateBtn.textContent = '📑';
    duplicateBtn.title = 'Дублировать аккумулятор';
    duplicateBtn.setAttribute('aria-label', `Дублировать аккумулятор #${b.battery_id}`);

    duplicateBtn.addEventListener('click', async () => {
      if (duplicateBtn.dataset.loading === 'true') return;

      duplicateBtn.dataset.loading = 'true';
      duplicateBtn.disabled = true;

      try {
        await duplicateBatteryRecord(b);
      } catch (err) {
        console.error(err);
        showBatteryInlineStatus(
          'battery_create_btn',
          'Ошибка дублирования аккумулятора',
          true
        );
      } finally {
        delete duplicateBtn.dataset.loading;
        duplicateBtn.disabled = false;
      }
    });

    actions.appendChild(printBtn);
    actions.appendChild(duplicateBtn);
    li.appendChild(info);
    li.appendChild(actions);
    list.appendChild(li);
    
  });
  
}

function renderTapeOptions() {
  const cathodeSelect = document.getElementById('cathode_tape_id');
  const anodeSelect = document.getElementById('anode_tape_id');

  if (!cathodeSelect || !anodeSelect) return;

  renderTapeOptionsForSelect(
    cathodeSelect,
    'cathode',
    getPrimaryElectrodeSource('cathode')?.tape_id || cathodeSelect.value || ''
  );
  renderTapeOptionsForSelect(
    anodeSelect,
    'anode',
    getPrimaryElectrodeSource('anode')?.tape_id || anodeSelect.value || ''
  );
}

function formatElectrodeBatchGeometry(batch) {
  if (batch.shape === 'circle' && batch.diameter_mm != null) {
    return `${batch.diameter_mm} mm`;
  }

  if (batch.length_mm != null && batch.width_mm != null) {
    return `${batch.length_mm}×${batch.width_mm} mm`;
  }

  if (batch.length_mm != null) return `${batch.length_mm} mm`;
  if (batch.width_mm != null) return `${batch.width_mm} mm`;

  return '';
}

function formatTapeSidednessLabel(value) {
  if (value === 'one_sided') return '1-сторонняя';
  if (value === 'two_sided') return '2-сторонняя';
  return '';
}

function formatElectrodeSidednessLabel(value) {
  if (value === 'one_sided') return '1-сторонний';
  if (value === 'two_sided') return '2-сторонний';
  return '';
}

function formatElectrodesSidednessLabel(value) {
  if (value === 'one_sided') return '1-сторонние';
  if (value === 'two_sided') return '2-сторонние';
  return '';
}

function deriveSelectedBatterySidedness() {
  const selectedBatchIds = [
    ...getSelectedSourceBatchIds('cathode'),
    ...getSelectedSourceBatchIds('anode')
  ].map(String);
  const selectedTapeIds = [
    ...getSelectedSourceTapeIds('cathode'),
    ...getSelectedSourceTapeIds('anode')
  ].map(String);
  const selectedBatch = [
    ...state.reference.cathodeBatches,
    ...state.reference.anodeBatches,
    ...state.reference.cutBatches
  ].find(batch => selectedBatchIds.includes(String(batch.cut_batch_id)));
  const selectedTape = state.reference.tapes.find(
    tape => selectedTapeIds.includes(String(tape.tape_id))
  );

  return selectedBatch?.coating_sidedness
    || selectedTape?.coating_sidedness
    || '';
}

function formatElectrodeBatchTarget(batch) {
  const formFactor = batch.target_form_factor || '';
  const code = batch.target_config_code || '';

  if (!formFactor && !code) return '';
  if (formFactor && code) return `${formFactor} ${code}`;
  return formFactor || code;
}

function formatElectrodeBatchOptionLabel(batch) {
  const parts = [`#${batch.cut_batch_id}`];
  const sidedness = formatElectrodesSidednessLabel(batch.coating_sidedness);
  const target = formatElectrodeBatchTarget(batch);
  const geometry = formatElectrodeBatchGeometry(batch);
  const count = Number(batch.electrode_count) || 0;
  const tapeLabel = batch.tape_name ? `лента: ${batch.tape_name}` : '';
  const tapeStatus = batch.tape_availability_status === 'depleted'
    ? 'лента списана / израсходована'
    : '';

  if (sidedness) {
    parts.push(sidedness);
  }

  if (target) {
    parts.push(target);
  }

  if (geometry) {
    parts.push(geometry);
  }

  if (count) {
    parts.push(`${count} эл.`);
  }

  if (tapeLabel) {
    parts.push(tapeLabel);
  }

  if (tapeStatus) {
    parts.push(tapeStatus);
  }

  if (batch.created_by_name || batch.created_by) {
    parts.push(batch.created_by_name || batch.created_by);
  }

  return parts.join(' | ');
}

function getBatchProjectIds(batch) {
  return normalizeProjectIds(batch?.project_ids || batch?.project_id);
}

function batchMatchesProjectFilter(batch) {
  const projectFilterId = projectFilterSelect?.value || '';
  if (!projectFilterId) return true;
  return getBatchProjectIds(batch).includes(String(projectFilterId));
}

function hasBatchProjectOverlap(batch, oppositeBatch) {
  if (!batch || !oppositeBatch) return true;
  const batchProjectIds = getBatchProjectIds(batch);
  const oppositeProjectIds = getBatchProjectIds(oppositeBatch);
  if (!batchProjectIds.length || !oppositeProjectIds.length) return false;
  return batchProjectIds.some((projectId) => oppositeProjectIds.includes(projectId));
}

function renderCathodeBatchOptions() {
  const select = document.getElementById('cathode_cut_batch_id');
  renderBatchOptionsForSelect(select, 'cathode', getPrimaryElectrodeSource('cathode') || {});
}

function renderAnodeBatchOptions() {
  const select = document.getElementById('anode_cut_batch_id');
  renderBatchOptionsForSelect(select, 'anode', getPrimaryElectrodeSource('anode') || {});
}

function renderStackTables() {
  renderCathodeElectrodeTable();
  renderAnodeElectrodeTable();
  renderStackSummary();
}


function renderCathodeElectrodeTable() {
  
  const body =
  document.getElementById('stack_cathode_table_body');
  
  body.innerHTML = '';
  //      selectedCathodes = [];
  //     renderStackSummary();
  
  state.reference.cathodeElectrodes.forEach((e, index) => {
    
    const tr = document.createElement('tr');
    tr.classList.toggle('stack-electrode-unavailable', !isAvailableElectrodeStatus(e.status_code));
    
    const numCell = document.createElement('td');
    numCell.textContent = index + 1;
    tr.appendChild(numCell);
    
    const idCell = document.createElement('td');
    idCell.textContent = e.electrode_id;
    tr.appendChild(idCell);
    
    const massCell = document.createElement('td');
    massCell.textContent = e.electrode_mass_g ?? '';
    tr.appendChild(massCell);

    tr.appendChild(renderBatteryElectrodeCapacityCell(e));
    
    const selectCell = document.createElement('td');
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = e.electrode_id;
    checkbox.dataset.available = isAvailableElectrodeStatus(e.status_code) ? 'true' : 'false';
    checkbox.checked = state.stack.selectedCathodes.some(
      el => idsMatch(el.electrode_id, e.electrode_id)
    );
    
    checkbox.addEventListener('click', event => {
      handleStackElectrodeClick(event, 'cathode');
    });
    
    selectCell.appendChild(checkbox);
    tr.appendChild(selectCell);
    
    body.appendChild(tr);
    
  });

  renderStackUiState();
  
}

function renderAnodeElectrodeTable() {
  
  const body =
  document.getElementById('stack_anode_table_body');
  
  body.innerHTML = '';
  //      selectedAnodes = [];
  //      renderStackSummary();
  
  state.reference.anodeElectrodes.forEach((e, index) => {
    
    const tr = document.createElement('tr');
    tr.dataset.anodeElectrodeRow = 'true';
    tr.dataset.electrodeId = e.electrode_id;
    tr.classList.toggle('stack-electrode-unavailable', !isAvailableElectrodeStatus(e.status_code));
    
    const numCell = document.createElement('td');
    numCell.textContent = index + 1;
    tr.appendChild(numCell);
    
    const idCell = document.createElement('td');
    idCell.textContent = e.electrode_id;
    tr.appendChild(idCell);
    
    const massCell = document.createElement('td');
    massCell.textContent = e.electrode_mass_g ?? '';
    tr.appendChild(massCell);

    tr.appendChild(renderBatteryElectrodeCapacityCell(e));

    tr.appendChild(renderBatteryNpDeltaCell());
    
    const selectCell = document.createElement('td');
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = e.electrode_id;
    checkbox.dataset.available = isAvailableElectrodeStatus(e.status_code) ? 'true' : 'false';
    checkbox.checked = state.stack.selectedAnodes.some(
      el => idsMatch(el.electrode_id, e.electrode_id)
    );
    
    checkbox.addEventListener('click', event => {
      handleStackElectrodeClick(event, 'anode');
    });
    
    selectCell.appendChild(checkbox);
    tr.appendChild(selectCell);
    
    body.appendChild(tr);
    
  });

  renderStackUiState();
  
}

function normalizeBatteryStackRole(role) {
  const value = String(role || '').trim().toLowerCase();

  if (value === 'cathode' || value === 'катод') return 'cathode';
  if (value === 'anode' || value === 'анод') return 'anode';

  return '';
}

function formatBatteryStackRoleLabel(role) {
  const normalized = normalizeBatteryStackRole(role);

  if (normalized === 'cathode') return 'Катод';
  if (normalized === 'anode') return 'Анод';

  return role || '';
}

function getBatteryStackSummaryRoleClass(role) {
  return normalizeBatteryStackRole(role) === 'cathode'
    ? 'battery-stack-summary-cathode'
    : 'battery-stack-summary-anode';
}


function renderStackSummary() {
  
  const body =
  document.getElementById('battery_stack_summary_body');
  
  body.innerHTML = '';
  const { cathodes, anodes } = getEffectiveBatterySelections();
  
  /* ---------- sort by mass (descending) ---------- */
  
  cathodes.sort((a,b)=>b.electrode_mass_g-a.electrode_mass_g);
  anodes.sort((a,b)=>b.electrode_mass_g-a.electrode_mass_g);
  
  /* ---------- interleave A-C-A-C ---------- */
  
  const stack = [];
  
  const max =
  Math.max(cathodes.length, anodes.length);
  
  for (let i=0;i<max;i++){
    
    if (anodes[i]) {
      stack.push({
        ...anodes[i],
        role: 'anode'
      });
    }
    
    if (cathodes[i]) {
      stack.push({
        ...cathodes[i],
        role: 'cathode'
      });
    }
    
  }
  
  /* ---------- render stack ---------- */
  
  stack.forEach((e,index)=>{
    
    const tr = document.createElement('tr');
    tr.classList.add(getBatteryStackSummaryRoleClass(e.role));
    
    const posCell = document.createElement('td');
    posCell.textContent = index+1;
    tr.appendChild(posCell);
    
    const idCell = document.createElement('td');
    idCell.textContent = e.electrode_id;
    tr.appendChild(idCell);
    
    const roleCell = document.createElement('td');
    roleCell.textContent = formatBatteryStackRoleLabel(e.role);
    tr.appendChild(roleCell);
    
    const massCell = document.createElement('td');
    massCell.textContent = e.electrode_mass_g ?? '';
    tr.appendChild(massCell);

    tr.appendChild(renderBatteryElectrodeCapacityCell(e));
    
    body.appendChild(tr);
    
  });

  renderBatteryCapacitySummary();
  renderBatteryNpAssist();
  renderAnodeNpGuidance();
  
}



// -------- Validation / Business Rules --------

function buildStackPayload() {
  const stack = [];
  let position = 1;
  const formFactor = state.meta.form_factor;
  const coinCellMode = state.config.coin?.coin_cell_mode || null;
  const halfCellType = state.config.coin?.half_cell_type || null;
  let cathodes = [...state.stack.selectedCathodes];
  let anodes = [...state.stack.selectedAnodes];

  if (formFactor === 'coin' && coinCellMode === 'half_cell') {
    if (halfCellType === 'cathode_vs_li') {
      cathodes = cathodes.slice(0, 1);
      anodes = [];
    }

    if (halfCellType === 'anode_vs_li') {
      anodes = anodes.slice(0, 1);
      cathodes = [];
    }
  }

  if (formFactor === 'coin' && coinCellMode === 'full_cell') {
    cathodes = cathodes.slice(0, 1);
    anodes = anodes.slice(0, 1);
  }

  const maxLen = Math.max(cathodes.length, anodes.length);
  
  for (let i = 0; i < maxLen; i++) {
    
    if (anodes[i]) {
      stack.push({
        electrode_id: anodes[i].electrode_id,
        role: 'anode',
        position_index: position++
      });
    }
    
    if (cathodes[i]) {
      stack.push({
        electrode_id: cathodes[i].electrode_id,
        role: 'cathode',
        position_index: position++
      });
    }
    
  }
  
  stack.forEach((row, index) => {
    row.position_index = index + 1;
  });
  
  return stack;
  
}

function validateStackBalance() {
  const statusTargetId = 'battery_stack_save_btn';
  
  const formFactor = state.meta.form_factor;
  
  const coinCellMode = state.config.coin?.coin_cell_mode || null;
  
  const cathodes = state.stack.selectedCathodes.length;
  const anodes = state.stack.selectedAnodes.length;
  const targets = getStackTargetCounts();
  
  // For half-cells, balance does not apply
  if (formFactor === 'coin' && coinCellMode === 'half_cell') {
    return true;
  }
  
  if (formFactor === 'coin') {
    if (cathodes !== 1 || anodes !== 1) {
      showBatteryInlineStatus(
        statusTargetId,
        'Для полного монеточного элемента нужен ровно 1 катод и ровно 1 анод.',
        true
      );
      return false;
    }

    return true;
  }

  if (isMultiElectrodeFormFactor(formFactor)) {
    if (!targets.valid) {
      showBatteryInlineStatus(
        statusTargetId,
        'Укажите количество катодов и выберите режим количества анодов.',
        true
      );
      return false;
    }

    if (cathodes !== targets.cathodes || anodes !== targets.anodes) {
      showBatteryInlineStatus(
        statusTargetId,
        `Выберите ровно указанное количество электродов: катодов = ${targets.cathodes}, анодов = ${targets.anodes}.`,
        true
      );
      return false;
    }
  }

  if (!(anodes === cathodes || anodes === cathodes + 1)) {
    showBatteryInlineStatus(
      statusTargetId,
      `Несбалансированный стек: катодов = ${cathodes}, анодов = ${anodes}. ` +
      'Для пакетного и цилиндрического элемента количество анодов должно совпадать с количеством катодов или быть больше на один.',
      true
    );
    return false;
  }
  
  return true;
  
}

function validateStackSelection() {
  const statusTargetId = 'battery_stack_save_btn';
  
  const formFactor = state.meta.form_factor;
  
  const coinCellMode = state.config.coin?.coin_cell_mode || null;
  
  const halfCellType = state.config.coin?.half_cell_type || null;
  
  const cathodes = state.stack.selectedCathodes.length;
  const anodes = state.stack.selectedAnodes.length;
  const targets = getStackTargetCounts();
  
  /* ----- coin half-cell rules ----- */
  
  if (formFactor === 'coin' && coinCellMode === 'half_cell') {
    
    if (halfCellType === 'cathode_vs_li') {
      
      if (cathodes !== 1 || anodes !== 0) {
        showBatteryInlineStatus(
          statusTargetId,
          'Для полуячейки cathode_vs_li нужен ровно 1 катод и ни одного анода.',
          true
        );
        return false;
      }
      
      return true;
    }
    
    if (halfCellType === 'anode_vs_li') {
      
      if (anodes !== 1 || cathodes !== 0) {
        showBatteryInlineStatus(
          statusTargetId,
          'Для полуячейки anode_vs_li нужен ровно 1 анод и ни одного катода.',
          true
        );
        return false;
      }
      
      return true;
    }
    
    showBatteryInlineStatus(statusTargetId, 'Выберите тип полуячейки.', true);
    return false;
    
  }
  
  /* ----- full-cell / pouch / prism / cylindrical rules ----- */

  if (isMultiElectrodeFormFactor(formFactor) && !targets.valid) {
    showBatteryInlineStatus(
      statusTargetId,
      'Укажите количество катодов и выберите режим количества анодов.',
      true
    );
    return false;
  }
  
  if (cathodes === 0) {
    showBatteryInlineStatus(statusTargetId, 'Выберите хотя бы один катод.', true);
    return false;
  }
  
  if (anodes === 0) {
    showBatteryInlineStatus(statusTargetId, 'Выберите хотя бы один анод.', true);
    return false;
  }
  
  if (!validateStackBalance()) {
    return false;
  }
  
  return true;
  
}

function resetElectrodeSelection() {
  
  resetSelectedElectrodes();
  
  setCathodeElectrodes([]);
  setAnodeElectrodes([]);
  
  setCathodeBatches([]);
  setAnodeBatches([]);
  setElectrodeSourcesState(getDefaultElectrodeSourcesState());
  setBatteryProjectIds([], { render: false });
  renderElectrodeSourcesForm();
  
  document.getElementById('cathode_cut_batch_id').innerHTML =
  '<option value="">— выбрать партию —</option>';
  
  document.getElementById('anode_cut_batch_id').innerHTML =
  '<option value="">— выбрать партию —</option>';
  
  document.getElementById('stack_cathode_table_body').innerHTML = '';
  document.getElementById('stack_anode_table_body').innerHTML = '';
  
  resetElectrodeUiState();
  renderStackSummary();
  updateDirtyFlags();
  
}

function renderFormFactorSections() {
  const formFactor = state.meta.form_factor;
  const coinConfig = document.getElementById('coin_config');
  const pouchConfig = document.getElementById('pouch_config');
  const cylConfig = document.getElementById('cyl_config');
  const coinAssembly = document.getElementById('coin_assembly');
  const pouchAssembly = document.getElementById('pouch_assembly');
  const cylAssembly = document.getElementById('cyl_assembly');
  const coinTotalVolumeInput = document.getElementById('coin_electrolyte_total_ul');
  const pouchTotalVolumeInput = document.getElementById('pouch_electrolyte_total_ul');
  const cylTotalVolumeInput = document.getElementById('cyl_electrolyte_total_ul');

  coinConfig.hidden = formFactor !== 'coin';
  pouchConfig.hidden = !isPouchLikeFormFactor(formFactor);
  cylConfig.hidden = formFactor !== 'cylindrical';

  coinAssembly.hidden = formFactor !== 'coin';
  pouchAssembly.hidden = !isPouchLikeFormFactor(formFactor);
  cylAssembly.hidden = formFactor !== 'cylindrical';

  if (coinTotalVolumeInput) coinTotalVolumeInput.readOnly = false;
  if (pouchTotalVolumeInput) pouchTotalVolumeInput.readOnly = false;
  if (cylTotalVolumeInput) cylTotalVolumeInput.readOnly = false;
}

function renderCoinCellModeUi() {
  const halfTypeBlock = document.getElementById('coin_half_cell_type_block');

  if (!halfTypeBlock) return;

  halfTypeBlock.hidden = state.config.coin?.coin_cell_mode !== 'half_cell';
}

function renderPouchCaseSizeUi() {
  const otherBlock = document.getElementById('pouch_case_size_other_block');
  const otherInput = document.getElementById('pouch_case_size_other');
  const shouldShowOther = state.config.pouch?.pouch_case_size_code === 'other';

  if (!otherBlock) return;

  otherBlock.hidden = !shouldShowOther;

  if (!shouldShowOther && otherInput && !state.ui.isRestoringBattery) {
    otherInput.value = '';
  }
}

function renderHalfCellTypeUi() {
  const context = getBatterySourceRoleContext();
  const requiredRoles = getRequiredBatterySourceRolesForContext(context);
  const cathodeBlock = document.getElementById('cathode_source_block');
  const anodeBlock = document.getElementById('anode_source_block');
  const liFoilBlock = document.getElementById('li-foil_block');
  const shouldHideSourceBlocks = isBatteryIdentityLocked();
  const hasResolvedHalfCellType =
    context.formFactor === 'coin' &&
    context.coinMode === 'half_cell' &&
    (
      context.halfCellType === 'cathode_vs_li' ||
      context.halfCellType === 'anode_vs_li'
    );

  if (cathodeBlock) cathodeBlock.hidden = false;
  if (anodeBlock) anodeBlock.hidden = false;
  if (liFoilBlock) liFoilBlock.hidden = true;

  if (shouldHideSourceBlocks) {
    if (cathodeBlock) cathodeBlock.hidden = true;
    if (anodeBlock) anodeBlock.hidden = true;
    return;
  }

  if (cathodeBlock) cathodeBlock.hidden = !requiredRoles.includes('cathode');
  if (anodeBlock) anodeBlock.hidden = !requiredRoles.includes('anode');
  if (liFoilBlock) liFoilBlock.hidden = !hasResolvedHalfCellType;
}

function trimStackSelectionForCurrentMode() {
  const { formFactor, coinMode, halfCellType } = getStackSelectionContext();
  const targets = getStackTargetCounts();

  if (formFactor === 'coin' && coinMode === 'half_cell') {
    if (halfCellType === 'cathode_vs_li') {
      setSelectedCathodes(state.stack.selectedCathodes.slice(0, 1));
      setSelectedAnodes([]);
      return;
    }

    if (halfCellType === 'anode_vs_li') {
      setSelectedCathodes([]);
      setSelectedAnodes(state.stack.selectedAnodes.slice(0, 1));
      return;
    }
  }

  if (formFactor === 'coin' && coinMode === 'full_cell') {
    setSelectedCathodes(state.stack.selectedCathodes.slice(0, 1));
    setSelectedAnodes(state.stack.selectedAnodes.slice(0, 1));
    return;
  }

  if (isMultiElectrodeFormFactor(formFactor) && targets.valid) {
    setSelectedCathodes(state.stack.selectedCathodes.slice(0, targets.cathodes));
    setSelectedAnodes(state.stack.selectedAnodes.slice(0, targets.anodes));
  }
}

function isCoinSingleSelectionMode() {
  return state.meta.form_factor === 'coin';
}

// -------- Validation / Business Rules: UI Flows --------

function renderInteractiveBatteryState() {
  renderBatteryWorkspaceVisibility();
  renderBatteryCreateButton();
  renderElectrolyteCapacityRatios();
  refreshDirtyState();
  renderBatterySectionLifecycle();
  renderStackUiState();
  renderBatteryStatusControl();
}

function shouldRenderInteractiveBatteryState() {
  return !state.ui.isRestoringBattery;
}

function finalizeInteractiveBatteryChange() {
  if (shouldRenderInteractiveBatteryState()) {
    renderInteractiveBatteryState();
  }
}

function finalizeStackModeChange() {
  if (!shouldRenderInteractiveBatteryState()) {
    return;
  }

  trimStackSelectionForCurrentMode();
  renderStackTables();
  renderInteractiveBatteryState();
}

function handleBatteryFormMutation() {
  syncAllSectionStateFromDom();

  if (state.ui.isRestoringBattery) return;

  renderInteractiveBatteryState();
}

async function handleBatteryStatusChange() {
  const statusTargetId = 'battery_qc_save_btn';

  return withBatteryInlineSaveStatus(statusTargetId, async () => {
  syncQcStateFromDom();

  try {
    const updatedBattery = await saveBatteryStatus();
    setCurrentBattery({
      ...(state.selection.currentBattery || {}),
      ...(updatedBattery || {}),
      status: updatedBattery?.status || state.qc.status || null
    });
    setQcState({
      ...state.qc,
      status: updatedBattery?.status || state.qc.status || null
    });
    renderBatteryStatusControl();
    refreshDirtyState();
    showBatteryInlineStatus(statusTargetId, 'Статус батареи сохранён.');
  } catch (err) {
    console.error(err);
    showBatteryInlineStatus(
      statusTargetId,
      err.message || 'Ошибка сохранения статуса батареи',
      true
    );
  }
  }, 'Ошибка сохранения статуса батареи');
}

function resetBatteryPageState({ openForm = false } = {}) {
  setCurrentBattery(null);
  clearBatteryDuplicateDraftState();
  setBatteryFormOpen(openForm);
  setLoadedAssemblyComplete(false);
  setBatteryCreateButtonMode('create');
  resetBatteryDeleteFlow();
  resetBatterySectionState();
  state.snapshots.savedSectionStates = {};
  clearBatteryInlineStatuses();

  document.querySelector('form[name="battery_assembly_log_form"]').reset();

  resetBatteryNpAssistState();
  resetElectrodeSelection();
  renderFormFactorSections();
  renderCoinCellModeUi();
  renderHalfCellTypeUi();
  renderBatteryPage();
  clearDirtyFlags();
}

async function handleExitBatteryPage() {
  if (hasUnsavedBatteryChanges()) {
    const confirmExit = confirm('Выйти без сохранения?');

    if (!confirmExit) return;
  }

  resetBatteryPageState();
  await loadBatteries();
}

async function handleDeleteBatteryClick() {
  const batteryId = state.selection.currentBatteryId;

  if (!batteryId) return;

  if (hasUnsavedBatteryChanges()) {
    const proceed = confirm('Есть несохранённые изменения. Удалить запись без сохранения?');
    if (!proceed) return;
  }

  resetBatteryDeleteFlow();

  const checkRes = await fetch(`/api/batteries/${batteryId}/delete-check`);
  const check = await checkRes.json().catch(() => ({}));

  if (!checkRes.ok) {
    showBatteryInlineStatus(
      'deleteBatteryBtn',
      formatBatterySaveError(check, 'Аккумулятор пока не готов к удалению'),
      true,
      { clearAfterMs: 18000 }
    );
    scrollBatteryDeleteFlowIntoView();
    return;
  }

  if (!check.can_delete || getBatteryDeleteHardBlockers(check).length > 0) {
    setBatteryDeleteFlow({
      step: 'blocked',
      check
    });
    scrollBatteryDeleteFlowIntoView();
    return;
  }

  setBatteryDeleteFlow({
    step: getBatteryDeleteLinkedElectrodes(check).length > 0 ? 'choose-electrodes' : 'confirm',
    check,
    electrodeDisposition: 'available',
    scrappedReason: ''
  });
  scrollBatteryDeleteFlowIntoView();
}

function handleAddBatteryClick() {
  resetBatteryPageState({ openForm: true });
}

function buildBatteryHeaderPayloadFromState() {
  const formFactor = state.meta.form_factor || null;
  const activeConfig =
    formFactor === 'coin' ? state.config.coin
    : isPouchLikeFormFactor(formFactor) ? state.config.pouch
    : formFactor === 'cylindrical' ? state.config.cylindrical
    : {};

  return {
    ...state.electrodeSources,
    sources: getElectrodeSourcesPayloadRows(),
    ...(activeConfig || {}),
    project_id: state.meta.project_id ? Number(state.meta.project_id) : null,
    project_ids: normalizeProjectIds(state.meta.project_ids).map(Number),
    item_created_at: state.meta.item_created_at || null,
    form_factor: state.meta.form_factor || null,
    battery_notes: state.meta.battery_notes || null
  };
}

function getRequiredBatterySourceRolesFromPayload(headerPayload) {
  if (
    headerPayload.form_factor === 'coin' &&
    headerPayload.coin_cell_mode === 'half_cell'
  ) {
    if (headerPayload.half_cell_type === 'cathode_vs_li') return ['cathode'];
    if (headerPayload.half_cell_type === 'anode_vs_li') return ['anode'];
    return [];
  }

  return ['cathode', 'anode'];
}

function getBatteryHeaderValidationMessage(headerPayload) {
  if (!headerPayload.form_factor) {
    return 'Выберите форм-фактор аккумулятора.';
  }

  if (headerPayload.form_factor === 'coin') {
    if (!headerPayload.coin_cell_mode || !headerPayload.coin_size_code) {
      return 'Для монеточного элемента выберите тип элемента и размер.';
    }

    if (
      headerPayload.coin_cell_mode === 'half_cell' &&
      !headerPayload.half_cell_type
    ) {
      return 'Для монеточной полуячейки выберите тип полуячейки.';
    }
  }

  if (isPouchLikeFormFactor(headerPayload.form_factor)) {
    if (!headerPayload.pouch_case_size_code) {
      return 'Для пакетного/призматического элемента выберите размер.';
    }

    if (
      headerPayload.pouch_case_size_code === 'other' &&
      !String(headerPayload.pouch_case_size_other || '').trim()
    ) {
      return 'Для другого размера пакетного/призматического элемента заполните размер.';
    }
  }

  if (headerPayload.form_factor === 'cylindrical' && !headerPayload.cyl_size_code) {
    return 'Для цилиндрического элемента выберите типоразмер.';
  }

  const requiredRoles = getRequiredBatterySourceRolesFromPayload(headerPayload);

  if (
    requiredRoles.includes('cathode') &&
    !headerPayload.cathode_cut_batch_id
  ) {
    return 'Выберите катодную партию вырезанных электродов.';
  }

  if (
    requiredRoles.includes('anode') &&
    !headerPayload.anode_cut_batch_id
  ) {
    return 'Выберите анодную партию вырезанных электродов.';
  }

  const incompleteSource = (Array.isArray(headerPayload.sources) ? headerPayload.sources : [])
    .find(row => (
      row &&
      (row.tape_id || row.cut_batch_id || String(row.source_notes || '').trim()) &&
      !row.cut_batch_id
    ));

  if (incompleteSource) {
    return 'Для каждого дополнительного источника электродов выберите партию.';
  }

  if (!Array.isArray(headerPayload.project_ids) || headerPayload.project_ids.length === 0) {
    return 'Выберите хотя бы один проект аккумулятора.';
  }

  return '';
}

function showBatteryHeaderValidationError(headerPayload, statusTargetId) {
  const message = getBatteryHeaderValidationMessage(headerPayload);

  if (message) {
    showBatteryInlineStatus(statusTargetId, message, true);
    return false;
  }

  return true;
}

async function createBatteryHeader(headerPayload) {
  const res = await fetch('/api/batteries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(headerPayload)
  });

  if (!res.ok) {
    await throwBatteryResponseError(res, 'Ошибка создания аккумулятора');
  }

  return res.json();
}

async function refreshBatteryHeaderDependencies() {
  await loadTapes();
  await loadCutBatches();
  await loadBatteries();
}

function applySavedBatteryHeaderState(battery, headerPayload, buttonMode) {
  setCurrentBattery(battery);
  setMetaState({
    project_id: battery?.project_id ?? headerPayload.project_id ?? null,
    project_ids: normalizeProjectIds(battery?.project_ids || headerPayload.project_ids || headerPayload.project_id),
    created_by: battery?.created_by ?? null,
    item_created_at: formatDateInputValue(
      battery?.item_created_at || headerPayload.item_created_at || battery?.created_at
    ),
    form_factor: battery?.form_factor ?? headerPayload.form_factor ?? null,
    battery_notes: battery?.battery_notes ?? battery?.notes ?? headerPayload.battery_notes ?? null
  });
  setBatteryCreateButtonMode(buttonMode);
  renderBatteryPage();
  markBatterySectionsSaved(['battery_meta', 'battery_config', 'electrode_sources']);
}

async function createBatteryFromHeaderPayload(headerPayload) {
  const shouldAutoSaveAssembly = Boolean(state.ui.duplicateCopiedAssembly);
  const battery = await createBatteryHeader(headerPayload);
  applySavedBatteryHeaderState(battery, headerPayload, 'createSaved');

  let assemblyAutoSaved = false;

  if (shouldAutoSaveAssembly) {
    try {
      assemblyAutoSaved = await saveBatterySeparatorElectrolyteConfig();
      if (assemblyAutoSaved) {
        renderBatteryPage();
      }
    } catch (err) {
      console.error(err);
    }
  }

  clearBatteryDuplicateDraftState();
  await refreshBatteryHeaderDependencies();

  return { assemblyAutoSaved };
}

async function updateBatteryFromHeaderPayload(headerPayload) {
  const updatedBattery = await updateBatteryMeta(
    state.selection.currentBatteryId,
    headerPayload
  );

  applySavedBatteryHeaderState(updatedBattery, headerPayload, 'edit');
  await refreshBatteryHeaderDependencies();
  await refreshBatteryStatusState();
  await autoSaveAssembledStatusTransition();
  renderBatteryPage();
}

async function handleBatteryCreateOrUpdate() {
  const statusTargetId = 'battery_create_btn';

  return withBatteryInlineSaveStatus(statusTargetId, async () => {
  syncMetaStateFromDom();
  syncConfigStateFromDom();
  syncElectrodeSourcesStateFromDom();
  if (!state.selection.currentBatteryId && state.ui.duplicateCopiedAssembly) {
    syncAssemblyStateFromDom();
  }
  autoSelectAllowedBatteryProjects();

  const headerPayload = buildBatteryHeaderPayloadFromState();

  if (!showBatteryHeaderValidationError(headerPayload, statusTargetId)) {
    return;
  }

  try {
    if (!state.selection.currentBatteryId) {
      const { assemblyAutoSaved } = await createBatteryFromHeaderPayload(headerPayload);
      showBatteryInlineStatus(
        statusTargetId,
        assemblyAutoSaved
          ? 'Аккумулятор создан. Параметры сепаратора и электролита сохранены.'
          : 'Аккумулятор создан.'
      );
      return;
    }

    await updateBatteryFromHeaderPayload(headerPayload);
    showBatteryInlineStatus(statusTargetId, 'Шапка аккумулятора сохранена.');
  } catch (err) {
    console.error(err);
    showBatteryInlineStatus(
      statusTargetId,
      formatBatterySaveError(err, 'Ошибка сохранения аккумулятора'),
      true
    );
  }
  }, 'Ошибка сохранения аккумулятора');
}

function syncAndRenderFormFactorChange() {
  syncMetaStateFromDom();
  renderFormFactorSections();
  renderCoinCellModeUi();
  renderHalfCellTypeUi();
}

async function handleFormFactorChange() {
  syncAndRenderFormFactorChange();
  resetElectrodeSelection();
  await refreshCreateModeSourceReferences();
  finalizeStackModeChange();
}

function syncAndRenderCoinCellModeChange() {
  syncConfigStateFromDom();
  renderCoinCellModeUi();
  renderHalfCellTypeUi();
}

async function handleCoinCellModeChange() {
  syncAndRenderCoinCellModeChange();
  resetElectrodeSelection();
  await refreshCreateModeSourceReferences();
  finalizeStackModeChange();
}

async function handlePouchCaseSizeChange() {
  syncConfigStateFromDom();
  renderPouchCaseSizeUi();
  resetElectrodeSelection();
  await refreshCreateModeSourceReferences();
  finalizeInteractiveBatteryChange();
}

async function handleBatteryTargetConfigChange() {
  syncConfigStateFromDom();
  resetElectrodeSelection();
  await refreshCreateModeSourceReferences();
  finalizeInteractiveBatteryChange();
}

function syncAndRenderHalfCellTypeChange() {
  syncConfigStateFromDom();
  renderHalfCellTypeUi();
}

async function handleHalfCellTypeChange() {
  syncAndRenderHalfCellTypeChange();

  if (!shouldRenderInteractiveBatteryState()) {
    return;
  }

  resetElectrodeSelection();
  await refreshCreateModeSourceReferences();
  renderInteractiveBatteryState();
}

async function refreshProjectScopedBatteryData() {
  resetElectrodeSelection();
  await loadTapes();
}

async function handleProjectChange() {
  syncAllSectionStateFromDom();
  clearRoleBatchesIncompatibleWithManualFilters('cathode', { checkProject: true });
  clearRoleBatchesIncompatibleWithManualFilters('anode', { checkProject: true });
  renderTapeOptions();
  renderCathodeBatchOptions();
  renderAnodeBatchOptions();
  renderElectrodeSourcesForm();
  autoSelectAllowedBatteryProjects();
  renderBatteryProjectMultiSelect();
  finalizeInteractiveBatteryChange();
}

async function handleSavedProjectChange() {
  syncMetaStateFromDom();
  await refreshProjectScopedBatteryData();
  finalizeInteractiveBatteryChange();
}

async function loadRoleBatches(role, tapeId) {
  if (role === 'cathode') {
    await loadCathodeBatches(tapeId);
  } else {
    await loadAnodeBatches(tapeId);
  }
}

async function handleTapeSelectionChange(role, tapeId) {
  syncElectrodeSourcesStateFromDom();
  clearRoleBatchesIncompatibleWithManualFilters(role, { checkTape: true });
  setBatteryProjectIds([], { render: false });

  await refreshRoleSourceReferences(role);

  autoSelectAllowedBatteryProjects();
  renderElectrodeSourcesForm();
  renderBatteryProjectMultiSelect();
  finalizeInteractiveBatteryChange();
}

async function loadRoleElectrodes(role, batchId) {
  if (role === 'cathode') {
    await loadCathodeElectrodes(batchId);
  } else {
    await loadAnodeElectrodes(batchId);
  }
}

async function refreshRoleSourceReferences(role) {
  await loadRoleBatchesForSources(role);
  await loadRoleElectrodesForSources(role);
}

async function refreshCreateModeSourceReferences() {
  if (state.selection.currentBatteryId) return;

  await loadRoleBatchesForSources('cathode');
  await loadRoleBatchesForSources('anode');
  renderTapeOptions();
  renderCathodeBatchOptions();
  renderAnodeBatchOptions();
  renderAdditionalSourceRows('cathode');
  renderAdditionalSourceRows('anode');
}

async function handleBatchSelectionChange(role, batchId) {
  syncElectrodeSourcesStateFromDom();
  backfillSourceRowFromSelectedBatch(role, 0, batchId);

  await refreshRoleSourceReferences(role);

  autoSelectAllowedBatteryProjects();
  renderElectrodeSourcesForm();
  renderCathodeBatchOptions();
  renderAnodeBatchOptions();
  renderAdditionalSourceRows('cathode');
  renderAdditionalSourceRows('anode');
  renderBatteryProjectMultiSelect();
  finalizeInteractiveBatteryChange();
}

async function handleSourceTapeSelectionChange(role) {
  syncElectrodeSourcesStateFromDom();
  clearRoleBatchesIncompatibleWithManualFilters(role, { checkTape: true });
  setBatteryProjectIds([], { render: false });
  await refreshRoleSourceReferences(role);
  autoSelectAllowedBatteryProjects();
  renderElectrodeSourcesForm();
  renderBatteryProjectMultiSelect();
  finalizeInteractiveBatteryChange();
}

async function handleSourceBatchSelectionChange(role, sourceIndex, batchId) {
  syncElectrodeSourcesStateFromDom();
  backfillSourceRowFromSelectedBatch(role, sourceIndex, batchId);
  await refreshRoleSourceReferences(role);
  autoSelectAllowedBatteryProjects();
  renderElectrodeSourcesForm();
  renderBatteryProjectMultiSelect();
  finalizeInteractiveBatteryChange();
}

function addElectrodeSourceRow(role) {
  syncElectrodeSourcesStateFromDom();
  const rows = getElectrodeSourceRows(role);
  const baseRows = rows.length
    ? rows
    : [normalizeElectrodeSourceRow({ is_draft: true }, role, 0)];
  setElectrodeSourceRows(role, [
    ...baseRows,
    normalizeElectrodeSourceRow({ is_draft: true }, role, baseRows.length)
  ]);
  renderElectrodeSourcesForm();
  updateDirtyFlags();
}

async function removeElectrodeSourceRow(role, sourceIndex) {
  syncElectrodeSourcesStateFromDom();
  const rows = getElectrodeSourceRows(role)
    .filter((row, index) => index !== sourceIndex);
  setElectrodeSourceRows(role, rows);
  await refreshRoleSourceReferences(role);
  autoSelectAllowedBatteryProjects();
  renderElectrodeSourcesForm();
  renderBatteryProjectMultiSelect();
  finalizeInteractiveBatteryChange();
}



// -------- Events / Init --------

// prevent default form submission
document
.querySelector('form[name="battery_assembly_log_form"]')
.addEventListener('submit', (e) => {
  e.preventDefault();
});

document
.querySelector('form[name="battery_assembly_log_form"]')
.addEventListener('input', (event) => {
  if (event.target?.closest?.('#battery_stack_builder')) {
    return;
  }

  if (event.target?.id === 'battery_status') {
    return;
  }

  handleBatteryFormMutation();
});

document
.querySelector('form[name="battery_assembly_log_form"]')
.addEventListener('change', (event) => {
  if (event.target?.closest?.('#battery_stack_builder')) {
    return;
  }

  if (event.target?.id === 'battery_status') {
    return;
  }

  handleBatteryFormMutation();
});

document
.getElementById('battery_status')
.addEventListener('change', async () => {
  await handleBatteryStatusChange();
});

/* ---------- EXIT BATTERIES ---------- */

const printBatteryBtn = document.getElementById('printBatteryBtn');

printBatteryBtn.addEventListener('click', () => {
  if (!state.selection.currentBatteryId) return;
  openBatteryPrintReport(state.selection.currentBatteryId);
});

const exitBatteriesBtn = document.getElementById('exitBatteriesBtn');

exitBatteriesBtn.addEventListener('click', async () => {
  await handleExitBatteryPage();
});

const deleteBatteryBtn = document.getElementById('deleteBatteryBtn');

deleteBatteryBtn.addEventListener('click', async () => {
  await handleDeleteBatteryClick();
});

if (batteryListFilterTextInput) {
  batteryListFilterTextInput.addEventListener('input', renderBatteriesList);
}

if (batteryListFilterStatusSelect) {
  batteryListFilterStatusSelect.addEventListener('change', renderBatteriesList);
}

if (batteryListFilterFormFactorSelect) {
  batteryListFilterFormFactorSelect.addEventListener('change', renderBatteriesList);
}

if (clearBatteryListFiltersBtn) {
  clearBatteryListFiltersBtn.addEventListener('click', () => {
    if (batteryListFilterTextInput) batteryListFilterTextInput.value = '';
    if (batteryListFilterStatusSelect) batteryListFilterStatusSelect.value = '';
    if (batteryListFilterFormFactorSelect) batteryListFilterFormFactorSelect.value = '';
    renderBatteriesList();
    batteryListFilterTextInput?.focus();
  });
}

const batteryElectrochemFilesInput = document.getElementById('electrochem_files');
const batteryElectrochemFilesSaveBtn = document.getElementById('battery_electrochem_files_save_btn');

if (batteryElectrochemFilesInput) {
  batteryElectrochemFilesInput.addEventListener('change', updateBatteryElectrochemFilesButtonVisibility);
}

if (batteryElectrochemFilesSaveBtn) {
  batteryElectrochemFilesSaveBtn.addEventListener('click', async () => {
    await saveBatteryElectrochemFiles();
  });
}

const addBatteryBtn = document.getElementById('addBatteryBtn');

addBatteryBtn.addEventListener('click', () => {
  handleAddBatteryClick();
});


document.getElementById('battery_create_btn').onclick = async () => {
  await handleBatteryCreateOrUpdate();
};

async function populateBatteryForm(battery) {
  setIsRestoringBattery(true);
  clearDirtyFlags();
  clearBatteryDuplicateDraftState();
  setBatteryFormOpen(false);
  setCurrentBattery(battery);
  setMetaState({
    project_id: battery.project_id ?? null,
    project_ids: normalizeProjectIds(battery.project_ids || battery.project_id),
    created_by: battery.created_by ?? null,
    item_created_at: formatDateInputValue(battery.item_created_at || battery.created_at),
    form_factor: battery.form_factor ?? null,
    battery_notes: battery.notes ?? battery.battery_notes ?? null
  });
  setBatteryCreateButtonMode('edit');
  renderBatteryWorkspaceVisibility();

  await loadTapes();
  await loadBatteryAssembly(battery.battery_id);
}

const formFactorSelect =
document.getElementById('battery_form_factor');

formFactorSelect.addEventListener('change', async () => {
  await handleFormFactorChange();
});


const coinCellModeSelect = document.getElementById('coin_cell_mode');
const coinSizeSelect = document.getElementById('coin_size_code');
const halfCellTypeSelect = document.getElementById('coin_half_cell_type');
const pouchCaseSizeSelect = document.getElementById('pouch_case_size_code');
const cylSizeSelect = document.getElementById('cyl_size_code');
const stackTargetCathodesInput = document.getElementById('stack_target_cathodes');
const stackTargetAnodesInput = document.getElementById('stack_target_anodes');
const stackAnodeModeButtons = Array.from(document.querySelectorAll('[data-anode-mode]'));
const batteryNpExcessInput = document.getElementById('battery_np_excess_percent');
const batteryNpSelectSuggestedBtn = document.getElementById('battery_np_select_suggested_btn');

coinCellModeSelect.addEventListener('change', async () => {
  await handleCoinCellModeChange();
});

coinSizeSelect.addEventListener('change', async () => {
  await handleBatteryTargetConfigChange();
});

halfCellTypeSelect.addEventListener('change', async () => {
  await handleHalfCellTypeChange();
});

if (pouchCaseSizeSelect) {
  pouchCaseSizeSelect.addEventListener('change', async () => {
    await handlePouchCaseSizeChange();
  });
}

if (cylSizeSelect) {
  cylSizeSelect.addEventListener('change', async () => {
    await handleBatteryTargetConfigChange();
  });
}

[stackTargetCathodesInput, stackTargetAnodesInput].forEach((input) => {
  if (!input) return;
  input.addEventListener('input', () => {
    setBatteryNpSelectionFeedback('');
    syncStackTargetCountStateFromDom();
    trimStackSelectionForCurrentMode();
    renderStackSummary();
    renderStackUiState();
    updateDirtyFlags();
  });
});

stackAnodeModeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (button.disabled) return;
    setBatteryNpSelectionFeedback('');
    syncStackTargetCountStateFromDom();
    setStackAnodeModeFromUi(button.dataset.anodeMode);
    trimStackSelectionForCurrentMode();
    renderStackSummary();
    renderStackUiState();
    updateDirtyFlags();
  });
});

if (batteryNpExcessInput) {
  batteryNpExcessInput.addEventListener('input', () => {
    setBatteryNpSelectionFeedback('');
    state.stack.targetAnodeExcessPercent = parseNonNegativeNumberInput('battery_np_excess_percent');
    renderBatteryNpAssist();
    renderAnodeNpGuidance();
  });
}

if (batteryNpSelectSuggestedBtn) {
  batteryNpSelectSuggestedBtn.addEventListener('click', () => {
    selectBatteryNpSuggestedAnodes();
  });
}

projectFilterSelect
.addEventListener('change', async () => {
  await handleProjectChange();
});

batteryProjectMultiSelectTrigger.addEventListener('click', () => {
  renderBatteryProjectMultiSelect();
  toggleBatteryProjectMultiSelect();
});

document.addEventListener('click', (event) => {
  if (!batteryProjectMultiSelect || batteryProjectMultiSelect.contains(event.target)) return;
  setBatteryProjectMultiSelectOpen(false);
});

document
.getElementById('add_cathode_source_btn')
?.addEventListener('click', () => {
  addElectrodeSourceRow('cathode');
});

document
.getElementById('add_anode_source_btn')
?.addEventListener('click', () => {
  addElectrodeSourceRow('anode');
});

document
.getElementById('battery_electrode_sources')
?.addEventListener('click', async event => {
  const removeBtn = event.target?.closest?.('[data-source-remove-role]');
  if (!removeBtn) return;

  await removeElectrodeSourceRow(
    removeBtn.dataset.sourceRemoveRole,
    Number(removeBtn.dataset.sourceRemoveIndex)
  );
});

document
.getElementById('battery_electrode_sources')
?.addEventListener('change', async event => {
  const field = event.target?.dataset?.sourceField;
  const role = event.target?.dataset?.sourceRole;

  if (!field || !role) return;

  if (field === 'tape_id') {
    await handleSourceTapeSelectionChange(role);
  } else if (field === 'cut_batch_id') {
    await handleSourceBatchSelectionChange(role, event.target.dataset.sourceIndex, event.target.value);
  } else {
    syncElectrodeSourcesStateFromDom();
    finalizeInteractiveBatteryChange();
  }
});

document
.getElementById('cathode_tape_id')
.addEventListener('change', async e => {
  await handleTapeSelectionChange('cathode', e.target.value);
});

document
.getElementById('anode_tape_id')
.addEventListener('change', async e => {
  await handleTapeSelectionChange('anode', e.target.value);
});

document
.getElementById('cathode_cut_batch_id')
.addEventListener('change', async e => {
  await handleBatchSelectionChange('cathode', e.target.value);
});

document
.getElementById('anode_cut_batch_id')
.addEventListener('change', async e => {
  await handleBatchSelectionChange('anode', e.target.value);
});

window.addEventListener('beforeunload', (e) => {
  if (!hasUnsavedBatteryChanges()) return;
  e.preventDefault();
  e.returnValue = '';
});

// -------- Init --------

async function handleBatteryPageFocus() {
  await refreshBatteryLinkedReferenceData();
  refreshDirtyState();
}

async function initBatteryPage() {
  installBatteryDebugInspector();
  await refreshBatteryReferenceData();
  await loadTapes();
  await loadBatteries();
  renderBatteryPage();
}

window.addEventListener('focus', async () => {
  await handleBatteryPageFocus();
});

initBatteryPage().catch(err => {
  console.error(err);
});
