const addInput = document.getElementById('recipe-name');
const nameInput = document.getElementById('recipe-name-input');
const form = document.forms['recipe-form'];
const title = form.querySelector('h2');
const saveBtn = document.getElementById('saveBtn');
const printRecipeBtn = document.getElementById('printRecipeBtn');
const clearBtn = document.getElementById('clearBtn');
const deleteRecipeBtn = document.getElementById('deleteRecipeBtn');
const recipesList = document.getElementById('recipesList');
const createdBySelect = document.getElementById('recipe-created-by');
const addRecipeLine = document.getElementById('add-recipe-line');
const stickyHeader = document.getElementById('recipe_sticky_header');
const stickyTitle = document.getElementById('recipe_sticky_title');
const stickyMeta = document.getElementById('recipe_sticky_meta');
const stickyDirty = document.getElementById('recipe-global-dirty');
const stickyStatus = document.getElementById('recipe-sticky-status');
const filterTextInput = document.getElementById('recipe-filter-text');
const filterRoleSelect = document.getElementById('recipe-filter-role');
const clearFiltersBtn = document.getElementById('clearRecipeFiltersBtn');
const filterSummary = document.getElementById('recipe-filter-summary');

let mode = null; // 'create' | 'edit'
let currentId = null;
let currentRecipe = null;
let cachedMaterials = null;
let initialFormState = null;
let allRecipes = [];

const RECIPE_ROLE_LABELS = {
  cathode: 'катод',
  anode: 'анод'
};

const RECIPE_LINE_ROLE_LABELS = {
  cathode_active: 'катодный активный материал',
  anode_active: 'анодный активный материал',
  binder: 'связующее',
  additive: 'добавка',
  solvent: 'растворитель'
};

function formatDate(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('ru-RU');
}

function getRecipeNameValue() {
  const source = nameInput.hidden ? title.textContent : nameInput.value;
  return (source || '').trim();
}

function setRecipeName(name) {
  const value = (name || '').trim();
  title.textContent = value;
  nameInput.value = value;
  title.hidden = false;
  nameInput.hidden = true;
}

function showForm() {
  form.hidden = false;
  addInput.disabled = true;
  renderRecipeStickyHeader();
}

function hideForm() {
  form.hidden = true;
  addInput.disabled = false;
  renderRecipeStickyHeader();
}

function normalizeFilterText(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU');
}

function getRecipeFilterState() {
  return {
    text: normalizeFilterText(filterTextInput?.value),
    role: filterRoleSelect?.value || ''
  };
}

function hasActiveRecipeFilters(filters = getRecipeFilterState()) {
  return Boolean(filters.text || filters.role);
}

function getRecipeSearchText(recipe) {
  return normalizeFilterText([
    recipe.name,
    recipe.variant_label,
    recipe.notes,
    recipe.active_material_name,
    recipe.material_names,
    recipe.created_by_name,
    recipe.updated_by_name
  ].filter(Boolean).join(' '));
}

function matchesRecipeFilters(recipe, filters = getRecipeFilterState()) {
  if (filters.role && recipe.role !== filters.role) return false;
  if (filters.text && !getRecipeSearchText(recipe).includes(filters.text)) return false;
  return true;
}

function getFilteredRecipes() {
  const filters = getRecipeFilterState();
  return allRecipes.filter((recipe) => matchesRecipeFilters(recipe, filters));
}

function updateRecipeFilterSummary(filteredCount, totalCount) {
  const filters = getRecipeFilterState();
  const hasFilters = hasActiveRecipeFilters(filters);

  if (clearFiltersBtn) {
    clearFiltersBtn.disabled = !hasFilters;
  }

  if (!filterSummary) return;

  if (totalCount === 0) {
    filterSummary.textContent = 'Нет рецептов';
    return;
  }

  filterSummary.textContent = hasFilters
    ? `Показано ${filteredCount} из ${totalCount}`
    : `Всего: ${totalCount}`;
}

function getRecipeDisplayName() {
  return getRecipeNameValue() || 'без названия';
}

