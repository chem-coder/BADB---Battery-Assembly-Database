
// -------- State and helpers --------

const addInput = document.getElementById('tape-name');
const nameInput = document.getElementById('tape-name-input');
const form = document.forms['tape-form'];
const title = form.querySelector('h2');
const saveBtn = document.getElementById('saveBtn');
const printBtn = document.getElementById('printBtn');
const clearBtn = document.getElementById('clearBtn');
const deleteTapeBtn = document.getElementById('deleteTapeBtn');
const tapeStickyHeader = document.getElementById('tape_sticky_header');
const tapeStickyLabel = document.getElementById('tape_sticky_label');
const tapeStickyMeta = document.getElementById('tape_sticky_meta');
const tapeGlobalDirty = document.getElementById('tape-global-dirty');
const recipeMaterialsSaveBtn = document.getElementById('0-recipe-materials-save-btn');
const tapesList = document.getElementById('tapesList');
const tapeListFilterTextInput = document.getElementById('tape-list-filter-text');
const tapeListFilterStatusSelect = document.getElementById('tape-list-filter-status');
const tapeListFilterProjectSelect = document.getElementById('tape-list-filter-project');
const tapeListFilterRoleSelect = document.getElementById('tape-list-filter-role');
const tapeListFilterSidednessSelect = document.getElementById('tape-list-filter-sidedness');
const clearTapeListFiltersBtn = document.getElementById('clearTapeListFiltersBtn');
const tapeListFilterSummary = document.getElementById('tape-list-filter-summary');

const createdBySelect = document.getElementById('tape-created-by');
const createdAtInput = document.getElementById('tape-created-at');
const dryingOperatorSelect = document.getElementById('0-drying_am-operator');
const projectSelect   = document.getElementById('project_id');
const projectMultiSelect = document.getElementById('project-multiselect');
const projectMultiSelectTrigger = document.getElementById('project-multiselect-trigger');
const projectMultiSelectOptions = document.getElementById('project-multiselect-options');
const tapeTypeSelect  = document.getElementById('tape_type');
const recipeSelect    = document.getElementById('tape-recipe-id'); // already added in HTML
const pendingInstanceComponentLoads = new Set();
const pendingPlannedComponentLoads = new Set();

const tapePageState = window.tapePageState = {
  form: {
    mode: null,
    isRestoringTape: false,
    fields: {
      name: '',
      notes: '',
      created_by: '',
      created_at: '',
      project_id: '',
      project_ids: [],
      tape_type: '',
      tape_recipe_id: '',
      calc_mode: 'from_active_mass',
      target_mass_g: ''
    }
  },
  selection: {
    currentTapeId: null,
    currentTape: null
  },
  recipe: {
    currentLines: [],
    selectedInstancesByLineId: {},
    instanceCacheByMaterialId: {},
    instanceComponentsCache: {},
    restoringActuals: []
  },
  reference: {
    users: [],
    projects: [],
    currentRecipes: [],
    foils: [],
    coatingMethods: [],
    dryMixingMethods: [],
    wetMixingMethods: [],
    dryingAtmospheres: []
  },
  tapes: {
    items: []
  },
  workflow: {
    drying_am: null,
    drying_tape: null,
    drying_pressed_tape: null,
    maintenance_dry_box: null,
    weighing: null,
    mixing: null,
    coating: null,
    calendering: null
  },
  derived: {
    targetDryMassByLineId: {},
    plannedMassByLineId: {},
    expandedCalculation: []
  },
  ui: {
    name: {
      isEditing: false
    },
    coating: {
      sidednessAuto: true
    },
    mixing: {
      wetMixingAuto: true,
      lastAutoWetMixingId: ''
    },
    panels: {
      mixing: {
        dryParamsVisible: false,
        wetParamsVisible: false
      }
    },
    delays: {
      weighing: '',
      mixing: '',
      coating: '',
      drying_tape: '',
      calendering: '',
      drying_pressed_tape: '',
      maintenance_dry_box: '',
      liveSinceLastStep: ''
    },
    sections: {
      visibility: {
        '0-general-info': true,
        '0-tape-recipe-materials': false,
        '0-drying_materials': false,
        '1-slurry': false,
        '2-tape': false,
        '3-storage': false,
        'calculations-expanded': true
      },
      open: {
        '0-general-info': true,
        '0-tape-recipe-materials': false,
        '0-drying_materials': false,
        '1-slurry': false,
        '2-tape': false,
        '3-storage': false,
        'calculations-expanded': false
      }
    },
    savedSnapshots: {
      general_info: null,
      recipe_materials: null,
      drying_am: null,
      weighing: null,
      mixing: null,
      coating: null,
      drying_tape: null,
      calendering: null,
      drying_pressed_tape: null
    },
    dirtySteps: {
      general_info: false,
      recipe_materials: false,
      drying_materials: false,
      drying_am: false,
      slurry: false,
      weighing: false,
      mixing: false,
      tape: false,
      coating: false,
      drying_tape: false,
      calendering: false,
      drying_pressed_tape: false
    }
  }
};

const state = tapePageState;

function cloneTapeDebugValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function getTapeDebugSnapshot() {
  return {
    form: cloneTapeDebugValue(state.form),
    selection: cloneTapeDebugValue(state.selection),
    recipe: cloneTapeDebugValue(state.recipe),
    reference: cloneTapeDebugValue(state.reference),
    tapes: cloneTapeDebugValue(state.tapes),
    workflow: cloneTapeDebugValue(state.workflow),
    derived: cloneTapeDebugValue(state.derived),
    ui: cloneTapeDebugValue(state.ui)
  };
}

function showForm() {
  form.hidden = false;
  addInput.disabled = true;
  startLiveSinceLastStepTimer();
}

function hideForm() {
  form.hidden = true;
  addInput.disabled = false;
  stopLiveSinceLastStepTimer();
}

function renderFormVisibility() {
  if (state.form.mode) {
    showForm();
  } else {
    hideForm();
  }
}

function renderSectionState() {
  Object.entries(state.ui.sections.visibility).forEach(([id, isVisible]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = !isVisible;
  });

  Object.entries(state.ui.sections.open).forEach(([id, isOpen]) => {
    const el = document.getElementById(id);
    if (!el || typeof el.open === 'undefined') return;
    el.open = Boolean(isOpen);
  });
}

function renderPanelState() {
  const dryParams = document.getElementById('mix-dry-params');
  if (dryParams) {
    dryParams.hidden = !state.ui.panels.mixing.dryParamsVisible;
  }

  const wetParams = document.getElementById('mix-wet-params');
  if (wetParams) {
    wetParams.hidden = !state.ui.panels.mixing.wetParamsVisible;
  }

  const coatingParams = document.getElementById('2-coating-params');
  if (coatingParams) {
    coatingParams.hidden = false;
  }
}

function renderDelayState() {
  const delayMap = {
    weighing: '1-weighing-delay',
    mixing: '1-mixing-delay',
    coating: '2-coating-delay',
    calendering: '2-calendering-delay',
    drying_pressed_tape: '2b-drying_pressed_tape-delay',
    maintenance_dry_box: '2c-dry-box-live'
  };

  Object.entries(delayMap).forEach(([key, elementId]) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = state.ui.delays[key] || '';
  });

  const liveSinceEl = document.getElementById('live-since-last-step');
  if (liveSinceEl) {
    liveSinceEl.textContent = state.ui.delays.liveSinceLastStep || '';
  }
}

function formatTapeRoleLabel(role) {
  if (role === 'cathode') return 'Катод';
  if (role === 'anode') return 'Анод';
  return role || '';
}

function getTapeProjectNamesFromState() {
  const selectedProjectIds = new Set(normalizeProjectIds(state.form.fields.project_ids));
  const selectedNames = state.reference.projects
    .filter((project) => selectedProjectIds.has(String(project.project_id)))
    .map((project) => project.name);

  return selectedNames.join(', ') ||
    state.selection.currentTape?.project_names ||
    state.selection.currentTape?.project_name ||
    '';
}

function renderTapeStickyHeader() {
  if (!tapeStickyHeader || !tapeStickyLabel || !tapeStickyMeta) return;

  const isFormOpen = Boolean(state.form.mode);
  tapeStickyHeader.hidden = !isFormOpen;

  if (!isFormOpen) return;

  const tapeName = (state.form.fields.name || state.selection.currentTape?.name || '').trim();
  tapeStickyLabel.textContent = state.selection.currentTapeId
    ? `Лента #${state.selection.currentTapeId}${tapeName ? ` | ${tapeName}` : ''}`
    : `Новая лента${tapeName ? ` | ${tapeName}` : ''}`;

  const roleText = formatTapeRoleLabel(state.form.fields.tape_type || state.selection.currentTape?.role);
  const statusText = state.selection.currentTape?.workflow_status_label || '';
  const projectsText = getTapeProjectNamesFromState();
  const creatorText =
    state.selection.currentTape?.created_by_name ||
    createdBySelect?.selectedOptions?.[0]?.textContent ||
    '';
  const metaParts = [roleText, statusText, projectsText, creatorText]
    .filter((part) => part && part !== '— автоматически —');

  tapeStickyMeta.textContent = metaParts.join(' — ') || '—';

  if (tapeGlobalDirty) {
    const hasDirtySteps = Object.values(state.ui.dirtySteps || {}).some(Boolean);
    tapeGlobalDirty.classList.toggle('visible', hasDirtySteps);
  }
}

function renderTapeForm() {
  writeTopLevelFormStateToDom();
  renderCalcModeLabel();
  if (saveBtn) {
    saveBtn.textContent = state.form.mode === 'edit'
      ? 'Сохранить изменения'
      : 'Создать ленту';
  }
  if (printBtn) {
    printBtn.hidden = !state.selection.currentTapeId;
  }
  if (deleteTapeBtn) {
    deleteTapeBtn.hidden = state.form.mode !== 'edit' || !state.selection.currentTapeId;
  }
  renderFormVisibility();
  renderSectionState();
  renderPanelState();
  renderTapeWorkflowProgressionState();
  renderTapeStickyHeader();
}

function setMode(nextMode, { render = true } = {}) {
  state.form.mode = nextMode || null;
  if (render) renderTapeForm();
}

function setTapes(tapes, { render = true } = {}) {
  state.tapes.items = Array.isArray(tapes) ? tapes : [];
  if (state.selection.currentTapeId) {
    state.selection.currentTape =
      state.tapes.items.find((t) => Number(t.tape_id) === Number(state.selection.currentTapeId)) || null;
  }
  if (render) renderTapesList();
}

function setCurrentTape(tape, { mode = null, render = true } = {}) {
  state.selection.currentTape = tape || null;
  state.selection.currentTapeId = tape?.tape_id ?? null;
  if (mode !== null) {
    setMode(mode, { render });
  } else if (render) {
    renderTapeForm();
  }
}

function patchCurrentTapeAvailability(availabilityStatus) {
  if (!state.selection.currentTapeId) return;

  if (state.selection.currentTape) {
    state.selection.currentTape = {
      ...state.selection.currentTape,
      availability_status: availabilityStatus
    };
  }

  state.tapes.items = state.tapes.items.map((tape) =>
    Number(tape.tape_id) === Number(state.selection.currentTapeId)
      ? { ...tape, availability_status: availabilityStatus }
      : tape
  );
}

function clearCurrentTapeSelection() {
  setCurrentTape(null);
}

function setSectionVisibility(sectionId, isVisible, { render = true } = {}) {
  state.ui.sections.visibility[sectionId] = Boolean(isVisible);
  if (render) renderSectionState();
}

function setSectionOpen(sectionId, isOpen, { render = true } = {}) {
  state.ui.sections.open[sectionId] = Boolean(isOpen);
  if (render) renderSectionState();
}

function setSectionsVisibility(nextVisibility, { render = true } = {}) {
  state.ui.sections.visibility = {
    ...state.ui.sections.visibility,
    ...nextVisibility
  };
  if (render) renderSectionState();
}

function setSectionsOpen(nextOpen, { render = true } = {}) {
  state.ui.sections.open = {
    ...state.ui.sections.open,
    ...nextOpen
  };
  if (render) renderSectionState();
}

function resetSectionState() {
  state.ui.coating.sidednessAuto = true;
  state.ui.mixing.wetMixingAuto = true;
  state.ui.mixing.lastAutoWetMixingId = '';
  state.ui.sections.visibility = {
    '0-general-info': true,
    '0-tape-recipe-materials': false,
    '0-drying_materials': false,
    '1-slurry': false,
    '2-tape': false,
    '3-storage': false,
    'calculations-expanded': true
  };
  state.ui.sections.open = {
    '0-general-info': true,
    '0-tape-recipe-materials': false,
    '0-drying_materials': false,
    '1-slurry': false,
    '2-tape': false,
    '3-storage': false,
    'calculations-expanded': false
  };
  renderSectionState();
}

function setNameEditing(isEditing, { render = true } = {}) {
  state.ui.name.isEditing = Boolean(isEditing);
  if (render) applyNameStateToDom();
}

function setMixingParamsVisibility({ dryParamsVisible, wetParamsVisible }) {
  state.ui.panels.mixing = {
    dryParamsVisible: Boolean(dryParamsVisible),
    wetParamsVisible: Boolean(wetParamsVisible)
  };
  renderPanelState();
}

function sortForSnapshot(value) {
  if (Array.isArray(value)) {
    return value.map(sortForSnapshot);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortForSnapshot(value[key]);
        return acc;
      }, {});
  }
  return value ?? null;
}

function serializeSnapshot(value) {
  return JSON.stringify(sortForSnapshot(value));
}

function getCurrentSnapshot(stepCode) {
  if (stepCode === 'general_info') {
    return serializeSnapshot({
      name: state.form.fields.name || '',
      notes: state.form.fields.notes || '',
      created_at: state.form.fields.created_at || '',
      project_id: state.form.fields.project_id || '',
      project_ids: state.form.fields.project_ids || [],
      tape_type: state.form.fields.tape_type || '',
      tape_recipe_id: state.form.fields.tape_recipe_id || '',
      calc_mode: state.form.fields.calc_mode || 'from_active_mass',
      target_mass_g: state.form.fields.target_mass_g || ''
    });
  }

  if (stepCode === 'recipe_materials') {
    return serializeSnapshot({
      selectedInstancesByLineId: state.recipe.selectedInstancesByLineId
    });
  }

  if (stepCode === 'drying_am' || stepCode === 'weighing' || stepCode === 'mixing' ||
      stepCode === 'coating' || stepCode === 'drying_tape' ||
      stepCode === 'calendering' || stepCode === 'drying_pressed_tape') {
    return serializeSnapshot(state.workflow[stepCode]);
  }

  return null;
}

function markSavedSnapshot(stepCode) {
  if (!(stepCode in state.ui.savedSnapshots)) return;
  state.ui.savedSnapshots[stepCode] = getCurrentSnapshot(stepCode);
}

function markAllSavedSnapshotsCurrent() {
  Object.keys(state.ui.savedSnapshots).forEach((stepCode) => {
    markSavedSnapshot(stepCode);
  });
}

function refreshDirtyFromSnapshots() {
  if (state.form.isRestoringTape) return;

  Object.keys(state.ui.savedSnapshots).forEach((stepCode) => {
    dirtySteps[stepCode] =
      state.ui.savedSnapshots[stepCode] !== getCurrentSnapshot(stepCode);
  });

  refreshParentDirtyStates();
  renderTapeWorkflowProgressionState();
}

function hasSavedStep(stepCode) {
  return state.ui.savedSnapshots[stepCode] !== null;
}

function setFieldsetDisabled(fieldsetId, shouldDisable, lockMessage = '') {
  const fieldset = document.getElementById(fieldsetId);
  if (!fieldset) return;

  fieldset.disabled = Boolean(shouldDisable);

  if (shouldDisable && lockMessage) {
    fieldset.title = lockMessage;
    fieldset.dataset.lockMessage = lockMessage;
  } else {
    fieldset.removeAttribute('title');
    delete fieldset.dataset.lockMessage;
  }
}

function renderTapeWorkflowProgressionState() {
  const hasTape = Boolean(state.selection.currentTapeId);
  const recipeSaved = hasSavedStep('recipe_materials');
  const dryingAmSaved = hasSavedStep('drying_am');
  const weighingSaved = hasSavedStep('weighing');
  const mixingSaved = hasSavedStep('mixing');
  const dryingTapeSaved = hasSavedStep('drying_tape');
  const calenderingSaved = hasSavedStep('calendering');
  const dryingPressedSaved = hasSavedStep('drying_pressed_tape');

  setSectionsVisibility({
    '0-general-info': true,
    '0-tape-recipe-materials': hasTape,
    '0-drying_materials': recipeSaved,
    '1-slurry': dryingAmSaved,
    '2-tape': mixingSaved,
    '3-storage': dryingPressedSaved,
    'calculations-expanded': hasTape
  }, { render: true });

  setFieldsetDisabled(
    '1-mixing',
    !weighingSaved,
    'Сначала сохраните этап I.1. Замес пасты.'
  );

  setFieldsetDisabled(
    '2-coating',
    !mixingSaved,
    'Сначала сохраните этап I.2. Перемешивание пасты.'
  );

  setFieldsetDisabled(
    '2-calendering',
    !dryingTapeSaved,
    'Сначала сохраните этап II.1. Нанесение и параметры сушки.'
  );

  setFieldsetDisabled(
    '2b-drying_pressed_tape',
    !calenderingSaved,
    'Сначала сохраните этап II.3. Каландрирование.'
  );
}

function getSectionOpenStateForWorkflowStatus(statusCode) {
  return {
    '0-general-info': !statusCode,
    '0-tape-recipe-materials': statusCode === 'recipe_materials',
    '0-drying_materials': statusCode === 'drying_am',
    '1-slurry': statusCode === 'weighing' || statusCode === 'mixing',
    '2-tape': statusCode === 'coating'
      || statusCode === 'drying_tape'
      || statusCode === 'calendering'
      || statusCode === 'drying_pressed_tape',
    '3-storage': statusCode === 'finished',
    'calculations-expanded': false
  };
}

function setRecipeLines(lines) {
  state.recipe.currentLines = Array.isArray(lines) ? lines : [];
}

function setSelectedInstancesByLineId(nextMap) {
  state.recipe.selectedInstancesByLineId = nextMap || {};
  refreshDirtyFromSnapshots();
}

function setSelectedInstanceForLine(recipeLineId, value) {
  setSelectedInstancesByLineId({
    ...state.recipe.selectedInstancesByLineId,
    [recipeLineId]: value || null
  });
}

function setInstanceCacheByMaterialId(nextCache) {
  state.recipe.instanceCacheByMaterialId = nextCache || {};
}

function setInstanceComponentsCache(nextCache) {
  state.recipe.instanceComponentsCache = nextCache || {};
}

function setRestoringActuals(actuals) {
  state.recipe.restoringActuals = Array.isArray(actuals) ? actuals : [];
}

function setFormFields(nextFields, { render = false } = {}) {
  state.form.fields = nextFields || getDefaultTopLevelFormFields();
  refreshDirtyFromSnapshots();
  if (render) renderTapeForm();
}

function setFormField(field, value, { render = false } = {}) {
  setFormFields({
    ...state.form.fields,
    [field]: value
  }, { render });
}

function normalizeProjectIds(values) {
  const source = Array.isArray(values) ? values : [values];
  const projectIds = [];

  source.forEach((value) => {
    if (value === null || value === undefined || value === '') return;
    const projectId = String(value);
    if (!projectIds.includes(projectId)) {
      projectIds.push(projectId);
    }
  });

  return projectIds;
}

function getTapeProjectIds(tape) {
  if (Array.isArray(tape?.project_ids) && tape.project_ids.length) {
    return normalizeProjectIds(tape.project_ids);
  }
  return normalizeProjectIds(tape?.project_id || '');
}

function setProjectIds(projectIds, { render = false } = {}) {
  const normalized = normalizeProjectIds(projectIds);
  setFormFields({
    ...state.form.fields,
    project_id: normalized[0] || '',
    project_ids: normalized
  }, { render });

  if (!render) {
    updateProjectMultiSelectDom();
  }
}

function setReferenceUsers(users) {
  state.reference.users = Array.isArray(users) ? users : [];
}

function setReferenceProjects(projects) {
  state.reference.projects = Array.isArray(projects) ? projects : [];
  renderTapeProjectFilterOptions();
}

function setReferenceCurrentRecipes(recipes) {
  state.reference.currentRecipes = Array.isArray(recipes) ? recipes : [];
}

function setReferenceFoils(foils) {
  state.reference.foils = Array.isArray(foils) ? foils : [];
}

function setReferenceCoatingMethods(methods) {
  state.reference.coatingMethods = Array.isArray(methods) ? methods : [];
}

function setReferenceDryMixingMethods(items) {
  state.reference.dryMixingMethods = Array.isArray(items) ? items : [];
}

function setReferenceWetMixingMethods(items) {
  state.reference.wetMixingMethods = Array.isArray(items) ? items : [];
}

function setReferenceDryingAtmospheres(items) {
  state.reference.dryingAtmospheres = Array.isArray(items) ? items : [];
}

function setWorkflowState(nextWorkflow, { apply = false } = {}) {
  state.workflow = nextWorkflow || getDefaultWorkflowState();
  refreshDelayState();
  refreshDirtyFromSnapshots();
  if (apply) renderWorkflowState();
}

function setWorkflowStep(stepKey, stepValue, { apply = false, applyFn = null } = {}) {
  state.workflow[stepKey] = stepValue;
  refreshDelayState();
  refreshDirtyFromSnapshots();
  if (applyFn) {
    applyFn();
    return;
  }
  if (apply) renderWorkflowState();
}

function updateWorkflowStepField(stepKey, field, value) {
  setWorkflowStep(stepKey, {
    ...state.workflow[stepKey],
    [field]: value
  });
}

function setWeighingActualsByLineId(nextMap) {
  setWorkflowStep('weighing', {
    ...state.workflow.weighing,
    actualsByLineId: nextMap || {}
  });
}

