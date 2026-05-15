const addInput = document.getElementById('separator-name');
const nameInput = document.getElementById('separator-name-input');
const form = document.forms['separator-form'];
const title = form.querySelector('h2');
const printSeparatorBtn = document.getElementById('printSeparatorBtn');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const deleteSeparatorBtn = document.getElementById('deleteSeparatorBtn');
const saveFilesBtn = document.getElementById('saveFilesBtn');
const createdBySelect = document.getElementById('separator-created-by');
const filesInput = document.getElementById('separator-files');
const savedFilesBox = document.getElementById('separator-files-saved');
const stickyHeader = document.getElementById('separator_sticky_header');
const stickyTitle = document.getElementById('separator_sticky_title');
const stickyMeta = document.getElementById('separator_sticky_meta');
const stickyDirty = document.getElementById('separator-global-dirty');
const stickyStatus = document.getElementById('separator-sticky-status');
const filesStatus = document.getElementById('separator-files-status');
const filterTextInput = document.getElementById('separator-filter-text');
const filterStatusSelect = document.getElementById('separator-filter-status');
const filterStructureSelect = document.getElementById('separator-filter-structure');
const clearFiltersBtn = document.getElementById('clearSeparatorFiltersBtn');
const filterSummary = document.getElementById('separator-filter-summary');

const separatorsList = document.getElementById('separatorsList');
const statusSelect = form.querySelector('select[name="status"]');
const depletedInput = form.querySelector('input[name="depleted_at"]');
const depletedWrapper = document.getElementById('depleted-wrapper');
const structureSelect = document.getElementById('separator-structure-id');

let mode = null; // 'create' | 'edit'
let currentId = null;
let currentSeparator = null;
let savedSeparatorFiles = [];
let initialFormState = null;
let allSeparators = [];
let allStructures = [];

const SEPARATOR_STATUS_LABELS = {
  available: 'в наличии',
  used: 'израсходован',
  scrap: 'списан'
};

function formatDate(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('ru-RU');
}

function formatDateTime(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString('ru-RU');
}

function normalizeFilterText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
}

function getSeparatorNameValue() {
  const source = nameInput.hidden ? title.textContent : nameInput.value;
  return (source || '').trim();
}

function setSeparatorName(name) {
  const value = (name || '').trim();
  title.textContent = value;
  nameInput.value = value;
  title.hidden = false;
  nameInput.hidden = true;
}

function getStructureName(structureId, fallback = '') {
  const structure = allStructures.find(
    item => String(item.sep_str_id) === String(structureId)
  );

  return structure?.name || fallback || '';
}

function getSeparatorStructureName(sep) {
  return sep?.structure_name || getStructureName(sep?.structure_id) || '';
}

function getSeparatorStatusLabel(status) {
  return SEPARATOR_STATUS_LABELS[status] || status || '—';
}

function showForm() {
  form.hidden = false;
  addInput.disabled = true;
  renderSeparatorStickyHeader();
}

function hideForm() {
  form.hidden = true;
  addInput.disabled = false;
  renderSeparatorStickyHeader();
}

function captureFormState() {
  return JSON.stringify({
    mode,
    title: title.textContent,
    nameInput: nameInput.value,
    supplier: form.elements['supplier'].value,
    brand: form.elements['brand'].value,
    batch: form.elements['batch'].value,
    air_perm: form.elements['air_perm'].value,
    air_perm_units: form.elements['air_perm_units'].value,
    thickness_um: form.elements['thickness_um'].value,
    porosity: form.elements['porosity'].value,
    comments: form.elements['comments'].value,
    status: form.elements['status'].value,
    depleted_at: form.elements['depleted_at'].value,
    structure_id: structureSelect.value,
    file_path: form.elements['file_path'].value,
    pending_files: Array.from(filesInput.files || []).map(file => file.name),
    saved_files: savedSeparatorFiles.map(file => file.separator_file_id)
  });
}

