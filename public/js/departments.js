const departmentsList = document.getElementById('departmentsList');
const addDepartmentBtn = document.getElementById('addDepartmentBtn');
const statusBox = document.getElementById('departments-page-status');
const stickyHeader = document.getElementById('department_sticky_header');
const stickyTitle = document.getElementById('department_sticky_title');
const stickyMeta = document.getElementById('department_sticky_meta');
const stickyDirty = document.getElementById('department-global-dirty');
const stickyStatus = document.getElementById('department-sticky-status');
const departmentFieldset = document.getElementById('departmentFieldset');
const departmentForm = document.getElementById('departmentForm');
const departmentFormLegend = document.getElementById('departmentFormLegend');
const departmentName = document.getElementById('departmentName');
const departmentHeadUser = document.getElementById('departmentHeadUser');
const saveDepartmentBtn = document.getElementById('saveDepartmentBtn');
const exitDepartmentBtn = document.getElementById('exitDepartmentBtn');
const filterTextInput = document.getElementById('department-filter-text');
const filterHeadSelect = document.getElementById('department-filter-head');
const clearFiltersBtn = document.getElementById('clearDepartmentFiltersBtn');
const filterSummary = document.getElementById('department-filter-summary');

const NO_HEAD_FILTER_VALUE = '__no_head__';

let departments = [];
let users = [];
let mode = null;
let currentId = null;
let currentDepartment = null;
let savedFormSnapshot = null;
let formDirty = false;
let isAdmin = false;

function showStatusFallback(target, message, isError = false) {
  if (!target) return;
  target.textContent = message || '';
  target.style.color = isError ? '#b00020' : 'darkcyan';
}

function showPageStatus(message, isError = false, options = {}) {
  if (window.BADB_UI?.showStatus) {
    window.BADB_UI.showStatus(statusBox, message, {
      isError,
      clearAfterMs: options.clearAfterMs ?? (isError ? 9000 : 4500)
    });
    return;
  }

  showStatusFallback(statusBox, message, isError);
}

function showHeaderStatus(message, isError = false, options = {}) {
  if (window.BADB_UI?.showStatus) {
    window.BADB_UI.showStatus(stickyStatus, message, {
      isError,
      clearAfterMs: options.clearAfterMs ?? (isError ? 12000 : 4500)
    });
    return;
  }

  showStatusFallback(stickyStatus, message, isError);
}

function showStatus(message, isError = false, options = {}) {
  const target = options.target || (mode ? 'header' : 'page');
  if (target === 'header') {
    showHeaderStatus(message, isError, options);
    return;
  }

  showPageStatus(message, isError, options);
}

function clearRecordStatuses() {
  showHeaderStatus('', false, { clearAfterMs: 0 });
  showPageStatus('', false, { clearAfterMs: 0 });
}

async function readJsonResponse(res, fallbackError) {
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || fallbackError);
  }

  return data;
}

async function fetchDepartments() {
  const res = await fetch('/api/departments');
  return readJsonResponse(res, 'Ошибка загрузки отделов');
}

async function fetchUsers() {
  const res = await fetch('/api/users');
  return readJsonResponse(res, 'Ошибка загрузки пользователей');
}

