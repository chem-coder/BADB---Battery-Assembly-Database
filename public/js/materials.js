const newNameInput = document.getElementById('new-material-name');
const newFamilySelect = document.getElementById('new-material-family');
const newRoleSelect = document.getElementById('new-material-role');
const newManufacturerInput = document.getElementById('new-material-manufacturer');
const createMaterialBtn = document.getElementById('createMaterialBtn');
const sortByNameBtn = document.getElementById('sortByNameBtn');
const sortByRoleBtn = document.getElementById('sortByRoleBtn');

const materialsList = document.getElementById('materialsList');

const roleMap = {
  cathode_active: 'катодный активный материал',
  anode_active: 'анодный активный материал',
  binder: 'связующее',
  conductive_additive: 'проводящая добавка',
  solvent: 'растворитель',
  other: 'другое'
};

// Roles whose family is a controlled vocabulary (materials_model_cleanup.md §4)
// and whose missing family/manufacturer must be rendered in red (D4).
const ACTIVE_ROLES = new Set(['cathode_active', 'anode_active']);

// Family reference list from /api/reference/material-families
// ({family_id, code, label, role, sort_order, notes}).
let materialFamilies = [];

// Last loaded /api/materials list — used for duplicate detection on create (D3).
let loadedMaterials = [];

// -------- nameFingerprint (D3, §6.3) --------
// Comparison fingerprint for duplicate detection at material creation.
// Pipeline: lowercase → trim → collapse whitespace → strip punctuation/hyphens →
// map confusable Cyrillic letters to their Latin homoglyphs.
// Keep the algorithm byte-identical to client-web/src/utils/nameFingerprint.js.
// The fingerprint is for COMPARISON ONLY — never stored, never shown.

// Confusable Cyrillic → Latin homoglyphs (spec list: А В Е К М Н О Р С
// Т У Х → A B E K M H O P C T Y X). Input is lowercased before this map
// is applied, so only the lowercase forms are needed here — uppercase
// Cyrillic arrives already folded (А → а → a).
const CYR_TO_LAT = {
  'а': 'a',
  'в': 'b',
  'е': 'e',
  'к': 'k',
  'м': 'm',
  'н': 'h',
  'о': 'o',
  'р': 'p',
  'с': 'c',
  'т': 't',
  'у': 'y',
  'х': 'x'
};

const CYR_CONFUSABLE_RE = /[авекмнорстух]/g;

function nameFingerprint(s) {
  if (s == null) return '';
  return String(s)
    .toLowerCase()
    .trim()
    // Strip punctuation and hyphens — keep letters, digits and spaces.
    // \p{L}/\p{N} (unicode property escapes) so Cyrillic survives.
    .replace(/[^\p{L}\p{N}\s]+/gu, '')
    // Strip ALL whitespace entirely: «NMC811» and «NMC 811» are the same
    // product typed two ways — a classic duplicate pattern.
    .replace(/\s+/g, '')
    .trim()
    .replace(CYR_CONFUSABLE_RE, (ch) => CYR_TO_LAT[ch]);
}

// Fill a family <select> with the reference families for the given role.
// A stored value not present in the reference list stays selectable so
// legacy free-text families survive editing.
function fillFamilyOptions(selectEl, role, currentValue = '') {
  selectEl.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— выбрать семейство —';
  selectEl.appendChild(placeholder);

  const families = materialFamilies.filter(f => f.role === role);
  families.forEach(f => {
    const option = document.createElement('option');
    option.value = f.code;
    option.textContent = f.label;
    if (f.notes) option.title = f.notes;
    selectEl.appendChild(option);
  });

  const value = String(currentValue || '').trim();
  if (value && !families.some(f => f.code === value)) {
    const legacyOption = document.createElement('option');
    legacyOption.value = value;
    legacyOption.textContent = `${value} (вне справочника)`;
    selectEl.appendChild(legacyOption);
  }

  selectEl.value = value;
  if (selectEl.value !== value) selectEl.value = '';
}

// Render «роль · семейство · производитель» into a .row-meta span.
// Active roles show missing family/manufacturer as red placeholders (D4);
// other roles simply omit what is absent (legitimately not applicable).
function renderMaterialRowMetaInto(metaSpan, { role, family, manufacturer }) {
  const isActive = ACTIVE_ROLES.has(role);
  const trimmedFamily = String(family || '').trim();
  const trimmedManufacturer = String(manufacturer || '').trim();

  const parts = [{ text: roleMap[role] || role, missing: false }];

  if (trimmedFamily) {
    parts.push({ text: trimmedFamily, missing: false });
  } else if (isActive) {
    parts.push({ text: 'Семейство: не указано', missing: true });
  }

  if (trimmedManufacturer) {
    parts.push({ text: trimmedManufacturer, missing: false });
  } else if (isActive) {
    parts.push({ text: 'Производитель: неизвестен', missing: true });
  }

  metaSpan.replaceChildren();
  parts.forEach((part, index) => {
    if (index > 0) metaSpan.append(' · ');
    if (part.missing) {
      const missingSpan = document.createElement('span');
      missingSpan.classList.add('record-delete-warning');
      missingSpan.textContent = part.text;
      metaSpan.appendChild(missingSpan);
    } else {
      metaSpan.append(part.text);
    }
  });
}