function hasUnsavedChanges() {
  if (!mode) return false;
  return captureFormState() !== initialFormState;
}

function getSeparatorStickyTitle() {
  const name = getSeparatorNameValue() || 'без названия';

  if (mode === 'edit' && currentId) {
    return `Сепаратор #${currentId} | ${name}`;
  }

  return `Новый сепаратор | ${name}`;
}

function getSeparatorMetaText() {
  if (!mode) return '—';

  const structureName = getStructureName(structureSelect.value);
  const status = getSeparatorStatusLabel(form.elements['status'].value);
  const thickness = form.elements['thickness_um'].value;
  const porosity = form.elements['porosity'].value;
  const createdBy = currentSeparator?.created_by_name || '';
  const createdAt = formatDate(currentSeparator?.created_at);

  return [
    structureName && `структура: ${structureName}`,
    status && `статус: ${status}`,
    thickness && `толщина: ${thickness} мкм`,
    porosity && `пористость: ${porosity}%`,
    createdBy && `создал: ${createdBy}`,
    createdAt && `создан: ${createdAt}`
  ].filter(Boolean).join(' — ') || 'новая запись';
}

function renderSeparatorStickyHeader() {
  window.BADB_UI?.setStickyHeader({
    header: stickyHeader,
    titleEl: stickyTitle,
    metaEl: stickyMeta,
    dirtyEl: stickyDirty,
    title: getSeparatorStickyTitle(),
    meta: getSeparatorMetaText(),
    isDirty: hasUnsavedChanges(),
    hidden: !mode
  });

  if (saveBtn) {
    saveBtn.textContent = mode === 'create'
      ? 'Сохранить сепаратор'
      : 'Сохранить изменения';
  }

  if (deleteSeparatorBtn) {
    deleteSeparatorBtn.hidden = mode !== 'edit' || !currentId;
  }

  if (printSeparatorBtn) {
    printSeparatorBtn.hidden = mode !== 'edit' || !currentId;
  }
}

function markFormPristine() {
  initialFormState = captureFormState();
  renderSeparatorStickyHeader();
}

function clearRecordStatuses() {
  showHeaderStatus('', false, { clearAfterMs: 0 });
  showFileStatus('', false, { clearAfterMs: 0 });
}

function clearSavedSeparatorFiles() {
  savedSeparatorFiles = [];
  renderSavedSeparatorFiles(savedSeparatorFiles);
  renderSeparatorStickyHeader();
}

function updateSaveFilesButtonVisibility() {
  saveFilesBtn.hidden = !filesInput.files || filesInput.files.length === 0;
  renderSeparatorStickyHeader();
}

function resetForm() {
  form.reset();
  setSeparatorName('');
  mode = null;
  currentId = null;
  currentSeparator = null;
  initialFormState = null;
  filesInput.value = '';
  clearSavedSeparatorFiles();
  updateSaveFilesButtonVisibility();
  clearRecordStatuses();
  hideForm();
  updateDepletedState();
}

function formDataToObject(formEl) {
  const data = {};

  Array.from(new FormData(formEl).entries()).forEach(([key, value]) => {
    if (value instanceof File) return;
    data[key] = value;
  });

  return data;
}

function populateSeparatorForm(sep) {
  form.elements['supplier'].value = sep.supplier || '';
  form.elements['brand'].value = sep.brand || '';
  form.elements['batch'].value = sep.batch || '';
  form.elements['air_perm'].value = sep.air_perm ?? '';
  form.elements['air_perm_units'].value = sep.air_perm_units || '';
  form.elements['thickness_um'].value = sep.thickness_um ?? '';
  form.elements['porosity'].value = sep.porosity ?? '';
  form.elements['comments'].value = sep.comments || '';
  form.elements['status'].value = sep.status || 'available';
  form.elements['depleted_at'].value = sep.depleted_at ? String(sep.depleted_at).slice(0, 10) : '';
  form.elements['file_path'].value = sep.file_path || '';
  structureSelect.value = sep.structure_id || '';
  updateDepletedState();
}

