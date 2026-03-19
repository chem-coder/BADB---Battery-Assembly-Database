const projectSelect = document.getElementById('battery_project_id');
const createdBySelect = document.getElementById('battery_created_by');

let currentBatteryId = null;
let batteries = [];
let tapes = [];

let cathodeBatches = [];
let anodeBatches = [];

let cathodeTapes = [];
let anodeTapes = [];

let cathodeElectrodes = [];
let anodeElectrodes = [];

let selectedCathodes = [];
let selectedAnodes = [];

// -------- API helpers --------

// -------- FORM SERIALIZATION --------

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
    } else {
      el.value = data[key] ?? '';
    }
    
  });
  
}



// -------- GENERIC API SAVE --------

async function saveSection(url, payload) {
  
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'API error');
  }
  
  return res.json();
  
}


// -------- SAVE Helpers --------

async function saveBatteryConfig() {
  
  const coinFs  = document.getElementById('coin_config');
  const pouchFs = document.getElementById('pouch_config');
  const cylFs   = document.getElementById('cyl_config');
  
  let fieldset;
  let table;
  
  if (!coinFs.hidden) {
    fieldset = coinFs;
    table = 'battery_coin_config';
  } else if (!pouchFs.hidden) {
    fieldset = pouchFs;
    table = 'battery_pouch_config';
  } else if (!cylFs.hidden) {
    fieldset = cylFs;
    table = 'battery_cyl_config';
  } else {
    alert('No configuration section is active.');
    return;
  }
  
  const payload = serializeFieldset(fieldset);
  
  let res = await fetch(`/api/batteries/${table}/${currentBatteryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (res.status === 404) {
    res = await fetch(`/api/batteries/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        battery_id: currentBatteryId,
        ...payload
      })
    });
  }
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert('Failed to save configuration: ' + (err.error || res.status));
    return;
  }
  
  alert('Configuration saved.');
}



