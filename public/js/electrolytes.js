const addInput = document.getElementById('electrolyte-name');
const nameInput = document.getElementById('electrolyte-name-input');
const form = document.forms['electrolyte-form'];
const title = form.querySelector('h2');
const printElectrolyteBtn = document.getElementById('printElectrolyteBtn');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const deleteElectrolyteBtn = document.getElementById('deleteElectrolyteBtn');
const saveFilesBtn = document.getElementById('saveFilesBtn');
const createdBySelect = document.getElementById('electrolyte-created-by');
const typeSelect = document.getElementById('electrolyte_type');
const filesInput = document.getElementById('electrolyte-files-input');
const savedFilesBox = document.getElementById('electrolyte-files-saved');
const stickyHeader = document.getElementById('electrolyte_sticky_header');
const stickyTitle = document.getElementById('electrolyte_sticky_title');
const stickyMeta = document.getElementById('electrolyte_sticky_meta');
const stickyDirty = document.getElementById('electrolyte-global-dirty');
const stickyStatus = document.getElementById('electrolyte-sticky-status');
const filesStatus = document.getElementById('electrolyte-files-status');

const electrolytesList = document.getElementById('electrolytesList');

let mode = null; // 'create' | 'edit'
let currentId = null;
let currentElectrolyte = null;
let savedElectrolyteFiles = [];
let initialFormState = null;

const ELECTROLYTE_TYPE_LABELS = {
  liquid: 'жидкий',
  solid: 'твёрдый',
  gel: 'гелевый'
};

const ELECTROLYTE_STATUS_LABELS = {
  active: 'активный',
  inactive: 'не используется',
  archived: 'архив'
};

function getElectrolyteNameValue() {
  const source = nameInput.hidden ? title.textContent : nameInput.value;
  return (source || '').trim();
}

function setElectrolyteName(name) {
  const value = (name || '').trim();
  title.textContent = value;
  nameInput.value = value;
  title.hidden = false;
  nameInput.hidden = true;
}

function showForm() {
  form.hidden = false;
  addInput.disabled = true;
  renderElectrolyteStickyHeader();
}

function hideForm() {
  form.hidden = true;
  addInput.disabled = false;
  renderElectrolyteStickyHeader();
}

function formatDate(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString();
}

function getElectrolyteDisplayName() {
  return getElectrolyteNameValue() || 'без названия';
}

function getElectrolyteStickyTitle() {
  const name = getElectrolyteDisplayName();

  if (mode === 'edit' && currentId) {
    return `Электролит #${currentId} | ${name}`;
  }

  return `Новый электролит | ${name}`;
}

function getElectrolyteMetaText() {
  if (!mode) return '—';

  const type = ELECTROLYTE_TYPE_LABELS[form.elements['electrolyte_type'].value] || '';
  const status = ELECTROLYTE_STATUS_LABELS[form.elements['status'].value] || '';
  const createdBy = currentElectrolyte?.created_by_name || '';
  const createdAt = formatDate(currentElectrolyte?.created_at);

  return [
    type && `тип: ${type}`,
    status && `статус: ${status}`,
    createdBy && `создал: ${createdBy}`,
    createdAt && `создан: ${createdAt}`
  ].filter(Boolean).join(' — ') || 'новая запись';
}

function renderElectrolyteStickyHeader() {
  window.BADB_UI?.setStickyHeader({
    header: stickyHeader,
    titleEl: stickyTitle,
    metaEl: stickyMeta,
    dirtyEl: stickyDirty,
    title: getElectrolyteStickyTitle(),
    meta: getElectrolyteMetaText(),
    isDirty: hasUnsavedChanges(),
    hidden: !mode
  });

  if (saveBtn) {
    saveBtn.textContent = mode === 'create'
      ? 'Сохранить электролит'
      : 'Сохранить изменения';
  }

  if (deleteElectrolyteBtn) {
    deleteElectrolyteBtn.hidden = mode !== 'edit' || !currentId;
  }

  if (printElectrolyteBtn) {
    printElectrolyteBtn.hidden = mode !== 'edit' || !currentId;
  }
}

function captureFormState() {
  return JSON.stringify({
    mode,
    title: title.textContent,
    nameInput: nameInput.value,
    electrolyte_type: form.elements['electrolyte_type'].value,
    solvent_system: form.elements['solvent_system'].value,
    salts: form.elements['salts'].value,
    concentration: form.elements['concentration'].value,
    additives: form.elements['additives'].value,
    notes: form.elements['notes'].value,
    status: form.elements['status'].value,
    pending_files: Array.from(filesInput.files || []).map(file => file.name),
    saved_files: savedElectrolyteFiles.map(file => file.electrolyte_file_id)
  });
}

