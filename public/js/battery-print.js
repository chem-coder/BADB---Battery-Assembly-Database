function getBatteryIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('battery_id');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString('ru-RU');
}

function formatFormFactor(value) {
  if (value === 'coin') return 'Монеточный';
  if (value === 'pouch') return 'Пакетный';
  if (value === 'cylindrical') return 'Цилиндрический';
  return value || '—';
}

function formatStatus(value) {
  if (!value) return 'В сборке';
  if (value === 'assembled') return 'Собран';
  if (value === 'testing') return 'На тестировании';
  if (value === 'completed') return 'Завершён';
  if (value === 'failed') return 'Брак';
  if (value === 'disassembled') return 'Разобран';
  return value;
}

function formatCoinMode(value) {
  if (value === 'half_cell') return 'Полуячейка против Li';
  if (value === 'full_cell') return 'Полный элемент';
  return value || '—';
}

function formatHalfCellType(value) {
  if (value === 'cathode_vs_li') return 'Катодный материал || Li/Li+';
  if (value === 'anode_vs_li') return 'Анодный материал || Li/Li+';
  return value || '—';
}

function formatBatchGeometry(batch) {
  if (!batch) return '—';
  if (batch.shape === 'circle' && batch.diameter_mm != null) {
    return `${batch.diameter_mm} mm`;
  }
  if (batch.length_mm != null && batch.width_mm != null) {
    return `${batch.length_mm}×${batch.width_mm} mm`;
  }
  if (batch.length_mm != null) return `${batch.length_mm} mm`;
  if (batch.width_mm != null) return `${batch.width_mm} mm`;
  return '—';
}

function formatBatchTarget(batch) {
  if (!batch) return '—';

  if (batch.target_config_code === 'other' && batch.target_config_other) {
    return `${batch.target_form_factor || ''} ${batch.target_config_other}`.trim();
  }

  return [batch.target_form_factor, batch.target_config_code].filter(Boolean).join(' ') || '—';
}

function renderRow(label, value) {
  return `<div class="report_row"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value ?? '—')}</div>`;
}

function formatCapacity(value, digits = 3) {
  const num = Number(value);
  return Number.isFinite(num) ? `${num.toFixed(digits)} мАч` : '—';
}

function formatRatio(value, digits = 3) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(digits) : '—';
}

function renderDualMetric(label, factualValue, theoreticalValue) {
  return `
    <div class="report_dual_metric">
      <div class="report_dual_label">${escapeHtml(label)}</div>
      <div class="report_dual_values">
        <div class="report_dual_col">
          <span class="report_dual_col_label fact">По факту</span>
          <div class="report_dual_fact">${escapeHtml(factualValue)}</div>
        </div>
        <div class="report_dual_col">
          <span class="report_dual_col_label theor">Теоретически</span>
          <div class="report_dual_theor">${escapeHtml(theoreticalValue)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderConfigSection(report) {
  const formFactor = report?.battery?.form_factor;

  if (formFactor === 'coin') {
    const config = report.coin_config || {};
    return `
      <section class="report_section">
        <h2>Конфигурация элемента</h2>
        ${renderRow('Тип элемента', formatCoinMode(config.coin_cell_mode))}
        ${renderRow('Размер монетки', config.coin_size_code || '—')}
        ${renderRow('Тип полуячейки', formatHalfCellType(config.half_cell_type))}
        ${renderRow('Li-фольга', config.li_foil_notes || '—')}
        ${renderRow('Схема', config.coin_layout || '—')}
        ${renderRow('Толщина спэйсера', config.spacer_thickness_mm != null ? `${config.spacer_thickness_mm} мм` : '—')}
        ${renderRow('Количество спэйсеров', config.spacer_count ?? '—')}
        ${renderRow('Заметки по спэйсеру', config.spacer_notes || '—')}
      </section>
    `;
  }

  if (formFactor === 'pouch') {
    const config = report.pouch_config || {};
    const pouchSize = config.pouch_case_size_code === 'other'
      ? config.pouch_case_size_other || 'other'
      : config.pouch_case_size_code || '—';
    return `
      <section class="report_section">
        <h2>Конфигурация элемента</h2>
        ${renderRow('Размер', pouchSize)}
        ${renderRow('Заметки', config.pouch_notes || '—')}
      </section>
    `;
  }

  if (formFactor === 'cylindrical') {
    const config = report.cyl_config || {};
    return `
      <section class="report_section">
        <h2>Конфигурация элемента</h2>
        ${renderRow('Размер цилиндра', config.cyl_size_code || '—')}
        ${renderRow('Заметки', config.cyl_notes || '—')}
      </section>
    `;
  }

  return '';
}

function renderSourcesSection(report) {
  const sources = Array.isArray(report.electrode_sources) ? report.electrode_sources : [];

  if (sources.length === 0) {
    return `
      <section class="report_section">
        <h2>Источники электродов</h2>
        <p class="muted">Источники электродов не сохранены.</p>
      </section>
    `;
  }

  const blocks = sources.map(source => {
    const roleLabel = source.role === 'cathode' ? 'Катод' : 'Анод';
    const tapeLabel = source.tape_id
      ? `#${source.tape_id} | ${source.tape_name || '—'}`
      : '—';
    const batchLabel = source.cut_batch_id
      ? `#${source.cut_batch_id} | ${formatBatchTarget(source)} | ${formatBatchGeometry(source)}`
      : '—';

    return `
      <div class="report_subsection">
        <h3>${escapeHtml(roleLabel)}</h3>
        ${renderRow('Лента', tapeLabel)}
        ${renderRow('Проект ленты', source.tape_project_name || '—')}
        ${renderRow('Рецепт', source.tape_recipe_name || '—')}
        ${renderRow('Партия вырезанных электродов', batchLabel)}
        ${renderRow('Заметки', source.source_notes || '—')}
      </div>
    `;
  }).join('');

  return `
    <section class="report_section">
      <h2>Источники электродов</h2>
      ${blocks}
    </section>
  `;
}