async function saveElectrodeSources() {
  
  if (!currentBatteryId) {
    alert('Сначала создайте элемент.');
    return;
  }
  
  const formFactor = document.getElementById('battery_form_factor').value;
  const mode = document.getElementById('coin_cell_mode')?.value;
  const halfType = document.getElementById('coin_half_cell_type')?.value;

  let payload = {
    battery_id: currentBatteryId
  };

  if (formFactor === 'coin' && mode === 'half_cell') {

    if (halfType === 'cathode_vs_li') {
      payload.cathode_tape_id = document.getElementById('cathode_tape_id')?.value || null;
      payload.cathode_cut_batch_id = document.getElementById('cathode_cut_batch_id')?.value || null;
      payload.cathode_source_notes = document.getElementById('cathode_source_notes')?.value || null;
    }

    if (halfType === 'anode_vs_li') {
      payload.anode_tape_id = document.getElementById('anode_tape_id')?.value || null;
      payload.anode_cut_batch_id = document.getElementById('anode_cut_batch_id')?.value || null;
      payload.anode_source_notes = document.getElementById('anode_source_notes')?.value || null;
    }

  } else {

    payload.cathode_tape_id = document.getElementById('cathode_tape_id')?.value || null;
    payload.cathode_cut_batch_id = document.getElementById('cathode_cut_batch_id')?.value || null;
    payload.cathode_source_notes = document.getElementById('cathode_source_notes')?.value || null;

    payload.anode_tape_id = document.getElementById('anode_tape_id')?.value || null;
    payload.anode_cut_batch_id = document.getElementById('anode_cut_batch_id')?.value || null;
    payload.anode_source_notes = document.getElementById('anode_source_notes')?.value || null;

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
  
  alert('Источники электродов сохранены.');
}

async function saveElectrodeStack() {
  
  if (!currentBatteryId) {
    alert('Сначала создайте элемент.');
    return;
  }
  
  const stack = buildStackPayload();
  
  if (!stack || stack.length === 0) {
    alert('Стек электродов пуст.');
    return;
  }
  
  const res = await fetch(`/api/batteries/battery_electrodes/${currentBatteryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stack)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert('Ошибка сохранения стека: ' + (err.error || res.status));
    return;
  }
  
  alert('Стек электродов сохранён.');
}


async function saveFieldsetSection(fieldsetId, routeBase) {
  if (!currentBatteryId) {
    alert('Сначала создайте элемент.');
    return null;
  }

  const fieldset = document.getElementById(fieldsetId);
  const payload = serializeFieldset(fieldset);

  let res = await fetch(`/api/batteries/${routeBase}/${currentBatteryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.status === 404) {
    res = await fetch(`/api/batteries/${routeBase}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        battery_id: currentBatteryId,
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
  const formFactor = document.getElementById('battery_form_factor').value;

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
  if (!currentBatteryId) {
    alert('Сначала создайте элемент.');
    return;
  }

  const ctx = getActiveAssemblyContext();

  if (!ctx) {
    alert('Не выбран форм-фактор');
    return;
  }

  try {
    const fieldset = document.getElementById(ctx.fieldsetId);
    const payload = serializeFieldset(fieldset);

    // split payload by destination table
    const separatorPayload = {
      separator_id: payload.separator_id,
      separator_notes: payload.separator_notes
    };

    const electrolytePayload = {
      electrolyte_id: payload.electrolyte_id,
      electrolyte_notes: payload.electrolyte_notes,
      electrolyte_total_ul: payload.electrolyte_total_ul
    };

    const configPayload = { ...payload };
    delete configPayload.separator_id;
    delete configPayload.separator_notes;
    delete configPayload.electrolyte_id;
    delete configPayload.electrolyte_notes;
    delete configPayload.electrolyte_total_ul;

    // 1. save form-factor config
    await saveFieldsetSection(ctx.fieldsetId, ctx.configRoute);

    // 2. save separator
    await fetch(`/api/batteries/battery_sep_config/${currentBatteryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(separatorPayload)
    }).then(async (res) => {
      if (res.status === 404) {
        const postRes = await fetch('/api/batteries/battery_sep_config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            battery_id: currentBatteryId,
            ...separatorPayload
          })
        });
        if (!postRes.ok) {
          const err = await postRes.json().catch(() => ({}));
          throw new Error(err.error || 'Ошибка сохранения сепаратора');
        }
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ошибка сохранения сепаратора');
      }
    });

    // 3. save electrolyte
    await fetch(`/api/batteries/battery_electrolyte/${currentBatteryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(electrolytePayload)
    }).then(async (res) => {
      if (res.status === 404) {
        const postRes = await fetch('/api/batteries/battery_electrolyte', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            battery_id: currentBatteryId,
            ...electrolytePayload
          })
        });
        if (!postRes.ok) {
          const err = await postRes.json().catch(() => ({}));
          throw new Error(err.error || 'Ошибка сохранения электролита');
        }
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ошибка сохранения электролита');
      }
    });

    alert('Сохранено.');
  } catch (err) {
    console.error(err);
    alert(err.message || 'Ошибка сохранения параметров сборки');
  }
}


async function saveBatteryQc() {
  await saveFieldsetSection('battery_qc', 'battery_qc');
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



// -------- LOAD Helpers --------

async function loadProjects() {
  
  const current = projectSelect.value;
  
  const res = await fetch('/api/projects?project_id=0');
  const data = await res.json();
  
  console.log('loadProjects current before rebuild =', projectSelect.value);
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
  
  console.log('loadUsers current before rebuild =', createdBySelect.value);
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
  
  batteries = await res.json();
  
  renderBatteriesList();
  
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
  
  tapes = await res.json();
  
  renderTapeOptions();
  
}


async function loadCathodeBatches(tapeId) {
  
  const res =
  await fetch(`/api/tapes/${tapeId}/electrode-cut-batches`);
  
  if (!res.ok) {
    console.error('Failed to load cathode batches');
    return;
  }
  
  cathodeBatches = await res.json();
  
  renderCathodeBatchOptions();
  
}

async function loadAnodeBatches(tapeId) {
  
  const res =
  await fetch(`/api/tapes/${tapeId}/electrode-cut-batches`);
  
  if (!res.ok) {
    console.error('Failed to load anode batches');
    return;
  }
  
  anodeBatches = await res.json();
  
  renderAnodeBatchOptions();
  
}


async function loadCathodeElectrodes(batchId) {
  
  const res =
  await fetch(`/api/electrodes/electrode-cut-batches/${batchId}/electrodes`);
  
  if (!res.ok) {
    console.error('Failed to load cathode electrodes');
    return;
  }
  
  cathodeElectrodes = (await res.json()).filter(e => e.status_code === 1);
  
  renderCathodeElectrodeTable();
  
}

async function loadAnodeElectrodes(batchId) {
  
  const res =
  await fetch(`/api/electrodes/electrode-cut-batches/${batchId}/electrodes`);
  
  if (!res.ok) {
    console.error('Failed to load anode electrodes');
    return;
  }
  
  anodeElectrodes = (await res.json()).filter(e => e.status_code === 1);
  
  renderAnodeElectrodeTable();
  
}


// Load saved battery data
async function loadElectrodeSources(batteryId) {
  
  const res = await fetch(`/api/batteries/battery_electrode_sources/${batteryId}`);
  
  if (!res.ok) {
    console.error('Failed to load electrode sources');
    return;
  }
  
  const data = await res.json();
  
  if (!data) return;
  
  const cathodeTape = document.getElementById('cathode_tape_id');
  const cathodeBatch = document.getElementById('cathode_cut_batch_id');
  
  const anodeTape = document.getElementById('anode_tape_id');
  const anodeBatch = document.getElementById('anode_cut_batch_id');
  
  cathodeTape.value = data.cathode_tape_id || '';
  anodeTape.value = data.anode_tape_id || '';
  
  if (data.cathode_tape_id) {
    await loadCathodeBatches(data.cathode_tape_id);
    cathodeBatch.value = data.cathode_cut_batch_id || '';
  }
  
  if (data.anode_tape_id) {
    await loadAnodeBatches(data.anode_tape_id);
    anodeBatch.value = data.anode_cut_batch_id || '';
  }
  
}

async function loadElectrodeStack(batteryId) {
  
  const res = await fetch(`/api/batteries/battery_electrodes/${batteryId}`);
  
  if (!res.ok) return;
  
  const stack = await res.json();
  
  if (!stack || stack.length === 0) return;
  
  // reset current selections
  selectedCathodes = [];
  selectedAnodes = [];
  
  for (const row of stack) {
    
    const electrode = {
      electrode_id: row.electrode_id,
      electrode_mass_g: row.electrode_mass_g ?? null
    };
    
    if (row.role === 'cathode') {
      selectedCathodes.push(electrode);
    }
    
    if (row.role === 'anode') {
      selectedAnodes.push(electrode);
    }
    
  }
  
  renderStackPreview();
  
}


// Load a battery for editing
async function loadBatteryAssembly(batteryId) {
  
  const res = await fetch(`/api/batteries/${batteryId}/assembly`);
  
  if (!res.ok) {
    console.error('Failed to load battery assembly');
    return;
  }
  
  const data = await res.json();
  
  populateFieldset(
    document.getElementById('coin_config'),
    data.coin_config
  );
  
  populateFieldset(
    document.getElementById('pouch_config'),
    data.pouch_config
  );
  
  populateFieldset(
    document.getElementById('cyl_config'),
    data.cyl_config
  );

  populateFieldset(document.getElementById('coin_assembly'), {
    ...(data.coin_config || {}),
    ...(data.separator || {}),
    ...(data.electrolyte || {})
  });

  populateFieldset(document.getElementById('pouch_assembly'), {
    ...(data.pouch_config || {}),
    ...(data.separator || {}),
    ...(data.electrolyte || {})
  });

  populateFieldset(document.getElementById('cyl_assembly'), {
    ...(data.cyl_config || {}),
    ...(data.separator || {}),
    ...(data.electrolyte || {})
  });
  
  document.getElementById('battery_form_factor')
  .dispatchEvent(new Event('change'));
  
  document.getElementById('coin_cell_mode')
  .dispatchEvent(new Event('change'));
  
  document.getElementById('coin_half_cell_type')
  .dispatchEvent(new Event('change'));
  
  const battery = data.battery;
  
  /* restore header */
  
  document.getElementById('battery_project_id').value =
  battery.project_id ?? '';
  
  document.getElementById('battery_created_by').value =
  battery.created_by ?? '';
  
  document.getElementById('battery_form_factor').value =
  battery.form_factor ?? '';
  
  document.getElementById('battery_notes').value =
  battery.notes ?? '';
  
  /* restore stack */
  
  if (Array.isArray(data.electrodes) && data.electrodes.length > 0) {
    
    selectedCathodes = [];
    selectedAnodes = [];
    
    data.electrodes.forEach(row => {
      
      const electrode = {
        electrode_id: row.electrode_id,
        electrode_mass_g: row.electrode_mass_g ?? null
      };
      
      if (row.role === 'cathode') {
        selectedCathodes.push(electrode);
      }
      
      if (row.role === 'anode') {
        selectedAnodes.push(electrode);
      }
    });
  }
  
  /* restore tape sources first */
  
  let savedCathodeBatchId = '';
  let savedAnodeBatchId = '';
  
  if (Array.isArray(data.electrode_sources)) {
    
    data.electrode_sources.forEach(src => {
      
      if (src.role === 'cathode') {
        
        if (src.tape_id) {
          document.getElementById('cathode_tape_id').value =
          src.tape_id;
        }
        
        if (src.cut_batch_id) {
          savedCathodeBatchId = String(src.cut_batch_id);
        }
        
      }
      
      if (src.role === 'anode') {
        
        if (src.tape_id) {
          document.getElementById('anode_tape_id').value =
          src.tape_id;
        }
        
        if (src.cut_batch_id) {
          savedAnodeBatchId = String(src.cut_batch_id);
        }
        
      }
      
    });
    
  }
  
  /* load batches from restored tapes */
  
  const cathodeTapeId =
  document.getElementById('cathode_tape_id').value;
  
  if (cathodeTapeId) {
    await loadCathodeBatches(cathodeTapeId);
  }
  
  const anodeTapeId =
  document.getElementById('anode_tape_id').value;
  
  if (anodeTapeId) {
    await loadAnodeBatches(anodeTapeId);
  }
  
  /* restore saved batch selections */
  
  if (savedCathodeBatchId) {
    document.getElementById('cathode_cut_batch_id').value =
    savedCathodeBatchId;
  }
  
  if (savedAnodeBatchId) {
    document.getElementById('anode_cut_batch_id').value =
    savedAnodeBatchId;
  }
  
  /* load electrodes for restored batches */
  
  if (savedCathodeBatchId) {
    await loadCathodeElectrodes(savedCathodeBatchId);
  }
  
  if (savedAnodeBatchId) {
    await loadAnodeElectrodes(savedAnodeBatchId);
  }
  
  /* restore checkbox state */
  
  await loadElectrodeStack(currentBatteryId);
  
  document
  .querySelectorAll('#stack_cathode_table_body input[type="checkbox"]')
  .forEach(cb => {
    
    const id = Number(cb.value);
    
    if (selectedCathodes.some(e => e.electrode_id === id)) {
      cb.checked = true;
    }
    
  });
  
  document
  .querySelectorAll('#stack_anode_table_body input[type="checkbox"]')
  .forEach(cb => {
    
    const id = Number(cb.value);
    
    if (selectedAnodes.some(e => e.electrode_id === id)) {
      cb.checked = true;
    }
    
  });
  
  renderStackSummary();
  
  /* freeze upstream inputs if electrodes exist */
  
  const lock = Array.isArray(data.electrodes) && data.electrodes.length > 0;
  
  document.getElementById('battery_project_id').disabled = lock;
  document.getElementById('battery_created_by').disabled = lock;
  document.getElementById('battery_form_factor').disabled = lock;
  
  document.getElementById('cathode_tape_id').disabled = lock;
  document.getElementById('cathode_cut_batch_id').disabled = lock;
  
  document.getElementById('anode_tape_id').disabled = lock;
  document.getElementById('anode_cut_batch_id').disabled = lock;
  
  const banner = document.getElementById('assembly_locked_banner');
  
  if (banner) {
    banner.classList.toggle('visible', lock);
  }
  
}


// -------- Rendering --------

function renderBatteriesList() {
  
  const list = document.getElementById('batteriesList');
  
  list.innerHTML = '';
  
  batteries.forEach(b => {
    
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
  
  const projectId =
  document.getElementById('battery_project_id').value;
  
  const cathodeSelect =
  document.getElementById('cathode_tape_id');
  
  const anodeSelect =
  document.getElementById('anode_tape_id');
  
  cathodeSelect.innerHTML =
  '<option value="">— выбрать ленту —</option>';
  
  anodeSelect.innerHTML =
  '<option value="">— выбрать ленту —</option>';
  
  const filtered = tapes.filter(t =>
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
  
  cathodeBatches.forEach(b => {
    
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
  
  anodeBatches.forEach(b => {
    
    const option = document.createElement('option');
    
    option.value = b.cut_batch_id;
    
    option.textContent =
    `#${b.cut_batch_id} | ${b.created_by}`;
    
    select.appendChild(option);
    
  });
  
}