function getRecipeStickyTitle() {
  const name = getRecipeDisplayName();

  if (mode === 'edit' && currentId) {
    return `Рецепт #${currentId} | ${name}`;
  }

  return `Новый рецепт | ${name}`;
}

function getRecipeMetaText() {
  if (!mode) return '—';

  const role = RECIPE_ROLE_LABELS[form.elements.role.value] || '';
  const variant = form.elements.variant_label.value.trim();
  const createdBy = currentRecipe?.created_by_name || '';
  const createdAt = formatDate(currentRecipe?.created_at);

  return [
    role && `роль: ${role}`,
    variant && `версия: ${variant}`,
    createdBy && `создал: ${createdBy}`,
    createdAt && `создан: ${createdAt}`
  ].filter(Boolean).join(' — ') || 'новая запись';
}

function renderRecipeStickyHeader() {
  window.BADB_UI?.setStickyHeader({
    header: stickyHeader,
    titleEl: stickyTitle,
    metaEl: stickyMeta,
    dirtyEl: stickyDirty,
    title: getRecipeStickyTitle(),
    meta: getRecipeMetaText(),
    isDirty: hasUnsavedChanges(),
    hidden: !mode
  });

  if (printRecipeBtn) {
    printRecipeBtn.hidden = mode !== 'edit' || !currentId;
  }

  if (deleteRecipeBtn) {
    deleteRecipeBtn.hidden = mode !== 'edit' || !currentId;
  }
}

function captureRecipeLinesState() {
  return Array.from(document.querySelectorAll('.recipe-line-row')).map(row => ({
    recipe_role: row.querySelector('[data-field="recipe_role"]')?.value || '',
    material_id: row.querySelector('[data-field="material_id"]')?.value || '',
    slurry_percent: row.querySelector('[data-field="slurry_percent"]')?.value || '',
    line_notes: row.querySelector('[data-field="line_notes"]')?.value || ''
  }));
}

function captureFormState() {
  return JSON.stringify({
    mode,
    name: getRecipeNameValue(),
    role: form.elements.role.value,
    variant_label: form.elements.variant_label.value,
    notes: form.elements.notes.value,
    lines: captureRecipeLinesState()
  });
}

function markFormPristine() {
  initialFormState = captureFormState();
  renderRecipeStickyHeader();
}

function hasUnsavedChanges() {
  if (!mode) return false;
  return captureFormState() !== initialFormState;
}

function clearRecordStatuses() {
  showHeaderStatus('', false, { clearAfterMs: 0 });
}

function resetForm() {
  form.reset();
  setRecipeName('');
  addInput.value = '';
  addInput.blur();

  mode = null;
  currentId = null;
  currentRecipe = null;
  initialFormState = null;

  clearRecordStatuses();
  clearRecipeLines();
  hideForm();
}

function formDataToObject(formEl) {
  return Object.fromEntries(new FormData(formEl));
}

// -------- API helpers --------

async function fetchAllRecipes() {
  const res = await fetch('/api/recipes');

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки списка рецептов');
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchMaterials() {
  if (cachedMaterials) return cachedMaterials;

  const res = await fetch('/api/materials');

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки материалов');
  }

  cachedMaterials = await res.json();
  return cachedMaterials;
}

async function loadRecipes() {
  try {
    allRecipes = await fetchAllRecipes();

    if (currentId) {
      currentRecipe = allRecipes.find((recipe) => recipe.tape_recipe_id === currentId) || currentRecipe;
    }

    renderFilteredRecipes();
    renderRecipeStickyHeader();
  } catch (err) {
    showPageStatus(err.message || 'Ошибка загрузки списка рецептов', true, { clearAfterMs: 9000 });
  }
}

async function loadUsers() {
  try {
    const res = await fetch('/api/users');

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка загрузки пользователей');
    }

    const users = await res.json();

    createdBySelect.replaceChildren(new Option(
      window.BADB_AUTH?.getAuditUserPlaceholder?.() || '— автоматически —',
      ''
    ));

    users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.user_id;
      opt.textContent = u.name;
      createdBySelect.appendChild(opt);
    });
  } catch (err) {
    showPageStatus(err.message, true, { clearAfterMs: 9000 });
  }
}