function setWeighingActualForLine(recipeLineId, patch) {
  const current = state.workflow.weighing.actualsByLineId[recipeLineId] || getDefaultWeighingActual();
  setWeighingActualsByLineId({
    ...state.workflow.weighing.actualsByLineId,
    [recipeLineId]: {
      ...current,
      ...patch
    }
  });
}

function setDerivedCalculationState(nextDerived, { render = true } = {}) {
  state.derived = {
    ...state.derived,
    ...nextDerived
  };
  if (render) renderDerivedState();
}

function mergeRestoringActualsIntoState(restoringActuals = []) {
  const actualsByLineId = { ...state.workflow.weighing.actualsByLineId };
  const selectedInstances = { ...state.recipe.selectedInstancesByLineId };

  restoringActuals.forEach((saved) => {
    const recipeLineId = Number(saved.recipe_line_id);
    actualsByLineId[recipeLineId] = {
      measure_mode: saved.measure_mode || 'mass',
      actual_mass_g: saved.actual_mass_g ?? '',
      actual_volume_ml: saved.actual_volume_ml ?? ''
    };

    if (saved.material_instance_id && !selectedInstances[recipeLineId]) {
      selectedInstances[recipeLineId] = String(saved.material_instance_id);
    }
  });

  setWeighingActualsByLineId(actualsByLineId);
  setSelectedInstancesByLineId(selectedInstances);
}

function resetForm() {
  form.reset();
  
  resetTopLevelFormState();
  resetWorkflowState();
  resetSectionState();
  setMode(null);
  clearCurrentTapeSelection();
  setRecipeLines([]);
  setSelectedInstancesByLineId({});
  setInstanceCacheByMaterialId({});
  setInstanceComponentsCache({});
  setRestoringActuals([]);
  renderWorkflowState();
  renderTapeForm();
  markAllSavedSnapshotsCurrent();
  refreshDirtyFromSnapshots();
}

function getDefaultTopLevelFormFields() {
  return {
    name: '',
    notes: '',
    created_by: '',
    created_at: '',
    project_id: '',
    project_ids: [],
    tape_type: '',
    tape_recipe_id: '',
    calc_mode: 'from_active_mass',
    target_mass_g: ''
  };
}

function getDefaultWeighingActual() {
  return {
    measure_mode: 'mass',
    actual_mass_g: '',
    actual_volume_ml: ''
  };
}

function toFiniteTapeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getDefaultActualModeForLine(line) {
  return line?.recipe_role === 'solvent' ? 'volume' : 'mass';
}

function getSelectedInstanceDensityForLine(line) {
  if (!line) return null;

  const selectedInstanceId = Number(state.recipe.selectedInstancesByLineId[line.recipe_line_id]);
  if (!Number.isInteger(selectedInstanceId)) return null;

  const instances = state.recipe.instanceCacheByMaterialId[line.material_id] || [];
  const instance = instances.find((item) => Number(item.material_instance_id) === selectedInstanceId);
  return toFiniteTapeNumber(instance?.density_g_ml);
}

function formatActualDerivedInfo({ measureMode, rawValue, density }) {
  const numericValue = toFiniteTapeNumber(rawValue);

  if (!(Number.isFinite(numericValue) && numericValue > 0)) {
    return { text: '', tone: 'neutral' };
  }

  if (!(Number.isFinite(density) && density > 0)) {
    if (measureMode === 'volume') {
      return {
        text: 'Плотность не указана: масса не рассчитана автоматически.',
        tone: 'warning'
      };
    }
    return { text: '', tone: 'neutral' };
  }

  if (measureMode === 'volume') {
    return {
      text: `≈ ${(numericValue * density).toFixed(4)} г`,
      tone: 'derived'
    };
  }

  return {
    text: `≈ ${(numericValue / density).toFixed(4)} мл`,
    tone: 'derived'
  };
}

function formatTapeMass(value) {
  return Number.isFinite(value) ? value.toFixed(4).replace(/\.?0+$/, '') : '—';
}

function getEffectiveActualMassForLine(line) {
  const actual = state.workflow.weighing.actualsByLineId[line.recipe_line_id] || getDefaultWeighingActual();
  const measureMode = actual.measure_mode || getDefaultActualModeForLine(line);

  if (measureMode === 'volume') {
    const volume = toFiniteTapeNumber(actual.actual_volume_ml);
    const density = getSelectedInstanceDensityForLine(line);

    if (!(Number.isFinite(volume) && volume > 0)) {
      return { mass: null, missingDensity: false };
    }

    if (!(Number.isFinite(density) && density > 0)) {
      return { mass: null, missingDensity: true };
    }

    return { mass: volume * density, missingDensity: false };
  }

  const mass = toFiniteTapeNumber(actual.actual_mass_g);
  return {
    mass: Number.isFinite(mass) && mass > 0 ? mass : null,
    missingDensity: false
  };
}

function getActualSolidsContributionForLine(line, actualMass) {
  if (line.recipe_role === 'solvent') {
    return { solidsMass: 0, pendingComposition: false };
  }

  const selectedInstanceId = state.recipe.selectedInstancesByLineId[line.recipe_line_id];
  const hasCompositionCache = selectedInstanceId
    ? Object.prototype.hasOwnProperty.call(state.recipe.instanceComponentsCache, selectedInstanceId)
    : false;

  if (selectedInstanceId && !hasCompositionCache) {
    ensureInstanceComponentsLoadedForSlurrySolids(selectedInstanceId);
    return { solidsMass: null, pendingComposition: true };
  }

  let components = hasCompositionCache
    ? state.recipe.instanceComponentsCache[selectedInstanceId]
    : null;

  if (!Array.isArray(components) || components.length === 0) {
    components = [{
      material_id: Number(line.material_id),
      material_role: line.recipe_role === 'solvent' ? 'solvent' : null,
      mass_fraction: 1
    }];
  }

  const solidsMass = components.reduce((sum, component) => {
    if (component.material_role === 'solvent') return sum;

    const fraction = toFiniteTapeNumber(component.mass_fraction);
    if (!(Number.isFinite(fraction) && fraction > 0)) return sum;

    return sum + actualMass * fraction;
  }, 0);

  return { solidsMass, pendingComposition: false };
}

function ensureInstanceComponentsLoadedForSlurrySolids(instanceId) {
  if (!instanceId || pendingInstanceComponentLoads.has(String(instanceId))) return;

  pendingInstanceComponentLoads.add(String(instanceId));

  fetchInstanceComponents(instanceId)
    .then((components) => {
      setInstanceComponentsCache({
        ...state.recipe.instanceComponentsCache,
        [instanceId]: components
      });
      renderSlurrySolidsSummary();
    })
    .catch(console.error)
    .finally(() => {
      pendingInstanceComponentLoads.delete(String(instanceId));
    });
}

function computeSlurrySolidsSummary() {
  let totalWetMass = 0;
  let totalSolidsMass = 0;
  let hasActualMass = false;
  let missingDensity = false;
  let pendingComposition = false;

  state.recipe.currentLines.forEach((line) => {
    const massResult = getEffectiveActualMassForLine(line);

    if (massResult.missingDensity) {
      missingDensity = true;
      return;
    }

    if (!(Number.isFinite(massResult.mass) && massResult.mass > 0)) {
      return;
    }

    hasActualMass = true;
    totalWetMass += massResult.mass;

    const solidsResult = getActualSolidsContributionForLine(line, massResult.mass);
    if (solidsResult.pendingComposition) {
      pendingComposition = true;
      return;
    }

    if (Number.isFinite(solidsResult.solidsMass)) {
      totalSolidsMass += solidsResult.solidsMass;
    }
  });

  if (!hasActualMass || !(totalWetMass > 0)) {
    return {
      status: 'empty',
      text: 'Содержание твердых компонентов: —',
      detail: 'Введите фактические значения для расчёта.'
    };
  }

  if (missingDensity) {
    return {
      status: 'incomplete',
      text: 'Содержание твердых компонентов: —',
      detail: 'Для расчёта массы из объёма нужна плотность выбранного экземпляра материала.'
    };
  }

  if (pendingComposition) {
    return {
      status: 'incomplete',
      text: 'Содержание твердых компонентов: —',
      detail: 'Загружается состав выбранных экземпляров материалов.'
    };
  }

  const solidsPercent = (totalSolidsMass / totalWetMass) * 100;
  return {
    status: 'complete',
    text: `Содержание твердых компонентов: ${solidsPercent.toFixed(2)} %`,
    detail: `масса сухих компонентов ${formatTapeMass(totalSolidsMass)} г / общая масса ${formatTapeMass(totalWetMass)} г`
  };
}

function renderSlurrySolidsSummary() {
  const el = document.getElementById('slurry-solids-summary');
  if (!el) return;

  if (!state.recipe.currentLines.length) {
    el.hidden = true;
    el.replaceChildren();
    return;
  }

  const summary = computeSlurrySolidsSummary();
  const main = document.createElement('div');
  main.textContent = summary.text;

  const detail = document.createElement('small');
  detail.textContent = summary.detail;

  el.replaceChildren(main, detail);
  el.hidden = false;
}

function getDefaultWorkflowState() {
  return {
    drying_am: {
      performed_by: '',
      date: '',
      time: '',
      end_date: '',
      end_time: '',
      comments: '',
      temperature_c: '80',
      atmosphere: 'vacuum',
      target_duration_min: '120',
      drying_speed_text: '',
      other_parameters: ''
    },
    drying_tape: {
      performed_by: '',
      date: '',
      time: '',
      end_date: '',
      end_time: '',
      comments: '',
      temperature_c: '80',
      atmosphere: 'vacuum',
      target_duration_min: '120',
      drying_speed_text: '',
      other_parameters: ''
    },
    drying_pressed_tape: {
      performed_by: '',
      date: '',
      time: '',
      end_date: '',
      end_time: '',
      comments: '',
      temperature_c: '80',
      atmosphere: 'vacuum',
      target_duration_min: '120',
      drying_speed_text: '',
      other_parameters: ''
    },
    maintenance_dry_box: {
      availability_status: 'out_of_dry_box',
      started_at_date: '',
      started_at_time: '',
      removed_at_date: '',
      removed_at_time: '',
      temperature_c: '80',
      atmosphere: 'vacuum',
      other_parameters: '',
      comments: '',
      updated_by: '',
      updated_by_name: '',
      updated_at: ''
    },
    weighing: {
      performed_by: '',
      date: '',
      time: '',
      comments: '',
      actualsByLineId: {}
    },
    mixing: {
      performed_by: '',
      started_at_date: '',
      started_at_time: '',
      comments: '',
      slurry_volume_ml: '',
      dry_mixing_id: '',
      dry_start_date: '',
      dry_start_time: '',
      dry_duration_min: '',
      dry_end_date: '',
      dry_end_time: '',
      dry_rpm: '',
      wet_mixing_id: '',
      wet_start_date: '',
      wet_start_time: '',
      wet_duration_min: '',
      wet_end_date: '',
      wet_end_time: '',
      wet_rpm: '',
      viscosity_cP: ''
    },
    coating: {
      performed_by: '',
      date: '',
      time: '',
      comments: '',
      foil_id: '',
      coating_id: '',
      coating_sidedness: '',
      gap_um: '',
      gap_um_side2: '',
      coat_temp_c: '',
      coat_time_min: '',
      method_comments: ''
    },
    calendering: {
      performed_by: '',
      date: '',
      time: '',
      comments: '',
      temp_c: '',
      pressure_value: '',
      pressure_units: '',
      draw_speed_m_min: '',
      init_thickness_microns: '',
      final_thickness_microns: '',
      no_passes: '',
      other_params: '',
      shine: false,
      curl: false,
      dots: false,
      other_check: false,
      other_text: ''
    }
  };
}

function resetDerivedCalculationState() {
  setDerivedCalculationState({
    targetDryMassByLineId: {},
    plannedMassByLineId: {},
    expandedCalculation: []
  }, { render: false });
}

function resetWorkflowState() {
  setWorkflowState(getDefaultWorkflowState(), { apply: false });
}

function applyNameStateToDom() {
  const currentName = (state.form.fields.name || '').trim();

  title.textContent = currentName || '— без названия —';
  nameInput.value = currentName;
  const showInput = state.ui.name.isEditing || !currentName;
  nameInput.hidden = !showInput;
  title.hidden = showInput;
}

function renderCalcModeLabel() {
  if (!activeMassLabel) return;
  activeMassLabel.textContent =
    state.form.fields.calc_mode === 'from_slurry_mass'
      ? 'Общая масса суспензии, г'
      : 'Масса активного материала, г';
}

function formatDateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayDateInputValue() {
  return formatDateInputValue(new Date());
}

function writeTopLevelFormStateToDom() {
  form.elements['notes'].value = state.form.fields.notes || '';
  form.elements['created_by'].value = state.form.fields.created_by || '';
  if (createdAtInput) {
    createdAtInput.max = getTodayDateInputValue();
    createdAtInput.value = state.form.fields.created_at || '';
  }
  form.elements['project_id'].value = state.form.fields.project_id || '';
  updateProjectMultiSelectDom();
  form.elements['tape_type'].value = state.form.fields.tape_type || '';
  form.elements['tape_recipe_id'].value = state.form.fields.tape_recipe_id || '';
  form.elements['calc_mode'].value = state.form.fields.calc_mode || 'from_active_mass';
  form.elements['target_mass_g'].value = state.form.fields.target_mass_g || '';
  applyNameStateToDom();
}

function setTopLevelFormState(patch, { render = true } = {}) {
  setFormFields({
    ...state.form.fields,
    ...patch
  }, { render });
}

function resetTopLevelFormState() {
  setFormFields(getDefaultTopLevelFormFields());
  title.textContent = '';
  nameInput.value = '';
  state.ui.name.isEditing = false;
  writeTopLevelFormStateToDom();
}