function renderSavedSeparatorFiles(entries) {
  savedFilesBox.innerHTML = '';

  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }

  entries.forEach((entry, index) => {
    const row = document.createElement('div');
    const link = document.createElement('a');
    const deleteBtn = document.createElement('button');

    link.href = entry.download_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = entry.file_name || `Файл ${index + 1}`;

    deleteBtn.type = 'button';
    deleteBtn.textContent = '🗑';
    deleteBtn.title = 'Удалить файл';
    deleteBtn.setAttribute('aria-label', `Удалить файл ${entry.file_name || index + 1}`);
    deleteBtn.style.marginLeft = '0.5rem';
    deleteBtn.onclick = async () => {
      const fileName = entry.file_name || `Файл ${index + 1}`;

      if (!confirm(`Удалить файл "${fileName}"?`)) return;

      try {
        await deleteSeparatorFile(entry.separator_file_id);
        savedSeparatorFiles = savedSeparatorFiles.filter(
          (file) => file.separator_file_id !== entry.separator_file_id
        );
        renderSavedSeparatorFiles(savedSeparatorFiles);
        markFormPristine();
        showFileStatus('Файл удалён');
      } catch (err) {
        showFileStatus(err.message, true, { clearAfterMs: 9000 });
      }
    };

    row.append(`${index + 1}. `);
    row.appendChild(link);
    row.appendChild(deleteBtn);
    savedFilesBox.appendChild(row);
  });
}

