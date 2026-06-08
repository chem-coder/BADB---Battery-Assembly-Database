function getSeparatorIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('sep_id');
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

function formatSeparatorStatus(value) {
  const map = {
    available: 'в наличии',
    used: 'израсходован',
    scrap: 'списан'
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

function formatMeasurement(value, units = '') {
  if (!hasMeaningfulText(value)) return '—';
  return [value, units].filter(hasMeaningfulText).join(' ');
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
                <td class="report_number">${escapeHtml(file.separator_file_id ?? '—')}</td>
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

function renderAuditSection(separator) {
  return `
    <section class="report_section">
      <h2>Метаданные</h2>
      ${renderFieldGrid([
        renderRow('Создал', separator.created_by_name || '—'),
        renderRow('Создан', formatDateTime(separator.created_at), { numeric: true }),
        renderRow('Обновил', separator.updated_by_name || '—'),
        renderRow('Обновлён', formatDateTime(separator.updated_at), { numeric: true })
      ])}
    </section>
  `;
}

function renderReport(report) {
  const separator = report?.separator || {};
  const files = Array.isArray(report?.files) ? report.files : [];
  const root = document.getElementById('reportRoot');
  const title = separator.name || 'Сепаратор';

  document.title = `Печатный отчёт по сепаратору #${separator.sep_id || ''}`.trim();

  root.innerHTML = `
    <header class="report_header">
      <div>
        <p class="report_title">Печатный отчёт по сепаратору</p>
        <h1 class="report_subtitle">#${escapeHtml(separator.sep_id ?? '—')} | ${escapeHtml(title)}</h1>
      </div>
      <div class="report_status_box">
        <span class="report_status_label">Статус</span>
        <span class="report_status_value">${escapeHtml(formatSeparatorStatus(separator.status))}</span>
      </div>
    </header>

    <div class="report_meta">
      ${renderRow('ID', separator.sep_id ?? '—', { numeric: true })}
      ${renderRow('Структура', separator.structure_name || '—')}
      ${renderRow('Файлы', files.length, { numeric: true })}
      ${renderRow('Создал', separator.created_by_name || '—')}
      ${renderRow('Создан', formatDateTime(separator.created_at), { numeric: true })}
      ${renderRow('Обновлён', formatDateTime(separator.updated_at), { numeric: true })}
    </div>

    <section class="report_section">
      <h2>Описание</h2>
      ${renderFieldGrid([
        renderRow('Поставщик', separator.supplier || '—'),
        renderRow('Марка / модель', separator.brand || '—'),
        renderRow('Партия', separator.batch || '—'),
        renderRow('Структура', separator.structure_name || '—'),
        renderRow('Комментарии', hasMeaningfulText(separator.comments) ? separator.comments : '—', { wide: true, text: true })
      ])}
    </section>

    <section class="report_section">
      <h2>Паспортные характеристики</h2>
      ${renderFieldGrid([
        renderRow('Возд. проницаемость', formatMeasurement(separator.air_perm, separator.air_perm_units), { numeric: true }),
        renderRow('Толщина', formatMeasurement(separator.thickness_um, 'мкм'), { numeric: true }),
        renderRow('Пористость', formatMeasurement(separator.porosity, '%'), { numeric: true }),
        renderRow('Дата списания', formatDate(separator.depleted_at), { numeric: true })
      ])}
    </section>

    ${renderFilesSection(files)}
    ${renderAuditSection(separator)}
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

async function loadSeparatorReport() {
  const separatorId = getSeparatorIdFromQuery();
  const root = document.getElementById('reportRoot');

  if (!separatorId) {
    root.innerHTML = '<p class="muted">Не передан sep_id.</p>';
    return;
  }

  try {
    const res = await fetch(
      `/api/separators/${separatorId}/report`,
      { headers: getAuthHeader() }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Не удалось загрузить отчёт по сепаратору');
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
        window.location.href = '/reference/separators.html';
        return;
      }

      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      window.location.href = '/reference/separators.html';
    }
  }, 50);
});

loadSeparatorReport();