function splitIsoToDateTime(value) {
  if (!value) return { date: '', time: '' };
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return { date: '', time: '' };
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` };
}

function combineDateAndTime(date, time) {
  if (!date || !time) return null;
  return `${date}T${time}`;
}

function addMinutesToDateTime(date, time, durationMinutes) {
  const duration = Number(durationMinutes);
  if (!date || !time || !Number.isFinite(duration)) {
    return { date: '', time: '' };
  }

  const base = new Date(`${date}T${time}`);
  if (!Number.isFinite(base.getTime())) {
    return { date: '', time: '' };
  }

  base.setMinutes(base.getMinutes() + duration);
  return splitIsoToDateTime(base.toISOString());
}

const DRYING_TAPE_PREFILL_DEFAULTS = {
  two_sided: { temperature_c: '125', atmosphere: 'air', target_duration_min: '15' },
  one_sided_anode: { temperature_c: '80', atmosphere: 'vacuum', target_duration_min: '5' },
  one_sided_cathode: { temperature_c: '80', atmosphere: 'vacuum', target_duration_min: '30' },
  one_sided_default: { temperature_c: '80', atmosphere: 'vacuum', target_duration_min: '30' }
};

const DRYING_DEFAULTISH_VALUES = {
  temperature_c: new Set(['', '80', '125']),
  atmosphere: new Set(['', 'air', 'vacuum']),
  target_duration_min: new Set(['', '5', '15', '20', '30', '45', '90', '120'])
};

function getNormalizedTapeRole() {
  return String(state.form.fields.tape_type || state.selection.currentTape?.role || '')
    .trim()
    .toLowerCase();
}

function getNormalizedCoatingMethodKey() {
  const method = getSelectedCoatingMethod();
  return String(method?.name || '')
    .trim()
    .toLowerCase();
}

function getDryingTapePrefillValues() {
  const role = getNormalizedTapeRole();
  const sidedness = state.workflow.coating?.coating_sidedness;
  if (sidedness === 'two_sided') {
    return DRYING_TAPE_PREFILL_DEFAULTS.two_sided;
  }
  if (role === 'anode') {
    return DRYING_TAPE_PREFILL_DEFAULTS.one_sided_anode;
  }
  if (role === 'cathode') {
    return DRYING_TAPE_PREFILL_DEFAULTS.one_sided_cathode;
  }
  return DRYING_TAPE_PREFILL_DEFAULTS.one_sided_default;
}

function shouldReplaceDryingDefault(field, currentValue, nextDefaultValue) {
  const current = String(currentValue ?? '').trim();
  if (!current) return true;
  if (current === String(nextDefaultValue ?? '').trim()) return false;
  return DRYING_DEFAULTISH_VALUES[field]?.has(current) ?? false;
}

function applyDryingTapePrefillFromCoating({
  force = false,
  forceOperator = force,
  forceTiming = force,
  forceDefaults = force
} = {}) {
  const defaults = getDryingTapePrefillValues();
  const coating = state.workflow.coating || {};
  const drying = state.workflow.drying_tape || {};
  const patch = {};

  if (coating.performed_by && (forceOperator || !String(drying.performed_by || '').trim())) {
    patch.performed_by = coating.performed_by;
  }

  if (coating.date && coating.time) {
    const derivedStart = addMinutesToDateTime(coating.date, coating.time, 10);
    if (derivedStart.date && (forceTiming || !String(drying.date || '').trim())) {
      patch.date = derivedStart.date;
    }
    if (derivedStart.time && (forceTiming || !String(drying.time || '').trim())) {
      patch.time = derivedStart.time;
    }
  }

  if (defaults) {
    if (
      forceDefaults
        ? shouldReplaceDryingDefault('temperature_c', drying.temperature_c, defaults.temperature_c)
        : !String(drying.temperature_c || '').trim()
    ) {
      patch.temperature_c = defaults.temperature_c;
    }
    if (
      forceDefaults
        ? shouldReplaceDryingDefault('atmosphere', drying.atmosphere, defaults.atmosphere)
        : !String(drying.atmosphere || '').trim()
    ) {
      patch.atmosphere = defaults.atmosphere;
    }
    if (
      forceDefaults
        ? shouldReplaceDryingDefault('target_duration_min', drying.target_duration_min, defaults.target_duration_min)
        : !String(drying.target_duration_min || '').trim()
    ) {
      patch.target_duration_min = defaults.target_duration_min;
    }
  }

  if (!Object.keys(patch).length) return;

  const nextStep = { ...drying, ...patch };
  const nextEnd = addMinutesToDateTime(nextStep.date, nextStep.time, nextStep.target_duration_min);
  nextStep.end_date = nextEnd.date;
  nextStep.end_time = nextEnd.time;

  setWorkflowStep('drying_tape', nextStep);
  renderCoatingDryingBridgeControls();
}

function syncDryingEndTime(stepKey) {
  const step = state.workflow[stepKey];
  if (!step) return;
  const next = addMinutesToDateTime(step.date, step.time, step.target_duration_min);
  const nextStep = {
    ...step,
    end_date: next.date,
    end_time: next.time
  };
  setWorkflowStep(stepKey, nextStep);

  if (stepKey === 'drying_am') {
    setElValue('0-drying_am-end-date', next.date);
    setElValue('0-drying_am-end-time', next.time);
    return;
  }

  if (stepKey === 'drying_pressed_tape') {
    setElValue('2b-drying_pressed_tape-end-date', next.date);
    setElValue('2b-drying_pressed_tape-end-time', next.time);
  }
}

function syncMixingEndTime(phase) {
  const step = state.workflow.mixing;
  if (!step) return;
  const derived = deriveMixingTimeline(step);
  setWorkflowStep('mixing', {
    ...step,
    ...derived
  });
}

function deriveMixingTimeline(step) {
  const baseDate = step?.started_at_date || '';
  const baseTime = step?.started_at_time || '';

  const dryStartDate = baseDate;
  const dryStartTime = baseTime;
  const dryEnd = addMinutesToDateTime(dryStartDate, dryStartTime, step?.dry_duration_min);

  const wetStartDate = dryEnd.date || dryStartDate;
  const wetStartTime = dryEnd.time || dryStartTime;
  const wetEnd = addMinutesToDateTime(wetStartDate, wetStartTime, step?.wet_duration_min);

  return {
    dry_start_date: dryStartDate,
    dry_start_time: dryStartTime,
    dry_end_date: dryEnd.date,
    dry_end_time: dryEnd.time,
    wet_start_date: wetStartDate,
    wet_start_time: wetStartTime,
    wet_end_date: wetEnd.date,
    wet_end_time: wetEnd.time
  };
}

function setElValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? '';
}

function setElChecked(id, checked) {
  const el = document.getElementById(id);
  if (el) el.checked = Boolean(checked);
}

function renderDryingStep(step, prefix) {
  if (!step) return;
  setElValue(`${prefix}-operator`, step.performed_by);
  setElValue(`${prefix}-date`, step.date);
  setElValue(`${prefix}-time`, step.time);
  setElValue(`${prefix}-end-date`, step.end_date);
  setElValue(`${prefix}-end-time`, step.end_time);
  setElValue(`${prefix}-notes`, step.comments);
  setElValue(`${prefix}-temperature`, step.temperature_c);
  setElValue(`${prefix}-atmosphere`, step.atmosphere);
  setElValue(`${prefix}-target-duration`, step.target_duration_min);
  setElValue(`${prefix}-other_param`, step.other_parameters);
}

function syncCoatingGapUi() {
  const sidedness = state.workflow.coating?.coating_sidedness;
  const isTwoSided = sidedness === 'two_sided';
  const label = document.getElementById('2-coating-gap-um-label');
  const side2Row = document.getElementById('2-coating-gap-side2-row');

  if (label) {
    label.textContent = isTwoSided
      ? 'Зазор, мкм, сторона 1: '
      : 'Зазор, мкм: ';
  }
  if (side2Row) {
    side2Row.hidden = !isTwoSided;
  }
}

function renderCoatingDryingBridgeControls() {
  const step = state.workflow.drying_tape || {};
  setElValue('2-coating-dry-temp', step.temperature_c);
  setElValue('2-coating-dry-atmosphere', step.atmosphere);
  setElValue('2-coating-dry-duration', step.target_duration_min);
  setElValue('2-coating-dry-speed', step.drying_speed_text);
}

function renderDryingAmStep() {
  renderDryingStep(state.workflow.drying_am, '0-drying_am');
}

function renderDryingPressedTapeStep() {
  renderDryingStep(state.workflow.drying_pressed_tape, '2b-drying_pressed_tape');
}

function getDryBoxStatusLabel(status) {
  return status === 'in_dry_box'
    ? 'Лента находится в сушильном шкафу'
    : status === 'depleted'
      ? 'Лента израсходована'
      : 'Лента находится вне сушильного шкафа';
}

function renderMaintenanceDryBoxStep() {
  const step = state.workflow.maintenance_dry_box || getDefaultWorkflowState().maintenance_dry_box;
  const finalDrying = state.workflow.drying_pressed_tape || getDefaultWorkflowState().drying_pressed_tape;
  const stageFieldset = document.getElementById('2c-dry-box-state');
  const lockNote = document.getElementById('2c-dry-box-lock-note');
  const finalDryingEnd = getDryingEnd(finalDrying);
  const isAvailable = Boolean(finalDryingEnd);

  setElValue('2c-dry-box-start-date', step.started_at_date);
  setElValue('2c-dry-box-start-time', step.started_at_time);
  setElValue('2c-dry-box-temperature', step.temperature_c);
  setElValue('2c-dry-box-atmosphere', step.atmosphere);
  setElValue('2c-dry-box-other-parameters', step.other_parameters);
  setElValue('2c-dry-box-comments', step.comments);

  const statusEl = document.getElementById('2c-dry-box-status');
  if (statusEl) {
    statusEl.textContent = getDryBoxStatusLabel(step.availability_status);
  }

  if (lockNote) {
    lockNote.textContent = isAvailable
      ? ''
      : 'Этот этап становится доступен только после завершения II.4 сушки ленты после каландрирования.';
  }

  const saveBtn = document.getElementById('2c-dry-box-save-btn');
  const removeBtn = document.getElementById('2c-dry-box-remove-btn');
  const returnBtn = document.getElementById('2c-dry-box-return-btn');
  const depleteBtn = document.getElementById('2c-dry-box-deplete-btn');
  const isDepleted = step.availability_status === 'depleted';
  const isInDryBox = step.availability_status === 'in_dry_box';
  const isOutOfDryBox = step.availability_status === 'out_of_dry_box';

  if (stageFieldset) stageFieldset.disabled = !isAvailable;

  if (saveBtn) saveBtn.disabled = !isAvailable || isDepleted;
  if (removeBtn) removeBtn.disabled = !isAvailable || isDepleted || isOutOfDryBox;
  if (returnBtn) returnBtn.disabled = !isAvailable || isDepleted || isInDryBox;
  if (depleteBtn) depleteBtn.disabled = !isAvailable || isDepleted;
}

function renderWeighingStep() {
  const step = state.workflow.weighing;
  setElValue('1-weighing-operator', step.performed_by);
  setElValue('1-weighing-date', step.date);
  setElValue('1-weighing-time', step.time);
  setElValue('1-weighing-notes', step.comments);
}

function renderMixingStep() {
  const step = state.workflow.mixing;
  setElValue('1-mixing-operator', step.performed_by);
  setElValue('1-mixing-started_at-date', step.started_at_date);
  setElValue('1-mixing-started_at-time', step.started_at_time);
  setElValue('1-mixing-comments', step.comments);
  setElValue('1-mixing-slurry_volume_ml', step.slurry_volume_ml);
  setElValue('1-mixing-dry_mixing_id', step.dry_mixing_id);
  setElValue('dry-duration-min', step.dry_duration_min);
  setElValue('dry-rpm', step.dry_rpm);
  setElValue('1-mixing-wet_mixing_id', step.wet_mixing_id);
  setElValue('wet-duration-min', step.wet_duration_min);
  setElValue('wet-rpm', step.wet_rpm);
  setElValue('wet-viscosity_cP', step.viscosity_cP);
  updateMixParamsVisibility();
}

function renderCoatingStep() {
  const step = state.workflow.coating;
  setElValue('2-coating-operator', step.performed_by);
  setElValue('2-coating-date', step.date);
  setElValue('2-coating-time', step.time);
  setElValue('2-cathode-tape-notes', step.comments);
  setElValue('2-coating-foil_id', step.foil_id);
  setElValue('2-coating-coating_id', step.coating_id);
  setElValue('2-coating-sidedness', step.coating_sidedness);
  setElValue('2-coating-gap-um', step.gap_um);
  setElValue('2-coating-gap-um-side2', step.gap_um_side2);
  setElValue('2-coating-time-min', step.coat_time_min);
  setElValue('2-coating-method-comments', step.method_comments);
  syncCoatingGapUi();
  renderCoatingDryingBridgeControls();
}

function renderCalenderingStep() {
  const step = state.workflow.calendering;
  setElValue('2-calendering-operator', step.performed_by);
  setElValue('2-calendering-date', step.date);
  setElValue('2-calendering-time', step.time);
  setElValue('2-calendering-notes', step.comments);
  setElValue('2-calendering-temp_c', step.temp_c);
  setElValue('2-calendering-pressure_value', step.pressure_value);
  setElValue('2-calendering-pressure_units', step.pressure_units);
  setElValue('2-calendering-draw_speed_m_min', step.draw_speed_m_min);
  setElValue('2-calendering-init_thickness_microns', step.init_thickness_microns);
  setElValue('2-calendering-final_thickness_microns', step.final_thickness_microns);
  setElValue('2-calendering-no_passes', step.no_passes);
  setElValue('2-calendering-other_params', step.other_params);
  setElChecked('2-cal-shine', step.shine);
  setElChecked('2-cal-curl', step.curl);
  setElChecked('2-cal-dots', step.dots);
  setElChecked('2-cal-other-check', step.other_check);
  setElValue('2-cal-other-text', step.other_text);
  const otherTextEl = document.getElementById('2-cal-other-text');
  if (otherTextEl) otherTextEl.disabled = !step.other_check;
}

function renderWorkflowState() {
  renderDryingAmStep();
  renderDryingPressedTapeStep();
  renderMaintenanceDryBoxStep();
  renderWeighingStep();
  renderMixingStep();
  renderCoatingStep();
  renderCalenderingStep();
}

function fillSelect(selectEl, items, valueKey, labelFn, placeholderHtml, selectedValue = '') {
  selectEl.innerHTML = placeholderHtml;
  
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item[valueKey];
    opt.textContent = labelFn(item);
    selectEl.appendChild(opt);
  });
  
  if (selectedValue && [...selectEl.options].some(o => o.value === String(selectedValue))) {
    selectEl.value = String(selectedValue);
  }
}

// -------- API helpers --------

async function fetchUsers() {
  const res = await fetch('/api/users');
  return res.json();
}

async function fetchProjects() {
  const res = await fetch('/api/projects');
  return res.json();
}

async function fetchRecipes(role) {
  const params = new URLSearchParams();
  
  if (role) {
    params.append('role', role);
  }
  
  const qs = params.toString();
  const url = qs ? `/api/recipes?${qs}` : '/api/recipes';
  
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки рецептов');
  }
  
  return res.json();
}

async function fetchRecipeLines(recipeId) {
  const res = await fetch(`/api/recipes/${recipeId}/lines`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки состава рецепта');
  }
  return res.json();
}

async function fetchMaterialInstances(materialId) {
  if (!materialId) return [];
  
  // simple cache to avoid refetching repeatedly
  if (state.recipe.instanceCacheByMaterialId[materialId]) {
    return state.recipe.instanceCacheByMaterialId[materialId];
  }
  
  const res = await fetch(`/api/materials/${materialId}/instances`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки экземпляров материала');
  }
  
  const data = await res.json();
  state.recipe.instanceCacheByMaterialId[materialId] = data;
  
  return data;
}

async function loadMaterialInstancesForRecipeLines(lines) {
  const uniqueMaterialIds = [...new Set(
    (Array.isArray(lines) ? lines : [])
      .map((line) => Number(line.material_id))
      .filter((materialId) => Number.isFinite(materialId) && materialId > 0)
  )];

  if (!uniqueMaterialIds.length) {
    setInstanceCacheByMaterialId({});
    return;
  }

  const nextCache = { ...state.recipe.instanceCacheByMaterialId };

  await Promise.all(uniqueMaterialIds.map(async (materialId) => {
    if (!nextCache[materialId]) {
      nextCache[materialId] = await fetchMaterialInstances(materialId);
    }
  }));

  setInstanceCacheByMaterialId(nextCache);
}

async function fetchInstanceComponents(instanceId) {
  if (!instanceId) return [];
  
  const res = await fetch(`/api/materials/instances/${instanceId}/components`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки состава экземпляра');
  }
  
  return res.json();
}

async function createTape(data) {
  const res = await fetch('/api/tapes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    await throwResponseError(res, 'Ошибка сохранения ленты');
  }
  
  return res.json();
}

async function fetchTapes() {
  const res = await fetch('/api/tapes');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки списка лент');
  }
  return res.json();
}

async function loadTapes() {
  try {
    const tapes = await fetchTapes();
    setTapes(Array.isArray(tapes) ? tapes : []);
  } catch (err) {
    console.error(err);
    setTapes([]);
    showStatus(err.message || 'Ошибка загрузки списка лент', true);
  }
}

async function updateTape(id, data) {
  const res = await fetch(`/api/tapes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    await throwResponseError(res, 'Ошибка обновления ленты');
  }
  
  return res.json();
}

function getTapeFromLoadedList(tapeId, fallback = null) {
  const id = Number(tapeId);
  return state.tapes.items.find((tape) => Number(tape.tape_id) === id) || fallback;
}

function buildTapeSavePayload() {
  const data = { ...state.form.fields };
  delete data.created_by;
  return data;
}

async function fetchTapeDryBoxState(tapeId) {
  const res = await fetch(`/api/tapes/${tapeId}/dry-box-state`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки состояния сушильного шкафа');
  }
  return res.json();
}

async function saveTapeDryBoxState(tapeId, payload) {
  const res = await fetch(`/api/tapes/${tapeId}/dry-box-state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    await throwResponseError(res, 'Ошибка сохранения параметров сушки в шкафу');
  }

  return res.json();
}

async function returnTapeToDryBoxNow(tapeId, payload) {
  const res = await fetch(`/api/tapes/${tapeId}/dry-box-state/return-now`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    await throwResponseError(res, 'Ошибка возврата ленты в сушильный шкаф');
  }

  return res.json();
}

async function removeTapeFromDryBoxNow(tapeId, payload) {
  const res = await fetch(`/api/tapes/${tapeId}/dry-box-state/remove-now`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    await throwResponseError(res, 'Ошибка изменения статуса ленты в сушильном шкафу');
  }

  return res.json();
}

async function markTapeDepleted(tapeId, payload) {
  const res = await fetch(`/api/tapes/${tapeId}/dry-box-state/deplete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    await throwResponseError(res, 'Ошибка изменения статуса ленты');
  }

  return res.json();
}

async function deleteTape(id) {
  const res = await fetch(`/api/tapes/${id}`, {
    method: 'DELETE'
  });
  
  if (!res.ok) {
    await throwResponseError(res, 'Ошибка удаления ленты');
  }

  return res.json();
}

async function fetchDryingStep(tapeId, operationCode) {
  if (!tapeId) return null;
  
  const qs = operationCode ? `?operation_code=${encodeURIComponent(operationCode)}` : '';
  const res = await fetch(`/api/tapes/${tapeId}/steps/drying${qs}`);
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки сушки');
  }
  
  return res.json(); // object or null
}

async function fetchTapeActuals(tapeId) {
  if (!tapeId) return [];
  
  const res = await fetch(`/api/tapes/${tapeId}/actuals`);
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки фактических данных');
  }
  
  return res.json(); // array
}

async function saveSelectedInstances(tapeId) {
  if (!tapeId) return;

  for (const line of state.recipe.currentLines) {
    const recipeLineId = line.recipe_line_id;
    const instanceId = state.recipe.selectedInstancesByLineId[recipeLineId];

    if (!instanceId) continue;

    const res = await fetch(`/api/tapes/${tapeId}/actuals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipe_line_id: recipeLineId,
        material_instance_id: Number(instanceId)
      })
    });

    if (!res.ok) {
      await throwResponseError(res, 'Ошибка сохранения выбранных экземпляров');
    }
  }
}

async function saveTapeActuals(tapeId) {
  if (!tapeId) return;

  for (const line of state.recipe.currentLines) {
    const recipeLineId = line.recipe_line_id;
    const instanceId = state.recipe.selectedInstancesByLineId[recipeLineId];

    if (!instanceId) continue;
    const actual = state.workflow.weighing.actualsByLineId[recipeLineId] || getDefaultWeighingActual();
    const requestedMeasureMode = actual.measure_mode || 'mass';
    const value = requestedMeasureMode === 'volume'
      ? Number(actual.actual_volume_ml)
      : Number(actual.actual_mass_g);
    const hasActualValue = Number.isFinite(value) && value > 0;
    const measureMode = hasActualValue ? requestedMeasureMode : null;

    const payload = {
      recipe_line_id: recipeLineId,
      material_instance_id: Number(instanceId),
      measure_mode: measureMode,
      actual_mass_g: null,
      actual_volume_ml: null
    };

    if (hasActualValue) {
      if (measureMode === 'mass') {
        payload.actual_mass_g = value;
      }

      if (measureMode === 'volume') {
        payload.actual_volume_ml = value;
      }
    }

    const res = await fetch(`/api/tapes/${tapeId}/actuals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      await throwResponseError(res, 'Ошибка сохранения фактических данных');
    }
  }
}

async function loadDryingAtmospheres(selectEl, selectedCode = '') {
  if (!selectEl) return;
  
  const res = await fetch('/api/reference/drying-atmospheres');
  if (!res.ok) throw new Error('Ошибка загрузки атмосфер сушки');
  
  const items = await res.json();
  setReferenceDryingAtmospheres(items);
  
  selectEl.innerHTML = '<option value="">— не выбрано —</option>';
  
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.code;         // store code in DB
    opt.textContent = item.display; // show Russian label
    selectEl.appendChild(opt);
  });
  
  if (selectedCode) {
    selectEl.value = selectedCode;
  }
}

async function loadDryMixingMethods(selectEl, selectedId = '') {
  if (!selectEl) return;
  
  const res = await fetch('/api/reference/dry-mixing-methods');
  if (!res.ok) throw new Error('Ошибка загрузки методов сухого смешивания');
  
  const items = await res.json();
  setReferenceDryMixingMethods(items);
  
  selectEl.innerHTML = '<option value="">— не выбрано —</option>';
  
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = String(item.dry_mixing_id);
    opt.dataset.code = item.name || '';  
    opt.textContent = item.description || item.name;
    selectEl.appendChild(opt);
  });
  
  if (selectedId) selectEl.value = String(selectedId);
}

async function loadWetMixingMethods(selectEl, selectedId = '') {
  if (!selectEl) return;
  
  const res = await fetch('/api/reference/wet-mixing-methods');
  if (!res.ok) throw new Error('Ошибка загрузки методов влажного смешивания');
  
  const items = await res.json();
  setReferenceWetMixingMethods(items);
  
  selectEl.innerHTML = '<option value="">— не выбрано —</option>';
  
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = String(item.wet_mixing_id);
    opt.dataset.code = item.name || '';    
    opt.textContent = item.description || item.name;
    selectEl.appendChild(opt);
  });
  
  if (selectedId) selectEl.value = String(selectedId);
}

// -------- Rendering --------

function recipeRoleLabel(recipeRole) {
  const map = {
    cathode_active: 'Aктивный материал: ',
    anode_active: 'Aктивный материал: ',
    binder: 'Связующее: ',
    additive: 'Проводящая добавка: ',
    solvent: 'Растворитель: ',
    other: 'Другое: '
  };
  
  return map[recipeRole] || recipeRole || '';
}

function syncInstanceSelectsForLine(recipeLineId) {
  const value = state.recipe.selectedInstancesByLineId[recipeLineId] || '';
  const selects = document.querySelectorAll(
    `[data-recipe-line-id="${recipeLineId}"].material-instance-select`
  );

  selects.forEach((select) => {
    if ([...select.options].some((option) => option.value === String(value))) {
      select.value = String(value);
    } else if (!value) {
      select.value = '';
    }
  });
}

function renderRecipeLines() {
  const container = document.getElementById('recipe-lines-container');
  if (!container) return;
  container.innerHTML = '';
  container.classList.add('recipe-lines-list');
  
  const slurryBody = document.getElementById('slurry-actuals-body');
  if (slurryBody) {
    slurryBody.innerHTML = '';
  }

  // ----- Header row -----
  const headerRow = document.createElement('div');
  headerRow.className = 'recipe-line-row recipe-line-header';
  
  const headers = [
    'Роль',
    'Материал',
    'Экземпляр материала',
    '% в сухой смеси',
    'Масса сухого компонента, г',
    'Масса экземпляра, г'
  ];
  
  headers.forEach(text => {
    const cell = document.createElement('div');
    cell.className = 'recipe-line-cell recipe-line-header-cell';
    cell.textContent = text;
    headerRow.appendChild(cell);
  });
  
  container.appendChild(headerRow);
  
  state.recipe.currentLines.forEach(line => {
    const row = document.createElement('div');
    row.className = 'recipe-line-row';
    row.dataset.recipeLineId = line.recipe_line_id;
    
    // role label (left)
    const roleInput = document.createElement('input');
    roleInput.type = 'text';
    roleInput.value = recipeRoleLabel(line.recipe_role);
    roleInput.disabled = true;
    
    // material name (middle)
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = line.material_name;
    nameInput.disabled = true;
    
    // material instance selector
    const instanceSelect = document.createElement('select');
    instanceSelect.className = 'material-instance-select';
    instanceSelect.dataset.recipeLineId = line.recipe_line_id;
    
    // placeholder option
    const placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.textContent = '— выбрать экземпляр —';
    instanceSelect.appendChild(placeholderOpt);
    
    const slurryInstanceSelect = document.createElement('select');
    slurryInstanceSelect.className = 'material-instance-select slurry-instance-select';
    slurryInstanceSelect.dataset.recipeLineId = line.recipe_line_id;
    slurryInstanceSelect.disabled = true;

    const slurryPlaceholderOpt = document.createElement('option');
    slurryPlaceholderOpt.value = '';
    slurryPlaceholderOpt.textContent = '— выбрать экземпляр —';
    slurryInstanceSelect.appendChild(slurryPlaceholderOpt);
    
    const instances = state.recipe.instanceCacheByMaterialId[line.material_id] || [];
    const prev = state.recipe.selectedInstancesByLineId[line.recipe_line_id] || '';

    instances
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .forEach(inst => {
        const opt1 = document.createElement('option');
        opt1.value = inst.material_instance_id;
        opt1.textContent = inst.name || `ID ${inst.material_instance_id}`;
        instanceSelect.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = inst.material_instance_id;
        opt2.textContent = inst.name || `ID ${inst.material_instance_id}`;
        slurryInstanceSelect.appendChild(opt2);
      });

    if (prev) {
      const prevValue = String(prev);
      if ([...instanceSelect.options].some((option) => option.value === prevValue)) {
        instanceSelect.value = prevValue;
      }
      if ([...slurryInstanceSelect.options].some((option) => option.value === prevValue)) {
        slurryInstanceSelect.value = prevValue;
      }
    }
    
    // store selection in state
    function setInstanceForLine(recipeLineId, value) {
      setSelectedInstanceForLine(recipeLineId, value);
      syncInstanceSelectsForLine(recipeLineId);
      recalculatePlannedMasses();
    }
    
    instanceSelect.addEventListener('change', () => {
      setInstanceForLine(line.recipe_line_id, instanceSelect.value || '');
      updateDerivedInfo();
    });
    
    // percent (right) with % sign
    const pctInput = document.createElement('input');
    pctInput.classList.add('numeric');
    pctInput.type = 'text';           // text, so "96%" can be shown
    pctInput.disabled = true;
    
    if (line.include_in_pct) {
      pctInput.value =
      (line.slurry_percent === null || line.slurry_percent === undefined || line.slurry_percent === '')
      ? ''
      : `${Number(line.slurry_percent).toFixed(2)} %`
    } else {
      pctInput.value = '';
    }
    
    row.appendChild(roleInput);
    row.appendChild(nameInput);
    row.appendChild(instanceSelect);
    row.appendChild(pctInput);
    
    const targetDrySpan = document.createElement('span');
    targetDrySpan.className = 'target-dry-mass numeric';
    targetDrySpan.textContent = '';
    row.appendChild(targetDrySpan);
    
    const plannedSpan = document.createElement('span');
    plannedSpan.className = 'planned-mass numeric';
    plannedSpan.textContent = '';
    row.appendChild(plannedSpan);
    
    container.appendChild(row);
    
    // --- SLURRY ACTUALS ROW ---
    const tr = document.createElement('tr');
    tr.dataset.recipeLineId = line.recipe_line_id;
    
    // 1. Role
    const roleTd = document.createElement('td');
    roleTd.textContent = recipeRoleLabel(line.recipe_role);
    tr.appendChild(roleTd);
    
    // 2. Material instance (read-only mirror of planned selection)
    const instanceTd = document.createElement('td');
    instanceTd.appendChild(slurryInstanceSelect);
    tr.appendChild(instanceTd);
    
    // 3. Planned amount (reuse existing planned mass if available)
    const plannedTd = document.createElement('td');
    plannedTd.className = 'planned-amount-cell';
    plannedTd.classList.add('numeric');
    plannedTd.dataset.recipeLineId = line.recipe_line_id;
    tr.appendChild(plannedTd);
    
    // 4. Actual value (mode + input)
    const actualTd = document.createElement('td');
    
    const modeSelect = document.createElement('select');
    modeSelect.className = 'actual-mode-select';
    modeSelect.dataset.recipeLineId = line.recipe_line_id;
    modeSelect.innerHTML = `
            <option value="mass" selected>m (г)</option>
            <option value="volume">V (мл)</option>
          `;
    modeSelect.value = getDefaultActualModeForLine(line);
    
    const valueInput = document.createElement('input');
    valueInput.type = 'number';
    valueInput.step = '0.0001';
    valueInput.className = 'actual-value-input';
    valueInput.dataset.recipeLineId = line.recipe_line_id;

    const derivedInfo = document.createElement('div');
    derivedInfo.className = 'actual-derived-info';
    derivedInfo.dataset.recipeLineId = line.recipe_line_id;
    
    actualTd.appendChild(modeSelect);
    actualTd.appendChild(valueInput);
    actualTd.appendChild(derivedInfo);
    tr.appendChild(actualTd);
    
    slurryBody.appendChild(tr);

    const actualState = state.workflow.weighing.actualsByLineId[line.recipe_line_id] || getDefaultWeighingActual();
    modeSelect.value = actualState.measure_mode || getDefaultActualModeForLine(line);
    valueInput.value = modeSelect.value === 'volume'
      ? (actualState.actual_volume_ml ?? '')
      : (actualState.actual_mass_g ?? '');

    const updateDerivedInfo = () => {
      const density = getSelectedInstanceDensityForLine(line);
      const rawValue = modeSelect.value === 'volume' ? valueInput.value : valueInput.value;
      const next = formatActualDerivedInfo({
        measureMode: modeSelect.value || getDefaultActualModeForLine(line),
        rawValue,
        density
      });

      derivedInfo.textContent = next.text;
      derivedInfo.classList.remove('is-warning', 'is-derived');
      if (next.tone === 'warning') {
        derivedInfo.classList.add('is-warning');
      }
      if (next.tone === 'derived') {
        derivedInfo.classList.add('is-derived');
      }
    };

    modeSelect.addEventListener('change', () => {
      const nextMode = modeSelect.value || 'mass';
      const currentActual = state.workflow.weighing.actualsByLineId[line.recipe_line_id] || getDefaultWeighingActual();
      const nextValue = nextMode === 'volume'
        ? (currentActual.actual_volume_ml ?? '')
        : (currentActual.actual_mass_g ?? '');

      setWeighingActualForLine(line.recipe_line_id, nextMode === 'volume'
        ? { measure_mode: nextMode, actual_mass_g: '' }
        : { measure_mode: nextMode, actual_volume_ml: '' });
      valueInput.value = nextValue;
      updateDerivedInfo();
      renderSlurrySolidsSummary();
    });

    valueInput.addEventListener('input', () => {
      const measureMode = (state.workflow.weighing.actualsByLineId[line.recipe_line_id]?.measure_mode) || modeSelect.value || 'mass';
      setWeighingActualForLine(line.recipe_line_id, measureMode === 'volume'
        ? { measure_mode: measureMode, actual_volume_ml: valueInput.value }
        : { measure_mode: measureMode, actual_mass_g: valueInput.value });
      updateDerivedInfo();
      renderSlurrySolidsSummary();
    });

    updateDerivedInfo();

  });

  renderSlurrySolidsSummary();
  applyDefaultCoatingFoil();
}

