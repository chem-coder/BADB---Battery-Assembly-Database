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

let mode = null; // 'create' | 'edit'
let currentId = null;
let initialFormState = null;

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
  title.textContent = '';
  mode = null;
  currentId = null;
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

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('ru-RU') : '';
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
  const users = await res.json();
  
  createdBySelect.replaceChildren(new Option(
    window.BADB_AUTH?.getAuditUserPlaceholder?.() || '— автоматически —',
    ''
  ));
  leadSelect.innerHTML = '<option value="">— выбрать пользователя —</option>';
  
  users.forEach(u => {
    createdBySelect.add(new Option(u.name, u.user_id));
  });

  users.filter(u => u.active).forEach(u => {
    leadSelect.add(new Option(u.name, u.user_id));
  });
  
  createdBySelect.value = prevCreated;
  leadSelect.value = prevLead;
}

async function loadDepartments() {
  const prevDepartment = departmentSelect.value;
  const res = await fetch('/api/departments');
  const departments = await res.json();

  departmentSelect.replaceChildren(new Option('— выбрать отдел —', ''));

  departments.forEach(department => {
    departmentSelect.add(new Option(department.name, department.department_id));
  });

  departmentSelect.value = prevDepartment;
  updateDepartmentVisibility();
}

// Refresh reference dropdowns on focus
leadSelect.addEventListener('focus', loadUsers);
createdBySelect.addEventListener('focus', loadUsers);
departmentSelect.addEventListener('focus', loadDepartments);
confidentialitySelect.addEventListener('change', () => {
  updateDepartmentVisibility();
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
  
  title.textContent = name;
  nameInput.value = name;
  form.elements['status'].value = 'active';
  form.elements['confidentiality_level'].value = 'public';
  updateDepartmentVisibility();
  
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