function renderCathodeElectrodeTable() {
  
  const body =
  document.getElementById('stack_cathode_table_body');
  
  body.innerHTML = '';
  //      selectedCathodes = [];
  //     renderStackSummary();
  
  cathodeElectrodes.forEach((e, index) => {
    
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
    
    checkbox.addEventListener('change', e => {
      
      const electrodeId = Number(e.target.value);
      
      if (e.target.checked) {
        
        const electrode =
        cathodeElectrodes.find(
          el => el.electrode_id === electrodeId
        );
        
        selectedCathodes.push(electrode);
        
      } else {
        
        selectedCathodes =
        selectedCathodes.filter(
          el => el.electrode_id !== electrodeId
        );
        
      }
      
      renderStackSummary();
      
    });
    
    checkbox.value = e.electrode_id;
    
    if (e.status_code !== 1) {
      checkbox.disabled = true;
    }
    
    selectCell.appendChild(checkbox);
    tr.appendChild(selectCell);
    
    body.appendChild(tr);
    
  });
  
}

function renderAnodeElectrodeTable() {
  
  const body =
  document.getElementById('stack_anode_table_body');
  
  body.innerHTML = '';
  //      selectedAnodes = [];
  //      renderStackSummary();
  
  anodeElectrodes.forEach((e, index) => {
    
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
    
    checkbox.addEventListener('change', e => {
      
      const electrodeId = Number(e.target.value);
      
      if (e.target.checked) {
        
        const electrode =
        anodeElectrodes.find(
          el => el.electrode_id === electrodeId
        );
        
        selectedAnodes.push(electrode);
        
      } else {
        
        selectedAnodes =
        selectedAnodes.filter(
          el => el.electrode_id !== electrodeId
        );
        
      }
      
      renderStackSummary();
      
    });
    
    checkbox.value = e.electrode_id;
    
    if (e.status_code !== 1) {
      checkbox.disabled = true;
    }
    
    selectCell.appendChild(checkbox);
    tr.appendChild(selectCell);
    
    body.appendChild(tr);
    
  });
  
}