function clearRecipeLines() {
  const container = document.getElementById('recipe-lines-container');
  if (container) {
    container.innerHTML = '';
  }
  const slurryBody = document.getElementById('slurry-actuals-body');
  if (slurryBody) {
    slurryBody.innerHTML = '';
  }
  resetDerivedCalculationState();
  renderDerivedState();
}

function clearRecipeStateAndUi({ clearRecipeField = false } = {}) {
  setRecipeLines([]);
  setSelectedInstancesByLineId({});
  setInstanceCacheByMaterialId({});
  setWeighingActualsByLineId({});
  setRestoringActuals([]);

  if (clearRecipeField) {
    setFormFields({
      ...state.form.fields,
      tape_recipe_id: ''
    });
  }

  clearRecipeLines();
}

function renderDerivedState() {
  const rows = Array.from(
    document.querySelectorAll('#recipe-lines-container .recipe-line-row')
  );

  rows.forEach(row => {
    const lineId = Number(row.dataset.recipeLineId);

    const targetDrySpan = row.querySelector('.target-dry-mass');
    if (targetDrySpan) {
      const value = state.derived.targetDryMassByLineId[lineId];
      targetDrySpan.textContent = Number.isFinite(value) ? value.toFixed(4) : '';
    }

    const plannedSpan = row.querySelector('.planned-mass');
    if (plannedSpan) {
      const value = state.derived.plannedMassByLineId[lineId];
      plannedSpan.textContent = Number.isFinite(value) ? value.toFixed(4) : '';
    }

    const slurryPlannedCell = document.querySelector(
      `.planned-amount-cell[data-recipe-line-id="${lineId}"]`
    );
    if (slurryPlannedCell) {
      const value = state.derived.plannedMassByLineId[lineId];
      slurryPlannedCell.textContent = Number.isFinite(value) ? value.toFixed(4) : '';
    }
  });

  renderExpandedCalculation();
  renderSlurrySolidsSummary();
}

function renderExpandedCalculation() {
  const container = document.getElementById('expanded-calculation-container');
  if (!container) return;
  
  container.innerHTML = '';
  
  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  
  const header = document.createElement('tr');
  header.innerHTML = `
          <th style="text-align:left;">Роль</th>
          <th style="text-align:left;">Материал</th>
          <th style="text-align:left;">Экземпляр</th>
          <th class="numeric">%</th>
          <th style="text-align:left;">Компонент</th>
          <th class="numeric">Масса компонента, г</th>
          <th class="numeric">Масса к навеске, г</th>
        `;
  table.appendChild(header);
  
  state.derived.expandedCalculation.forEach(block => {
    
    const instanceMass = block.instanceMass;
    
    block.components.forEach((c, index) => {
      
      const tr = document.createElement('tr');
      
      if (index === 0) {
        tr.innerHTML += `<td>${block.role}</td>`;
        tr.innerHTML += `<td>${block.material}</td>`;
        tr.innerHTML += `<td>${block.instanceName}</td>`;
      } else {
        tr.innerHTML += `<td></td><td></td><td></td>`;
      }
      
      tr.innerHTML += `
              <td class="numeric">${(c.fraction * 100).toFixed(2)} %</td>
              <td>${c.material_name}</td>
              <td class="numeric">${c.mass.toFixed(4)}</td>
            `;
      
      if (index === 0) {
        tr.innerHTML += `<td class="numeric">${instanceMass.toFixed(4)}</td>`;
      } else {
        tr.innerHTML += `<td></td>`;
      }
      
      table.appendChild(tr);
    });
  });
  
  container.appendChild(table);
}

function renderUsersSelects() {
  const userPlaceholder = '<option value="">— выбрать пользователя —</option>';
  const creatorPlaceholder = '<option value=""></option>';

  fillSelect(
    createdBySelect,
    state.reference.users,
    'user_id',
    (u) => u.name,
    creatorPlaceholder,
    state.form.fields.created_by
  );
  if (createdBySelect.options[0]) {
    createdBySelect.options[0].textContent =
      window.BADB_AUTH?.getAuditUserPlaceholder?.() || '— автоматически —';
  }

  const operatorSelects = Array.from(document.querySelectorAll('select[id$="-operator"]'));
  operatorSelects.forEach((sel) => {
    let selectedValue = '';

    if (sel.id === '0-drying_am-operator') selectedValue = state.workflow.drying_am.performed_by;
    if (sel.id === '1-weighing-operator') selectedValue = state.workflow.weighing.performed_by;
    if (sel.id === '1-mixing-operator') selectedValue = state.workflow.mixing.performed_by;
    if (sel.id === '2-coating-operator') selectedValue = state.workflow.coating.performed_by;
    if (sel.id === '2-calendering-operator') selectedValue = state.workflow.calendering.performed_by;
    if (sel.id === '2b-drying_pressed_tape-operator') selectedValue = state.workflow.drying_pressed_tape.performed_by;

    fillSelect(
      sel,
      state.reference.users,
      'user_id',
      (u) => u.name,
      userPlaceholder,
      selectedValue
    );
  });
}

function refreshAuditUserDisplay() {
  renderUsersSelects();
  writeTopLevelFormStateToDom();
}

function renderProjectsSelect() {
  if (!projectMultiSelectOptions) return;

  projectMultiSelectOptions.innerHTML = '';

  if (!state.reference.projects.length) {
    const empty = document.createElement('div');
    empty.className = 'field-hint';
    empty.textContent = 'Проекты не найдены';
    projectMultiSelectOptions.appendChild(empty);
    updateProjectMultiSelectDom();
    return;
  }

  const selectedProjectIds = new Set(normalizeProjectIds(state.form.fields.project_ids));

  state.reference.projects.forEach((project) => {
    const projectId = String(project.project_id);
    const label = document.createElement('label');
    label.className = 'multi-select-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = projectId;
    checkbox.checked = selectedProjectIds.has(projectId);

    checkbox.addEventListener('change', () => {
      const nextProjectIds = Array.from(
        projectMultiSelectOptions.querySelectorAll('input[type="checkbox"]:checked')
      ).map((input) => input.value);
      setProjectIds(nextProjectIds);
    });

    const text = document.createElement('span');
    text.textContent = project.name;

    label.appendChild(checkbox);
    label.appendChild(text);
    projectMultiSelectOptions.appendChild(label);
  });

  updateProjectMultiSelectDom();
}

function updateProjectMultiSelectDom() {
  if (projectSelect) {
    projectSelect.value = state.form.fields.project_id || '';
  }

  if (!projectMultiSelectTrigger || !projectMultiSelectOptions) return;

  const selectedProjectIds = new Set(normalizeProjectIds(state.form.fields.project_ids));
  const selectedNames = state.reference.projects
    .filter((project) => selectedProjectIds.has(String(project.project_id)))
    .map((project) => project.name);

  projectMultiSelectTrigger.textContent = selectedNames.length
    ? selectedNames.join(', ')
    : '— выбрать проекты —';

  projectMultiSelectOptions
    .querySelectorAll('input[type="checkbox"]')
    .forEach((input) => {
      input.checked = selectedProjectIds.has(input.value);
    });
}

function setProjectMultiSelectOpen(isOpen) {
  if (!projectMultiSelectOptions || !projectMultiSelectTrigger) return;
  projectMultiSelectOptions.hidden = !isOpen;
  projectMultiSelectTrigger.setAttribute('aria-expanded', String(Boolean(isOpen)));
}

function toggleProjectMultiSelect() {
  setProjectMultiSelectOpen(projectMultiSelectOptions?.hidden !== false);
}

function renderRecipesSelect() {
  fillSelect(
    recipeSelect,
    state.reference.currentRecipes,
    'tape_recipe_id',
    (r) => (r.variant_label ? `${r.name} — ${r.variant_label}` : r.name),
    '<option value="">— выбрать рецепт —</option>',
    state.form.fields.tape_recipe_id
  );
}

function renderFoilsSelect() {
  const select = document.getElementById('2-coating-foil_id');
  if (!select) return;

  fillSelect(
    select,
    state.reference.foils,
    'foil_id',
    (f) => f.type,
    '<option value="">— выбрать фольгу —</option>',
    state.workflow.coating.foil_id
  );
}

function renderCoatingMethodsSelect() {
  const select = document.getElementById('2-coating-coating_id');
  if (!select) return;

  select.innerHTML = '<option value="">— выбрать метод —</option>';

  state.reference.coatingMethods.forEach((method) => {
    const opt = document.createElement('option');
    opt.value = method.coating_id;
    opt.textContent = method.comments || method.name;
    select.appendChild(opt);
  });

  if (
    state.workflow.coating.coating_id &&
    [...select.options].some((option) => option.value === String(state.workflow.coating.coating_id))
  ) {
    select.value = String(state.workflow.coating.coating_id);
  }
}

function getInstanceNameFromState(materialId, instanceId) {
  const instances = state.recipe.instanceCacheByMaterialId[materialId] || [];
  const match = instances.find((inst) => String(inst.material_instance_id) === String(instanceId));
  return match?.name || '';
}

function getStableRecipeLineSortValue(line, fallbackIndex) {
  const recipeLineId = Number(line?.recipe_line_id);
  return Number.isFinite(recipeLineId) ? recipeLineId : fallbackIndex;
}

function aggregateComponentsByMaterial(components) {
  const byMaterialId = new Map();

  components.forEach((component) => {
    const materialId = Number(component.material_id ?? component.component_material_id);
    const fraction = Number(component.mass_fraction);

    if (!Number.isFinite(materialId) || !Number.isFinite(fraction) || fraction <= 0) return;

    const existing = byMaterialId.get(materialId);
    if (existing) {
      existing.mass_fraction += fraction;
      return;
    }

    byMaterialId.set(materialId, {
      component_material_instance_id: component.component_material_instance_id ?? null,
      component_name: component.component_name || component.material_name || '',
      material_id: materialId,
      material_name: component.material_name || component.component_name || '',
      material_role: component.material_role || null,
      mass_fraction: fraction
    });
  });

  return Array.from(byMaterialId.values());
}

function hasCachedInstanceComponents(instanceId) {
  return Object.prototype.hasOwnProperty.call(
    state.recipe.instanceComponentsCache,
    String(instanceId)
  );
}

function ensureInstanceComponentsLoadedForPlanning(instanceId) {
  if (!instanceId || hasCachedInstanceComponents(instanceId)) return;

  const cacheKey = String(instanceId);
  if (pendingPlannedComponentLoads.has(cacheKey)) return;

  pendingPlannedComponentLoads.add(cacheKey);

  fetchInstanceComponents(instanceId)
    .then((components) => {
      setInstanceComponentsCache({
        ...state.recipe.instanceComponentsCache,
        [cacheKey]: components
      });
      recalculatePlannedMasses();
      renderSlurrySolidsSummary();
    })
    .catch(console.error)
    .finally(() => {
      pendingPlannedComponentLoads.delete(cacheKey);
    });
}

function expandInstanceComponentsForPlanning(instanceId, fallbackComponent, seenInstanceIds = new Set()) {
  if (!instanceId) {
    return {
      components: aggregateComponentsByMaterial([fallbackComponent]),
      pending: false
    };
  }

  if (!hasCachedInstanceComponents(instanceId)) {
    ensureInstanceComponentsLoadedForPlanning(instanceId);
    return { components: [], pending: true };
  }

  const directComponents = state.recipe.instanceComponentsCache[String(instanceId)] || [];
  if (!Array.isArray(directComponents) || directComponents.length === 0) {
    return {
      components: aggregateComponentsByMaterial([fallbackComponent]),
      pending: false
    };
  }

  const nextSeen = new Set(seenInstanceIds);
  nextSeen.add(String(instanceId));

  const expanded = [];

  for (const component of directComponents) {
    const componentFraction = Number(component.mass_fraction);
    if (!Number.isFinite(componentFraction) || componentFraction <= 0) continue;

    const componentInstanceId = component.component_material_instance_id;
    const hasNestedInstance =
      componentInstanceId &&
      !nextSeen.has(String(componentInstanceId));

    if (hasNestedInstance) {
      if (!hasCachedInstanceComponents(componentInstanceId)) {
        ensureInstanceComponentsLoadedForPlanning(componentInstanceId);
        return { components: [], pending: true };
      }

      const nestedResult = expandInstanceComponentsForPlanning(
        componentInstanceId,
        {
          component_material_instance_id: component.component_material_instance_id ?? null,
          component_name: component.component_name || component.material_name || '',
          material_id: Number(component.material_id ?? component.component_material_id),
          material_name: component.material_name || component.component_name || '',
          material_role: component.material_role || null,
          mass_fraction: 1
        },
        nextSeen
      );

      if (nestedResult.pending) {
        return { components: [], pending: true };
      }

      nestedResult.components.forEach((nestedComponent) => {
        const nestedFraction = Number(nestedComponent.mass_fraction);
        if (!Number.isFinite(nestedFraction) || nestedFraction <= 0) return;

        expanded.push({
          ...nestedComponent,
          mass_fraction: componentFraction * nestedFraction
        });
      });

      continue;
    }

    expanded.push(component);
  }

  return {
    components: aggregateComponentsByMaterial(expanded),
    pending: false
  };
}

function buildMixtureComputationOrder(lines, expandedComponentsByLineId, targetDryByMaterialId) {
  const materialLineIndexes = new Map();

  lines.forEach((line, index) => {
    const materialId = Number(line?.material_id);
    if (!Number.isFinite(materialId) || targetDryByMaterialId[materialId] == null) return;

    if (!materialLineIndexes.has(materialId)) {
      materialLineIndexes.set(materialId, []);
    }
    materialLineIndexes.get(materialId).push(index);
  });

  const outgoing = new Map(lines.map((_, index) => [index, new Set()]));
  const incomingCount = new Map(lines.map((_, index) => [index, 0]));

  lines.forEach((line, sourceIndex) => {
    const lineMaterialId = Number(line?.material_id);
    const lineId = Number(line?.recipe_line_id);
    const components = expandedComponentsByLineId.get(lineId) || [];

    components.forEach((component) => {
      const componentMaterialId = Number(component.material_id ?? component.component_material_id);
      if (!Number.isFinite(componentMaterialId)) return;
      if (componentMaterialId === lineMaterialId) return;
      if (targetDryByMaterialId[componentMaterialId] == null) return;

      const dependentIndexes = materialLineIndexes.get(componentMaterialId) || [];
      dependentIndexes.forEach((dependentIndex) => {
        if (dependentIndex === sourceIndex) return;
        if (outgoing.get(sourceIndex).has(dependentIndex)) return;

        outgoing.get(sourceIndex).add(dependentIndex);
        incomingCount.set(dependentIndex, (incomingCount.get(dependentIndex) || 0) + 1);
      });
    });
  });

  const sortIndexes = (indexes) => indexes.sort((a, b) => {
    const sortA = getStableRecipeLineSortValue(lines[a], a);
    const sortB = getStableRecipeLineSortValue(lines[b], b);
    if (sortA !== sortB) return sortA - sortB;
    return a - b;
  });

  const available = sortIndexes(
    lines
      .map((_, index) => index)
      .filter((index) => (incomingCount.get(index) || 0) === 0)
  );
  const ordered = [];

  while (available.length) {
    const index = available.shift();
    ordered.push(index);

    sortIndexes(Array.from(outgoing.get(index) || [])).forEach((dependentIndex) => {
      const nextCount = (incomingCount.get(dependentIndex) || 0) - 1;
      incomingCount.set(dependentIndex, nextCount);
      if (nextCount === 0) {
        available.push(dependentIndex);
        sortIndexes(available);
      }
    });
  }

  if (ordered.length < lines.length) {
    const orderedSet = new Set(ordered);
    sortIndexes(lines.map((_, index) => index).filter((index) => !orderedSet.has(index)))
      .forEach((index) => ordered.push(index));
  }

  return ordered;
}