function renderStackSection(report) {
  const rows = Array.isArray(report.electrodes) ? report.electrodes : [];

  return `
    <section class="report_section">
      <h2>Стек электродов</h2>
      ${rows.length === 0 ? '<p class="muted">Стек не сохранён.</p>' : `
        <table class="report_table">
          <thead>
            <tr>
              <th>Позиция</th>
              <th>ID электрода</th>
              <th>Роль</th>
              <th>m, g</th>
              <th>ID партии</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td>${escapeHtml(row.position_index)}</td>
                <td>${escapeHtml(row.electrode_id)}</td>
                <td>${escapeHtml(row.role === 'cathode' ? 'Катод' : row.role === 'anode' ? 'Анод' : row.role)}</td>
                <td>${escapeHtml(row.electrode_mass_g ?? '—')}</td>
                <td>${escapeHtml(row.cut_batch_id ?? '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </section>
  `;
}

function renderAssemblySection(report) {
  const separator = report.separator || {};
  const electrolyte = report.electrolyte || {};
  const formFactor = report?.battery?.form_factor;
  const activeConfig =
    formFactor === 'coin' ? (report.coin_config || {})
    : formFactor === 'pouch' ? (report.pouch_config || {})
    : formFactor === 'cylindrical' ? (report.cyl_config || {})
    : {};

  const spacerFields = formFactor === 'coin' ? `
        ${renderRow('Толщина спэйсера', activeConfig.spacer_thickness_mm != null ? `${activeConfig.spacer_thickness_mm} мм` : '—')}
        ${renderRow('Количество спэйсеров', activeConfig.spacer_count ?? '—')}
        ${renderRow('Заметки по спэйсеру', activeConfig.spacer_notes || '—')}
  ` : '';

  return `
    <section class="report_section">
      <h2>Параметры сборки</h2>
      ${renderRow('Сепаратор', separator.separator_id ? `#${separator.separator_id} | ${separator.separator_name || '—'}` : '—')}
      ${renderRow('Заметки по сепаратору', separator.separator_notes || '—')}
      ${renderRow('Электролит', electrolyte.electrolyte_id ? `#${electrolyte.electrolyte_id} | ${electrolyte.electrolyte_name || '—'}` : '—')}
      ${renderRow('Заметки по электролиту', electrolyte.electrolyte_notes || '—')}
      ${renderRow('Общий объём электролита', electrolyte.electrolyte_total_ul != null ? `${electrolyte.electrolyte_total_ul} мкл` : '—')}
      ${renderRow('Схема сепаратора/электролита', activeConfig.coin_layout || '—')}
      ${spacerFields}
    </section>
  `;
}

function renderQcSection(report) {
  const qc = report.qc || {};
  return `
    <section class="report_section">
      <h2>Выходной контроль</h2>
      ${renderRow('НРЦ', qc.ocv_v != null ? `${qc.ocv_v} В` : '—')}
      ${renderRow('ESR', qc.esr_mohm != null ? `${qc.esr_mohm} мОм` : '—')}
      ${renderRow('Статус', formatStatus(report?.battery?.status))}
      ${renderRow('Заметки', qc.qc_notes || '—')}
    </section>
  `;
}

function renderElectrochemSection(report) {
  const entries = Array.isArray(report.electrochem) ? report.electrochem : [];

  return `
    <section class="report_section">
      <h2>Электрохимия</h2>
      ${entries.length === 0 ? '<p class="muted">Записей нет.</p>' : `
        <table class="report_table">
          <thead>
            <tr>
              <th>Файл</th>
              <th>Заметки</th>
              <th>Загружен</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(entry => `
              <tr>
                <td>${entry.file_link ? `<a href="${escapeHtml(entry.file_link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(entry.file_name || entry.file_link)}</a>` : escapeHtml(entry.file_name || '—')}</td>
                <td>${escapeHtml(entry.electrochem_notes || '—')}</td>
                <td>${escapeHtml(formatDateTime(entry.uploaded_at))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </section>
  `;
}

function renderCapacitySection(report) {
  const summary = report?.capacity_summary;

  if (!summary) return '';

  const hasAnyValue =
    Number.isFinite(Number(summary.cathode_capacity_theoretical_mAh)) ||
    Number.isFinite(Number(summary.cathode_capacity_actual_mAh)) ||
    Number.isFinite(Number(summary.anode_capacity_theoretical_mAh)) ||
    Number.isFinite(Number(summary.anode_capacity_actual_mAh));

  if (!hasAnyValue) {
    return `
      <section class="report_section">
        <h2>Электрохимическая сводка</h2>
        <p class="muted">Недостаточно данных для расчёта ёмкости элемента.</p>
      </section>
    `;
  }

  return `
    <section class="report_section">
      <h2>Электрохимическая сводка</h2>
      <div class="report_dual_grid">
        ${renderDualMetric(
          'Σ катодов',
          formatCapacity(summary.cathode_capacity_actual_mAh),
          formatCapacity(summary.cathode_capacity_theoretical_mAh)
        )}
        ${renderDualMetric(
          'Σ анодов',
          formatCapacity(summary.anode_capacity_actual_mAh),
          formatCapacity(summary.anode_capacity_theoretical_mAh)
        )}
        ${renderDualMetric(
          'Лимитирующая ёмкость',
          formatCapacity(summary.limiting_capacity_actual_mAh),
          formatCapacity(summary.limiting_capacity_theoretical_mAh)
        )}
        ${renderDualMetric(
          'N/P',
          formatRatio(summary.np_actual),
          formatRatio(summary.np_theoretical)
        )}
      </div>
    </section>
  `;
}

function renderReport(report) {
  const battery = report.battery || {};
  const root = document.getElementById('reportRoot');

  root.innerHTML = `
    <h1 class="report_title">Протокол сборки</h1>
    <h2 class="report_subtitle">Аккумулятор #${escapeHtml(battery.battery_id || '—')}</h2>
    <div class="report_meta">
      <div class="report_row"><strong>Проект:</strong> ${escapeHtml(battery.project_name || '—')}</div>
      <div class="report_row"><strong>Форм-фактор:</strong> ${escapeHtml(formatFormFactor(battery.form_factor))}</div>
      <div class="report_row"><strong>Оператор:</strong> ${escapeHtml(battery.created_by_name || '—')}</div>
      <div class="report_row"><strong>Статус:</strong> ${escapeHtml(formatStatus(battery.status))}</div>
      <div class="report_row"><strong>Создан:</strong> ${escapeHtml(formatDateTime(battery.created_at))}</div>
      <div class="report_row"><strong>Обновлён:</strong> ${escapeHtml(formatDateTime(battery.updated_at))}</div>
    </div>

    <section class="report_section">
      <h2>Общая информация</h2>
      ${renderRow('Заметки', battery.battery_notes || '—')}
    </section>

    ${renderConfigSection(report)}
    ${renderSourcesSection(report)}
    ${renderStackSection(report)}
    ${renderCapacitySection(report)}
    ${renderAssemblySection(report)}
    ${renderQcSection(report)}
    ${renderElectrochemSection(report)}
  `;
}

// Read the JWT the Vue SPA saves on login — same pattern as the
// electrode-batch-print.js auth patch (commit 2cca4b4). Without this
// header the report endpoint returns 401 in any prod build with
// config.authBypass disabled.
function getAuthHeader() {
  try {
    const token = localStorage.getItem('badb_auth_token');
    return token && token !== 'bypass' ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function loadBatteryReport() {
  const batteryId = getBatteryIdFromQuery();
  const root = document.getElementById('reportRoot');

  if (!batteryId) {
    root.innerHTML = '<p class="muted">Не передан battery_id.</p>';
    return;
  }

  try {
    const res = await fetch(
      `/api/batteries/${batteryId}/report`,
      { headers: getAuthHeader() }
    );
    if (!res.ok) {
      throw new Error('Не удалось загрузить отчёт по батарее');
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
        window.location.href = '/workflow/3-batteries.html';
        return;
      }

      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      window.location.href = '/workflow/3-batteries.html';
    }
  }, 50);
});

loadBatteryReport();