async function createRecipe(data) {
  const res = await fetch('/api/recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка сохранения рецепта');
  }

  return res.json();
}

async function updateRecipe(id, data) {
  const res = await fetch(`/api/recipes/${id}`, {
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

async function deleteRecipe(id) {
  const res = await fetch(`/api/recipes/${id}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка удаления рецепта');
  }
}

async function fetchRecipeDeleteCheck(id) {
  const res = await fetch(`/api/recipes/${id}/delete-check`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка проверки удаления рецепта');
  }

  return res.json();
}

async function duplicateRecipe(id) {
  const res = await fetch(`/api/recipes/${id}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка дублирования рецепта');
  }

  return res.json();
}

async function fetchRecipeLines(recipeId) {
  const res = await fetch(`/api/recipes/${recipeId}/lines`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки состава');
  }

  return res.json();
}

// -------- Other helpers --------

async function populateMaterialSelect(row) {
  const select = row.querySelector('.material-select');
  if (!select) return;

  const roleSelect = row.querySelector('.role-select');
  const recipeRole = roleSelect.value;
  const materials = await fetchMaterials();

  select.innerHTML = '<option value="">— выбрать —</option>';

  materials.forEach(m => {
    let allowed = false;

    if (recipeRole === 'binder' && m.role === 'binder') {
      allowed = true;
    }

    if (recipeRole === 'additive' && m.role === 'conductive_additive') {
      allowed = true;
    }

    if (recipeRole === 'solvent' && m.role === 'solvent') {
      allowed = true;
    }

    if (
      (recipeRole === 'cathode_active' && m.role === 'cathode_active') ||
      (recipeRole === 'anode_active' && m.role === 'anode_active')
    ) {
      allowed = true;
    }

    if (!allowed) return;

    const opt = document.createElement('option');
    opt.value = m.material_id;
    opt.textContent = m.name;
    select.appendChild(opt);
  });
}

function confirmDiscardUnsavedChanges() {
  if (!hasUnsavedChanges()) return true;
  return confirm('Выйти без сохранения изменений?');
}

function formatDependencyRecords(dependencies) {
  return dependencies
    .flatMap((dependency) => dependency.records || [])
    .slice(0, 4)
    .map((record) => {
      if (record.name) return `#${record.id}: ${record.name}`;
      if (record.id) return `#${record.id}`;
      return '';
    })
    .filter(Boolean)
    .join(', ');
}

function formatDeleteBlockedMessage(check) {
  const base = check.message || 'Нельзя удалить рецепт: есть связанные записи.';
  const records = formatDependencyRecords(check.dependencies || []);

  return records
    ? `${base} Сначала уберите связи: ${records}.`
    : base;
}

function getRecipePrintReportUrl(id) {
  return `/workflow/recipe-print.html?recipe_id=${encodeURIComponent(id)}`;
}

function openRecipePrintReport(id) {
  if (!id) return;

  const url = getRecipePrintReportUrl(id);
  window.BADB_AUTH?.openAuthenticatedWindow(url);
}

async function duplicateRecipeUI(recipe) {
  if (!confirmDiscardUnsavedChanges()) return;

  clearRecordStatuses();
  mode = 'create';
  currentId = null;
  currentRecipe = null;
  initialFormState = null;

  const copyName = `${recipe.name} (копия)`;
  setRecipeName(copyName);

  form.elements.role.value = recipe.role || '';
  form.elements.variant_label.value = recipe.variant_label || '';
  form.elements.notes.value = recipe.notes || '';
  createdBySelect.value = '';

  showForm();
  clearRecipeLines();

  try {
    const lines = await fetchRecipeLines(recipe.tape_recipe_id);
    await renderRecipeLinesFromData(lines);
    renderRecipeStickyHeader();
    window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
  } catch (err) {
    showStatus(err.message || 'Ошибка загрузки состава рецепта', true);
  }
}

function createRecipeLineRow(index) {
  const row = document.createElement('tr');
  row.className = 'recipe-line-row';
  row.dataset.index = index;

  row.innerHTML = `
    <td>
      <select class="role-select" data-field="recipe_role" required>
        <option value="">— выбрать —</option>
        <option value="cathode_active">катодный активный материал</option>
        <option value="anode_active">анодный активный материал</option>
        <option value="binder">связующее</option>
        <option value="additive">добавка</option>
        <option value="solvent">растворитель</option>
      </select>
    </td>

    <td>
      <select class="material-select" data-field="material_id" required>
        <option value="">— выбрать —</option>
      </select>
    </td>

    <td>
      <input
        type="number"
        step="0.01"
        min="0"
        max="100"
        data-field="slurry_percent"
      >
    </td>

    <td>
      <input
        type="text"
        data-field="line_notes"
        placeholder="Комментарий"
      >
    </td>

    <td>
      <button type="button" class="delete-line" title="Удалить компонент" aria-label="Удалить компонент">🗑</button>
    </td>
  `;

  row.querySelector('.delete-line').addEventListener('click', () => {
    row.remove();
    renderRecipeStickyHeader();
  });

  return row;
}

async function appendRecipeLineRow(index, preset = null) {
  const container = document.getElementById('recipe-lines-rows');
  const row = createRecipeLineRow(index);
  container.appendChild(row);

  const roleSelect = row.querySelector('[data-field="recipe_role"]');

  if (preset) {
    roleSelect.value = preset.recipe_role ?? '';
  }

  roleSelect.addEventListener('change', async () => {
    const selected = roleSelect.value;

    if (selected === 'cathode_active') {
      form.elements.role.value = 'cathode';
    }

    if (selected === 'anode_active') {
      form.elements.role.value = 'anode';
    }

    await populateMaterialSelect(row);
    renderRecipeStickyHeader();
  });

  await populateMaterialSelect(row);

  if (preset) {
    row.querySelector('[data-field="material_id"]').value =
      preset.material_id || '';

    row.querySelector('[data-field="line_notes"]').value =
      preset.line_notes ?? '';

    row.querySelector('[data-field="slurry_percent"]').value =
      preset.slurry_percent ?? '';
  }

  row.querySelectorAll('input, select').forEach(field => {
    field.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;

      e.preventDefault();
      e.stopPropagation();

      const newIndex = container.children.length;
      const newRow = await appendRecipeLineRow(newIndex);
      newRow.querySelector('[data-field="recipe_role"]')?.focus();
    });
  });

  renderRecipeStickyHeader();
  return row;
}

function collectRecipeLinesFromDOM() {
  const rows = document.querySelectorAll('.recipe-line-row');
  const lines = [];

  rows.forEach(row => {
    const materialId = Number(
      row.querySelector('[data-field="material_id"]').value
    );

    const recipeRole =
      row.querySelector('[data-field="recipe_role"]').value;

    const percentRaw =
      row.querySelector('[data-field="slurry_percent"]').value;

    const slurryPercent =
      recipeRole === 'solvent'
        ? null
        : (percentRaw === '' ? null : Number(percentRaw));

    const lineNotes =
      row.querySelector('[data-field="line_notes"]').value || null;

    if (!materialId) return;

    lines.push({
      material_id: materialId,
      recipe_role: recipeRole,
      include_in_pct: recipeRole !== 'solvent',
      slurry_percent: slurryPercent,
      line_notes: lineNotes
    });
  });

  return lines;
}

function clearRecipeLines() {
  const container = document.getElementById('recipe-lines-rows');
  container.innerHTML = '';
}

// -------- Rendering --------

function renderRecipes(recipes, options = {}) {
  const totalCount = options.totalCount ?? recipes.length;
  const hasFilters = Boolean(options.hasFilters);

  recipesList.innerHTML = '';

  if (recipes.length === 0) {
    const emptyRow = document.createElement('li');
    emptyRow.className = 'user-row recipe-empty-row';
    emptyRow.textContent = totalCount === 0
      ? 'Рецепты пока не добавлены.'
      : hasFilters
        ? 'Нет рецептов по выбранным фильтрам.'
        : 'Рецепты не найдены.';
    recipesList.appendChild(emptyRow);
    return;
  }

  recipes.forEach(recipe => {
    const li = document.createElement('li');
    li.className = 'user-row';
    li.dataset.recipeId = recipe.tape_recipe_id;

    const titleLine = document.createElement('div');
    titleLine.className = 'record-list-title';
    titleLine.textContent = recipe.name;

    const metaLine = document.createElement('div');
    metaLine.className = 'record-list-meta';
    metaLine.textContent = [
      RECIPE_ROLE_LABELS[recipe.role] || recipe.role || '',
      recipe.active_percent !== null && recipe.active_percent !== undefined
        ? `${recipe.active_percent}%`
        : '',
      recipe.active_material_name || '',
      recipe.variant_label || ''
    ].filter(Boolean).join(' — ');

    const info = window.BADB_UI.createRecordOpenButton({
      className: 'user-info',
      ariaLabel: `Открыть рецепт ${recipe.name}`,
      children: [titleLine, metaLine],
      onClick: async () => {
        await openRecipeRecord(recipe);
      }
    });

    const actions = document.createElement('div');
    actions.className = 'actions';

    const printBtn = window.BADB_UI.createIconButton({
      icon: '🖨️',
      title: 'Печать отчёта',
      ariaLabel: `Печать отчёта рецепта ${recipe.name}`,
      onClick: () => {
        openRecipePrintReport(recipe.tape_recipe_id);
      }
    });

    const duplicateBtn = window.BADB_UI.createIconButton({
      icon: '📑',
      title: 'Дублировать рецепт',
      ariaLabel: `Дублировать рецепт ${recipe.name}`,
      onClick: () => {
        duplicateRecipeUI(recipe);
      }
    });

    actions.appendChild(printBtn);
    actions.appendChild(duplicateBtn);

    li.appendChild(info);
    li.appendChild(actions);
    recipesList.appendChild(li);
  });
}

function renderFilteredRecipes() {
  const filters = getRecipeFilterState();
  const filtered = getFilteredRecipes();

  renderRecipes(filtered, {
    totalCount: allRecipes.length,
    hasFilters: hasActiveRecipeFilters(filters)
  });
  updateRecipeFilterSummary(filtered.length, allRecipes.length);
}

async function renderRecipeLinesFromData(lines) {
  if (!Array.isArray(lines)) return;

  clearRecipeLines();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    await appendRecipeLineRow(i, line);
  }
}