async function fetchSeparators() {
  const res = await fetch('/api/separators');

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки списка сепараторов');
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function createSeparator(data) {
  const res = await fetch('/api/separators', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка сохранения');
  }

  return res.json();
}

async function updateSeparator(id, data) {
  const res = await fetch(`/api/separators/${id}`, {
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

async function loadStructures() {
  try {
    const res = await fetch('/api/structures');

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка загрузки структур сепараторов');
    }

    allStructures = await res.json();
    renderStructureOptions();
    renderFilteredSeparators();
  } catch (err) {
    showPageStatus(err.message, true, { clearAfterMs: 9000 });
  }
}

function renderStructureOptions() {
  structureSelect.replaceChildren(new Option('— выбрать —', ''));

  allStructures.forEach(s => {
    structureSelect.appendChild(new Option(s.name, s.sep_str_id));
  });

  if (filterStructureSelect) {
    const currentValue = filterStructureSelect.value;
    filterStructureSelect.replaceChildren(new Option('Все структуры', ''));

    allStructures.forEach(s => {
      filterStructureSelect.appendChild(new Option(s.name, String(s.sep_str_id)));
    });

    filterStructureSelect.value = [...filterStructureSelect.options].some(
      option => option.value === currentValue
    ) ? currentValue : '';
  }
}

async function fetchSeparatorFiles(id) {
  const res = await fetch(`/api/separators/${id}/files`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки файлов сепаратора');
  }

  return res.json();
}

async function uploadSeparatorFiles(id, entries) {
  const res = await fetch(`/api/separators/${id}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка сохранения файлов сепаратора');
  }

  return res.json();
}

async function deleteSeparatorFile(fileId) {
  const res = await fetch(`/api/separators/files/${fileId}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка удаления файла сепаратора');
  }
}

async function fetchSeparatorDeleteCheck(id) {
  const res = await fetch(`/api/separators/${id}/delete-check`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка проверки удаления сепаратора');
  }

  return res.json();
}

async function deleteSeparator(id) {
  const res = await fetch(`/api/separators/${id}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка удаления');
  }
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

function getSeparatorFilterState() {
  return {
    text: normalizeFilterText(filterTextInput?.value),
    status: filterStatusSelect?.value || '',
    structure: filterStructureSelect?.value || ''
  };
}

function hasActiveSeparatorFilters(filters = getSeparatorFilterState()) {
  return Boolean(filters.text || filters.status || filters.structure);
}

function getSeparatorSearchText(sep) {
  return normalizeFilterText([
    sep.sep_id,
    sep.name,
    sep.supplier,
    sep.brand,
    sep.batch,
    getSeparatorStructureName(sep),
    sep.air_perm,
    sep.air_perm_units,
    sep.thickness_um,
    sep.porosity,
    sep.comments,
    getSeparatorStatusLabel(sep.status),
    sep.created_by_name,
    sep.updated_by_name
  ].filter(value => value !== null && value !== undefined && value !== '').join(' '));
}

function matchesSeparatorFilters(sep, filters = getSeparatorFilterState()) {
  if (filters.status && sep.status !== filters.status) return false;
  if (filters.structure && String(sep.structure_id || '') !== filters.structure) return false;
  if (filters.text && !getSeparatorSearchText(sep).includes(filters.text)) return false;

  return true;
}

function getFilteredSeparators() {
  const filters = getSeparatorFilterState();
  return allSeparators.filter((sep) => matchesSeparatorFilters(sep, filters));
}

function updateSeparatorFilterSummary(filteredCount, totalCount) {
  const filters = getSeparatorFilterState();
  const hasFilters = hasActiveSeparatorFilters(filters);

  if (clearFiltersBtn) {
    clearFiltersBtn.disabled = !hasFilters;
  }

  if (!filterSummary) return;

  if (totalCount === 0) {
    filterSummary.textContent = 'Нет сепараторов';
    return;
  }

  filterSummary.textContent = hasFilters
    ? `Показано ${filteredCount} из ${totalCount}`
    : `Всего: ${totalCount}`;
}

function renderSeparators(separators, options = {}) {
  const totalCount = options.totalCount ?? separators.length;
  const hasFilters = Boolean(options.hasFilters);

  separatorsList.innerHTML = '';

  if (separators.length === 0) {
    const emptyRow = document.createElement('li');
    emptyRow.className = 'user-row separator-empty-row';
    emptyRow.textContent = totalCount === 0
      ? 'Сепараторы пока не добавлены.'
      : hasFilters
        ? 'Сепараторы по выбранным фильтрам не найдены.'
        : 'Сепараторы не найдены.';
    separatorsList.appendChild(emptyRow);
    return;
  }

  separators.forEach(sep => {
    const li = document.createElement('li');
    li.className = 'user-row';

    const titleLine = document.createElement('div');
    titleLine.className = 'record-list-title';
    titleLine.textContent = `#${sep.sep_id} | ${sep.name || '— без названия —'}`;

    const metaLine = document.createElement('div');
    metaLine.className = 'record-list-meta';
    metaLine.textContent = [
      getSeparatorStructureName(sep),
      getSeparatorStatusLabel(sep.status),
      sep.supplier || '',
      sep.brand || '',
      sep.batch ? `партия: ${sep.batch}` : '',
      sep.thickness_um != null ? `${sep.thickness_um} мкм` : '',
      sep.porosity != null ? `${sep.porosity}%` : '',
      sep.created_by_name || ''
    ].filter(Boolean).join(' — ');

    const info = window.BADB_UI.createRecordOpenButton({
      className: 'user-info',
      ariaLabel: `Открыть сепаратор ${sep.name || sep.sep_id}`,
      children: [titleLine, metaLine],
      onClick: async () => {
        await openSeparatorRecord(sep);
      }
    });

    const actions = document.createElement('div');
    actions.className = 'actions';

    const printBtn = window.BADB_UI.createIconButton({
      icon: '🖨️',
      title: 'Печать отчёта',
      ariaLabel: `Печать отчёта сепаратора ${sep.name || sep.sep_id}`,
      onClick: () => {
        openSeparatorPrintReport(sep.sep_id);
      }
    });

    const duplicateBtn = window.BADB_UI.createIconButton({
      icon: '📑',
      title: 'Дублировать сепаратор',
      ariaLabel: `Дублировать сепаратор ${sep.name || sep.sep_id}`,
      onClick: () => {
        duplicateSeparator(sep);
      }
    });

    actions.appendChild(printBtn);
    actions.appendChild(duplicateBtn);

    li.appendChild(info);
    li.appendChild(actions);

    separatorsList.appendChild(li);
  });
}

function renderFilteredSeparators() {
  const filters = getSeparatorFilterState();
  const filtered = getFilteredSeparators();

  renderSeparators(filtered, {
    totalCount: allSeparators.length,
    hasFilters: hasActiveSeparatorFilters(filters)
  });
  updateSeparatorFilterSummary(filtered.length, allSeparators.length);
}

function confirmDiscardUnsavedChanges() {
  if (!hasUnsavedChanges()) return true;
  return confirm('Выйти без сохранения изменений?');
}

async function openSeparatorRecord(sep) {
  if (!confirmDiscardUnsavedChanges()) return;

  clearRecordStatuses();
  mode = 'edit';
  currentId = sep.sep_id;
  currentSeparator = sep;

  setSeparatorName(sep.name);
  populateSeparatorForm(sep);

  if (sep.created_by) {
    createdBySelect.value = sep.created_by;
  }

  filesInput.value = '';
  savedSeparatorFiles = [];
  renderSavedSeparatorFiles(savedSeparatorFiles);
  updateSaveFilesButtonVisibility();
  showForm();

  try {
    savedSeparatorFiles = await fetchSeparatorFiles(sep.sep_id);
    renderSavedSeparatorFiles(savedSeparatorFiles);
  } catch (err) {
    showStatus(err.message, true, { clearAfterMs: 9000 });
  } finally {
    markFormPristine();
    window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
  }
}

function duplicateSeparator(sep) {
  if (!confirmDiscardUnsavedChanges()) return;

  clearRecordStatuses();
  mode = 'create';
  currentId = null;
  currentSeparator = null;
  initialFormState = null;

  const copyName = `${sep.name} (копия)`;
  setSeparatorName(copyName);
  populateSeparatorForm({
    ...sep,
    status: 'available',
    depleted_at: ''
  });

  createdBySelect.value = '';
  form.elements['file_path'].value = '';
  filesInput.value = '';
  clearSavedSeparatorFiles();
  updateSaveFilesButtonVisibility();
  showForm();
  window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
}

function getSeparatorPrintReportUrl(id) {
  return `/workflow/separator-print.html?sep_id=${encodeURIComponent(id)}`;
}

function openSeparatorPrintReport(id) {
  if (!id) return;
  window.BADB_AUTH?.openAuthenticatedWindow(getSeparatorPrintReportUrl(id));
}

async function saveSeparatorRecord(options = {}) {
  if (!validateRequiredFields(options.statusTarget || 'header')) return null;

  const data = formDataToObject(form);
  delete data.created_by;
  data.name = getSeparatorNameValue();
  setSeparatorName(data.name);

  const initialMode = mode;
  let savedSeparator = null;

  if (initialMode === 'create') {
    savedSeparator = await createSeparator(data);
    currentId = savedSeparator.sep_id;
    mode = 'edit';
  } else if (initialMode === 'edit') {
    savedSeparator = await updateSeparator(currentId, data);
  }

  if (savedSeparator) {
    currentSeparator = {
      ...(currentSeparator || {}),
      ...savedSeparator,
      ...data,
      sep_id: savedSeparator.sep_id || currentId,
      structure_name: getStructureName(data.structure_id)
    };
  }

  return {
    savedSeparator,
    initialMode
  };
}

async function uploadSelectedFiles() {
  const selectedFiles = Array.from(filesInput.files || []);

  if (selectedFiles.length === 0) {
    return [];
  }

  const entries = await Promise.all(selectedFiles.map(async (file) => ({
    file_name: file.name,
    mime_type: file.type || 'application/octet-stream',
    file_content_base64: await fileToBase64(file)
  })));

  savedSeparatorFiles = await uploadSeparatorFiles(currentId, entries);
  renderSavedSeparatorFiles(savedSeparatorFiles);
  filesInput.value = '';
  updateSaveFilesButtonVisibility();
  markFormPristine();

  return selectedFiles;
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
  const base = check.message || 'Нельзя удалить сепаратор: есть связанные записи.';
  const records = formatDependencyRecords(check.dependencies || []);

  return records
    ? `${base} Сначала уберите связи: ${records}.`
    : base;
}

async function deleteCurrentSeparator() {
  if (!currentId) {
    showStatus('Сначала откройте сепаратор', true, { clearAfterMs: 5000 });
    return;
  }

  try {
    const check = await fetchSeparatorDeleteCheck(currentId);

    if (!check.can_delete) {
      showStatus(formatDeleteBlockedMessage(check), true, { clearAfterMs: 15000 });
      return;
    }

    if (hasUnsavedChanges() && !confirm('Есть несохранённые изменения. Удалить сепаратор без сохранения?')) {
      return;
    }

    const phrase = `DELETE SEPARATOR ${currentId}`;
    const confirmation = prompt(
      `Удаление сепаратора #${currentId} необратимо.\nВведите ${phrase}, чтобы подтвердить.`
    );

    if (confirmation !== phrase) {
      showStatus('Удаление отменено.', true, { clearAfterMs: 4000 });
      return;
    }

    await deleteSeparator(currentId);
    resetForm();
    await loadSeparators();
    showStatus('Сепаратор удалён', false, { clearAfterMs: 5000 });
  } catch (err) {
    showStatus(err.message, true, { clearAfterMs: 12000 });
  }
}

function updateDepletedState() {
  if (statusSelect.value === 'available') {
    depletedWrapper.hidden = true;
    depletedInput.value = '';
  } else {
    depletedWrapper.hidden = false;
  }

  renderSeparatorStickyHeader();
}

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

function showFileStatus(msg, isError = false, options = {}) {
  window.BADB_UI?.showStatus(filesStatus, msg, {
    isError,
    clearAfterMs: options.clearAfterMs ?? (isError ? 9000 : 4500)
  });
}

function showStatus(msg, isError = false, options = {}) {
  const target = options.target || (mode ? 'header' : 'page');

  if (target === 'files') {
    showFileStatus(msg, isError, options);
    return;
  }

  if (target === 'header') {
    showHeaderStatus(msg, isError, options);
    return;
  }

  showPageStatus(msg, isError, options);
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
      createdBySelect.appendChild(new Option(u.name, u.user_id));
    });
  } catch (err) {
    showPageStatus(err.message, true, { clearAfterMs: 9000 });
  }
}

