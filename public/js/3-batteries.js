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
    pouch: {},
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
    createButtonMode: 'create'
  },
  snapshots: {
    savedSectionStates: {}
  },
  electrochem: getDefaultElectrochemState()
};

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

function captureSectionSnapshot(sectionKey) {
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

  if (sectionKey === 'battery_electrochem') {
    return JSON.stringify({
      electrochem_notes: state.electrochem.notes ?? '',
      electrochem_files: state.electrochem.files ?? '',
      saved_entries: state.electrochem.savedEntries
    });
  }

  return captureSectionState(sectionKey);
}

function captureAllSectionSnapshots() {
  return {
    battery_meta: captureSectionSnapshot('battery_meta'),
    battery_config: captureSectionSnapshot('battery_config'),
    electrode_sources: captureSectionSnapshot('electrode_sources'),
    battery_stack: captureSectionSnapshot('battery_stack'),
    battery_assembly: captureSectionSnapshot('battery_assembly'),
    battery_qc: captureSectionSnapshot('battery_qc'),
    battery_electrochem: captureSectionSnapshot('battery_electrochem')
  };
}

function markSectionSaved(sectionKey) {
  state.snapshots.savedSectionStates[sectionKey] = captureSectionSnapshot(sectionKey);
}

function markAllSectionsSaved() {
  state.snapshots.savedSectionStates = captureAllSectionSnapshots();
}

function refreshDirtyState() {
  Object.keys(captureAllSectionSnapshots()).forEach(sectionKey => {
    const current = captureSectionSnapshot(sectionKey);
    const saved = state.snapshots.savedSectionStates[sectionKey];
    setSectionDirty(sectionKey, current !== saved);
  });
}

function markSectionsSaved(sectionKeys) {
  sectionKeys.forEach(sectionKey => {
    markSectionSaved(sectionKey);
  });
  refreshDirtyState();
}

function markBatteryStateSaved() {
  markAllSectionsSaved();
  refreshDirtyState();
}