function populateRecipeForm(recipe) {
  setRecipeName(recipe.name || '');
  form.elements.created_by.value = recipe.created_by || '';
  form.elements.role.value = recipe.role || '';
  form.elements.variant_label.value = recipe.variant_label || '';
  form.elements.notes.value = recipe.notes || '';
}

async function openRecipeRecord(recipe) {
  if (!confirmDiscardUnsavedChanges()) return;

  clearRecordStatuses();
  mode = 'edit';
  currentId = recipe.tape_recipe_id;
  currentRecipe = recipe;

  populateRecipeForm(recipe);
  showForm();
  clearRecipeLines();

  try {
    const lines = await fetchRecipeLines(recipe.tape_recipe_id);
    await renderRecipeLinesFromData(lines);
  } catch (err) {
    showStatus(err.message || 'Ошибка загрузки состава рецепта', true, { clearAfterMs: 9000 });
  } finally {
    markFormPristine();
    window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
  }
}

// -------- Status helper --------

const statusBox = document.querySelector('.status-feedback');

function showPageStatus(msg, isError = false, options = {}) {
  window.BADB_UI?.showStatus(statusBox, msg, {
    isError,
    clearAfterMs: options.clearAfterMs ?? (isError ? 9000 : 4500)
  });
}

function showHeaderStatus(msg, isError = false, options = {}) {
  window.BADB_UI?.showStatus(stickyStatus, msg, {
    isError,
    clearAfterMs: options.clearAfterMs ?? (isError ? 12000 : 4500)
  });
}