function renderStackSummary() {
  
  const body =
  document.getElementById('battery_stack_summary_body');
  
  body.innerHTML = '';
  
  const mode =
  document.getElementById('coin_cell_mode')?.value;
  
  const halfType =
  document.getElementById('coin_half_cell_type')?.value;
  
  let cathodes = [...selectedCathodes];
  let anodes = [...selectedAnodes];
  
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



// -------- Status helper --------

function buildStackPayload() {
  
  const stack = [];
  
  let position = 1;
  
  const cathodes = [...selectedCathodes];
  const anodes = [...selectedAnodes];
  
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
  
  const formFactor =
  document.getElementById('battery_form_factor').value;
  
  const coinCellMode =
  document.getElementById('coin_cell_mode').value;
  
  const cathodes = selectedCathodes.length;
  const anodes = selectedAnodes.length;
  
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
  
  const formFactor =
  document.getElementById('battery_form_factor').value;
  
  const coinCellMode =
  document.getElementById('coin_cell_mode').value;
  
  const halfCellType =
  document.getElementById('coin_half_cell_type').value;
  
  const cathodes = selectedCathodes.length;
  const anodes = selectedAnodes.length;
  
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
  
  selectedCathodes = [];
  selectedAnodes = [];
  
  cathodeElectrodes = [];
  anodeElectrodes = [];
  
  cathodeBatches = [];
  anodeBatches = [];
  
  document.getElementById('cathode_tape_id').value = '';
  document.getElementById('anode_tape_id').value = '';
  
  document.getElementById('cathode_cut_batch_id').innerHTML =
  '<option value="">— выбрать партию —</option>';
  
  document.getElementById('anode_cut_batch_id').innerHTML =
  '<option value="">— выбрать партию —</option>';
  
  document.getElementById('stack_cathode_table_body').innerHTML = '';
  document.getElementById('stack_anode_table_body').innerHTML = '';
  
  renderStackSummary();
  
}



// -------- Events --------

// prevent default form submission
document
.querySelector('form[name="battery_assembly_log_form"]')
.addEventListener('submit', (e) => {
  e.preventDefault();
});

/* ---------- EXIT BATTERIES ---------- */

const exitBatteriesBtn = document.getElementById('exitBatteriesBtn');

exitBatteriesBtn.addEventListener('click', () => {

  const confirmExit = confirm('Выйти без сохранения?');

  if (!confirmExit) return;

  currentBatteryId = null;

  // reset form
  document.querySelector('form[name="battery_assembly_log_form"]').reset();

  // hide workspace + header
  document.getElementById('battery_workspace').hidden = true;
  document.getElementById('battery_header').hidden = true;

  // clear electrode-related state (this function EXISTS)
  resetElectrodeSelection();

  // clear batteries list UI
  const list = document.getElementById('batteriesList');
  list.innerHTML = '';

  loadBatteries();

});


document.getElementById('battery_create_btn').onclick = async () => {
  
  const projectId = document.getElementById('battery_project_id').value;
  const createdBy = document.getElementById('battery_created_by').value;
  const formFactor = document.getElementById('battery_form_factor').value;
  const batteryNotes = document.getElementById('battery_notes').value;
  
  if (!projectId || !createdBy || !formFactor) {
    alert('Заполните проект, оператора и форм-фактор');
    return;
  }
  
  try {
    
    if (!currentBatteryId) {
      
      const payload = {
        project_id: Number(projectId),
        created_by: Number(createdBy),
        form_factor: formFactor,
        battery_notes: batteryNotes || null
      };
      
      const res = await fetch('/api/batteries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        throw new Error('Ошибка создания аккумулятора');
      }
      
      const battery = await res.json();
      
      currentBatteryId = battery.battery_id;
      
      unlockBatteryWorkspace({
        battery_id: battery.battery_id,
        project_id: battery.project_id,
        created_by: battery.created_by,
        form_factor: battery.form_factor,
        notes: battery.battery_notes ?? null
      });
      
      document.getElementById('battery_create_btn').textContent =
      'Сохранить шапку';
      
      await loadTapes();
      await loadBatteries();
      
      return;
    }
    
    const headerPayload = {
      project_id: Number(projectId),
      created_by: Number(createdBy),
      form_factor: formFactor,
      battery_notes: batteryNotes || null
    };
    
    const updatedBattery = await updateBatteryMeta(
      currentBatteryId,
      headerPayload
    );
    
    unlockBatteryWorkspace(updatedBattery);
    await loadTapes();
    await loadBatteries();
    
    alert('Шапка аккумулятора сохранена');
    
  } catch (err) {
    
    console.error(err);
    alert('Ошибка сохранения аккумулятора');
    
  }
  
};

async function populateBatteryForm(battery) {
  
  currentBatteryId = battery.battery_id;
  
  document.getElementById('battery_project_id').value =
  battery.project_id ?? '';
  
  document.getElementById('battery_created_by').value =
  battery.created_by ?? '';
  
  document.getElementById('battery_form_factor').value =
  battery.form_factor ?? '';
  
  document.getElementById('battery_notes').value =
  battery.notes ?? '';
  
  const btn = document.getElementById('battery_create_btn');
  btn.textContent = 'Сохранить изменения';
  btn.dataset.mode = 'update';
  
  unlockBatteryWorkspace(battery);
  
  document.getElementById('battery_form_factor').dispatchEvent(
    new Event('change')
  );
  
  await loadTapes();
  
  await loadBatteryAssembly(battery.battery_id);
  
}


function unlockBatteryWorkspace(battery) {
  
  document.getElementById('battery_header').hidden = false;
  document.getElementById('battery_workspace').hidden = false;
  
  document.getElementById('battery_id_label').textContent =
  `#${battery.battery_id}`;
  
  const projectSelect =
  document.getElementById('battery_project_id');
  
  const operatorSelect =
  document.getElementById('battery_created_by');
  
  const formFactorSelect =
  document.getElementById('battery_form_factor');
  
  document.getElementById('battery_project_label').textContent =
  projectSelect.selectedOptions[0]?.textContent || '—';
  
  document.getElementById('battery_formfactor_label').textContent =
  formFactorSelect.selectedOptions[0]?.textContent || '—';
  
  document.getElementById('battery_operator_label').textContent =
  operatorSelect.selectedOptions[0]?.textContent || '—';
  
}


const formFactorSelect =
document.getElementById('battery_form_factor');

formFactorSelect.addEventListener('change', () => {
  
  const coinConfig = document.getElementById('coin_config');
  const pouchConfig = document.getElementById('pouch_config');
  const cylConfig = document.getElementById('cyl_config');
  
  const coinAssembly = document.getElementById('coin_assembly');
  const pouchAssembly = document.getElementById('pouch_assembly');
  const cylAssembly = document.getElementById('cyl_assembly');
  
  let totalVolumeInput = null;

  if (formFactorSelect.value === 'coin') {
    totalVolumeInput = document.getElementById('coin_electrolyte_total_ul');
  }

  if (formFactorSelect.value === 'pouch') {
    totalVolumeInput = document.getElementById('pouch_electrolyte_total_ul');
  }

  if (formFactorSelect.value === 'cylindrical') {
    totalVolumeInput = document.getElementById('cyl_electrolyte_total_ul');
  }
  
  coinConfig.hidden = true;
  pouchConfig.hidden = true;
  cylConfig.hidden = true;
  
  coinAssembly.hidden = true;
  pouchAssembly.hidden = true;
  cylAssembly.hidden = true;
  
  if (formFactorSelect.value === 'coin') {
    coinConfig.hidden = false;
    coinAssembly.hidden = false;
    totalVolumeInput.readOnly = true;
  }
  
  if (formFactorSelect.value === 'pouch') {
    pouchConfig.hidden = false;
    pouchAssembly.hidden = false;
    totalVolumeInput.readOnly = false;
  }
  
  if (formFactorSelect.value === 'cylindrical') {
    cylConfig.hidden = false;
    cylAssembly.hidden = false;
    totalVolumeInput.readOnly = false;
  }
  
});


const coinCellModeSelect =
document.getElementById('coin_cell_mode');

const halfCellTypeSelect =
document.getElementById('coin_half_cell_type');

coinCellModeSelect.addEventListener('change', () => {
  
  const halfTypeBlock =
  document.getElementById('coin_half_cell_type_block');
  
  if (coinCellModeSelect.value === 'half_cell') {
    halfTypeBlock.hidden = false;
  } else {
    halfTypeBlock.hidden = true;
  }
  
});

halfCellTypeSelect.addEventListener('change', () => { 
  
  const cathodeBlock =
  document.getElementById('cathode_source_block');
  
  const anodeBlock =
  document.getElementById('anode_source_block');
  
  const liFoilBlock =
  document.getElementById('li-foil_block');
  
  cathodeBlock.hidden = false;
  anodeBlock.hidden = false;
  liFoilBlock.hidden = true;
  
  if (halfCellTypeSelect.value === 'cathode_vs_li') {
    
    anodeBlock.hidden = true;
    liFoilBlock.hidden = false;
    
  }
  
  if (halfCellTypeSelect.value === 'anode_vs_li') {
    
    cathodeBlock.hidden = true;
    liFoilBlock.hidden = false;
    
  }
  
  resetElectrodeSelection();
  
});

document
.getElementById('battery_project_id')
.addEventListener('change', () => {
  console.log('battery_project_id changed to', document.getElementById('battery_project_id').value);
  resetElectrodeSelection();
  loadTapes();
  console.log('battery_project_id changed to', document.getElementById('battery_project_id').value);
});

document
.getElementById('cathode_tape_id')
.addEventListener('change', e => {
  
  const tapeId = e.target.value;
  
  if (!tapeId) return;
  
  loadCathodeBatches(tapeId);
  
});

document
.getElementById('anode_tape_id')
.addEventListener('change', e => {
  
  const tapeId = e.target.value;
  
  if (!tapeId) return;
  
  loadAnodeBatches(tapeId);
  
});

document
.getElementById('cathode_cut_batch_id')
.addEventListener('change', e => {
  
  const batchId = e.target.value;
  
  if (!batchId) return;
  
  loadCathodeElectrodes(batchId);
  
});

document
.getElementById('anode_cut_batch_id')
.addEventListener('change', e => {
  
  const batchId = e.target.value;
  
  if (!batchId) return;
  
  loadAnodeElectrodes(batchId);
  
});

const dropCountInput =
document.getElementById('electrolyte_drop_count');

const dropVolumeInput =
document.getElementById('electrolyte_drop_volume');

function updateElectrolyteVolume() {
  
  const formFactor =
  document.getElementById('battery_form_factor').value;
  
  if (formFactor !== 'coin') return;
  
  const count = Number(dropCountInput.value);
  const volume = Number(dropVolumeInput.value);
  
  if (!count || !volume) {
    totalVolumeInput.value = '';
    return;
  }
  
  const totalVolumeInput =
  document.getElementById('coin_electrolyte_total_ul');

  totalVolumeInput.value = (count * volume).toFixed(2);
  
}

dropCountInput.addEventListener('input', updateElectrolyteVolume);
dropVolumeInput.addEventListener('input', updateElectrolyteVolume);



// -------- Init --------

window.addEventListener('focus', () => {
  
  loadUsers();
  loadProjects();
  loadSeparators();
  loadElectrolytes();
  
});

loadProjects();
loadUsers();
loadBatteries();
loadSeparators();
loadElectrolytes();