function markFormPristine() {
  initialFormState = captureFormState();
  renderElectrolyteStickyHeader();
}

function hasUnsavedChanges() {
  if (!mode) return false;
  return captureFormState() !== initialFormState;
}

function clearSavedElectrolyteFiles() {
  savedElectrolyteFiles = [];
  renderSavedElectrolyteFiles(savedElectrolyteFiles);
  renderElectrolyteStickyHeader();
}

function updateSaveFilesButtonVisibility() {
  saveFilesBtn.hidden = !filesInput.files || filesInput.files.length === 0;
  renderElectrolyteStickyHeader();
}

function resetForm() {
  form.reset();
  setElectrolyteName('');
  mode = null;
  currentId = null;
  currentElectrolyte = null;
  initialFormState = null;
  filesInput.value = '';
  clearSavedElectrolyteFiles();
  updateSaveFilesButtonVisibility();
  clearRecordStatuses();
  hideForm();
}

function formDataToObject(formEl) {
  const data = {};

  Array.from(new FormData(formEl).entries()).forEach(([key, value]) => {
    if (value instanceof File) return;
    data[key] = value;
  });

  return data;
}

function populateElectrolyteForm(el) {
  form.elements['electrolyte_type'].value = el.electrolyte_type || '';
  form.elements['solvent_system'].value = el.solvent_system || '';
  form.elements['salts'].value = el.salts || '';
  form.elements['concentration'].value = el.concentration || '';
  form.elements['additives'].value = el.additives || '';
  form.elements['notes'].value = el.notes || '';
  form.elements['status'].value = el.status || 'active';
}