function showStatus(msg, isError = false, options = {}) {
  const target = options.target || (mode ? 'header' : 'page');

  if (target === 'header') {
    showHeaderStatus(msg, isError, options);
    return;
  }

  showPageStatus(msg, isError, options);
}

// -------- Events --------

addRecipeLine.addEventListener('click', async () => {
  const container = document.getElementById('recipe-lines-rows');
  const index = container.children.length;
  await appendRecipeLineRow(index);
});

addInput.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;

  e.preventDefault();
  if (!form.hidden) return;

  const name = addInput.value.trim();
  if (!name) return;

  clearRecordStatuses();
  mode = 'create';
  currentId = null;
  currentRecipe = null;
  initialFormState = null;

  setRecipeName(name);
  form.elements.role.value = '';
  form.elements.variant_label.value = '';
  form.elements.notes.value = '';
  createdBySelect.value = '';

  showForm();
  clearRecipeLines();
  await appendRecipeLineRow(0);
  renderRecipeStickyHeader();

  addInput.value = '';
  window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
});

function validateRequiredFields() {
  const missing = [];
  const name = getRecipeNameValue();
  const roleSelect = form.elements.role;

  nameInput.classList.remove('required-missing');
  roleSelect.classList.remove('required-missing');

  if (!name) {
    missing.push('Название');
    nameInput.classList.add('required-missing');
  }

  if (!roleSelect.value) {
    missing.push('Роль электрода');
    roleSelect.classList.add('required-missing');
  }

  if (missing.length) {
    if (!name) {
      nameInput.hidden = false;
      title.hidden = true;
      nameInput.focus();
    }

    showStatus(
      `Заполните обязательные поля: ${missing.join(', ')}`,
      true
    );
    return false;
  }

  return true;
}