const toggleInstancesBtn = document.getElementById('toggleInstancesBtn');
const toggleCompositionsBtn = document.getElementById('toggleCompositionsBtn');

let allMaterialsExpanded = false;
let compositionsExpanded = false;
let editingMaterialId = null;
let currentEdit = null; 
let currentSortMode = 'name';

function exitEditMode(row) {
  const summary = row.querySelector('summary');
  summary.innerHTML = row.dataset.originalContent;
  currentEdit = null;
}

function captureOpenState() {
  return {
    materials: Array.from(
      materialsList.querySelectorAll('details[data-type="material"][open]')
    ).map(d => d.dataset.id),
    
    instances: Array.from(
      materialsList.querySelectorAll('details[data-type="instance"][open]')
    ).map(d => d.dataset.id)
  };
}

function restoreOpenState(state) {
  state.materials.forEach(id => {
    const d = materialsList.querySelector(
      `details[data-type="material"][data-id="${id}"]`
    );
    if (d) d.open = true;
  });
  
  state.instances.forEach(id => {
    const d = materialsList.querySelector(
      `details[data-type="instance"][data-id="${id}"]`
    );
    if (d) d.open = true;
  });
}

function sortMaterials(materials) {
  const sorted = [...materials];

  if (currentSortMode === 'role') {
    sorted.sort((a, b) => {
      const roleCompare = (roleMap[a.role] || a.role || '').localeCompare(
        roleMap[b.role] || b.role || ''
      );

      if (roleCompare !== 0) return roleCompare;
      return a.name.localeCompare(b.name);
    });

    return sorted;
  }

  sorted.sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
}



// -------- API --------

async function fetchMaterials() {
  const res = await fetch('/api/materials');
  if (!res.ok) throw new Error('Ошибка загрузки материалов');
  return res.json();
}

async function fetchMaterialFamilies() {
  const res = await fetch('/api/reference/material-families');
  if (!res.ok) throw new Error('Ошибка загрузки семейств материалов');
  return res.json();
}

async function createMaterial(data) {
  const res = await fetch('/api/materials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка создания');
  }
  
  return res.json();
}

async function updateMaterial(id, data) {
  const res = await fetch(`/api/materials/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка обновления');
  }
  
  return res.json();
}

async function deleteMaterial(id) {
  const res = await fetch(`/api/materials/${id}`, {
    method: 'DELETE'
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.error || 'Ошибка удаления');
    return false;
  }
  return true;
}

async function fetchInstances(materialId) {
  const res = await fetch(`/api/materials/${materialId}/instances`);
  if (!res.ok) throw new Error('Ошибка загрузки экземпляров');
  return res.json();
}

async function fetchAllMaterialInstances() {
  const res = await fetch('/api/materials/instances');
  if (!res.ok) throw new Error('Ошибка загрузки экземпляров');
  return res.json();
}

async function createInstance(materialId, data) {
  const res = await fetch(`/api/materials/${materialId}/instances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка создания экземпляра');
  }
  
  return res.json();
}