function validateRequiredFields(statusTarget = 'header') {
  const missing = [];
  const name = getSeparatorNameValue();

  nameInput.classList.remove('required-missing');
  structureSelect.classList.remove('required-missing');

  if (!name) {
    missing.push('Название');
    nameInput.classList.add('required-missing');
  }

  if (!structureSelect.value) {
    missing.push('Тип структуры');
    structureSelect.classList.add('required-missing');
  }

  if (missing.length) {
    if (!name) {
      nameInput.hidden = false;
      title.hidden = true;
      nameInput.focus();
    }

    showStatus(`Заполните обязательные поля: ${missing.join(', ')}`, true, { target: statusTarget });
    return false;
  }

  return true;
}

async function loadSeparators() {
  if (!separatorsList) return;

  try {
    const data = await fetchSeparators();
    allSeparators = data;
    renderFilteredSeparators();
  } catch (err) {
    console.error(err);
    showPageStatus(err.message || 'Ошибка загрузки списка сепараторов', true, { clearAfterMs: 9000 });
  }
}

addInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;

  e.preventDefault();

  if (!form.hidden) return;

  const name = addInput.value.trim();
  if (!name) return;

  clearRecordStatuses();
  mode = 'create';
  currentId = null;
  currentSeparator = null;
  initialFormState = null;

  form.reset();
  setSeparatorName(name);
  updateDepletedState();
  showForm();

  addInput.value = '';
  clearSavedSeparatorFiles();
  updateSaveFilesButtonVisibility();
  window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
});

