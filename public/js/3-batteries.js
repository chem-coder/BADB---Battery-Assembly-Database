// -------- DOM Refs --------

const projectSelect = document.getElementById('battery_project_id');
const createdBySelect = document.getElementById('battery_created_by');

// -------- State --------

function getDefaultMetaState() {
  return {
    project_id: null,
    created_by: null,
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
    anode_source_notes: null
  };
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

const state = {
  selection: {
    currentBatteryId: null,
    currentBattery: null,
    batteries: []
  },
  reference: {
    tapes: [],
    cathodeBatches: [],
    anodeBatches: [],
    cathodeElectrodes: [],
    anodeElectrodes: []
  },
  stack: {
    selectedCathodes: [],
    selectedAnodes: [],
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
    createButtonMode: 'create',
    sectionState: {}
  },
  snapshots: {
    savedSectionStates: {}
  },
  electrochem: getDefaultElectrochemState()
};

function cloneBatteryDebugValue(value) {
  return JSON.parse(JSON.stringify(value));
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
      project_id: state.meta.project_id,
      created_by: state.meta.created_by,
      form_factor: state.meta.form_factor,
      battery_notes: state.meta.battery_notes
    });
  }

  if (sectionKey === 'battery_config') {
    const formFactor = state.meta.form_factor;
    const configState =
      formFactor === 'coin' ? state.config.coin
      : formFactor === 'pouch' ? state.config.pouch
      : formFactor === 'cylindrical' ? state.config.cylindrical
      : null;

    return hasMeaningfulObjectValue(configState);
  }

  if (sectionKey === 'electrode_sources') {
    return hasMeaningfulObjectValue(state.electrodeSources);
  }

  if (sectionKey === 'battery_stack') {
    return state.stack.selectedCathodes.length > 0 || state.stack.selectedAnodes.length > 0;
  }

  if (sectionKey === 'battery_assembly') {
    const formFactor = state.meta.form_factor;
    const activeAssembly =
      formFactor === 'coin' ? state.assembly.coin
      : formFactor === 'pouch' ? state.assembly.pouch
      : formFactor === 'cylindrical' ? state.assembly.cylindrical
      : null;

    return hasMeaningfulObjectValue(activeAssembly);
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

function isBatteryMetaSectionComplete() {
  return Boolean(
    state.selection.currentBatteryId &&
    state.meta.project_id &&
    state.meta.created_by &&
    state.meta.form_factor
  );
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

  if (formFactor === 'pouch') {
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
  const formFactor = state.meta.form_factor;
  const coinMode = state.config.coin?.coin_cell_mode || null;
  const halfCellType = state.config.coin?.half_cell_type || null;
  const sources = state.electrodeSources || {};

  const hasCathodeSource =
    Boolean(sources.cathode_tape_id) && Boolean(sources.cathode_cut_batch_id);
  const hasAnodeSource =
    Boolean(sources.anode_tape_id) && Boolean(sources.anode_cut_batch_id);

  if (formFactor === 'coin' && coinMode === 'half_cell') {
    if (halfCellType === 'cathode_vs_li') {
      return hasCathodeSource && !hasAnodeSource;
    }

    if (halfCellType === 'anode_vs_li') {
      return hasAnodeSource && !hasCathodeSource;
    }

    return false;
  }

  return hasCathodeSource && hasAnodeSource;
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
    : formFactor === 'pouch' ? state.assembly.pouch
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

function deriveBatterySectionLifecycleState() {
  return BATTERY_SECTION_KEYS.reduce((acc, sectionKey) => {
    const previousSectionKey = BATTERY_SECTION_UNLOCK_RULES[sectionKey];
    const savedSnapshot = state.snapshots.savedSectionStates[sectionKey] ?? null;
    const isSaved = savedSnapshot !== null;
    const isComplete = isSaved && isBatterySectionComplete(sectionKey);
    const isDirty = isSaved
      ? getCurrentBatterySectionSnapshot(sectionKey) !== savedSnapshot
      : hasStartedBatterySection(sectionKey);
    const isUnlocked =
      previousSectionKey === null
        ? true
        : Boolean(acc[previousSectionKey]?.isComplete) || isSaved;

    acc[sectionKey] = {
      isSaved,
      isComplete,
      isDirty,
      isUnlocked,
      isLocked: isComplete
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
      el.classList.toggle('visible', Boolean(state.ui.sectionState?.[sectionKey]?.isDirty));
    }
  });
}

function markSectionSaved(sectionKey) {
  state.snapshots.savedSectionStates[sectionKey] = getCurrentBatterySectionSnapshot(sectionKey);
}

function markAllSectionsSaved() {
  state.snapshots.savedSectionStates = getAllCurrentBatterySectionSnapshots();
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

function getSavedBatterySectionKeysFromAssemblyData(data) {
  const sectionKeys = [];

  if (data?.battery?.battery_id) {
    sectionKeys.push('battery_meta');
  }

  const formFactor = data?.battery?.form_factor || null;

  if (
    (formFactor === 'coin' && hasMeaningfulObjectValue(data?.coin_config)) ||
    (formFactor === 'pouch' && hasMeaningfulObjectValue(data?.pouch_config)) ||
    (formFactor === 'cylindrical' && hasMeaningfulObjectValue(data?.cyl_config))
  ) {
    sectionKeys.push('battery_config');
  }

  if (Array.isArray(data?.electrode_sources) && data.electrode_sources.length > 0) {
    sectionKeys.push('electrode_sources');
  }

  if (Array.isArray(data?.electrodes) && data.electrodes.length > 0) {
    sectionKeys.push('battery_stack');
  }

  if (
    hasMeaningfulObjectValue(data?.separator) ||
    hasMeaningfulObjectValue(data?.electrolyte)
  ) {
    sectionKeys.push('battery_assembly');
  }

  if (hasMeaningfulObjectValue(data?.qc)) {
    sectionKeys.push('battery_qc');
  }

  if (Array.isArray(data?.electrochem) && data.electrochem.length > 0) {
    sectionKeys.push('battery_electrochem');
  }

  return sectionKeys;
}

function markBatterySectionsSaved(sectionKeys) {
  state.snapshots.savedSectionStates = {};
  sectionKeys.forEach(sectionKey => {
    state.snapshots.savedSectionStates[sectionKey] = getCurrentBatterySectionSnapshot(sectionKey);
  });
  refreshDirtyState();
}

function markRestoredBatterySectionsSaved(data) {
  markBatterySectionsSaved(getSavedBatterySectionKeysFromAssemblyData(data));
}

function hasUnsavedBatteryChanges() {
  return BATTERY_SECTION_KEYS.some(sectionKey => Boolean(state.ui.sectionState?.[sectionKey]?.isDirty));
}

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
    },
    syncFromDom: syncAllSectionStateFromDom,
    render: renderBatteryPage,
    refreshDirtyState,
    markAllSectionsSaved
  };
}

async function refreshBatteryReferenceData() {
  await Promise.all([
    loadUsers(),
    loadProjects(),
    loadSeparators(),
    loadElectrolytes()
  ]);
}

// -------- State Actions --------

function setBatteries(batteries) {
  state.selection.batteries = batteries;
  renderBatteriesList();
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
  state.electrodeSources = {
    ...getDefaultElectrodeSourcesState(),
    ...(electrodeSources || {})
  };
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
  state.stack.selectedCathodes = Array.isArray(cathodes) ? cathodes : [];
}

function setSelectedAnodes(anodes) {
  state.stack.selectedAnodes = Array.isArray(anodes) ? anodes : [];
}

function resetSelectedElectrodes() {
  setSelectedCathodes([]);
  setSelectedAnodes([]);
}

function setTapes(tapes) {
  state.reference.tapes = Array.isArray(tapes) ? tapes : [];
  renderTapeOptions();
}

function setCathodeBatches(batches) {
  state.reference.cathodeBatches = Array.isArray(batches) ? batches : [];
  renderCathodeBatchOptions();
}

function setAnodeBatches(batches) {
  state.reference.anodeBatches = Array.isArray(batches) ? batches : [];
  renderAnodeBatchOptions();
}

function setCathodeElectrodes(electrodes) {
  state.reference.cathodeElectrodes = Array.isArray(electrodes) ? electrodes : [];
  renderCathodeElectrodeTable();
}

function setAnodeElectrodes(electrodes) {
  state.reference.anodeElectrodes = Array.isArray(electrodes) ? electrodes : [];
  renderAnodeElectrodeTable();
}

function setHideStackSelectionBlocks(shouldHide) {
  state.stack.hideSelectionBlocks = Boolean(shouldHide);
}

function setIsRestoringBattery(isRestoring) {
  state.ui.isRestoringBattery = Boolean(isRestoring);
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
    created_by: document.getElementById('battery_created_by')?.value || null,
    form_factor: document.getElementById('battery_form_factor')?.value || null,
    battery_notes: document.getElementById('battery_notes')?.value || null
  });
}

