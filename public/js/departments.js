const departmentsTableBody = document.getElementById('departmentsTableBody');
const addDepartmentBtn = document.getElementById('addDepartmentBtn');
const statusBox = document.querySelector('.status-feedback');

let departments = [];
let users = [];
let editingKey = null;
let isAdmin = false;

function showStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.style.color = isError ? '#b00020' : 'darkcyan';

  if (message) {
    setTimeout(() => {
      statusBox.textContent = '';
    }, 2500);
  }
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
  if (!department.head_user_id) return '— без руководителя —';
  return department.head_name || `Пользователь #${department.head_user_id}`;
}

function buildHeadSelect(selectedId) {
  const select = document.createElement('select');
  select.name = 'head_user_id';
  select.add(new Option('— без руководителя —', ''));

  activeUsersForSelect(selectedId).forEach(user => {
    const label = user.active ? user.name : `${user.name} (неактивен)`;
    select.add(new Option(label, user.user_id));
  });

  select.value = selectedId == null ? '' : String(selectedId);
  return select;
}

function renderReadRow(department) {
  const tr = document.createElement('tr');

  const idCell = document.createElement('td');
  idCell.textContent = department.department_id;

  const nameCell = document.createElement('td');
  nameCell.textContent = department.name;

  const headCell = document.createElement('td');
  headCell.textContent = headLabel(department);

  const actionsCell = document.createElement('td');
  actionsCell.className = 'actions';

  if (isAdmin) {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = '✏️';
    editBtn.title = 'Редактировать отдел';
    editBtn.addEventListener('click', () => startEditing(department.department_id));
    actionsCell.appendChild(editBtn);
  } else {
    actionsCell.textContent = '—';
  }

  tr.append(idCell, nameCell, headCell, actionsCell);
  return tr;
}

function renderEditRow(department) {
  const tr = document.createElement('tr');
  tr.className = 'edit-row';

  const idCell = document.createElement('td');
  idCell.textContent = department.department_id || 'новый';

  const nameCell = document.createElement('td');
  const nameInput = document.createElement('input');
  nameInput.name = 'name';
  nameInput.required = true;
  nameInput.value = department.name || '';
  nameInput.placeholder = 'Название отдела';
  nameCell.appendChild(nameInput);

  const headCell = document.createElement('td');
  headCell.appendChild(buildHeadSelect(department.head_user_id));

  const actionsCell = document.createElement('td');
  actionsCell.className = 'actions departments-edit-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Сохранить';
  saveBtn.addEventListener('click', () => saveDepartmentRow(department, tr));

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Отмена';
  cancelBtn.addEventListener('click', cancelEditing);

  actionsCell.append(saveBtn, cancelBtn);
  tr.append(idCell, nameCell, headCell, actionsCell);

  setTimeout(() => nameInput.focus(), 0);
  return tr;
}

function renderDepartments() {
  departmentsTableBody.innerHTML = '';

  departments.forEach(department => {
    const row = editingKey === String(department.department_id)
      ? renderEditRow(department)
      : renderReadRow(department);

    departmentsTableBody.appendChild(row);
  });

  if (editingKey === 'new') {
    departmentsTableBody.appendChild(renderEditRow({
      department_id: '',
      name: '',
      head_user_id: null
    }));
  }
}

function hasOpenEditor() {
  return editingKey !== null;
}

function startEditing(departmentId) {
  if (hasOpenEditor() && !confirm('Закрыть текущую строку без сохранения?')) return;
  editingKey = String(departmentId);
  renderDepartments();
}

function startCreating() {
  if (hasOpenEditor() && !confirm('Закрыть текущую строку без сохранения?')) return;
  editingKey = 'new';
  renderDepartments();
}

function cancelEditing() {
  editingKey = null;
  renderDepartments();
}

async function saveDepartmentRow(department, row) {
  const name = row.querySelector('input[name="name"]').value.trim();
  const headUserId = row.querySelector('select[name="head_user_id"]').value || null;

  if (!name) {
    showStatus('Название отдела обязательно', true);
    return;
  }

  const payload = {
    name,
    head_user_id: headUserId
  };

  try {
    if (editingKey === 'new') {
      await createDepartment(payload);
      showStatus('Отдел создан');
    } else {
      await updateDepartment(department.department_id, payload);
      showStatus('Отдел обновлён');
    }

    editingKey = null;
    await loadData();
  } catch (err) {
    showStatus(err.message, true);
  }
}

async function loadData() {
  [departments, users] = await Promise.all([
    fetchDepartments(),
    fetchUsers()
  ]);

  renderDepartments();
}

async function initDepartmentsPage() {
  const currentUser = await window.BADB_AUTH?.isReady?.();
  isAdmin = currentUser?.role === 'admin';
  addDepartmentBtn.hidden = !isAdmin;

  if (!isAdmin) {
    showStatus('Редактирование отделов доступно только администратору.');
  }

  addDepartmentBtn.addEventListener('click', startCreating);
  await loadData();
}

document.addEventListener('DOMContentLoaded', () => {
  initDepartmentsPage().catch(err => {
    console.error(err);
    showStatus(err.message || 'Ошибка загрузки страницы', true);
  });
});
