const addInput = document.getElementById('project-name');
const nameInput = document.getElementById('project-name-input');
const form = document.forms['project-form'];
const title = form.querySelector('h2');
const saveBtn = document.getElementById('saveBtn');
const exitBtn = document.getElementById('exitBtn');
const printProjectBtn = document.getElementById('printProjectBtn');
const deleteProjectBtn = document.getElementById('deleteProjectBtn');
const createdBySelect = document.getElementById('project-created-by');

const projectsList = document.getElementById('projectsList');
const statusSelect = form.querySelector('select[name="status"]');
const leadSelect = document.getElementById('project-lead-id');
const confidentialitySelect = document.getElementById('project-confidentiality-level');
const departmentBlock = document.getElementById('project-department-block');
const departmentSelect = document.getElementById('project-department-id');
const projectAccessSection = document.getElementById('project-access-section');
const projectUserAccessBody = document.getElementById('projectUserAccessBody');
const projectAccessUserSelect = document.getElementById('project-access-user-id');
const projectUserAccessLevel = document.getElementById('project-user-access-level');
const grantUserAccessBtn = document.getElementById('grantUserAccessBtn');
const projectParticipantsSection = document.getElementById('project-participants-section');
const projectParticipantUserSelect = document.getElementById('project-participant-user-id');
const projectParticipantRoleInput = document.getElementById('project-participant-role');
const projectParticipantAccessLevel = document.getElementById('project-participant-access-level');
const addProjectParticipantBtn = document.getElementById('addProjectParticipantBtn');
const projectParticipantsBody = document.getElementById('projectParticipantsBody');
const stickyHeader = document.getElementById('project_sticky_header');
const stickyTitle = document.getElementById('project_sticky_title');
const stickyMeta = document.getElementById('project_sticky_meta');
const stickyDirty = document.getElementById('project-global-dirty');
const stickyStatus = document.getElementById('project-sticky-status');
const filterTextInput = document.getElementById('project-filter-text');
const filterStatusSelect = document.getElementById('project-filter-status');
const filterVisibilitySelect = document.getElementById('project-filter-visibility');
const filterDepartmentSelect = document.getElementById('project-filter-department');
const filterLeadSelect = document.getElementById('project-filter-lead');
const clearFiltersBtn = document.getElementById('clearProjectFiltersBtn');
const filterSummary = document.getElementById('project-filter-summary');

let mode = null; // 'create' | 'edit'
let currentId = null;
let currentProject = null;
let currentProjectLeadId = null;
let initialFormState = null;
let currentUsers = [];
let currentDepartments = [];
let currentAccessGrants = [];
let currentUserAccess = [];
let currentParticipants = [];
let allProjects = [];

const PROJECT_STATUS_LABELS = {
  active: 'активный',
  paused: 'приостановлен',
  completed: 'завершён',
  archived: 'архивирован'
};

const PROJECT_VISIBILITY_LABELS = {
  public: 'открытый',
  department: 'секретный',
  confidential: 'секретный'
};

function normalizeProjectVisibility(value) {
  return value === 'public' ? 'public' : 'confidential';
}

function getProjectNameValue() {
  const source = nameInput.hidden ? title.textContent : nameInput.value;
  return (source || '').trim();
}

function setProjectName(name) {
  const value = (name || '').trim();
  title.textContent = value;
  nameInput.value = value;
  title.hidden = false;
  nameInput.hidden = true;
}

function showForm() {
  form.hidden = false;
  addInput.disabled = true;
  renderProjectStickyHeader();
}

function hideForm() {
  form.hidden = true;
  addInput.disabled = false;
  renderProjectStickyHeader();
}

function captureFormState() {
  return JSON.stringify({
    mode,
    title: title.textContent,
    nameInput: nameInput.value,
    lead_id: form.elements['lead_id'].value,
    start_date: form.elements['start_date'].value,
    due_date: form.elements['due_date'].value,
    description: form.elements['description'].value,
    status: form.elements['status'].value,
    confidentiality_level: form.elements['confidentiality_level'].value,
    department_id: form.elements['department_id']?.value || ''
  });
}

function markFormPristine() {
  initialFormState = captureFormState();
  renderProjectStickyHeader();
}

function hasUnsavedChanges() {
  if (!mode) return false;
  return captureFormState() !== initialFormState;
}

function resetForm() {
  form.reset();
  updateDepartmentVisibility();
  resetProjectAccessSection();
  setProjectName('');
  mode = null;
  currentId = null;
  currentProject = null;
  currentProjectLeadId = null;
  initialFormState = null;
  clearRecordStatuses();
  resetProjectParticipantsSection();
  hideForm();
}

function formDataToObject(form) {
  return Object.fromEntries(new FormData(form));
}

function normalizeProjectPayload(data) {
  const next = { ...data };
  next.confidentiality_level = normalizeProjectVisibility(next.confidentiality_level || 'public');
  next.department_id = null;

  return next;
}

function statusLabel(status) {
  return PROJECT_STATUS_LABELS[status] || status || '—';
}

function confidentialityLabel(level) {
  return PROJECT_VISIBILITY_LABELS[level] || level || '—';
}