function syncConfigStateFromDom() {
  setConfigState({
    coin: serializeFieldset(document.getElementById('coin_config')),
    pouch: serializeFieldset(document.getElementById('pouch_config')),
    cylindrical: serializeFieldset(document.getElementById('cyl_config'))
  });
}

function syncElectrodeSourcesStateFromDom() {
  setElectrodeSourcesState(
    serializeFieldset(document.getElementById('battery_electrode_sources'))
  );
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

function syncAllSectionStateFromDom() {
  syncMetaStateFromDom();
  syncConfigStateFromDom();
  syncElectrodeSourcesStateFromDom();
  syncAssemblyStateFromDom();
  syncQcStateFromDom();
  syncElectrochemStateFromDom();
}

function captureNamedState(root) {
  
  if (!root) return 'null';
  
  const fields = Array.from(root.querySelectorAll('[name]')).map(el => {
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
  if (formFactor === 'pouch') return document.getElementById('pouch_config');
  if (formFactor === 'cylindrical') return document.getElementById('cyl_config');
  
  return null;
}

function getActiveAssemblyFieldset() {
  const formFactor = state.meta.form_factor || document.getElementById('battery_form_factor').value;
  
  if (formFactor === 'coin') return document.getElementById('coin_assembly');
  if (formFactor === 'pouch') return document.getElementById('pouch_assembly');
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
    return captureNamedState(document.getElementById('battery_electrode_sources'));
  }

  if (sectionKey === 'battery_stack') {
    return JSON.stringify({
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
}

// -------- Render Helpers --------

function getStackSelectionContext() {
  const formFactor = state.meta.form_factor;
  const coinMode = state.config.coin?.coin_cell_mode || null;

  return {
    formFactor,
    coinMode
  };
}

function renderStackUiState() {
  const stackBuilder = document.getElementById('battery_stack_builder');
  const cathodeBlock = document.querySelector('.stack_cathode_block');
  const anodeBlock = document.querySelector('.stack_anode_block');
  const shouldHide = state.stack.hideSelectionBlocks;
  const { formFactor, coinMode } = getStackSelectionContext();
  const cathodeCheckboxes = Array.from(
    document.querySelectorAll('#stack_cathode_table_body input[type="checkbox"]')
  );
  const anodeCheckboxes = Array.from(
    document.querySelectorAll('#stack_anode_table_body input[type="checkbox"]')
  );

  if (stackBuilder) {
    stackBuilder.dataset.stackLocked = state.stack.readOnly ? 'true' : 'false';
    stackBuilder.classList.toggle('locked', state.stack.readOnly);
  }

  if (cathodeBlock) {
    cathodeBlock.hidden = shouldHide;
  }

  if (anodeBlock) {
    anodeBlock.hidden = shouldHide;
  }

  if (state.stack.readOnly) {
    cathodeCheckboxes.forEach(cb => { cb.disabled = true; });
    anodeCheckboxes.forEach(cb => { cb.disabled = true; });
    return;
  }

  cathodeCheckboxes.forEach(cb => {
    cb.disabled = cb.dataset.available !== 'true';
  });

  anodeCheckboxes.forEach(cb => {
    cb.disabled = cb.dataset.available !== 'true';
  });

  if (formFactor === 'pouch' || formFactor === 'cylindrical') {
    return;
  }

  if (formFactor === 'coin' && coinMode === 'half_cell') {
    const selectedTotal =
    state.stack.selectedCathodes.length + state.stack.selectedAnodes.length;

    if (selectedTotal === 0) return;

    const selectedCathodeIds =
    state.stack.selectedCathodes.map(e => e.electrode_id);

    const selectedAnodeIds =
    state.stack.selectedAnodes.map(e => e.electrode_id);

    cathodeCheckboxes.forEach(cb => {
      if (cb.dataset.available !== 'true') return;

      if (!selectedCathodeIds.includes(Number(cb.value))) {
        cb.disabled = true;
      }
    });

    anodeCheckboxes.forEach(cb => {
      if (cb.dataset.available !== 'true') return;

      if (!selectedAnodeIds.includes(Number(cb.value))) {
        cb.disabled = true;
      }
    });

    return;
  }

  if (formFactor === 'coin' && coinMode === 'full_cell') {
    if (state.stack.selectedCathodes.length > 0) {
      const selectedCathodeIds =
      state.stack.selectedCathodes.map(e => e.electrode_id);

      cathodeCheckboxes.forEach(cb => {
        if (cb.dataset.available !== 'true') return;

        if (!selectedCathodeIds.includes(Number(cb.value))) {
          cb.disabled = true;
        }
      });
    }

    if (state.stack.selectedAnodes.length > 0) {
      const selectedAnodeIds =
      state.stack.selectedAnodes.map(e => e.electrode_id);

      anodeCheckboxes.forEach(cb => {
        if (cb.dataset.available !== 'true') return;

        if (!selectedAnodeIds.includes(Number(cb.value))) {
          cb.disabled = true;
        }
      });
    }
  }
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
    formFactor === 'coin' ? Boolean(data.coin_config)
    : formFactor === 'pouch' ? hasPouchConfig
    : formFactor === 'cylindrical' ? Boolean(data.cyl_config)
    : Boolean(data.coin_config || data.pouch_config || data.cyl_config);

  const hasSources =
  Array.isArray(data.electrode_sources) && data.electrode_sources.length > 0;

  const hasElectrodes =
  Array.isArray(data.electrodes) && data.electrodes.length > 0;

  const hasAssembly =
  Boolean(data.separator) && Boolean(data.electrolyte);

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
  if (sectionKey === 'battery_config') return 'battery_config_save_btn';
  if (sectionKey === 'electrode_sources') return 'battery_sources_save_btn';
  if (sectionKey === 'battery_stack') return 'battery_stack_save_btn';
  if (sectionKey === 'battery_assembly') {
    return state.meta.form_factor === 'coin'
      ? 'coin_assembly_save_btn'
      : state.meta.form_factor === 'pouch'
        ? 'pouch_assembly_save_btn'
        : 'cyl_assembly_save_btn';
  }
  if (sectionKey === 'battery_qc') return 'battery_qc_save_btn';
  if (sectionKey === 'battery_electrochem') return 'battery_electrochem_save_btn';
  return null;
}

function setBatterySectionLockMessage(sectionKey, sectionState) {
  const container = getBatterySectionContainer(sectionKey);

  if (!container) return;

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
  const sectionState = state.ui.sectionState?.[sectionKey];
  const root = getBatterySectionRoot(sectionKey);
  const saveButtonId = getBatterySectionSaveButtonId(sectionKey);
  const saveButton = saveButtonId ? document.getElementById(saveButtonId) : null;
  const isAccessible = Boolean(sectionState?.isUnlocked || sectionState?.isSaved);

  setBatterySectionLockMessage(sectionKey, sectionState || {});

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

    if (!isAccessible) {
      el.disabled = true;
      el.readOnly = true;
      return;
    }

    if (sectionState?.isLocked && !isCommentField(el)) {
      el.disabled = true;
      el.readOnly = true;
      return;
    }

    el.disabled = false;
    el.readOnly = false;
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

  if (banner) {
    banner.classList.toggle(
      'visible',
      Boolean(
        state.ui.sectionState?.battery_config?.isLocked ||
        state.ui.sectionState?.electrode_sources?.isLocked ||
        state.ui.sectionState?.battery_stack?.isLocked
      )
    );
  }
}

function renderWorkflowProgressionState() {
  refreshBatterySectionLifecycleState();
  renderBatterySectionLifecycle();
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

function renderBatteryWorkspaceVisibility() {
  const hasBattery = Boolean(state.selection.currentBatteryId);
  const header = document.getElementById('battery_header');
  const workspace = document.getElementById('battery_workspace');
  const printBtn = document.getElementById('printBatteryBtn');
  const exitBtn = document.getElementById('exitBatteriesBtn');

  if (header) {
    header.hidden = !hasBattery;
  }

  if (workspace) {
    workspace.hidden = !hasBattery;
  }

  if (printBtn) {
    printBtn.hidden = !hasBattery;
  }

  if (exitBtn) {
    exitBtn.hidden = !hasBattery;
  }
}

function renderBatteryHeader() {
  const battery = state.selection.currentBattery;

  document.getElementById('battery_id_label').textContent =
    battery?.battery_id ? `#${battery.battery_id}` : '—';

  document.getElementById('battery_project_label').textContent =
    battery ? getSelectedLabel('battery_project_id') : '—';

  document.getElementById('battery_formfactor_label').textContent =
    battery ? getSelectedLabel('battery_form_factor') : '—';

  document.getElementById('battery_operator_label').textContent =
    battery ? getSelectedLabel('battery_created_by') : '—';
}

function renderBatteryCreateButton() {
  const btn = document.getElementById('battery_create_btn');

  if (!btn) return;

  if (state.ui.createButtonMode === 'edit') {
    btn.textContent = 'Сохранить изменения';
    btn.dataset.mode = 'update';
    return;
  }

  if (state.ui.createButtonMode === 'createSaved') {
    btn.textContent = 'Сохранить шапку';
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
    select.disabled = true;
    select.value = '';
    return;
  }

  select.disabled = false;
  select.value = state.selection.currentBattery?.status || '';
}

function renderMetaForm() {
  const projectSelect = document.getElementById('battery_project_id');
  const createdBySelect = document.getElementById('battery_created_by');
  const formFactorSelect = document.getElementById('battery_form_factor');

  ensureSelectOption(
    projectSelect,
    state.meta.project_id,
    state.selection.currentBattery?.project_name || `#${state.meta.project_id}`
  );

  ensureSelectOption(
    createdBySelect,
    state.meta.created_by,
    state.selection.currentBattery?.created_by_name || `#${state.meta.created_by}`
  );

  projectSelect.value = state.meta.project_id ?? '';
  createdBySelect.value = state.meta.created_by ?? '';
  formFactorSelect.value = state.meta.form_factor ?? '';

  document.getElementById('battery_notes').value =
    state.meta.battery_notes ?? '';
}

function renderConfigForm() {
  populateFieldset(document.getElementById('coin_config'), state.config.coin);
  populateFieldset(document.getElementById('pouch_config'), state.config.pouch);
  populateFieldset(document.getElementById('cyl_config'), state.config.cylindrical);
  renderPouchCaseSizeUi();
}

function renderElectrodeSourcesForm() {
  populateFieldset(
    document.getElementById('battery_electrode_sources'),
    state.electrodeSources
  );
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
    batch => String(batch.cut_batch_id) === String(state.electrodeSources.cathode_cut_batch_id || '')
  );
  const anodeBatch = state.reference.anodeBatches.find(
    batch => String(batch.cut_batch_id) === String(state.electrodeSources.anode_cut_batch_id || '')
  );

  if (cathodeWarning) {
    const isMismatch =
      Boolean(state.electrodeSources.cathode_cut_batch_id) &&
      cathodeBatch &&
      cathodeBatch.is_compatibility_match === false;

    cathodeWarning.hidden = !isMismatch;
    cathodeWarning.textContent = isMismatch
      ? 'Сохранённая партия сохранена в списке для истории, но не соответствует текущей конфигурации элемента.'
      : '';
  }

  if (anodeWarning) {
    const isMismatch =
      Boolean(state.electrodeSources.anode_cut_batch_id) &&
      anodeBatch &&
      anodeBatch.is_compatibility_match === false;

    anodeWarning.hidden = !isMismatch;
    anodeWarning.textContent = isMismatch
      ? 'Сохранённая партия сохранена в списке для истории, но не соответствует текущей конфигурации элемента.'
      : '';
  }
}

function renderAssemblyForm() {
  populateFieldset(document.getElementById('coin_assembly'), state.assembly.coin);
  populateFieldset(document.getElementById('pouch_assembly'), state.assembly.pouch);
  populateFieldset(document.getElementById('cyl_assembly'), state.assembly.cylindrical);
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
}

function renderBatteryPage() {
  renderBatteriesList();
  renderTapeOptions();
  renderCathodeBatchOptions();
  renderAnodeBatchOptions();

  renderMetaForm();
  renderConfigForm();
  renderElectrodeSourcesForm();
  renderBatchCompatibilityWarnings();
  renderAssemblyForm();
  renderQcForm();
  renderElectrochemForm();

  renderFormFactorSections();
  renderCoinCellModeUi();
  renderHalfCellTypeUi();
  renderStackTables();
  renderBatteryWorkspaceVisibility();
  renderBatteryHeader();
  renderBatteryCreateButton();
  renderBatteryStatusControl();
  renderWorkflowProgressionState();
  updateDirtyFlags();
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
    throw new Error('Не удалось обновить статус батареи');
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка сохранения статуса батареи');
  }

  return res.json();
}

async function autoSaveAssembledStatusTransition() {
  if (!state.selection.currentBatteryId || !state.stack.loadedAssemblyComplete) {
    return false;
  }

  const currentStatus = state.selection.currentBattery?.status || null;

  if (currentStatus) {
    return false;
  }

  const res = await fetch(`/api/batteries/${state.selection.currentBatteryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'assembled' })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка автосохранения статуса assembled');
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
}

function showBatteryInlineStatus(buttonId, message, isError = false) {
  const statusEl = ensureBatteryInlineStatusElement(buttonId);

  if (!statusEl) return;

  if (batteryInlineStatusTimers[buttonId]) {
    clearTimeout(batteryInlineStatusTimers[buttonId]);
  }

  statusEl.textContent = message || '';
  statusEl.classList.toggle('is_error', Boolean(isError));

  if (message) {
    batteryInlineStatusTimers[buttonId] = setTimeout(() => {
      clearBatteryInlineStatus(buttonId);
    }, 4000);
  }
}


// -------- Save --------

async function saveBatteryConfig() {
  const statusTargetId = 'battery_config_save_btn';

  if (!state.selection.currentBatteryId) {
    showBatteryInlineStatus(statusTargetId, 'Сначала создайте элемент.', true);
    return;
  }

  syncMetaStateFromDom();
  syncConfigStateFromDom();

  const formFactor = state.meta.form_factor;
  const table =
    formFactor === 'coin' ? 'battery_coin_config'
    : formFactor === 'pouch' ? 'battery_pouch_config'
    : formFactor === 'cylindrical' ? 'battery_cyl_config'
    : null;

  const payload =
    formFactor === 'coin' ? { ...state.config.coin }
    : formFactor === 'pouch' ? { ...state.config.pouch }
    : formFactor === 'cylindrical' ? { ...state.config.cylindrical }
    : null;

  if (!table || !payload) {
    showBatteryInlineStatus(statusTargetId, 'Нет активной секции конфигурации.', true);
    return;
  }

  try {
    await savePayloadSection(table, payload);
    markSectionsSaved(['battery_config']);
    await refreshBatteryStatusState();
    renderBatteryPage();
    showBatteryInlineStatus(statusTargetId, 'Конфигурация сохранена.');
  } catch (err) {
    console.error(err);
    showBatteryInlineStatus(
      statusTargetId,
      err.message || 'Ошибка сохранения конфигурации',
      true
    );
  }
}



async function saveElectrodeSources() {
  const statusTargetId = 'battery_sources_save_btn';

  if (!state.selection.currentBatteryId) {
    showBatteryInlineStatus(statusTargetId, 'Сначала создайте элемент.', true);
    return;
  }

  syncMetaStateFromDom();
  syncConfigStateFromDom();
  syncElectrodeSourcesStateFromDom();

  const formFactor = state.meta.form_factor;
  const mode = state.config.coin?.coin_cell_mode || null;
  const halfType = state.config.coin?.half_cell_type || null;
  const sources = state.electrodeSources;
  const payload = {
    battery_id: state.selection.currentBatteryId
  };

  const hasCathodeSource =
    Boolean(sources.cathode_tape_id) && Boolean(sources.cathode_cut_batch_id);
  const hasAnodeSource =
    Boolean(sources.anode_tape_id) && Boolean(sources.anode_cut_batch_id);

  if (formFactor === 'coin' && mode === 'half_cell') {
    if (halfType === 'cathode_vs_li' && (!hasCathodeSource || hasAnodeSource)) {
      showBatteryInlineStatus(
        statusTargetId,
        'Для полуячейки cathode_vs_li должна быть выбрана только одна катодная лента и одна катодная партия.',
        true
      );
      return;
    }

    if (halfType === 'anode_vs_li' && (!hasAnodeSource || hasCathodeSource)) {
      showBatteryInlineStatus(
        statusTargetId,
        'Для полуячейки anode_vs_li должна быть выбрана только одна анодная лента и одна анодная партия.',
        true
      );
      return;
    }

    if (!halfType) {
      showBatteryInlineStatus(statusTargetId, 'Сначала выберите тип полуячейки.', true);
      return;
    }

    if (halfType === 'cathode_vs_li') {
      payload.cathode_tape_id = sources.cathode_tape_id || null;
      payload.cathode_cut_batch_id = sources.cathode_cut_batch_id || null;
      payload.cathode_source_notes = sources.cathode_source_notes || null;
    }

    if (halfType === 'anode_vs_li') {
      payload.anode_tape_id = sources.anode_tape_id || null;
      payload.anode_cut_batch_id = sources.anode_cut_batch_id || null;
      payload.anode_source_notes = sources.anode_source_notes || null;
    }
  } else {
    if (!hasCathodeSource || !hasAnodeSource) {
      showBatteryInlineStatus(
        statusTargetId,
        'Для этого форм-фактора нужно выбрать ровно одну катодную и одну анодную ленту с соответствующими партиями.',
        true
      );
      return;
    }

    payload.cathode_tape_id = sources.cathode_tape_id || null;
    payload.cathode_cut_batch_id = sources.cathode_cut_batch_id || null;
    payload.cathode_source_notes = sources.cathode_source_notes || null;
    payload.anode_tape_id = sources.anode_tape_id || null;
    payload.anode_cut_batch_id = sources.anode_cut_batch_id || null;
    payload.anode_source_notes = sources.anode_source_notes || null;
  }

  const res = await fetch('/api/batteries/battery_electrode_sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    showBatteryInlineStatus(
      statusTargetId,
      err.error || `Ошибка сохранения источников электродов: ${res.status}`,
      true
    );
    return;
  }

  markSectionsSaved(['electrode_sources']);
  await refreshBatteryStatusState();
  renderBatteryPage();

  showBatteryInlineStatus(statusTargetId, 'Источники электродов сохранены.');
}

async function saveElectrodeStack() {
  const statusTargetId = 'battery_stack_save_btn';

  if (!state.selection.currentBatteryId) {
    showBatteryInlineStatus(statusTargetId, 'Сначала создайте элемент.', true);
    return;
  }

  const stack = buildStackPayload();

  if (!stack || stack.length === 0) {
    showBatteryInlineStatus(statusTargetId, 'Стек электродов пуст.', true);
    return;
  }

  const res = await fetch(`/api/batteries/battery_electrodes/${state.selection.currentBatteryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stack)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    showBatteryInlineStatus(
      statusTargetId,
      err.error || `Ошибка сохранения стека: ${res.status}`,
      true
    );
    return;
  }
  
  markSectionsSaved(['battery_stack']);
  await refreshBatteryStatusState();
  renderBatteryPage();
  
  showBatteryInlineStatus(statusTargetId, 'Стек электродов сохранён.');
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Ошибка сохранения: ${routeBase}`);
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

  if (formFactor === 'pouch') {
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
    : ctx.formFactor === 'pouch'
      ? 'pouch_assembly_save_btn'
      : 'cyl_assembly_save_btn';

  try {
    const sectionState =
      ctx.formFactor === 'coin' ? { ...state.assembly.coin }
      : ctx.formFactor === 'pouch' ? { ...state.assembly.pouch }
      : ctx.formFactor === 'cylindrical' ? { ...state.assembly.cylindrical }
      : null;

    if (!sectionState) {
      throw new Error('Не удалось собрать данные секции сборки');
    }

    const separatorPayload = {
      separator_id: sectionState.separator_id ?? null,
      separator_notes: sectionState.separator_notes || null
    };

    const electrolytePayload = {
      electrolyte_id: sectionState.electrolyte_id ?? null,
      electrolyte_notes: sectionState.electrolyte_notes || null,
      electrolyte_total_ul: sectionState.electrolyte_total_ul ?? null
    };

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
}


async function saveBatteryQc() {
  const statusTargetId = 'battery_qc_save_btn';

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
    const link = document.createElement('a');
    const note = document.createElement('span');
    
    link.href = entry.file_link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = entry.file_name || entry.file_link;
    
    note.textContent = entry.electrochem_notes
      ? ` | ${entry.electrochem_notes}`
      : '';
    
    row.append(`${index + 1}. `);
    row.appendChild(link);
    row.appendChild(note);
    target.appendChild(row);
  });
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

async function saveBatteryElectrochem() {
  const statusTargetId = 'battery_electrochem_save_btn';

  if (!state.selection.currentBatteryId) {
    showBatteryInlineStatus(statusTargetId, 'Сначала создайте элемент.', true);
    return;
  }

  try {
    const filesInput = document.getElementById('electrochem_files');
    syncElectrochemStateFromDom();

    const selectedFiles = Array.from(filesInput.files || []);
    
    if (selectedFiles.length === 0) {
      showBatteryInlineStatus(statusTargetId, 'Выберите хотя бы один файл испытаний.', true);
      return;
    }

    const entries = await Promise.all(selectedFiles.map(async (file) => ({
      file_name: file.name,
      file_content_base64: await fileToBase64(file),
      electrochem_notes: state.electrochem.notes || null
    })));

    const payload = {
      entries
    };

    const res = await fetch('/api/batteries/battery_electrochem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        battery_id: state.selection.currentBatteryId,
        ...payload
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка сохранения электрохимических испытаний');
    }

    const saved = await res.json();

    setElectrochemState({
      notes: null,
      files: null,
      savedEntries: Array.isArray(saved) ? saved : []
    });
    renderElectrochemForm();
    markSectionsSaved(['battery_electrochem']);
    renderBatteryPage();
    showBatteryInlineStatus(statusTargetId, 'Результаты электрохимических испытаний сохранены.');
  } catch (err) {
    console.error(err);
    showBatteryInlineStatus(
      statusTargetId,
      err.message || 'Ошибка сохранения электрохимических испытаний',
      true
    );
  }
}


async function updateBatteryMeta(id, data) {
  
  const res = await fetch(`/api/batteries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка обновления аккумулятора');
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

function renderBatteryReferenceSelect(select, items, {
  placeholder,
  valueKey,
  labelBuilder
}) {
  if (!select) return;

  const current = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>`;

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

  renderBatteryReferenceSelect(projectSelect, data, {
    placeholder: '— выбрать проект —',
    valueKey: 'project_id',
    labelBuilder: (project) => project.name
  });
}

async function loadUsers() {
  const data = await fetchUsersReference();

  if (!data) {
    return;
  }

  renderBatteryReferenceSelect(createdBySelect, data, {
    placeholder: '— выбрать пользователя —',
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

function getBatteryCutBatchParams(tapeId, selectedBatchId) {
  const params = new URLSearchParams({
    tape_id: String(tapeId)
  });

  if (selectedBatchId) {
    params.set('selected_batch_id', String(selectedBatchId));
  }

  return params;
}

async function fetchCompatibleBatteryCutBatches(tapeId, selectedBatchId) {
  if (!state.selection.currentBatteryId || !tapeId) {
    return [];
  }

  const params = getBatteryCutBatchParams(tapeId, selectedBatchId);
  const data = await fetchBatteryArray(
    `/api/batteries/${state.selection.currentBatteryId}/electrode-cut-batches?${params.toString()}`,
    'compatible cut batches'
  );

  return data || [];
}

async function loadCathodeBatches(tapeId) {
  if (!state.selection.currentBatteryId || !tapeId) {
    setCathodeBatches([]);
    return;
  }

  const selectedBatchId = state.electrodeSources.cathode_cut_batch_id || '';

  const data = await fetchCompatibleBatteryCutBatches(tapeId, selectedBatchId);
  setCathodeBatches(data);
}

async function loadAnodeBatches(tapeId) {
  if (!state.selection.currentBatteryId || !tapeId) {
    setAnodeBatches([]);
    return;
  }

  const selectedBatchId = state.electrodeSources.anode_cut_batch_id || '';

  const data = await fetchCompatibleBatteryCutBatches(tapeId, selectedBatchId);
  setAnodeBatches(data);
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
  setCathodeElectrodes(data.filter(e => e.status_code === 1));
}

async function loadAnodeElectrodes(batchId) {
  const data = await fetchCutBatchElectrodes(batchId);
  setAnodeElectrodes(data.filter(e => e.status_code === 1));
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

function resetBatteryPageStateForRestore() {
  clearBatteryRestoreFieldsets();
  resetBatterySectionState();
  resetElectrodeSelection();
}

function applyBatteryMetaToState(data) {
  const battery = data?.battery || {};

  setMetaState({
    project_id: battery.project_id ?? null,
    created_by: battery.created_by ?? null,
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
  const nextElectrodeSourcesState = getDefaultElectrodeSourcesState();
  let savedCathodeBatchId = '';
  let savedAnodeBatchId = '';

  if (Array.isArray(data?.electrode_sources)) {
    data.electrode_sources.forEach(src => {
      if (src.role === 'cathode') {
        nextElectrodeSourcesState.cathode_tape_id = src.tape_id || null;
        nextElectrodeSourcesState.cathode_cut_batch_id = src.cut_batch_id || null;
        nextElectrodeSourcesState.cathode_source_notes = src.source_notes ?? null;

        if (src.cut_batch_id) {
          savedCathodeBatchId = String(src.cut_batch_id);
        }
      }

      if (src.role === 'anode') {
        nextElectrodeSourcesState.anode_tape_id = src.tape_id || null;
        nextElectrodeSourcesState.anode_cut_batch_id = src.cut_batch_id || null;
        nextElectrodeSourcesState.anode_source_notes = src.source_notes ?? null;

        if (src.cut_batch_id) {
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
  if (state.electrodeSources.cathode_tape_id) {
    await loadCathodeBatches(state.electrodeSources.cathode_tape_id);
  }

  if (state.electrodeSources.anode_tape_id) {
    await loadAnodeBatches(state.electrodeSources.anode_tape_id);
  }
}

async function loadSavedStackElectrodes(savedCathodeBatchId, savedAnodeBatchId) {
  if (savedCathodeBatchId) {
    await loadCathodeElectrodes(savedCathodeBatchId);
  }

  if (savedAnodeBatchId) {
    await loadAnodeElectrodes(savedAnodeBatchId);
  }
}

function finalizeRestoredBatteryPage(data) {
  applySavedElectrodeState(data);
  renderBatteryPage();
  markRestoredBatterySectionsSaved(data);
  renderBatteryPage();
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

function renderBatteriesList() {
  
  const list = document.getElementById('batteriesList');
  
  list.innerHTML = '';

  const statusLabels = {
    '': 'В Сборке',
    assembled: 'Собран',
    testing: 'На Тестировании',
    completed: 'Завершён',
    failed: 'Брак',
    disassembled: 'Разобран'
  };

  function formatCoinSize(code) {
    if (!code) return '';

    const diameterCode = String(code).slice(0, 2);
    const diameterMm = Number(diameterCode);

    if (!Number.isFinite(diameterMm)) {
      return String(code);
    }

    return `${diameterMm} mm (${code})`;
  }

  function formatBatchGeometry(shape, diameterMm, lengthMm, widthMm) {
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

  function formatPouchSize(battery) {
    const cathodeSize = formatBatchGeometry(
      battery.cathode_batch_shape,
      battery.cathode_batch_diameter_mm,
      battery.cathode_batch_length_mm,
      battery.cathode_batch_width_mm
    );

    const anodeSize = formatBatchGeometry(
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

  function formatActiveMaterials(battery) {
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

  function formatListDate(value, fallbackValue = null) {
    const source = value || fallbackValue;

    if (!source) return '';

    const date = new Date(source);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return date.toLocaleDateString();
  }
  
  state.selection.batteries.forEach(b => {
    
    const li = document.createElement('li');
    li.className = 'user-row';

    const status = statusLabels[b.status || ''] || (b.status || 'В сборке');
    const updatedDate = formatListDate(b.updated_at, b.created_at);
    const sizeInfo =
      b.form_factor === 'coin'
        ? formatCoinSize(b.coin_size_code)
        : b.form_factor === 'pouch'
          ? formatPouchSize(b)
          : '';
    const materialsInfo = formatActiveMaterials(b);

    const info = document.createElement('div');
    info.className = 'user-info';

    const title = document.createElement('strong');
    title.textContent =
      `#${b.battery_id} | ${b.project_name || '—'}`;

    const statusSpan = document.createElement('small');
    statusSpan.style.color = '#666';
    statusSpan.textContent = ` — ${b.form_factor} — ${status}`;

    const dateSpan = document.createElement('small');
    dateSpan.style.color = '#666';
    dateSpan.textContent = updatedDate ? ` — ${updatedDate}` : '';

    const materialsSpan = document.createElement('small');
    materialsSpan.style.color = '#666';
    materialsSpan.textContent = materialsInfo ? ` — ${materialsInfo}` : '';

    const sizeSpan = document.createElement('small');
    sizeSpan.style.color = '#666';
    sizeSpan.textContent = sizeInfo ? ` — ${sizeInfo}` : '';

    info.appendChild(title);
    info.appendChild(statusSpan);
    info.appendChild(dateSpan);
    info.appendChild(materialsSpan);
    info.appendChild(sizeSpan);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = '✏️';
    editBtn.title = 'Открыть аккумулятор';

    editBtn.addEventListener('click', () => {
      populateBatteryForm(b);
    });

    actions.appendChild(editBtn);
    li.appendChild(info);
    li.appendChild(actions);
    list.appendChild(li);
    
  });
  
}

function renderTapeOptions() {
  const projectId = state.meta.project_id;
  const cathodeSelect = document.getElementById('cathode_tape_id');
  const anodeSelect = document.getElementById('anode_tape_id');

  if (!cathodeSelect || !anodeSelect) return;

  const cathodeTapeId =
    state.electrodeSources.cathode_tape_id ?? cathodeSelect.value ?? '';
  const anodeTapeId =
    state.electrodeSources.anode_tape_id ?? anodeSelect.value ?? '';

  cathodeSelect.innerHTML = '<option value="">— выбрать ленту —</option>';
  anodeSelect.innerHTML = '<option value="">— выбрать ленту —</option>';

  const filtered = state.reference.tapes.filter(t =>
    !projectId || t.project_id == projectId
  );

  filtered.forEach(t => {
    const option = document.createElement('option');
    option.value = t.tape_id;
    option.textContent = `#${t.tape_id} | ${t.name} | ${t.created_by}`;

    if (t.role === 'cathode') {
      cathodeSelect.appendChild(option.cloneNode(true));
    }

    if (t.role === 'anode') {
      anodeSelect.appendChild(option.cloneNode(true));
    }
  });

  const cathodeTape = state.reference.tapes.find(
    tape => String(tape.tape_id) === String(cathodeTapeId || '')
  );
  const anodeTape = state.reference.tapes.find(
    tape => String(tape.tape_id) === String(anodeTapeId || '')
  );

  ensureSelectOption(
    cathodeSelect,
    cathodeTapeId,
    cathodeTape
      ? `#${cathodeTape.tape_id} | ${cathodeTape.name} | ${cathodeTape.created_by}`
      : cathodeTapeId
        ? `#${cathodeTapeId} | сохранённая лента`
        : ''
  );

  ensureSelectOption(
    anodeSelect,
    anodeTapeId,
    anodeTape
      ? `#${anodeTape.tape_id} | ${anodeTape.name} | ${anodeTape.created_by}`
      : anodeTapeId
        ? `#${anodeTapeId} | сохранённая лента`
        : ''
  );

  cathodeSelect.value = cathodeTapeId || '';
  anodeSelect.value = anodeTapeId || '';
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

function formatElectrodeBatchTarget(batch) {
  const formFactor = batch.target_form_factor || '';
  const code = batch.target_config_code || '';

  if (!formFactor && !code) return '';
  if (formFactor && code) return `${formFactor} ${code}`;
  return formFactor || code;
}

function formatElectrodeBatchOptionLabel(batch) {
  const parts = [`#${batch.cut_batch_id}`];
  const target = formatElectrodeBatchTarget(batch);
  const geometry = formatElectrodeBatchGeometry(batch);
  const count = Number(batch.electrode_count) || 0;

  if (target) {
    parts.push(target);
  }

  if (geometry) {
    parts.push(geometry);
  }

  if (count) {
    parts.push(`${count} эл.`);
  }

  if (batch.created_by_name || batch.created_by) {
    parts.push(batch.created_by_name || batch.created_by);
  }

  return parts.join(' | ');
}


function renderCathodeBatchOptions() {
  
  const select =
  document.getElementById('cathode_cut_batch_id');
  
  select.innerHTML =
  '<option value="">— выбрать партию —</option>';
  
  state.reference.cathodeBatches.forEach(b => {
    
    const option = document.createElement('option');
    
    option.value = b.cut_batch_id;
    
    option.textContent = formatElectrodeBatchOptionLabel(b);
    
    select.appendChild(option);
    
  });

  ensureSelectOption(
    select,
    state.electrodeSources.cathode_cut_batch_id,
    state.electrodeSources.cathode_cut_batch_id
      ? `#${state.electrodeSources.cathode_cut_batch_id} | сохранённая партия`
      : ''
  );
  
}

function renderAnodeBatchOptions() {
  
  const select =
  document.getElementById('anode_cut_batch_id');
  
  select.innerHTML =
  '<option value="">— выбрать партию —</option>';
  
  state.reference.anodeBatches.forEach(b => {
    
    const option = document.createElement('option');
    
    option.value = b.cut_batch_id;
    
    option.textContent = formatElectrodeBatchOptionLabel(b);
    
    select.appendChild(option);
    
  });

  ensureSelectOption(
    select,
    state.electrodeSources.anode_cut_batch_id,
    state.electrodeSources.anode_cut_batch_id
      ? `#${state.electrodeSources.anode_cut_batch_id} | сохранённая партия`
      : ''
  );
  
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
    
    const numCell = document.createElement('td');
    numCell.textContent = index + 1;
    tr.appendChild(numCell);
    
    const idCell = document.createElement('td');
    idCell.textContent = e.electrode_id;
    tr.appendChild(idCell);
    
    const massCell = document.createElement('td');
    massCell.textContent = e.electrode_mass_g ?? '';
    tr.appendChild(massCell);
    
    const selectCell = document.createElement('td');
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = e.electrode_id;
    checkbox.dataset.available = e.status_code === 1 ? 'true' : 'false';
    checkbox.checked = state.stack.selectedCathodes.some(
      el => el.electrode_id === e.electrode_id
    );
    
    checkbox.addEventListener('change', e => {
      
      const electrodeId = Number(e.target.value);
      
      if (e.target.checked) {
        
        const electrode =
        state.reference.cathodeElectrodes.find(
          el => el.electrode_id === electrodeId
        );
        
        if (!state.stack.selectedCathodes.some(el => el.electrode_id === electrodeId)) {
          if (isCoinSingleSelectionMode()) {
            setSelectedCathodes(electrode ? [electrode] : []);
          } else {
            setSelectedCathodes([...state.stack.selectedCathodes, electrode]);
          }
        }
        
      } else {
        
        setSelectedCathodes(
          state.stack.selectedCathodes.filter(
          el => el.electrode_id !== electrodeId
          )
        );
        
      }
      
      renderStackSummary();
      renderStackUiState();
      updateDirtyFlags();
      
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
    
    const numCell = document.createElement('td');
    numCell.textContent = index + 1;
    tr.appendChild(numCell);
    
    const idCell = document.createElement('td');
    idCell.textContent = e.electrode_id;
    tr.appendChild(idCell);
    
    const massCell = document.createElement('td');
    massCell.textContent = e.electrode_mass_g ?? '';
    tr.appendChild(massCell);
    
    const selectCell = document.createElement('td');
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = e.electrode_id;
    checkbox.dataset.available = e.status_code === 1 ? 'true' : 'false';
    checkbox.checked = state.stack.selectedAnodes.some(
      el => el.electrode_id === e.electrode_id
    );
    
    checkbox.addEventListener('change', e => {
      
      const electrodeId = Number(e.target.value);
      
      if (e.target.checked) {
        
        const electrode =
        state.reference.anodeElectrodes.find(
          el => el.electrode_id === electrodeId
        );
        
        if (!state.stack.selectedAnodes.some(el => el.electrode_id === electrodeId)) {
          if (isCoinSingleSelectionMode()) {
            setSelectedAnodes(electrode ? [electrode] : []);
          } else {
            setSelectedAnodes([...state.stack.selectedAnodes, electrode]);
          }
        }
        
      } else {
        
        setSelectedAnodes(
          state.stack.selectedAnodes.filter(
          el => el.electrode_id !== electrodeId
          )
        );
        
      }
      
      renderStackSummary();
      renderStackUiState();
      updateDirtyFlags();
      
    });
    
    selectCell.appendChild(checkbox);
    tr.appendChild(selectCell);
    
    body.appendChild(tr);
    
  });

  renderStackUiState();
  
}


function renderStackSummary() {
  
  const body =
  document.getElementById('battery_stack_summary_body');
  
  body.innerHTML = '';
  
  const mode = state.config.coin?.coin_cell_mode || null;
  
  const halfType = state.config.coin?.half_cell_type || null;
  
  let cathodes = [...state.stack.selectedCathodes];
  let anodes = [...state.stack.selectedAnodes];
  
  /* ---------- enforce selection rules ---------- */
  
  if (mode === 'half_cell') {
    
    if (halfType === 'cathode_vs_li') {
      cathodes = cathodes.slice(0, 1);
      anodes = [];
    }
    
    if (halfType === 'anode_vs_li') {
      anodes = anodes.slice(0, 1);
      cathodes = [];
    }
    
  }
  
  if (mode === 'full_cell') {
    
    cathodes = cathodes.slice(0, 1);
    anodes = anodes.slice(0, 1);
    
  }
  
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
        role:'Анод',
        ...anodes[i]
      });
    }
    
    if (cathodes[i]) {
      stack.push({
        role:'Катод',
        ...cathodes[i]
      });
    }
    
  }
  
  /* ---------- render stack ---------- */
  
  stack.forEach((e,index)=>{
    
    const tr = document.createElement('tr');
    
    const posCell = document.createElement('td');
    posCell.textContent = index+1;
    tr.appendChild(posCell);
    
    const idCell = document.createElement('td');
    idCell.textContent = e.electrode_id;
    tr.appendChild(idCell);
    
    const roleCell = document.createElement('td');
    roleCell.textContent = e.role;
    tr.appendChild(roleCell);
    
    const massCell = document.createElement('td');
    massCell.textContent = e.electrode_mass_g ?? '';
    tr.appendChild(massCell);
    
    body.appendChild(tr);
    
  });
  
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
  
  /* ----- full-cell / pouch / cylindrical rules ----- */
  
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
  pouchConfig.hidden = formFactor !== 'pouch';
  cylConfig.hidden = formFactor !== 'cylindrical';

  coinAssembly.hidden = formFactor !== 'coin';
  pouchAssembly.hidden = formFactor !== 'pouch';
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
  const halfCellType = state.config.coin?.half_cell_type || null;
  const cathodeBlock = document.getElementById('cathode_source_block');
  const anodeBlock = document.getElementById('anode_source_block');
  const liFoilBlock = document.getElementById('li-foil_block');

  if (cathodeBlock) cathodeBlock.hidden = false;
  if (anodeBlock) anodeBlock.hidden = false;
  if (liFoilBlock) liFoilBlock.hidden = true;

  if (halfCellType === 'cathode_vs_li') {
    if (anodeBlock) anodeBlock.hidden = true;
    if (liFoilBlock) liFoilBlock.hidden = false;
  }

  if (halfCellType === 'anode_vs_li') {
    if (cathodeBlock) cathodeBlock.hidden = true;
    if (liFoilBlock) liFoilBlock.hidden = false;
  }
}