async function createDepartment(payload) {
  const res = await fetch('/api/departments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return readJsonResponse(res, 'Ошибка сохранения отдела');
}

async function updateDepartment(id, payload) {
  const res = await fetch(`/api/departments/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return readJsonResponse(res, 'Ошибка обновления отдела');
}

function activeUsersForSelect(selectedId) {
  const selectedValue = selectedId == null ? '' : String(selectedId);

  return users.filter(user => {
    return user.active || String(user.user_id) === selectedValue;
  });
}

function headLabel(department) {
  if (!department?.head_user_id) return '— без руководителя —';
  return department.head_name || `Пользователь #${department.head_user_id}`;
}

function getSelectedOptionText(select) {
  return select?.selectedOptions?.[0]?.textContent?.trim() || '';
}

function populateHeadSelect(selectedId) {
  const selectedValue = selectedId == null ? '' : String(selectedId);

  departmentHeadUser.replaceChildren(new Option('— без руководителя —', ''));
  activeUsersForSelect(selectedId).forEach(user => {
    const label = user.active ? user.name : `${user.name} (неактивен)`;
    departmentHeadUser.add(new Option(label, String(user.user_id)));
  });

  departmentHeadUser.value = selectedValue;
}

function renderDepartmentFilterOptions() {
  if (!filterHeadSelect) return;

  const currentValue = filterHeadSelect.value;
  const userOptions = [...users]
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map(user => {
      const label = user.active ? user.name : `${user.name} (неактивен)`;
      return new Option(label, String(user.user_id));
    });

  filterHeadSelect.replaceChildren(
    new Option('Все руководители', ''),
    new Option('Без руководителя', NO_HEAD_FILTER_VALUE),
    ...userOptions
  );

  filterHeadSelect.value = Array.from(filterHeadSelect.options).some(option => option.value === currentValue)
    ? currentValue
    : '';
}

function getFormHeadLabel() {
  return getSelectedOptionText(departmentHeadUser) || '— без руководителя —';
}

function getDepartmentFormSnapshot() {
  return JSON.stringify({
    mode,
    id: currentId,
    name: departmentName.value,
    headUserId: departmentHeadUser.value || ''
  });
}

function setFormDirty(isDirty) {
  formDirty = Boolean(isDirty);
  window.BADB_UI?.setDirtyFlag(stickyDirty, formDirty);
}

function markFormClean() {
  savedFormSnapshot = getDepartmentFormSnapshot();
  setFormDirty(false);
}

function hasUnsavedChanges() {
  return !departmentFieldset.hidden && formDirty;
}

function confirmDiscardUnsavedChanges() {
  if (!hasUnsavedChanges()) return true;
  return confirm('Есть несохранённые изменения. Выйти без сохранения?');
}

function getDepartmentStickyTitle() {
  if (mode === 'create') return 'Новый отдел';
  return departmentName.value.trim() || currentDepartment?.name || 'Отдел';
}

function getDepartmentMetaText() {
  const parts = [];

  if (mode === 'edit' && currentId) {
    parts.push(`ID: ${currentId}`);
  } else {
    parts.push('новая запись');
  }

  parts.push(`руководитель: ${getFormHeadLabel()}`);

  return parts.join(' — ');
}

function setDepartmentFormEditable(canEdit) {
  departmentName.disabled = !canEdit;
  departmentHeadUser.disabled = !canEdit;
}

function updateDepartmentActionState() {
  addDepartmentBtn.hidden = !isAdmin;
  addDepartmentBtn.disabled = !isAdmin || !departmentFieldset.hidden;

  saveDepartmentBtn.disabled = !isAdmin;
  saveDepartmentBtn.title = isAdmin
    ? 'Сохранить изменения'
    : 'Недостаточно прав для сохранения';
}

function renderDepartmentStickyHeader() {
  if (departmentFieldset.hidden) {
    if (stickyHeader) stickyHeader.hidden = true;
    updateDepartmentActionState();
    return;
  }

  window.BADB_UI?.setStickyHeader({
    header: stickyHeader,
    titleEl: stickyTitle,
    metaEl: stickyMeta,
    dirtyEl: stickyDirty,
    title: getDepartmentStickyTitle(),
    meta: getDepartmentMetaText(),
    isDirty: hasUnsavedChanges(),
    hidden: false
  });

  saveDepartmentBtn.textContent = 'Сохранить';
  exitDepartmentBtn.textContent = 'Выйти';
  exitDepartmentBtn.title = 'Вернуться к списку, не выходя из аккаунта';
  updateDepartmentActionState();
}

function refreshDepartmentFormDirty() {
  setFormDirty(getDepartmentFormSnapshot() !== savedFormSnapshot);
  renderDepartmentStickyHeader();
}

function normalizeFilterText(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU');
}

function getDepartmentFilterState() {
  return {
    text: normalizeFilterText(filterTextInput?.value),
    head: filterHeadSelect?.value || ''
  };
}

function hasActiveDepartmentFilters(filters = getDepartmentFilterState()) {
  return Boolean(filters.text || filters.head);
}

function getDepartmentSearchText(department) {
  return normalizeFilterText([
    department.department_id,
    department.name,
    department.head_name,
    headLabel(department)
  ].filter(value => value !== null && value !== undefined && value !== '').join(' '));
}

function matchesDepartmentFilters(department, filters = getDepartmentFilterState()) {
  if (filters.head === NO_HEAD_FILTER_VALUE && department.head_user_id) return false;
  if (filters.head && filters.head !== NO_HEAD_FILTER_VALUE && String(department.head_user_id || '') !== filters.head) return false;
  if (filters.text && !getDepartmentSearchText(department).includes(filters.text)) return false;

  return true;
}

function getFilteredDepartments() {
  const filters = getDepartmentFilterState();
  return departments.filter(department => matchesDepartmentFilters(department, filters));
}

function updateDepartmentFilterSummary(filteredCount, totalCount) {
  const filters = getDepartmentFilterState();
  const hasFilters = hasActiveDepartmentFilters(filters);

  if (clearFiltersBtn) {
    clearFiltersBtn.disabled = !hasFilters;
  }

  if (!filterSummary) return;

  if (totalCount === 0) {
    filterSummary.textContent = 'Нет отделов';
    return;
  }

  filterSummary.textContent = hasFilters
    ? `Показано ${filteredCount} из ${totalCount}`
    : `Всего: ${totalCount}`;
}

function populateDepartmentForm(department) {
  departmentFormLegend.textContent = mode === 'create'
    ? 'Новый отдел'
    : 'Редактирование отдела';
  departmentName.value = department?.name || '';
  populateHeadSelect(department?.head_user_id ?? null);
  setDepartmentFormEditable(isAdmin);
}

function hideDepartmentForm() {
  departmentForm.reset();
  departmentFieldset.hidden = true;
  if (stickyHeader) stickyHeader.hidden = true;
  mode = null;
  currentId = null;
  currentDepartment = null;
  savedFormSnapshot = null;
  setFormDirty(false);
  setDepartmentFormEditable(false);
  clearRecordStatuses();
  updateDepartmentActionState();
  renderFilteredDepartments();
}

function showCreateDepartmentForm() {
  if (!isAdmin) {
    showStatus('Редактирование отделов доступно только администратору.', true, { target: 'page' });
    return false;
  }

  if (!confirmDiscardUnsavedChanges()) return false;

  clearRecordStatuses();
  mode = 'create';
  currentId = null;
  currentDepartment = null;
  populateDepartmentForm({ name: '', head_user_id: null });
  departmentFieldset.hidden = false;
  markFormClean();
  renderDepartmentStickyHeader();
  renderFilteredDepartments();
  window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
  departmentName.focus();
  return true;
}

async function openDepartmentRecord(department) {
  if (!department) return false;

  if (!departmentFieldset.hidden && mode === 'edit' && String(currentId) === String(department.department_id)) {
    window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
    return true;
  }

  if (!confirmDiscardUnsavedChanges()) return false;

  clearRecordStatuses();
  mode = 'edit';
  currentId = department.department_id;
  currentDepartment = department;
  populateDepartmentForm(department);
  departmentFieldset.hidden = false;
  renderDepartmentStickyHeader();
  renderFilteredDepartments();

  markFormClean();
  renderDepartmentStickyHeader();
  renderFilteredDepartments();
  window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
  if (isAdmin) {
    departmentName.focus();
  }

  return true;
}

function renderDepartments(departmentsToRender = departments) {
  departmentsList.innerHTML = '';

  if (departmentsToRender.length === 0) {
    const emptyRow = document.createElement('li');
    emptyRow.className = 'user-row department-empty-row';
    emptyRow.textContent = departments.length === 0
      ? 'Отделы пока не добавлены.'
      : hasActiveDepartmentFilters()
        ? 'Отделы по выбранным фильтрам не найдены.'
        : 'Отделы не найдены.';
    departmentsList.appendChild(emptyRow);
    return;
  }

  departmentsToRender.forEach(department => {
    const li = document.createElement('li');
    li.className = 'user-row';

    if (!departmentFieldset.hidden && String(currentId) === String(department.department_id)) {
      li.classList.add('is-open');
    }

    const titleLine = document.createElement('div');
    titleLine.className = 'record-list-title';
    titleLine.textContent = department.name || `Отдел #${department.department_id}`;

    const metaLine = document.createElement('div');
    metaLine.className = 'record-list-meta';
    metaLine.textContent = [
      `ID: ${department.department_id}`,
      `руководитель: ${headLabel(department)}`
    ].join(' — ');

    const info = window.BADB_UI.createRecordOpenButton({
      className: 'user-info',
      ariaLabel: 'Открыть запись',
      children: [titleLine, metaLine],
      onClick: async () => {
        await openDepartmentRecord(department);
      }
    });
    info.title = 'Открыть запись';

    li.appendChild(info);
    departmentsList.appendChild(li);
  });
}

function renderFilteredDepartments() {
  const filtered = getFilteredDepartments();
  renderDepartments(filtered);
  updateDepartmentFilterSummary(filtered.length, departments.length);
}

function buildDepartmentPayload() {
  return {
    name: departmentName.value.trim(),
    head_user_id: departmentHeadUser.value || null
  };
}

async function reloadDepartmentsAfterSave(savedDepartment, message) {
  currentId = savedDepartment.department_id;
  currentDepartment = savedDepartment;
  mode = 'edit';

  await loadData();

  const latestDepartment = departments.find(department => {
    return String(department.department_id) === String(currentId);
  }) || savedDepartment;

  currentDepartment = latestDepartment;
  populateDepartmentForm(latestDepartment);
  departmentFieldset.hidden = false;
  markFormClean();
  renderDepartmentStickyHeader();
  renderFilteredDepartments();
  showStatus(message);
}

async function saveDepartment() {
  if (!isAdmin) {
    showStatus('Недостаточно прав для сохранения', true);
    return;
  }

  if (!departmentForm.reportValidity()) return;

  const payload = buildDepartmentPayload();

  if (!payload.name) {
    showStatus('Название отдела обязательно', true);
    departmentName.focus();
    return;
  }

  saveDepartmentBtn.disabled = true;

  try {
    const savedDepartment = mode === 'create'
      ? await createDepartment(payload)
      : await updateDepartment(currentId, payload);
    const message = mode === 'create' ? 'Отдел создан' : 'Изменения сохранены';
    await reloadDepartmentsAfterSave(savedDepartment, message);
  } catch (err) {
    showStatus(err.message, true);
  } finally {
    renderDepartmentStickyHeader();
  }
}

async function loadData() {
  [departments, users] = await Promise.all([
    fetchDepartments(),
    fetchUsers()
  ]);

  renderDepartmentFilterOptions();
  renderFilteredDepartments();
}

async function initDepartmentsPage() {
  const currentUser = await window.BADB_AUTH?.isReady?.();
  isAdmin = currentUser?.role === 'admin';
  updateDepartmentActionState();

  if (!isAdmin) {
    showStatus('Редактирование отделов доступно только администратору.', false, {
      target: 'page',
      clearAfterMs: 9000
    });
  }

  addDepartmentBtn.addEventListener('click', showCreateDepartmentForm);

  departmentForm.addEventListener('input', refreshDepartmentFormDirty);
  departmentForm.addEventListener('change', refreshDepartmentFormDirty);
  departmentForm.addEventListener('submit', async event => {
    event.preventDefault();
    await saveDepartment();
  });

  filterTextInput?.addEventListener('input', renderFilteredDepartments);
  filterHeadSelect?.addEventListener('change', renderFilteredDepartments);

  clearFiltersBtn?.addEventListener('click', () => {
    if (filterTextInput) filterTextInput.value = '';
    if (filterHeadSelect) filterHeadSelect.value = '';
    renderFilteredDepartments();
    filterTextInput?.focus();
  });

  exitDepartmentBtn.addEventListener('click', () => {
    if (!confirmDiscardUnsavedChanges()) return;
    hideDepartmentForm();
  });

  const departmentLogoutGuard = {
    hasUnsavedChanges,
    discardUnsavedChanges: hideDepartmentForm,
    message: 'Есть несохранённые изменения отдела. Выйти без сохранения?'
  };

  window.BADB_PAGE_LOGOUT_GUARD = departmentLogoutGuard;
  window.BADB_AUTH?.registerLogoutGuard?.(departmentLogoutGuard);

  window.addEventListener('beforeunload', event => {
    if (!hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  window.addEventListener('badb:login', async event => {
    const user = event.detail?.user || window.BADB_AUTH?.getCurrentUser?.();
    isAdmin = user?.role === 'admin';
    updateDepartmentActionState();
    await loadData();
  });

  await loadData();
  renderDepartmentStickyHeader();
}

document.addEventListener('DOMContentLoaded', () => {
  initDepartmentsPage().catch(err => {
    console.error(err);
    showStatus(err.message || 'Ошибка загрузки страницы', true, { target: 'page' });
  });
});