async function updateInstance(id, data) {
  const res = await fetch(`/api/materials/instances/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка обновления экземпляра');
  }
  
  return res.json();
}

async function deleteInstance(id) {
  const res = await fetch(`/api/materials/instances/${id}`, {
    method: 'DELETE'
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка удаления экземпляра');
  }
}

function openMaterialDetailsPage(materialInstanceId) {
  window.location.href =
    `/reference/material-details.html?material_instance_id=${encodeURIComponent(materialInstanceId)}`;
}

function openMaterialSourceInfoPage(materialInstanceId) {
  window.location.href =
    `/reference/material-source-info.html?material_instance_id=${encodeURIComponent(materialInstanceId)}`;
}

// The family picker only applies to active materials (§4): show a
// role-filtered select for them, hide the field entirely for other roles.
function syncCreateFamilyVisibility() {
  const role = newRoleSelect.value;

  if (ACTIVE_ROLES.has(role)) {
    fillFamilyOptions(newFamilySelect, role, '');
    newFamilySelect.hidden = false;
  } else {
    newFamilySelect.hidden = true;
    newFamilySelect.value = '';
  }
}

newRoleSelect.addEventListener('change', syncCreateFamilyVisibility);

createMaterialBtn.addEventListener('click', async () => {
  const name = newNameInput.value.trim();
  const role = newRoleSelect.value;
  const family = ACTIVE_ROLES.has(role) ? newFamilySelect.value.trim() : '';
  const manufacturer = newManufacturerInput.value.trim();

  if (!name) {
    alert('Название обязательно');
    return;
  }

  if (!role) {
    alert('Роль обязательна');
    return;
  }

  try {
    if (editingMaterialId) {
      await updateMaterial(editingMaterialId, {
        name,
        role,
        family: family || null,
        manufacturer: manufacturer || null
      });
      editingMaterialId = null;
      createMaterialBtn.textContent = 'Добавить';
    } else {
      // Duplicate prevention (D3, §6.3): warn, never block.
      const fingerprint = nameFingerprint(name);
      const duplicate = loadedMaterials.find(
        (material) => nameFingerprint(material.name) === fingerprint
      );

      if (duplicate) {
        const createAnyway = confirm(
          `Похоже на существующий «${duplicate.name}» — использовать его?\n\n` +
          'OK — нет, это другой материал (создать новый).\n' +
          'Отмена — не создавать дубликат.'
        );
        if (!createAnyway) return;
      }

      await createMaterial({
        name,
        role,
        family: family || null,
        manufacturer: manufacturer || null
      });
    }

    newNameInput.value = '';
    newRoleSelect.value = '';
    newManufacturerInput.value = '';
    syncCreateFamilyVisibility();
    loadMaterials();
  } catch (err) {
    alert(err.message);
  }
});

function buildComponentDetails(comp) {
  const compDetails = document.createElement('details');
  compDetails.classList.add('tree-row', 'level-component');
  compDetails.dataset.type = 'component';
  compDetails.dataset.id = comp.material_instance_component_id;
  compDetails.dataset.materialName = comp.material_name || '';
  compDetails.dataset.massFraction = comp.mass_fraction;
  compDetails.dataset.notes = comp.notes || '';

  const compSummary = document.createElement('summary');

  const nameSpan = document.createElement('span');
  nameSpan.classList.add('row-title');
  nameSpan.textContent = comp.component_name;
  nameSpan.style = 'display:inline-block; width:10vw;';

  const percentSpan = document.createElement('span');
  percentSpan.classList.add('row-meta');
  percentSpan.textContent = (comp.mass_fraction * 100).toFixed(2) + ' %';
  percentSpan.style = 'display:inline-block; width:10vw;';

  compSummary.appendChild(nameSpan);
  compSummary.appendChild(percentSpan);
  compDetails.appendChild(compSummary);

  return compDetails;
}

function renderInstanceComponents(container, components, insertBeforeNode = null) {
  container.querySelectorAll('.level-component').forEach(node => node.remove());

  components.forEach(comp => {
    const node = buildComponentDetails(comp);

    if (insertBeforeNode) {
      container.insertBefore(node, insertBeforeNode);
    } else {
      container.appendChild(node);
    }
  });
}

function updateInstanceKindBadge(instanceRow, isPrepared) {
  const badge = instanceRow?.querySelector('.instance-kind-badge');
  if (!badge) return;
  badge.textContent = isPrepared ? 'приготовленный' : 'исходный';
  badge.classList.toggle('is-prepared', Boolean(isPrepared));
}

function addCompositionEditorRow(rowsHost, allInstances, parentInstanceId, initialData = {}) {
  const row = document.createElement('div');
  row.classList.add('component-editor-row');
  row.style.display = 'grid';
  row.style.gridTemplateColumns = 'minmax(220px, 2fr) 110px minmax(220px, 2fr) auto';
  row.style.gap = '0.5rem';
  row.style.alignItems = 'center';
  row.style.marginTop = '0.4rem';

  const materialSelect = document.createElement('select');
  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = '— экземпляр —';
  materialSelect.appendChild(placeholderOption);

  allInstances
    .filter(instance => instance.material_instance_id !== parentInstanceId)
    .forEach(instance => {
      const option = document.createElement('option');
      option.value = instance.material_instance_id;
      option.textContent = instance.name;
      materialSelect.appendChild(option);
    });

  materialSelect.value = initialData.component_material_instance_id
    ? String(initialData.component_material_instance_id)
    : '';

  const percentInput = document.createElement('input');
  percentInput.type = 'number';
  percentInput.step = '0.01';
  percentInput.min = '0';
  percentInput.max = '100';
  percentInput.placeholder = '%';
  percentInput.value =
    initialData.mass_fraction !== undefined && initialData.mass_fraction !== null
      ? (Number(initialData.mass_fraction) * 100).toFixed(2)
      : '';

  const notesInput = document.createElement('input');
  notesInput.type = 'text';
  notesInput.placeholder = 'Комментарий (необязательно)';
  notesInput.value = initialData.notes || '';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = '✕';
  removeBtn.title = 'Удалить строку';
  removeBtn.onclick = () => {
    row.remove();
    if (rowsHost.querySelectorAll('.component-editor-row').length === 0) {
      addCompositionEditorRow(rowsHost, allInstances, parentInstanceId);
    }
    refreshCompositionOptionAvailability(rowsHost);
  };

  const handleEnter = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    addCompositionEditorRow(rowsHost, allInstances, parentInstanceId);
    const rows = rowsHost.querySelectorAll('.component-editor-row');
    const lastRow = rows[rows.length - 1];
    lastRow.querySelector('select')?.focus();
  };

  materialSelect.addEventListener('keydown', handleEnter);
  percentInput.addEventListener('keydown', handleEnter);
  notesInput.addEventListener('keydown', handleEnter);
  materialSelect.addEventListener('change', () => {
    refreshCompositionOptionAvailability(rowsHost);
  });

  row.appendChild(materialSelect);
  row.appendChild(percentInput);
  row.appendChild(notesInput);
  row.appendChild(removeBtn);
  rowsHost.appendChild(row);

  return row;
}

function refreshCompositionOptionAvailability(rowsHost) {
  const rows = Array.from(rowsHost.querySelectorAll('.component-editor-row'));
  const selectedValues = rows
    .map(row => row.querySelector('select')?.value || '')
    .filter(Boolean);

  rows.forEach(row => {
    const select = row.querySelector('select');
    if (!select) return;

    const currentValue = select.value;

    Array.from(select.options).forEach(option => {
      if (!option.value) {
        option.disabled = false;
        return;
      }

      option.disabled =
        option.value !== currentValue &&
        selectedValues.includes(option.value);
    });
  });
}

async function openCompositionEditor(inst, instChildren, addComponentBtn) {
  if (instChildren.querySelector('.composition-editor')) return;

  try {
    const [allInstances, currentComponents] = await Promise.all([
      fetchAllMaterialInstances(),
      fetch(`/api/materials/instances/${inst.material_instance_id}/components`).then(async (res) => {
        if (!res.ok) throw new Error('Ошибка загрузки состава');
        return res.json();
      })
    ]);

    const editor = document.createElement('div');
    editor.classList.add('composition-editor');
    editor.style.marginLeft = '3rem';
    editor.style.marginTop = '0.5rem';

    const rowsHost = document.createElement('div');
    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '0.5rem';
    controls.style.marginTop = '0.5rem';

    const addRowBtn = document.createElement('button');
    addRowBtn.type = 'button';
    addRowBtn.textContent = '+ Ингредиент';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Сохранить состав';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Отмена';

    addRowBtn.onclick = () => {
      const row = addCompositionEditorRow(rowsHost, allInstances, inst.material_instance_id);
      row.querySelector('select')?.focus();
    };

    saveBtn.onclick = async () => {
      const rows = Array.from(rowsHost.querySelectorAll('.component-editor-row'));

      const components = rows.map(row => {
        const [select, percentInput, notesInput] = row.querySelectorAll('select, input');

        return {
          component_material_instance_id: Number(select.value),
          mass_fraction: Number(percentInput.value) / 100,
          notes: notesInput.value.trim() || null
        };
      });

      const hasIncompleteRow = components.some(component => {
        return (
          !Number.isInteger(component.component_material_instance_id) ||
          !Number.isFinite(component.mass_fraction) ||
          component.mass_fraction <= 0 ||
          component.mass_fraction > 1
        );
      });

      if (hasIncompleteRow) {
        alert('Заполните все строки состава корректно перед сохранением.');
        return;
      }

      const total = components.reduce((sum, component) => sum + component.mass_fraction, 0);

      if (Math.abs(total - 1) > 0.0001) {
        alert('Сумма состава должна быть ровно 100%.');
        return;
      }

      try {
        const res = await fetch(`/api/materials/instances/${inst.material_instance_id}/components`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ components })
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Ошибка сохранения состава');
        }

        const savedComponents = await res.json();
        renderInstanceComponents(instChildren, savedComponents, addComponentBtn);
        updateInstanceKindBadge(
          instChildren.closest('details[data-type="instance"]'),
          savedComponents.length > 0
        );
        editor.remove();
      } catch (err) {
        alert(err.message);
      }
    };

    cancelBtn.onclick = () => {
      editor.remove();
    };

    if (currentComponents.length > 0) {
      currentComponents.forEach(component => {
        addCompositionEditorRow(rowsHost, allInstances, inst.material_instance_id, component);
      });
    } else {
      addCompositionEditorRow(rowsHost, allInstances, inst.material_instance_id);
    }

    controls.appendChild(addRowBtn);
    controls.appendChild(saveBtn);
    controls.appendChild(cancelBtn);
    editor.appendChild(rowsHost);
    editor.appendChild(controls);

    instChildren.insertBefore(editor, addComponentBtn.nextSibling);
    refreshCompositionOptionAvailability(rowsHost);
    rowsHost.querySelector('select')?.focus();
  } catch (err) {
    alert(err.message || 'Ошибка загрузки состава');
  }
}

// Grouped rendering (mirrors Vue MaterialsPage): role section -> family
// sub-header -> products, so all NMC products sit under ONE «NMC» header.
// Materials without a family land under a red «Без семейства» bucket on
// active roles; roles without families render a single flat section.
const GROUP_ROLE_ORDER = ['cathode_active', 'anode_active', 'active', 'binder', 'conductive_additive', 'solvent', 'other'];
const GROUP_FAMILY_ROLES = new Set(['cathode_active', 'anode_active', 'active']);

function makeGroupHeader(text, cls) {
  const el = document.createElement('div');
  el.classList.add(cls);
  el.textContent = text;
  return el;
}

function renderMaterials(materials) {
  materialsList.innerHTML = '';

  const byRole = new Map();
  materials.forEach(m => {
    const role = GROUP_ROLE_ORDER.includes(m.role) ? m.role : 'other';
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role).push(m);
  });

  GROUP_ROLE_ORDER.forEach(role => {
    const inRole = byRole.get(role);
    if (!inRole || !inRole.length) return;

    materialsList.appendChild(makeGroupHeader(roleMap[role] || role, 'material-group-role'));

    if (GROUP_FAMILY_ROLES.has(role)) {
      const byFamily = new Map();
      inRole.forEach(m => {
        const key = m.family || '';
        if (!byFamily.has(key)) byFamily.set(key, []);
        byFamily.get(key).push(m);
      });
      [...byFamily.keys()]
        .sort((a, b) => {
          if (!a) return 1;
          if (!b) return -1;
          return a.localeCompare(b, 'ru');
        })
        .forEach(family => {
          const header = makeGroupHeader(family || 'Без семейства', 'material-group-family');
          if (!family) header.classList.add('material-group-family--missing');
          materialsList.appendChild(header);
          byFamily.get(family)
            .sort((x, y) => x.name.localeCompare(y.name, 'ru'))
            .forEach(m => materialsList.appendChild(buildMaterialNode(m)));
        });
    } else {
      inRole
        .sort((x, y) => x.name.localeCompare(y.name, 'ru'))
        .forEach(m => materialsList.appendChild(buildMaterialNode(m)));
    }
  });
}

function buildMaterialNode(material) {
    const details = document.createElement('details');
    details.classList.add('tree-row', 'level-material');
    details.dataset.type = 'material';
    details.dataset.id = material.material_id;
    details.dataset.role = material.role;
    details.dataset.family = material.family || '';
    details.dataset.manufacturer = material.manufacturer || '';

    // collapsed by default
    details.open = false;

    const summary = document.createElement('summary');

    const title = document.createElement('span');
    title.classList.add('row-title');
    title.textContent = material.name;
    title.style = "display:inline-block; width:10vw;";

    const role = document.createElement('span');
    role.classList.add('row-meta');
    renderMaterialRowMetaInto(role, {
      role: material.role,
      family: material.family,
      manufacturer: material.manufacturer
    });
    role.style = "display:inline-block; width:25vw;";
    role.dataset.role = material.role;
    
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = '✏️';
    editBtn.dataset.action = 'edit';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = '🗑';
    deleteBtn.dataset.action = 'delete';
    
    summary.appendChild(title);
    summary.appendChild(role);
    summary.appendChild(editBtn);
    summary.appendChild(deleteBtn);
    
    details.appendChild(summary);
    
    const childrenContainer = document.createElement('div');
    childrenContainer.classList.add('children-container');
    details.appendChild(childrenContainer);
    
    details.addEventListener('toggle', async () => {
      if (!details.open) return;
      
      // prevent reloading if already loaded
      if (childrenContainer.dataset.loaded === 'true') return;
      
      try {
        const instances = await fetchInstances(material.material_id);
        
        instances
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(inst => {
          const instDetails = document.createElement('details');
          instDetails.classList.add('tree-row', 'level-instance');
          instDetails.dataset.type = 'instance';
          instDetails.dataset.id = inst.material_instance_id;
          instDetails.dataset.notes = inst.notes || '';
          instDetails.dataset.isPure = String(Boolean(inst.is_pure));
          instDetails.dataset.sourceId = inst.source_id || '';
          
          instDetails.open = false;
          
          const instSummary = document.createElement('summary');
          
          const instTitle = document.createElement('span');
          instTitle.classList.add('row-title');
          instTitle.textContent = inst.name;
          instTitle.style = "display:inline-block; width:35.6vw;";

          // Computed leaf-vs-mixture badge (§6.1): never stored in the name.
          // is_pure is derived server-side from the absence of components.
          const kindBadge = document.createElement('span');
          kindBadge.classList.add('instance-kind-badge');
          if (inst.is_pure) {
            kindBadge.textContent = 'исходный';
          } else {
            kindBadge.textContent = 'приготовленный';
            kindBadge.classList.add('is-prepared');
          }


          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.textContent = '✏️';
          editBtn.dataset.action = 'edit';
          
          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.textContent = '🗑';
          deleteBtn.dataset.action = 'delete';

          const detailsBtn = document.createElement('button');
          detailsBtn.type = 'button';
          detailsBtn.textContent = '+ Свойства';
          detailsBtn.dataset.action = 'details';
          detailsBtn.style.marginLeft = '0.5rem';

          const sourceInfoBtn = document.createElement('button');
          sourceInfoBtn.type = 'button';
          sourceInfoBtn.textContent = '+ Инфо об источнике';
          sourceInfoBtn.dataset.action = 'source-info';
          sourceInfoBtn.style.marginLeft = '0.35rem';
          sourceInfoBtn.hidden = !inst.is_pure;
          
          instSummary.appendChild(instTitle);
          instSummary.appendChild(kindBadge);
          instSummary.appendChild(detailsBtn);
          instSummary.appendChild(sourceInfoBtn);
          instSummary.appendChild(editBtn);
          instSummary.appendChild(deleteBtn);
          
          instDetails.appendChild(instSummary);
          
          const instChildren = document.createElement('div');
          instChildren.classList.add('children-container');
          instDetails.appendChild(instChildren);
          
          instDetails.addEventListener('toggle', async () => {
            if (!instDetails.open) return;
            
            if (instChildren.dataset.loaded === 'true') return;
            
            try {
              const res = await fetch(`/api/materials/instances/${inst.material_instance_id}/components`);
              if (!res.ok) throw new Error('Ошибка загрузки состава');
              
              const components = await res.json();
              renderInstanceComponents(instChildren, components);
              
              /* + Состав button */
              const addComponentBtn = document.createElement('button');
              addComponentBtn.type = 'button';
              addComponentBtn.textContent = '+ Состав';
              addComponentBtn.style.marginLeft = '3rem';
              
              addComponentBtn.onclick = () => {
                openCompositionEditor(inst, instChildren, addComponentBtn);
              };
              
              instChildren.appendChild(addComponentBtn);
              
              instChildren.dataset.loaded = 'true';
              
            } catch (err) {
              console.error(err);
            }
          });
          
          childrenContainer.appendChild(instDetails);
        });
        
        /* + Экземпляр button */
        const addInstanceBtn = document.createElement('button');
        addInstanceBtn.type = 'button';
        addInstanceBtn.textContent = '+ Экземпляр';
        addInstanceBtn.style.marginLeft = '1.5rem';
        
        addInstanceBtn.onclick = () => {
          
          if (childrenContainer.querySelector('.instance-create-row')) return;
          
          const createRow = document.createElement('div');
          createRow.classList.add('instance-create-row');
          createRow.style.marginLeft = '1.5rem';
          
          const input = document.createElement('input');
          input.type = 'text';
          input.placeholder = 'Название экземпляра';
          input.style.marginRight = '0.5rem';
          
          const notesInput = document.createElement('textarea');
          notesInput.rows = 2;
          notesInput.placeholder = 'Комментарий (необязательно)';
          notesInput.style.display = 'block';
          notesInput.style.marginTop = '0.4rem';

          const pureLabel = document.createElement('label');
          pureLabel.style.display = 'block';
          pureLabel.style.marginTop = '0.4rem';

          const pureCheckbox = document.createElement('input');
          pureCheckbox.type = 'checkbox';
          pureCheckbox.style.marginRight = '0.4rem';

          pureLabel.appendChild(pureCheckbox);
          pureLabel.append('100% чистый экземпляр');
          
          const saveBtn = document.createElement('button');
          saveBtn.type = 'button';
          saveBtn.textContent = 'Сохранить';
          
          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.textContent = 'Отмена';
          
          createRow.appendChild(input);
          createRow.appendChild(notesInput);
          createRow.appendChild(pureLabel);
          createRow.appendChild(saveBtn);
          createRow.appendChild(cancelBtn);
          
          childrenContainer.appendChild(createRow);
          
          input.focus();
          
          saveBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const name = input.value.trim();
            if (!name) return;
            
            try {
              await createInstance(material.material_id, {
                name,
                notes: notesInput.value.trim() || null,
                is_pure: pureCheckbox.checked
              });
              
              childrenContainer.dataset.loaded = '';
              childrenContainer.innerHTML = '';
              details.dispatchEvent(new Event('toggle'));
              
            } catch (err) {
              console.error(err);
            }
          };
          
          cancelBtn.onclick = () => {
            createRow.remove();
          };
          
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              saveBtn.click();
            }
            if (e.key === 'Escape') {
              cancelBtn.click();
            }
          });
          
        };
        
        childrenContainer.appendChild(addInstanceBtn);
        
        childrenContainer.dataset.loaded = 'true';
        
      } catch (err) {
        console.error(err);
      }
    });
    
    return details;
}


// -------- Inline Edit Controller (Tree Rows) --------

function enterEditMode(row, type, id) {
  
  // prevent multiple edit states
  if (currentEdit) {
    exitEditMode(currentEdit);
  }
  
  currentEdit = row;
  
  const summary = row.querySelector('summary');
  const originalContent = summary.innerHTML;
  
  row.dataset.originalContent = originalContent;
  
  const titleSpan = summary.querySelector('.row-title');
  const currentText = titleSpan ? titleSpan.textContent : '';
  const input = document.createElement('input');
  let roleSelect = null;
  let familySelect = null;
  let manufacturerInput = null;
  if (type === 'component') {
    input.type = 'number';
    input.step = '0.01';
    input.min = '0';
    input.max = '100';
    input.value = (Number(row.dataset.massFraction) * 100).toFixed(2);
  } else {
    input.type = 'text';
    input.value = currentText;
  }

  if (type === 'material') {
    roleSelect = document.createElement('select');
    roleSelect.style.marginLeft = '0.5rem';

    Object.entries(roleMap).forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === row.dataset.role;
      roleSelect.appendChild(option);
    });

    familySelect = document.createElement('select');
    familySelect.style.marginLeft = '0.5rem';

    const syncEditFamilyVisibility = () => {
      const selectedRole = roleSelect.value;
      if (ACTIVE_ROLES.has(selectedRole)) {
        fillFamilyOptions(familySelect, selectedRole, row.dataset.family || '');
        familySelect.hidden = false;
      } else {
        familySelect.hidden = true;
        familySelect.value = '';
      }
    };

    syncEditFamilyVisibility();
    roleSelect.addEventListener('change', syncEditFamilyVisibility);

    manufacturerInput = document.createElement('input');
    manufacturerInput.type = 'text';
    manufacturerInput.placeholder = 'Производитель (необязательно)';
    manufacturerInput.value = row.dataset.manufacturer || '';
    manufacturerInput.style.marginLeft = '0.5rem';
  }
  
  summary.innerHTML = '';
  let notesInput = null;
  
  if (type === 'instance' || type === 'component') {
    notesInput = document.createElement('textarea');
    notesInput.rows = 2;
    notesInput.placeholder = 'Комментарий (необязательно)';
    notesInput.value = row.dataset.notes || '';
    notesInput.style.display = 'block';
    notesInput.style.marginTop = '0.4rem';
  }
  
  // To prevent input from shrinking when buttons are added
  input.style.flex = '1';
  
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Сохранить';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Отмена';
  
  summary.appendChild(input);

  if (roleSelect) {
    summary.appendChild(roleSelect);
  }

  if (familySelect) {
    summary.appendChild(familySelect);
  }

  if (manufacturerInput) {
    summary.appendChild(manufacturerInput);
  }

  if (notesInput) {
    summary.appendChild(notesInput);
  }
  
  summary.appendChild(saveBtn);
  summary.appendChild(cancelBtn);
  
  input.focus();
  
  saveBtn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const newValue = input.value.trim();
    if (!newValue) return;
    
    try {
      
      if (type === 'material') {
        const selectedRole = roleSelect ? roleSelect.value : row.dataset.role;
        // Family is a controlled vocabulary for active roles only; for other
        // roles the field is hidden and the stored value passes through
        // unchanged (never wiped silently).
        const familyValue = ACTIVE_ROLES.has(selectedRole)
          ? (familySelect ? familySelect.value.trim() : (row.dataset.family || ''))
          : (row.dataset.family || '');
        const manufacturerValue = manufacturerInput
          ? manufacturerInput.value.trim()
          : (row.dataset.manufacturer || '');

        await updateMaterial(Number(id), {
          name: newValue,
          role: selectedRole,
          family: familyValue || null,
          manufacturer: manufacturerValue || null
        });

        exitEditMode(row);
        row.querySelector('.row-title').textContent = newValue;
        renderMaterialRowMetaInto(row.querySelector('.row-meta'), {
          role: selectedRole,
          family: familyValue,
          manufacturer: manufacturerValue
        });
        row.querySelector('.row-meta').dataset.role = selectedRole;
        row.dataset.role = selectedRole;
        row.dataset.family = familyValue;
        row.dataset.manufacturer = manufacturerValue;

        return;
      }
      
      if (type === 'instance') {
        
        const notesEl = summary.querySelector('textarea');
        const notesValue = notesEl ? notesEl.value.trim() || '' : '';
        
        await updateInstance(Number(id), {
          name: newValue,
          notes: notesValue || null
        });
        
        exitEditMode(row);
        row.querySelector('.row-title').textContent = newValue;
        row.dataset.notes = notesValue;
        return;
      }
      
      if (type === 'component') {
        
        const percent = Number(newValue) / 100;
        if (!Number.isFinite(percent) || percent <= 0 || percent > 1) return;
        
        const notesEl = summary.querySelector('textarea');
        
        const res = await fetch(`/api/materials/instances/components/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mass_fraction: percent,
            notes: notesEl ? notesEl.value.trim() || null : null
          })
        });
        
        if (!res.ok) throw new Error('Ошибка обновления компонента');
        
        exitEditMode(row);
        
        const nameSpan = row.querySelector('.row-title');
        const percentSpan = row.querySelector('.row-meta');
        
        nameSpan.textContent = row.dataset.materialName;
        percentSpan.textContent = (percent * 100).toFixed(2) + ' %';
        row.dataset.massFraction = percent;
        
        return;
      }
      
    } catch (err) {
      console.error(err);
    }
    
  };
  
  cancelBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    exitEditMode(row);
  };
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      saveBtn.click();
    }
    if (e.key === 'Escape') {
      cancelBtn.click();
    }
  });

  if (manufacturerInput) {
    manufacturerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        saveBtn.click();
      }
      if (e.key === 'Escape') {
        cancelBtn.click();
      }
    });
  }
}

