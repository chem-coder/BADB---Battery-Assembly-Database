const usersList = document.getElementById('usersList');
const showAddUserFormBtn = document.getElementById('showAddUserFormBtn');
const addUserFieldset = document.getElementById('addUserFieldset');
const addUserForm = document.getElementById('addUserForm');
const saveNewUserBtn = document.getElementById('saveNewUserBtn');
const exitNewUserBtn = document.getElementById('exitNewUserBtn');
const deleteUserBtn = document.getElementById('deleteUserBtn');
const dirtyUserCreate = document.getElementById('dirty-user-create');
const userFormLegend = document.getElementById('userFormLegend');
const stickyHeader = document.getElementById('user_sticky_header');
const stickyTitle = document.getElementById('user_sticky_title');
const stickyMeta = document.getElementById('user_sticky_meta');
const stickyDirty = document.getElementById('user-global-dirty');
const stickyStatus = document.getElementById('user-sticky-status');
const pageStatus = document.getElementById('users-page-status');
const filterTextInput = document.getElementById('user-filter-text');
const filterRoleSelect = document.getElementById('user-filter-role');
const filterDepartmentSelect = document.getElementById('user-filter-department');
const filterActiveSelect = document.getElementById('user-filter-active');
const clearFiltersBtn = document.getElementById('clearUserFiltersBtn');
const filterSummary = document.getElementById('user-filter-summary');
const userFilters = document.getElementById('user_filters');
const userProjectsSection = document.getElementById('user-projects-section');
const userProjectsBody = document.getElementById('userProjectsBody');

const newUserName = document.getElementById('newUserName');
const newUserLogin = document.getElementById('newUserLogin');
const newUserPasswordField = document.getElementById('newUserPasswordField');
const newUserPassword = document.getElementById('newUserPassword');
const newUserPasswordLabel = document.getElementById('newUserPasswordLabel');
const confirmUserPasswordField = document.getElementById('confirmUserPasswordField');
const confirmUserPassword = document.getElementById('confirmUserPassword');
const resetUserPasswordField = document.getElementById('resetUserPasswordField');
const showResetUserPasswordBtn = document.getElementById('showResetUserPasswordBtn');
const cancelUserPasswordResetField = document.getElementById('cancelUserPasswordResetField');
const cancelResetUserPasswordBtn = document.getElementById('cancelResetUserPasswordBtn');
const newUserRole = document.getElementById('newUserRole');
const newUserPosition = document.getElementById('newUserPosition');
const newUserDepartment = document.getElementById('newUserDepartment');
const newUserActive = document.getElementById('newUserActive');

const UNDECIDED_LABEL = 'Не определено';
const UNDECIDED_DEPARTMENT_VALUE = '__undecided__';
const ROLE_LABELS = {
  employee: 'Сотрудник',
  lead: 'Руководитель',
  admin: 'Администратор'
};
const PROJECT_STATUS_LABELS = {
  active: 'активный',
  paused: 'приостановлен',
  completed: 'завершён',
  archived: 'архивирован'
};
const PROJECT_ACCESS_LABELS = {
  view: 'просмотр',
  edit: 'редактирование',
  admin: 'администратор проекта'
};

let currentUsers = [];
let currentDepartments = [];
let formMode = 'create';
let currentEditUserId = null;
let currentOpenedUser = null;
let createFormDirty = false;
let passwordResetVisible = false;
let savedUserFormSnapshot = '';

showAddUserFormBtn.hidden = true;

// -------- API helpers --------

async function readJsonResponse(res, fallbackError) {
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || fallbackError);
  }

  return data;
}

async function fetchUsers() {
  const res = await fetch('/api/users');
  return readJsonResponse(res, 'Ошибка загрузки пользователей');
}

async function fetchDepartments() {
  const res = await fetch('/api/departments');
  return readJsonResponse(res, 'Ошибка загрузки отделов');
}

async function fetchUserProjects(id) {
  const res = await fetch(`/api/users/${encodeURIComponent(id)}/projects`);
  return readJsonResponse(res, 'Ошибка загрузки проектов пользователя');
}

async function createUser(payload) {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Ошибка сохранения');
  }

  return res.json();
}