saveBtn.addEventListener('click', async () => {
  if (!mode) return;

  try {
    const result = await saveSeparatorRecord();
    if (!result) return;

    const selectedFiles = await uploadSelectedFiles();
    markFormPristine();
    await loadSeparators();

    if (result.initialMode === 'create') {
      showStatus(
        selectedFiles.length > 0
          ? 'Сепаратор и файлы сохранены'
          : 'Сепаратор сохранён'
      );
    } else {
      showStatus(
        selectedFiles.length > 0
          ? 'Изменения и файлы сохранены'
          : 'Изменения сохранены'
      );
    }
  } catch (err) {
    showStatus(err.message, true);
  }
});

saveFilesBtn.addEventListener('click', async () => {
  if (!mode) return;

  try {
    if (mode === 'create') {
      const result = await saveSeparatorRecord({ statusTarget: 'files' });
      if (!result) return;
      await loadSeparators();
    }

    const selectedFiles = await uploadSelectedFiles();

    if (selectedFiles.length === 0) return;

    markFormPristine();
    showStatus('Файлы сохранены', false, { target: 'files' });
    await loadSeparators();
  } catch (err) {
    showStatus(err.message, true, { target: 'files' });
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

if (deleteSeparatorBtn) {
  deleteSeparatorBtn.addEventListener('click', deleteCurrentSeparator);
}

if (printSeparatorBtn) {
  printSeparatorBtn.addEventListener('click', () => {
    openSeparatorPrintReport(currentId);
  });
}

filesInput.addEventListener('change', updateSaveFilesButtonVisibility);
statusSelect.addEventListener('change', updateDepletedState);
structureSelect.addEventListener('focus', loadStructures);
createdBySelect.addEventListener('focus', loadUsers);

form.addEventListener('input', renderSeparatorStickyHeader);
form.addEventListener('change', renderSeparatorStickyHeader);

title.addEventListener('click', () => {
  nameInput.value = getSeparatorNameValue();
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
  setSeparatorName(val || title.textContent);
  renderSeparatorStickyHeader();
});

if (filterTextInput) {
  filterTextInput.addEventListener('input', renderFilteredSeparators);
}

if (filterStatusSelect) {
  filterStatusSelect.addEventListener('change', renderFilteredSeparators);
}

if (filterStructureSelect) {
  filterStructureSelect.addEventListener('change', renderFilteredSeparators);
}

if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener('click', () => {
    if (filterTextInput) filterTextInput.value = '';
    if (filterStatusSelect) filterStatusSelect.value = '';
    if (filterStructureSelect) filterStructureSelect.value = '';
    renderFilteredSeparators();
    filterTextInput?.focus();
  });
}

const separatorLogoutGuard = {
  hasUnsavedChanges,
  discardUnsavedChanges: resetForm,
  message: 'Есть несохранённые изменения сепаратора. Выйти без сохранения?'
};

window.BADB_PAGE_LOGOUT_GUARD = separatorLogoutGuard;
window.BADB_AUTH?.registerLogoutGuard?.(separatorLogoutGuard);

window.addEventListener('beforeunload', (event) => {
  if (!hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = '';
});

hideForm();
updateDepletedState();
loadUsers();
loadStructures();
loadSeparators();