function recalculatePlannedMasses() {
  const mode = state.form.fields.calc_mode || 'from_active_mass';
  const inputValue = Number(state.form.fields.target_mass_g);
  
  resetDerivedCalculationState();
  
  if (!state.recipe.currentLines.length) {
    renderDerivedState();
    return;
  }
  if (!Number.isFinite(inputValue) || inputValue <= 0) {
    renderDerivedState();
    return;
  }
  
  let target; // active dry mass (g)
  
  if (mode !== 'from_active_mass' && mode !== 'from_slurry_mass') {
    renderDerivedState();
    return;
  }
  
  if (mode === 'from_active_mass') {
    target = inputValue;
  }
  
  if (mode === 'from_slurry_mass' && !Number.isFinite(inputValue)) {
    renderDerivedState();
    return;
  }
  
  // Find active material line
  const activeLine = state.recipe.currentLines.find(l =>
    l.recipe_role === 'cathode_active' ||
    l.recipe_role === 'anode_active'
  );
  
  if (!activeLine) {
    renderDerivedState();
    return;
  }
  if (!Number.isFinite(Number(activeLine.slurry_percent))) {
    renderDerivedState();
    return;
  }
  
  const activePercent = Number(activeLine.slurry_percent);
  if (!Number.isFinite(activePercent) || activePercent <= 0) {
    renderDerivedState();
    return;
  }
  
  if (mode === 'from_slurry_mass') {
    const totalWetMass = inputValue;
    
    const totalDryPercent = state.recipe.currentLines
    .filter(l => l.include_in_pct)
    .reduce((sum, l) => sum + Number(l.slurry_percent || 0), 0);
    if (totalDryPercent > 100) {
      renderDerivedState();
      return;
    }
    if (!Number.isFinite(totalDryPercent) || totalDryPercent <= 0) {
      renderDerivedState();
      return;
    }
    
    const totalDryMassFromWet = totalWetMass * (totalDryPercent / 100);
    
    target = totalDryMassFromWet * (activePercent / totalDryPercent);
  }
  
  // Total dry mass = total dry solids mass required
  // derived from requested active mass and active material fraction
  if (!Number.isFinite(target) || target <= 0) {
    renderDerivedState();
    return;
  }
  if (activePercent > 100) {
    renderDerivedState();
    return;
  }
  const totalDryMass = target / (activePercent / 100);
  
  const lineMap = {};
  state.recipe.currentLines.forEach(l => {
    lineMap[l.recipe_line_id] = l;
  });
  
  const expandedData = [];
  
  // 1) Build TARGET dry mass per material_id from recipe lines
  const targetDryByMaterialId = {};   // { material_id: target_dry_g }
  const remainingDryByMaterialId = {}; // { material_id: remaining_dry_g }
  
  // Only lines with include_in_pct=true (i.e., slurry_percent present) define dry targets
  state.recipe.currentLines.forEach(l => {
    if (!l || !l.include_in_pct) return;
    if (l.slurry_percent === null || l.slurry_percent === undefined || l.slurry_percent === '') return;
    
    const pct = Number(l.slurry_percent);
    if (!Number.isFinite(pct) || pct <= 0) return;
    
    const matId = Number(l.material_id);
    if (!Number.isFinite(matId)) return;
    
    const dry = totalDryMass * (pct / 100);
    
    targetDryByMaterialId[matId] = (targetDryByMaterialId[matId] || 0) + dry;
  });
  
  state.recipe.currentLines.forEach((line) => {
    const lineId = Number(line.recipe_line_id);
    if (!line) return;

    const matId = Number(line.material_id);
    const value = targetDryByMaterialId[matId];
    state.derived.targetDryMassByLineId[lineId] = Number.isFinite(value) ? value : null;
  });
  
  // Initialize remaining = target
  Object.keys(targetDryByMaterialId).forEach(k => {
    remainingDryByMaterialId[k] = targetDryByMaterialId[k];
  });
  
  // 2) Aggregate ACTUAL contributions from selected instances (including solvents)
  const aggregatedByMaterialId = {}; // { material_id: mass_g }
  // contributions per recipe line (for overlap reporting)
  // lineContribByLineId[lineId][materialId] = mass_g
  const lineContribByLineId = {};
  const expandedComponentsByLineId = new Map();
  let hasPendingComponents = false;
  
  for (const line of state.recipe.currentLines) {
    const lineId = Number(line.recipe_line_id);
    if (!line) continue;
    
    const selectedInstanceId = state.recipe.selectedInstancesByLineId[lineId];
    
    if (!selectedInstanceId) {
      state.derived.plannedMassByLineId[lineId] = null;
      continue;
    }

    const lineMaterialId = Number(line.material_id);
    const expandedResult = expandInstanceComponentsForPlanning(
      selectedInstanceId,
      {
        component_material_instance_id: null,
        component_name: line.material_name,
        material_id: lineMaterialId,
        material_name: line.material_name,
        material_role: null,
        mass_fraction: 1
      }
    );

    if (expandedResult.pending) {
      state.derived.plannedMassByLineId[lineId] = null;
      hasPendingComponents = true;
      continue;
    }

    expandedComponentsByLineId.set(lineId, expandedResult.components);
  }

  if (hasPendingComponents) {
    renderDerivedState();
    return;
  }

  const computationOrder = buildMixtureComputationOrder(
    state.recipe.currentLines,
    expandedComponentsByLineId,
    targetDryByMaterialId
  );

  for (const lineIndex of computationOrder) {
    const line = state.recipe.currentLines[lineIndex];
    const lineId = Number(line.recipe_line_id);
    if (!line) continue;

    const selectedInstanceId = state.recipe.selectedInstancesByLineId[lineId];

    if (!selectedInstanceId) {
      state.derived.plannedMassByLineId[lineId] = null;
      continue;
    }
    
    const lineMaterialId = Number(line.material_id);
    const needDry = Number(remainingDryByMaterialId[lineMaterialId] || 0);
    
    // If this line's material is already satisfied by previous mixtures, show 0.0000 g to weigh
    if (!Number.isFinite(needDry) || needDry <= 0) {
      state.derived.plannedMassByLineId[lineId] = 0;
      continue;
    }

    const components = expandedComponentsByLineId.get(lineId) || [];
    
    // Find the fraction of THIS line's material inside the selected instance (by material_id)
    const match = components.find(c =>
      Number(c.material_id ?? c.component_material_id) === lineMaterialId
    );
    const fLine = match ? Number(match.mass_fraction) : NaN;
    
    if (!Number.isFinite(fLine) || fLine <= 0) {
      // If the instance does not contain the requested material_id, show blank and skip
      state.derived.plannedMassByLineId[lineId] = null;
      continue;
    }
    
    // Required instance mass to supply the remaining dry mass of this line's material
    // (This is the "to weigh" mass of the instance.)
    const instanceMassToWeigh = needDry / fLine;
    
    expandedData.push({
      role: recipeRoleLabel(line.recipe_role),
      material: line.material_name,
      instanceName: getInstanceNameFromState(line.material_id, selectedInstanceId),
      instanceMass: instanceMassToWeigh,
      components: components.map(comp => {
        const frac = Number(comp.mass_fraction);
        const safeFrac = Number.isFinite(frac) && frac > 0 ? frac : 0;
        
        return {
          material_name: comp.material_name,
          fraction: safeFrac,
          mass: instanceMassToWeigh * safeFrac
        };
      })
    });
    
    state.derived.plannedMassByLineId[lineId] = instanceMassToWeigh;
    
    // Add contributions of every component from this instance
    components.forEach(comp => {
      const frac = Number(comp.mass_fraction);
      if (!Number.isFinite(frac)) return;
      
      const mass = instanceMassToWeigh * frac;
      const mid = Number(comp.material_id);
      if (!Number.isFinite(mid)) return;
      
      // 1) total aggregation (unchanged behavior)
      aggregatedByMaterialId[mid] = (aggregatedByMaterialId[mid] || 0) + mass;
      
      // 2) per-line contribution tracking (NEW)
      if (!lineContribByLineId[lineId]) {
        lineContribByLineId[lineId] = {};
      }
      lineContribByLineId[lineId][mid] =
      (lineContribByLineId[lineId][mid] || 0) + mass;
    });
    
    // Subtract SOLID contributions from remaining targets (overlap accounting)
    components.forEach(comp => {
      const frac = Number(comp.mass_fraction);
      if (!Number.isFinite(frac)) return;
      
      const mid = Number(comp.material_id);
      if (!Number.isFinite(mid)) return;
      
      const role = comp.material_role;
      if (role === 'solvent') return;
      
      if (remainingDryByMaterialId[mid] == null) return;
      
      const mass = instanceMassToWeigh * frac;
      remainingDryByMaterialId[mid] -= mass;
      if (remainingDryByMaterialId[mid] < 0) {
        remainingDryByMaterialId[mid] = 0;
      }
    });
  }
  
  expandedData.sort((a, b) => {
    const aIndex = state.recipe.currentLines.findIndex(l =>
      recipeRoleLabel(l.recipe_role) === a.role &&
      l.material_name === a.material
    );
    const bIndex = state.recipe.currentLines.findIndex(l =>
      recipeRoleLabel(l.recipe_role) === b.role &&
      l.material_name === b.material
    );
    return aIndex - bIndex;
  });
  
  setDerivedCalculationState({ expandedCalculation: expandedData });
}

const TAPE_LIST_STATUS_ORDER = [
  'recipe_materials',
  'drying_am',
  'weighing',
  'mixing',
  'coating',
  'drying_tape',
  'calendering',
  'drying_pressed_tape',
  'finished'
];

function normalizeTapeListFilterText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
}

function getTapeListFilterState() {
  return {
    text: normalizeTapeListFilterText(tapeListFilterTextInput?.value),
    status: tapeListFilterStatusSelect?.value || '',
    projectId: tapeListFilterProjectSelect?.disabled
      ? ''
      : tapeListFilterProjectSelect?.value || '',
    role: tapeListFilterRoleSelect?.value || '',
    sidedness: tapeListFilterSidednessSelect?.value || ''
  };
}

function hasActiveTapeListFilters(filters = getTapeListFilterState()) {
  return Boolean(
    filters.text ||
    filters.status ||
    filters.projectId ||
    filters.role ||
    filters.sidedness
  );
}

function getTapeCoatingSidednessLabel(sidedness) {
  if (sidedness === 'one_sided') return '1-сторонняя';
  if (sidedness === 'two_sided') return '2-сторонняя';
  return sidedness || '';
}

function getTapeListRoleFilterValue(tape) {
  return String(tape?.role || tape?.tape_type || '').trim();
}

function getTapeListSidednessFilterValue(tape) {
  return String(tape?.coating_sidedness || '').trim();
}

function getTapeListStatusLabel(tape) {
  return tape?.workflow_status_label || 'Выбор экземпляров';
}

function getTapeListStatusFilterValue(tape) {
  const code = String(tape?.workflow_status_code || '').trim();
  if (code) return code;

  const label = normalizeTapeListFilterText(getTapeListStatusLabel(tape));
  return label ? `label:${label}` : 'recipe_materials';
}

function getTapeListStatusSortRank(value) {
  const rank = TAPE_LIST_STATUS_ORDER.indexOf(value);
  return rank === -1 ? TAPE_LIST_STATUS_ORDER.length : rank;
}

function renderTapeStatusFilterOptions(tapes) {
  if (!tapeListFilterStatusSelect) return;

  const selectedValue = tapeListFilterStatusSelect.value;
  const statusesByValue = new Map();

  tapes.forEach((tape) => {
    const value = getTapeListStatusFilterValue(tape);
    if (!statusesByValue.has(value)) {
      statusesByValue.set(value, getTapeListStatusLabel(tape));
    }
  });

  const options = Array.from(statusesByValue.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) =>
      getTapeListStatusSortRank(a.value) - getTapeListStatusSortRank(b.value) ||
      a.label.localeCompare(b.label, 'ru')
    );

  tapeListFilterStatusSelect.innerHTML = '';

  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'Все статусы';
  tapeListFilterStatusSelect.appendChild(allOption);

  options.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    tapeListFilterStatusSelect.appendChild(option);
  });

  tapeListFilterStatusSelect.value = statusesByValue.has(selectedValue)
    ? selectedValue
    : '';
}

function getProjectNameById(projectId) {
  const project = state.reference.projects.find((item) =>
    String(item.project_id) === String(projectId)
  );
  return project?.name || '';
}

function renderTapeProjectFilterOptions() {
  if (!tapeListFilterProjectSelect) return;

  const selectedValue = tapeListFilterProjectSelect.value;
  const projects = Array.isArray(state.reference.projects)
    ? state.reference.projects
    : [];
  const seenProjectIds = new Set();

  tapeListFilterProjectSelect.innerHTML = '';

  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'Все проекты';
  tapeListFilterProjectSelect.appendChild(allOption);

  projects.forEach((project) => {
    const projectId = String(project.project_id || '');
    if (!projectId || seenProjectIds.has(projectId)) return;

    const option = document.createElement('option');
    option.value = projectId;
    option.textContent = project.name || `Проект #${projectId}`;
    tapeListFilterProjectSelect.appendChild(option);
    seenProjectIds.add(projectId);
  });

  tapeListFilterProjectSelect.disabled = seenProjectIds.size === 0;
  tapeListFilterProjectSelect.value = seenProjectIds.has(selectedValue)
    ? selectedValue
    : '';
}

function getTapeProjectSearchLabels(tape) {
  const labels = [
    tape?.project_names,
    tape?.project_name
  ];

  getTapeProjectIds(tape).forEach((projectId) => {
    labels.push(projectId);
    labels.push(getProjectNameById(projectId));
  });

  return labels.filter(Boolean);
}

function getTapeVisibleListLabel(tape) {
  const coatingSidednessLabel = getTapeCoatingSidednessLabel(tape?.coating_sidedness);
  const baseLabel = `#${tape?.tape_id} | ${tape?.name || '— без названия —'}`;
  return coatingSidednessLabel
    ? `${baseLabel} — ${coatingSidednessLabel}`
    : baseLabel;
}

function getTapeListSearchText(tape) {
  const coatingSidednessLabel = getTapeCoatingSidednessLabel(tape?.coating_sidedness);

  return normalizeTapeListFilterText([
    tape?.tape_id,
    tape?.tape_id ? `#${tape.tape_id}` : '',
    getTapeVisibleListLabel(tape),
    tape?.name,
    tape?.notes,
    tape?.comments,
    tape?.method_comments,
    tape?.recipe_name,
    tape?.recipe_label,
    tape?.tape_recipe_id,
    tape?.material_name,
    tape?.material_names,
    tape?.active_material_name,
    tape?.active_materials,
    tape?.recipe_materials,
    coatingSidednessLabel,
    tape?.coating_label,
    tape?.coating_name,
    tape?.coating_method_label,
    tape?.coating_method_name,
    getTapeListStatusLabel(tape),
    tape?.created_by_name,
    tape?.created_by,
    ...getTapeProjectSearchLabels(tape)
  ].filter(Boolean).join(' '));
}

function matchesTapeListFilters(tape, filters = getTapeListFilterState()) {
  if (filters.status && getTapeListStatusFilterValue(tape) !== filters.status) {
    return false;
  }

  if (filters.projectId && !getTapeProjectIds(tape).includes(filters.projectId)) {
    return false;
  }

  if (filters.role && getTapeListRoleFilterValue(tape) !== filters.role) {
    return false;
  }

  if (filters.sidedness && getTapeListSidednessFilterValue(tape) !== filters.sidedness) {
    return false;
  }

  if (filters.text && !getTapeListSearchText(tape).includes(filters.text)) {
    return false;
  }

  return true;
}

function updateTapeListFilterSummary(filteredCount, totalCount) {
  const hasFilters = hasActiveTapeListFilters();

  if (clearTapeListFiltersBtn) {
    clearTapeListFiltersBtn.disabled = !hasFilters;
  }

  if (!tapeListFilterSummary) return;

  if (totalCount === 0) {
    tapeListFilterSummary.textContent = 'Нет лент';
    return;
  }

  tapeListFilterSummary.textContent = hasFilters
    ? `Показано ${filteredCount} из ${totalCount}`
    : `Всего: ${totalCount}`;
}

function renderTapeEmptyListRow(totalCount, hasFilters) {
  const li = document.createElement('li');
  li.className = 'user-row tape-empty-row';
  li.textContent = totalCount === 0
    ? 'Ленты пока не добавлены.'
    : hasFilters
      ? 'Ленты по выбранным фильтрам не найдены.'
      : 'Ленты не найдены.';
  tapesList.appendChild(li);
}

function renderTapesList() {
  const tapes = Array.isArray(state.tapes.items) ? state.tapes.items : [];

  renderTapeStatusFilterOptions(tapes);
  renderTapeProjectFilterOptions();

  const filters = getTapeListFilterState();
  const hasFilters = hasActiveTapeListFilters(filters);
  const filteredTapes = tapes.filter((tape) => matchesTapeListFilters(tape, filters));

  tapesList.innerHTML = '';
  updateTapeListFilterSummary(filteredTapes.length, tapes.length);

  if (filteredTapes.length === 0) {
    renderTapeEmptyListRow(tapes.length, hasFilters);
    return;
  }

  async function openTapeRecord(tape) {
    const restoreData = await fetchTapeRestoreData(tape);
    normalizeTapeRestoreDataIntoState(restoreData);
    await renderTapeRestoreFromState(restoreData);
    window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
  }
  
  filteredTapes.forEach(t => {
    const li = document.createElement('li');
    li.className = 'user-row';
    
    const info = document.createElement('button');
    info.type = 'button';
    info.className = 'user-info record-open-button';
    info.title = 'Открыть ленту';
    info.setAttribute('aria-label', `Открыть ленту #${t.tape_id}`);

    const coatingSidednessLabel = getTapeCoatingSidednessLabel(t.coating_sidedness);
    
    const nameSpan = document.createElement('strong');
    nameSpan.textContent = coatingSidednessLabel
      ? `#${t.tape_id} | ${t.name || '— без названия —'} — ${coatingSidednessLabel}`
      : `#${t.tape_id} | ${t.name || '— без названия —'}`;

    const statusSpan = document.createElement('small');
    statusSpan.style.color = '#666';
    statusSpan.textContent = ` — Статус: ${getTapeListStatusLabel(t)}`;
    
    const dateSpan = document.createElement('small');
    const createdDate = t.created_at
      ? new Date(t.created_at).toLocaleDateString()
      : '';
    const updatedDate = t.updated_at
      ? new Date(t.updated_at).toLocaleDateString()
      : '';
    const dateLabels = [];
    const dateTitleLabels = [];
    if (createdDate) {
      dateLabels.push(createdDate);
      dateTitleLabels.push(`Создано: ${createdDate}`);
    }
    if (updatedDate) {
      dateLabels.push(updatedDate);
      dateTitleLabels.push(`Изменено: ${updatedDate}`);
    }
    dateSpan.style.color = '#666';
    dateSpan.title = dateTitleLabels.join('; ');
    dateSpan.textContent = dateLabels.length
      ? ` — ${dateLabels.join(' | ')}`
      : '';

    const creatorSpan = document.createElement('small');
    creatorSpan.style.color = '#666';
    creatorSpan.textContent = t.created_by_name
      ? ` — ${t.created_by_name}`
      : t.created_by
        ? ` — ${t.created_by}`
        : '';

    const projectsSpan = document.createElement('small');
    projectsSpan.style.color = '#666';
    projectsSpan.textContent = t.project_names || t.project_name
      ? ` — Проекты: ${t.project_names || t.project_name}`
      : '';
    
    info.appendChild(nameSpan);
    info.appendChild(statusSpan);
    info.appendChild(dateSpan);
    info.appendChild(creatorSpan);
    info.appendChild(projectsSpan);

    info.addEventListener('click', async () => {
      try {
        await openTapeRecord(t);
      } catch (err) {
        console.error(err);
        showStatus('Ошибка загрузки ленты', true);
      }
    });
    
    const actions = document.createElement('div');
    actions.className = 'actions';

    const printRowBtn = document.createElement('button');
    printRowBtn.type = 'button';
    printRowBtn.textContent = '🖨️';
    printRowBtn.title = 'Печать отчёта';
    printRowBtn.setAttribute('aria-label', `Печать отчёта ленты #${t.tape_id}`);
    printRowBtn.addEventListener('click', () => {
      openTapePrintReport(t.tape_id);
    });
    
    const duplicateBtn = document.createElement('button');
    duplicateBtn.type = 'button';
    duplicateBtn.textContent = '📑';
    duplicateBtn.title = 'Дублировать ленту';
    duplicateBtn.setAttribute('aria-label', `Дублировать ленту #${t.tape_id}`);
    
    duplicateBtn.onclick = () => {
      clearCurrentTapeSelection();
      setMode('create');
      clearCurrentTapeSelection();
      
      const copyName = t.name + ' (копия)';
      resetSectionState();
      setTopLevelFormState({
        ...getDefaultTopLevelFormFields(),
        name: copyName,
        notes: t.notes || '',
        project_id: getTapeProjectIds(t)[0] || '',
        project_ids: getTapeProjectIds(t)
      });
      setNameEditing(false);
    };
    
    actions.appendChild(printRowBtn);
    actions.appendChild(duplicateBtn);
    
    li.appendChild(info);
    li.appendChild(actions);
    
    tapesList.appendChild(li);
  });
}

function getTapePrintReportUrl(tapeId) {
  return `/workflow/tape-print.html?tape_id=${encodeURIComponent(tapeId)}`;
}

function openTapePrintReport(tapeId) {
  if (!tapeId) return;
  window.BADB_AUTH?.openAuthenticatedWindow(getTapePrintReportUrl(tapeId));
}

async function fetchTapeRestoreData(tape) {
  const tapeId = Number(tape?.tape_id);
  if (!Number.isInteger(tapeId)) {
    throw new Error('Некорректный tape_id');
  }

  const stepCodes = ['drying_am', 'weighing', 'mixing', 'coating', 'drying_tape', 'calendering', 'drying_pressed_tape'];

  const stepEntries = await Promise.all(stepCodes.map(async (code) => {
    const res = await fetch(`/api/tapes/${tapeId}/steps/by-code/${code}`);
    if (!res.ok) {
      throw new Error(`Ошибка восстановления этапа: ${code}`);
    }
    return [code, await res.json()];
  }));

  const actuals = tape.tape_recipe_id ? await fetchTapeActuals(tapeId) : [];
  const dryBoxState = await fetchTapeDryBoxState(tapeId);

  return {
    tape,
    stepsByCode: Object.fromEntries(stepEntries),
    actuals,
    dryBoxState
  };
}

function normalizeDryingRestoreStep(drying) {
  if (!drying) return getDefaultWorkflowState().drying_am;
  const { date, time } = splitIsoToDateTime(drying.started_at);
  const ended = splitIsoToDateTime(drying.ended_at);
  return {
    performed_by: String(drying.performed_by ?? ''),
    date,
    time,
    end_date: ended.date,
    end_time: ended.time,
    comments: drying.comments ?? '',
    temperature_c: drying.temperature_c ?? '',
    atmosphere: drying.atmosphere ?? 'vacuum',
    target_duration_min: drying.target_duration_min ?? '',
    drying_speed_text: drying.drying_speed_text ?? '',
    other_parameters: drying.other_parameters ?? ''
  };
}

function normalizeDryBoxRestoreState(dryBoxState) {
  if (!dryBoxState) return getDefaultWorkflowState().maintenance_dry_box;

  const started = splitIsoToDateTime(dryBoxState.started_at);
  const removed = splitIsoToDateTime(dryBoxState.removed_at);

  return {
    availability_status: dryBoxState.availability_status || 'out_of_dry_box',
    started_at_date: started.date,
    started_at_time: started.time,
    removed_at_date: removed.date,
    removed_at_time: removed.time,
    temperature_c: dryBoxState.temperature_c ?? '80',
    atmosphere: dryBoxState.atmosphere ?? 'vacuum',
    other_parameters: dryBoxState.other_parameters ?? '',
    comments: dryBoxState.comments ?? '',
    updated_by: String(dryBoxState.updated_by ?? ''),
    updated_by_name: dryBoxState.updated_by_name ?? '',
    updated_at: dryBoxState.updated_at ?? ''
  };
}