function formatDate(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('ru-RU');
}

function normalizeFilterText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
}

function getProjectFilterState() {
  return {
    text: normalizeFilterText(filterTextInput?.value),
    status: filterStatusSelect?.value || '',
    visibility: filterVisibilitySelect?.value || '',
    department: filterDepartmentSelect?.value || '',
    lead: filterLeadSelect?.value || ''
  };
}

function hasActiveProjectFilters(filters = getProjectFilterState()) {
  return Boolean(
    filters.text ||
    filters.status ||
    filters.visibility ||
    filters.department ||
    filters.lead
  );
}

function getProjectSearchText(project) {
  return normalizeFilterText([
    project.name,
    project.description,
    project.lead_name,
    project.created_by_name,
    project.department_name
  ].filter(Boolean).join(' '));
}

function matchesProjectFilters(project, filters = getProjectFilterState()) {
  if (filters.status && project.status !== filters.status) return false;
  if (filters.visibility && normalizeProjectVisibility(project.confidentiality_level) !== filters.visibility) return false;
  if (filters.department && String(project.department_id || '') !== filters.department) return false;
  if (filters.lead && String(project.lead_id || '') !== filters.lead) return false;
  if (filters.text && !getProjectSearchText(project).includes(filters.text)) return false;

  return true;
}

function getFilteredProjects() {
  const filters = getProjectFilterState();
  return allProjects.filter(project => matchesProjectFilters(project, filters));
}

function updateProjectFilterSummary(filteredCount, totalCount) {
  const filters = getProjectFilterState();
  const hasFilters = hasActiveProjectFilters(filters);

  if (clearFiltersBtn) {
    clearFiltersBtn.disabled = !hasFilters;
  }

  if (!filterSummary) return;

  if (totalCount === 0) {
    filterSummary.textContent = 'Нет проектов';
    return;
  }

  filterSummary.textContent = hasFilters
    ? `Показано ${filteredCount} из ${totalCount}`
    : `Всего: ${totalCount}`;
}

function getSelectedOptionText(select) {
  if (!select || !select.value) return '';
  const option = select.options[select.selectedIndex];
  return option?.textContent?.trim() || '';
}

function getProjectStickyTitle() {
  const name = getProjectNameValue() || 'без названия';

  if (mode === 'edit' && currentId) {
    return `Проект #${currentId} | ${name}`;
  }

  return `Новый проект | ${name}`;
}

function getProjectMetaText() {
  if (!mode) return '—';

  const status = statusLabel(form.elements['status'].value);
  const visibility = confidentialityLabel(form.elements['confidentiality_level'].value);
  const lead = getSelectedOptionText(leadSelect) || currentProject?.lead_name || '';
  const createdBy = currentProject?.created_by_name || '';
  const startDate = formatDate(form.elements['start_date'].value || currentProject?.start_date);
  const dueDate = formatDate(form.elements['due_date'].value || currentProject?.due_date);

  return [
    status && `статус: ${status}`,
    visibility && `тип проекта: ${visibility}`,
    lead && `руководитель: ${lead}`,
    startDate && `начало: ${startDate}`,
    dueDate && `план: ${dueDate}`,
    createdBy && `создал: ${createdBy}`
  ].filter(Boolean).join(' — ') || 'новая запись';
}

function renderProjectStickyHeader() {
  window.BADB_UI?.setStickyHeader({
    header: stickyHeader,
    titleEl: stickyTitle,
    metaEl: stickyMeta,
    dirtyEl: stickyDirty,
    title: getProjectStickyTitle(),
    meta: getProjectMetaText(),
    isDirty: hasUnsavedChanges(),
    hidden: !mode
  });

  if (saveBtn) {
    saveBtn.textContent = 'Сохранить';
    saveBtn.title = 'Сохранить изменения';
  }

  if (printProjectBtn) {
    printProjectBtn.hidden = mode !== 'edit' || !currentId;
    printProjectBtn.title = 'Печать отчёта';
  }

  if (exitBtn) {
    exitBtn.textContent = 'Выйти';
    exitBtn.title = 'Вернуться к списку, не выходя из аккаунта';
  }

  if (deleteProjectBtn) {
    deleteProjectBtn.hidden = mode !== 'edit' || !currentId;
    deleteProjectBtn.textContent = 'Удалить';
    deleteProjectBtn.title = 'Удалить запись';
  }
}

function clearRecordStatuses() {
  showStatus('', false, { target: 'header', clearAfterMs: 0 });
}

function confirmDiscardUnsavedChanges() {
  if (!hasUnsavedChanges()) return true;
  return confirm('Выйти без сохранения изменений?');
}

function updateDepartmentVisibility() {
  if (!departmentBlock || !departmentSelect) return;
  departmentBlock.hidden = true;
  departmentSelect.disabled = true;
  departmentSelect.required = false;
  departmentSelect.value = '';
}


// -------- API helpers --------