function trimStackSelectionForCurrentMode() {
  setSelectedCathodes(state.stack.selectedCathodes.slice(0, 1));
  setSelectedAnodes(state.stack.selectedAnodes.slice(0, 1));
}

function isCoinSingleSelectionMode() {
  return state.meta.form_factor === 'coin';
}

// -------- Validation / Business Rules: UI Flows --------

function renderInteractiveBatteryState() {
  refreshDirtyState();
  renderBatterySectionLifecycle();
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

  syncQcStateFromDom();

  try {
    const updatedBattery = await saveBatteryStatus();
    setCurrentBattery({
      ...(state.selection.currentBattery || {}),
      ...(updatedBattery || {}),
      status: state.qc.status || null
    });
    markSectionsSaved(['battery_qc']);
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
}

function resetBatteryPageState() {
  setCurrentBattery(null);
  setLoadedAssemblyComplete(false);
  setBatteryCreateButtonMode('create');
  resetBatterySectionState();
  state.snapshots.savedSectionStates = {};

  document.querySelector('form[name="battery_assembly_log_form"]').reset();

  resetElectrodeSelection();
  renderFormFactorSections();
  renderCoinCellModeUi();
  renderHalfCellTypeUi();
  renderBatteryPage();

  const list = document.getElementById('batteriesList');
  list.innerHTML = '';
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

function buildBatteryHeaderPayloadFromState() {
  return {
    project_id: state.meta.project_id ? Number(state.meta.project_id) : null,
    created_by: state.meta.created_by ? Number(state.meta.created_by) : null,
    form_factor: state.meta.form_factor || null,
    battery_notes: state.meta.battery_notes || null
  };
}

function validateBatteryHeaderPayload(headerPayload) {
  if (!headerPayload.project_id || !headerPayload.created_by || !headerPayload.form_factor) {
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
    throw new Error('Ошибка создания аккумулятора');
  }

  return res.json();
}

async function refreshBatteryHeaderDependencies() {
  await loadTapes();
  await loadBatteries();
}

function applySavedBatteryHeaderState(battery, headerPayload, buttonMode) {
  setCurrentBattery(battery);
  setMetaState(headerPayload);
  setBatteryCreateButtonMode(buttonMode);
  renderBatteryPage();
  markBatterySectionsSaved(['battery_meta']);
}

async function createBatteryFromHeaderPayload(headerPayload) {
  const battery = await createBatteryHeader(headerPayload);
  applySavedBatteryHeaderState(battery, headerPayload, 'createSaved');
  await refreshBatteryHeaderDependencies();
}

async function updateBatteryFromHeaderPayload(headerPayload) {
  const updatedBattery = await updateBatteryMeta(
    state.selection.currentBatteryId,
    headerPayload
  );

  applySavedBatteryHeaderState(updatedBattery, headerPayload, 'edit');
  await refreshBatteryHeaderDependencies();
}

async function handleBatteryCreateOrUpdate() {
  const statusTargetId = 'battery_create_btn';

  syncMetaStateFromDom();

  const headerPayload = buildBatteryHeaderPayloadFromState();

  if (!validateBatteryHeaderPayload(headerPayload)) {
    showBatteryInlineStatus(statusTargetId, 'Заполните проект, оператора и форм-фактор.', true);
    return;
  }

  try {
    if (!state.selection.currentBatteryId) {
      await createBatteryFromHeaderPayload(headerPayload);
      showBatteryInlineStatus(statusTargetId, 'Аккумулятор создан.');
      return;
    }

    await updateBatteryFromHeaderPayload(headerPayload);
    showBatteryInlineStatus(statusTargetId, 'Шапка аккумулятора сохранена.');
  } catch (err) {
    console.error(err);
    showBatteryInlineStatus(statusTargetId, 'Ошибка сохранения аккумулятора.', true);
  }
}

function syncAndRenderFormFactorChange() {
  syncMetaStateFromDom();
  renderFormFactorSections();
}

function handleFormFactorChange() {
  syncAndRenderFormFactorChange();
  finalizeStackModeChange();
}

function syncAndRenderCoinCellModeChange() {
  syncConfigStateFromDom();
  renderCoinCellModeUi();
}

function handleCoinCellModeChange() {
  syncAndRenderCoinCellModeChange();
  finalizeStackModeChange();
}

function handlePouchCaseSizeChange() {
  syncConfigStateFromDom();
  renderPouchCaseSizeUi();
  finalizeInteractiveBatteryChange();
}

function syncAndRenderHalfCellTypeChange() {
  syncConfigStateFromDom();
  renderHalfCellTypeUi();
}

function handleHalfCellTypeChange() {
  syncAndRenderHalfCellTypeChange();

  if (!shouldRenderInteractiveBatteryState()) {
    return;
  }

  resetElectrodeSelection();
  renderInteractiveBatteryState();
}

async function refreshProjectScopedBatteryData() {
  resetElectrodeSelection();
  await loadTapes();
}

async function handleProjectChange() {
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

  if (tapeId) {
    await loadRoleBatches(role, tapeId);
  }

  finalizeInteractiveBatteryChange();
}

async function loadRoleElectrodes(role, batchId) {
  if (role === 'cathode') {
    await loadCathodeElectrodes(batchId);
  } else {
    await loadAnodeElectrodes(batchId);
  }
}

async function handleBatchSelectionChange(role, batchId) {
  syncElectrodeSourcesStateFromDom();

  if (batchId) {
    await loadRoleElectrodes(role, batchId);
  }

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
.addEventListener('input', () => {
  handleBatteryFormMutation();
});

document
.querySelector('form[name="battery_assembly_log_form"]')
.addEventListener('change', () => {
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
  window.open(
    `/workflow/battery-print.html?battery_id=${state.selection.currentBatteryId}`,
    '_blank',
    'noopener'
  );
});

const exitBatteriesBtn = document.getElementById('exitBatteriesBtn');

exitBatteriesBtn.addEventListener('click', async () => {
  await handleExitBatteryPage();
});


document.getElementById('battery_create_btn').onclick = async () => {
  await handleBatteryCreateOrUpdate();
};

async function populateBatteryForm(battery) {
  setCurrentBattery(battery);
  setMetaState({
    project_id: battery.project_id ?? null,
    created_by: battery.created_by ?? null,
    form_factor: battery.form_factor ?? null,
    battery_notes: battery.notes ?? battery.battery_notes ?? null
  });
  setBatteryCreateButtonMode('edit');
  renderBatteryPage();

  await loadTapes();
  await loadBatteryAssembly(battery.battery_id);
}

const formFactorSelect =
document.getElementById('battery_form_factor');

formFactorSelect.addEventListener('change', () => {
  handleFormFactorChange();
});


const coinCellModeSelect = document.getElementById('coin_cell_mode');
const halfCellTypeSelect = document.getElementById('coin_half_cell_type');
const pouchCaseSizeSelect = document.getElementById('pouch_case_size_code');

coinCellModeSelect.addEventListener('change', () => {
  handleCoinCellModeChange();
});

halfCellTypeSelect.addEventListener('change', () => { 
  handleHalfCellTypeChange();
});

if (pouchCaseSizeSelect) {
  pouchCaseSizeSelect.addEventListener('change', () => {
    handlePouchCaseSizeChange();
  });
}

document
.getElementById('battery_project_id')
.addEventListener('change', async () => {
  await handleProjectChange();
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
  await refreshBatteryReferenceData();
  refreshDirtyState();
}

async function initBatteryPage() {
  installBatteryDebugInspector();
  await refreshBatteryReferenceData();
  await loadBatteries();
}

window.addEventListener('focus', async () => {
  await handleBatteryPageFocus();
});

initBatteryPage().catch(err => {
  console.error(err);
});