function normalizeTapeRestoreDataIntoState(restoreData) {
  const { tape, stepsByCode, actuals, dryBoxState } = restoreData;
  const defaults = getDefaultWorkflowState();

  state.form.isRestoringTape = true;
  setCurrentTape(tape, { mode: 'edit', render: false });
  setNameEditing(false, { render: false });

  setSectionsVisibility({
    '0-general-info': true,
    '0-tape-recipe-materials': true,
    '0-drying_materials': true,
    '1-slurry': true,
    '2-tape': true,
    '3-storage': Boolean(stepsByCode.drying_pressed_tape)
  }, { render: false });
  setSectionsOpen(
    getSectionOpenStateForWorkflowStatus(tape?.workflow_status_code || null),
    { render: false }
  );

  setTopLevelFormState({
    name: (tape?.name || '').trim(),
    notes: tape?.notes || '',
    created_by: tape?.created_by || '',
    created_at: formatDateInputValue(tape?.created_at),
    project_id: getTapeProjectIds(tape)[0] || '',
    project_ids: getTapeProjectIds(tape),
    tape_type: tape?.role || '',
    tape_recipe_id: tape?.tape_recipe_id || '',
    calc_mode: tape?.calc_mode || 'from_active_mass',
    target_mass_g: tape?.target_mass_g || ''
  }, { render: false });

  const restoredSelections = {};
  actuals.forEach((a) => {
    if (a.material_instance_id) {
      restoredSelections[a.recipe_line_id] = String(a.material_instance_id);
    }
  });

  setSelectedInstancesByLineId(restoredSelections);
  setRestoringActuals(actuals);

  setWorkflowStep('drying_am', normalizeDryingRestoreStep(stepsByCode.drying_am));
  setWorkflowStep('drying_tape', normalizeDryingRestoreStep(stepsByCode.drying_tape));
  setWorkflowStep('drying_pressed_tape', normalizeDryingRestoreStep(stepsByCode.drying_pressed_tape));
  setWorkflowStep('maintenance_dry_box', normalizeDryBoxRestoreState(dryBoxState));

  if (stepsByCode.weighing) {
    const { date, time } = splitIsoToDateTime(stepsByCode.weighing.started_at);
    setWorkflowStep('weighing', {
      ...defaults.weighing,
      performed_by: String(stepsByCode.weighing.performed_by ?? ''),
      date,
      time,
      comments: stepsByCode.weighing.comments ?? ''
    });
  } else {
    setWorkflowStep('weighing', defaults.weighing);
  }

  if (stepsByCode.mixing) {
    const started = splitIsoToDateTime(stepsByCode.mixing.started_at);
    const restoredMixing = {
      ...defaults.mixing,
      performed_by: String(stepsByCode.mixing.performed_by ?? ''),
      started_at_date: started.date,
      started_at_time: started.time,
      comments: stepsByCode.mixing.comments ?? '',
      slurry_volume_ml: stepsByCode.mixing.slurry_volume_ml ?? '',
      dry_mixing_id: stepsByCode.mixing.dry_mixing_id ?? '',
      dry_duration_min: stepsByCode.mixing.dry_duration_min ?? '',
      dry_rpm: stepsByCode.mixing.dry_rpm ?? '',
      wet_mixing_id: stepsByCode.mixing.wet_mixing_id ?? '',
      wet_duration_min: stepsByCode.mixing.wet_duration_min ?? '',
      wet_rpm: stepsByCode.mixing.wet_rpm ?? '',
      viscosity_cP: stepsByCode.mixing.viscosity_cp ?? ''
    };
    setWorkflowStep('mixing', {
      ...restoredMixing,
      ...deriveMixingTimeline(restoredMixing)
    });
    state.ui.mixing.wetMixingAuto = false;
    state.ui.mixing.lastAutoWetMixingId = '';
  } else {
    setWorkflowStep('mixing', defaults.mixing);
    state.ui.mixing.wetMixingAuto = true;
    state.ui.mixing.lastAutoWetMixingId = '';
  }

  if (stepsByCode.coating) {
    const started = splitIsoToDateTime(stepsByCode.coating.started_at);
    setWorkflowStep('coating', {
      ...defaults.coating,
      performed_by: String(stepsByCode.coating.performed_by ?? ''),
      date: started.date,
      time: started.time,
      comments: stepsByCode.coating.comments ?? '',
      foil_id: stepsByCode.coating.foil_id ?? '',
      coating_id: stepsByCode.coating.coating_id ?? '',
      coating_sidedness: stepsByCode.coating.coating_sidedness ?? '',
      gap_um: stepsByCode.coating.gap_um ?? '',
      gap_um_side2: stepsByCode.coating.gap_um_side2 ?? '',
      coat_temp_c: stepsByCode.coating.coat_temp_c ?? '',
      coat_time_min: stepsByCode.coating.coat_time_min ?? '',
      method_comments: stepsByCode.coating.method_comments ?? ''
    });
    state.ui.coating.sidednessAuto = false;
  } else {
    setWorkflowStep('coating', defaults.coating);
    state.ui.coating.sidednessAuto = true;
  }

  if (stepsByCode.calendering) {
    const started = splitIsoToDateTime(stepsByCode.calendering.started_at);
    const appearance = stepsByCode.calendering.appearance || '';
    setWorkflowStep('calendering', {
      ...defaults.calendering,
      performed_by: String(stepsByCode.calendering.performed_by ?? ''),
      date: started.date,
      time: started.time,
      comments: stepsByCode.calendering.comments ?? '',
      temp_c: stepsByCode.calendering.temp_c ?? '',
      pressure_value: stepsByCode.calendering.pressure_value ?? '',
      pressure_units: stepsByCode.calendering.pressure_units ?? '',
      draw_speed_m_min: stepsByCode.calendering.draw_speed_m_min ?? '',
      init_thickness_microns: stepsByCode.calendering.init_thickness_microns ?? '',
      final_thickness_microns: stepsByCode.calendering.final_thickness_microns ?? '',
      no_passes: stepsByCode.calendering.no_passes ?? '',
      other_params: stepsByCode.calendering.other_params ?? '',
      shine: appearance.includes('Блеск'),
      curl: appearance.includes('Закрутка'),
      dots: appearance.includes('Точечки'),
      other_check: appearance.includes('Другое:'),
      other_text: appearance.includes('Другое:')
        ? appearance.split('Другое:')[1]?.split(';')[0]?.trim() || ''
        : ''
    });
  } else {
    setWorkflowStep('calendering', defaults.calendering);
  }
}

function buildMaintenanceDryBoxPayload() {
  const step = state.workflow.maintenance_dry_box;

  return {
    started_at: combineDateAndTime(step.started_at_date, step.started_at_time),
    temperature_c: step.temperature_c || null,
    atmosphere: step.atmosphere || null,
    other_parameters: step.other_parameters || null,
    comments: step.comments || null
  };
}

function applyDryBoxStateToUi(stateRow) {
  const normalized = normalizeDryBoxRestoreState(stateRow);
  setWorkflowStep('maintenance_dry_box', normalized, { apply: true });
  patchCurrentTapeAvailability(normalized.availability_status);
}

async function renderTapeRestoreFromState(restoreData) {
  const currentName = (restoreData.tape?.name || '').trim();

  await loadRecipesDropdown({
    selectedValue: state.form.fields.tape_recipe_id,
    clearOnInvalid: true
  });
  renderTapeForm();

  if (state.form.fields.tape_recipe_id) {
    await loadRecipeLinesIntoStateAndRender(state.form.fields.tape_recipe_id, {
      restoringActuals: [...state.recipe.restoringActuals]
    });
  } else {
    clearRecipeStateAndUi({ clearRecipeField: false });
    markAllSavedSnapshotsCurrent();
    setRestoringActuals([]);
    state.form.isRestoringTape = false;
    refreshDirtyFromSnapshots();
  }

  renderWorkflowState();

  refreshDelayState();

  if (!currentName) {
    nameInput.focus();
  }
}

// -------- Status helper --------

const statusBox = document.querySelector('.status-feedback');
const inlineStatusTimeouts = new WeakMap();
let pendingSavePromise = null;

function logLoadError(err) {
  console.error(err);
}

function formatDependencySummary(dependencies) {
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

function formatSaveError(err, fallback = 'Ошибка сохранения') {
  const payload = err?.responseBody || err;
  const message =
    payload?.error ||
    payload?.message ||
    err?.message ||
    fallback;
  const dependencySummary = formatDependencySummary(payload?.dependencies);

  return dependencySummary
    ? `${message}. Блокирующие записи: ${dependencySummary}`
    : message;
}

async function buildResponseError(res, fallback = 'Ошибка запроса') {
  const contentType = res.headers?.get?.('content-type') || '';
  let payload = null;
  let text = '';

  if (contentType.includes('application/json')) {
    payload = await res.json().catch(() => null);
  } else {
    text = await res.text().catch(() => '');
  }

  const message = formatSaveError(
    payload || { error: text || `${fallback}: HTTP ${res.status}` },
    fallback
  );
  const err = new Error(message);
  err.status = res.status;
  err.responseBody = payload;
  return err;
}

async function throwResponseError(res, fallback) {
  throw await buildResponseError(res, fallback);
}

function showStatus(msg, isError = false) {
  if (!statusBox) return;

  statusBox.textContent = msg;
  statusBox.classList.toggle('is-error', Boolean(isError));
  statusBox.classList.toggle('is-saved', Boolean(msg && !isError));

  setTimeout(() => {
    if (statusBox.textContent === msg) {
      statusBox.textContent = '';
      statusBox.classList.remove('is-error');
      statusBox.classList.remove('is-saved');
    }
  }, 1200);
}

function getInlineStatusEl(buttonId) {
  const button = document.getElementById(buttonId);
  if (!button) return null;

  const statusEl = button.nextElementSibling;
  if (statusEl && statusEl.classList.contains('inline-save-status')) {
    return statusEl;
  }

  return null;
}

function showInlineStatus(buttonId, msg, isError = false, options = {}) {
  const statusEl = getInlineStatusEl(buttonId);
  if (!statusEl) {
    showStatus(msg, isError);
    return;
  }

  statusEl.textContent = msg;
  statusEl.classList.toggle('is-error', Boolean(isError));
  statusEl.classList.toggle('is-saving', Boolean(options.isSaving));
  statusEl.classList.toggle('is-saved', Boolean(msg && !isError && !options.isSaving));

  const existingTimeout = inlineStatusTimeouts.get(statusEl);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const clearAfterMs = options.clearAfterMs ?? (isError ? 18000 : 2200);
  if (!clearAfterMs) return;

  const timeoutId = setTimeout(() => {
    if (statusEl.textContent === msg) {
      statusEl.textContent = '';
      statusEl.classList.remove('is-error');
      statusEl.classList.remove('is-saving');
      statusEl.classList.remove('is-saved');
    }
    inlineStatusTimeouts.delete(statusEl);
  }, clearAfterMs);

  inlineStatusTimeouts.set(statusEl, timeoutId);
}

async function withInlineSaveStatus(buttonId, task, fallbackError = 'Ошибка сохранения') {
  const button = document.getElementById(buttonId);

  if (button?.disabled || button?.dataset.saving === 'true') return null;

  if (button) {
    button.dataset.saving = 'true';
    button.setAttribute('aria-disabled', 'true');
  }
  showInlineStatus(buttonId, 'Сохранение...', false, {
    clearAfterMs: 0,
    isSaving: true
  });

  try {
    return await (typeof task === 'function' ? task() : task);
  } catch (err) {
    console.error(err);
    showInlineStatus(buttonId, formatSaveError(err, fallbackError), true);
    return null;
  } finally {
    if (button && document.getElementById(buttonId) === button) {
      delete button.dataset.saving;
      button.removeAttribute('aria-disabled');
    }
  }
}

function trackPendingSave(promise) {
  const tracked = Promise.resolve(promise).finally(() => {
    if (pendingSavePromise === tracked) {
      pendingSavePromise = null;
    }
  });

  pendingSavePromise = tracked;
  return tracked;
}

async function waitForPendingSave() {
  if (!pendingSavePromise) return;
  await pendingSavePromise.catch(() => {});
}

// -------- Unsaved changes (dirty flags) --------

const dirtySteps = state.ui.dirtySteps;

const parentDirtyMap = {
  drying_materials: ['drying_am'],
  slurry: ['weighing', 'mixing'],
  tape: ['coating', 'drying_tape', 'calendering', 'drying_pressed_tape']
};

function updateDirtyMarker(stepCode) {
  const markerId =
  stepCode === 'general_info' ? 'dirty-general-info'
  : stepCode === 'recipe_materials' ? 'dirty-recipe-materials'
  : stepCode === 'drying_materials' ? 'dirty-drying_materials'
  : stepCode === 'drying_am' ? 'dirty-drying_am'
  : stepCode === 'slurry' ? 'dirty-slurry'
  : stepCode === 'weighing' ? 'dirty-weighing'
  : stepCode === 'mixing' ? 'dirty-mixing'
  : stepCode === 'tape' ? 'dirty-tape'
  : stepCode === 'coating' ? 'dirty-coating'
  : stepCode === 'drying_tape' ? 'dirty-drying_tape'
  : stepCode === 'calendering' ? 'dirty-calendering'
  : stepCode === 'drying_pressed_tape' ? 'dirty-drying_pressed_tape'
  : null;
  
  const el = markerId ? document.getElementById(markerId) : null;
  if (el) el.style.display = dirtySteps[stepCode] ? 'inline' : 'none';
}

function renderDirtyState() {
  Object.keys(dirtySteps).forEach((stepCode) => {
    updateDirtyMarker(stepCode);
  });
  renderTapeStickyHeader();
}

function refreshParentDirtyStates() {
  Object.entries(parentDirtyMap).forEach(([parent, children]) => {
    dirtySteps[parent] = children.some((child) => Boolean(dirtySteps[child]));
  });
  renderDirtyState();
}

function setStepDirty(stepCode, isDirty) {
  // Ignore programmatic restore for General Info (edit-mode loading)
  if (stepCode === 'general_info' && state.form.isRestoringTape && isDirty) return;
  
  dirtySteps[stepCode] = Boolean(isDirty);
  renderDirtyState();
  refreshParentDirtyStates();
}

function anyDirty() {
  return Object.values(dirtySteps).some(Boolean);
}

function getTapeDirtySnapshot() {
  return Object.keys(dirtySteps).reduce((acc, stepCode) => {
    acc[stepCode] = {
      isDirty: Boolean(dirtySteps[stepCode]),
      saved: state.ui.savedSnapshots[stepCode] ?? null,
      current: stepCode in state.ui.savedSnapshots
        ? getCurrentSnapshot(stepCode)
        : null
    };
    return acc;
  }, {});
}

function installTapeDebugInspector() {
  window.__tapeDebug = {
    getState: getTapeDebugSnapshot,
    getDirtyState: getTapeDirtySnapshot,
    logState() {
      console.log('tapeState', getTapeDebugSnapshot());
    },
    logDirtyState() {
      console.log('tapeDirtyState', getTapeDirtySnapshot());
    },
    render: renderTapeForm,
    renderWorkflow: renderWorkflowState,
    refreshDirtyState: refreshDirtyFromSnapshots,
    markAllSavedSnapshotsCurrent
  };
}

function clearAllDirtySteps() {
  Object.keys(dirtySteps).forEach((stepCode) => {
    setStepDirty(stepCode, false);
  });
}

const tapeLogoutGuard = {
  hasUnsavedChanges: anyDirty,
  discardUnsavedChanges: clearAllDirtySteps
};

window.BADB_PAGE_LOGOUT_GUARD = tapeLogoutGuard;
window.BADB_AUTH?.registerLogoutGuard?.(tapeLogoutGuard);

// Warn on tab close / reload when anything is dirty
window.addEventListener('beforeunload', (e) => {
  if (!anyDirty()) return;
  e.preventDefault();
  e.returnValue = '';
});

// Mark general info dirty on any user edits inside the General Info block
(() => {
  const generalDetails = document.getElementById('0-general-info');
  if (!generalDetails) return;
  
  const fields = generalDetails.querySelectorAll('input, select, textarea');
  
  fields.forEach(el => {
    
    const mark = () => {
      if (state.form.isRestoringTape) return;  // ignore programmatic restore
      refreshDirtyFromSnapshots();
    };
    
    el.addEventListener('input', mark);
    el.addEventListener('change', mark);
    
  });
})();
// -------- Time since previous step (helpers) --------

function parseDateTimeValue(dateValue, timeValue) {
  const d = dateValue || '';
  const t = timeValue || '';
  if (!d || !t) return null;
  
  const dt = new Date(`${d}T${t}`);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  
  if (h <= 0) return `${m} мин`;
  return `${h} ч ${m} мин`;
}

function getDelayTextFromDates(prev, cur) {
  if (!prev || !cur) {
    return '';
  }
  
  const ms = cur.getTime() - prev.getTime();
  const text = formatDurationMs(ms);
  
  return text ? `Время с прошлого этапа: ${text}` : '';
}

function getDryingStart(step) {
  return parseDateTimeValue(step?.date, step?.time);
}

function getDryingEnd(step) {
  return parseDateTimeValue(step?.end_date, step?.end_time) || getDryingStart(step);
}

function getWeighingStart(step) {
  return parseDateTimeValue(step?.date, step?.time);
}

function getWeighingEnd() {
  return getMixingStart(state.workflow.mixing) || getWeighingStart(state.workflow.weighing);
}

function getMixingStart(step) {
  return parseDateTimeValue(step?.started_at_date, step?.started_at_time);
}

function getMixingEnd(step) {
  const dryEnd = parseDateTimeValue(step?.dry_end_date, step?.dry_end_time);
  const wetEnd = parseDateTimeValue(step?.wet_end_date, step?.wet_end_time);
  const dryStart = parseDateTimeValue(step?.dry_start_date, step?.dry_start_time);
  const wetStart = parseDateTimeValue(step?.wet_start_date, step?.wet_start_time);
  const overallStart = getMixingStart(step);

  const candidates = [dryEnd, wetEnd, dryStart, wetStart, overallStart].filter(Boolean);
  if (!candidates.length) return null;

  return candidates.reduce((latest, current) => (
    !latest || current.getTime() > latest.getTime() ? current : latest
  ), null);
}

function getCoatingStart(step) {
  return parseDateTimeValue(step?.date, step?.time);
}

function getCoatingEnd() {
  return getDryingStart(state.workflow.drying_tape) || getCoatingStart(state.workflow.coating);
}

function getCalenderingStart(step) {
  return parseDateTimeValue(step?.date, step?.time);
}

function getCalenderingEnd() {
  return getDryingStart(state.workflow.drying_pressed_tape) || getCalenderingStart(state.workflow.calendering);
}

function getMaintenanceDryBoxStart(step) {
  return parseDateTimeValue(step?.started_at_date, step?.started_at_time);
}

function getMaintenanceDryBoxRemoved(step) {
  return parseDateTimeValue(step?.removed_at_date, step?.removed_at_time);
}

// -------- Live timer since last step --------

let liveSinceTimerId = null;

function getLatestStepMoment() {
  let latest = null;
  
  const stepMoments = [
    getDryingEnd(state.workflow.drying_am),
    getWeighingEnd(),
    getMixingEnd(state.workflow.mixing),
    getCoatingEnd(),
    getDryingEnd(state.workflow.drying_tape),
    getCalenderingEnd(),
    getDryingEnd(state.workflow.drying_pressed_tape)
  ];

  stepMoments.forEach((dt) => {
    if (!dt) return;
    if (!latest || dt.getTime() > latest.getTime()) latest = dt;
  });
  
  return latest;
}

function refreshDelayState() {
  state.ui.delays.weighing = getDelayTextFromDates(
    getDryingEnd(state.workflow.drying_am),
    getWeighingStart(state.workflow.weighing)
  );
  state.ui.delays.mixing = '';
  state.ui.delays.coating = getDelayTextFromDates(
    getMixingEnd(state.workflow.mixing),
    getCoatingStart(state.workflow.coating)
  );
  state.ui.delays.drying_tape = '';
  state.ui.delays.calendering = getDelayTextFromDates(
    getDryingEnd(state.workflow.drying_tape),
    getCalenderingStart(state.workflow.calendering)
  );
  state.ui.delays.drying_pressed_tape = '';

  const dryBoxStep = state.workflow.maintenance_dry_box;
  const dryBoxStart = getMaintenanceDryBoxStart(dryBoxStep);
  const dryBoxRemoved = getMaintenanceDryBoxRemoved(dryBoxStep);
  state.ui.delays.maintenance_dry_box = '';

  if (dryBoxStep?.availability_status === 'in_dry_box' && dryBoxStart) {
    const currentDryingDuration = formatDurationMs(Date.now() - dryBoxStart.getTime());
    state.ui.delays.maintenance_dry_box = currentDryingDuration
      ? `Сушится в шкафу: ${currentDryingDuration}`
      : '';
  } else if (dryBoxStart && dryBoxRemoved) {
    const lastDryingDuration = formatDurationMs(dryBoxRemoved.getTime() - dryBoxStart.getTime());
    state.ui.delays.maintenance_dry_box = lastDryingDuration
      ? `Последняя сушка: ${lastDryingDuration}`
      : '';
  }

  const latest = getLatestStepMoment();
  if (!latest) {
    state.ui.delays.liveSinceLastStep = '';
    renderDelayState();
    return;
  }
  
  const ms = Date.now() - latest.getTime();
  const text = formatDurationMs(ms);
  
  state.ui.delays.liveSinceLastStep = text ? `С момента последнего этапа: ${text}` : '';
  renderDelayState();
}

function startLiveSinceLastStepTimer() {
  stopLiveSinceLastStepTimer();
  refreshDelayState();
  liveSinceTimerId = setInterval(refreshDelayState, 1000);
}

function stopLiveSinceLastStepTimer() {
  if (liveSinceTimerId) {
    clearInterval(liveSinceTimerId);
    liveSinceTimerId = null;
  }
}

// -------- Reference dropdowns --------

async function loadUsers() {
  try {
    const users = await fetchUsers();
    setReferenceUsers(users);
    renderUsersSelects();
  } catch (err) {
    logLoadError(err);
  }
}

async function loadProjects() {
  try {
    const projects = await fetchProjects();
    setReferenceProjects(projects);
    renderProjectsSelect();
  } catch (err) {
    logLoadError(err);
  }
}

async function loadRecipesDropdown({ selectedValue = null, clearOnInvalid = true } = {}) {
  try {
    const role = state.form.fields.tape_type || null;
    
    // If no role selected → show only placeholder
    if (!role) {
      recipeSelect.innerHTML = '<option value="">— выбрать рецепт —</option>';
      recipeSelect.value = '';
      clearRecipeStateAndUi({ clearRecipeField: true });
      return;
    }
    
    const desiredValue = String(
      selectedValue ?? state.form.fields.tape_recipe_id ?? ''
    );
    
    const recipes = await fetchRecipes(role);
    setReferenceCurrentRecipes(recipes);
    if (
      desiredValue &&
      recipes.some(r => String(r.tape_recipe_id) === desiredValue)
    ) {
      setFormField('tape_recipe_id', desiredValue);
    }
    renderRecipesSelect();
    
    // Auto-clear if previously selected recipe no longer valid
    if (
      clearOnInvalid &&
      desiredValue &&
      !recipes.some(r => String(r.tape_recipe_id) === desiredValue)
    ) {
      recipeSelect.value = '';
      clearRecipeStateAndUi({ clearRecipeField: true });
    }
    
  } catch (err) {
    logLoadError(err);
  }
}

async function loadFoils() {
  
  const res = await fetch('/api/reference/foils');
  
  if (!res.ok) {
    throw new Error(`Ошибка загрузки фольги: ${res.status}`);
  }
  
  const foils = await res.json();
  setReferenceFoils(foils);
  renderFoilsSelect();
}

async function loadCoatingMethods() {
  
  const res = await fetch('/api/reference/coating-methods');
  const methods = await res.json();
  setReferenceCoatingMethods(methods);
  renderCoatingMethodsSelect();
}

function applyDefaultCoatingFoil() {
  if (state.workflow.coating.foil_id) return;

  const desiredFoil =
    state.form.fields.tape_type === 'cathode' ? 'al'
    : state.form.fields.tape_type === 'anode' ? 'cu'
    : '';

  if (!desiredFoil) return;

  const defaultFoil = state.reference.foils.find(
    (foil) => String(foil.type || '').trim().toLowerCase() === desiredFoil
  );

  if (defaultFoil) {
    updateWorkflowStepField('coating', 'foil_id', defaultFoil.foil_id);
    renderCoatingStep();
  }
}

function attachTopLevelFormStateSync() {
  const fieldMap = [
    ['notes', form.elements['notes']],
    ['created_at', form.elements['created_at']],
    ['project_id', form.elements['project_id']],
    ['tape_type', form.elements['tape_type']],
    ['tape_recipe_id', form.elements['tape_recipe_id']],
    ['calc_mode', form.elements['calc_mode']],
    ['target_mass_g', form.elements['target_mass_g']]
  ];

  fieldMap.forEach(([key, el]) => {
    if (!el) return;
    const sync = () => {
      setFormField(key, el.value || '');
    };
    el.addEventListener('input', sync);
    el.addEventListener('change', sync);
  });
}

function attachWorkflowStateSync() {
  const bindValueField = (id, stepKey, field, eventNames = ['input', 'change']) => {
    const el = document.getElementById(id);
    if (!el) return;
    const sync = () => updateWorkflowStepField(stepKey, field, el.value || '');
    eventNames.forEach((eventName) => el.addEventListener(eventName, sync));
  };

  const bindCheckedField = (id, stepKey, field) => {
    const el = document.getElementById(id);
    if (!el) return;
    const sync = () => updateWorkflowStepField(stepKey, field, Boolean(el.checked));
    el.addEventListener('change', sync);
  };

  [
    ['drying_am', '0-drying_am'],
    ['drying_pressed_tape', '2b-drying_pressed_tape']
  ].forEach(([stepKey, prefix]) => {
    bindValueField(`${prefix}-operator`, stepKey, 'performed_by');
    bindValueField(`${prefix}-date`, stepKey, 'date');
    bindValueField(`${prefix}-time`, stepKey, 'time');
    bindValueField(`${prefix}-end-date`, stepKey, 'end_date');
    bindValueField(`${prefix}-end-time`, stepKey, 'end_time');
    bindValueField(`${prefix}-notes`, stepKey, 'comments');
    bindValueField(`${prefix}-temperature`, stepKey, 'temperature_c');
    bindValueField(`${prefix}-atmosphere`, stepKey, 'atmosphere');
    bindValueField(`${prefix}-target-duration`, stepKey, 'target_duration_min');
    bindValueField(`${prefix}-other_param`, stepKey, 'other_parameters');
  });

  bindValueField('1-weighing-operator', 'weighing', 'performed_by');
  bindValueField('1-weighing-date', 'weighing', 'date');
  bindValueField('1-weighing-time', 'weighing', 'time');
  bindValueField('1-weighing-notes', 'weighing', 'comments');

  bindValueField('1-mixing-operator', 'mixing', 'performed_by');
  bindValueField('1-mixing-started_at-date', 'mixing', 'started_at_date');
  bindValueField('1-mixing-started_at-time', 'mixing', 'started_at_time');
  bindValueField('1-mixing-comments', 'mixing', 'comments');
  bindValueField('1-mixing-slurry_volume_ml', 'mixing', 'slurry_volume_ml');
  bindValueField('1-mixing-dry_mixing_id', 'mixing', 'dry_mixing_id');
  bindValueField('dry-duration-min', 'mixing', 'dry_duration_min');
  bindValueField('dry-rpm', 'mixing', 'dry_rpm');
  bindValueField('1-mixing-wet_mixing_id', 'mixing', 'wet_mixing_id');
  bindValueField('wet-duration-min', 'mixing', 'wet_duration_min');
  bindValueField('wet-rpm', 'mixing', 'wet_rpm');
  bindValueField('wet-viscosity_cP', 'mixing', 'viscosity_cP');

  bindValueField('2-coating-operator', 'coating', 'performed_by');
  bindValueField('2-coating-date', 'coating', 'date');
  bindValueField('2-coating-time', 'coating', 'time');
  bindValueField('2-cathode-tape-notes', 'coating', 'comments');
  bindValueField('2-coating-foil_id', 'coating', 'foil_id');
  bindValueField('2-coating-coating_id', 'coating', 'coating_id');
  bindValueField('2-coating-sidedness', 'coating', 'coating_sidedness');
  bindValueField('2-coating-gap-um', 'coating', 'gap_um');
  bindValueField('2-coating-gap-um-side2', 'coating', 'gap_um_side2');
  bindValueField('2-coating-time-min', 'coating', 'coat_time_min');
  bindValueField('2-coating-method-comments', 'coating', 'method_comments');
  bindValueField('2-coating-dry-temp', 'drying_tape', 'temperature_c');
  bindValueField('2-coating-dry-atmosphere', 'drying_tape', 'atmosphere');
  bindValueField('2-coating-dry-duration', 'drying_tape', 'target_duration_min');
  bindValueField('2-coating-dry-speed', 'drying_tape', 'drying_speed_text');

  bindValueField('2-calendering-operator', 'calendering', 'performed_by');
  bindValueField('2-calendering-date', 'calendering', 'date');
  bindValueField('2-calendering-time', 'calendering', 'time');
  bindValueField('2-calendering-notes', 'calendering', 'comments');
  bindValueField('2-calendering-temp_c', 'calendering', 'temp_c');
  bindValueField('2-calendering-pressure_value', 'calendering', 'pressure_value');
  bindValueField('2-calendering-pressure_units', 'calendering', 'pressure_units');
  bindValueField('2-calendering-draw_speed_m_min', 'calendering', 'draw_speed_m_min');
  bindValueField('2-calendering-init_thickness_microns', 'calendering', 'init_thickness_microns');
  bindValueField('2-calendering-final_thickness_microns', 'calendering', 'final_thickness_microns');
  bindValueField('2-calendering-no_passes', 'calendering', 'no_passes');
  bindValueField('2-calendering-other_params', 'calendering', 'other_params');
  bindCheckedField('2-cal-shine', 'calendering', 'shine');
  bindCheckedField('2-cal-curl', 'calendering', 'curl');
  bindCheckedField('2-cal-dots', 'calendering', 'dots');
  bindCheckedField('2-cal-other-check', 'calendering', 'other_check');
  bindValueField('2-cal-other-text', 'calendering', 'other_text');

  bindValueField('2c-dry-box-start-date', 'maintenance_dry_box', 'started_at_date');
  bindValueField('2c-dry-box-start-time', 'maintenance_dry_box', 'started_at_time');
  bindValueField('2c-dry-box-temperature', 'maintenance_dry_box', 'temperature_c');
  bindValueField('2c-dry-box-atmosphere', 'maintenance_dry_box', 'atmosphere');
  bindValueField('2c-dry-box-other-parameters', 'maintenance_dry_box', 'other_parameters');
  bindValueField('2c-dry-box-comments', 'maintenance_dry_box', 'comments');

  const slurryVolumeInput = document.getElementById('1-mixing-slurry_volume_ml');
  if (slurryVolumeInput) {
    slurryVolumeInput.addEventListener('input', applyWetMixingMethodAutoSelection);
    slurryVolumeInput.addEventListener('change', applyWetMixingMethodAutoSelection);
  }
}

function attachSectionStateSync() {
  Object.keys(state.ui.sections.open).forEach((id) => {
    const el = document.getElementById(id);
    if (!el || typeof el.open === 'undefined') return;
    el.addEventListener('toggle', () => {
      setSectionOpen(id, el.open, { render: false });
    });
  });
}

async function loadRecipeLinesIntoStateAndRender(recipeId, { restoringActuals = [] } = {}) {
  if (!recipeId) {
    setRecipeLines([]);
    setSelectedInstancesByLineId({});
    setInstanceCacheByMaterialId({});
    setWeighingActualsByLineId({});
    setRestoringActuals([]);
    clearRecipeLines();
    return;
  }

  const lines = await fetchRecipeLines(recipeId);
  setRecipeLines(lines);

  if (!state.form.isRestoringTape) {
    setSelectedInstancesByLineId({});
    setWeighingActualsByLineId({});
  }
  setInstanceCacheByMaterialId({});

  if (restoringActuals.length) {
    mergeRestoringActualsIntoState(restoringActuals);
  }

  await loadMaterialInstancesForRecipeLines(state.recipe.currentLines);
  renderRecipeLines();
  recalculatePlannedMasses();
  applyDefaultCoatingFoil();
  applyDryingTapePrefillFromCoating();

  if (state.form.isRestoringTape) {
    markAllSavedSnapshotsCurrent();
    setRestoringActuals([]);
    state.form.isRestoringTape = false;
    refreshDirtyFromSnapshots();
  }
}

// -------- Events --------

projectMultiSelectTrigger.addEventListener('click', async () => {
  await loadProjects();
  toggleProjectMultiSelect();
});
document.addEventListener('click', (event) => {
  if (!projectMultiSelect || projectMultiSelect.contains(event.target)) return;
  setProjectMultiSelectOpen(false);
});
recipeSelect.addEventListener('focus', loadRecipesDropdown);
tapeTypeSelect.addEventListener('change', loadRecipesDropdown);
tapeTypeSelect.addEventListener('change', applyDefaultCoatingFoil);
tapeTypeSelect.addEventListener('change', () => applyDryingTapePrefillFromCoating({ forceDefaults: true }));

// When recipe changes: load lines + reset instance selections + clear planned masses
recipeSelect.addEventListener('change', async () => {
  const recipeId = recipeSelect.value;

  try {
    const restoringActuals = [...state.recipe.restoringActuals];
    await loadRecipeLinesIntoStateAndRender(recipeId, { restoringActuals });
  } catch (err) {
    console.error(err);
  }
});

const activeMassInput = document.getElementById('target-mass-g');
const calcModeSelect  = document.getElementById('calc-mode');
const activeMassLabel = document.querySelector('label[for="target-mass-g"]');

// Update label based on calculation mode
calcModeSelect.addEventListener('change', () => {
  if (calcModeSelect.value === 'from_slurry_mass') {
    activeMassLabel.textContent = 'Общая масса суспензии, г';
  } else {
    activeMassLabel.textContent = 'Масса активного материала, г';
  }
});

activeMassInput.addEventListener('input', recalculatePlannedMasses);
calcModeSelect.addEventListener('change', recalculatePlannedMasses);

addInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  
  e.preventDefault();
  if (!form.hidden) return;
  
  const name = addInput.value.trim();
  if (!name) return;
  
  setMode('create');
  clearCurrentTapeSelection();
  setTopLevelFormState({
    ...getDefaultTopLevelFormFields(),
    name
  });
  setNameEditing(false);

  addInput.value = '';
});