async function fetchProjects() {
  const res = await fetch('/api/projects');

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки списка проектов');
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function createProject(data) {
  const res = await fetch('/api/projects', {
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

async function updateProject(id, data) {
  const res = await fetch(`/api/projects/${id}`, {
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

async function deleteProject(id) {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'DELETE'
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(formatProjectDeleteError(err));
  }
}

function formatDependencySummary(dependencies) {
  if (!Array.isArray(dependencies) || dependencies.length === 0) return '';

  return dependencies
    .map((dependency) => {
      const label = dependency.label || dependency.key || 'связанные записи';
      const count = dependency.count ?? dependency.records?.length ?? 0;
      const records = (dependency.records || [])
        .slice(0, 3)
        .map(record => {
          if (record.name) return `#${record.id}: ${record.name}`;
          if (record.id) return `#${record.id}`;
          return '';
        })
        .filter(Boolean)
        .join(', ');

      return records
        ? `${label}: ${count} (${records})`
        : `${label}: ${count}`;
    })
    .join('; ');
}

function formatProjectDeleteError(payload = {}) {
  const message = payload.error || 'Ошибка удаления проекта';
  const dependencySummary = formatDependencySummary(payload.dependencies);

  return dependencySummary
    ? `${message}. Блокирующие записи: ${dependencySummary}`
    : message;
}

async function fetchProjectAccess(projectId) {
  const res = await fetch(`/api/projects/${projectId}/access`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки доступа');
  }

  return res.json();
}

async function grantUserAccess(projectId, userId, accessLevel) {
  const res = await fetch(`/api/projects/${projectId}/access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      access_level: accessLevel
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка добавления пользователя');
  }

  return res.json();
}

async function revokeUserAccess(projectId, userId) {
  const res = await fetch(`/api/projects/${projectId}/access/user/${userId}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка удаления доступа пользователя');
  }

  return res.json();
}

async function fetchProjectParticipants(projectId) {
  const res = await fetch(`/api/projects/${projectId}/participants`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки участников проекта');
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function addProjectParticipant(projectId, payload) {
  const res = await fetch(`/api/projects/${projectId}/participants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка добавления участника проекта');
  }

  return res.json();
}

async function updateProjectParticipant(projectId, participantId, payload) {
  const res = await fetch(`/api/projects/${projectId}/participants/${participantId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка обновления участника проекта');
  }

  return res.json();
}

async function deleteProjectParticipant(projectId, participantId) {
  const res = await fetch(`/api/projects/${projectId}/participants/${participantId}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка удаления участника проекта');
  }
}

function resetProjectAccessSection() {
  projectAccessSection.hidden = true;
  currentAccessGrants = [];
  currentUserAccess = [];
  projectUserAccessBody.innerHTML = '';
  projectAccessUserSelect.value = '';
  projectUserAccessLevel.value = 'admin';
}

function populateAccessUserSelect(visibleUserIds = new Set()) {
  const prevAccessUser = projectAccessUserSelect.value;

  projectAccessUserSelect.replaceChildren(new Option('— выбрать пользователя —', ''));
  currentUsers
    .filter(user => user.active && !visibleUserIds.has(Number(user.user_id)))
    .forEach(user => {
      const departmentText = user.department_name ? ` — ${user.department_name}` : '';
      projectAccessUserSelect.add(new Option(`${user.name}${departmentText}`, user.user_id));
    });

  projectAccessUserSelect.value = prevAccessUser;
}

function resetProjectParticipantsSection() {
  if (!projectParticipantsSection) return;

  projectParticipantsSection.hidden = true;
  currentParticipants = [];
  projectParticipantsBody.innerHTML = '';
  projectParticipantUserSelect.value = '';
  projectParticipantRoleInput.value = '';
  if (projectParticipantAccessLevel) projectParticipantAccessLevel.value = 'view';
}

function populateParticipantUserSelect() {
  if (!projectParticipantUserSelect) return;

  const prevParticipantUser = projectParticipantUserSelect.value;
  const participantUserIds = new Set(
    currentParticipants.map(participant => Number(participant.user_id))
  );

  projectParticipantUserSelect.replaceChildren(new Option('— выбрать пользователя —', ''));
  currentUsers
    .filter(user => user.active && !participantUserIds.has(Number(user.user_id)))
    .forEach(user => {
      const departmentText = user.department_name ? ` — ${user.department_name}` : '';
      projectParticipantUserSelect.add(new Option(`${user.name}${departmentText}`, user.user_id));
    });

  projectParticipantUserSelect.value = [...projectParticipantUserSelect.options]
    .some(option => option.value === prevParticipantUser)
    ? prevParticipantUser
    : '';
}

function getParticipantAccessLevel(participant) {
  const userId = Number(participant?.user_id);
  const explicit = currentUserAccess.find(grant => Number(grant.grantee_id) === userId);
  const isProjectLead = Number(currentProjectLeadId || form.elements['lead_id'].value) === userId;
  const isProjectOwner = Number(currentProject?.created_by || createdBySelect.value) === userId;

  if (isProjectLead || isProjectOwner) return 'admin';
  return explicit?.access_level || 'view';
}

function buildParticipantAccessLevelSelect(participant) {
  const userId = Number(participant?.user_id);
  const select = document.createElement('select');
  select.name = 'participant_access_level';

  const isProjectLead = Number(currentProjectLeadId || form.elements['lead_id'].value) === userId;
  const isProjectOwner = Number(currentProject?.created_by || createdBySelect.value) === userId;

  if (isProjectLead || isProjectOwner) {
    select.add(new Option('администратор проекта', 'admin'));
    select.value = 'admin';
    select.disabled = true;
    select.title = isProjectLead
      ? 'Права заданы ролью руководителя проекта'
      : 'Права заданы создателем проекта';
    return select;
  }

  select.add(new Option('просмотр', 'view'));
  select.add(new Option('редактирование', 'edit'));
  select.add(new Option('администратор проекта', 'admin'));
  select.value = getParticipantAccessLevel(participant);

  select.addEventListener('change', async () => {
    try {
      await grantUserAccess(currentId, userId, select.value);
      showStatus('Права участника обновлены');
      await loadProjectAccess();
    } catch (err) {
      showStatus(err.message, true);
      await loadProjectAccess().catch(() => {});
    }
  });

  return select;
}

function renderProjectParticipants() {
  if (!projectParticipantsBody) return;

  projectParticipantsBody.innerHTML = '';

  if (currentParticipants.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'empty-table-message';
    cell.textContent = 'Участники не добавлены';
    row.appendChild(cell);
    projectParticipantsBody.appendChild(row);
    populateParticipantUserSelect();
    return;
  }

  currentParticipants.forEach((participant, index) => {
    const row = document.createElement('tr');

    const orderCell = document.createElement('td');
    orderCell.className = 'project-participant-order';
    orderCell.textContent = String(index + 1);

    const userCell = document.createElement('td');
    userCell.textContent = participant.user_name || `Пользователь #${participant.user_id}`;

    const roleCell = document.createElement('td');
    const roleInput = document.createElement('input');
    roleInput.type = 'text';
    roleInput.className = 'project-participant-role-input';
    roleInput.value = participant.role_in_team || '';
    roleInput.placeholder = 'Функционал';
    roleInput.addEventListener('change', async () => {
      const nextRole = roleInput.value.trim();
      if (nextRole === (participant.role_in_team || '')) return;

      try {
        await updateProjectParticipant(currentId, participant.participant_id, {
          role_in_team: nextRole
        });
        showStatus('Роль участника обновлена');
        await loadProjectParticipants();
      } catch (err) {
        showStatus(err.message, true);
        roleInput.value = participant.role_in_team || '';
      }
    });
    roleInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        roleInput.blur();
      }
    });
    roleCell.appendChild(roleInput);

    const accessCell = document.createElement('td');
    accessCell.appendChild(buildParticipantAccessLevelSelect(participant));

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions project-participant-actions';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Убрать';
    deleteBtn.title = 'Убрать участника проекта';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Убрать участника "${userCell.textContent}" из проекта?`)) return;

      try {
        await deleteProjectParticipant(currentId, participant.participant_id);
        showStatus('Участник проекта убран');
        await loadProjectParticipants();
        await loadProjectAccess();
      } catch (err) {
        showStatus(err.message, true);
      }
    });

    actionsCell.append(deleteBtn);
    row.append(orderCell, userCell, roleCell, accessCell, actionsCell);
    projectParticipantsBody.appendChild(row);
  });

  populateParticipantUserSelect();
}

async function loadProjectParticipants() {
  if (!currentId) {
    resetProjectParticipantsSection();
    return;
  }

  projectParticipantsSection.hidden = false;
  if (currentUsers.length === 0) await loadUsers();

  currentParticipants = await fetchProjectParticipants(currentId);
  renderProjectParticipants();
}

function buildAccessLevelSelect(userRow) {
  const select = document.createElement('select');
  select.name = 'access_level';

  if (userRow.isProjectLead || userRow.isProjectOwner) {
    select.add(new Option('администратор проекта', 'admin'));
    select.value = 'admin';
    select.disabled = true;
    select.title = userRow.isProjectLead
      ? 'Права заданы ролью руководителя проекта'
      : 'Права заданы создателем проекта';
    return select;
  }

  select.add(new Option('просмотр', 'view'));
  select.add(new Option('редактирование', 'edit'));
  select.add(new Option('администратор проекта', 'admin'));
  select.value = userRow.effectiveLevel;

  select.addEventListener('change', async () => {
    try {
      await grantUserAccess(currentId, userRow.user.user_id, select.value);
      showStatus('Права пользователя обновлены');
      await loadProjectAccess();
    } catch (err) {
      showStatus(err.message, true);
      await loadProjectAccess().catch(() => {});
    }
  });

  return select;
}

function renderProjectUserAccess() {
  projectUserAccessBody.innerHTML = '';

  const personalByUser = new Map(
    currentUserAccess.map(grant => [Number(grant.grantee_id), grant])
  );
  const participantUserIds = new Set(
    currentParticipants.map(participant => Number(participant.user_id))
  );
  const leadUserId = Number(currentProjectLeadId || form.elements['lead_id'].value);
  const ownerUserId = Number(currentProject?.created_by || createdBySelect.value);
  const visibleUserIds = new Set(
    [...personalByUser.keys()].filter(userId => (
      !participantUserIds.has(userId) &&
      userId !== leadUserId &&
      userId !== ownerUserId
    ))
  );
  const userRows = [...visibleUserIds]
    .map(userId => {
      const user = currentUsers.find(item => Number(item.user_id) === userId);
      if (!user) return null;

      const personal = personalByUser.get(userId);
      const personalLevel = personal?.access_level || null;

      return {
        user,
        personal,
        personalLevel,
        effectiveLevel: personalLevel || 'view',
        isProjectLead: false,
        isProjectOwner: false
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const departmentCompare = (a.user.department_name || '').localeCompare(b.user.department_name || '', 'ru');
      if (departmentCompare !== 0) return departmentCompare;
      return (a.user.name || '').localeCompare(b.user.name || '', 'ru');
    });

  if (userRows.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'empty-table-message';
    cell.textContent = 'Дополнительные администраторы не добавлены';
    row.appendChild(cell);
    projectUserAccessBody.appendChild(row);
  }

  userRows.forEach(userRow => {
    const row = document.createElement('tr');

    const userCell = document.createElement('td');
    userCell.textContent = userRow.user.name || `Пользователь #${userRow.user.user_id}`;

    const departmentCell = document.createElement('td');
    departmentCell.textContent = userRow.user.department_name || '—';

    const sourceCell = document.createElement('td');
    sourceCell.textContent = 'личное назначение';

    const levelCell = document.createElement('td');
    levelCell.appendChild(buildAccessLevelSelect(userRow));

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions';

    if (userRow.personal) {
      const revokeBtn = document.createElement('button');
      revokeBtn.type = 'button';
      revokeBtn.textContent = 'Убрать';
      revokeBtn.title = 'Убрать права администратора';
      revokeBtn.addEventListener('click', async () => {
        if (!confirm(`Убрать права администратора "${userCell.textContent}"?`)) return;

        try {
          await revokeUserAccess(currentId, userRow.user.user_id);
          showStatus('Права администратора убраны');
          await loadProjectAccess();
        } catch (err) {
          showStatus(err.message, true);
        }
      });
      actionsCell.appendChild(revokeBtn);
    } else {
      actionsCell.textContent = '—';
    }

    row.append(userCell, departmentCell, sourceCell, levelCell, actionsCell);
    projectUserAccessBody.appendChild(row);
  });

  populateAccessUserSelect(new Set([...visibleUserIds, ...participantUserIds, leadUserId, ownerUserId]));
}

async function loadProjectAccess() {
  if (!currentId) {
    resetProjectAccessSection();
    return;
  }

  projectAccessSection.hidden = false;
  if (currentUsers.length === 0) await loadUsers();

  currentAccessGrants = await fetchProjectAccess(currentId);
  currentUserAccess = currentAccessGrants.filter(grant => (
    grant.grantee_type === 'user' && !grant.is_expired
  ));
  renderProjectUserAccess();
  renderProjectParticipants();
}


// -------- Rendering --------

function populateProjectForm(proj) {
  setProjectName(proj.name || '');

  form.elements['lead_id'].value = proj.lead_id || '';
  form.elements['start_date'].value = proj.start_date ? proj.start_date.slice(0, 10) : '';
  form.elements['due_date'].value = proj.due_date ? proj.due_date.slice(0, 10) : '';
  form.elements['description'].value = proj.description || '';
  form.elements['status'].value = proj.status || 'active';
  form.elements['confidentiality_level'].value = normalizeProjectVisibility(proj.confidentiality_level || 'public');
  form.elements['department_id'].value = proj.department_id || '';
  updateDepartmentVisibility();

  if (proj.created_by) {
    createdBySelect.value = proj.created_by;
  } else {
    createdBySelect.value = '';
  }
}

function getProjectSnapshotFromForm() {
  return {
    project_id: currentId,
    name: getProjectNameValue(),
    lead_id: form.elements['lead_id'].value || null,
    start_date: form.elements['start_date'].value || null,
    due_date: form.elements['due_date'].value || null,
    description: form.elements['description'].value || '',
    status: form.elements['status'].value || 'active',
    confidentiality_level: normalizeProjectVisibility(form.elements['confidentiality_level'].value || 'public'),
    department_id: form.elements['department_id'].value || null,
    department_name: getSelectedOptionText(departmentSelect),
    lead_name: getSelectedOptionText(leadSelect),
    created_by: createdBySelect.value || null,
    created_by_name: currentProject?.created_by_name || ''
  };
}

function renderProjects(projects, options = {}) {
  const totalCount = options.totalCount ?? projects.length;
  const hasFilters = Boolean(options.hasFilters);

  projectsList.innerHTML = '';

  if (projects.length === 0) {
    const emptyRow = document.createElement('li');
    emptyRow.className = 'user-row project-empty-row';
    emptyRow.textContent = totalCount === 0
      ? 'Проекты пока не добавлены.'
      : hasFilters
        ? 'Нет проектов по выбранным фильтрам.'
        : 'Проекты не найдены.';
    projectsList.appendChild(emptyRow);
    return;
  }

  projects.forEach(proj => {
    const li = document.createElement('li');
    li.className = 'user-row';

    const titleLine = document.createElement('div');
    titleLine.className = 'record-list-title';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'project-list-title';
    nameSpan.textContent = proj.name;

    const statusSpan = document.createElement('span');
    statusSpan.className = 'status';
    statusSpan.textContent = statusLabel(proj.status);
    titleLine.append(nameSpan, statusSpan);

    const meta = document.createElement('div');
    meta.className = 'record-list-meta project-list-meta';
    const accessText = confidentialityLabel(proj.confidentiality_level);
    const leadText = proj.lead_name ? `Руководитель: ${proj.lead_name}` : '';
    const dateParts = [
      formatDate(proj.start_date) ? `начало: ${formatDate(proj.start_date)}` : '',
      formatDate(proj.due_date) ? `план: ${formatDate(proj.due_date)}` : ''
    ].filter(Boolean).join(' · ');
    const createdText = proj.created_by_name ? `создал: ${proj.created_by_name}` : '';
    meta.textContent = [
      `тип проекта: ${accessText}`,
      leadText,
      dateParts,
      createdText
    ].filter(Boolean).join(' — ');

    const info = window.BADB_UI.createRecordOpenButton({
      className: 'user-info',
      ariaLabel: 'Открыть запись',
      children: [titleLine, meta],
      onClick: async () => {
        await openProjectRecord(proj);
      }
    });
    info.title = 'Открыть запись';

    const actions = document.createElement('div');
    actions.className = 'actions';

    const printBtn = window.BADB_UI.createIconButton({
      icon: '🖨️',
      title: 'Печать отчёта',
      ariaLabel: 'Печать отчёта',
      onClick: () => {
        openProjectPrintReport(proj.project_id);
      }
    });

    const duplicateBtn = window.BADB_UI.createIconButton({
      icon: '📑',
      title: 'Дублировать запись',
      ariaLabel: 'Дублировать запись',
      onClick: () => {
        duplicateProject(proj);
      }
    });

    actions.appendChild(printBtn);
    actions.appendChild(duplicateBtn);

    li.appendChild(info);
    li.appendChild(actions);

    projectsList.appendChild(li);
  });
}

function renderFilteredProjects() {
  const filters = getProjectFilterState();
  const filtered = getFilteredProjects();

  renderProjects(filtered, {
    totalCount: allProjects.length,
    hasFilters: hasActiveProjectFilters(filters)
  });
  updateProjectFilterSummary(filtered.length, allProjects.length);
}

async function openProjectRecord(proj) {
  if (!confirmDiscardUnsavedChanges()) return false;

  clearRecordStatuses();
  mode = 'edit';
  currentId = proj.project_id;
  currentProject = proj;
  currentProjectLeadId = proj.lead_id || null;

  populateProjectForm(proj);
  showForm();

  try {
    await loadProjectParticipants();
    await loadProjectAccess();
  } catch (err) {
    showStatus(err.message, true, { clearAfterMs: 9000 });
  } finally {
    markFormPristine();
    window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
  }

  return true;
}

function duplicateProject(proj) {
  if (!proj || !confirmDiscardUnsavedChanges()) return false;

  clearRecordStatuses();
  mode = 'create';
  currentId = null;
  currentProject = null;
  currentProjectLeadId = null;
  initialFormState = null;

  populateProjectForm({
    ...proj,
    name: `${proj.name || 'Проект'} (копия)`,
    created_by: null
  });
  resetProjectAccessSection();
  resetProjectParticipantsSection();

  createdBySelect.value = '';
  leadSelect.value = '';
  currentProjectLeadId = null;

  showForm();
  renderProjectStickyHeader();
  window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
  return true;
}

function getProjectPrintReportUrl(id) {
  return `/workflow/project-print.html?project_id=${encodeURIComponent(id)}`;
}

function openProjectPrintReport(id) {
  if (!id) return;

  const url = getProjectPrintReportUrl(id);
  window.BADB_AUTH?.openAuthenticatedWindow(url);
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


// -------- Reference dropdowns --------

function populateProjectLeadFilter() {
  if (!filterLeadSelect) return;

  const previous = filterLeadSelect.value;
  filterLeadSelect.replaceChildren(new Option('Все руководители', ''));
  currentUsers.forEach(user => {
    filterLeadSelect.add(new Option(user.name, user.user_id));
  });
  filterLeadSelect.value = [...filterLeadSelect.options].some(option => option.value === previous)
    ? previous
    : '';
}

function populateProjectDepartmentFilter() {
  if (!filterDepartmentSelect) return;

  const previous = filterDepartmentSelect.value;
  filterDepartmentSelect.replaceChildren(new Option('Все отделы', ''));
  currentDepartments.forEach(department => {
    filterDepartmentSelect.add(new Option(department.name, department.department_id));
  });
  filterDepartmentSelect.value = [...filterDepartmentSelect.options].some(option => option.value === previous)
    ? previous
    : '';
}

// Refresh user options without losing current selections
async function loadUsers() {
  const prevCreated = createdBySelect.value;
  const prevLead = leadSelect.value;
  
  const res = await fetch('/api/users');

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки пользователей');
  }

  currentUsers = await res.json();
  
  createdBySelect.replaceChildren(new Option(
    window.BADB_AUTH?.getAuditUserPlaceholder?.() || '— автоматически —',
    ''
  ));
  leadSelect.innerHTML = '<option value="">— выбрать пользователя —</option>';
  
  currentUsers.forEach(u => {
    createdBySelect.add(new Option(u.name, u.user_id));
  });

  currentUsers.filter(u => u.active).forEach(u => {
    leadSelect.add(new Option(u.name, u.user_id));
  });
  
  createdBySelect.value = prevCreated;
  leadSelect.value = prevLead;
  populateProjectLeadFilter();
  populateAccessUserSelect();
  populateParticipantUserSelect();
  if (allProjects.length) renderFilteredProjects();
  renderProjectStickyHeader();
}

async function loadDepartments() {
  const prevDepartment = departmentSelect.value;
  const res = await fetch('/api/departments');

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки отделов');
  }

  currentDepartments = await res.json();

  departmentSelect.replaceChildren(new Option('— выбрать отдел —', ''));

  currentDepartments.forEach(department => {
    departmentSelect.add(new Option(department.name, department.department_id));
  });

  departmentSelect.value = prevDepartment;
  populateProjectDepartmentFilter();
  updateDepartmentVisibility();
  if (allProjects.length) renderFilteredProjects();
  renderProjectStickyHeader();
}

// Refresh reference dropdowns on focus
leadSelect.addEventListener('focus', () => {
  loadUsers().catch(err => showStatus(err.message, true, { target: 'page' }));
});
leadSelect.addEventListener('change', () => {
  if (!projectAccessSection.hidden) {
    renderProjectUserAccess();
  }
  renderProjectStickyHeader();
});
createdBySelect.addEventListener('focus', () => {
  loadUsers().catch(err => showStatus(err.message, true, { target: 'page' }));
});
departmentSelect.addEventListener('focus', () => {
  loadDepartments().catch(err => showStatus(err.message, true, { target: 'page' }));
});
confidentialitySelect.addEventListener('change', () => {
  updateDepartmentVisibility();
  if (!projectAccessSection.hidden) {
    renderProjectUserAccess();
  }
  renderProjectStickyHeader();
});
departmentSelect.addEventListener('change', () => {
  if (!projectAccessSection.hidden) {
    renderProjectUserAccess();
  }
  renderProjectStickyHeader();
});


// -------- Events --------

addInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  
  e.preventDefault();
  
  if (!form.hidden) return;   // prevent double-create
  
  const name = addInput.value.trim();
  if (!name) return;

  clearRecordStatuses();
  mode = 'create';
  currentId = null;
  currentProject = null;
  currentProjectLeadId = null;
  initialFormState = null;

  setProjectName(name);
  form.elements['status'].value = 'active';
  form.elements['confidentiality_level'].value = 'public';
  updateDepartmentVisibility();
  resetProjectAccessSection();
  resetProjectParticipantsSection();
  
  showForm();
  
  addInput.value = '';
  renderProjectStickyHeader();
  window.BADB_UI?.scrollToTop({ behavior: 'smooth' });
});

function validateRequiredFields() {
  const missing = [];
  const name = getProjectNameValue();

  nameInput.classList.remove('required-missing');

  if (!name) {
    missing.push('Название');
    nameInput.classList.add('required-missing');
  }

  if (missing.length) {
    if (!name) {
      nameInput.hidden = false;
      title.hidden = true;
      nameInput.focus();
    }

    showStatus(`Заполните обязательные поля: ${missing.join(', ')}`, true);
    return false;
  }

  return true;
}

async function saveProjectRecord() {
  if (!validateRequiredFields()) return null;

  const data = normalizeProjectPayload(formDataToObject(form));
  delete data.created_by;
  data.name = getProjectNameValue();
  setProjectName(data.name);

  const initialMode = mode;
  let savedProjectId = currentId;

  if (initialMode === 'create') {
    const savedProject = await createProject(data);
    savedProjectId = savedProject.project_id;
    currentId = savedProjectId;
    mode = 'edit';
  } else if (initialMode === 'edit') {
    await updateProject(currentId, data);
  }

  currentProjectLeadId = data.lead_id || null;

  return {
    initialMode,
    savedProjectId
  };
}

saveBtn.addEventListener('click', async () => {
  if (!mode) return;

  try {
    const result = await saveProjectRecord();
    if (!result) return;

    const projects = await loadProjects();
    currentProject = projects.find(project => Number(project.project_id) === Number(currentId)) || {
      ...getProjectSnapshotFromForm(),
      project_id: currentId
    };
    populateProjectForm(currentProject);
    await loadProjectParticipants();
    await loadProjectAccess();
    markFormPristine();

    showStatus(result.initialMode === 'create'
      ? 'Проект сохранён'
      : 'Изменения сохранены');
  } catch (err) {
    showStatus(err.message, true);
  }
});

exitBtn.addEventListener('click', () => {
  if (!hasUnsavedChanges()) {
    resetForm();
    return;
  }

  if (confirm('Выйти без сохранения изменений?')) {
    resetForm();
  }
});

if (printProjectBtn) {
  printProjectBtn.addEventListener('click', () => {
    openProjectPrintReport(currentId);
  });
}

async function deleteCurrentProject() {
  if (!currentId) {
    showStatus('Сначала откройте проект', true);
    return;
  }

  if (hasUnsavedChanges() && !confirm('Есть несохранённые изменения. Удалить проект без сохранения?')) {
    return;
  }

  const name = getProjectNameValue() || `#${currentId}`;
  if (!confirm(`Удалить проект "${name}"?`)) return;

  try {
    await deleteProject(currentId);
    resetForm();
    await loadProjects();
    showStatus('Проект удалён', false, { target: 'page', clearAfterMs: 5000 });
  } catch (err) {
    showStatus(err.message, true, { clearAfterMs: 15000 });
  }
}

if (deleteProjectBtn) {
  deleteProjectBtn.addEventListener('click', deleteCurrentProject);
}

grantUserAccessBtn.addEventListener('click', async () => {
  if (!currentId) return;

  const userId = projectAccessUserSelect.value;
  if (!userId) {
    showStatus('Выберите пользователя', true);
    return;
  }

  try {
    await grantUserAccess(currentId, Number(userId), projectUserAccessLevel.value);
    projectAccessUserSelect.value = '';
    projectUserAccessLevel.value = 'admin';
    showStatus('Администратор проекта добавлен');
    await loadProjectAccess();
  } catch (err) {
    showStatus(err.message, true);
  }
});

async function handleAddProjectParticipant() {
  if (!currentId) return;

  const userId = projectParticipantUserSelect.value;
  if (!userId) {
    showStatus('Выберите участника', true);
    return;
  }

  try {
    await addProjectParticipant(currentId, {
      user_id: Number(userId),
      role_in_team: projectParticipantRoleInput.value.trim()
    });
    await grantUserAccess(currentId, Number(userId), projectParticipantAccessLevel?.value || 'view');
    projectParticipantUserSelect.value = '';
    projectParticipantRoleInput.value = '';
    if (projectParticipantAccessLevel) projectParticipantAccessLevel.value = 'view';
    showStatus('Участник проекта добавлен');
    await loadProjectParticipants();
    await loadProjectAccess();
  } catch (err) {
    showStatus(err.message, true);
  }
}

if (addProjectParticipantBtn) {
  addProjectParticipantBtn.addEventListener('click', handleAddProjectParticipant);
}

if (projectParticipantRoleInput) {
  projectParticipantRoleInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    handleAddProjectParticipant();
  });
}

