const addInput = document.getElementById('project-name');
const nameInput = document.getElementById('project-name-input');
const form = document.forms['project-form'];
const title = form.querySelector('h2');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const exitBtn = document.getElementById('exitBtn');
const createdBySelect = document.getElementById('project-created-by');

const projectsList = document.getElementById('projectsList');
const statusSelect = form.querySelector('select[name="status"]');
const leadSelect = document.getElementById('project-lead-id');
const confidentialitySelect = document.getElementById('project-confidentiality-level');
const departmentBlock = document.getElementById('project-department-block');
const departmentSelect = document.getElementById('project-department-id');
const projectDepartmentAccessSection = document.getElementById('project-department-access-section');
const projectAccessDepartmentSelect = document.getElementById('project-access-department-id');
const projectAccessExpiresAt = document.getElementById('project-access-expires-at');
const grantDepartmentAccessBtn = document.getElementById('grantDepartmentAccessBtn');
const projectDepartmentAccessBody = document.getElementById('projectDepartmentAccessBody');
const projectUserAccessBody = document.getElementById('projectUserAccessBody');
const projectAccessUserSelect = document.getElementById('project-access-user-id');
const projectUserAccessLevel = document.getElementById('project-user-access-level');
const grantUserAccessBtn = document.getElementById('grantUserAccessBtn');

let mode = null; // 'create' | 'edit'
let currentId = null;
let currentProjectLeadId = null;
let initialFormState = null;
let currentUsers = [];
let currentDepartments = [];
let currentAccessGrants = [];
let currentDepartmentAccess = [];
let currentUserAccess = [];

function showForm() {
  form.hidden = false;
  addInput.disabled = true;
}

function hideForm() {
  form.hidden = true;
  addInput.disabled = false;
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
}

function hasUnsavedChanges() {
  if (!mode) return false;
  return captureFormState() !== initialFormState;
}

function resetForm() {
  form.reset();
  updateDepartmentVisibility();
  resetProjectAccessSection();
  title.textContent = '';
  mode = null;
  currentId = null;
  currentProjectLeadId = null;
  initialFormState = null;
  hideForm();
}

function formDataToObject(form) {
  return Object.fromEntries(new FormData(form));
}

function normalizeProjectPayload(data) {
  const next = { ...data };
  next.confidentiality_level = next.confidentiality_level || 'public';

  if (next.confidentiality_level !== 'department') {
    next.department_id = null;
  } else {
    next.department_id = next.department_id || null;
  }

  return next;
}

function statusLabel(status) {
  return status === 'active' ? 'активный' :
    status === 'paused' ? 'приостановлен' :
    status === 'completed' ? 'завершён' :
    'архивирован';
}

function confidentialityLabel(level) {
  return level === 'department' ? 'отдел' :
    level === 'confidential' ? 'выборочно' :
    'все';
}

function accessLevelLabel(level) {
  return level === 'admin' ? 'администратор' :
    level === 'edit' ? 'редактирование' :
    'просмотр';
}

function accessLevelRank(level) {
  return level === 'admin' ? 3 :
    level === 'edit' ? 2 :
    1;
}

function strongerAccessLevel(a, b) {
  return accessLevelRank(a) >= accessLevelRank(b) ? a : b;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('ru-RU') : '';
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleDateString('ru-RU') : '—';
}

function updateDepartmentVisibility() {
  const requiresDepartment = confidentialitySelect.value === 'department';
  departmentBlock.hidden = !requiresDepartment;
  departmentSelect.disabled = !requiresDepartment;
  departmentSelect.required = requiresDepartment;

  if (!requiresDepartment) {
    departmentSelect.value = '';
  }
}


// -------- API helpers --------

async function fetchProjects() {
  const res = await fetch('/api/projects');
  return res.json();
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
    const err = await res.json();
    throw new Error(err.error || 'Ошибка удаления');
  }
}

async function fetchProjectAccess(projectId) {
  const res = await fetch(`/api/projects/${projectId}/access`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка загрузки доступа');
  }

  return res.json();
}