async function updateUser(id, data) {
  const res = await fetch(`/api/users/${id}`, {
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

async function deleteUser(id) {
  const res = await fetch(`/api/users/${id}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Ошибка удаления');
  }
}

function showStatus(msg, isError = false) {
  const target = addUserFieldset.hidden ? pageStatus : stickyStatus;

  if (window.BADB_UI?.showStatus && target) {
    window.BADB_UI.showStatus(target, msg, { isError });
    return;
  }

  if (!target) return;

  target.textContent = msg;
  target.style.color = isError ? '#b00020' : '#2e7d32';
  setTimeout(() => {
    target.textContent = '';
  }, 2500);
}

function clearUserStatuses() {
  [stickyStatus, pageStatus].forEach((target) => {
    if (!target) return;
    target.textContent = '';
    target.classList.remove('is-error', 'is-success', 'is-saved', 'is-saving');
  });
}

function getCurrentAuthUser() {
  return window.BADB_AUTH?.getCurrentUser?.() || null;
}

function isCurrentUserAdmin() {
  return getCurrentAuthUser()?.role === 'admin';
}

function isCurrentAuthUser(user) {
  const currentUser = getCurrentAuthUser();
  return Boolean(currentUser?.userId && String(currentUser.userId) === String(user?.user_id));
}

function canManageUser(user) {
  return isCurrentUserAdmin() || isCurrentAuthUser(user);
}

function canViewUserProjects(user) {
  return Boolean(user?.user_id && (isCurrentUserAdmin() || isCurrentAuthUser(user)));
}

function canDeleteUser(user) {
  return Boolean(user?.user_id) && canManageUser(user);
}

function isViewingOwnUserRecord() {
  return formMode === 'edit' && Boolean(currentOpenedUser?.user_id) && isCurrentAuthUser(currentOpenedUser);
}

function renderAddUserButtonAccess() {
  showAddUserFormBtn.hidden = !isCurrentUserAdmin() || isViewingOwnUserRecord();
}

function renderUserDirectoryVisibility() {
  const hideDirectory = isViewingOwnUserRecord();

  if (userFilters) {
    userFilters.hidden = hideDirectory;
  }

  if (usersList) {
    usersList.hidden = hideDirectory;
  }

  renderAddUserButtonAccess();
}

function getSelectedOptionText(select) {
  return select?.selectedOptions?.[0]?.textContent?.trim() || '';
}

function getUserDepartmentLabel(user) {
  if (!user) return getSelectedOptionText(newUserDepartment) || UNDECIDED_LABEL;
  return user.department_name || UNDECIDED_LABEL;
}

function getCurrentFormUserForPermissions() {
  if (formMode !== 'edit') return null;
  return currentOpenedUser || currentUsers.find(user => String(user.user_id) === String(currentEditUserId)) || null;
}

function canSaveCurrentUserForm() {
  if (formMode === 'create') return isCurrentUserAdmin();
  const user = getCurrentFormUserForPermissions();
  return Boolean(user && canManageUser(user));
}

function setUserFormEditable(canEdit) {
  [
    newUserName,
    newUserLogin,
    newUserPassword,
    confirmUserPassword,
    newUserPosition,
    newUserDepartment,
    newUserActive
  ].forEach((field) => {
    field.disabled = !canEdit;
  });

  newUserRole.disabled = !canEdit || (formMode === 'edit' && !isCurrentUserAdmin());
  showResetUserPasswordBtn.disabled = !canEdit;
  cancelResetUserPasswordBtn.disabled = !canEdit;

  if (!canEdit && formMode === 'edit') {
    passwordResetVisible = false;
    newUserPasswordField.hidden = true;
    confirmUserPasswordField.hidden = true;
    resetUserPasswordField.hidden = true;
    cancelUserPasswordResetField.hidden = true;
  }
}

function updateUserActionState() {
  const canSave = canSaveCurrentUserForm();
  const canDelete = formMode === 'edit' && canDeleteUser(getCurrentFormUserForPermissions());

  saveNewUserBtn.disabled = !canSave;
  saveNewUserBtn.title = canSave
    ? 'Сохранить пользователя'
    : 'Недостаточно прав для сохранения';

  deleteUserBtn.hidden = !canDelete;
  deleteUserBtn.disabled = !canDelete;
}

function renderUserStickyHeader() {
  if (addUserFieldset.hidden) {
    if (stickyHeader) stickyHeader.hidden = true;
    return;
  }

  const name = newUserName.value.trim();
  const login = newUserLogin.value.trim();
  const title = formMode === 'create'
    ? 'Новый пользователь'
    : [name || UNDECIDED_LABEL, login ? `(${login})` : ''].filter(Boolean).join(' ');
  const meta = [
    login ? `логин: ${login}` : '',
    `роль: ${formatRole(newUserRole.value)}`,
    `отдел: ${getSelectedOptionText(newUserDepartment) || getUserDepartmentLabel(currentOpenedUser)}`,
    `должность: ${newUserPosition.value || UNDECIDED_LABEL}`,
    `статус: ${newUserActive.value === 'false' ? 'неактивен' : 'активен'}`
  ].filter(Boolean).join(' — ');

  window.BADB_UI?.setStickyHeader({
    header: stickyHeader,
    titleEl: stickyTitle,
    metaEl: stickyMeta,
    dirtyEl: stickyDirty,
    title,
    meta,
    isDirty: createFormDirty,
    hidden: false
  });

  updateUserActionState();
}

// -------- User form --------

function setCreateFormDirty(isDirty) {
  createFormDirty = Boolean(isDirty);
  dirtyUserCreate.style.display = createFormDirty ? 'inline' : 'none';
  window.BADB_UI?.setDirtyFlag(stickyDirty, createFormDirty);
}

function getUserFormSnapshot() {
  return JSON.stringify({
    mode: formMode,
    userId: currentEditUserId,
    name: newUserName.value,
    login: newUserLogin.value,
    role: newUserRole.value,
    position: newUserPosition.value,
    departmentId: newUserDepartment.value,
    active: newUserActive.value,
    passwordResetVisible,
    password: passwordResetVisible || formMode === 'create' ? newUserPassword.value : '',
    confirmPassword: passwordResetVisible ? confirmUserPassword.value : ''
  });
}

function markUserFormClean() {
  savedUserFormSnapshot = getUserFormSnapshot();
  setCreateFormDirty(false);
}

function refreshUserFormDirty() {
  setCreateFormDirty(getUserFormSnapshot() !== savedUserFormSnapshot);
  renderUserStickyHeader();
}

function hasUnsavedCreateUserChanges() {
  return !addUserFieldset.hidden && createFormDirty;
}

function confirmDiscardCreateUserChanges() {
  if (!hasUnsavedCreateUserChanges()) return true;
  return confirm('Есть несохранённые изменения. Выйти без сохранения?');
}

function resetCreateUserForm() {
  addUserForm.reset();
  newUserActive.value = 'true';
  passwordResetVisible = false;
  configurePasswordFields();
  setUserFormEditable(true);
  markUserFormClean();
  renderUserStickyHeader();
}

function hideCreateUserForm() {
  resetCreateUserForm();
  addUserFieldset.hidden = true;
  hideUserProjectsSection();
  if (stickyHeader) stickyHeader.hidden = true;
  showAddUserFormBtn.disabled = false;
  newUserRole.disabled = false;
  formMode = 'create';
  currentEditUserId = null;
  currentOpenedUser = null;
  clearUserStatuses();
  renderUserDirectoryVisibility();
  renderFilteredUsers();
}

function showCreateUserForm() {
  if (!confirmDiscardCreateUserChanges()) return false;
  clearUserStatuses();
  formMode = 'create';
  currentEditUserId = null;
  currentOpenedUser = null;
  hideUserProjectsSection();
  renderUserDirectoryVisibility();
  renderCreateUserSelects();
  userFormLegend.textContent = 'Новый пользователь';
  resetCreateUserForm();
  addUserFieldset.hidden = false;
  showAddUserFormBtn.disabled = true;
  setUserFormEditable(true);
  markUserFormClean();
  renderUserStickyHeader();
  renderUserDirectoryVisibility();
  window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
  newUserName.focus();
  return true;
}

function showEditUserForm(user, options = {}) {
  if (!user) return false;
  const {
    skipConfirm = false,
    scroll = true,
    focus = true,
    force = false
  } = options;

  if (!force && !addUserFieldset.hidden && formMode === 'edit' && String(currentEditUserId) === String(user.user_id)) {
    if (scroll) {
      window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
    }
    return true;
  }

  if (!skipConfirm && !confirmDiscardCreateUserChanges()) return false;

  clearUserStatuses();
  formMode = 'edit';
  currentEditUserId = user.user_id;
  currentOpenedUser = user;
  hideUserProjectsSection();
  renderCreateUserSelects();
  resetCreateUserForm();

  userFormLegend.textContent = 'Редактирование пользователя';
  configurePasswordFields();

  newUserName.value = user.name || '';
  newUserLogin.value = user.login || '';
  newUserRole.value = user.role || '';
  newUserPosition.value = user.position || UNDECIDED_LABEL;
  newUserDepartment.value = user.department_id == null
    ? UNDECIDED_DEPARTMENT_VALUE
    : String(user.department_id);
  newUserActive.value = String(Boolean(user.active));
  setUserFormEditable(canManageUser(user));

  addUserFieldset.hidden = false;
  showAddUserFormBtn.disabled = true;
  markUserFormClean();
  renderUserStickyHeader();
  renderUserDirectoryVisibility();
  loadOpenedUserProjects(user.user_id);
  renderFilteredUsers();
  if (scroll) {
    window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
  }

  if (focus && !newUserName.disabled) {
    newUserName.focus();
  }

  return true;
}

function configurePasswordFields() {
  if (formMode === 'create') {
    newUserPasswordField.hidden = false;
    confirmUserPasswordField.hidden = true;
    resetUserPasswordField.hidden = true;
    cancelUserPasswordResetField.hidden = true;
    newUserPasswordLabel.textContent = 'Пароль';
    newUserPassword.placeholder = '';
    newUserPassword.required = true;
    confirmUserPassword.required = false;
    confirmUserPassword.value = '';
    return;
  }

  newUserPasswordLabel.textContent = 'Новый пароль';
  newUserPassword.placeholder = 'Минимум 6 символов';
  newUserPasswordField.hidden = !passwordResetVisible;
  confirmUserPasswordField.hidden = !passwordResetVisible;
  resetUserPasswordField.hidden = passwordResetVisible;
  cancelUserPasswordResetField.hidden = !passwordResetVisible;
  newUserPassword.required = passwordResetVisible;
  confirmUserPassword.required = passwordResetVisible;

  if (!passwordResetVisible) {
    newUserPassword.value = '';
    confirmUserPassword.value = '';
  }
}

function validatePasswordReset() {
  if (formMode !== 'edit' || !passwordResetVisible) return true;

  if (!newUserPassword.value || newUserPassword.value.length < 6) {
    showStatus('Новый пароль должен быть не короче 6 символов', true);
    newUserPassword.focus();
    return false;
  }

  if (newUserPassword.value !== confirmUserPassword.value) {
    showStatus('Пароли не совпадают', true);
    confirmUserPassword.focus();
    return false;
  }

  return true;
}

function renderCreateUserSelects() {
  const positions = Array.from(new Set(
    currentUsers
      .map(user => (user.position || '').trim())
      .filter(Boolean)
      .filter(position => position !== UNDECIDED_LABEL)
  )).sort((a, b) => a.localeCompare(b));

  newUserPosition.replaceChildren(
    new Option('Выберите должность', ''),
    new Option(UNDECIDED_LABEL, UNDECIDED_LABEL),
    ...positions.map(position => new Option(position, position))
  );

  newUserDepartment.replaceChildren(
    new Option('Выберите отдел', ''),
    new Option(UNDECIDED_LABEL, UNDECIDED_DEPARTMENT_VALUE),
    ...currentDepartments.map(department => new Option(department.name, String(department.department_id)))
  );
}

function buildUserPayload() {
  const departmentValue = newUserDepartment.value;
  const password = newUserPassword.value || '';
  const payload = {
    name: newUserName.value.trim(),
    login: newUserLogin.value.trim(),
    active: newUserActive.value === 'true',
    role: newUserRole.value,
    position: newUserPosition.value.trim(),
    department_id: departmentValue === UNDECIDED_DEPARTMENT_VALUE ? null : Number(departmentValue)
  };

  if (formMode === 'create' || passwordResetVisible) {
    payload.password = password;
  }

  if (formMode === 'edit' && passwordResetVisible) {
    payload.reset_password = true;
  }

  return payload;
}

// -------- Rendering --------

function formatRole(role) {
  return ROLE_LABELS[role] || role || UNDECIDED_LABEL;
}

function formatUserStatus(user) {
  return user?.active ? 'активен' : 'неактивен';
}

function formatProjectStatus(status) {
  return PROJECT_STATUS_LABELS[status] || status || UNDECIDED_LABEL;
}

function formatProjectAccess(accessLevel) {
  return PROJECT_ACCESS_LABELS[accessLevel] || accessLevel || 'просмотр';
}

function formatDateOnly(value) {
  if (!value) return '';

  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}.${match[2]}.${match[1]}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text;

  return date.toLocaleDateString('ru-RU');
}

function formatProjectDates(project) {
  const start = formatDateOnly(project.start_date);
  const due = formatDateOnly(project.due_date);

  if (start && due) return `${start} — ${due}`;
  return start || due || '—';
}

function appendUserProjectCell(row, text, className = '') {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  cell.textContent = text || '—';
  row.appendChild(cell);
  return cell;
}

function renderUserProjectsMessage(message, isError = false) {
  if (!userProjectsSection || !userProjectsBody) return;

  userProjectsSection.hidden = false;
  userProjectsBody.innerHTML = '';

  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = 6;
  cell.className = isError ? 'user-project-empty is-error' : 'user-project-empty';
  cell.textContent = message;
  row.appendChild(cell);
  userProjectsBody.appendChild(row);
}

function hideUserProjectsSection() {
  if (!userProjectsSection || !userProjectsBody) return;

  userProjectsBody.innerHTML = '';
  userProjectsSection.hidden = true;
}

function renderUserProjects(projects) {
  if (!userProjectsSection || !userProjectsBody) return;

  const rows = Array.isArray(projects) ? projects : [];
  userProjectsSection.hidden = false;
  userProjectsBody.innerHTML = '';

  if (rows.length === 0) {
    renderUserProjectsMessage('Пользователь пока не добавлен в команду ни одного проекта.');
    return;
  }

  rows.forEach((project) => {
    const row = document.createElement('tr');
    appendUserProjectCell(row, project.project_name || `Проект #${project.project_id}`, 'user-project-name');
    appendUserProjectCell(row, formatProjectStatus(project.status));
    appendUserProjectCell(row, project.role_in_team || '—');
    appendUserProjectCell(row, formatProjectAccess(project.access_level));
    appendUserProjectCell(row, project.lead_name || '—');
    appendUserProjectCell(row, formatProjectDates(project), 'user-project-muted');
    userProjectsBody.appendChild(row);
  });
}

async function loadOpenedUserProjects(userId) {
  const openedUser = currentOpenedUser;

  if (!openedUser || String(openedUser.user_id) !== String(userId) || !canViewUserProjects(openedUser)) {
    hideUserProjectsSection();
    return;
  }

  renderUserProjectsMessage('Загрузка проектов...');

  try {
    const projects = await fetchUserProjects(userId);

    if (formMode !== 'edit' || String(currentEditUserId) !== String(userId)) return;
    renderUserProjects(projects);
  } catch (err) {
    if (formMode !== 'edit' || String(currentEditUserId) !== String(userId)) return;
    renderUserProjectsMessage(err.message || 'Ошибка загрузки проектов пользователя', true);
  }
}

function normalizeFilterText(value) {
  return String(value || '').trim().toLocaleLowerCase('ru-RU');
}

function renderUserFilterOptions() {
  if (!filterDepartmentSelect) return;

  const currentValue = filterDepartmentSelect.value;
  filterDepartmentSelect.replaceChildren(
    new Option('Все отделы', ''),
    new Option(UNDECIDED_LABEL, UNDECIDED_DEPARTMENT_VALUE),
    ...currentDepartments.map(department => new Option(department.name, String(department.department_id)))
  );

  filterDepartmentSelect.value = [...filterDepartmentSelect.options].some(
    option => option.value === currentValue
  )
    ? currentValue
    : '';
}

function getUserFilterState() {
  return {
    text: normalizeFilterText(filterTextInput?.value),
    role: filterRoleSelect?.value || '',
    department: filterDepartmentSelect?.value || '',
    active: filterActiveSelect?.value || ''
  };
}

function hasActiveUserFilters(filters = getUserFilterState()) {
  return Boolean(filters.text || filters.role || filters.department || filters.active);
}

function getUserDepartmentFilterValue(user) {
  return user.department_id == null
    ? UNDECIDED_DEPARTMENT_VALUE
    : String(user.department_id);
}

function getUserSearchText(user) {
  return normalizeFilterText([
    user.name,
    user.login,
    user.department_name,
    user.role,
    formatRole(user.role),
    user.position
  ].filter(value => value !== null && value !== undefined && value !== '').join(' '));
}

function matchesUserFilters(user, filters = getUserFilterState()) {
  if (filters.role && user.role !== filters.role) return false;
  if (filters.department && getUserDepartmentFilterValue(user) !== filters.department) return false;
  if (filters.active && String(Boolean(user.active)) !== filters.active) return false;
  if (filters.text && !getUserSearchText(user).includes(filters.text)) return false;

  return true;
}

function getFilteredUsers() {
  const filters = getUserFilterState();
  return currentUsers.filter(user => matchesUserFilters(user, filters));
}

function updateUserFilterSummary(filteredCount, totalCount) {
  const filters = getUserFilterState();
  const hasFilters = hasActiveUserFilters(filters);

  if (clearFiltersBtn) {
    clearFiltersBtn.disabled = !hasFilters;
  }

  if (!filterSummary) return;

  if (totalCount === 0) {
    filterSummary.textContent = 'Нет пользователей';
    return;
  }

  filterSummary.textContent = hasFilters
    ? `Показано ${filteredCount} из ${totalCount}`
    : `Всего: ${totalCount}`;
}

function renderUsers(users) {
  usersList.innerHTML = '';

  if (users.length === 0) {
    const emptyRow = document.createElement('li');
    emptyRow.className = 'user-row user-empty-row';
    emptyRow.textContent = currentUsers.length === 0
      ? 'Пользователи пока не добавлены.'
      : hasActiveUserFilters()
        ? 'Пользователи по выбранным фильтрам не найдены.'
        : 'Пользователи не найдены.';
    usersList.appendChild(emptyRow);
    return;
  }

  [...users]
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(user => {
      const li = document.createElement('li');
      li.className = 'user-row';
      if (!addUserFieldset.hidden && String(currentEditUserId) === String(user.user_id)) {
        li.classList.add('is-open');
      }

      const titleLine = document.createElement('div');
      titleLine.className = 'record-list-title';
      titleLine.textContent = `${user.name || UNDECIDED_LABEL} / ${user.login || UNDECIDED_LABEL}`;

      const statusSpan = document.createElement('span');
      statusSpan.className = 'status' + (user.active ? '' : ' inactive');
      statusSpan.textContent = formatUserStatus(user);

      titleLine.appendChild(statusSpan);

      const metaLine = document.createElement('div');
      metaLine.className = 'record-list-meta';
      metaLine.textContent = [
        `роль: ${formatRole(user.role)}`,
        `должность: ${user.position || UNDECIDED_LABEL}`,
        `отдел: ${user.department_name || UNDECIDED_LABEL}`
      ].join(' — ');

      const info = window.BADB_UI.createRecordOpenButton({
        className: 'user-info',
        ariaLabel: `Открыть пользователя ${user.name || user.login || user.user_id}`,
        children: [titleLine, metaLine],
        onClick: () => {
          enterEditMode(li, user);
        }
      });
      info.title = `Открыть пользователя ${user.name || user.login || user.user_id}`;

      li.appendChild(info);

      usersList.appendChild(li);
    });
}

function enterEditMode(_li, user) {
  showEditUserForm(user);
}

function renderFilteredUsers() {
  const filters = getUserFilterState();
  const filtered = getFilteredUsers();

  renderUsers(filtered);
  updateUserFilterSummary(filtered.length, currentUsers.length);
}

function findCurrentUserRecord(id) {
  return currentUsers.find(user => String(user.user_id) === String(id)) || null;
}

async function reloadUsersAndReopen(savedUser, message) {
  const savedId = savedUser?.user_id || currentEditUserId;

  await loadUsers();

  const latestUser = findCurrentUserRecord(savedId);
  if (!latestUser) {
    hideCreateUserForm();
    showStatus(message);
    return;
  }

  showEditUserForm(latestUser, {
    skipConfirm: true,
    scroll: false,
    focus: false,
    force: true
  });
  renderFilteredUsers();
  showStatus(message);
}

async function handleDeleteCurrentUser() {
  const user = getCurrentFormUserForPermissions();

  if (!canDeleteUser(user)) return;

  const label = user.name || user.login || `#${user.user_id}`;
  if (!confirm(`Удалить пользователя ${label}?`)) return;

  deleteUserBtn.disabled = true;

  try {
    await deleteUser(user.user_id);
    hideCreateUserForm();
    await loadUsers();
    showStatus('Пользователь удалён');
  } catch (err) {
    showStatus(err.message, true);
  } finally {
    renderUserStickyHeader();
  }
}

// -------- Events --------

showAddUserFormBtn.addEventListener('click', showCreateUserForm);

addUserForm.addEventListener('input', refreshUserFormDirty);
addUserForm.addEventListener('change', refreshUserFormDirty);

showResetUserPasswordBtn.addEventListener('click', () => {
  passwordResetVisible = true;
  configurePasswordFields();
  refreshUserFormDirty();
  newUserPassword.focus();
});

cancelResetUserPasswordBtn.addEventListener('click', () => {
  passwordResetVisible = false;
  configurePasswordFields();
  refreshUserFormDirty();
});

addUserForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!canSaveCurrentUserForm()) {
    showStatus('Недостаточно прав для сохранения', true);
    return;
  }

  if (!addUserForm.reportValidity()) return;
  if (!validatePasswordReset()) return;

  saveNewUserBtn.disabled = true;

  try {
    let savedUser;
    let message;

    if (formMode === 'create') {
      savedUser = await createUser(buildUserPayload());
      message = 'Пользователь создан';
    } else {
      savedUser = await updateUser(currentEditUserId, buildUserPayload());
      message = 'Изменения сохранены';
    }

    await reloadUsersAndReopen(savedUser, message);
  } catch (err) {
    showStatus(err.message, true);
  } finally {
    renderUserStickyHeader();
  }
});