function validateRecipeLines() {
  const rows = document.querySelectorAll('.recipe-line-row');
  let totalPercent = 0;

  if (rows.length === 0) {
    showStatus('Добавьте хотя бы один компонент', true);
    return false;
  }

  for (const row of rows) {
    const materialId =
      row.querySelector('[data-field="material_id"]')?.value;

    const percent =
      row.querySelector('[data-field="slurry_percent"]')?.value;

    if (!materialId) {
      showStatus('Выберите материал для каждого компонента', true);
      return false;
    }

    const role =
      row.querySelector('[data-field="recipe_role"]')?.value;

    if (!role) {
      showStatus('Выберите функциональную роль для каждого компонента', true);
      return false;
    }

    if (role !== 'solvent') {
      if (percent === '' || isNaN(Number(percent))) {
        showStatus('Укажите корректный % для каждого компонента', true);
        return false;
      }

      const pct = Number(percent);
      if (pct < 0 || pct > 100) {
        showStatus('% должен быть в диапазоне 0–100', true);
        return false;
      }

      totalPercent += pct;
    }

    if (role === 'solvent' && percent !== '') {
      const pct = Number(percent);
      if (pct < 0 || pct > 100) {
        showStatus('% должен быть в диапазоне 0–100', true);
        return false;
      }
    }
  }

  if (Math.abs(totalPercent - 100) > 0.0001) {
    showStatus('Сумма % по компонентам рецепта должна быть ровно 100%.', true);
    return false;
  }

  return true;
}

function recipeNameVersionExists(name, variant, excludeId = null) {
  return allRecipes.some((recipe) => {
    const recipeId = recipe.tape_recipe_id
      ? Number(recipe.tape_recipe_id)
      : null;

    if (excludeId && recipeId === excludeId) return false;

    return (
      (recipe.name || '').trim() === name &&
      ((recipe.variant_label || '').trim()) === (variant || '')
    );
  });
}

