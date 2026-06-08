function getProjectIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('project_id');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hasMeaningfulText(value) {
  return value != null && String(value).trim() !== '';
}

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString('ru-RU');
}

function formatDateTime(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString('ru-RU');
}

function formatProjectStatus(value) {
  const map = {
    active: 'активный',
    paused: 'приостановлен',
    completed: 'завершён',
    archived: 'архивирован'
  };

  return map[value] || value || '—';
}

function formatVisibility(value) {
  const map = {
    public: 'открытый',
    department: 'ограниченный',
    confidential: 'ограниченный'
  };

  return map[value] || value || '—';
}

function formatTapeRole(value) {
  const map = {
    cathode: 'катод',
    anode: 'анод'
  };

  return map[value] || value || '—';
}

function formatTapeAvailability(value) {
  const map = {
    in_dry_box: 'в сухом боксе',
    out_of_dry_box: 'вне сухого бокса',
    used: 'использована'
  };

  return map[value] || value || '—';
}

function formatFormFactor(value) {
  const map = {
    coin: 'Монеточный',
    pouch: 'Пакетный',
    prism: 'Призматическая',
    cylindrical: 'Цилиндрический'
  };

  return map[value] || value || '—';
}

function formatBatchTarget(row) {
  return [
    formatFormFactor(row?.target_form_factor),
    row?.target_config_code || ''
  ].filter(value => value && value !== '—').join(' · ') || '—';
}

function formatBatchGeometry(row) {
  if (!row?.shape) return '—';

  if (row.shape === 'circle') {
    return row.diameter_mm != null
      ? `круг ${row.diameter_mm} мм`
      : 'круг';
  }

  if (row.shape === 'rectangle') {
    const size = [
      row.length_mm != null ? `${row.length_mm}` : '',
      row.width_mm != null ? `${row.width_mm}` : ''
    ].filter(Boolean).join(' × ');

    return size ? `прямоуг. ${size} мм` : 'прямоуг.';
  }

  return row.shape;
}

function formatBatteryStatus(value) {
  const map = {
    draft: 'черновик',
    assembled: 'собран',
    completed: 'завершён',
    disassembled: 'разобран',
    archived: 'архив'
  };

  return map[value] || value || '—';
}

function formatProjectAccess(value) {
  const map = {
    view: 'просмотр',
    edit: 'редактирование',
    admin: 'администратор проекта'
  };

  return map[value] || value || 'просмотр';
}

function renderRow(label, value, options = {}) {
  const fieldClass = options.wide ? ' report_field_wide' : '';
  const valueClass = [
    'report_value',
    options.numeric ? 'report_number' : '',
    options.text ? 'report_text_value' : ''
  ].filter(Boolean).join(' ');

  return `
    <div class="report_field${fieldClass}">
      <span class="report_label">${escapeHtml(label)}</span>
      <span class="${valueClass}">${escapeHtml(value ?? '—')}</span>
    </div>
  `;
}

function renderFieldGrid(rows) {
  return `<div class="report_field_grid">${rows.join('')}</div>`;
}

