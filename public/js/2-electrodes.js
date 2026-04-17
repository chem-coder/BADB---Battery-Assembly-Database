    const roleSelect = document.getElementById('electrode-role');
    const tapeSelect = document.getElementById('electrodes-tape_id');
    const workflow = document.getElementById('cutting-workflow');
    const addCutBatchBtn = document.getElementById('add-cut-batch-btn');
    const workspace = document.getElementById('electrode-workspace');
    const batchTitle = document.getElementById('batch-title');

    function getDefaultElectrodeFiltersState() {
      return {
        role: null,
        tape_id: null,
        project_id: null,
        created_by: null
      };
    }

    function getDefaultCutBatchFormState() {
      return {
        comments: null,
        target_form_factor: null,
        target_config_code: null,
        target_config_other: null,
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
          currentTapeDryBoxState: null
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
          dirtySections: {}
        }
      };
    }

    const state = getDefaultElectrodePageState();
    const ELECTRODE_SECTION_KEYS = ['filters', 'batch', 'drying', 'drafts'];
    const ELECTRODE_DIRTY_MARKER_IDS = {
      filters: 'dirty-electrode-filters',
      batch: 'dirty-electrode-batch',
      drafts: 'dirty-electrode-drafts',
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
    }

    function setCurrentTapeDryBoxState(nextState) {
      state.selection.currentTapeDryBoxState = nextState || null;
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

    function cloneElectrodeSnapshot(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function getCurrentElectrodeSectionSnapshot(sectionKey) {
      switch (sectionKey) {
        case 'filters':
          return cloneElectrodeSnapshot(state.form.filters);
        case 'batch':
          return cloneElectrodeSnapshot(state.form.batch);
        case 'drying':
          return cloneElectrodeSnapshot(state.form.drying);
        case 'drafts':
          return cloneElectrodeSnapshot({
            foilMasses: state.drafts.foilMasses,
            electrodes: state.drafts.electrodes
          });
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

    function renderElectrodeDirtyMarkers() {
      Object.entries(ELECTRODE_DIRTY_MARKER_IDS).forEach(([sectionKey, elementId]) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.style.display = state.ui.dirtySections?.[sectionKey] ? 'inline' : 'none';
      });
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
        role: roleSelect.value || null,
        tape_id: tapeSelect.value || null,
        project_id: document.getElementById('electrodes-project_id').value || null,
        created_by: document.getElementById('electrodes-created_by').value || null
      });
    }

    function syncCutBatchFormStateFromDom() {
      setCutBatchFormState({
        comments: document.getElementById('electrodes-comments').value || null,
        target_form_factor: document.getElementById('electrodes-target_form_factor').value || null,
        target_config_code: document.getElementById('electrodes-target_config_code').value || null,
        target_config_other: document.getElementById('electrodes-target_config_other').value || null,
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

    function syncElectrodePageStateFromDom() {
      syncElectrodeFiltersStateFromDom();
      syncCutBatchFormStateFromDom();
      syncElectrodeDryingStateFromDom();
      syncElectrodeDraftStateFromDom();
      refreshElectrodeDirtyState();
    }

    function renderElectrodeFiltersForm() {
      roleSelect.value = state.form.filters.role || '';
      tapeSelect.value = state.form.filters.tape_id || '';
      document.getElementById('electrodes-project_id').value = state.form.filters.project_id || '';
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

    function renderCutBatchForm() {
      document.getElementById('electrodes-comments').value = state.form.batch.comments || '';
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

    function renderElectrodeWorkspace() {
      renderCutBatchForm();
      renderElectrodeDryingForm();
      renderFoilMassDrafts();
      renderElectrodeDraftRows();
      renderTapeDryBoxActions();
    }

    function tapeDryBoxStatusLabel(dryBoxState) {
      if (!dryBoxState) return '';
      return dryBoxState.availability_status === 'in_dry_box'
        ? 'Лента находится в сушильном шкафу'
        : dryBoxState.availability_status === 'depleted'
          ? 'Лента отмечена как израсходованная'
          : 'Лента находится вне сушильного шкафа';
    }

    function renderTapeDryBoxActions() {
      const fieldset = document.getElementById('electrodes-tape-dry-box');
      const status = document.getElementById('electrodes-tape-dry-box-status');
      const returnBtn = document.getElementById('electrodes-return-tape-btn');
      const depleteBtn = document.getElementById('electrodes-deplete-tape-btn');
      const dryBoxState = state.selection.currentTapeDryBoxState;
      const hasBatch = Boolean(state.selection.currentCutBatchId);

      if (!fieldset || !status || !returnBtn || !depleteBtn) return;

      fieldset.hidden = !hasBatch || !dryBoxState;

      if (!hasBatch || !dryBoxState) {
        status.textContent = '';
        returnBtn.disabled = true;
        depleteBtn.disabled = true;
        return;
      }

      status.textContent = tapeDryBoxStatusLabel(dryBoxState);
      returnBtn.disabled = dryBoxState.availability_status !== 'out_of_dry_box';
      depleteBtn.disabled = dryBoxState.availability_status === 'depleted';
    }

    function shouldShowElectrodeWorkflow() {
      return Boolean(state.form.filters.tape_id && state.form.filters.project_id);
    }

    function renderElectrodeWorkflowVisibility() {
      const shouldShowWorkflow = shouldShowElectrodeWorkflow();
      workflow.hidden = !shouldShowWorkflow;
      addCutBatchBtn.hidden = !shouldShowWorkflow;
      workspace.hidden = !state.selection.currentCutBatchId && batchTitle.textContent !== 'Новая партия';
    }

    function renderCurrentTapeCutBatchList() {
      const list = document.getElementById('current-cut-batches-list');
      const msg = document.getElementById('no-batches-msg');

      if (!list || !msg) return;

      list.innerHTML = '';
      batchTitle.textContent = state.selection.currentCutBatchId ? batchTitle.textContent : '';

      if (!state.form.filters.tape_id || !state.lists.cutBatches.length) {
        msg.style.display = 'block';
        return;
      }

      msg.style.display = 'none';

      state.lists.cutBatches.forEach(batch => {
        const li = document.createElement('li');

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.textAlign = 'left';
        btn.style.width = '100%';

        let status = '🟡 в работе';

        if (batch.drying_start && !batch.drying_end) {
          status = '🟠 сушится';
        }

        if (batch.drying_end) {
          status = '🟢 готово';
        }

        const dateText = batch.created_at
          ? new Date(batch.created_at).toLocaleDateString('ru-RU')
          : '—';

        const count = Number(batch.electrode_count) || 0;
        const electrodeWord =
          count % 10 === 1 && count % 100 !== 11 ? 'электрод' :
          [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'электрода' :
          'электродов';
        const targetText = formatCutBatchTarget(batch);
        const geometryText = formatCutBatchGeometry(batch);

        btn.textContent =
          `Партия ${batch.cut_batch_id}${targetText ? ` — ${targetText}` : ''}${geometryText ? ` — ${geometryText}` : ''} — ${dateText} — ${count} ${electrodeWord} — ${status}`;

        btn.onclick = () => selectBatch(batch);

        li.appendChild(btn);
        list.appendChild(li);
      });
    }

    function renderElectrodePage() {
      renderElectrodeFiltersForm();
      renderTapeOptions();
      renderCurrentTapeCutBatchList();
      renderAllCutBatches();
      renderElectrodeWorkspace();
      renderElectrodeWorkflowVisibility();
    }

    const electrodeInlineStatusTimers = {};

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
    }

    function showElectrodeInlineStatus(buttonId, message, isError = false) {
      const statusEl = ensureElectrodeInlineStatusElement(buttonId);
      if (!statusEl) return;

      statusEl.textContent = message || '';
      statusEl.classList.toggle('is-error', Boolean(isError));

      if (electrodeInlineStatusTimers[buttonId]) {
        clearTimeout(electrodeInlineStatusTimers[buttonId]);
      }

      if (!isError && message) {
        electrodeInlineStatusTimers[buttonId] = setTimeout(() => {
          clearElectrodeInlineStatus(buttonId);
        }, 2500);
      }
    }

    function ensureCutBatchListsVisible() {
      [
        document.getElementById('current-cut-batches-list'),
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
    });
    
    tapeSelect.addEventListener('change', async () => {
      syncElectrodeFiltersStateFromDom();
      if (state.selection.currentCutBatchId) return;
      const projectSelect = document.getElementById('electrodes-project_id');
      const list = document.getElementById('current-cut-batches-list');
      const msg = document.getElementById('no-batches-msg');
      
      if (!tapeSelect.value) {
        workflow.hidden = true;
        addCutBatchBtn.hidden = true;
        clearElectrodeWorkspace();
        list.innerHTML = '';
        msg.style.display = 'block';
        return;
      }
      
      const selectedOption = tapeSelect.selectedOptions[0];
      
      if (selectedOption && selectedOption.value) {
        roleSelect.value = selectedOption.dataset.role || '';
        projectSelect.value = selectedOption.dataset.projectId || '';
        
        renderTapeOptions();
        tapeSelect.value = selectedOption.value;
        syncElectrodeFiltersStateFromDom();
      }
      
      if (tapeSelect.value && projectSelect.value) {
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
    
    document.getElementById('electrodes-project_id')
    .addEventListener('change', async () => {
      syncElectrodeFiltersStateFromDom();
      if (state.selection.currentCutBatchId) return;
      
      renderTapeOptions();
      
      if (tapeSelect.value && document.getElementById('electrodes-project_id').value) {
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
      
      const projectSelect = document.getElementById('electrodes-project_id');
      
      if (tapeSelect.value && projectSelect.value) {
        workflow.hidden = false;
        addCutBatchBtn.hidden = false;
      } else {
        workflow.hidden = true;
        addCutBatchBtn.hidden = true;
        clearElectrodeWorkspace();
      }
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
            project_id: tape.project_id,
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
      const project = document.getElementById('electrodes-project_id').value;
      const currentValue = state.form.filters.tape_id || select.value || '';

      const filtered = state.reference.tapes.filter(t =>
        (!role || t.role === role) &&
        (!project || t.project_id == project)
      );

      select.innerHTML = '<option value="">— выбрать ленту —</option>';

      const cathodeGroup = document.createElement('optgroup');
      cathodeGroup.label = 'Катоды';

      const anodeGroup = document.createElement('optgroup');
      anodeGroup.label = 'Аноды';

      filtered.forEach(t => {
        const option = document.createElement('option');
        option.value = String(t.tape_id);
        option.dataset.role = t.role;
        option.dataset.projectId = String(t.project_id);

        const date = t.finished_at || '—';          
        const roleLabel = roleRu[t.role] || t.role;

        option.textContent = `#${t.tape_id} | ${t.name} (${roleLabel}) | ${date} | ${t.created_by}`;

        if (t.role === 'cathode') {
          cathodeGroup.appendChild(option);
        } else if (t.role === 'anode') {
          anodeGroup.appendChild(option);
        }

      });

      if (cathodeGroup.children.length) select.appendChild(cathodeGroup);
      if (anodeGroup.children.length) select.appendChild(anodeGroup);

      if (
        currentValue &&
        Array.from(select.options).some(option => option.value === String(currentValue))
      ) {
        select.value = String(currentValue);
      }
    }
    
    async function loadProjects() {
      const select = document.getElementById('electrodes-project_id');
      const data = await fetchElectrodeProjectsReference();

      if (!data.length) {
        setReferenceProjects([]);
        select.innerHTML = '<option value="">— выбрать проект —</option>';
        return;
      }

      setReferenceProjects(data);
      
      select.innerHTML = '<option value="">— выбрать проект —</option>';
      
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
        select.innerHTML = '<option value="">— выбрать пользователя —</option>';
        return;
      }

      setReferenceUsers(data);
      
      select.innerHTML = '<option value="">— выбрать пользователя —</option>';
      
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
      setCurrentTapeDryBoxState(null);
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

    function renderCutBatchListInto(list) {
      if (!list) return;

      ensureCutBatchListsVisible();
      list.hidden = false;
      list.innerHTML = '';

      if (!state.reference.allCutBatches.length) {
        const li = document.createElement('li');
        li.className = 'user-row';

        const info = document.createElement('div');
        info.className = 'user-info';
        info.textContent = 'Пока нет вырезанных партий электродов';

        li.appendChild(info);
        list.appendChild(li);
        return;
      }

      state.reference.allCutBatches.forEach(batch => {
        const li = document.createElement('li');
        li.className = 'user-row';

        const info = document.createElement('div');
        info.className = 'user-info';

        const title = document.createElement('strong');
        const dateText = batch.created_at
          ? new Date(batch.created_at).toLocaleDateString('ru-RU')
          : '—';
        const count = Number(batch.electrode_count) || 0;
        const targetText = formatCutBatchTarget(batch);
        const geometryText = formatCutBatchGeometry(batch);

        title.textContent =
          `Партия ${batch.cut_batch_id} | ${batch.tape_name || '—'}${targetText ? ` | ${targetText}` : ''}${geometryText ? ` | ${geometryText}` : ''} | ${count} эл. | ${batchStatusLabel(batch)}`;

        const meta = document.createElement('small');
        meta.style.color = '#666';
        meta.textContent =
          ` — ${dateText} — ${roleLabel(batch.tape_role)} — ${batch.created_by_name || batch.created_by || '—'}`;

        info.appendChild(title);
        info.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'actions';

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.textContent = '✏️';
        openBtn.title = 'Открыть партию';
        openBtn.onclick = async () => {
          const projectSelect = document.getElementById('electrodes-project_id');

          roleSelect.value = batch.tape_role || '';
          projectSelect.value = batch.project_id || '';
          renderTapeOptions();
          tapeSelect.value = String(batch.tape_id);
          syncElectrodeFiltersStateFromDom();

          workflow.hidden = false;
          addCutBatchBtn.hidden = false;

          await loadCutBatches(Number(batch.tape_id));
          await selectBatch(batch);
        };

        actions.appendChild(openBtn);

        li.appendChild(info);
        li.appendChild(actions);
        list.appendChild(li);
      });
    }

    function renderAllCutBatches() {
      ensureCutBatchListsVisible();
      renderCutBatchListInto(document.getElementById('all-cut-batches-list'));
    }
    
    function populateBatchWorkspace(batch) {
      workspace.hidden = false;
      setCurrentCutBatchId(batch.cut_batch_id);
      batchTitle.textContent = `Batch ${batch.cut_batch_id}`;

      setElectrodeFiltersState({
        ...state.form.filters,
        created_by: batch.created_by ?? null
      });
      setCutBatchFormState({
        comments: batch.comments ?? null,
        target_form_factor: batch.target_form_factor ?? null,
        target_config_code: batch.target_config_code ?? null,
        target_config_other: batch.target_config_other ?? null,
        shape: batch.shape ?? null,
        diameter_mm: batch.diameter_mm ?? null,
        length_mm: batch.length_mm ?? null,
        width_mm: batch.width_mm ?? null
      });

      renderElectrodeFiltersForm();
      renderElectrodePage();
      syncCutBatchFormStateFromDom();
    }

    function buildCutBatchPayload({ tapeId, createdBy }) {
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
        created_by: createdBy,
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
      const electrodes = await fetchCutBatchElectrodes(cutBatchId);

      if (!electrodes.length) {
        setCurrentBatchElectrodes([]);
        renderElectrodes([]);
        return;
      }

      setCurrentBatchElectrodes(electrodes);
      renderElectrodes(electrodes);
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
        
        const cupCell = document.createElement('td');
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
        tr.appendChild(cupCell);
        tr.appendChild(commentCell);
        tr.appendChild(statusCell);
        tr.appendChild(actionCell);
        
        body.appendChild(tr);
        
      });
      
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
      setCurrentCutBatchId(null);
      clearElectrodeWorkspace();
      workspace.hidden = false;
      batchTitle.textContent = 'Новая партия';
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
      
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          appendFoilMassRow();
          const rows = foilMassBody.querySelectorAll('.foil-mass-value');
          rows[rows.length - 1].focus();
        }
      });
      
      removeBtn.addEventListener('click', () => {
        tr.remove();
        
        if (!foilMassBody.querySelector('tr')) {
          appendFoilMassRow();
          return;
        }
        
        renumberFoilMassRows();
        recalculateFoilMassAverage();
        syncElectrodeDraftStateFromDom();
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
      syncElectrodeDraftStateFromDom();
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
      
      const cupTd = document.createElement('td');
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
      
      const commentTd = document.createElement('td');
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
      
      const statusTd = document.createElement('td');
      statusTd.textContent = 'новый';
      
      const actionTd = document.createElement('td');
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '🗑️';
      actionTd.appendChild(removeBtn);
      
      tr.appendChild(numTd);
      tr.appendChild(massTd);
      tr.appendChild(cupTd);
      tr.appendChild(commentTd);
      tr.appendChild(statusTd);
      tr.appendChild(actionTd);
      
      electrodesBody.appendChild(tr);
      
      renumberElectrodeRows();
      
      massInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          appendElectrodeRow();
          const inputs = electrodesBody.querySelectorAll('.electrode-mass');
          inputs[inputs.length - 1].focus();
        }
      });
      
      removeBtn.addEventListener('click', () => {
        tr.remove();
        
        if (!electrodesBody.querySelector('tr')) {
          appendElectrodeRow();
          return;
        }
        
        renumberElectrodeRows();
        syncElectrodeDraftStateFromDom();
      });
      
    }
    
    addElectrodeRowBtn.addEventListener('click', () => {
      
      appendElectrodeRow();
      syncElectrodeDraftStateFromDom();
      
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
      return Object.values(state.ui.dirtySections).some(Boolean);
    }

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
      
      clearElectrodeWorkspace();
      
      workflow.hidden = true;
      workspace.hidden = true;
      
      roleSelect.value = '';
      document.getElementById('electrodes-project_id').value = '';
      tapeSelect.value = '';
      syncElectrodeFiltersStateFromDom();
      
      const list = document.getElementById('current-cut-batches-list');
      const msg = document.getElementById('no-batches-msg');
      
      list.innerHTML = '';
      msg.style.display = 'block';

      renderElectrodePage();
      
    });
    
    /* ---------- SAVE BATCH ---------- */
    
    const saveBtn = document.getElementById('saveBtn');
    
    saveBtn.addEventListener('click', async () => {
      
      syncElectrodePageStateFromDom();
      const tapeId = Number(state.form.filters.tape_id);
      const createdBy = Number(state.form.filters.created_by);
      
      if (!tapeId || !createdBy) {
        showElectrodeInlineStatus('saveBtn', 'Не выбрана лента или оператор', true);
        return;
      }
      
      /* ---------- CREATE BATCH IF NEEDED ---------- */
      
      if (!state.selection.currentCutBatchId) {
        const payload = buildCutBatchPayload({ tapeId, createdBy });
        
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
        const payload = buildCutBatchPayload({ tapeId, createdBy });

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

    document.getElementById('electrodes-return-tape-btn').addEventListener('click', async () => {
      const tapeId = Number(state.form.filters.tape_id);
      const updatedBy = Number(state.form.filters.created_by);

      if (!tapeId || !updatedBy) {
        showElectrodeInlineStatus('electrodes-return-tape-btn', 'Не выбрана лента или оператор', true);
        return;
      }

      const res = await fetch(`/api/tapes/${tapeId}/dry-box-state/return-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updated_by: updatedBy })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showElectrodeInlineStatus('electrodes-return-tape-btn', data.error || 'Ошибка возврата ленты в шкаф', true);
        return;
      }

      setCurrentTapeDryBoxState(data);
      await loadTapes();
      renderElectrodePage();
      showElectrodeInlineStatus('electrodes-return-tape-btn', 'Лента возвращена в шкаф');
    });

    document.getElementById('electrodes-deplete-tape-btn').addEventListener('click', async () => {
      const tapeId = Number(state.form.filters.tape_id);
      const updatedBy = Number(state.form.filters.created_by);

      if (!tapeId || !updatedBy) {
        showElectrodeInlineStatus('electrodes-deplete-tape-btn', 'Не выбрана лента или оператор', true);
        return;
      }

      const res = await fetch(`/api/tapes/${tapeId}/dry-box-state/deplete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updated_by: updatedBy })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showElectrodeInlineStatus('electrodes-deplete-tape-btn', data.error || 'Ошибка изменения статуса ленты', true);
        return;
      }

      setCurrentTapeDryBoxState(data);
      await loadTapes();
      renderElectrodePage();
      showElectrodeInlineStatus('electrodes-deplete-tape-btn', 'Лента отмечена как израсходованная');
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
      if (!hasUnsavedChanges()) return;
      e.preventDefault();
      e.returnValue = '';
    });

    initElectrodePage();
    
    document.querySelectorAll('input, textarea, select').forEach(el => {
      el.addEventListener('input', () => {
        syncElectrodePageStateFromDom();
      });
    });
