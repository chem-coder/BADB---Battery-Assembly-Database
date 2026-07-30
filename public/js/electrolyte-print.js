function getElectrolyteIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('electrolyte_id');
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

function formatDateTime(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString('ru-RU');
}

function formatElectrolyteType(value) {
  const map = {
    liquid: 'Жидкий',
    solid: 'Твёрдый',
    gel: 'Гелевый'
  };

  return map[value] || value || '—';
}

function formatElectrolyteStatus(value) {
  const map = {
    active: 'активный',
    inactive: 'не используется',
    archived: 'архив'
  };

  return map[value] || value || '—';
}

function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value)) return '—';
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} КБ`;
  return `${(value / (1024 * 1024)).toFixed(2)} МБ`;
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

function renderFilesSection(files) {
  const rows = Array.isArray(files) ? files : [];

  return `
    <section class="report_section">
      <h2>Файлы</h2>
      ${rows.length === 0 ? '<p class="muted">Файлы не прикреплены.</p>' : `
        <table class="report_table">
          <thead>
            <tr>
              <th class="report_number">ID</th>
              <th>Имя файла</th>
              <th>MIME-тип</th>
              <th class="report_number">Размер</th>
              <th class="report_number">Загружен</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(file => `
              <tr>
                <td class="report_number">${escapeHtml(file.electrolyte_file_id ?? '—')}</td>
                <td>${escapeHtml(file.file_name || '—')}</td>
                <td>${escapeHtml(file.mime_type || '—')}</td>
                <td class="report_number">${escapeHtml(formatFileSize(file.file_size_bytes))}</td>
                <td class="report_number">${escapeHtml(formatDateTime(file.uploaded_at))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </section>
  `;
}

function renderAuditSection(electrolyte) {
  return `
    <section class="report_section">
      <h2>Метаданные</h2>
      ${renderFieldGrid([
        renderRow('Создал', electrolyte.created_by_name || '—'),
        renderRow('Создан', formatDateTime(electrolyte.created_at), { numeric: true }),
        renderRow('Обновил', electrolyte.updated_by_name || '—'),
        renderRow('Обновлён', formatDateTime(electrolyte.updated_at), { numeric: true })
      ])}
    </section>
  `;
}

function renderReport(report) {
  const electrolyte = report?.electrolyte || {};
  const files = Array.isArray(report?.files) ? report.files : [];
  const root = document.getElementById('reportRoot');
  const title = electrolyte.name || 'Электролит';

  document.title = `Печатный отчёт по электролиту #${electrolyte.electrolyte_id || ''}`.trim();

  root.innerHTML = `
    <header class="report_header">
      <div>
        <p class="report_title">Печатный отчёт по электролиту</p>
        <h1 class="report_subtitle">#${escapeHtml(electrolyte.electrolyte_id ?? '—')} | ${escapeHtml(title)}</h1>
      </div>
      <div class="report_status_box">
        <span class="report_status_label">Статус</span>
        <span class="report_status_value">${escapeHtml(formatElectrolyteStatus(electrolyte.status))}</span>
      </div>
    </header>

    <div class="report_meta">
      ${renderRow('ID', electrolyte.electrolyte_id ?? '—', { numeric: true })}
      ${renderRow('Тип', formatElectrolyteType(electrolyte.electrolyte_type))}
      ${renderRow('Файлы', files.length, { numeric: true })}
      ${renderRow('Создал', electrolyte.created_by_name || '—')}
      ${renderRow('Создан', formatDateTime(electrolyte.created_at), { numeric: true })}
      ${renderRow('Обновлён', formatDateTime(electrolyte.updated_at), { numeric: true })}
    </div>

    <section class="report_section">
      <h2>Состав</h2>
      ${renderFieldGrid([
        renderRow('Растворители', electrolyte.solvent_system || '—'),
        renderRow('Соли', electrolyte.salts || '—'),
        renderRow('Концентрация', electrolyte.concentration || '—'),
        renderRow('Добавки', electrolyte.additives || '—'),
        renderRow('Примечания', hasMeaningfulText(electrolyte.notes) ? electrolyte.notes : '—', { wide: true, text: true })
      ])}
    </section>

    ${renderFilesSection(files)}
    ${renderAuditSection(electrolyte)}
  `;
}

function getAuthHeader() {
  try {
    const token = localStorage.getItem('badb_auth_token') || sessionStorage.getItem('badb_auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function loadElectrolyteReport() {
  const electrolyteId = getElectrolyteIdFromQuery();
  const root = document.getElementById('reportRoot');

  if (!electrolyteId) {
    root.innerHTML = '<p class="muted">Не передан electrolyte_id.</p>';
    return;
  }

  try {
    const res = await fetch(
      `/api/electrolytes/${electrolyteId}/report`,
      { headers: getAuthHeader() }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Не удалось загрузить отчёт по электролиту');
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
        window.location.href = '/reference/electrolytes.html';
        return;
      }

      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      window.location.href = '/reference/electrolytes.html';
    }
  }, 50);
});

loadElectrolyteReport();