saveBtn.addEventListener('click', async () => {
  if (!mode) return;

  if (!validateRequiredFields()) return;
  if (!validateRecipeLines()) return;

  const name = getRecipeNameValue();
  const variant = (form.elements.variant_label.value || '').trim();
  const excludeId = mode === 'edit' ? currentId : null;

  if (recipeNameVersionExists(name, variant, excludeId)) {
    showStatus(
      'Рецепт с таким названием и версией уже существует. Измените версию рецепта или его название.',
      true
    );
    return;
  }

  setRecipeName(name);

  const data = formDataToObject(form);
  data.name = name;
  data.role = form.elements.role.value;
  data.variant_label = form.elements.variant_label.value || null;
  data.notes = form.elements.notes.value || null;
  data.lines = collectRecipeLinesFromDOM();
  delete data.created_by;

  try {
    const initialMode = mode;

    if (mode === 'create') {
      const saved = await createRecipe(data);
      currentId = saved.tape_recipe_id;
      mode = 'edit';
    } else if (mode === 'edit') {
      await updateRecipe(currentId, data);
    }

    currentRecipe = {
      ...(currentRecipe || {}),
      tape_recipe_id: currentId,
      name: data.name,
      role: data.role,
      variant_label: data.variant_label,
      notes: data.notes
    };

    await loadRecipes();
    markFormPristine();
    showStatus(initialMode === 'create' ? 'Рецепт сохранён' : 'Изменения сохранены');
  } catch (err) {
    showStatus(err.message, true);
  }
});

clearBtn.addEventListener('click', () => {
  if (!hasUnsavedChanges()) {
    resetForm();
    return;
  }

  if (confirm('Выйти без сохранения изменений?')) {
    resetForm();
  }
});

if (printRecipeBtn) {
  printRecipeBtn.addEventListener('click', () => {
    openRecipePrintReport(currentId);
  });
}

async function deleteCurrentRecipe() {
  if (!currentId) {
    showStatus('Сначала откройте рецепт', true, { clearAfterMs: 5000 });
    return;
  }

  try {
    const check = await fetchRecipeDeleteCheck(currentId);

    if (!check.can_delete) {
      showStatus(formatDeleteBlockedMessage(check), true, { clearAfterMs: 15000 });
      return;
    }

    if (hasUnsavedChanges() && !confirm('Есть несохранённые изменения. Удалить рецепт без сохранения?')) {
      return;
    }

    const phrase = `DELETE RECIPE ${currentId}`;
    const confirmation = prompt(
      `Удаление рецепта #${currentId} необратимо.\nВведите ${phrase}, чтобы подтвердить.`
    );

    if (confirmation !== phrase) {
      showStatus('Удаление отменено.', true, { clearAfterMs: 4000 });
      return;
    }

    await deleteRecipe(currentId);
    resetForm();
    await loadRecipes();
    showStatus('Рецепт удалён', false, { target: 'page', clearAfterMs: 5000 });
  } catch (err) {
    showStatus(err.message, true, { clearAfterMs: 12000 });
  }
}

if (deleteRecipeBtn) {
  deleteRecipeBtn.addEventListener('click', deleteCurrentRecipe);
}

createdBySelect.addEventListener('focus', loadUsers);

form.addEventListener('input', renderRecipeStickyHeader);
form.addEventListener('change', renderRecipeStickyHeader);

// ------ name: editable ------
title.addEventListener('click', () => {
  nameInput.value = getRecipeNameValue();
  nameInput.hidden = false;
  title.hidden = true;
  nameInput.focus();
  nameInput.select();
});

nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    nameInput.blur();
  }
});

nameInput.addEventListener('blur', () => {
  const val = nameInput.value.trim();
  setRecipeName(val || title.textContent);
  renderRecipeStickyHeader();
});

if (filterTextInput) {
  filterTextInput.addEventListener('input', renderFilteredRecipes);
}

if (filterRoleSelect) {
  filterRoleSelect.addEventListener('change', renderFilteredRecipes);
}

if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener('click', () => {
    if (filterTextInput) filterTextInput.value = '';
    if (filterRoleSelect) filterRoleSelect.value = '';
    renderFilteredRecipes();
    filterTextInput?.focus();
  });
}

const recipeLogoutGuard = {
  hasUnsavedChanges,
  discardUnsavedChanges: resetForm,
  message: 'Есть несохранённые изменения рецепта. Выйти без сохранения?'
};

window.BADB_PAGE_LOGOUT_GUARD = recipeLogoutGuard;
window.BADB_AUTH?.registerLogoutGuard?.(recipeLogoutGuard);

window.addEventListener('beforeunload', (event) => {
  if (!hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = '';
});

window.addEventListener('focus', () => {
  cachedMaterials = null;
});

// -------- Init --------

hideForm();
loadUsers();
loadRecipes();