/* ------ name: editable ------ */

title.addEventListener('click', () => {
  setNameEditing(true);
  nameInput.focus();
});

nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    nameInput.blur();
  }
});

nameInput.addEventListener('input', () => {
  setTopLevelFormState({ name: nameInput.value.trim() }, { render: false });
});

nameInput.addEventListener('blur', () => {
  const val = nameInput.value.trim();
  setTopLevelFormState({ name: val }, { render: false });
  setNameEditing(false);
});


// -------- Top General Tape Buttons --------

saveBtn.addEventListener('click', () => trackPendingSave(withInlineSaveStatus('saveBtn', async () => {
  if (!state.form.mode) return;
  const data = buildTapeSavePayload();
  
  if (!data.project_id || !data.tape_recipe_id) {
    showInlineStatus('saveBtn', 'Выберите проект и рецепт', true);
    return;
  }
  
  try {
    if (state.form.mode === 'create') {
      const created = await createTape(data);
      
      await loadTapes();
      const createdFromList = getTapeFromLoadedList(created.tape_id, created);
      // keep the form open: switch to edit mode so step buttons keep working
      setCurrentTape(createdFromList, { mode: 'edit', render: false });
      setTopLevelFormState({
        ...state.form.fields,
        created_by: createdFromList?.created_by || '',
        created_at: formatDateInputValue(createdFromList?.created_at)
      });
      
      markAllSavedSnapshotsCurrent();
      refreshDirtyFromSnapshots();
      showInlineStatus('saveBtn', 'Изменения сохранены');
      return;
    }
    
    if (state.form.mode === 'edit') {
      
      // 1. Update tape general info only
      await updateTape(state.selection.currentTapeId, data);
      setCurrentTape({
        ...(state.selection.currentTape || {}),
        tape_id: state.selection.currentTapeId,
        ...data,
        role: data.tape_type
      });

      await loadTapes();
      const updatedFromList = getTapeFromLoadedList(state.selection.currentTapeId);
      if (updatedFromList) {
        setCurrentTape(updatedFromList, { mode: 'edit', render: false });
        setTopLevelFormState({
          ...state.form.fields,
          created_by: updatedFromList.created_by || '',
          created_at: formatDateInputValue(updatedFromList.created_at)
        });
      }
      markSavedSnapshot('general_info');
      refreshDirtyFromSnapshots();
      showInlineStatus('saveBtn', 'Изменения сохранены');
      return;
    }
  } catch (err) {
    console.error(err);
    showInlineStatus('saveBtn', formatSaveError(err, 'Ошибка сохранения ленты'), true);
  }
}, 'Ошибка сохранения ленты')));

clearBtn.addEventListener('click', async () => {
  if (anyDirty()) {
    const ok = confirm('Changes not saved. Are you sure you want to leave?');
    if (!ok) return;
  }

  await waitForPendingSave();
  
  try {
    await loadTapes();
  } catch (err) {
    console.error(err);
  }

  // user chose to leave → clear flags so beforeunload doesn’t keep firing
  clearAllDirtySteps();
  
  resetForm();
});

if (tapeListFilterTextInput) {
  tapeListFilterTextInput.addEventListener('input', renderTapesList);
}

if (tapeListFilterStatusSelect) {
  tapeListFilterStatusSelect.addEventListener('change', renderTapesList);
}

if (tapeListFilterProjectSelect) {
  tapeListFilterProjectSelect.addEventListener('change', renderTapesList);
}

if (tapeListFilterRoleSelect) {
  tapeListFilterRoleSelect.addEventListener('change', renderTapesList);
}

if (tapeListFilterSidednessSelect) {
  tapeListFilterSidednessSelect.addEventListener('change', renderTapesList);
}

if (clearTapeListFiltersBtn) {
  clearTapeListFiltersBtn.addEventListener('click', () => {
    if (tapeListFilterTextInput) tapeListFilterTextInput.value = '';
    if (tapeListFilterStatusSelect) tapeListFilterStatusSelect.value = '';
    if (tapeListFilterProjectSelect) tapeListFilterProjectSelect.value = '';
    if (tapeListFilterRoleSelect) tapeListFilterRoleSelect.value = '';
    if (tapeListFilterSidednessSelect) tapeListFilterSidednessSelect.value = '';
    renderTapesList();
    tapeListFilterTextInput?.focus();
  });
}

deleteTapeBtn.addEventListener('click', () => trackPendingSave(withInlineSaveStatus('deleteTapeBtn', async () => {
  const tapeId = state.selection.currentTapeId;

  if (!tapeId) {
    showInlineStatus('deleteTapeBtn', 'Сначала откройте ленту', true);
    return;
  }

  if (anyDirty()) {
    const ok = confirm('Есть несохранённые изменения. Удалить ленту без сохранения?');
    if (!ok) return;
  }

  const checkRes = await fetch(`/api/tapes/${tapeId}/delete-check`);
  const check = await checkRes.json().catch(() => ({}));

  if (!checkRes.ok || !check.can_delete) {
    showInlineStatus(
      'deleteTapeBtn',
      formatSaveError(check, 'Лента пока не готова к удалению'),
      true,
      { clearAfterMs: 18000 }
    );
    return;
  }

  const phrase = `DELETE TAPE ${tapeId}`;
  const typed = prompt(`Для удаления ленты введите: ${phrase}`);

  if (typed !== phrase) {
    showInlineStatus('deleteTapeBtn', 'Удаление отменено.', true, { clearAfterMs: 4000 });
    return;
  }

  await deleteTape(tapeId);
  clearAllDirtySteps();
  resetForm();
  await loadTapes();
  showStatus(`Лента #${tapeId} удалена.`);
}, 'Ошибка удаления ленты')));

printBtn.addEventListener('click', () => {
  if (!state.selection.currentTapeId) {
    showStatus('Сначала откройте ленту', true);
    return;
  }

  openTapePrintReport(state.selection.currentTapeId);
});

recipeMaterialsSaveBtn.addEventListener('click', () => trackPendingSave(withInlineSaveStatus('0-recipe-materials-save-btn', async () => {
  if (!state.selection.currentTapeId) {
    showInlineStatus('0-recipe-materials-save-btn', 'Сначала создайте ленту', true);
    return;
  }

  try {
    await saveSelectedInstances(state.selection.currentTapeId);
    markSavedSnapshot('recipe_materials');
    refreshDirtyFromSnapshots();
    showInlineStatus('0-recipe-materials-save-btn', 'Выбор экземпляров сохранён');
  } catch (err) {
    showInlineStatus(
      '0-recipe-materials-save-btn',
      formatSaveError(err, 'Ошибка сохранения выбранных экземпляров'),
      true
    );
  }
}, 'Ошибка сохранения выбранных экземпляров')));

function buildDryingPayload(stepKey) {
  const step = state.workflow[stepKey];
  return {
    performed_by: Number(step.performed_by) || null,
    started_at: combineDateAndTime(step.date, step.time),
    ended_at: combineDateAndTime(step.end_date, step.end_time),
    comments: step.comments || null,
    temperature_c: Number(step.temperature_c) || null,
    atmosphere: step.atmosphere || null,
    target_duration_min: Number(step.target_duration_min) || null,
    drying_speed_text: step.drying_speed_text || null,
    other_parameters: step.other_parameters || null
  };
}