function renderEffectiveAccessSection(rows) {
  const users = Array.isArray(rows) ? rows : [];

  return `
    <section class="report_section">
      <h2>Доступ к проекту</h2>
      ${users.length === 0 ? '<p class="muted">Пользователи с доступом не найдены.</p>' : `
        <table class="report_table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Отдел</th>
              <th>Уровень доступа</th>
              <th>Источник</th>
            </tr>
          </thead>
          <tbody>
            ${users.map((row) => `
              <tr>
                <td>${escapeHtml(row.user_name || `#${row.user_id}`)}</td>
                <td>${escapeHtml(row.department_name || '—')}</td>
                <td>${escapeHtml(formatProjectAccess(row.access_level))}</td>
                <td>${escapeHtml(row.access_sources || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </section>
  `;
}

function renderParticipantsSection(rows) {
  const participants = Array.isArray(rows) ? rows : [];

  return `
    <section class="report_section">
      <h2>Участники проекта</h2>
      ${participants.length === 0 ? '<p class="muted">Участники не добавлены.</p>' : `
        <table class="report_table">
          <thead>
            <tr>
              <th class="report_number">№</th>
              <th>ФИО</th>
              <th>Роль в команде (функционал)</th>
            </tr>
          </thead>
          <tbody>
            ${participants.map((row, index) => `
              <tr>
                <td class="report_number">${escapeHtml(index + 1)}</td>
                <td>${escapeHtml(row.user_name || `#${row.user_id}`)}</td>
                <td>${escapeHtml(row.role_in_team || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </section>
  `;
}

function renderDownstreamSummarySection(counts = {}) {
  return `
    <section class="report_section">
      <h2>Связанные записи: сводка</h2>
      ${renderFieldGrid([
        renderRow('Ленты', counts.tapes ?? 0, { numeric: true }),
        renderRow('Партии электродов', counts.electrode_batches ?? 0, { numeric: true }),
        renderRow('Аккумуляторы', counts.batteries ?? 0, { numeric: true })
      ])}
    </section>
  `;
}

function renderConnectedTapesSection(rows) {
  const tapes = Array.isArray(rows) ? rows : [];

  return `
    <section class="report_section">
      <h2>Связанные ленты</h2>
      ${tapes.length === 0 ? '<p class="muted">Связанные ленты не найдены.</p>' : `
        <table class="report_table">
          <thead>
            <tr>
              <th class="report_number">ID</th>
              <th>Название</th>
              <th>Рецепт</th>
              <th>Роль</th>
              <th>Статус</th>
              <th>Сухой бокс</th>
              <th class="report_number">Создана</th>
            </tr>
          </thead>
          <tbody>
            ${tapes.map(row => `
              <tr>
                <td class="report_number">${escapeHtml(row.tape_id ?? '—')}</td>
                <td>${escapeHtml(row.name || '—')}</td>
                <td>${escapeHtml(row.recipe_name || '—')}</td>
                <td>${escapeHtml(formatTapeRole(row.tape_role))}</td>
                <td>${escapeHtml(row.status || '—')}</td>
                <td>${escapeHtml(formatTapeAvailability(row.availability_status))}</td>
                <td class="report_number">${escapeHtml(formatDate(row.created_at))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </section>
  `;
}

function renderConnectedElectrodeBatchesSection(rows) {
  const batches = Array.isArray(rows) ? rows : [];

  return `
    <section class="report_section">
      <h2>Связанные партии электродов</h2>
      ${batches.length === 0 ? '<p class="muted">Связанные партии электродов не найдены.</p>' : `
        <table class="report_table">
          <thead>
            <tr>
              <th class="report_number">ID</th>
              <th>Лента</th>
              <th>Роль</th>
              <th>Цель</th>
              <th>Геометрия</th>
              <th class="report_number">Электродов</th>
              <th class="report_number">Создана</th>
            </tr>
          </thead>
          <tbody>
            ${batches.map(row => `
              <tr>
                <td class="report_number">${escapeHtml(row.cut_batch_id ?? '—')}</td>
                <td>${escapeHtml(row.tape_name ? `#${row.tape_id}: ${row.tape_name}` : `#${row.tape_id || '—'}`)}</td>
                <td>${escapeHtml(formatTapeRole(row.tape_role))}</td>
                <td>${escapeHtml(formatBatchTarget(row))}</td>
                <td>${escapeHtml(formatBatchGeometry(row))}</td>
                <td class="report_number">${escapeHtml(row.electrode_count ?? 0)}</td>
                <td class="report_number">${escapeHtml(formatDate(row.created_at))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </section>
  `;
}

function renderConnectedBatteriesSection(rows) {
  const batteries = Array.isArray(rows) ? rows : [];

  return `
    <section class="report_section">
      <h2>Связанные аккумуляторы</h2>
      ${batteries.length === 0 ? '<p class="muted">Связанные аккумуляторы не найдены.</p>' : `
        <table class="report_table">
          <thead>
            <tr>
              <th class="report_number">ID</th>
              <th>Форм-фактор</th>
              <th>Статус</th>
              <th>Примечание</th>
              <th>Создал</th>
              <th class="report_number">Создан</th>
            </tr>
          </thead>
          <tbody>
            ${batteries.map(row => `
              <tr>
                <td class="report_number">${escapeHtml(row.battery_id ?? '—')}</td>
                <td>${escapeHtml(formatFormFactor(row.form_factor))}</td>
                <td>${escapeHtml(formatBatteryStatus(row.status))}</td>
                <td>${escapeHtml(row.notes || '—')}</td>
                <td>${escapeHtml(row.created_by_name || '—')}</td>
                <td class="report_number">${escapeHtml(formatDate(row.created_at))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </section>
  `;
}

function renderReport(report) {
  const project = report?.project || {};
  const participants = report?.participants || [];
  const effectiveUsers = report?.access?.effective_users || [];
  const downstream = report?.downstream || {};
  const counts = report?.downstream_counts || {};
  const root = document.getElementById('reportRoot');
  const title = project.name || 'Проект';
  document.title = `Печатный отчёт по проекту #${project.project_id || ''}`.trim();

  root.innerHTML = `
    <header class="report_header">
      <div>
        <p class="report_title">Печатный отчёт по проекту</p>
        <h1 class="report_subtitle">#${escapeHtml(project.project_id ?? '—')} | ${escapeHtml(title)}</h1>
      </div>
      <div class="report_status_box">
        <span class="report_status_label">Статус</span>
        <span class="report_status_value">${escapeHtml(formatProjectStatus(project.status))}</span>
      </div>
    </header>

    <div class="report_meta">
      ${renderRow('ID', project.project_id ?? '—', { numeric: true })}
      ${renderRow('Тип проекта', formatVisibility(project.confidentiality_level))}
      ${renderRow('Руководитель', project.lead_name || '—')}
      ${renderRow('Создал', project.created_by_name || '—')}
      ${renderRow('Создан', formatDateTime(project.created_at))}
    </div>

    <section class="report_section">
      <h2>Сведения</h2>
      ${renderFieldGrid([
        renderRow('Название', project.name || '—'),
        renderRow('Статус', formatProjectStatus(project.status)),
        renderRow('Дата начала', formatDate(project.start_date)),
        renderRow('Плановая дата', formatDate(project.due_date)),
        renderRow(
          'Описание',
          hasMeaningfulText(project.description) ? project.description : '—',
          { wide: true, text: true }
        )
      ])}
    </section>

    ${renderParticipantsSection(participants)}
    ${renderEffectiveAccessSection(effectiveUsers)}
    ${renderDownstreamSummarySection(counts)}
    ${renderConnectedTapesSection(downstream.tapes)}
    ${renderConnectedElectrodeBatchesSection(downstream.electrode_batches)}
    ${renderConnectedBatteriesSection(downstream.batteries)}
  `;
}

function getAuthHeader() {
  try {
    const token = localStorage.getItem('badb_auth_token') || sessionStorage.getItem('badb_auth_token');
    return token && token !== 'bypass' ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function loadProjectReport() {
  const projectId = getProjectIdFromQuery();
  const root = document.getElementById('reportRoot');

  if (!projectId) {
    root.innerHTML = '<p class="muted">Не передан project_id.</p>';
    return;
  }

  try {
    const res = await fetch(
      `/api/projects/${projectId}/report`,
      { headers: getAuthHeader() }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Не удалось загрузить отчёт по проекту');
    }

    const report = await res.json();
    renderReport(report);
  } catch (err) {
    console.error(err);
    root.innerHTML = `<p class="muted">${escapeHtml(err.message || 'Ошибка загрузки отчёта')}</p>`;
  }
}

document.getElementById('printReportBtn').addEventListener('click', () => {
  window.print();
});

document.getElementById('closeReportBtn').addEventListener('click', () => {
  window.close();

  setTimeout(() => {
    if (!window.closed) {
      if (window.opener) {
        window.location.href = '/reference/projects.html';
        return;
      }

      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      window.location.href = '/reference/projects.html';
    }
  }, 50);
});

loadProjectReport();