/* ------ name: editable ------ */

title.addEventListener('click', () => {
  nameInput.value = getProjectNameValue();
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
  setProjectName(val || title.textContent);
  renderProjectStickyHeader();
});

form.addEventListener('input', renderProjectStickyHeader);
form.addEventListener('change', renderProjectStickyHeader);


// -------- Init --------

async function loadProjects() {
  const projects = await fetchProjects();
  allProjects = projects;
  renderFilteredProjects();
  return allProjects;
}

if (filterTextInput) {
  filterTextInput.addEventListener('input', renderFilteredProjects);
}

if (filterStatusSelect) {
  filterStatusSelect.addEventListener('change', renderFilteredProjects);
}

if (filterVisibilitySelect) {
  filterVisibilitySelect.addEventListener('change', renderFilteredProjects);
}

if (filterDepartmentSelect) {
  filterDepartmentSelect.addEventListener('change', renderFilteredProjects);
}

if (filterLeadSelect) {
  filterLeadSelect.addEventListener('change', renderFilteredProjects);
}

if (clearFiltersBtn) {
  clearFiltersBtn.addEventListener('click', () => {
    if (filterTextInput) filterTextInput.value = '';
    if (filterStatusSelect) filterStatusSelect.value = '';
    if (filterVisibilitySelect) filterVisibilitySelect.value = '';
    if (filterDepartmentSelect) filterDepartmentSelect.value = '';
    if (filterLeadSelect) filterLeadSelect.value = '';
    renderFilteredProjects();
    filterTextInput?.focus();
  });
}

const projectLogoutGuard = {
  hasUnsavedChanges,
  discardUnsavedChanges: resetForm,
  message: 'Есть несохранённые изменения проекта. Выйти без сохранения?'
};

window.BADB_PAGE_LOGOUT_GUARD = projectLogoutGuard;
window.BADB_AUTH?.registerLogoutGuard?.(projectLogoutGuard);

window.addEventListener('beforeunload', (event) => {
  if (!hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = '';
});

hideForm();
updateDepartmentVisibility();
loadUsers().catch(err => showPageStatus(err.message, true, { clearAfterMs: 9000 }));
loadDepartments().catch(err => showPageStatus(err.message, true, { clearAfterMs: 9000 }));
loadProjects().catch(err => showPageStatus(err.message, true, { clearAfterMs: 9000 }));