// -------- Event listeners --------
toggleInstancesBtn.addEventListener('click', () => {
  const materialDetails = materialsList.querySelectorAll(
    'details[data-type="material"]'
  );
  
  allMaterialsExpanded = !allMaterialsExpanded;
  
  materialDetails.forEach(d => {
    d.open = allMaterialsExpanded;
  });
  
  if (!allMaterialsExpanded) {
    // collapse compositions too
    compositionsExpanded = false;
    toggleCompositionsBtn.disabled = true;
    
    const instanceDetails = materialsList.querySelectorAll(
      'details[data-type="instance"]'
    );
    
    instanceDetails.forEach(d => {
      d.open = false;
    });
  } else {
    toggleCompositionsBtn.disabled = false;
  }
});

toggleCompositionsBtn.addEventListener('click', () => {
  
  if (toggleCompositionsBtn.disabled) return;
  
  const instanceDetails = materialsList.querySelectorAll(
    'details[data-type="instance"]'
  );
  
  compositionsExpanded = !compositionsExpanded;
  
  instanceDetails.forEach(d => {
    d.open = compositionsExpanded;
  });
  
});

sortByNameBtn.addEventListener('click', () => {
  currentSortMode = 'name';
  loadMaterials();
});

sortByRoleBtn.addEventListener('click', () => {
  currentSortMode = 'role';
  loadMaterials();
});