function hasUnsavedBatteryChanges() {
  return Object.keys(captureAllSectionSnapshots()).some(sectionKey => {
    return captureSectionSnapshot(sectionKey) !== state.snapshots.savedSectionStates[sectionKey];
  });
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

function setSectionDirty(sectionKey, isDirty) {
  const markerId =
  sectionKey === 'battery_meta' ? 'dirty-battery-meta'
  : sectionKey === 'battery_config' ? 'dirty-battery-config'
  : sectionKey === 'electrode_sources' ? 'dirty-electrode-sources'
  : sectionKey === 'battery_stack' ? 'dirty-battery-stack'
  : sectionKey === 'battery_assembly' ? 'dirty-battery-assembly'
  : sectionKey === 'battery_qc' ? 'dirty-battery-qc'
  : sectionKey === 'battery_electrochem' ? 'dirty-battery-electrochem'
  : null;
  
  const el = markerId ? document.getElementById(markerId) : null;
  
  if (el) {
    el.classList.toggle('visible', Boolean(isDirty));
  }
}

function clearDirtyFlags() {
  [
    'battery_meta',
    'battery_config',
    'electrode_sources',
    'battery_stack',
    'battery_assembly',
    'battery_qc',
    'battery_electrochem'
  ].forEach(sectionKey => {
    setSectionDirty(sectionKey, false);
  });
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

function hasCoinConfigDownstreamSelections() {
  const sourceSelected =
  hasMeaningfulValue(state.electrodeSources.cathode_tape_id) ||
  hasMeaningfulValue(state.electrodeSources.cathode_cut_batch_id) ||
  hasMeaningfulValue(state.electrodeSources.anode_tape_id) ||
  hasMeaningfulValue(state.electrodeSources.anode_cut_batch_id);
  
  const sourceSelectionSaved =
  captureSectionSnapshot('electrode_sources') === state.snapshots.savedSectionStates.electrode_sources;

  return sourceSelected && sourceSelectionSaved;
}

function isCommentField(el) {
  return Boolean(el?.name) && (
    el.name === 'battery_notes' ||
    el.name === 'qc_notes' ||
    el.name === 'electrochem_notes' ||
    el.name.endsWith('_notes')
  );
}

function hasSavedQcLock() {
  const ocvValue = state.qc.ocv_v;
  const esrValue = state.qc.esr_mohm;
  const qcSaved =
  captureSectionSnapshot('battery_qc') === state.snapshots.savedSectionStates.battery_qc;

  return hasMeaningfulValue(ocvValue) && hasMeaningfulValue(esrValue) && qcSaved;
}

function isBatteryAssemblyComplete(data) {
  const hasConfig =
  Boolean(data.coin_config || data.pouch_config || data.cyl_config);

  const hasSources =
  Array.isArray(data.electrode_sources) && data.electrode_sources.length > 0;

  const hasElectrodes =
  Array.isArray(data.electrodes) && data.electrodes.length > 0;

  const hasAssembly =
  Boolean(data.separator) && Boolean(data.electrolyte);

  return hasConfig && hasSources && hasElectrodes && hasAssembly;
}

function getSelectedLabel(selectId, fallbackValue = '—') {
  const select = document.getElementById(selectId);
  return select?.selectedOptions?.[0]?.textContent || fallbackValue;
}

function renderBatteryWorkspaceVisibility() {
  const hasBattery = Boolean(state.selection.currentBatteryId);
  const header = document.getElementById('battery_header');
  const workspace = document.getElementById('battery_workspace');

  if (header) {
    header.hidden = !hasBattery;
  }

  if (workspace) {
    workspace.hidden = !hasBattery;
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
  select.value = state.selection.currentBattery?.status || 'assembled';
}

function renderMetaForm() {
  document.getElementById('battery_project_id').value =
    state.meta.project_id ?? '';

  document.getElementById('battery_created_by').value =
    state.meta.created_by ?? '';

  document.getElementById('battery_form_factor').value =
    state.meta.form_factor ?? '';

  document.getElementById('battery_notes').value =
    state.meta.battery_notes ?? '';
}

function renderConfigForm() {
  populateFieldset(document.getElementById('coin_config'), state.config.coin);
  populateFieldset(document.getElementById('pouch_config'), state.config.pouch);
  populateFieldset(document.getElementById('cyl_config'), state.config.cylindrical);
}

function renderElectrodeSourcesForm() {
  populateFieldset(
    document.getElementById('battery_electrode_sources'),
    state.electrodeSources
  );
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
  renderMetaForm();
  renderConfigForm();
  renderElectrodeSourcesForm();
  renderAssemblyForm();
  renderQcForm();
  renderElectrochemForm();

  renderBatteriesList();
  renderTapeOptions();
  renderCathodeBatchOptions();
  renderAnodeBatchOptions();
  renderStackTables();
  renderBatteryWorkspaceVisibility();
  renderBatteryHeader();
  renderBatteryCreateButton();
  renderBatteryStatusControl();
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

function renderBatteryLockState() {
  const hasElectrodes = state.stack.selectedCathodes.length > 0 || state.stack.selectedAnodes.length > 0;
  
  document.getElementById('battery_project_id').disabled = hasElectrodes;
  document.getElementById('battery_created_by').disabled = hasElectrodes;
  document.getElementById('battery_form_factor').disabled = hasElectrodes;
  document.getElementById('cathode_tape_id').disabled = hasElectrodes;
  document.getElementById('cathode_cut_batch_id').disabled = hasElectrodes;
  document.getElementById('anode_tape_id').disabled = hasElectrodes;
  document.getElementById('anode_cut_batch_id').disabled = hasElectrodes;
  
  const coinConfigLocked =
  state.meta.form_factor === 'coin' &&
  (hasElectrodes || hasCoinConfigDownstreamSelections());
  
  document.getElementById('coin_cell_mode').disabled = coinConfigLocked;
  document.getElementById('coin_size_code').disabled = coinConfigLocked;
  document.getElementById('coin_half_cell_type').disabled = coinConfigLocked;
  
  const banner = document.getElementById('assembly_locked_banner');
  
  if (banner) {
    banner.classList.toggle('visible', hasElectrodes);
  }

  const qcLocked = hasSavedQcLock();

  document
  .querySelectorAll('form[name="battery_assembly_log_form"] input, form[name="battery_assembly_log_form"] select, form[name="battery_assembly_log_form"] textarea')
  .forEach(el => {
    if (!el.name) return;

    if (el.closest('#battery_electrochem')) {
      el.disabled = false;
      el.readOnly = false;
      return;
    }

    if (el.id === 'battery_status') {
      el.readOnly = false;
      return;
    }

    if (isCommentField(el)) {
      el.disabled = false;
      el.readOnly = false;
      return;
    }

    if (qcLocked) {
      el.disabled = true;
      el.readOnly = true;
    } else {
      el.readOnly = false;
    }
  });
}


// -------- Save --------

async function saveBatteryConfig() {
  if (!state.selection.currentBatteryId) {
    alert('Сначала создайте элемент.');
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
    alert('No configuration section is active.');
    return;
  }

  try {
    await savePayloadSection(table, payload);
    markSectionsSaved(['battery_config']);
    await refreshBatteryStatusState();
    renderBatteryPage();
    alert('Configuration saved.');
  } catch (err) {
    console.error(err);
    alert('Failed to save configuration: ' + (err.message || 'Unknown error'));
  }
}



async function saveElectrodeSources() {
  if (!state.selection.currentBatteryId) {
    alert('Сначала создайте элемент.');
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

  if (formFactor === 'coin' && mode === 'half_cell') {
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
    alert('Ошибка сохранения источников электродов: ' + (err.error || res.status));
    return;
  }

  markSectionsSaved(['electrode_sources']);
  await refreshBatteryStatusState();
  renderBatteryPage();

  alert('Источники электродов сохранены.');
}

async function saveElectrodeStack() {
  if (!state.selection.currentBatteryId) {
    alert('Сначала создайте элемент.');
    return;
  }

  const stack = buildStackPayload();

  if (!stack || stack.length === 0) {
    alert('Стек электродов пуст.');
    return;
  }

  const res = await fetch(`/api/batteries/battery_electrodes/${state.selection.currentBatteryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stack)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert('Ошибка сохранения стека: ' + (err.error || res.status));
    return;
  }
  
  markSectionsSaved(['battery_stack']);
  await refreshBatteryStatusState();
  renderBatteryPage();
  
  alert('Стек электродов сохранён.');
}

async function savePayloadSection(routeBase, payload) {
  if (!state.selection.currentBatteryId) {
    alert('Сначала создайте элемент.');
    return null;
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
  if (!state.selection.currentBatteryId) {
    alert('Сначала создайте элемент.');
    return;
  }

  syncMetaStateFromDom();
  syncAssemblyStateFromDom();

  const ctx = getActiveAssemblyContext();

  if (!ctx) {
    alert('Не выбран форм-фактор');
    return;
  }

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
    renderBatteryPage();

    alert('Сохранено.');
  } catch (err) {
    console.error(err);
    alert(err.message || 'Ошибка сохранения параметров сборки');
  }
}


async function saveBatteryQc() {
  try {
    syncQcStateFromDom();
    const payload = {
      ocv_v: state.qc.ocv_v ?? null,
      esr_mohm: state.qc.esr_mohm ?? null,
      qc_notes: state.qc.qc_notes || null
    };

    await savePayloadSection('battery_qc', payload);
    markSectionsSaved(['battery_qc']);
    renderBatteryLockState();
    renderBatteryPage();
    alert('Результаты QC сохранены.');
  } catch (err) {
    console.error(err);
    alert(err.message || 'Ошибка сохранения QC');
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
  if (!state.selection.currentBatteryId) {
    alert('Сначала создайте элемент.');
    return;
  }

  try {
    const filesInput = document.getElementById('electrochem_files');
    syncElectrochemStateFromDom();

    const selectedFiles = Array.from(filesInput.files || []);
    
    if (selectedFiles.length === 0) {
      alert('Выберите хотя бы один файл испытаний.');
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
    renderBatteryLockState();
    renderBatteryPage();
    alert('Результаты электрохимических испытаний сохранены.');
  } catch (err) {
    console.error(err);
    alert(err.message || 'Ошибка сохранения электрохимических испытаний');
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

async function loadProjects() {
  
  const current = projectSelect.value;
  
  const res = await fetch('/api/projects?project_id=0');
  const data = await res.json();
  
  projectSelect.innerHTML =
  '<option value="">— выбрать проект —</option>';
  
  data.forEach(p => {
    
    const option = document.createElement('option');
    
    option.value = p.project_id;
    option.textContent = p.name;
    
    projectSelect.appendChild(option);
    
  });
  
  projectSelect.value = current;
  
}

async function loadUsers() {
  
  const current = createdBySelect.value;
  
  const res = await fetch('/api/users');
  const data = await res.json();
  
  createdBySelect.innerHTML =
  '<option value="">— выбрать пользователя —</option>';
  
  data.forEach(u => {
    
    const option = document.createElement('option');
    
    option.value = u.user_id;
    option.textContent = u.full_name || u.name;
    
    createdBySelect.appendChild(option);
    
  });
  
  createdBySelect.value = current;
  
}

async function loadBatteries() {
  
  const res = await fetch('/api/batteries');
  
  if (!res.ok) {
    console.error('Failed to load batteries');
    return;
  }
  
  const data = await res.json();
  setBatteries(data);
  
}


async function loadSeparators() {
  const res = await fetch('/api/separators');

  if (!res.ok) {
    console.error('Failed to load separators');
    return;
  }

  const data = await res.json();

  const selects = [
    document.getElementById('coin_separator_id'),
    document.getElementById('pouch_separator_id'),
    document.getElementById('cyl_separator_id')
  ].filter(Boolean);

  selects.forEach(select => {
    const current = select.value;

    select.innerHTML = '<option value="">— выбрать сепаратор —</option>';

    data.forEach(s => {
      const option = document.createElement('option');
      option.value = s.sep_id;
      option.textContent = `#${s.sep_id} | ${s.name || '—'}`;
      select.appendChild(option);
    });

    select.value = current;
  });
}

async function loadElectrolytes() {
  const res = await fetch('/api/electrolytes');

  if (!res.ok) {
    console.error('Failed to load electrolytes');
    return;
  }

  const data = await res.json();

  const selects = [
    document.getElementById('coin_electrolyte_id'),
    document.getElementById('pouch_electrolyte_id'),
    document.getElementById('cyl_electrolyte_id')
  ].filter(Boolean);

  selects.forEach(select => {
    const current = select.value;

    select.innerHTML = '<option value="">— выбрать электролит —</option>';

    data.forEach(e => {
      const option = document.createElement('option');
      option.value = e.electrolyte_id;
      option.textContent = `#${e.electrolyte_id} | ${e.name || '—'}`;
      select.appendChild(option);
    });

    select.value = current;
  });
}


async function loadTapes() {
  
  const res = await fetch('/api/tapes/for-electrodes');
  
  if (!res.ok) {
    console.error('Failed to load tapes');
    return;
  }
  
  const data = await res.json();
  setTapes(data);
  
}


async function loadCathodeBatches(tapeId) {
  
  const res =
  await fetch(`/api/tapes/${tapeId}/electrode-cut-batches`);
  
  if (!res.ok) {
    console.error('Failed to load cathode batches');
    return;
  }
  
  const data = await res.json();
  setCathodeBatches(data);
  
}

async function loadAnodeBatches(tapeId) {
  
  const res =
  await fetch(`/api/tapes/${tapeId}/electrode-cut-batches`);
  
  if (!res.ok) {
    console.error('Failed to load anode batches');
    return;
  }
  
  const data = await res.json();
  setAnodeBatches(data);
  
}


async function loadCathodeElectrodes(batchId) {
  
  const res =
  await fetch(`/api/electrodes/electrode-cut-batches/${batchId}/electrodes`);
  
  if (!res.ok) {
    console.error('Failed to load cathode electrodes');
    return;
  }
  
  const data = await res.json();
  setCathodeElectrodes(data.filter(e => e.status_code === 1));
  
}

async function loadAnodeElectrodes(batchId) {
  
  const res =
  await fetch(`/api/electrodes/electrode-cut-batches/${batchId}/electrodes`);
  
  if (!res.ok) {
    console.error('Failed to load anode electrodes');
    return;
  }
  
  const data = await res.json();
  setAnodeElectrodes(data.filter(e => e.status_code === 1));
  
}

async function fetchBatteryAssembly(batteryId) {
  const res = await fetch(`/api/batteries/${batteryId}/assembly`);

  if (!res.ok) {
    throw new Error('Failed to load battery assembly');
  }

  return res.json();
}

function resetBatteryPageStateForRestore() {
  clearFieldset(document.getElementById('coin_config'));
  clearFieldset(document.getElementById('pouch_config'));
  clearFieldset(document.getElementById('cyl_config'));
  clearFieldset(document.getElementById('coin_assembly'));
  clearFieldset(document.getElementById('pouch_assembly'));
  clearFieldset(document.getElementById('cyl_assembly'));
  clearFieldset(document.getElementById('battery_qc'));
  clearFieldset(document.getElementById('battery_electrode_sources'));
  clearFieldset(document.getElementById('battery_electrochem'));
  setElectrochemState(getDefaultElectrochemState());
  setMetaState(getDefaultMetaState());
  setConfigState(getDefaultConfigState());
  setElectrodeSourcesState(getDefaultElectrodeSourcesState());
  setAssemblyState(getDefaultAssemblyState());
  setQcState(getDefaultQcState());
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


// Load a battery for editing
async function loadBatteryAssembly(batteryId) {
  setIsRestoringBattery(true);

  try {
    const data = await fetchBatteryAssembly(batteryId);

    resetBatteryPageStateForRestore();
    applyBatteryMetaToState(data);
    applyBatteryConfigToState(data);
    const {
      savedCathodeBatchId,
      savedAnodeBatchId
    } = applyElectrodeSourcesToState(data);
    applyStackToState(data);
    applyAssemblyToState(data);
    applyQcToState(data);
    applyElectrochemToState(data);

    document.getElementById('battery_form_factor').dispatchEvent(new Event('change'));

    applyBatteryStatusState(data.battery, data);

    document.getElementById('coin_cell_mode').dispatchEvent(new Event('change'));
    document.getElementById('coin_half_cell_type').dispatchEvent(new Event('change'));

    if (state.electrodeSources.cathode_tape_id) {
      await loadCathodeBatches(state.electrodeSources.cathode_tape_id);
    }

    if (state.electrodeSources.anode_tape_id) {
      await loadAnodeBatches(state.electrodeSources.anode_tape_id);
    }

    renderElectrodeSourcesForm();

    if (savedCathodeBatchId) {
      await loadCathodeElectrodes(savedCathodeBatchId);
    }

    if (savedAnodeBatchId) {
      await loadAnodeElectrodes(savedAnodeBatchId);
    }

    applySavedElectrodeState(data);
    renderBatteryPage();
    markBatteryStateSaved();
    renderBatteryLockState();
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
  
  state.selection.batteries.forEach(b => {
    
    const li = document.createElement('li');
    const btn = document.createElement('button');
    
    btn.type = 'button';
    const status =
    b.is_complete ? '✓ готово' : '⚠ не завершён';
    
    btn.textContent =
    `#${b.battery_id} | ${status} | ${b.project_name || '—'} | ${b.form_factor}`;
    
    btn.addEventListener('click', () => {
      populateBatteryForm(b);
    });
    
    li.appendChild(btn);
    list.appendChild(li);
    
  });
  
}

function renderTapeOptions() {
  
  const projectId = state.meta.project_id;
  
  const cathodeSelect =
  document.getElementById('cathode_tape_id');
  
  const anodeSelect =
  document.getElementById('anode_tape_id');
  
  cathodeSelect.innerHTML =
  '<option value="">— выбрать ленту —</option>';
  
  anodeSelect.innerHTML =
  '<option value="">— выбрать ленту —</option>';
  
  const filtered = state.reference.tapes.filter(t =>
    !projectId || t.project_id == projectId
  );
  
  filtered.forEach(t => {
    
    const option = document.createElement('option');
    
    option.value = t.tape_id;
    
    option.textContent =
    `#${t.tape_id} | ${t.name} | ${t.created_by}`;
    
    if (t.role === 'cathode') {
      cathodeSelect.appendChild(option.cloneNode(true));
    }
    
    if (t.role === 'anode') {
      anodeSelect.appendChild(option.cloneNode(true));
    }
    
  });
  
}


function renderCathodeBatchOptions() {
  
  const select =
  document.getElementById('cathode_cut_batch_id');
  
  select.innerHTML =
  '<option value="">— выбрать партию —</option>';
  
  state.reference.cathodeBatches.forEach(b => {
    
    const option = document.createElement('option');
    
    option.value = b.cut_batch_id;
    
    option.textContent =
    `#${b.cut_batch_id} | ${b.created_by}`;
    
    select.appendChild(option);
    
  });
  
}

function renderAnodeBatchOptions() {
  
  const select =
  document.getElementById('anode_cut_batch_id');
  
  select.innerHTML =
  '<option value="">— выбрать партию —</option>';
  
  state.reference.anodeBatches.forEach(b => {
    
    const option = document.createElement('option');
    
    option.value = b.cut_batch_id;
    
    option.textContent =
    `#${b.cut_batch_id} | ${b.created_by}`;
    
    select.appendChild(option);
    
  });
  
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
          setSelectedCathodes([...state.stack.selectedCathodes, electrode]);
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
      renderBatteryLockState();
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
          setSelectedAnodes([...state.stack.selectedAnodes, electrode]);
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
      renderBatteryLockState();
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
  
  const cathodes = [...state.stack.selectedCathodes];
  const anodes = [...state.stack.selectedAnodes];
  
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
  
  const formFactor = state.meta.form_factor;
  
  const coinCellMode = state.config.coin?.coin_cell_mode || null;
  
  const cathodes = state.stack.selectedCathodes.length;
  const anodes = state.stack.selectedAnodes.length;
  
  // For half-cells, balance does not apply
  if (formFactor === 'coin' && coinCellMode === 'half_cell') {
    return true;
  }
  
  // For full cells / pouch / cylindrical, require equal counts
  if (cathodes !== anodes) {
    alert(
      `Несбалансированный стек: катодов = ${cathodes}, анодов = ${anodes}. ` +
      'Для полного элемента количество катодов и анодов должно совпадать.'
    );
    return false;
  }
  
  return true;
  
}

function validateStackSelection() {
  
  const formFactor = state.meta.form_factor;
  
  const coinCellMode = state.config.coin?.coin_cell_mode || null;
  
  const halfCellType = state.config.coin?.half_cell_type || null;
  
  const cathodes = state.stack.selectedCathodes.length;
  const anodes = state.stack.selectedAnodes.length;
  
  /* ----- coin half-cell rules ----- */
  
  if (formFactor === 'coin' && coinCellMode === 'half_cell') {
    
    if (halfCellType === 'cathode_vs_li') {
      
      if (cathodes === 0) {
        alert('Выберите хотя бы один катод');
        return false;
      }
      
      return true;
    }
    
    if (halfCellType === 'anode_vs_li') {
      
      if (anodes === 0) {
        alert('Выберите хотя бы один анод');
        return false;
      }
      
      return true;
    }
    
    alert('Выберите тип полуячейки');
    return false;
    
  }
  
  /* ----- full-cell / pouch / cylindrical rules ----- */
  
  if (cathodes === 0) {
    alert('Выберите хотя бы один катод');
    return false;
  }
  
  if (anodes === 0) {
    alert('Выберите хотя бы один анод');
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
  renderBatteryLockState();
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

// -------- Validation / Business Rules: UI Flows --------

function renderInteractiveBatteryState() {
  renderBatteryLockState();
  refreshDirtyState();
}

function handleBatteryFormMutation() {
  syncAllSectionStateFromDom();

  if (state.ui.isRestoringBattery) return;

  renderInteractiveBatteryState();
}

async function handleBatteryStatusChange() {
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
    alert('Статус батареи сохранён.');
  } catch (err) {
    console.error(err);
    alert(err.message || 'Ошибка сохранения статуса батареи');
  }
}

function resetBatteryPageState() {
  setCurrentBattery(null);
  setLoadedAssemblyComplete(false);
  setBatteryCreateButtonMode('create');
  setMetaState(getDefaultMetaState());
  setConfigState(getDefaultConfigState());
  setElectrodeSourcesState(getDefaultElectrodeSourcesState());
  setAssemblyState(getDefaultAssemblyState());
  setQcState(getDefaultQcState());
  setElectrochemState(getDefaultElectrochemState());
  state.snapshots.savedSectionStates = {};

  document.querySelector('form[name="battery_assembly_log_form"]').reset();

  resetElectrodeSelection();
  renderFormFactorSections();
  renderCoinCellModeUi();
  renderHalfCellTypeUi();
  renderBatteryPage();
  renderBatteryLockState();

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

async function handleBatteryCreateOrUpdate() {
  syncMetaStateFromDom();

  const headerPayload = buildBatteryHeaderPayloadFromState();

  if (!headerPayload.project_id || !headerPayload.created_by || !headerPayload.form_factor) {
    alert('Заполните проект, оператора и форм-фактор');
    return;
  }

  try {
    if (!state.selection.currentBatteryId) {
      const res = await fetch('/api/batteries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(headerPayload)
      });

      if (!res.ok) {
        throw new Error('Ошибка создания аккумулятора');
      }

      const battery = await res.json();

      setCurrentBattery(battery);
      setMetaState(headerPayload);
      setBatteryCreateButtonMode('createSaved');
      renderBatteryPage();

      await loadTapes();
      await loadBatteries();
      markBatteryStateSaved();
      return;
    }

    const updatedBattery = await updateBatteryMeta(
      state.selection.currentBatteryId,
      headerPayload
    );

    setCurrentBattery(updatedBattery);
    setMetaState(headerPayload);
    setBatteryCreateButtonMode('edit');
    renderBatteryPage();
    await loadTapes();
    await loadBatteries();
    markBatteryStateSaved();

    alert('Шапка аккумулятора сохранена');
  } catch (err) {
    console.error(err);
    alert('Ошибка сохранения аккумулятора');
  }
}

function handleFormFactorChange() {
  syncMetaStateFromDom();
  renderFormFactorSections();

  if (!state.ui.isRestoringBattery) {
    trimStackSelectionForCurrentMode();
    renderStackTables();
    renderInteractiveBatteryState();
  }
}

function handleCoinCellModeChange() {
  syncConfigStateFromDom();
  renderCoinCellModeUi();

  if (!state.ui.isRestoringBattery) {
    trimStackSelectionForCurrentMode();
    renderStackTables();
    renderInteractiveBatteryState();
  }
}

function handleHalfCellTypeChange() {
  syncConfigStateFromDom();
  renderHalfCellTypeUi();
  resetElectrodeSelection();

  if (!state.ui.isRestoringBattery) {
    renderInteractiveBatteryState();
  }
}

async function handleProjectChange() {
  syncMetaStateFromDom();
  resetElectrodeSelection();
  await loadTapes();

  if (!state.ui.isRestoringBattery) {
    renderInteractiveBatteryState();
  }
}

async function handleTapeSelectionChange(role, tapeId) {
  syncElectrodeSourcesStateFromDom();

  if (!tapeId) {
    if (!state.ui.isRestoringBattery) {
      renderInteractiveBatteryState();
    }
    return;
  }

  if (role === 'cathode') {
    await loadCathodeBatches(tapeId);
  } else {
    await loadAnodeBatches(tapeId);
  }

  if (!state.ui.isRestoringBattery) {
    renderInteractiveBatteryState();
  }
}

async function handleBatchSelectionChange(role, batchId) {
  syncElectrodeSourcesStateFromDom();

  if (!batchId) {
    if (!state.ui.isRestoringBattery) {
      renderInteractiveBatteryState();
    }
    return;
  }

  if (role === 'cathode') {
    await loadCathodeElectrodes(batchId);
  } else {
    await loadAnodeElectrodes(batchId);
  }

  if (!state.ui.isRestoringBattery) {
    renderInteractiveBatteryState();
  }
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
  
  document.getElementById('battery_form_factor').dispatchEvent(
    new Event('change')
  );
  
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

coinCellModeSelect.addEventListener('change', () => {
  handleCoinCellModeChange();
});

halfCellTypeSelect.addEventListener('change', () => { 
  handleHalfCellTypeChange();
});

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

// -------- Init --------

window.addEventListener('focus', async () => {
  
  const wasClean = !hasUnsavedBatteryChanges();
  
  await refreshBatteryReferenceData();
  
  if (state.selection.currentBatteryId && wasClean) {
    markBatteryStateSaved();
  }
  
});

refreshBatteryReferenceData();
loadBatteries();