async function grantDepartmentAccess(projectId, departmentId, expiresAt) {
  const payload = {
    department_id: departmentId,
    access_level: 'view',
    expires_at: expiresAt || null
  };

  const res = await fetch(`/api/projects/${projectId}/access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка добавления доступа');
  }

  return res.json();
}

async function revokeDepartmentAccess(projectId, departmentId) {
  const res = await fetch(`/api/projects/${projectId}/access/department/${departmentId}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Ошибка удаления доступа');
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

function resetProjectAccessSection() {
  projectDepartmentAccessSection.hidden = true;
  currentAccessGrants = [];
  currentDepartmentAccess = [];
  currentUserAccess = [];
  projectDepartmentAccessBody.innerHTML = '';
  projectUserAccessBody.innerHTML = '';
  projectAccessDepartmentSelect.value = '';
  projectAccessExpiresAt.value = '';
  projectAccessUserSelect.value = '';
  projectUserAccessLevel.value = 'view';
}

function populateAccessDepartmentSelect() {
  const prevAccessDepartment = projectAccessDepartmentSelect.value;

  projectAccessDepartmentSelect.replaceChildren(new Option('— выбрать отдел —', ''));
  currentDepartments.forEach(department => {
    projectAccessDepartmentSelect.add(new Option(department.name, department.department_id));
  });

  projectAccessDepartmentSelect.value = prevAccessDepartment;
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

function renderProjectDepartmentAccess() {
  projectDepartmentAccessBody.innerHTML = '';

  if (currentDepartmentAccess.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'empty-table-message';
    cell.textContent = 'Отделы не добавлены';
    row.appendChild(cell);
    projectDepartmentAccessBody.appendChild(row);
    return;
  }

  currentDepartmentAccess.forEach(grant => {
    const row = document.createElement('tr');
    if (grant.is_expired) row.className = 'access-expired';

    const departmentCell = document.createElement('td');
    departmentCell.textContent = grant.grantee_name || grant.department_name || `Отдел #${grant.grantee_id}`;

    const levelCell = document.createElement('td');
    levelCell.textContent = accessLevelLabel(grant.access_level);

    const expiresCell = document.createElement('td');
    expiresCell.textContent = grant.expires_at ? formatDateTime(grant.expires_at) : 'без срока';

    const grantedByCell = document.createElement('td');
    grantedByCell.textContent = grant.granted_by_name || '—';

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions';

    const revokeBtn = document.createElement('button');
    revokeBtn.type = 'button';
    revokeBtn.textContent = 'Убрать';
    revokeBtn.title = 'Убрать доступ отдела';
    revokeBtn.addEventListener('click', async () => {
      if (!confirm(`Убрать доступ отдела "${departmentCell.textContent}"?`)) return;

      try {
        await revokeDepartmentAccess(currentId, grant.grantee_id);
        showStatus('Доступ отдела убран');
        await loadProjectAccess();
      } catch (err) {
        showStatus(err.message, true);
      }
    });

    actionsCell.appendChild(revokeBtn);
    row.append(departmentCell, levelCell, expiresCell, grantedByCell, actionsCell);
    projectDepartmentAccessBody.appendChild(row);
  });
}

function getDepartmentName(departmentId) {
  const department = currentDepartments.find(item => Number(item.department_id) === Number(departmentId));
  return department?.name || '';
}

function getInheritedProjectAccessByUser() {
  const inherited = new Map();
  const baseDepartmentId = form.elements['confidentiality_level'].value === 'department'
    ? Number(form.elements['department_id'].value)
    : null;

  function addInheritedUsers(departmentId, level, sourceLabel) {
    if (!Number.isInteger(Number(departmentId))) return;

    currentUsers
      .filter(user => user.active && Number(user.department_id) === Number(departmentId))
      .forEach(user => {
        const userId = Number(user.user_id);
        const existing = inherited.get(userId);
        inherited.set(userId, {
          level: existing ? strongerAccessLevel(existing.level, level) : level,
          sources: existing ? [...existing.sources, sourceLabel] : [sourceLabel]
        });
      });
  }

  const leadUserId = Number(currentProjectLeadId || form.elements['lead_id'].value);
  if (Number.isInteger(leadUserId)) {
    const leadUser = currentUsers.find(user => Number(user.user_id) === leadUserId);
    if (leadUser) {
      inherited.set(leadUserId, {
        level: 'admin',
        sources: ['руководитель проекта (администратор проекта)']
      });
    }
  }

  if (baseDepartmentId) {
    addInheritedUsers(baseDepartmentId, 'view', 'отдел проекта (просмотр)');
  }

  currentDepartmentAccess
    .filter(grant => !grant.is_expired)
    .forEach(grant => {
      const departmentName = grant.grantee_name || grant.department_name || getDepartmentName(grant.grantee_id);
      const inheritedLevel = grant.access_level || 'view';
      addInheritedUsers(
        grant.grantee_id,
        inheritedLevel,
        `отдел: ${departmentName || `#${grant.grantee_id}`} (${accessLevelLabel(inheritedLevel)})`
      );
    });

  return inherited;
}

function buildAccessLevelSelect(userRow) {
  const select = document.createElement('select');
  select.name = 'access_level';

  if (userRow.isProjectLead) {
    select.add(new Option('администратор проекта', 'admin'));
    select.value = 'admin';
    select.disabled = true;
    select.title = 'Доступ задан ролью руководителя проекта';
    return select;
  }

  if (userRow.inherited) {
    select.add(new Option('по отделу', 'department'));
  }

  select.add(new Option('просмотр', 'view'));
  select.add(new Option('редактирование', 'edit'));
  select.add(new Option('администратор проекта', 'admin'));
  select.value = userRow.personalLevel || (userRow.inherited ? 'department' : userRow.effectiveLevel);

  select.addEventListener('change', async () => {
    try {
      if (select.value === 'department') {
        await revokeUserAccess(currentId, userRow.user.user_id);
        showStatus('Личный доступ убран, действует доступ отдела');
      } else {
        await grantUserAccess(currentId, userRow.user.user_id, select.value);
        showStatus('Доступ пользователя обновлён');
      }

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

  const inheritedByUser = getInheritedProjectAccessByUser();
  const personalByUser = new Map(
    currentUserAccess.map(grant => [Number(grant.grantee_id), grant])
  );
  const visibleUserIds = new Set([...inheritedByUser.keys(), ...personalByUser.keys()]);
  const userRows = [...visibleUserIds]
    .map(userId => {
      const user = currentUsers.find(item => Number(item.user_id) === userId);
      if (!user) return null;

      const inherited = inheritedByUser.get(userId);
      const personal = personalByUser.get(userId);
      const inheritedLevel = inherited?.level || null;
      const personalLevel = personal?.access_level || null;
      const isProjectLead = Number(currentProjectLeadId || form.elements['lead_id'].value) === userId;
      const effectiveLevel = isProjectLead ? 'admin' : (personalLevel || inheritedLevel || 'view');

      return {
        user,
        inherited,
        personal,
        inheritedLevel,
        personalLevel,
        effectiveLevel,
        isProjectLead
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
    cell.textContent = 'Пользователи не добавлены';
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
    if (userRow.isProjectLead) {
      sourceCell.textContent = 'руководитель проекта';
    } else {
      const sourceParts = [];
      if (userRow.inherited) sourceParts.push(...userRow.inherited.sources);
      if (userRow.personal) sourceParts.push('личный доступ');
      sourceCell.textContent = sourceParts.join(', ') || 'личный доступ';
    }

    const levelCell = document.createElement('td');
    levelCell.appendChild(buildAccessLevelSelect(userRow));

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions';

    if (userRow.personal && !userRow.isProjectLead) {
      const revokeBtn = document.createElement('button');
      revokeBtn.type = 'button';
      revokeBtn.textContent = userRow.inherited ? 'Убрать личный' : 'Убрать';
      revokeBtn.title = userRow.inherited ? 'Убрать личный доступ' : 'Убрать доступ пользователя';
      revokeBtn.addEventListener('click', async () => {
        const message = userRow.inherited
          ? `Убрать личный доступ пользователя "${userCell.textContent}"? Доступ отдела останется.`
          : `Убрать доступ пользователя "${userCell.textContent}"?`;
        if (!confirm(message)) return;

        try {
          await revokeUserAccess(currentId, userRow.user.user_id);
          showStatus(userRow.inherited ? 'Личный доступ убран' : 'Доступ пользователя убран');
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

  populateAccessUserSelect(visibleUserIds);
}

async function loadProjectAccess() {
  if (!currentId) {
    resetProjectAccessSection();
    return;
  }

  projectDepartmentAccessSection.hidden = false;
  if (currentUsers.length === 0) await loadUsers();
  if (currentDepartments.length === 0) await loadDepartments();

  currentAccessGrants = await fetchProjectAccess(currentId);
  currentDepartmentAccess = currentAccessGrants.filter(grant => grant.grantee_type === 'department');
  currentUserAccess = currentAccessGrants.filter(grant => grant.grantee_type === 'user');
  renderProjectDepartmentAccess();
  renderProjectUserAccess();
}


// -------- Rendering --------

function renderProjects(projects) {
  projectsList.innerHTML = '';
  
  projects.forEach(proj => {
    const li = document.createElement('li');
    li.className = 'user-row';
    
    const info = document.createElement('div');
    info.className = 'user-info';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'project-list-title';
    nameSpan.textContent = proj.name;
    
    const statusSpan = document.createElement('span');
    statusSpan.className = 'status';
    statusSpan.textContent = statusLabel(proj.status);

    const meta = document.createElement('div');
    meta.className = 'project-list-meta';
    const accessText = confidentialityLabel(proj.confidentiality_level);
    const departmentText = proj.confidentiality_level === 'department' && proj.department_name
      ? ` · ${proj.department_name}`
      : '';
    const leadText = proj.lead_name ? `Руководитель: ${proj.lead_name}` : '';
    const dateParts = [
      formatDate(proj.start_date) ? `начало: ${formatDate(proj.start_date)}` : '',
      formatDate(proj.due_date) ? `план: ${formatDate(proj.due_date)}` : ''
    ].filter(Boolean).join(' · ');
    const createdText = proj.created_by_name ? `создал: ${proj.created_by_name}` : '';
    meta.textContent = [
      `доступ: ${accessText}${departmentText}`,
      leadText,
      dateParts,
      createdText
    ].filter(Boolean).join(' — ');
    
    info.appendChild(nameSpan);
    info.appendChild(statusSpan);
    info.appendChild(meta);
    
    const actions = document.createElement('div');
    actions.className = 'actions';
    
    const editBtn = document.createElement('button');
    editBtn.textContent = '✏️';
    editBtn.title = 'Редактировать';          
    editBtn.onclick = () => {
      mode = 'edit';
      currentId = proj.project_id;
      currentProjectLeadId = proj.lead_id || null;
      
      // show form
      showForm();
      
      // title + name
      title.textContent = proj.name;
      nameInput.value = proj.name;
      
      // Populate form with DB values (apply defaults for NULLs)
      form.elements['lead_id'].value = proj.lead_id || '';
      form.elements['start_date'].value = proj.start_date ? proj.start_date.slice(0,10) : '';
      form.elements['due_date'].value = proj.due_date ? proj.due_date.slice(0,10) : '';
      form.elements['description'].value = proj.description || '';
      form.elements['status'].value = proj.status || 'active';
      form.elements['confidentiality_level'].value = proj.confidentiality_level || 'public';
      form.elements['department_id'].value = proj.department_id || '';
      updateDepartmentVisibility();
      
      // user (if present in list)
      if (proj.created_by) {
        createdBySelect.value = proj.created_by;
      }

      markFormPristine();
      loadProjectAccess().catch(err => showStatus(err.message, true));
    };
    
    const duplicateBtn = document.createElement('button');
    duplicateBtn.textContent = '📄';
    duplicateBtn.title = 'Дублировать';
    
    duplicateBtn.onclick = () => {
      duplicateProject(proj);
    };
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑';
    deleteBtn.title = 'Удалить';
    deleteBtn.onclick = async () => {
      if (!confirm(`Удалить проект "${proj.name}"?`)) return;
      
      try {
        await deleteProject(proj.project_id);
        showStatus('Проект удалён');
        loadProjects();
      } catch (err) {
        showStatus(err.message, true);
      }
    };
    
    actions.appendChild(editBtn);
    actions.appendChild(duplicateBtn);
    actions.appendChild(deleteBtn);
    
    li.appendChild(info);
    li.appendChild(actions);
    
    projectsList.appendChild(li);
  });
}

function duplicateProject(proj) {
  mode = 'create';
  currentId = null;
  currentProjectLeadId = null;
  
  showForm();
  
  // title + name
  const copyName = proj.name + ' (копия)';
  title.textContent = copyName;
  nameInput.value = copyName;
  
  // Populate form with DB values (apply defaults for NULLs)
  form.elements['lead_id'].value = proj.lead_id || '';
  form.elements['start_date'].value = proj.start_date ? proj.start_date.slice(0,10) : '';
  form.elements['due_date'].value = proj.due_date ? proj.due_date.slice(0,10) : '';
  form.elements['description'].value = proj.description || '';  
  form.elements['status'].value = proj.status || 'active';
  form.elements['confidentiality_level'].value = proj.confidentiality_level || 'public';
  form.elements['department_id'].value = proj.department_id || '';
  updateDepartmentVisibility();
  resetProjectAccessSection();
  
  // IMPORTANT: reset things that must be new
  createdBySelect.value = '';
  leadSelect.value = '';

  markFormPristine();
}      


// -------- Status helper --------

const statusBox = document.querySelector('.status-feedback');

function showStatus(msg, isError = false) {
  statusBox.textContent = msg;
  statusBox.style.color = isError ? '#b00020' : 'darkcyan';
  
  setTimeout(() => {
    statusBox.textContent = '';
  }, 1000);
}


// -------- Reference dropdowns --------

// Refresh user options without losing current selections
async function loadUsers() {
  const prevCreated = createdBySelect.value;
  const prevLead = leadSelect.value;
  
  const res = await fetch('/api/users');
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
  populateAccessUserSelect();
}

async function loadDepartments() {
  const prevDepartment = departmentSelect.value;
  const res = await fetch('/api/departments');
  currentDepartments = await res.json();

  departmentSelect.replaceChildren(new Option('— выбрать отдел —', ''));

  currentDepartments.forEach(department => {
    departmentSelect.add(new Option(department.name, department.department_id));
  });

  departmentSelect.value = prevDepartment;
  populateAccessDepartmentSelect();
  updateDepartmentVisibility();
}

// Refresh reference dropdowns on focus
leadSelect.addEventListener('focus', loadUsers);
leadSelect.addEventListener('change', () => {
  if (!projectDepartmentAccessSection.hidden) {
    renderProjectUserAccess();
  }
});
createdBySelect.addEventListener('focus', loadUsers);
departmentSelect.addEventListener('focus', loadDepartments);
confidentialitySelect.addEventListener('change', () => {
  updateDepartmentVisibility();
  if (!projectDepartmentAccessSection.hidden) {
    renderProjectUserAccess();
  }
});
departmentSelect.addEventListener('change', () => {
  if (!projectDepartmentAccessSection.hidden) {
    renderProjectUserAccess();
  }
});


// -------- Events --------

addInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  
  e.preventDefault();
  
  if (!form.hidden) return;   // prevent double-create
  
  const name = addInput.value.trim();
  if (!name) return;
  
  mode = 'create';
  currentId = null;
  currentProjectLeadId = null;
  
  title.textContent = name;
  nameInput.value = name;
  form.elements['status'].value = 'active';
  form.elements['confidentiality_level'].value = 'public';
  updateDepartmentVisibility();
  resetProjectAccessSection();
  
  showForm();
  
  addInput.value = '';
  markFormPristine();
});

function validateRequiredFields() {
  if (form.elements['confidentiality_level'].value === 'department' && !form.elements['department_id'].value) {
    showStatus('Укажите отдел проекта', true);
    return false;
  }

  return true;
}

saveBtn.addEventListener('click', async () => {
  if (!mode) return;
  
  if (!validateRequiredFields()) return;
  
  const data = normalizeProjectPayload(formDataToObject(form));
  delete data.created_by;
  data.name = title.textContent;
  
  try {
    if (mode === 'create') {
      await createProject(data);
      showStatus('Проект сохранён');
    }
    
    if (mode === 'edit') {
      await updateProject(currentId, data);
      showStatus('Изменения сохранены');
    }
    
    resetForm();
    loadProjects();   // refresh list
  } catch (err) {
    showStatus(err.message, true);
  }
});

clearBtn.addEventListener('click', resetForm);
exitBtn.addEventListener('click', () => {
  if (!hasUnsavedChanges()) {
    resetForm();
    return;
  }

  if (confirm('Выйти без сохранения изменений?')) {
    resetForm();
  }
});

grantDepartmentAccessBtn.addEventListener('click', async () => {
  if (!currentId) return;

  const departmentId = projectAccessDepartmentSelect.value;
  if (!departmentId) {
    showStatus('Выберите отдел', true);
    return;
  }

  try {
    await grantDepartmentAccess(currentId, Number(departmentId), projectAccessExpiresAt.value);
    projectAccessDepartmentSelect.value = '';
    projectAccessExpiresAt.value = '';
    showStatus('Доступ отдела добавлен');
    await loadProjectAccess();
  } catch (err) {
    showStatus(err.message, true);
  }
});

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
    projectUserAccessLevel.value = 'view';
    showStatus('Доступ пользователя добавлен');
    await loadProjectAccess();
  } catch (err) {
    showStatus(err.message, true);
  }
});

/* ------ name: editable ------ */

title.addEventListener('click', () => {
  nameInput.hidden = false;
  title.hidden = true;
  nameInput.focus();
});

nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    nameInput.blur();
  }
});

nameInput.addEventListener('blur', () => {
  const val = nameInput.value.trim();
  if (!val) return;
  
  title.textContent = val;
  title.hidden = false;
  nameInput.hidden = true;
});


// -------- Init --------

async function loadProjects() {
  const projects = await fetchProjects();
  renderProjects(projects);
}

hideForm();
updateDepartmentVisibility();
loadUsers();
loadDepartments();
loadProjects();