materialsList.addEventListener('click', async (e) => {
  
  const action = e.target.dataset.action;
  if (!action) return;
  
  const row = e.target.closest('details');
  if (!row) return;
  
  const type = row.dataset.type;
  const id = row.dataset.id;
  
  if (action === 'edit') {
    enterEditMode(row, type, id);
    return;
  }

  if (action === 'details' && type === 'instance') {
    e.preventDefault();
    e.stopPropagation();
    openMaterialDetailsPage(id);
    return;
  }

  if (action === 'source-info' && type === 'instance') {
    e.preventDefault();
    e.stopPropagation();
    openMaterialSourceInfoPage(id);
    return;
  }
  
  if (action === 'delete') {
    
    if (!confirm('Удалить?')) return;
    
    try {
      if (type === 'material') {
        const success = await deleteMaterial(Number(id));
        if (!success) return;
        row.remove();
        return;
      }
      
      if (type === 'instance') {
        await deleteInstance(Number(id));
        row.remove();
        return;
      }
      
      if (type === 'component') {
        const instanceRow = row.closest('details[data-type="instance"]');
        await fetch(`/api/materials/instances/components/${id}`, {
          method: 'DELETE'
        });
        row.remove();
        if (instanceRow) {
          const remainingComponents =
            instanceRow.querySelectorAll('.level-component').length;
          updateInstanceKindBadge(instanceRow, remainingComponents > 0);
        }
        return;
      }
      
    } catch (err) {
      console.error(err);
    }
  }
  
});



// -------- Init --------

async function loadMaterials() {
  const state = captureOpenState();
  const materials = await fetchMaterials();
  loadedMaterials = materials;
  renderMaterials(materials);
  restoreOpenState(state);
}

async function initMaterialsPage() {
  try {
    materialFamilies = await fetchMaterialFamilies();
  } catch (err) {
    // The picker degrades to stored-value-only options; do not block the page.
    console.error(err);
  }
  syncCreateFamilyVisibility();
  loadMaterials();
}

initMaterialsPage();