exitNewUserBtn.addEventListener('click', () => {
  if (!confirmDiscardCreateUserChanges()) return;
  hideCreateUserForm();
});

deleteUserBtn.addEventListener('click', handleDeleteCurrentUser);

if (filterTextInput) {
  filterTextInput.addEventListener('input', renderFilteredUsers);
}

if (filterRoleSelect) {
  filterRoleSelect.addEventListener('change', renderFilteredUsers);
}

if (filterDepartmentSelect) {
  filterDepartmentSelect.addEventListener('change', renderFilteredUsers);
}

if (filterActiveSelect) {
  filterActiveSelect.addEventListener('change', renderFilteredUsers);
}

if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener('click', () => {
    if (filterTextInput) filterTextInput.value = '';
    if (filterRoleSelect) filterRoleSelect.value = '';
    if (filterDepartmentSelect) filterDepartmentSelect.value = '';
    if (filterActiveSelect) filterActiveSelect.value = '';
    renderFilteredUsers();
    filterTextInput?.focus();
  });
}

window.addEventListener('beforeunload', (e) => {
  if (!hasUnsavedCreateUserChanges()) return;
  e.preventDefault();
  e.returnValue = '';
});

const usersLogoutGuard = {
  hasUnsavedChanges: hasUnsavedCreateUserChanges,
  discardUnsavedChanges: hideCreateUserForm
};

window.BADB_PAGE_LOGOUT_GUARD = usersLogoutGuard;
window.BADB_AUTH?.registerLogoutGuard?.(usersLogoutGuard);

// -------- Init --------

async function loadUsers() {
  try {
    const [users, departments] = await Promise.all([
      fetchUsers(),
      fetchDepartments()
    ]);

    currentUsers = Array.isArray(users) ? users : [];
    currentDepartments = Array.isArray(departments) ? departments : [];
    renderUserDirectoryVisibility();
    renderUserFilterOptions();
    renderCreateUserSelects();
    if (!addUserFieldset.hidden && formMode === 'edit') {
      currentOpenedUser = findCurrentUserRecord(currentEditUserId) || currentOpenedUser;
      renderUserStickyHeader();
      renderUserDirectoryVisibility();
      loadOpenedUserProjects(currentEditUserId);
    }
    renderFilteredUsers();
  } catch (err) {
    showStatus(err.message || 'Ошибка загрузки пользователей', true);
  }
}

window.addEventListener('badb:login', () => {
  loadUsers();
});

loadUsers();