async function saveDryingStep({ code, stepKey }) {
  if (!state.selection.currentTapeId) {
    throw new Error('Сначала создайте ленту');
  }
  const payload = buildDryingPayload(stepKey);
  
  const res = await fetch(
    `/api/tapes/${state.selection.currentTapeId}/steps/by-code/${code}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );
  
  if (!res.ok) {
    await throwResponseError(res, 'Ошибка сохранения этапа сушки');
  }
}

async function autoSaveDryingTapeFromCoating() {
  await saveDryingStep({ code: 'drying_tape', stepKey: 'drying_tape' });
  markSavedSnapshot('drying_tape');
  return true;
}

// Wire all drying save buttons 
[
  { code: 'drying_am',           stepKey: 'drying_am',            btnId: '0-drying_am-save-btn' },
  { code: 'drying_pressed_tape', stepKey: 'drying_pressed_tape', btnId: '2b-drying_pressed_tape-save-btn' }
].forEach(cfg => {
  const btn = document.getElementById(cfg.btnId);
  if (!btn) return;
  
  btn.addEventListener('click', () => trackPendingSave(withInlineSaveStatus(cfg.btnId, async () => {
    try {
      await saveDryingStep(cfg);
      if (cfg.code === 'drying_pressed_tape' && state.selection.currentTapeId) {
        const dryBoxState = await fetchTapeDryBoxState(state.selection.currentTapeId);
        applyDryBoxStateToUi(dryBoxState);
      }
      markSavedSnapshot(cfg.code);
      refreshDirtyFromSnapshots();
      showInlineStatus(cfg.btnId, 'Изменения сохранены');
    } catch (err) {
      showInlineStatus(cfg.btnId, formatSaveError(err, 'Ошибка сохранения этапа сушки'), true);
    }
  }, 'Ошибка сохранения этапа сушки')));
});

const weighingSaveBtn = document.getElementById('1-weighing-save-btn');

weighingSaveBtn.addEventListener('click', () => trackPendingSave(withInlineSaveStatus('1-weighing-save-btn', async () => {
  
  if (!state.selection.currentTapeId) {
    showInlineStatus('1-weighing-save-btn', 'Сначала создайте ленту', true);
    return;
  }
  const step = state.workflow.weighing;
  const payload = {
    performed_by: Number(step.performed_by) || null,
    started_at: combineDateAndTime(step.date, step.time),
    comments: step.comments || null
  };
  
  try {
    const res = await fetch(
      `/api/tapes/${state.selection.currentTapeId}/steps/by-code/weighing`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    
    if (!res.ok) {
      await throwResponseError(res, 'Ошибка сохранения этапа замеса');
    }

    await saveTapeActuals(state.selection.currentTapeId);
    
    markSavedSnapshot('weighing');
    refreshDirtyFromSnapshots();
    showInlineStatus('1-weighing-save-btn', 'Изменения сохранены');
    
  } catch (err) {
    showInlineStatus(
      '1-weighing-save-btn',
      formatSaveError(err, 'Ошибка сохранения этапа замеса'),
      true
    );
  }
}, 'Ошибка сохранения этапа замеса')));

// -------- I.2. Save mixing --------

function updateMixParamsVisibility() {
  const mixingStep = state.workflow?.mixing || getDefaultWorkflowState().mixing;
  const drySelectedId = String(mixingStep.dry_mixing_id || '');
  const wetSelectedId = String(mixingStep.wet_mixing_id || '');

  const dryMethod = state.reference.dryMixingMethods.find(
    (item) => String(item.dry_mixing_id) === drySelectedId
  ) || null;
  const wetMethod = state.reference.wetMixingMethods.find(
    (item) => String(item.wet_mixing_id) === wetSelectedId
  ) || null;

  const dryCode = String(dryMethod?.name || '').trim().toLowerCase();
  const wetCode = String(wetMethod?.name || '').trim().toLowerCase();
  
  const hideDry =
  !dryCode ||
  dryCode === 'none' ||
  dryCode === 'hand';
  
  const hideWet =
  !wetCode ||
  wetCode === 'none' ||
  wetCode === 'hand';

  setMixingParamsVisibility({
    dryParamsVisible: !hideDry,
    wetParamsVisible: !hideWet
  });
}

function getWetMixingMethodIdForVolume(slurryVolumeMl) {
  const volume = Number(slurryVolumeMl);
  if (!Number.isFinite(volume) || volume <= 0) return '';
  if (volume < 15) return '1';
  if (volume <= 150) return '2';
  if (volume <= 450) return '3';
  if (volume <= 750) return '4';
  if (volume >= 1500 && volume <= 3500) return '5';
  return '';
}

function canAutoUpdateWetMixingMethod(currentId) {
  const current = String(currentId || '');
  return (
    !current ||
    state.ui.mixing.wetMixingAuto ||
    current === String(state.ui.mixing.lastAutoWetMixingId || '')
  );
}

function applyWetMixingMethodAutoSelection() {
  const step = state.workflow.mixing;
  if (!step) return;

  const nextId = getWetMixingMethodIdForVolume(step.slurry_volume_ml);
  const currentId = String(step.wet_mixing_id || '');
  if (!canAutoUpdateWetMixingMethod(currentId)) return;
  if (currentId === nextId) return;

  state.ui.mixing.wetMixingAuto = true;
  state.ui.mixing.lastAutoWetMixingId = nextId;
  setWorkflowStep('mixing', {
    ...step,
    wet_mixing_id: nextId
  });
  setElValue('1-mixing-wet_mixing_id', nextId);
  updateMixParamsVisibility();
}

// ---- Mixing params show/hide (empty method => hide params) ----
const dryMixSelect = document.getElementById('1-mixing-dry_mixing_id');
const wetMixSelect = document.getElementById('1-mixing-wet_mixing_id');

if (dryMixSelect) dryMixSelect.addEventListener('change', updateMixParamsVisibility);
if (wetMixSelect) {
  wetMixSelect.addEventListener('change', () => {
    const selectedId = String(wetMixSelect.value || '');
    state.ui.mixing.wetMixingAuto = !selectedId;
    state.ui.mixing.lastAutoWetMixingId = '';
    if (state.workflow.mixing) {
      setWorkflowStep('mixing', {
        ...state.workflow.mixing,
        wet_mixing_id: selectedId
      });
    }
    updateMixParamsVisibility();
  });
}

document.getElementById('1-mixing-save-btn').onclick = () => trackPendingSave(withInlineSaveStatus('1-mixing-save-btn', async () => {
  
  if (!state.selection.currentTapeId) {
    showInlineStatus('1-mixing-save-btn', 'Сначала сохраните ленту', true);
    return;
  }
  const step = state.workflow.mixing;
  const derived = deriveMixingTimeline(step);
  
  // ---- Build payload ----
  const payload = {
    performed_by: step.performed_by || null,
    started_at: combineDateAndTime(step.started_at_date, step.started_at_time),
    comments: step.comments || null,
    slurry_volume_ml: step.slurry_volume_ml || null,
    dry_mixing_id: step.dry_mixing_id || null,
    dry_start_time: combineDateAndTime(derived.dry_start_date, derived.dry_start_time),
    dry_duration_min: step.dry_duration_min || null,
    dry_end_time: combineDateAndTime(derived.dry_end_date, derived.dry_end_time),
    dry_rpm: step.dry_rpm || null,
    wet_mixing_id: step.wet_mixing_id || null,
    wet_start_time: combineDateAndTime(derived.wet_start_date, derived.wet_start_time),
    wet_duration_min: step.wet_duration_min || null,
    wet_end_time: combineDateAndTime(derived.wet_end_date, derived.wet_end_time),
    wet_rpm: step.wet_rpm || null,
    viscosity_cP: step.viscosity_cP || null
  };
  
  const res = await fetch(
    `/api/tapes/${state.selection.currentTapeId}/steps/by-code/mixing`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );
  
  if (!res.ok) {
    await throwResponseError(res, 'Ошибка сохранения этапа перемешивания');
  }
  
  markSavedSnapshot('mixing');
  refreshDirtyFromSnapshots();
  showInlineStatus('1-mixing-save-btn', 'Изменения сохранены');
}, 'Ошибка сохранения этапа перемешивания'));

// -------- II.1. Save coating --------

function getSelectedCoatingMethod() {
  const selectedId = String(state.workflow.coating.coating_id || '');
  if (!selectedId) return null;
  return state.reference.coatingMethods.find(
    (method) => String(method.coating_id) === selectedId
  ) || null;
}

function getDefaultCoatingSidednessForMethod(method) {
  const raw = `${method?.name || ''} ${method?.comments || ''}`.toLowerCase();
  if (raw.includes('dr_blade') || raw.includes('dr. blade') || raw.includes('ракель')) {
    return 'one_sided';
  }
  if (raw.includes('coater_machine') || raw.includes('машина для намазки')) {
    return 'two_sided';
  }
  return '';
}

function applyCoatingMethodDefaultsToState({ force = false } = {}) {
  const method = getSelectedCoatingMethod();

  if (!method) {
    return;
  }

  const step = state.workflow.coating;
  const patch = {};

  if (force || !String(step.gap_um || '').trim()) {
    patch.gap_um = method.gap_um ?? '';
  }
  if (force || !String(step.coat_time_min || '').trim()) {
    patch.coat_time_min = method.coat_time_min ?? '10';
  }
  const defaultSidedness = getDefaultCoatingSidednessForMethod(method);
  if (
    defaultSidedness &&
    (state.ui.coating.sidednessAuto || !String(step.coating_sidedness || '').trim())
  ) {
    patch.coating_sidedness = defaultSidedness;
  }
  const nextSidedness = patch.coating_sidedness || step.coating_sidedness;
  const nextGap = patch.gap_um || step.gap_um;
  const currentSide2 = String(step.gap_um_side2 || '').trim();
  const side2LooksAuto =
    !currentSide2 ||
    currentSide2 === String(step.gap_um || '').trim() ||
    currentSide2 === String(method.gap_um || '').trim();
  if (nextSidedness === 'two_sided' && side2LooksAuto) {
    patch.gap_um_side2 = nextGap || method.gap_um || '';
  }
  if (Object.keys(patch).length > 0) {
    setWorkflowStep('coating', {
      ...step,
      ...patch
    });
  }

  applyDryingTapePrefillFromCoating({
    forceOperator: true,
    forceTiming: true,
    forceDefaults: force
  });
}

document.getElementById('2-coating-save-btn').onclick = () => trackPendingSave(withInlineSaveStatus('2-coating-save-btn', async () => {
  
  const tapeId = state.selection.currentTapeId;
  if (!tapeId) {
    showInlineStatus('2-coating-save-btn', 'Сначала создайте ленту', true);
    return;
  }

  const step = state.workflow.coating;
  const gapValue = step.gap_um;
  const gapSide2Value = step.gap_um_side2;
  const isTwoSided = step.coating_sidedness === 'two_sided';
  
  if (!gapValue || !Number.isFinite(Number(gapValue)) || Number(gapValue) <= 0) {
    showInlineStatus('2-coating-save-btn', 'Укажите зазор, мкм', true);
    return;
  }
  if (
    isTwoSided &&
    (!gapSide2Value || !Number.isFinite(Number(gapSide2Value)) || Number(gapSide2Value) <= 0)
  ) {
    showInlineStatus('2-coating-save-btn', 'Укажите зазор стороны 2, мкм', true);
    return;
  }
  
  const payload = {
    performed_by: step.performed_by || null,
    started_at: combineDateAndTime(step.date, step.time),
    comments: step.comments || null,
    foil_id: step.foil_id || null,
    coating_id: step.coating_id || null,
    coating_sidedness: step.coating_sidedness || null,
    gap_um: gapValue,
    gap_um_side2: isTwoSided ? gapSide2Value : null,
    coat_temp_c: null,
    coat_time_min: step.coat_time_min || null,
    method_comments: step.method_comments || null
  };
  
  const res = await fetch(`/api/tapes/${tapeId}/steps/by-code/coating`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) {
    await throwResponseError(res, 'Ошибка сохранения этапа нанесения');
  }
  
  let autoDryingError = null;
  try {
    await autoSaveDryingTapeFromCoating();
  } catch (err) {
    autoDryingError = err;
  }

  markSavedSnapshot('coating');
  refreshDirtyFromSnapshots();

  if (autoDryingError) {
    showInlineStatus('2-coating-save-btn', 'Нанесение сохранено, но автосушка не сохранилась', true);
    return;
  }

  showInlineStatus(
    '2-coating-save-btn',
    'Нанесение и параметры сушки сохранены'
  );
}, 'Ошибка сохранения этапа нанесения'));

document
.getElementById('2-coating-coating_id')
.addEventListener('change', () => {
  if (!String(state.workflow.coating.coating_sidedness || '').trim()) {
    state.ui.coating.sidednessAuto = true;
  }
  applyCoatingMethodDefaultsToState({ force: true });
  renderCoatingStep();
});

document
.getElementById('2-coating-sidedness')
.addEventListener('change', () => {
  if (state.form.isRestoringTape) return;
  state.ui.coating.sidednessAuto = false;
  const step = state.workflow.coating;
  if (step.coating_sidedness === 'two_sided' && !String(step.gap_um_side2 || '').trim()) {
    setWorkflowStep('coating', {
      ...step,
      gap_um_side2: step.gap_um || ''
    });
  }
  applyDryingTapePrefillFromCoating({ forceDefaults: true });
  renderCoatingStep();
});

document.getElementById('2-coating-date').addEventListener('change', () => {
  applyDryingTapePrefillFromCoating({ forceTiming: true });
});

document.getElementById('2-coating-time').addEventListener('change', () => {
  applyDryingTapePrefillFromCoating({ forceTiming: true });
});

document.getElementById('2-coating-operator').addEventListener('change', () => {
  applyDryingTapePrefillFromCoating({ forceOperator: true });
});

// -------- II.2. Save calendering --------

function buildCalAppearance() {
  const values = [];
  const step = state.workflow.calendering;
  
  if (step.shine) values.push('Блеск');
  if (step.curl) values.push('Закрутка');
  if (step.dots) values.push('Точечки');
  if (step.other_check) {
    const other = String(step.other_text || '').trim();
    if (other) values.push('Другое: ' + other);
  }
  
  return values.join('; ');
}

document.getElementById('2-calendering-save-btn').onclick = () => trackPendingSave(withInlineSaveStatus('2-calendering-save-btn', async () => {
  
  const tapeId = state.selection.currentTapeId;
  const step = state.workflow.calendering;

  if (!tapeId) {
    showInlineStatus('2-calendering-save-btn', 'Сначала создайте ленту', true);
    return;
  }
  
  const payload = {
    
    performed_by: step.performed_by || null,
    started_at: combineDateAndTime(step.date, step.time),
    comments: step.comments || null,
    temp_c: step.temp_c || null,
    pressure_value: step.pressure_value || null,
    pressure_units: step.pressure_units || null,
    draw_speed_m_min: step.draw_speed_m_min || null,
    init_thickness_microns: step.init_thickness_microns || null,
    final_thickness_microns: step.final_thickness_microns || null,
    no_passes: step.no_passes || null,
    other_params: step.other_params || null,
    
    appearance: buildCalAppearance()
  };
  
  const res = await fetch(
    `/api/tapes/${tapeId}/steps/by-code/calendering`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );
  
  if (!res.ok) {
    await throwResponseError(res, 'Ошибка сохранения этапа каландрирования');
  }
  
  await res.json().catch(() => null);
  markSavedSnapshot('calendering');
  refreshDirtyFromSnapshots();
  showInlineStatus('2-calendering-save-btn', 'Изменения сохранены');
}, 'Ошибка сохранения этапа каландрирования'));

document.getElementById('2-cal-other-check').addEventListener('change', e => {
  document.getElementById('2-cal-other-text').disabled = !e.target.checked;
});

document.getElementById('2c-dry-box-save-btn').addEventListener('click', () => trackPendingSave(withInlineSaveStatus('2c-dry-box-save-btn', async () => {
  if (!state.selection.currentTapeId) {
    showInlineStatus('2c-dry-box-save-btn', 'Сначала создайте ленту', true);
    return;
  }

  try {
    const nextState = await saveTapeDryBoxState(
      state.selection.currentTapeId,
      buildMaintenanceDryBoxPayload()
    );
    applyDryBoxStateToUi(nextState);
    await loadTapes();
    showInlineStatus('2c-dry-box-save-btn', 'Параметры сушки сохранены');
  } catch (err) {
    showInlineStatus('2c-dry-box-save-btn', formatSaveError(err, 'Ошибка сохранения параметров сушки'), true);
  }
}, 'Ошибка сохранения параметров сушки')));

document.getElementById('2c-dry-box-remove-btn').addEventListener('click', () => trackPendingSave(withInlineSaveStatus('2c-dry-box-remove-btn', async () => {
  if (!state.selection.currentTapeId) {
    showInlineStatus('2c-dry-box-remove-btn', 'Сначала создайте ленту', true);
    return;
  }

  try {
    const nextState = await removeTapeFromDryBoxNow(state.selection.currentTapeId, {});
    applyDryBoxStateToUi(nextState);
    await loadTapes();
    showInlineStatus('2c-dry-box-remove-btn', 'Лента отмечена как вынутая из шкафа');
  } catch (err) {
    showInlineStatus('2c-dry-box-remove-btn', formatSaveError(err, 'Ошибка изменения статуса ленты'), true);
  }
}, 'Ошибка изменения статуса ленты')));

document.getElementById('2c-dry-box-return-btn').addEventListener('click', () => trackPendingSave(withInlineSaveStatus('2c-dry-box-return-btn', async () => {
  if (!state.selection.currentTapeId) {
    showInlineStatus('2c-dry-box-return-btn', 'Сначала создайте ленту', true);
    return;
  }

  try {
    const nextState = await returnTapeToDryBoxNow(
      state.selection.currentTapeId,
      buildMaintenanceDryBoxPayload()
    );
    applyDryBoxStateToUi(nextState);
    await loadTapes();
    showInlineStatus('2c-dry-box-return-btn', 'Лента возвращена в шкаф');
  } catch (err) {
    showInlineStatus('2c-dry-box-return-btn', formatSaveError(err, 'Ошибка возврата ленты в шкаф'), true);
  }
}, 'Ошибка возврата ленты в шкаф')));

document.getElementById('2c-dry-box-deplete-btn').addEventListener('click', () => trackPendingSave(withInlineSaveStatus('2c-dry-box-deplete-btn', async () => {
  if (!state.selection.currentTapeId) {
    showInlineStatus('2c-dry-box-deplete-btn', 'Сначала создайте ленту', true);
    return;
  }

  try {
    const nextState = await markTapeDepleted(state.selection.currentTapeId, {});
    applyDryBoxStateToUi(nextState);
    await loadTapes();
    showInlineStatus('2c-dry-box-deplete-btn', 'Лента отмечена как израсходованная');
  } catch (err) {
    showInlineStatus('2c-dry-box-deplete-btn', formatSaveError(err, 'Ошибка списания ленты'), true);
  }
}, 'Ошибка списания ленты')));

// ---- NOW buttons (scoped to their own fieldset) ----
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.date-time-now-button');
  if (!btn) return;
  
  let dateInput = null;
  let timeInput = null;

  if (btn.dataset.dateTarget) {
    dateInput = document.getElementById(btn.dataset.dateTarget);
  }
  if (btn.dataset.timeTarget) {
    timeInput = document.getElementById(btn.dataset.timeTarget);
  }

  if (!dateInput || !timeInput) {
    const scope = btn.closest('.mix-params') || btn.closest('fieldset');
    if (!scope) return;
    dateInput = dateInput || scope.querySelector('input[type="date"]');
    timeInput = timeInput || scope.querySelector('input[type="time"]');
  }
  
  const now = new Date();
  
  if (dateInput) {
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }
  
  if (timeInput) {
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    timeInput.value = `${hh}:${min}`;
  }

  const nowDateValue = dateInput?.value || '';
  const nowTimeValue = timeInput?.value || '';

  const workflowNowFieldMap = {
    '0-drying_am-now-button': ['drying_am', 'date', 'time'],
    '1-weighing-now-button': ['weighing', 'date', 'time'],
    '1-mixing-now-button': ['mixing', 'started_at_date', 'started_at_time'],
    '2-coating-now-button': ['coating', 'date', 'time'],
    '2-calendering-now-button': ['calendering', 'date', 'time'],
    '2b-drying_pressed_tape-now-button': ['drying_pressed_tape', 'date', 'time'],
    '2c-dry-box-start-now-button': ['maintenance_dry_box', 'started_at_date', 'started_at_time']
  };

  const mappedFields = workflowNowFieldMap[btn.id];
  if (mappedFields && nowDateValue && nowTimeValue) {
    const [stepKey, dateField, timeField] = mappedFields;
    setWorkflowStep(stepKey, {
      ...state.workflow[stepKey],
      [dateField]: nowDateValue,
      [timeField]: nowTimeValue
    });
  }

  if (dateInput) dateInput.dispatchEvent(new Event('input', { bubbles: true }));
  if (timeInput) timeInput.dispatchEvent(new Event('input', { bubbles: true }));

  if (btn.id === '0-drying_am-now-button') {
    syncDryingEndTime('drying_am');
    return;
  }

  if (btn.id === '2b-drying_pressed_tape-now-button') {
    syncDryingEndTime('drying_pressed_tape');
    return;
  }

  if (btn.id === '1-mixing-now-button') {
    syncMixingEndTime('dry');
  }
});

[
  ['0-drying_am', 'drying_am'],
  ['2b-drying_pressed_tape', 'drying_pressed_tape']
].forEach(([prefix, stepKey]) => {
  ['date', 'time', 'target-duration'].forEach((suffix) => {
    const el = document.getElementById(`${prefix}-${suffix}`);
    if (!el) return;
    el.addEventListener('input', () => syncDryingEndTime(stepKey));
    el.addEventListener('change', () => syncDryingEndTime(stepKey));
  });
});

[
  '2-coating-dry-temp',
  '2-coating-dry-atmosphere',
  '2-coating-dry-duration',
  '2-coating-dry-speed'
].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  if (id !== '2-coating-dry-duration') return;
  el.addEventListener('input', () => syncDryingEndTime('drying_tape'));
  el.addEventListener('change', () => syncDryingEndTime('drying_tape'));
});

[
  ['1-mixing-started_at-date', 'dry'],
  ['1-mixing-started_at-time', 'dry'],
  ['dry-duration-min', 'dry'],
  ['wet-duration-min', 'wet']
].forEach(([id, phase]) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => syncMixingEndTime(phase));
  el.addEventListener('change', () => syncMixingEndTime(phase));
});

// -------- Init --------

hideForm();
resetWorkflowState();
resetSectionState();
attachTopLevelFormStateSync();
attachWorkflowStateSync();
attachSectionStateSync();
window.addEventListener('badb:login', refreshAuditUserDisplay);
resetTopLevelFormState();
renderWorkflowState();
renderPanelState();
markAllSavedSnapshotsCurrent();
refreshDirtyFromSnapshots();
installTapeDebugInspector();
loadTapes();
loadUsers();
loadProjects();
loadRecipesDropdown();

const dryingAtmosphereSelectIds = [
  '0-drying_am-atmosphere',
  '2-coating-dry-atmosphere',
  '2b-drying_pressed_tape-atmosphere',
  '2c-dry-box-atmosphere'
];

dryingAtmosphereSelectIds.forEach(id => {
  loadDryingAtmospheres(
    document.getElementById(id),
    'vacuum'
  ).catch(console.error);
});

loadDryMixingMethods(document.getElementById('1-mixing-dry_mixing_id'))
.then(updateMixParamsVisibility)
.catch(console.error);

loadWetMixingMethods(document.getElementById('1-mixing-wet_mixing_id'))
.then(updateMixParamsVisibility)
.catch(console.error);

loadFoils(document.getElementById('2-coating-foil_id'))
.then(applyDefaultCoatingFoil)
.catch(console.error);

loadCoatingMethods(document.getElementById('2-coating-coating_id'))
.catch(console.error);

updateMixParamsVisibility();

// Mark mixing as dirty on any change inside the mixing fieldset
(() => {
  const fs = document.getElementById('1-mixing');
  if (!fs) return;
  
  fs.addEventListener('input', refreshDirtyFromSnapshots);
  fs.addEventListener('change', refreshDirtyFromSnapshots);
})();

// Mark recipe/materials as dirty on any edit in the actuals table
(() => {
  const tbody = document.getElementById('slurry-actuals-body');
  if (!tbody) return;
  
  const mark = () => {
    if (state.form.isRestoringTape) return; // do not mark dirty during restore
    refreshDirtyFromSnapshots();
  };
  
  tbody.addEventListener('input', mark);
  tbody.addEventListener('change', mark);
})();

// Generic dirty wiring for the remaining step fieldsets
(() => {
  
  const map = {
    '0-drying_am': 'drying_am',
    '1-weighing': 'weighing',
    '2-coating': 'coating',
    '2-drying_tape': 'drying_tape',
    '2-calendering': 'calendering',
    '2-drying_pressed_tape': 'drying_pressed_tape'
  };
  
  Object.entries(map).forEach(([elementId, stepCode]) => {
    
    const el = document.getElementById(elementId);
    if (!el) return;
    
    const mark = () => {
      if (state.form.isRestoringTape) return;
      refreshDirtyFromSnapshots();
    };
    
    el.addEventListener('input', mark);
    el.addEventListener('change', mark);
    
  });
  
})();
