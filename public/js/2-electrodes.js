    const roleSelect = document.getElementById('electrode-role');
    const tapeSelect = document.getElementById('electrodes-tape_id');
    const projectSelect = document.getElementById('electrodes-project_id');
    const batchFilterTextInput = document.getElementById('electrode-batch-filter-text');
    const batchFilterSidednessSelect = document.getElementById('electrode-batch-filter-sidedness');
    const batchFilterFormFactorSelect = document.getElementById('electrode-batch-filter-form-factor');
    const clearElectrodeBatchFiltersBtn = document.getElementById('clearElectrodeBatchFiltersBtn');
    const batchFilterSummary = document.getElementById('electrode-batch-filter-summary');
    const filterPanel = document.getElementById('choose-tape');
    const workflow = document.getElementById('cutting-workflow');
    const addCutBatchBtn = document.getElementById('add-cut-batch-btn');
    const workspace = document.getElementById('electrode-workspace');
    const allCutBatchesList = document.getElementById('all-cut-batches-list');
    const batchTitle = document.getElementById('batch-title');
    const electrodeStickyHeader = document.getElementById('electrode_sticky_header');
    const electrodeStickyLabel = document.getElementById('electrode_sticky_label');
    const electrodeStickyMeta = document.getElementById('electrode_sticky_meta');
    const electrodeGlobalDirty = document.getElementById('electrode-global-dirty');
    const printElectrodeBatchBtn = document.getElementById('printElectrodeBatchBtn');
    const deleteElectrodeBatchBtn = document.getElementById('deleteElectrodeBatchBtn');
    const batchProjectMultiSelect = document.getElementById('electrode-batch-project-multiselect');
    const batchProjectMultiSelectTrigger = document.getElementById('electrode-batch-project-multiselect-trigger');
    const batchProjectMultiSelectOptions = document.getElementById('electrode-batch-project-multiselect-options');

    function getDefaultElectrodeFiltersState() {
      return {
        text: null,
        role: null,
        tape_id: null,
        project_id: null,
        sidedness: null,
        target_form_factor: null,
        created_by: null
      };
    }

    function getDefaultCutBatchFormState() {
      return {
        comments: null,
        target_form_factor: null,
        target_config_code: null,
        target_config_other: null,
        project_ids: [],
        shape: null,
        diameter_mm: null,
        length_mm: null,
        width_mm: null,
        area: null
      };
    }

    function getDefaultElectrodeDryingState() {
      return {
        start_date: null,
        start_time: null,
        end_date: null,
        end_time: null,
        temperature_c: null,
        other_parameters: null,
        comments: null
      };
    }

    function getDefaultElectrodePageState() {
      return {
        selection: {
          currentCutBatchId: null,
          isCreatingCutBatch: false,
          currentTapeDryBoxState: null,
          currentCutBatchDetails: null
        },
        reference: {
          tapes: [],
          allCutBatches: [],
          projects: [],
          users: []
        },
        lists: {
          cutBatches: [],
          electrodes: []
        },
        form: {
          filters: getDefaultElectrodeFiltersState(),
          batch: getDefaultCutBatchFormState(),
          drying: getDefaultElectrodeDryingState()
        },
        drafts: {
          foilMasses: [],
          electrodes: []
        },
        ui: {
          savedSectionSnapshots: {},
          dirtySections: {},
          tableColumnVisibility: getDefaultElectrodeTableColumnVisibility(),
          filtersBeforeWorkspace: null
        }
      };
    }

    function getDefaultElectrodeTableColumnVisibility() {
      return {
        number: true,
        coating_mass: false,
        active_mass_theoretical: false,
        active_mass_actual: false,
        capacity_theoretical: false,
        capacity_actual: true,
        areal_capacity_theoretical: false,
        areal_capacity_actual: false,
        capacity_per_side_actual: false,
        cup: false,
        comments: false,
        status: true
      };
    }

    const state = getDefaultElectrodePageState();
    const ELECTRODE_SECTION_KEYS = ['batch', 'foilMasses', 'electrodeDrafts', 'drying'];
    const ELECTRODE_DIRTY_MARKER_IDS = {
      batch: 'dirty-electrode-batch',
      foilMasses: 'dirty-electrode-foil-masses',
      electrodeDrafts: 'dirty-electrode-masses',
      drying: 'dirty-electrode-drying'
    };

    function getElectrodeDebugSnapshot() {
      return cloneElectrodeSnapshot({
        selection: state.selection,
        reference: state.reference,
        lists: state.lists,
        form: state.form,
        drafts: state.drafts,
        ui: state.ui
      });
    }

    function setCurrentCutBatchId(cutBatchId) {
      state.selection.currentCutBatchId = cutBatchId ?? null;
      if (cutBatchId != null) {
        state.selection.isCreatingCutBatch = false;
      }
    }

    function setCutBatchCreationMode(isCreating) {
      state.selection.isCreatingCutBatch = Boolean(isCreating);
    }

    function hasActiveElectrodeWorkspace() {
      return Boolean(state.selection.currentCutBatchId || state.selection.isCreatingCutBatch);
    }

    function rememberElectrodeFiltersBeforeWorkspace() {
      if (state.ui.filtersBeforeWorkspace) return;
      state.ui.filtersBeforeWorkspace = {
        ...getDefaultElectrodeFiltersState(),
        ...state.form.filters
      };
    }

    function restoreElectrodeFiltersAfterWorkspace() {
      if (!state.ui.filtersBeforeWorkspace) return;
      setElectrodeFiltersState(state.ui.filtersBeforeWorkspace);
      state.ui.filtersBeforeWorkspace = null;
    }

    function setCurrentTapeDryBoxState(nextState) {
      state.selection.currentTapeDryBoxState = nextState || null;
    }

    function setCurrentCutBatchDetails(nextDetails) {
      state.selection.currentCutBatchDetails = nextDetails || null;
    }

    function setReferenceTapes(nextTapes) {
      state.reference.tapes = Array.isArray(nextTapes) ? nextTapes : [];
    }

    function setAllCutBatches(nextBatches) {
      state.reference.allCutBatches = Array.isArray(nextBatches) ? nextBatches : [];
    }

    function setCurrentTapeCutBatches(nextBatches) {
      state.lists.cutBatches = Array.isArray(nextBatches) ? nextBatches : [];
    }

    function setCurrentBatchElectrodes(nextElectrodes) {
      state.lists.electrodes = Array.isArray(nextElectrodes) ? nextElectrodes : [];
    }

    function setReferenceProjects(nextProjects) {
      state.reference.projects = Array.isArray(nextProjects) ? nextProjects : [];
    }

    function setReferenceUsers(nextUsers) {
      state.reference.users = Array.isArray(nextUsers) ? nextUsers : [];
    }

    function setElectrodeFiltersState(nextFilters) {
      state.form.filters = {
        ...getDefaultElectrodeFiltersState(),
        ...(nextFilters || {})
      };
    }

    function setCutBatchFormState(nextBatchForm) {
      state.form.batch = {
        ...getDefaultCutBatchFormState(),
        ...(nextBatchForm || {})
      };
    }

    function setElectrodeDryingState(nextDrying) {
      state.form.drying = {
        ...getDefaultElectrodeDryingState(),
        ...(nextDrying || {})
      };
    }

    function setFoilMassDraftState(nextFoilMasses) {
      state.drafts.foilMasses = Array.isArray(nextFoilMasses) ? nextFoilMasses : [];
    }

    function setElectrodeDraftRowsState(nextDraftRows) {
      state.drafts.electrodes = Array.isArray(nextDraftRows) ? nextDraftRows : [];
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

    function getBatchProjectIds(batch) {
      if (Array.isArray(batch?.project_ids) && batch.project_ids.length) {
        return normalizeProjectIds(batch.project_ids);
      }
      return normalizeProjectIds(batch?.project_id || '');
    }

    function getSelectedTape() {
      return state.reference.tapes.find(
        tape => String(tape.tape_id) === String(state.form.filters.tape_id || '')
      ) || null;
    }

    function getDefaultBatchProjectIds() {
      const tapeProjectIds = getTapeProjectIds(getSelectedTape());
      if (tapeProjectIds.length) return tapeProjectIds;
      return normalizeProjectIds(state.form.filters.project_id || '');
    }

    function getBatchProjectOptions() {
      const allowedProjectIds = new Set(getTapeProjectIds(getSelectedTape()));
      if (!allowedProjectIds.size) return [];
      return state.reference.projects.filter((project) =>
        allowedProjectIds.has(String(project.project_id))
      );
    }

    function setBatchProjectIds(projectIds, { render = true } = {}) {
      setCutBatchFormState({
        ...state.form.batch,
        project_ids: normalizeProjectIds(projectIds)
      });

      if (render) {
        renderBatchProjectMultiSelect();
      }
    }

    function cloneElectrodeSnapshot(value) {
      return JSON.parse(JSON.stringify(value));
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

    function getCurrentElectrodeSectionSnapshot(sectionKey) {
      switch (sectionKey) {
        case 'filters':
          return cloneElectrodeSnapshot(state.form.filters);
        case 'batch':
          return cloneElectrodeSnapshot(state.form.batch);
        case 'drying':
          return cloneElectrodeSnapshot(state.form.drying);
        case 'foilMasses':
          return cloneElectrodeSnapshot(state.drafts.foilMasses);
        case 'electrodeDrafts':
          return cloneElectrodeSnapshot(state.drafts.electrodes);
        default:
          return null;
      }
    }

    function getAllCurrentElectrodeSectionSnapshots() {
      return Object.fromEntries(
        ELECTRODE_SECTION_KEYS.map(sectionKey => [
          sectionKey,
          getCurrentElectrodeSectionSnapshot(sectionKey)
        ])
      );
    }

    function isElectrodeSectionDirty(sectionKey) {
      return JSON.stringify(getCurrentElectrodeSectionSnapshot(sectionKey))
        !== JSON.stringify(state.ui.savedSectionSnapshots[sectionKey] ?? null);
    }

    function setElectrodeDirtySections(nextDirtySections) {
      state.ui.dirtySections = Object.fromEntries(
        ELECTRODE_SECTION_KEYS.map(sectionKey => [
          sectionKey,
          Boolean(nextDirtySections?.[sectionKey])
        ])
      );
    }

    function setElectrodeTableColumnVisibility(nextVisibility) {
      state.ui.tableColumnVisibility = {
        ...getDefaultElectrodeTableColumnVisibility(),
        ...(nextVisibility || {})
      };
    }

    function renderElectrodeDirtyMarkers() {
      Object.entries(ELECTRODE_DIRTY_MARKER_IDS).forEach(([sectionKey, elementId]) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.style.display = state.ui.dirtySections?.[sectionKey] ? 'inline' : 'none';
      });
      renderElectrodeStickyHeader();
    }

    function markElectrodeSectionSaved(sectionKey) {
      state.ui.savedSectionSnapshots[sectionKey] =
        getCurrentElectrodeSectionSnapshot(sectionKey);
    }

    function markAllElectrodeSectionsSaved() {
      state.ui.savedSectionSnapshots = getAllCurrentElectrodeSectionSnapshots();
      setElectrodeDirtySections({});
      renderElectrodeDirtyMarkers();
    }

    function refreshElectrodeDirtyState() {
      setElectrodeDirtySections(
        Object.fromEntries(
          ELECTRODE_SECTION_KEYS.map(sectionKey => [
            sectionKey,
            isElectrodeSectionDirty(sectionKey)
          ])
        )
      );
      renderElectrodeDirtyMarkers();
    }

    function getElectrodeDraftRowsFromDom() {
      return Array.from(document.querySelectorAll('#electrodes-body tr'))
        .filter(row => !row.dataset.electrodeId)
        .map(row => ({
          electrode_mass_g: row.dataset.mass || null,
          cup_number: row.dataset.cup || null,
          comments: row.dataset.comments || null
        }));
    }

    function getFoilMassDraftsFromDom() {
      return Array.from(document.querySelectorAll('.foil-mass-value'))
        .map(input => input.value || null);
    }

    function syncElectrodeFiltersStateFromDom() {
      setElectrodeFiltersState({
        text: batchFilterTextInput?.value || null,
        role: roleSelect.value || null,
        tape_id: tapeSelect.value || null,
        project_id: projectSelect.value || null,
        sidedness: batchFilterSidednessSelect?.value || null,
        target_form_factor: batchFilterFormFactorSelect?.value || null,
        created_by: document.getElementById('electrodes-created_by').value || null
      });
    }

    function syncCutBatchFormStateFromDom() {
      setCutBatchFormState({
        comments: document.getElementById('electrodes-comments').value || null,
        target_form_factor: document.getElementById('electrodes-target_form_factor').value || null,
        target_config_code: document.getElementById('electrodes-target_config_code').value || null,
        target_config_other: document.getElementById('electrodes-target_config_other').value || null,
        project_ids: state.form.batch.project_ids || [],
        shape: document.querySelector('input[name="electrodes-shape"]:checked')?.value || null,
        diameter_mm: document.getElementById('electrodes-diameter').value || null,
        length_mm: document.getElementById('electrodes-length').value || null,
        width_mm: document.getElementById('electrodes-width').value || null,
        area: document.getElementById('electrodes-area').textContent || null
      });
    }

    function syncElectrodeDryingStateFromDom() {
      setElectrodeDryingState({
        start_date: document.getElementById('electrodes-drying-start-date').value || null,
        start_time: document.getElementById('electrodes-drying-start-time').value || null,
        end_date: document.getElementById('electrodes-drying-end-date').value || null,
        end_time: document.getElementById('electrodes-drying-end-time').value || null,
        temperature_c: document.getElementById('electrodes-drying-temperature').value || null,
        other_parameters: document.getElementById('electrodes-drying-other-parameters').value || null,
        comments: document.getElementById('electrodes-drying-comments').value || null
      });
    }

    function syncElectrodeDraftStateFromDom() {
      setFoilMassDraftState(getFoilMassDraftsFromDom());
      setElectrodeDraftRowsState(getElectrodeDraftRowsFromDom());
    }

    function refreshElectrodeDraftDirtyStateFromDom() {
      syncElectrodeDraftStateFromDom();
      refreshElectrodeDirtyState();
    }

    function syncElectrodePageStateFromDom() {
      syncElectrodeFiltersStateFromDom();
      syncCutBatchFormStateFromDom();
      syncElectrodeDryingStateFromDom();
      syncElectrodeDraftStateFromDom();
      refreshElectrodeDirtyState();
    }

    function renderElectrodeFiltersForm() {
      if (batchFilterTextInput) {
        batchFilterTextInput.value = state.form.filters.text || '';
      }
      roleSelect.value = state.form.filters.role || '';
      tapeSelect.value = state.form.filters.tape_id || '';
      projectSelect.value = state.form.filters.project_id || '';
      if (batchFilterSidednessSelect) {
        batchFilterSidednessSelect.value = state.form.filters.sidedness || '';
      }
      if (batchFilterFormFactorSelect) {
        batchFilterFormFactorSelect.value = state.form.filters.target_form_factor || '';
      }
      document.getElementById('electrodes-created_by').value = state.form.filters.created_by || '';
    }

    function renderElectrodeGeometryForm() {
      const batchForm = state.form.batch;
      const formFactor = batchForm.target_form_factor || '';
      const shape =
        batchForm.shape ||
        (formFactor === 'coin' ? 'circle'
        : formFactor === 'pouch' || formFactor === 'cylindrical' ? 'rectangle'
        : null);

      document.getElementById('electrodes-target_form_factor').value = formFactor;
      populateTargetConfigOptions(formFactor, batchForm.target_config_code || '');
      document.getElementById('electrodes-target_config_code').value = batchForm.target_config_code || '';
      document.getElementById('electrodes-target_config_other').value = batchForm.target_config_other || '';

      setSelectedShape(shape);
      document.getElementById('electrodes-diameter').value = batchForm.diameter_mm ?? '';
      document.getElementById('electrodes-length').value = batchForm.length_mm ?? '';
      document.getElementById('electrodes-width').value = batchForm.width_mm ?? '';

      geomCircle.hidden = shape !== 'circle';
      geomRect.hidden = shape !== 'rectangle';

      renderTargetConfigOtherUi();
      computeElectrodeArea();
    }

    function renderBatchProjectMultiSelect() {
      if (!batchProjectMultiSelectOptions || !batchProjectMultiSelectTrigger) return;

      batchProjectMultiSelectOptions.innerHTML = '';
      const batchProjectOptions = getBatchProjectOptions();

      if (!state.form.filters.tape_id) {
        const empty = document.createElement('div');
        empty.className = 'field-hint';
        empty.textContent = 'Сначала выберите ленту';
        batchProjectMultiSelectOptions.appendChild(empty);
        batchProjectMultiSelectTrigger.textContent = '— выбрать проекты —';
        return;
      }

      if (!batchProjectOptions.length) {
        const empty = document.createElement('div');
        empty.className = 'field-hint';
        empty.textContent = 'У выбранной ленты нет связанных проектов';
        batchProjectMultiSelectOptions.appendChild(empty);
        batchProjectMultiSelectTrigger.textContent = '— нет проектов ленты —';
        return;
      }

      const selectedProjectIds = new Set(normalizeProjectIds(state.form.batch.project_ids));

      batchProjectOptions.forEach((project) => {
        const projectId = String(project.project_id);
        const label = document.createElement('label');
        label.className = 'multi-select-option';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = projectId;
        checkbox.checked = selectedProjectIds.has(projectId);

        checkbox.addEventListener('change', () => {
          const nextProjectIds = Array.from(
            batchProjectMultiSelectOptions.querySelectorAll('input[type="checkbox"]:checked')
          ).map((input) => input.value);
          setBatchProjectIds(nextProjectIds);
          refreshElectrodeDirtyState();
        });

        const text = document.createElement('span');
        text.textContent = project.name;

        label.appendChild(checkbox);
        label.appendChild(text);
        batchProjectMultiSelectOptions.appendChild(label);
      });

      updateBatchProjectMultiSelectLabel();
    }

    function updateBatchProjectMultiSelectLabel() {
      if (!batchProjectMultiSelectTrigger || !batchProjectMultiSelectOptions) return;

      const selectedProjectIds = new Set(normalizeProjectIds(state.form.batch.project_ids));
      const selectedNames = getBatchProjectOptions()
        .filter((project) => selectedProjectIds.has(String(project.project_id)))
        .map((project) => project.name);

      batchProjectMultiSelectTrigger.textContent = selectedNames.length
        ? selectedNames.join(', ')
        : '— выбрать проекты —';

      batchProjectMultiSelectOptions
        .querySelectorAll('input[type="checkbox"]')
        .forEach((input) => {
          input.checked = selectedProjectIds.has(input.value);
        });
    }

    function setBatchProjectMultiSelectOpen(isOpen) {
      if (!batchProjectMultiSelectOptions || !batchProjectMultiSelectTrigger) return;
      batchProjectMultiSelectOptions.hidden = !isOpen;
      batchProjectMultiSelectTrigger.setAttribute('aria-expanded', String(Boolean(isOpen)));
    }

    function toggleBatchProjectMultiSelect() {
      setBatchProjectMultiSelectOpen(batchProjectMultiSelectOptions?.hidden !== false);
    }

    function renderCutBatchForm() {
      document.getElementById('electrodes-comments').value = state.form.batch.comments || '';
      renderBatchProjectMultiSelect();
      renderElectrodeGeometryForm();
    }

    function renderElectrodeDryingForm() {
      dryingStartDate.value = state.form.drying.start_date || '';
      dryingStartTime.value = state.form.drying.start_time || '';
      dryingEndDate.value = state.form.drying.end_date || '';
      dryingEndTime.value = state.form.drying.end_time || '';
      dryingTemp.value = state.form.drying.temperature_c || '';
      dryingOther.value = state.form.drying.other_parameters || '';
      dryingComments.value = state.form.drying.comments || '';
    }

    function renderFoilMassDrafts() {
      foilMassBody.innerHTML = '';
      foilMassInput.value = '';

      if (!state.drafts.foilMasses.length) {
        appendFoilMassRow();
        return;
      }

      state.drafts.foilMasses.forEach(value => {
        appendFoilMassRow(value || '');
      });

      recalculateFoilMassAverage();
    }

    function renderElectrodeDraftRows() {
      electrodesBody.innerHTML = '';

      if (!state.drafts.electrodes.length) {
        appendElectrodeRow();
        return;
      }

      state.drafts.electrodes.forEach(row => {
        appendElectrodeRow(row);
      });
    }

    function renderElectrodeTableFromState() {
      if (!state.selection.currentCutBatchId) {
        renderElectrodeDraftRows();
        return;
      }

      renderElectrodes(state.lists.electrodes);

      if (!state.drafts.electrodes.length) {
        return;
      }

      state.drafts.electrodes.forEach(row => {
        appendElectrodeRow(row);
      });
    }

    function renderElectrodeWorkspace() {
      renderCutBatchForm();
      renderElectrodeDryingForm();
      renderFoilMassDrafts();
      renderElectrodeCapacitySummary();
      renderElectrodeColumnControls();
      renderElectrodeTableFromState();
      applyElectrodeColumnVisibility();
      renderTapeDryBoxActions();
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function formatDerivedNumber(value, digits = 4, suffix = '') {
      const num = Number(value);
      if (!Number.isFinite(num)) return '—';
      return `${num.toFixed(digits)}${suffix}`;
    }

    function formatFractionPercent(value, digits = 2) {
      const num = Number(value);
      if (!Number.isFinite(num)) return '—';
      return `${(num * 100).toFixed(digits)} %`;
    }

    function renderCapacitySummaryItem({ label, title, primary, secondary }) {
      return `
        <div class="electrode-capacity-item">
          <span class="electrode-capacity-label" title="${escapeHtml(title || '')}">${escapeHtml(label)}</span>
          <span class="electrode-capacity-primary">${escapeHtml(primary ?? '—')}</span>
          <span class="electrode-capacity-secondary">${escapeHtml(secondary ?? '—')}</span>
        </div>
      `;
    }

    function renderElectrodeCapacitySummary() {
      const root = document.getElementById('electrode-capacity-summary');
      if (!root) return;

      const summary = state.selection.currentCutBatchDetails?.capacity_summary;
      if (!summary) {
        root.hidden = true;
        root.innerHTML = '';
        return;
      }

      const actualFractionSecondary =
        summary.actual_fraction_status === 'complete'
          ? `Факт.: ${formatFractionPercent(summary.active_fraction_actual, 2)}`
          : 'Факт.: недоступно';

      root.innerHTML = `
        <div class="electrode-capacity-grid">
          ${renderCapacitySummaryItem({
            label: 'Активный материал',
            title: 'Материал, по которому определяется активная фаза электрода.',
            primary: summary.active_material_name || '—',
            secondary: summary.coating_sidedness ? `Тип покрытия: ${formatElectrodeSidednessLabel(summary.coating_sidedness)}` : '—'
          })}
          ${renderCapacitySummaryItem({
            label: 'Удельная ёмкость материала',
            title: 'Справочное значение из свойств материала.',
            primary: formatDerivedNumber(summary.specific_capacity_mAh_g, 2, ' мАч/г'),
            secondary: 'Для теор. и факт. ветки используется одно и то же значение'
          })}
          ${renderCapacitySummaryItem({
            label: 'Доля активного вещества',
            title: 'Теоретическая — из состава рецепта. Фактическая — из сохранённых фактических масс твёрдых компонентов.',
            primary: `Теор.: ${formatFractionPercent(summary.active_fraction_theoretical, 2)}`,
            secondary: actualFractionSecondary
          })}
          ${renderCapacitySummaryItem({
            label: 'Средняя масса фольги',
            title: 'Среднее по измерениям фольги в текущей партии.',
            primary: formatDerivedNumber(summary.average_foil_mass_g, 4, ' г'),
            secondary: summary.foil_measurement_count ? `${summary.foil_measurement_count} изм.` : '—'
          })}
          ${renderCapacitySummaryItem({
            label: 'Площадь электрода',
            title: 'Используется для расчёта удельной ёмкости по площади.',
            primary: formatDerivedNumber(summary.electrode_area_cm2, 3, ' см²'),
            secondary: formatDerivedNumber(summary.electrode_area_mm2, 2, ' мм²')
          })}
          ${renderCapacitySummaryItem({
            label: 'Средняя масса покрытия',
            title: 'Средняя масса покрытия по нескрапнутым электродам.',
            primary: formatDerivedNumber(summary.average_coating_mass_g, 4, ' г'),
            secondary: '—'
          })}
          ${renderCapacitySummaryItem({
            label: 'Средняя масса активного материала',
            title: 'Теоретическая — по рецепту. Фактическая — по сохранённым фактическим массам твёрдой фазы.',
            primary: `Теор.: ${formatDerivedNumber(summary.average_active_material_mass_theoretical_g, 4, ' г')}`,
            secondary: `Факт.: ${formatDerivedNumber(summary.average_active_material_mass_actual_g, 4, ' г')}`
          })}
          ${renderCapacitySummaryItem({
            label: 'Средняя ёмкость партии',
            title: 'Среднее только по нескрапнутым электродам с валидной массой.',
            primary: `Теор.: ${formatDerivedNumber(summary.average_capacity_theoretical_mAh, 3, ' мАч')}`,
            secondary: `Факт.: ${formatDerivedNumber(summary.average_capacity_actual_mAh, 3, ' мАч')}`
          })}
          ${renderCapacitySummaryItem({
            label: 'Удельная ёмкость по площади',
            title: 'Средняя ёмкость партии, делённая на площадь электрода.',
            primary: `Теор.: ${formatDerivedNumber(summary.areal_capacity_theoretical_mAh_cm2, 3, ' мАч/см²')}`,
            secondary: `Факт.: ${formatDerivedNumber(summary.areal_capacity_actual_mAh_cm2, 3, ' мАч/см²')}`
          })}
          ${renderCapacitySummaryItem({
            label: 'Ёмкость 1 стороны',
            title: 'Удельная ёмкость по площади, делённая на число сторон покрытия.',
            primary: `Теор.: ${formatDerivedNumber(summary.capacity_per_side_theoretical_mAh_cm2, 3, ' мАч/см²')}`,
            secondary: `Факт.: ${formatDerivedNumber(summary.capacity_per_side_actual_mAh_cm2, 3, ' мАч/см²')}`
          })}
          ${renderCapacitySummaryItem({
            label: 'В расчёте участвовало',
            title: 'Количество нескрапнутых электродов, попавших в средние значения.',
            primary: `${summary.included_electrode_count ?? 0} шт.`,
            secondary: `Теор.: ${summary.included_capacity_theoretical_count ?? 0} | Факт.: ${summary.included_capacity_actual_count ?? 0}`
          })}
        </div>
      `;

      root.hidden = false;
    }

    const ELECTRODE_COLUMN_DEFS = [
      { key: 'number', label: '№' },
      { key: 'coating_mass', label: 'Масса покрытия' },
      { key: 'active_mass_theoretical', label: 'Активная масса (теор.)' },
      { key: 'active_mass_actual', label: 'Активная масса (факт.)' },
      { key: 'capacity_theoretical', label: 'Ёмкость (теор.)' },
      { key: 'capacity_actual', label: 'Ёмкость (факт.)' },
      { key: 'areal_capacity_theoretical', label: 'Ёмкость (теор.), мАч/см²' },
      { key: 'areal_capacity_actual', label: 'Ёмкость (факт.), мАч/см²' },
      { key: 'capacity_per_side_actual', label: 'Ёмкость 1 стороны, мАч/см²' },
      { key: 'cup', label: 'Стаканчик №' },
      { key: 'comments', label: 'Комментарии' },
      { key: 'status', label: 'Статус' }
    ];

    function renderElectrodeColumnControls() {
      const root = document.getElementById('electrode-column-controls');
      if (!root) return;

      if (!state.selection.currentCutBatchId) {
        root.hidden = true;
        root.innerHTML = '';
        return;
      }

      root.innerHTML = '';
      ELECTRODE_COLUMN_DEFS.forEach((column) => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = Boolean(state.ui.tableColumnVisibility[column.key]);
        input.addEventListener('change', () => {
          setElectrodeTableColumnVisibility({
            ...state.ui.tableColumnVisibility,
            [column.key]: input.checked
          });
          applyElectrodeColumnVisibility();
        });
        label.appendChild(input);
        label.appendChild(document.createTextNode(column.label));
        root.appendChild(label);
      });

      root.hidden = false;
    }

    function applyElectrodeColumnVisibility() {
      Object.entries(state.ui.tableColumnVisibility || {}).forEach(([key, visible]) => {
        document.querySelectorAll(`[data-col="${key}"]`).forEach((el) => {
          el.hidden = !visible;
          el.style.display = visible ? '' : 'none';
        });
      });
    }

    function hasEstablishedTapeDryBoxStorage(dryBoxState) {
      return Boolean(dryBoxState?.has_final_dry_box_storage);
    }

    function tapeDryBoxStatusLabel(dryBoxState) {
      if (!dryBoxState) return '';
      const hasEstablishedStorage = hasEstablishedTapeDryBoxStorage(dryBoxState);

      if (dryBoxState.availability_status === 'in_dry_box') {
        return hasEstablishedStorage
          ? 'Лента находится в сушильном шкафу'
          : 'Лента помещена в сушильный шкаф';
      }

      if (dryBoxState.availability_status === 'depleted') {
        return hasEstablishedStorage
          ? 'Лента отмечена как израсходованная'
          : 'Лента списана';
      }

      return 'Лента находится вне сушильного шкафа';
    }

    function tapeDryBoxDetailLabel(dryBoxState) {
      if (!dryBoxState) return '';
      const hasEstablishedStorage = hasEstablishedTapeDryBoxStorage(dryBoxState);

      if (!hasEstablishedStorage) {
        return dryBoxState.availability_status === 'in_dry_box'
          ? 'По записи в системе остаток ленты сохранён в сушильном шкафу.'
          : dryBoxState.availability_status === 'depleted'
            ? 'По записи в системе остаток ленты списан.'
            : 'Эта лента не проходила финальное хранение в сушильном шкафу. После вырезания электродов укажите, что сделать с остатком ленты.';
      }

      return dryBoxState.availability_status === 'in_dry_box'
        ? 'По записи в системе лента уже возвращена в сушильный шкаф.'
        : dryBoxState.availability_status === 'depleted'
          ? 'По записи в системе лента уже отмечена как израсходованная.'
          : 'По записи в системе после последнего вырезания лента ещё не возвращена в сушильный шкаф.';
    }

    function renderTapeDryBoxActions() {
      const fieldset = document.getElementById('electrodes-tape-dry-box');
      const status = document.getElementById('electrodes-tape-dry-box-status');
      const detail = document.getElementById('electrodes-tape-dry-box-detail');
      const returnBtn = document.getElementById('electrodes-return-tape-btn');
      const depleteBtn = document.getElementById('electrodes-deplete-tape-btn');
      const dryBoxState = state.selection.currentTapeDryBoxState;
      const hasBatch = Boolean(state.selection.currentCutBatchId);

      if (!fieldset || !status || !detail || !returnBtn || !depleteBtn) return;

      fieldset.hidden = !hasBatch || !dryBoxState;

      if (!hasBatch || !dryBoxState) {
        status.textContent = '';
        detail.textContent = '';
        returnBtn.disabled = true;
        depleteBtn.disabled = true;
        return;
      }

      const hasEstablishedStorage = hasEstablishedTapeDryBoxStorage(dryBoxState);

      status.textContent = tapeDryBoxStatusLabel(dryBoxState);
      detail.textContent = tapeDryBoxDetailLabel(dryBoxState);
      returnBtn.textContent = hasEstablishedStorage ? 'Вернуть в шкаф сейчас' : 'Поместить в сушильный шкаф';
      depleteBtn.textContent = hasEstablishedStorage ? 'Лента израсходована' : 'Списать ленту';
      returnBtn.disabled = dryBoxState.availability_status !== 'out_of_dry_box';
      depleteBtn.disabled = dryBoxState.availability_status === 'depleted';
    }

    function getElectrodeBatchPrintReportUrl(cutBatchId) {
      return `/workflow/electrode-batch-print.html?cut_batch_id=${encodeURIComponent(cutBatchId)}`;
    }

    function openElectrodeBatchPrintReport(cutBatchId) {
      if (!cutBatchId) return;
      window.open(getElectrodeBatchPrintReportUrl(cutBatchId), '_blank', 'noopener');
    }

    function getCurrentCutBatchRecord() {
      const cutBatchId = state.selection.currentCutBatchId;
      if (!cutBatchId) return null;

      return state.reference.allCutBatches.find(
        batch => String(batch.cut_batch_id) === String(cutBatchId)
      ) || state.lists.cutBatches.find(
        batch => String(batch.cut_batch_id) === String(cutBatchId)
      ) || null;
    }

    function formatElectrodeTapeBatchContext({ batch = null } = {}) {
      const currentBatch = batch || getCurrentCutBatchRecord();
      const selectedTape = getSelectedTape();
      const tapeId = selectedTape?.tape_id || currentBatch?.tape_id || state.form.filters.tape_id || '';
      const tapeName = selectedTape?.name || currentBatch?.tape_name || '';
      const tapeLabel = tapeId
        ? `Лента #${tapeId}${tapeName ? ` | ${tapeName}` : ''}`
        : tapeName
          ? `Лента | ${tapeName}`
          : '';

      const batchId = state.selection.currentCutBatchId || currentBatch?.cut_batch_id || '';

      if (state.selection.isCreatingCutBatch) {
        return tapeLabel ? `${tapeLabel}. Новая партия электродов` : 'Новая партия электродов';
      }

      if (batchId) {
        return tapeLabel
          ? `${tapeLabel}. Текущая партия: #${batchId}`
          : `Текущая партия электродов: #${batchId}`;
      }

      return tapeLabel;
    }

    function getElectrodeProjectNames(projectIds) {
      const ids = new Set(normalizeProjectIds(projectIds));
      if (!ids.size) return '';

      return state.reference.projects
        .filter(project => ids.has(String(project.project_id)))
        .map(project => project.name)
        .join(', ');
    }

    function getElectrodeStickyBatchSnapshot() {
      return {
        ...(getCurrentCutBatchRecord() || {}),
        ...state.form.batch
      };
    }

    function renderElectrodeStickyHeader() {
      if (!electrodeStickyHeader || !electrodeStickyLabel || !electrodeStickyMeta) return;

      const hasActiveWorkspace = Boolean(
        state.selection.currentCutBatchId || state.selection.isCreatingCutBatch
      );
      electrodeStickyHeader.hidden = !hasActiveWorkspace;

      if (!hasActiveWorkspace) return;

      const selectedTape = getSelectedTape();
      const currentBatch = getCurrentCutBatchRecord();
      const batchSnapshot = getElectrodeStickyBatchSnapshot();
      electrodeStickyLabel.textContent = formatElectrodeTapeBatchContext({ batch: currentBatch });

      const projectsText =
        currentBatch?.project_names ||
        currentBatch?.project_name ||
        getElectrodeProjectNames(state.form.batch.project_ids);
      const targetText = formatCutBatchTarget(batchSnapshot);
      const geometryText = formatCutBatchGeometry(batchSnapshot);
      const roleText = selectedTape?.role
        ? roleLabel(selectedTape.role)
        : currentBatch?.tape_role
          ? roleLabel(currentBatch.tape_role)
          : '';
      const metaParts = [
        roleText,
        projectsText,
        targetText,
        geometryText
      ];

      electrodeStickyMeta.textContent = metaParts.filter(Boolean).join(' — ') || '—';

      if (electrodeGlobalDirty) {
        const hasDirtySections = Object.values(state.ui.dirtySections || {}).some(Boolean);
        electrodeGlobalDirty.classList.toggle('visible', hasDirtySections);
      }
    }

    async function openElectrodeBatchRecord(batch, { applyFilters = false } = {}) {
      rememberElectrodeFiltersBeforeWorkspace();

      if (applyFilters) {
        roleSelect.value = batch.tape_role || '';
        projectSelect.value = batch.project_id || '';
        renderTapeOptions();
        tapeSelect.value = String(batch.tape_id);
        syncElectrodeFiltersStateFromDom();

        workflow.hidden = false;
        addCutBatchBtn.hidden = false;

        await loadCutBatches(Number(batch.tape_id));
      }

      await selectBatch(batch);
      window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
    }

    function shouldShowElectrodeWorkflow() {
      return Boolean(state.form.filters.tape_id);
    }

    function renderElectrodeWorkflowVisibility() {
      const shouldShowWorkflow = shouldShowElectrodeWorkflow();
      const hasActiveWorkspace = hasActiveElectrodeWorkspace();
      if (filterPanel) {
        filterPanel.hidden = hasActiveWorkspace;
      }
      workflow.hidden = !shouldShowWorkflow && !hasActiveWorkspace;
      addCutBatchBtn.hidden = !shouldShowWorkflow || hasActiveWorkspace;
      workspace.hidden = !hasActiveWorkspace;
      if (allCutBatchesList && hasActiveWorkspace) {
        allCutBatchesList.hidden = true;
      }
      if (electrodeStickyHeader) {
        electrodeStickyHeader.hidden = !hasActiveWorkspace;
      }
      if (printElectrodeBatchBtn) {
        printElectrodeBatchBtn.hidden = !state.selection.currentCutBatchId;
      }
      if (deleteElectrodeBatchBtn) {
        deleteElectrodeBatchBtn.hidden = !state.selection.currentCutBatchId;
      }
      renderElectrodeStickyHeader();
    }

    function renderCurrentTapeCutBatchList() {
      const list = document.getElementById('current-cut-batches-list');
      const msg = document.getElementById('no-batches-msg');

      if (!list || !msg) return;

      list.innerHTML = '';
      batchTitle.textContent = formatElectrodeTapeBatchContext();
      batchTitle.hidden = true;
      list.hidden = true;
      msg.hidden = true;
      msg.style.display = 'none';
    }

    function renderElectrodePage() {
      renderElectrodeFiltersForm();
      renderTapeOptions();
      renderCurrentTapeCutBatchList();
      renderAllCutBatches();
      renderElectrodeWorkspace();
      const sidednessEl = document.getElementById('electrode-sidedness-display');
      if (sidednessEl) {
        const currentBatch = state.reference.allCutBatches.find(
          batch => String(batch.cut_batch_id) === String(state.selection.currentCutBatchId || '')
        ) || state.lists.cutBatches.find(
          batch => String(batch.cut_batch_id) === String(state.selection.currentCutBatchId || '')
        );
        const currentTape = state.reference.tapes.find(
          tape => String(tape.tape_id) === String(state.form.filters.tape_id || '')
        );
        const label = formatElectrodeSidednessLabel(currentBatch?.tape_coating_sidedness || currentTape?.coating_sidedness);
        sidednessEl.textContent = label ? `Тип покрытия: ${label}` : '';
        sidednessEl.hidden = !label;
      }
      renderElectrodeWorkflowVisibility();
    }

    const electrodeInlineStatusTimers = {};
    let electrodePageStatusTimer = null;

    function ensureElectrodeInlineStatusElement(buttonId) {
      const button = document.getElementById(buttonId);
      if (!button) return null;

      let statusEl = button.parentElement?.querySelector(`.electrode-inline-status[data-for="${buttonId}"]`);

      if (!statusEl) {
        statusEl = document.createElement('span');
        statusEl.className = 'electrode-inline-status';
        statusEl.dataset.for = buttonId;
        statusEl.setAttribute('aria-live', 'polite');
        button.insertAdjacentElement('afterend', statusEl);
      }

      return statusEl;
    }

    function clearElectrodeInlineStatus(buttonId) {
      const statusEl = document.querySelector(`.electrode-inline-status[data-for="${buttonId}"]`);
      if (!statusEl) return;
      statusEl.textContent = '';
      statusEl.classList.remove('is-error');
      statusEl.classList.remove('is-saved');
    }

    function showElectrodeInlineStatus(buttonId, message, isError = false, options = {}) {
      const statusEl = ensureElectrodeInlineStatusElement(buttonId);
      if (!statusEl) return;

      statusEl.textContent = message || '';
      statusEl.classList.toggle('is-error', Boolean(isError));
      statusEl.classList.toggle('is-saved', Boolean(message && !isError));

      if (electrodeInlineStatusTimers[buttonId]) {
        clearTimeout(electrodeInlineStatusTimers[buttonId]);
      }

      const clearAfterMs = options.clearAfterMs ?? (isError ? 18000 : 2500);

      if (message && clearAfterMs) {
        electrodeInlineStatusTimers[buttonId] = setTimeout(() => {
          clearElectrodeInlineStatus(buttonId);
        }, clearAfterMs);
      }
    }

    function showElectrodePageStatus(message, isError = false, options = {}) {
      const statusEl = document.querySelector('body[data-page="electrodes"] .autosave-message');
      if (!statusEl) return;

      if (electrodePageStatusTimer) {
        clearTimeout(electrodePageStatusTimer);
      }

      statusEl.textContent = message || '';
      statusEl.classList.toggle('is-error', Boolean(isError));
      statusEl.classList.toggle('is-saved', Boolean(message && !isError));

      const clearAfterMs = options.clearAfterMs ?? (isError ? 18000 : 5000);

      if (message && clearAfterMs) {
        electrodePageStatusTimer = setTimeout(() => {
          statusEl.textContent = '';
          statusEl.classList.remove('is-error');
          statusEl.classList.remove('is-saved');
        }, clearAfterMs);
      }
    }

    function ensureCutBatchListsVisible() {
      [
        document.getElementById('all-cut-batches-list')
      ].forEach(list => {
        if (!list) return;
        list.hidden = false;
        list.style.display = '';
        const container = list.closest('fieldset, div, section');
        if (container) {
          if (container.id === 'cutting-workflow') return;
          container.hidden = false;
          container.style.display = '';
        }
      });
    }
    
    const roleRu = {
      cathode: 'катод',
      anode: 'анод'
    };
    
    roleSelect.addEventListener('change', () => {
      syncElectrodeFiltersStateFromDom();
      if (state.selection.currentCutBatchId) return;
      renderTapeOptions();
      renderAllCutBatches();
      renderElectrodeWorkflowVisibility();
    });
    
    tapeSelect.addEventListener('change', async () => {
      syncElectrodeFiltersStateFromDom();
      if (state.selection.currentCutBatchId) return;
      
      if (!tapeSelect.value) {
        workflow.hidden = true;
        addCutBatchBtn.hidden = true;
        clearElectrodeWorkspace();
        renderAllCutBatches();
        return;
      }
      
      const selectedOption = tapeSelect.selectedOptions[0];
      
      if (selectedOption && selectedOption.value) {
        const optionProjectIds = normalizeProjectIds(
          (selectedOption.dataset.projectIds || selectedOption.dataset.projectId || '').split(',')
        );
        const currentProjectId = projectSelect.value || '';
        roleSelect.value = selectedOption.dataset.role || '';
        projectSelect.value = optionProjectIds.includes(currentProjectId)
          ? currentProjectId
          : optionProjectIds[0] || '';
        
        renderTapeOptions();
        tapeSelect.value = selectedOption.value;
        syncElectrodeFiltersStateFromDom();
      }
      
      if (tapeSelect.value && projectSelect.value) {
        workflow.hidden = false;
        addCutBatchBtn.hidden = false;
        clearElectrodeWorkspace();
        await loadCutBatches(Number(tapeSelect.value));
        renderAllCutBatches();
      } else {
        workflow.hidden = false;
        addCutBatchBtn.hidden = false;
        clearElectrodeWorkspace();
        if (tapeSelect.value) {
          await loadCutBatches(Number(tapeSelect.value));
        }
        renderAllCutBatches();
      }
    });
    
    projectSelect.addEventListener('change', async () => {
      syncElectrodeFiltersStateFromDom();
      if (state.selection.currentCutBatchId) return;
      
      renderTapeOptions();
      renderAllCutBatches();
      
      if (tapeSelect.value) {
        workflow.hidden = false;
        addCutBatchBtn.hidden = false;
        clearElectrodeWorkspace();
        await loadCutBatches(Number(tapeSelect.value));
      } else {
        workflow.hidden = true;
        addCutBatchBtn.hidden = true;
        clearElectrodeWorkspace();
      }
    });
    
    document.getElementById('electrodes-created_by')
    .addEventListener('change', () => {
      syncElectrodeFiltersStateFromDom();
      if (state.selection.currentCutBatchId) return;
      
      if (tapeSelect.value) {
        workflow.hidden = false;
        addCutBatchBtn.hidden = false;
      } else {
        workflow.hidden = true;
        addCutBatchBtn.hidden = true;
        clearElectrodeWorkspace();
      }
      renderAllCutBatches();
    });

    if (batchFilterTextInput) {
      batchFilterTextInput.addEventListener('input', () => {
        syncElectrodeFiltersStateFromDom();
        if (state.selection.currentCutBatchId) return;
        renderAllCutBatches();
      });
    }

    if (batchFilterSidednessSelect) {
      batchFilterSidednessSelect.addEventListener('change', async () => {
        syncElectrodeFiltersStateFromDom();
        if (state.selection.currentCutBatchId) return;
        renderTapeOptions();

        if (state.form.filters.tape_id) {
          workflow.hidden = false;
          addCutBatchBtn.hidden = false;
          await loadCutBatches(Number(state.form.filters.tape_id));
        } else {
          workflow.hidden = true;
          addCutBatchBtn.hidden = true;
          clearElectrodeWorkspace();
        }

        renderAllCutBatches();
      });
    }

    if (batchFilterFormFactorSelect) {
      batchFilterFormFactorSelect.addEventListener('change', () => {
        syncElectrodeFiltersStateFromDom();
        if (state.selection.currentCutBatchId) return;
        renderAllCutBatches();
      });
    }

    if (clearElectrodeBatchFiltersBtn) {
      clearElectrodeBatchFiltersBtn.addEventListener('click', () => {
        if (batchFilterTextInput) batchFilterTextInput.value = '';
        roleSelect.value = '';
        projectSelect.value = '';
        tapeSelect.value = '';
        if (batchFilterSidednessSelect) batchFilterSidednessSelect.value = '';
        if (batchFilterFormFactorSelect) batchFilterFormFactorSelect.value = '';

        syncElectrodeFiltersStateFromDom();
        renderTapeOptions();

        if (!state.selection.currentCutBatchId) {
          workflow.hidden = true;
          addCutBatchBtn.hidden = true;
          clearElectrodeWorkspace();
        }

        renderAllCutBatches();
        batchFilterTextInput?.focus();
      });
    }

    batchProjectMultiSelectTrigger.addEventListener('click', () => {
      toggleBatchProjectMultiSelect();
    });

    document.addEventListener('click', (event) => {
      if (!batchProjectMultiSelect || batchProjectMultiSelect.contains(event.target)) return;
      setBatchProjectMultiSelectOpen(false);
    });
    
    
    // -------- Reference dropdowns --------

    async function fetchElectrodeArray(url, label) {
      const res = await fetch(url);
      const data = await res.json().catch(() => []);

      if (!res.ok || !Array.isArray(data)) {
        console.error(`Failed to load ${label}`, res.status);
        return [];
      }

      return data;
    }

    async function fetchElectrodeTapesReference() {
      return fetchElectrodeArray('/api/tapes/for-electrodes', 'tapes');
    }

    async function fetchElectrodeProjectsReference() {
      return fetchElectrodeArray('/api/projects?project_id=0', 'projects');
    }

    async function fetchElectrodeUsersReference() {
      return fetchElectrodeArray('/api/users', 'users');
    }

    async function fetchSourceTapesReference() {
      return fetchElectrodeArray('/api/tapes', 'source tapes');
    }

    async function fetchTapeCutBatches(tapeId) {
      return fetchElectrodeArray(
        `/api/tapes/${tapeId}/electrode-cut-batches`,
        `cut batches for tape ${tapeId}`
      );
    }

    async function fetchTapeDryBoxState(tapeId) {
      const res = await fetch(`/api/tapes/${tapeId}/dry-box-state`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Ошибка загрузки состояния ленты');
      }

      return data;
    }

    async function fetchCutBatchElectrodes(cutBatchId) {
      return fetchElectrodeArray(
        `/api/electrodes/electrode-cut-batches/${cutBatchId}/electrodes`,
        `electrodes for cut batch ${cutBatchId}`
      );
    }

    async function fetchCutBatchDetails(cutBatchId) {
      const res = await fetch(`/api/electrodes/electrode-cut-batches/${cutBatchId}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data || typeof data !== 'object') {
        throw new Error(data.error || 'Ошибка загрузки параметров партии');
      }

      return data;
    }

    async function fetchFoilMassMeasurements(cutBatchId) {
      return fetchElectrodeArray(
        `/api/electrodes/electrode-cut-batches/${cutBatchId}/foil-masses`,
        `foil masses for cut batch ${cutBatchId}`
      );
    }
    
    async function loadTapes() {
      setReferenceTapes(await fetchElectrodeTapesReference());
      renderElectrodePage();
    }

    async function loadAllCutBatches() {
      const sourceTapes = await fetchSourceTapesReference();

      const batchGroups = await Promise.all(
        sourceTapes.map(async (tape) => {
          const batches = await fetchTapeCutBatches(tape.tape_id);

          return batches.map(batch => ({
            ...batch,
            tape_name: tape.name,
            tape_role: tape.role,
            project_id: getBatchProjectIds(batch)[0] || getTapeProjectIds(tape)[0] || '',
            project_ids: getBatchProjectIds(batch).length ? getBatchProjectIds(batch) : getTapeProjectIds(tape),
            project_name: batch.project_name || tape.project_name,
            project_names: batch.project_names || tape.project_names || batch.project_name || tape.project_name,
            tape_coating_sidedness: batch.tape_coating_sidedness || tape.coating_sidedness || '',
            created_by_name: batch.created_by_name || batch.created_by
          }));
        })
      );

      const nextBatches = batchGroups
        .flat()
        .sort((a, b) => {
          const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          if (bTime !== aTime) return bTime - aTime;
          return Number(b.cut_batch_id) - Number(a.cut_batch_id);
        });

      setAllCutBatches(nextBatches);
      renderElectrodePage();
    }
    
    function renderTapeOptions() {
      const select = document.getElementById('electrodes-tape_id');
      const role = roleSelect.value;
      const project = projectSelect.value;
      const sidedness = batchFilterSidednessSelect?.value || '';
      const currentValue = state.form.filters.tape_id || select.value || '';

      const filtered = state.reference.tapes.filter(t =>
        (!role || t.role === role) &&
        (!project || getTapeProjectIds(t).includes(String(project))) &&
        (!sidedness || t.coating_sidedness === sidedness)
      );

      select.innerHTML = '<option value="">Все ленты</option>';

      const cathodeGroup = document.createElement('optgroup');
      cathodeGroup.label = 'Катоды';

      const anodeGroup = document.createElement('optgroup');
      anodeGroup.label = 'Аноды';

      filtered.forEach(t => {
        const option = document.createElement('option');
        option.value = String(t.tape_id);
        option.dataset.role = t.role;
        option.dataset.projectId = getTapeProjectIds(t)[0] || '';
        option.dataset.projectIds = getTapeProjectIds(t).join(',');

        const date = t.finished_at || '—';          
        const roleLabel = roleRu[t.role] || t.role;
        const sidednessLabel = formatTapeSidednessLabel(t.coating_sidedness);
        const projectText = t.project_names || t.project_name || '';

        option.textContent = `#${t.tape_id} | ${t.name} (${roleLabel})${sidednessLabel ? ` | ${sidednessLabel}` : ''}${projectText ? ` | ${projectText}` : ''} | ${date} | ${t.created_by}`;

        if (t.role === 'cathode') {
          cathodeGroup.appendChild(option);
        } else if (t.role === 'anode') {
          anodeGroup.appendChild(option);
        }

      });

      if (cathodeGroup.children.length) select.appendChild(cathodeGroup);
      if (anodeGroup.children.length) select.appendChild(anodeGroup);

      const hasCurrentValue = currentValue &&
        Array.from(select.options).some(option => option.value === String(currentValue));

      if (hasCurrentValue) {
        select.value = String(currentValue);
      } else if (currentValue) {
        setElectrodeFiltersState({
          ...state.form.filters,
          tape_id: null
        });
        select.value = '';
      }
    }
    
    async function loadProjects() {
      const select = document.getElementById('electrodes-project_id');
      const data = await fetchElectrodeProjectsReference();

      if (!data.length) {
        setReferenceProjects([]);
        select.innerHTML = '<option value="">Все проекты</option>';
        return;
      }

      setReferenceProjects(data);
      
      select.innerHTML = '<option value="">Все проекты</option>';
      
      data.forEach(p => {
        const option = document.createElement('option');
        option.value = p.project_id;
        option.textContent = p.name;
        select.appendChild(option);
      });
      renderElectrodePage();
    }
    
    async function loadUsers() {
      const select = document.getElementById('electrodes-created_by');
      const data = await fetchElectrodeUsersReference();

      if (!data.length) {
        setReferenceUsers([]);
        select.replaceChildren(new Option(
          window.BADB_AUTH?.getAuditUserPlaceholder?.() || '— автоматически —',
          ''
        ));
        return;
      }

      setReferenceUsers(data);
      
      select.replaceChildren(new Option(
        window.BADB_AUTH?.getAuditUserPlaceholder?.() || '— автоматически —',
        ''
      ));
      
      data.forEach(u => {
        const option = document.createElement('option');
        option.value = u.user_id;
        option.textContent = u.full_name || u.name;
        select.appendChild(option);
      });
      renderElectrodePage();
    }
    
    function clearElectrodeWorkspace() {
      setCurrentCutBatchId(null);
      setCutBatchCreationMode(false);
      setCurrentTapeDryBoxState(null);
      setCurrentCutBatchDetails(null);
      setCurrentBatchElectrodes([]);
      setCutBatchFormState(getDefaultCutBatchFormState());
      setElectrodeDryingState(getDefaultElectrodeDryingState());
      setFoilMassDraftState([]);
      setElectrodeDraftRowsState([]);
      
      workspace.hidden = true;
      batchTitle.textContent = '';

      renderElectrodePage();
      syncElectrodePageStateFromDom();
      markAllElectrodeSectionsSaved();
    }

    async function loadCurrentTapeDryBoxState(tapeId) {
      if (!tapeId) {
        setCurrentTapeDryBoxState(null);
        renderElectrodePage();
        return;
      }

      try {
        const dryBoxState = await fetchTapeDryBoxState(tapeId);
        setCurrentTapeDryBoxState(dryBoxState);
      } catch (err) {
        console.error(err);
        setCurrentTapeDryBoxState(null);
      }

      renderElectrodePage();
    }

    function roleLabel(role) {
      return roleRu[role] || role || '—';
    }

    const targetFormFactorRu = {
      coin: 'coin',
      pouch: 'pouch',
      cylindrical: 'cyl'
    };

    const targetConfigOptionsByFormFactor = {
      coin: [
        { value: '2032', label: '2032' },
        { value: '2025', label: '2025' },
        { value: '2016', label: '2016' },
        { value: 'other', label: 'Другое' }
      ],
      pouch: [
        { value: '103x83', label: '103 x 83' },
        { value: '86x56', label: '86 x 56' },
        { value: 'other', label: 'Другое' }
      ],
      cylindrical: [
        { value: '18650', label: '18650' },
        { value: '21700', label: '21700' },
        { value: 'other', label: 'Другое' }
      ]
    };

    function formatCutBatchTarget(batch) {
      const formFactor = batch.target_form_factor || '';
      const configCode = batch.target_config_code || '';
      const configOther = batch.target_config_other || '';

      if (configCode === 'other' && configOther) {
        return `${targetFormFactorRu[formFactor] || formFactor} other: ${configOther}`;
      }

      if (formFactor && configCode) {
        return `${targetFormFactorRu[formFactor] || formFactor} ${configCode}`;
      }

      return targetFormFactorRu[formFactor] || formFactor || '';
    }

    function formatCutBatchGeometry(batch) {
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

    function batchStatusLabel(batch) {
      if (batch.drying_start && !batch.drying_end) {
        return '🟠 сушится';
      }

      if (batch.drying_end) {
        return '🟢 готово';
      }

      return '🟡 в работе';
    }

    function normalizeElectrodeBatchFilterText(value) {
      return String(value || '')
        .trim()
        .toLocaleLowerCase('ru-RU')
        .replace(/ё/g, 'е');
    }

    function getElectrodeBatchFilterState() {
      return {
        text: normalizeElectrodeBatchFilterText(state.form.filters.text),
        projectId: state.form.filters.project_id || '',
        tapeId: state.form.filters.tape_id || '',
        role: state.form.filters.role || '',
        sidedness: state.form.filters.sidedness || '',
        formFactor: state.form.filters.target_form_factor || ''
      };
    }

    function hasActiveElectrodeBatchFilters(filters = getElectrodeBatchFilterState()) {
      return Boolean(
        filters.text ||
        filters.projectId ||
        filters.tapeId ||
        filters.role ||
        filters.sidedness ||
        filters.formFactor
      );
    }

    function getElectrodeBatchSidednessFilterValue(batch) {
      return String(batch?.tape_coating_sidedness || '').trim();
    }

    function getElectrodeBatchSearchText(batch) {
      const targetText = formatCutBatchTarget(batch);
      const geometryText = formatCutBatchGeometry(batch);
      const sidednessText = formatElectrodesSidednessLabel(batch.tape_coating_sidedness);
      const dateText = batch.created_at
        ? new Date(batch.created_at).toLocaleDateString('ru-RU')
        : '';

      return normalizeElectrodeBatchFilterText([
        batch.cut_batch_id,
        batch.cut_batch_id ? `#${batch.cut_batch_id}` : '',
        batch.tape_id,
        batch.tape_id ? `лента #${batch.tape_id}` : '',
        batch.tape_name,
        batch.tape_role,
        roleLabel(batch.tape_role),
        batch.project_id,
        batch.project_names,
        batch.project_name,
        targetText,
        batch.target_form_factor,
        batch.target_config_code,
        batch.target_config_other,
        geometryText,
        sidednessText,
        batch.tape_coating_sidedness,
        batch.comments,
        batch.created_by_name,
        batch.created_by,
        dateText,
        batchStatusLabel(batch)
      ].filter(Boolean).join(' '));
    }

    function matchesElectrodeBatchFilters(batch, filters = getElectrodeBatchFilterState()) {
      if (filters.projectId && !getBatchProjectIds(batch).includes(String(filters.projectId))) {
        return false;
      }

      if (filters.tapeId && String(batch.tape_id || '') !== String(filters.tapeId)) {
        return false;
      }

      if (filters.role && batch.tape_role !== filters.role) {
        return false;
      }

      if (filters.sidedness && getElectrodeBatchSidednessFilterValue(batch) !== filters.sidedness) {
        return false;
      }

      if (filters.formFactor && batch.target_form_factor !== filters.formFactor) {
        return false;
      }

      if (filters.text && !getElectrodeBatchSearchText(batch).includes(filters.text)) {
        return false;
      }

      return true;
    }

    function updateElectrodeBatchFilterSummary(filteredCount, totalCount) {
      const hasFilters = hasActiveElectrodeBatchFilters();

      if (clearElectrodeBatchFiltersBtn) {
        clearElectrodeBatchFiltersBtn.disabled = !hasFilters;
      }

      if (!batchFilterSummary) return;

      if (totalCount === 0) {
        batchFilterSummary.textContent = 'Нет партий';
        return;
      }

      batchFilterSummary.textContent = hasFilters
        ? `Показано ${filteredCount} из ${totalCount}`
        : `Всего ${totalCount}`;
    }

    function renderCutBatchListInto(list) {
      if (!list) return;

      ensureCutBatchListsVisible();
      list.hidden = false;
      list.innerHTML = '';

      const allBatches = Array.isArray(state.reference.allCutBatches)
        ? state.reference.allCutBatches
        : [];
      const filters = getElectrodeBatchFilterState();
      const hasFilters = hasActiveElectrodeBatchFilters(filters);
      const filteredBatches = allBatches.filter(batch =>
        matchesElectrodeBatchFilters(batch, filters)
      );

      updateElectrodeBatchFilterSummary(filteredBatches.length, allBatches.length);

      if (!filteredBatches.length) {
        const li = document.createElement('li');
        li.className = 'user-row';

        const info = document.createElement('div');
        info.className = 'user-info';
        info.textContent = allBatches.length
          ? 'Партии электродов по выбранным фильтрам не найдены.'
          : 'Пока нет вырезанных партий электродов';

        li.appendChild(info);
        list.appendChild(li);
        return;
      }

      filteredBatches.forEach(batch => {
        const li = document.createElement('li');
        li.className = 'user-row';

        const info = document.createElement('button');
        info.type = 'button';
        info.className = 'user-info record-open-button';
        info.title = 'Открыть партию';
        info.setAttribute('aria-label', `Открыть партию электродов ${batch.cut_batch_id}`);

        const title = document.createElement('strong');
        const dateText = batch.created_at
          ? new Date(batch.created_at).toLocaleDateString('ru-RU')
          : '—';
        const count = Number(batch.electrode_count) || 0;
        const targetText = formatCutBatchTarget(batch);
        const geometryText = formatCutBatchGeometry(batch);
        const sidednessText = formatElectrodesSidednessLabel(batch.tape_coating_sidedness);

        title.textContent =
          `Партия ${batch.cut_batch_id} | ${batch.tape_name || '—'}${sidednessText ? ` | ${sidednessText}` : ''}${targetText ? ` | ${targetText}` : ''}${geometryText ? ` | ${geometryText}` : ''} | ${count} эл. | ${batchStatusLabel(batch)}`;

        const meta = document.createElement('small');
        meta.style.color = '#666';
        meta.textContent =
          ` — ${dateText} — ${roleLabel(batch.tape_role)}${batch.project_names || batch.project_name ? ` — ${batch.project_names || batch.project_name}` : ''} — ${batch.created_by_name || batch.created_by || '—'}`;

        info.appendChild(title);
        info.appendChild(meta);

        info.addEventListener('click', async () => {
          await openElectrodeBatchRecord(batch, { applyFilters: true });
        });

        const actions = document.createElement('div');
        actions.className = 'actions';

        const printBtn = document.createElement('button');
        printBtn.type = 'button';
        printBtn.textContent = '🖨️';
        printBtn.title = 'Печать отчёта';
        printBtn.setAttribute('aria-label', `Печать отчёта партии электродов ${batch.cut_batch_id}`);
        printBtn.addEventListener('click', () => {
          openElectrodeBatchPrintReport(batch.cut_batch_id);
        });

        actions.appendChild(printBtn);

        li.appendChild(info);
        li.appendChild(actions);
        list.appendChild(li);
      });
    }

    function renderAllCutBatches() {
      if (hasActiveElectrodeWorkspace()) {
        if (allCutBatchesList) {
          allCutBatchesList.hidden = true;
        }
        return;
      }
      ensureCutBatchListsVisible();
      renderCutBatchListInto(allCutBatchesList);
    }
    
    function populateBatchWorkspace(batch) {
      workspace.hidden = false;
      setCurrentCutBatchId(batch.cut_batch_id);
      setCurrentCutBatchDetails(null);
      batchTitle.textContent = formatElectrodeTapeBatchContext({ batch });

      setElectrodeFiltersState({
        ...state.form.filters,
        created_by: batch.created_by ?? null
      });
      setCutBatchFormState({
        comments: batch.comments ?? null,
        target_form_factor: batch.target_form_factor ?? null,
        target_config_code: batch.target_config_code ?? null,
        target_config_other: batch.target_config_other ?? null,
        project_ids: getBatchProjectIds(batch),
        shape: batch.shape ?? null,
        diameter_mm: batch.diameter_mm ?? null,
        length_mm: batch.length_mm ?? null,
        width_mm: batch.width_mm ?? null
      });

      renderElectrodeFiltersForm();
      renderElectrodePage();
      syncCutBatchFormStateFromDom();
    }

    function buildCutBatchPayload({ tapeId }) {
      const batchForm = state.form.batch;
      const shape = batchForm.shape || null;
      const isCircle = shape === 'circle';
      const isRect = shape === 'rectangle';
      const targetFormFactor = batchForm.target_form_factor || null;
      const targetConfigCode = batchForm.target_config_code || null;
      const targetConfigOther =
        targetConfigCode === 'other'
          ? (String(batchForm.target_config_other || '').trim() || null)
          : null;

      return {
        tape_id: tapeId,
        project_ids: normalizeProjectIds(batchForm.project_ids),
        comments: batchForm.comments || null,
        target_form_factor: targetFormFactor,
        target_config_code: targetConfigCode,
        target_config_other: targetConfigOther,
        shape,
        diameter_mm: isCircle ? (batchForm.diameter_mm || null) : null,
        length_mm: isRect ? (batchForm.length_mm || null) : null,
        width_mm: isRect ? (batchForm.width_mm || null) : null
      };
    }
    
    async function loadCutBatches(tapeId) {
      const batches = await fetchTapeCutBatches(tapeId);

      if (!batches.length) {
        setCurrentTapeCutBatches([]);
        clearElectrodeWorkspace();
        return;
      }

      setCurrentTapeCutBatches(batches);

      renderElectrodePage();
    }
    
    async function loadElectrodes(cutBatchId) {
      const [electrodes, batchDetails] = await Promise.all([
        fetchCutBatchElectrodes(cutBatchId),
        fetchCutBatchDetails(cutBatchId)
      ]);

      setCurrentCutBatchDetails(batchDetails);

      if (!electrodes.length) {
        setCurrentBatchElectrodes([]);
        renderElectrodes([]);
        renderElectrodeCapacitySummary();
        return;
      }

      setCurrentBatchElectrodes(electrodes);
      renderElectrodes(electrodes);
      renderElectrodeCapacitySummary();
      syncElectrodeDraftStateFromDom();
      
    }
    
    function renderElectrodes(electrodes) {
      
      const body = document.getElementById('electrodes-body');
      body.innerHTML = '';
      
      electrodes.forEach((e, index) => {
        
        const tr = document.createElement('tr');
        
        /* row number */
        
        const indexCell = document.createElement('td');
        indexCell.className = 'row-index';
        indexCell.textContent = index + 1;
        tr.appendChild(indexCell);
        
        const rowCell = document.createElement('td');
        rowCell.textContent = e.number_in_batch ?? '';
        rowCell.dataset.col = 'number';
        
        tr.dataset.electrodeId = e.electrode_id;
        
        const massCell = document.createElement('td');
        const massInput = document.createElement('input');
        massInput.type = 'number';
        massInput.step = '0.0001';
        massInput.min = '0';
        massInput.className = 'electrode-mass';
        massInput.value = e.electrode_mass_g ?? '';
        massInput.addEventListener('change', async () => {
          await updateElectrode(e.electrode_id, {
            electrode_mass_g: massInput.value || null
          });
          await loadElectrodes(state.selection.currentCutBatchId);
        });
        massCell.appendChild(massInput);

        const coatingMassCell = document.createElement('td');
        coatingMassCell.dataset.col = 'coating_mass';
        coatingMassCell.textContent = formatDerivedNumber(e.coating_mass_g, 4);

        const activeMassTheoreticalCell = document.createElement('td');
        activeMassTheoreticalCell.dataset.col = 'active_mass_theoretical';
        activeMassTheoreticalCell.textContent = formatDerivedNumber(e.active_material_mass_theoretical_g, 4);

        const activeMassActualCell = document.createElement('td');
        activeMassActualCell.dataset.col = 'active_mass_actual';
        activeMassActualCell.textContent = formatDerivedNumber(e.active_material_mass_actual_g, 4);

        const capacityTheoreticalCell = document.createElement('td');
        capacityTheoreticalCell.dataset.col = 'capacity_theoretical';
        capacityTheoreticalCell.textContent = formatDerivedNumber(e.capacity_theoretical_mAh, 3);

        const capacityActualCell = document.createElement('td');
        capacityActualCell.dataset.col = 'capacity_actual';
        capacityActualCell.textContent = formatDerivedNumber(e.capacity_actual_mAh, 3);

        const arealCapacityTheoreticalCell = document.createElement('td');
        arealCapacityTheoreticalCell.dataset.col = 'areal_capacity_theoretical';
        arealCapacityTheoreticalCell.textContent = formatDerivedNumber(e.areal_capacity_theoretical_mAh_cm2, 3);

        const arealCapacityActualCell = document.createElement('td');
        arealCapacityActualCell.dataset.col = 'areal_capacity_actual';
        arealCapacityActualCell.textContent = formatDerivedNumber(e.areal_capacity_actual_mAh_cm2, 3);

        const capacityPerSideActualCell = document.createElement('td');
        capacityPerSideActualCell.dataset.col = 'capacity_per_side_actual';
        capacityPerSideActualCell.textContent = formatDerivedNumber(e.capacity_per_side_actual_mAh_cm2, 3);
        
        const cupCell = document.createElement('td');
        cupCell.dataset.col = 'cup';
        const cupInput = document.createElement('input');
        cupInput.type = 'number';
        cupInput.step = '1';
        cupInput.min = '0';
        cupInput.className = 'electrode-cup';
        cupInput.value = e.cup_number ?? '';
        cupInput.addEventListener('change', async () => {
          await updateElectrode(e.electrode_id, {
            cup_number: cupInput.value || null
          });
          await loadElectrodes(state.selection.currentCutBatchId);
        });
        cupCell.appendChild(cupInput);
        
        const commentCell = document.createElement('td');
        commentCell.dataset.col = 'comments';
        const commentInput = document.createElement('input');
        commentInput.type = 'text';
        commentInput.className = 'electrode-comments';
        commentInput.value = e.comments || '';
        commentInput.addEventListener('change', async () => {
          await updateElectrode(e.electrode_id, {
            comments: commentInput.value || null
          });
          await loadElectrodes(state.selection.currentCutBatchId);
        });
        commentCell.appendChild(commentInput);
        
        const statusCell = document.createElement('td');
        statusCell.dataset.col = 'status';
        statusCell.textContent = renderStatus(e);
        
        const actionCell = document.createElement('td');
        
        /* SCRAP button (only if available) */
        
        if (e.status_code === 1) {
          const scrapBtn = document.createElement('button');
          scrapBtn.type = 'button';
          scrapBtn.textContent = '❌';
          scrapBtn.title = 'Списать';
          
          scrapBtn.onclick = async () => {
            await scrapElectrode(e);
          };
          
          actionCell.appendChild(scrapBtn);
        }

        if (e.status_code === 3) {
          const restoreBtn = document.createElement('button');
          restoreBtn.type = 'button';
          restoreBtn.textContent = '↩';
          restoreBtn.title = 'Вернуть в доступные';

          restoreBtn.onclick = async () => {
            await restoreScrappedElectrode(e);
          };

          actionCell.appendChild(restoreBtn);
        }
        
        /* DELETE button */
        
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.textContent = '🗑️';
        deleteBtn.title = 'Удалить';
        
        deleteBtn.onclick = async () => {
          const ok = confirm(`Удалить электрод ${e.electrode_id}?`);
          if (!ok) return;
          
          await deleteElectrode(e.electrode_id);
          await loadElectrodes(state.selection.currentCutBatchId);
        };
        
        actionCell.appendChild(deleteBtn);
        
        tr.appendChild(rowCell);
        tr.appendChild(massCell);
        tr.appendChild(coatingMassCell);
        tr.appendChild(activeMassTheoreticalCell);
        tr.appendChild(activeMassActualCell);
        tr.appendChild(capacityTheoreticalCell);
        tr.appendChild(capacityActualCell);
        tr.appendChild(arealCapacityTheoreticalCell);
        tr.appendChild(arealCapacityActualCell);
        tr.appendChild(capacityPerSideActualCell);
        tr.appendChild(cupCell);
        tr.appendChild(commentCell);
        tr.appendChild(statusCell);
        tr.appendChild(actionCell);
        
        body.appendChild(tr);
        
      });

      applyElectrodeColumnVisibility();
      
    }
    
    function renderStatus(e) {
      
      if (e.status_code === 1) {
        return '✅ доступен';
      }
      
      if (e.status_code === 2) {
        return `🔋 использован в батарее ${e.used_in_battery_id}`;
      }
      
      if (e.status_code === 3) {
        return `❌ списан: ${e.scrapped_reason}`;
      }
      
      return '';
    }
    
    async function updateElectrode(electrodeId, payload) {
      const res = await fetch(`/api/electrodes/${electrodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showElectrodeInlineStatus('saveBtn', err.error || 'Ошибка обновления электрода', true);
        throw new Error(err.error || 'Ошибка обновления электрода');
      }

      showElectrodeInlineStatus('saveBtn', 'Электрод обновлён.');
      
      return res.json();
    }
    
    async function deleteElectrode(electrodeId) {
      const res = await fetch(`/api/electrodes/${electrodeId}`, {
        method: 'DELETE'
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showElectrodeInlineStatus('saveBtn', err.error || 'Ошибка удаления электрода', true);
        throw new Error(err.error || 'Ошибка удаления электрода');
      }

      showElectrodeInlineStatus('saveBtn', 'Электрод удалён.');
      
      return res.json();
    }

    function formatElectrodeDependencySummary(dependencies) {
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

    function formatElectrodeDeleteCheckMessage(payload, fallback) {
      const message = payload?.error || fallback;
      const dependencySummary = formatElectrodeDependencySummary(payload?.dependencies);

      return dependencySummary
        ? `${message}. Блокирующие записи: ${dependencySummary}`
        : message;
    }

    async function deleteCurrentElectrodeBatch() {
      const cutBatchId = state.selection.currentCutBatchId;

      if (!cutBatchId) return;

      if (hasUnsavedChanges()) {
        const proceed = confirm('Есть несохранённые изменения. Удалить партию без сохранения?');
        if (!proceed) return;
      }

      const checkRes = await fetch(`/api/electrodes/electrode-cut-batches/${cutBatchId}/delete-check`);
      const check = await checkRes.json().catch(() => ({}));

      if (!checkRes.ok || !check.can_delete) {
        showElectrodeInlineStatus(
          'deleteElectrodeBatchBtn',
          formatElectrodeDeleteCheckMessage(check, 'Партия электродов пока не готова к удалению'),
          true,
          { clearAfterMs: 18000 }
        );
        return;
      }

      const phrase = `DELETE BATCH ${cutBatchId}`;
      const typed = prompt(`Для удаления партии введите: ${phrase}`);

      if (typed !== phrase) {
        showElectrodeInlineStatus('deleteElectrodeBatchBtn', 'Удаление отменено.', true, { clearAfterMs: 4000 });
        return;
      }

      const res = await fetch(`/api/electrodes/electrode-cut-batches/${cutBatchId}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const dependencyDetail = Array.isArray(err.dependencies) && err.dependencies.length
          ? ` (${err.dependencies.map(dep => dep.label || dep.key).join('; ')})`
          : '';
        showElectrodeInlineStatus(
          'deleteElectrodeBatchBtn',
          `${err.error || 'Ошибка удаления партии'}${dependencyDetail}`,
          true
        );
        return;
      }

      restoreElectrodeFiltersAfterWorkspace();
      clearElectrodeWorkspace();
      await loadAllCutBatches();
      if (state.form.filters.tape_id) {
        await loadCutBatches(Number(state.form.filters.tape_id));
      }
      renderElectrodePage();
      syncElectrodePageStateFromDom();
      markAllElectrodeSectionsSaved();
      showElectrodePageStatus('Партия удалена.');
    }
    
    async function scrapElectrode(electrode) {
      
      const reason = prompt('Причина списания');
      
      if (!reason) return;
      
      const res = await fetch(`/api/electrodes/${electrode.electrode_id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status_code: 3,
          scrapped_reason: reason,
          used_in_battery_id: null
        })
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showElectrodeInlineStatus('saveBtn', err.error || 'Ошибка списания электрода', true);
        return;
      }
      
      await loadElectrodes(electrode.cut_batch_id);
      showElectrodeInlineStatus('saveBtn', 'Электрод списан.');
      
    }

    async function restoreScrappedElectrode(electrode) {
      const ok = confirm(`Вернуть электрод ${electrode.electrode_id} в доступные?`);

      if (!ok) return;

      const res = await fetch(`/api/electrodes/${electrode.electrode_id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status_code: 1,
          used_in_battery_id: null,
          scrapped_reason: null
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showElectrodeInlineStatus('saveBtn', err.error || 'Ошибка возврата электрода в доступные', true);
        return;
      }

      await loadElectrodes(electrode.cut_batch_id);
      showElectrodeInlineStatus('saveBtn', 'Электрод возвращён в доступные.');
    }
    
    async function selectBatch(batch) {
      populateBatchWorkspace(batch);
      await loadElectrodes(batch.cut_batch_id);
      await loadFoilMassMeasurements(batch.cut_batch_id);
      await loadDrying(batch.cut_batch_id);
      await loadCurrentTapeDryBoxState(Number(batch.tape_id));
      syncElectrodePageStateFromDom();
      markAllElectrodeSectionsSaved();
    }
    
    addCutBatchBtn.addEventListener('click', () => {
      rememberElectrodeFiltersBeforeWorkspace();
      clearElectrodeWorkspace();
      setCutBatchCreationMode(true);
      setBatchProjectIds(getDefaultBatchProjectIds(), { render: false });
      workspace.hidden = false;
      batchTitle.textContent = formatElectrodeTapeBatchContext();
      renderElectrodePage();
      markElectrodeSectionSaved('batch');
    });
    
    /* ---------- ELECTRODE GEOMETRY ---------- */
    
    const shapeRadios = document.querySelectorAll('input[name="electrodes-shape"]');
    
    const geomCircle = document.getElementById('electrodes-geom-circle');
    const geomRect = document.getElementById('electrodes-geom-rect');
    
    const diameterInput = document.getElementById('electrodes-diameter');
    const lengthInput = document.getElementById('electrodes-length');
    const widthInput = document.getElementById('electrodes-width');
    const targetFormFactorSelect = document.getElementById('electrodes-target_form_factor');
    const targetConfigCodeSelect = document.getElementById('electrodes-target_config_code');
    const targetConfigOtherBlock = document.getElementById('electrodes-target_config_other_block');
    const targetConfigOtherInput = document.getElementById('electrodes-target_config_other');
    
    const areaField = document.getElementById('electrodes-area');

    function getSelectedShape() {
      return document.querySelector('input[name="electrodes-shape"]:checked')?.value || null;
    }

    function setSelectedShape(shape) {
      shapeRadios.forEach(radio => {
        radio.checked = radio.value === shape;
      });
    }

    function clearTargetConfigFields() {
      targetConfigCodeSelect.innerHTML = '<option value="">— выбрать семейство —</option>';
      targetConfigCodeSelect.disabled = true;
      targetConfigOtherInput.value = '';
      targetConfigOtherBlock.hidden = true;
    }

    function populateTargetConfigOptions(formFactor, selectedValue = '') {
      const options = targetConfigOptionsByFormFactor[formFactor] || [];

      targetConfigCodeSelect.innerHTML = '<option value="">— выбрать —</option>';
      targetConfigCodeSelect.disabled = options.length === 0;

      options.forEach(({ value, label }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        targetConfigCodeSelect.appendChild(option);
      });

      if (selectedValue) {
        const hasOption = options.some(option => option.value === selectedValue);

        if (!hasOption) {
          const option = document.createElement('option');
          option.value = selectedValue;
          option.textContent =
            selectedValue === 'other' ? 'Другое' : selectedValue;
          targetConfigCodeSelect.appendChild(option);
        }

        targetConfigCodeSelect.value = selectedValue;
      }
    }

    function renderTargetConfigOtherUi() {
      const isOther = targetConfigCodeSelect.value === 'other';

      targetConfigOtherBlock.hidden = !isOther;

      if (!isOther) {
        targetConfigOtherInput.value = '';
      }
    }
    
    function updateGeometryVisibility() {
      const formFactor = targetFormFactorSelect.value;
      const shape =
        formFactor === 'coin' ? 'circle'
        : formFactor === 'pouch' || formFactor === 'cylindrical' ? 'rectangle'
        : null;

      setSelectedShape(shape);
      
      geomCircle.hidden = true;
      geomRect.hidden = true;
      
      if (shape === 'circle') {
        geomCircle.hidden = false;
        lengthInput.value = '';
        widthInput.value = '';
        
        setTimeout(() => {
          diameterInput.focus();
        }, 0);
      }
      
      if (shape === 'rectangle') {
        geomRect.hidden = false;
        diameterInput.value = '';
        
        setTimeout(() => {
          lengthInput.focus();
        }, 0);
      }

      if (!shape) {
        clearTargetConfigFields();
        diameterInput.value = '';
        lengthInput.value = '';
        widthInput.value = '';
      }
      
      computeElectrodeArea();
    }
    
    function computeElectrodeArea() {
      
      const shape = getSelectedShape();
      
      let area = null;
      
      if (shape === 'circle') {
        
        const d = Number(diameterInput.value);
        
        if (d > 0) {
          area = Math.PI * Math.pow(d / 2, 2);
        }
        
      }
      
      if (shape === 'rectangle') {
        
        const L = Number(lengthInput.value);
        const W = Number(widthInput.value);
        
        if (L > 0 && W > 0) {
          area = L * W;
        }
        
      }
      
      if (area !== null) {
        areaField.textContent = area.toFixed(2);
      } else {
        areaField.textContent = '';
      }
      
    }
    
    targetFormFactorSelect.addEventListener('change', () => {
      populateTargetConfigOptions(targetFormFactorSelect.value);
      renderTargetConfigOtherUi();
      updateGeometryVisibility();
      syncCutBatchFormStateFromDom();
      refreshElectrodeDirtyState();
    });

    targetConfigCodeSelect.addEventListener('change', () => {
      renderTargetConfigOtherUi();
      syncCutBatchFormStateFromDom();
      refreshElectrodeDirtyState();
    });
    
    /* dimension changes */
    diameterInput.addEventListener('input', () => {
      computeElectrodeArea();
      syncCutBatchFormStateFromDom();
    });
    lengthInput.addEventListener('input', () => {
      computeElectrodeArea();
      syncCutBatchFormStateFromDom();
    });
    widthInput.addEventListener('input', () => {
      computeElectrodeArea();
      syncCutBatchFormStateFromDom();
    });
    
    /* ---------- FOIL MASS MEASUREMENTS ---------- */
    
    const foilMassInput = document.getElementById('foil-mass');
    const foilMassBody = document.getElementById('foil-mass-body');
    const addFoilMassRowBtn = document.getElementById('add-foil-mass-row-btn');
    
    function renumberFoilMassRows() {
      const rows = foilMassBody.querySelectorAll('tr');
      
      rows.forEach((row, index) => {
        const numberCell = row.querySelector('.foil-row-number');
        if (numberCell) {
          numberCell.textContent = index + 1;
        }
      });
    }
    
    function recalculateFoilMassAverage() {
      const inputs = foilMassBody.querySelectorAll('.foil-mass-value');
      const values = Array.from(inputs)
      .map(input => Number(input.value))
      .filter(v => Number.isFinite(v) && v > 0);
      
      if (!values.length) {
        foilMassInput.value = '';
        return;
      }
      
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      foilMassInput.value = avg.toFixed(4);
    }
    
    function appendFoilMassRow(value = '') {
      const tr = document.createElement('tr');
      
      const numberTd = document.createElement('td');
      numberTd.className = 'foil-row-number';
      
      const inputTd = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.0001';
      input.min = '0';
      input.className = 'foil-mass-value';
      input.value = value !== null && value !== undefined ? value : '';
      
      inputTd.appendChild(input);
      
      const actionTd = document.createElement('td');
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '🗑️';
      
      actionTd.appendChild(removeBtn);
      
      tr.appendChild(numberTd);
      tr.appendChild(inputTd);
      tr.appendChild(actionTd);
      
      foilMassBody.appendChild(tr);
      renumberFoilMassRows();
      recalculateFoilMassAverage();
      
      input.addEventListener('input', recalculateFoilMassAverage);
      input.addEventListener('input', syncElectrodeDraftStateFromDom);
      input.addEventListener('change', refreshElectrodeDraftDirtyStateFromDom);
      
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          appendFoilMassRow();
          refreshElectrodeDraftDirtyStateFromDom();
          const rows = foilMassBody.querySelectorAll('.foil-mass-value');
          rows[rows.length - 1].focus();
        }
      });
      
      removeBtn.addEventListener('click', () => {
        tr.remove();
        
        if (!foilMassBody.querySelector('tr')) {
          appendFoilMassRow();
          refreshElectrodeDraftDirtyStateFromDom();
          return;
        }
        
        renumberFoilMassRows();
        recalculateFoilMassAverage();
        refreshElectrodeDraftDirtyStateFromDom();
      });
      
      return tr;
    }
    
    async function loadFoilMassMeasurements(cutBatchId) {
      const measurements = await fetchFoilMassMeasurements(cutBatchId);

      if (!measurements.length) {
        setFoilMassDraftState([]);
        renderFoilMassDrafts();
        return;
      }

      setFoilMassDraftState(measurements.map(m => m.mass_g ?? null));
      renderFoilMassDrafts();
      syncElectrodeDraftStateFromDom();
    }
    
    addFoilMassRowBtn.addEventListener('click', () => {
      appendFoilMassRow();
      refreshElectrodeDraftDirtyStateFromDom();
      const rows = foilMassBody.querySelectorAll('.foil-mass-value');
      rows[rows.length - 1].focus();
    });
    
    
    /* ---------- ELECTRODE ENTRY ROWS ---------- */
    
    const electrodesBody = document.getElementById('electrodes-body');
    const addElectrodeRowBtn = document.getElementById('add-electrode-row-btn');
    
    function renumberElectrodeRows() {
      
      const rows = electrodesBody.querySelectorAll('tr');
      
      rows.forEach((row, index) => {
        
        const indexCell = row.querySelector('.row-index');
        if (indexCell) {
          indexCell.textContent = index + 1;
        }
        
      });
      
    }
    
    function appendElectrodeRow(data = {}) {
      
      const tr = document.createElement('tr');
      
      const indexCell = document.createElement('td');
      indexCell.className = 'row-index';
      tr.appendChild(indexCell);
      
      tr.dataset.mass = data.electrode_mass_g || '';
      tr.dataset.cup = data.cup_number || '';
      tr.dataset.comments = data.comments || '';
      
      const numTd = document.createElement('td');
      numTd.className = 'electrode-row-number';
      numTd.dataset.col = 'number';
      
      const massTd = document.createElement('td');
      const massInput = document.createElement('input');
      massInput.type = 'number';
      massInput.step = '0.0001';
      massInput.min = '0';
      massInput.required = true;
      massInput.className = 'electrode-mass';
      if (data.electrode_mass_g) {
        massInput.value = data.electrode_mass_g;
      }
      
      massTd.appendChild(massInput);
      massInput.addEventListener('input', () => {
        tr.dataset.mass = massInput.value;
        syncElectrodeDraftStateFromDom();
      });
      massInput.addEventListener('change', refreshElectrodeDraftDirtyStateFromDom);

      const coatingMassTd = document.createElement('td');
      coatingMassTd.dataset.col = 'coating_mass';
      coatingMassTd.textContent = '—';

      const activeMassTheoreticalTd = document.createElement('td');
      activeMassTheoreticalTd.dataset.col = 'active_mass_theoretical';
      activeMassTheoreticalTd.textContent = '—';

      const activeMassActualTd = document.createElement('td');
      activeMassActualTd.dataset.col = 'active_mass_actual';
      activeMassActualTd.textContent = '—';

      const capacityTheoreticalTd = document.createElement('td');
      capacityTheoreticalTd.dataset.col = 'capacity_theoretical';
      capacityTheoreticalTd.textContent = '—';

      const capacityActualTd = document.createElement('td');
      capacityActualTd.dataset.col = 'capacity_actual';
      capacityActualTd.textContent = '—';

      const arealCapacityTheoreticalTd = document.createElement('td');
      arealCapacityTheoreticalTd.dataset.col = 'areal_capacity_theoretical';
      arealCapacityTheoreticalTd.textContent = '—';

      const arealCapacityActualTd = document.createElement('td');
      arealCapacityActualTd.dataset.col = 'areal_capacity_actual';
      arealCapacityActualTd.textContent = '—';

      const capacityPerSideActualTd = document.createElement('td');
      capacityPerSideActualTd.dataset.col = 'capacity_per_side_actual';
      capacityPerSideActualTd.textContent = '—';
      
      const cupTd = document.createElement('td');
      cupTd.dataset.col = 'cup';
      const cupInput = document.createElement('input');
      cupInput.type = 'number';
      cupInput.step = '1';
      cupInput.min = '0';
      cupInput.className = 'electrode-cup';
      if (data.cup_number) {
        cupInput.value = data.cup_number;
      }
      
      cupTd.appendChild(cupInput);
      cupInput.addEventListener('input', () => {
        tr.dataset.cup = cupInput.value;
        syncElectrodeDraftStateFromDom();
      });
      cupInput.addEventListener('change', refreshElectrodeDraftDirtyStateFromDom);
      
      const commentTd = document.createElement('td');
      commentTd.dataset.col = 'comments';
      const commentInput = document.createElement('input');
      commentInput.type = 'text';
      commentInput.className = 'electrode-comments';
      if (data.comments) {
        commentInput.value = data.comments;
      }
      
      commentTd.appendChild(commentInput);
      commentInput.addEventListener('input', () => {
        tr.dataset.comments = commentInput.value;
        syncElectrodeDraftStateFromDom();
      });
      commentInput.addEventListener('change', refreshElectrodeDraftDirtyStateFromDom);
      
      const statusTd = document.createElement('td');
      statusTd.dataset.col = 'status';
      statusTd.textContent = 'новый';
      
      const actionTd = document.createElement('td');
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '🗑️';
      actionTd.appendChild(removeBtn);
      
      tr.appendChild(numTd);
      tr.appendChild(massTd);
      tr.appendChild(coatingMassTd);
      tr.appendChild(activeMassTheoreticalTd);
      tr.appendChild(activeMassActualTd);
      tr.appendChild(capacityTheoreticalTd);
      tr.appendChild(capacityActualTd);
      tr.appendChild(arealCapacityTheoreticalTd);
      tr.appendChild(arealCapacityActualTd);
      tr.appendChild(capacityPerSideActualTd);
      tr.appendChild(cupTd);
      tr.appendChild(commentTd);
      tr.appendChild(statusTd);
      tr.appendChild(actionTd);
      
      electrodesBody.appendChild(tr);
      
      renumberElectrodeRows();
      applyElectrodeColumnVisibility();
      
      massInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          appendElectrodeRow();
          refreshElectrodeDraftDirtyStateFromDom();
          const inputs = electrodesBody.querySelectorAll('.electrode-mass');
          inputs[inputs.length - 1].focus();
        }
      });
      
      removeBtn.addEventListener('click', () => {
        tr.remove();
        
        if (!electrodesBody.querySelector('tr')) {
          appendElectrodeRow();
          refreshElectrodeDraftDirtyStateFromDom();
          return;
        }
        
        renumberElectrodeRows();
        refreshElectrodeDraftDirtyStateFromDom();
      });
      
    }
    
    addElectrodeRowBtn.addEventListener('click', () => {
      
      appendElectrodeRow();
      refreshElectrodeDraftDirtyStateFromDom();
      
      const inputs = electrodesBody.querySelectorAll('.electrode-mass');
      
      inputs[inputs.length - 1].focus();
      
    });
    
    
    /* ---------- ELECTRODE DRYING ---------- */
    
    const dryingStartDate = document.getElementById('electrodes-drying-start-date');
    const dryingStartTime = document.getElementById('electrodes-drying-start-time');
    
    const dryingEndDate = document.getElementById('electrodes-drying-end-date');
    const dryingEndTime = document.getElementById('electrodes-drying-end-time');
    
    const dryingTemp = document.getElementById('electrodes-drying-temperature');
    const dryingOther = document.getElementById('electrodes-drying-other-parameters');
    const dryingComments = document.getElementById('electrodes-drying-comments');
    
    const dryingStartNowBtn = document.getElementById('electrodes-drying-start-now-button');
    const dryingEndNowBtn = document.getElementById('electrodes-drying-end-now-button');
    
    
    function setNow(dateInput, timeInput) {
      
      const now = new Date();
      
      const date = now.toISOString().slice(0,10);
      const time = now.toTimeString().slice(0,5);
      
      dateInput.value = date;
      timeInput.value = time;
      
    }
    
    dryingStartNowBtn.addEventListener('click', () => {
      setNow(dryingStartDate, dryingStartTime);
      syncElectrodeDryingStateFromDom();
    });
    
    dryingEndNowBtn.addEventListener('click', () => {
      setNow(dryingEndDate, dryingEndTime);
      syncElectrodeDryingStateFromDom();
    });
    
    function clearDryingBlock() {
      
      dryingStartDate.value = '';
      dryingStartTime.value = '';
      
      dryingEndDate.value = '';
      dryingEndTime.value = '';
      
      dryingTemp.value = '';
      dryingOther.value = '';
      dryingComments.value = '';
      
    }
    
    function buildDryingPayload() {
      const drying = state.form.drying;
      let startTime = null;
      let endTime = null;
      
      if (drying.start_date && drying.start_time) {
        startTime = `${drying.start_date}T${drying.start_time}`;
      }
      
      if (drying.end_date && drying.end_time) {
        endTime = `${drying.end_date}T${drying.end_time}`;
      }
      
      return {
        
        cut_batch_id: state.selection.currentCutBatchId,
        
        start_time: startTime,
        
        end_time: endTime,
        
        temperature_c: drying.temperature_c || null,
        
        other_parameters: drying.other_parameters || null,
        
        comments: drying.comments || null
        
      };
      
    }
    
    async function loadDrying(cutBatchId) {
      const res = await fetch(`/api/electrodes/electrode-cut-batches/${cutBatchId}/drying`);
      
      if (!res.ok) {
        setElectrodeDryingState(getDefaultElectrodeDryingState());
        renderElectrodeDryingForm();
        return;
      }
      
      const d = await res.json().catch(() => null);
      
      if (!d) {
        setElectrodeDryingState(getDefaultElectrodeDryingState());
        renderElectrodeDryingForm();
        return;
      }

      const nextDryingState = getDefaultElectrodeDryingState();

      if (d.start_time) {
        const start = new Date(d.start_time);
        nextDryingState.start_date = start.toISOString().slice(0,10);
        nextDryingState.start_time = start.toTimeString().slice(0,5);
      }
      
      if (d.end_time) {
        const end = new Date(d.end_time);
        nextDryingState.end_date = end.toISOString().slice(0,10);
        nextDryingState.end_time = end.toTimeString().slice(0,5);
      }

      nextDryingState.temperature_c = d.temperature_c ?? null;
      nextDryingState.other_parameters = d.other_parameters ?? null;
      nextDryingState.comments = d.comments ?? null;

      setElectrodeDryingState(nextDryingState);
      renderElectrodeDryingForm();
      syncElectrodeDryingStateFromDom();
      
    }
    
    /* ---------- CHECK UNSAVED DATA ---------- */
    
    function hasUnsavedChanges() {
      syncElectrodePageStateFromDom();
      return Object.values(state.ui.dirtySections).some(Boolean);
    }

    function hasPendingTapeDryBoxDecision() {
      const dryBoxState = state.selection.currentTapeDryBoxState;
      return Boolean(
        state.selection.currentCutBatchId &&
        dryBoxState &&
        dryBoxState.availability_status === 'out_of_dry_box'
      );
    }

    function getPendingTapeDryBoxDecisionMessage() {
      return hasEstablishedTapeDryBoxStorage(state.selection.currentTapeDryBoxState)
        ? 'Для ленты ещё не указано, что делать дальше: вернуть в сушильный шкаф или отметить как израсходованную. Выйти всё равно?'
        : 'Для ленты ещё не указано, что сделать с остатком: поместить в сушильный шкаф или списать. Выйти всё равно?';
    }

    function confirmElectrodeLogout() {
      if (hasUnsavedChanges() && !confirm('Есть несохранённые изменения. Выйти без сохранения?')) {
        return false;
      }

      if (hasPendingTapeDryBoxDecision() && !confirm(getPendingTapeDryBoxDecisionMessage())) {
        return false;
      }

      return true;
    }

    function discardElectrodeChangesForLogout() {
      markAllElectrodeSectionsSaved();
      setCurrentTapeDryBoxState(null);
    }

    const electrodeLogoutGuard = {
      hasUnsavedChanges: () => hasUnsavedChanges() || hasPendingTapeDryBoxDecision(),
      confirmLogout: confirmElectrodeLogout,
      discardUnsavedChanges: discardElectrodeChangesForLogout
    };

    window.BADB_PAGE_LOGOUT_GUARD = electrodeLogoutGuard;
    window.BADB_AUTH?.registerLogoutGuard?.(electrodeLogoutGuard);

    function getElectrodeDirtySnapshot() {
      const currentSnapshots = getAllCurrentElectrodeSectionSnapshots();
      const savedSnapshots = state.ui.savedSectionSnapshots;

      return ELECTRODE_SECTION_KEYS.reduce((acc, sectionKey) => {
        acc[sectionKey] = {
          isDirty: Boolean(state.ui.dirtySections?.[sectionKey]),
          current: currentSnapshots[sectionKey],
          saved: savedSnapshots[sectionKey] ?? null
        };
        return acc;
      }, {});
    }

    function installElectrodeDebugInspector() {
      window.__electrodeDebug = {
        getState: getElectrodeDebugSnapshot,
        getDirtyState: getElectrodeDirtySnapshot,
        logState() {
          console.log('electrodeState', getElectrodeDebugSnapshot());
        },
        logDirtyState() {
          console.log('electrodeDirtyState', getElectrodeDirtySnapshot());
        },
        syncFromDom: syncElectrodePageStateFromDom,
        render: renderElectrodePage,
        refreshDirtyState: refreshElectrodeDirtyState,
        markAllElectrodeSectionsSaved
      };
    }
    
    // -------- Events --------
    
    /* ---------- EXIT BATCH ---------- */
    
    const exitBatchBtn = document.getElementById('exitBatchBtn');
    
    exitBatchBtn.addEventListener('click', () => {
      
      if (hasUnsavedChanges()) {
        
        const confirmExit = confirm('Есть несохранённые изменения. Выйти?');
        
        if (!confirmExit) {
          return;
        }
        
      }

      if (hasPendingTapeDryBoxDecision()) {
        const confirmTapeDecisionExit = confirm(getPendingTapeDryBoxDecisionMessage());
        if (!confirmTapeDecisionExit) {
          return;
        }
      }
      
      restoreElectrodeFiltersAfterWorkspace();
      clearElectrodeWorkspace();

      renderElectrodePage();
      syncElectrodePageStateFromDom();
      markAllElectrodeSectionsSaved();
      
    });
    
    /* ---------- SAVE BATCH ---------- */
    
    const saveBtn = document.getElementById('saveBtn');
    
    saveBtn.addEventListener('click', async () => {
      
      syncElectrodePageStateFromDom();
      const tapeId = Number(state.form.filters.tape_id);
      
      if (!tapeId) {
        showElectrodeInlineStatus('saveBtn', 'Не выбрана лента', true);
        return;
      }

      if (!normalizeProjectIds(state.form.batch.project_ids).length) {
        showElectrodeInlineStatus('saveBtn', 'Выберите хотя бы один проект партии', true);
        return;
      }
      
      /* ---------- CREATE BATCH IF NEEDED ---------- */
      
      if (!state.selection.currentCutBatchId) {
        const payload = buildCutBatchPayload({ tapeId });
        
        const res = await fetch('/api/electrodes/electrode-cut-batches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const batch = await res.json().catch(() => ({}));

        if (!res.ok) {
          showElectrodeInlineStatus('saveBtn', batch.error || 'Ошибка сохранения партии', true);
          return;
        }

        setCurrentCutBatchId(batch.cut_batch_id);
        
      } else {
        const payload = buildCutBatchPayload({ tapeId });

        const res = await fetch(`/api/electrodes/electrode-cut-batches/${state.selection.currentCutBatchId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          showElectrodeInlineStatus('saveBtn', err.error || 'Ошибка обновления партии', true);
          return;
        }
      }
      
      /* ---------- SAVE NEW ELECTRODES ONLY ---------- */
      
      for (const row of state.drafts.electrodes) {
        const mass = row.electrode_mass_g;

        if (!mass) continue;
        
        const res = await fetch('/api/electrodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cut_batch_id: state.selection.currentCutBatchId,
            electrode_mass_g: mass,
            cup_number: row.cup_number || null,
            comments: row.comments || null
          })
        });
        
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          showElectrodeInlineStatus('saveBtn', err.error || 'Ошибка создания электрода', true);
          return;
        }
        
      }
      
      /* ---------- SAVE FOIL MASSES ---------- */
      
      let res = await fetch(`/api/electrodes/electrode-cut-batches/${state.selection.currentCutBatchId}/foil-masses`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showElectrodeInlineStatus('saveBtn', err.error || 'Ошибка удаления старых измерений массы фольги', true);
        return;
      }

      for (const value of state.drafts.foilMasses) {
        
        if (!value) continue;
        
        res = await fetch('/api/electrodes/electrode-cut-batches/' + state.selection.currentCutBatchId + '/foil-masses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cut_batch_id: state.selection.currentCutBatchId,
            mass_g: value
          })
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          showElectrodeInlineStatus('saveBtn', err.error || 'Ошибка сохранения измерения массы фольги', true);
          return;
        }
      }
      
      /* ---------- SAVE DRYING ---------- */
      
      const dryingPayload = buildDryingPayload();
      
      if (dryingPayload.start_time || dryingPayload.end_time || dryingPayload.temperature_c) {
        
        const res = await fetch(`/api/electrodes/electrode-cut-batches/${state.selection.currentCutBatchId}/drying`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dryingPayload)
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          showElectrodeInlineStatus('saveBtn', err.error || 'Ошибка сохранения сушки', true);
          return;
        }
        
      }

      await loadCutBatches(tapeId);
      await loadAllCutBatches();
      await loadElectrodes(state.selection.currentCutBatchId);
      await loadFoilMassMeasurements(state.selection.currentCutBatchId);
      await loadDrying(state.selection.currentCutBatchId);
      await loadCurrentTapeDryBoxState(tapeId);
      syncElectrodePageStateFromDom();
      markAllElectrodeSectionsSaved();
      showElectrodeInlineStatus('saveBtn', 'Партия сохранена.');
    });

    if (printElectrodeBatchBtn) {
      printElectrodeBatchBtn.addEventListener('click', () => {
        if (!state.selection.currentCutBatchId) return;
        openElectrodeBatchPrintReport(state.selection.currentCutBatchId);
      });
    }

    if (deleteElectrodeBatchBtn) {
      deleteElectrodeBatchBtn.addEventListener('click', deleteCurrentElectrodeBatch);
    }

    document.getElementById('electrodes-return-tape-btn').addEventListener('click', async () => {
      const tapeId = Number(state.form.filters.tape_id);
      const hasEstablishedStorage = hasEstablishedTapeDryBoxStorage(state.selection.currentTapeDryBoxState);

      if (!tapeId) {
        showElectrodeInlineStatus('electrodes-return-tape-btn', 'Не выбрана лента', true);
        return;
      }

      const res = hasEstablishedStorage
        ? await fetch(`/api/tapes/${tapeId}/dry-box-state/return-now`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        })
        : await fetch(`/api/tapes/${tapeId}/dry-box-state/place-now`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showElectrodeInlineStatus(
          'electrodes-return-tape-btn',
          data.error || (hasEstablishedStorage ? 'Ошибка возврата ленты в шкаф' : 'Ошибка помещения ленты в шкаф'),
          true
        );
        return;
      }

      setCurrentTapeDryBoxState(data);
      await loadTapes();
      renderElectrodePage();
      showElectrodeInlineStatus(
        'electrodes-return-tape-btn',
        hasEstablishedStorage ? 'Лента возвращена в шкаф' : 'Лента помещена в шкаф'
      );
    });

    document.getElementById('electrodes-deplete-tape-btn').addEventListener('click', async () => {
      const tapeId = Number(state.form.filters.tape_id);

      if (!tapeId) {
        showElectrodeInlineStatus('electrodes-deplete-tape-btn', 'Не выбрана лента', true);
        return;
      }

      const res = await fetch(`/api/tapes/${tapeId}/dry-box-state/deplete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showElectrodeInlineStatus('electrodes-deplete-tape-btn', data.error || 'Ошибка списания ленты', true);
        return;
      }

      setCurrentTapeDryBoxState(data);
      await loadTapes();
      renderElectrodePage();
      showElectrodeInlineStatus(
        'electrodes-deplete-tape-btn',
        hasEstablishedTapeDryBoxStorage(data) ? 'Лента отмечена как израсходованная' : 'Лента списана'
      );
    });
    
    
    // -------- Init --------
    
    async function initElectrodePage() {
      installElectrodeDebugInspector();
      setAllCutBatches([]);
      renderElectrodePage();
      await loadProjects();
      await loadUsers();
      await loadTapes();
      await loadAllCutBatches();
      syncElectrodePageStateFromDom();
      markAllElectrodeSectionsSaved();
    }

    window.addEventListener('beforeunload', (e) => {
      if (!hasUnsavedChanges() && !hasPendingTapeDryBoxDecision()) return;
      e.preventDefault();
      e.returnValue = '';
    });

    initElectrodePage();
    
    document.querySelectorAll('input, textarea, select').forEach(el => {
      el.addEventListener('input', () => {
        syncElectrodePageStateFromDom();
      });
    });