function renderSavedElectrolyteFiles(entries) {
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
    deleteBtn.style.marginLeft = '0.5rem';
    deleteBtn.onclick = async () => {
      const fileName = entry.file_name || `Файл ${index + 1}`;

      if (!confirm(`Удалить файл "${fileName}"?`)) return;

      try {
        await deleteElectrolyteFile(entry.electrolyte_file_id);
        savedElectrolyteFiles = savedElectrolyteFiles.filter(
          (file) => file.electrolyte_file_id !== entry.electrolyte_file_id
        );
        renderSavedElectrolyteFiles(savedElectrolyteFiles);
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

function clearRecordStatuses() {
  showHeaderStatus('', false, { clearAfterMs: 0 });
  showFileStatus('', false, { clearAfterMs: 0 });
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

async function fetchElectrolytes() {
  const res = await fetch('/api/electrolytes');

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки списка электролитов');
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function createElectrolyte(data) {
  const res = await fetch('/api/electrolytes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Ошибка сохранения');
  }

  return res.json();
}

async function updateElectrolyte(id, data) {
  const res = await fetch(`/api/electrolytes/${id}`, {
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

async function fetchElectrolyteFiles(id) {
  const res = await fetch(`/api/electrolytes/${id}/files`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки файлов электролита');
  }

  return res.json();
}

async function uploadElectrolyteFiles(id, entries) {
  const res = await fetch(`/api/electrolytes/${id}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка сохранения файлов электролита');
  }

  return res.json();
}

async function deleteElectrolyteFile(fileId) {
  const res = await fetch(`/api/electrolytes/files/${fileId}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка удаления файла электролита');
  }
}

async function fetchElectrolyteDeleteCheck(id) {
  const res = await fetch(`/api/electrolytes/${id}/delete-check`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка проверки удаления электролита');
  }

  return res.json();
}

async function deleteElectrolyte(id) {
  const res = await fetch(`/api/electrolytes/${id}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка удаления');
  }
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
  const base = check.message || 'Нельзя удалить электролит: есть связанные записи.';
  const records = formatDependencyRecords(check.dependencies || []);

  return records
    ? `${base} Сначала уберите связи: ${records}.`
    : base;
}

function getElectrolytePrintReportUrl(id) {
  return `/workflow/electrolyte-print.html?electrolyte_id=${encodeURIComponent(id)}`;
}

function openElectrolytePrintReport(id) {
  if (!id) return;
  const url = getElectrolytePrintReportUrl(id);
  const reportWindow = window.open(url, '_blank');

  if (reportWindow) {
    reportWindow.opener = null;
    return;
  }

  window.location.href = url;
}

function renderElectrolytes(electrolytes) {
  electrolytesList.innerHTML = '';

  electrolytes.forEach(el => {
    const li = document.createElement('li');
    li.className = 'user-row';

    const titleLine = document.createElement('div');
    titleLine.className = 'record-list-title';
    titleLine.textContent = el.name;

    const metaLine = document.createElement('div');
    metaLine.className = 'record-list-meta';
    metaLine.textContent = [
      ELECTROLYTE_TYPE_LABELS[el.electrolyte_type] || el.electrolyte_type || '',
      ELECTROLYTE_STATUS_LABELS[el.status] || el.status || '',
      formatDate(el.created_at),
      el.created_by_name || ''
    ].filter(Boolean).join(' — ');

    const info = window.BADB_UI.createRecordOpenButton({
      className: 'user-info',
      ariaLabel: `Открыть электролит ${el.name}`,
      children: [titleLine, metaLine],
      onClick: async () => {
        await openElectrolyteRecord(el);
      }
    });

    const actions = document.createElement('div');
    actions.className = 'actions';

    const printBtn = window.BADB_UI.createIconButton({
      icon: '🖨️',
      title: 'Печать отчёта',
      ariaLabel: `Печать отчёта электролита ${el.name}`,
      onClick: () => {
        openElectrolytePrintReport(el.electrolyte_id);
      }
    });

    const duplicateBtn = window.BADB_UI.createIconButton({
      icon: '📑',
      title: 'Дублировать электролит',
      ariaLabel: `Дублировать электролит ${el.name}`,
      onClick: () => {
        duplicateElectrolyte(el);
      }
    });

    actions.appendChild(printBtn);
    actions.appendChild(duplicateBtn);

    li.appendChild(info);
    li.appendChild(actions);

    electrolytesList.appendChild(li);
  });
}

function confirmDiscardUnsavedChanges() {
  if (!hasUnsavedChanges()) return true;
  return confirm('Выйти без сохранения изменений?');
}

async function openElectrolyteRecord(el) {
  if (!confirmDiscardUnsavedChanges()) return;

  clearRecordStatuses();
  mode = 'edit';
  currentId = el.electrolyte_id;
  currentElectrolyte = el;

  setElectrolyteName(el.name);
  populateElectrolyteForm(el);

  if (el.created_by) {
    createdBySelect.value = el.created_by;
  }

  filesInput.value = '';
  savedElectrolyteFiles = [];
  renderSavedElectrolyteFiles(savedElectrolyteFiles);
  updateSaveFilesButtonVisibility();
  showForm();

  try {
    savedElectrolyteFiles = await fetchElectrolyteFiles(el.electrolyte_id);
    renderSavedElectrolyteFiles(savedElectrolyteFiles);
  } catch (err) {
    showStatus(err.message, true, { clearAfterMs: 9000 });
  } finally {
    markFormPristine();
    window.BADB_UI?.scrollToElement(stickyHeader || form);
  }
}

function duplicateElectrolyte(el) {
  if (!confirmDiscardUnsavedChanges()) return;

  clearRecordStatuses();
  mode = 'create';
  currentId = null;
  currentElectrolyte = null;
  initialFormState = null;

  const copyName = `${el.name} (копия)`;
  setElectrolyteName(copyName);

  populateElectrolyteForm(el);
  createdBySelect.value = '';
  filesInput.value = '';
  clearSavedElectrolyteFiles();
  updateSaveFilesButtonVisibility();
  showForm();
  window.BADB_UI?.scrollToElement(stickyHeader || form);
}

async function saveElectrolyteRecord(options = {}) {
  if (!validateRequiredFields(options.statusTarget || 'header')) return null;

  const data = formDataToObject(form);
  delete data.created_by;
  data.name = getElectrolyteNameValue();
  setElectrolyteName(data.name);

  const initialMode = mode;
  let savedElectrolyte = null;

  if (initialMode === 'create') {
    savedElectrolyte = await createElectrolyte(data);
    currentId = savedElectrolyte.electrolyte_id;
    mode = 'edit';
  } else if (initialMode === 'edit') {
    savedElectrolyte = await updateElectrolyte(currentId, data);
  }

  if (savedElectrolyte) {
    currentElectrolyte = {
      ...(currentElectrolyte || {}),
      ...savedElectrolyte,
      name: data.name
    };
  }

  return {
    savedElectrolyte,
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

  savedElectrolyteFiles = await uploadElectrolyteFiles(currentId, entries);
  renderSavedElectrolyteFiles(savedElectrolyteFiles);
  filesInput.value = '';
  updateSaveFilesButtonVisibility();
  markFormPristine();

  return selectedFiles;
}

async function deleteCurrentElectrolyte() {
  if (!currentId) {
    showStatus('Сначала откройте электролит', true, { clearAfterMs: 5000 });
    return;
  }

  try {
    const check = await fetchElectrolyteDeleteCheck(currentId);

    if (!check.can_delete) {
      showStatus(formatDeleteBlockedMessage(check), true, { clearAfterMs: 15000 });
      return;
    }

    if (hasUnsavedChanges() && !confirm('Есть несохранённые изменения. Удалить электролит без сохранения?')) {
      return;
    }

    const phrase = `DELETE ELECTROLYTE ${currentId}`;
    const confirmation = prompt(
      `Удаление электролита #${currentId} необратимо.\nВведите ${phrase}, чтобы подтвердить.`
    );

    if (confirmation !== phrase) {
      showStatus('Удаление отменено.', true, { clearAfterMs: 4000 });
      return;
    }

    await deleteElectrolyte(currentId);
    resetForm();
    await loadElectrolytes();
    showStatus('Электролит удалён', false, { clearAfterMs: 5000 });
  } catch (err) {
    showStatus(err.message, true, { clearAfterMs: 12000 });
  }
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
      const opt = document.createElement('option');
      opt.value = u.user_id;
      opt.textContent = u.name;
      createdBySelect.appendChild(opt);
    });
  } catch (err) {
    showPageStatus(err.message, true, { clearAfterMs: 9000 });
  }
}

createdBySelect.addEventListener('focus', loadUsers);

addInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;

  e.preventDefault();

  if (!form.hidden) return;

  const name = addInput.value.trim();
  if (!name) return;

  clearRecordStatuses();
  mode = 'create';
  currentId = null;
  currentElectrolyte = null;
  initialFormState = null;

  setElectrolyteName(name);

  showForm();

  addInput.value = '';
  clearSavedElectrolyteFiles();
  updateSaveFilesButtonVisibility();
  window.BADB_UI?.scrollToElement(stickyHeader || form);
});

function validateRequiredFields(statusTarget = 'header') {
  const missing = [];
  const name = getElectrolyteNameValue();

  nameInput.classList.remove('required-missing');
  typeSelect.classList.remove('required-missing');

  if (!name) {
    missing.push('Название');
    nameInput.classList.add('required-missing');
  }

  if (!typeSelect.value) {
    missing.push('Тип электролита');
    typeSelect.classList.add('required-missing');
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

saveBtn.addEventListener('click', async () => {
  if (!mode) return;

  try {
    const result = await saveElectrolyteRecord();
    if (!result) return;

    const selectedFiles = await uploadSelectedFiles();
    markFormPristine();
    await loadElectrolytes();

    if (result.initialMode === 'create') {
      showStatus(
        selectedFiles.length > 0
          ? 'Электролит и файлы сохранены'
          : 'Электролит сохранён'
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
      const result = await saveElectrolyteRecord({ statusTarget: 'files' });
      if (!result) return;
      await loadElectrolytes();
    }

    const selectedFiles = await uploadSelectedFiles();

    if (selectedFiles.length === 0) return;

    markFormPristine();
    showStatus('Файлы сохранены', false, { target: 'files' });
    await loadElectrolytes();
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

if (deleteElectrolyteBtn) {
  deleteElectrolyteBtn.addEventListener('click', deleteCurrentElectrolyte);
}

if (printElectrolyteBtn) {
  printElectrolyteBtn.addEventListener('click', () => {
    openElectrolytePrintReport(currentId);
  });
}

filesInput.addEventListener('change', updateSaveFilesButtonVisibility);

form.addEventListener('input', renderElectrolyteStickyHeader);
form.addEventListener('change', renderElectrolyteStickyHeader);

title.addEventListener('click', () => {
  nameInput.value = getElectrolyteNameValue();
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
  setElectrolyteName(val || title.textContent);
  renderElectrolyteStickyHeader();
});

async function loadElectrolytes() {
  if (!electrolytesList) return;

  try {
    const data = await fetchElectrolytes();
    renderElectrolytes(data);
  } catch (err) {
    console.error(err);
    showPageStatus(err.message || 'Ошибка загрузки списка электролитов', true, { clearAfterMs: 9000 });
  }
}

const electrolyteLogoutGuard = {
  hasUnsavedChanges,
  discardUnsavedChanges: resetForm,
  message: 'Есть несохранённые изменения электролита. Выйти без сохранения?'
};

window.BADB_PAGE_LOGOUT_GUARD = electrolyteLogoutGuard;
window.BADB_AUTH?.registerLogoutGuard?.(electrolyteLogoutGuard);

window.addEventListener('beforeunload', (event) => {
  if (!hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = '';
});

hideForm();
loadUsers();
loadElectrolytes();
