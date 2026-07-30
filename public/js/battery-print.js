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

function formatDateOnly(value) {
  if (!value) return '';

  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return `${match[3]}.${match[2]}.${match[1]}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('ru-RU');
}

function formatFormFactor(value) {
  if (value === 'coin') return 'Монеточный';
  if (value === 'pouch') return 'Пакетный';
  if (value === 'prism') return 'Призматическая';
  if (value === 'cylindrical') return 'Цилиндрический';
  return value || '—';
}

function formatStatus(value) {
  if (!value) return 'Открыт';
  if (value === 'assembled') return 'Собран';
  if (value === 'testing') return 'На тестировании';
  if (value === 'completed') return 'Завершён';
  if (value === 'failed') return 'Брак';
  if (value === 'disassembled') return 'Открыт';
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

function formatSpacer(config = {}) {
  const parts = [];
  if (config.spacer_thickness_mm != null) parts.push(`${config.spacer_thickness_mm} мм`);
  if (config.spacer_count != null) parts.push(`${config.spacer_count} шт.`);
  return parts.join(' · ') || '—';
}

function formatBatchGeometry(batch) {
  if (!batch) return '—';
  if (batch.shape === 'circle' && batch.diameter_mm != null) {
    return `${batch.diameter_mm} мм`;
  }
  if (batch.length_mm != null && batch.width_mm != null) {
    return `${batch.length_mm}×${batch.width_mm} мм`;
  }
  if (batch.length_mm != null) return `${batch.length_mm} мм`;
  if (batch.width_mm != null) return `${batch.width_mm} мм`;
  return '—';
}

function formatBatchTarget(batch) {
  if (!batch) return '—';
  const formFactor = batch.target_form_factor ? formatFormFactor(batch.target_form_factor) : '';

  if (batch.target_config_code === 'other' && batch.target_config_other) {
    return `${formFactor} ${batch.target_config_other}`.trim();
  }

  return [formFactor, batch.target_config_code].filter(Boolean).join(' ') || '—';
}

function formatElectrodeRole(value) {
  if (value === 'cathode') return 'Катод';
  if (value === 'anode') return 'Анод';
  return value || '—';
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

function renderFieldGrid(rows, className = '') {
  const gridClass = className ? ` ${className}` : '';
  return `<div class="report_field_grid${gridClass}">${rows.join('')}</div>`;
}

function formatNumber(value, digits = 3, unit = '') {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${num.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
}

function formatCapacity(value, digits = 3) {
  return formatNumber(value, digits, 'мАч');
}

function formatMass(value, digits = 4) {
  return formatNumber(value, digits, 'г');
}

function formatArealCapacity(value, digits = 3) {
  return formatNumber(value, digits, 'мАч/см²');
}

function formatRatio(value, digits = 3) {
  return formatNumber(value, digits);
}

function renderMetricRow(label, factualValue, theoreticalValue) {
  return `
    <tr>
      <td class="report_metric_label">${escapeHtml(label)}</td>
      <td class="report_number">${escapeHtml(factualValue)}</td>
      <td class="report_number">${escapeHtml(theoreticalValue)}</td>
    </tr>
  `;
}

function renderConfigSection(report) {
  const formFactor = report?.battery?.form_factor;

  if (formFactor === 'coin') {
    const config = report.coin_config || {};
    return `
      <section class="report_section">
        <h2>Конфигурация элемента</h2>
        ${renderFieldGrid([
          renderRow('Тип элемента', formatCoinMode(config.coin_cell_mode)),
          renderRow('Размер', config.coin_size_code || '—'),
          renderRow('Полуячейка', formatHalfCellType(config.half_cell_type)),
          renderRow('Li-фольга', config.li_foil_notes || '—'),
          renderRow('Схема', config.coin_layout || '—'),
          renderRow('Спэйсер', formatSpacer(config)),
          renderRow('Заметки по спэйсеру', config.spacer_notes || '—', { wide: true, text: true })
        ])}
      </section>
    `;
  }

  if (formFactor === 'pouch' || formFactor === 'prism') {
    const config = report.pouch_config || {};
    const pouchSize = config.pouch_case_size_code === 'other'
      ? config.pouch_case_size_other || 'other'
      : config.pouch_case_size_code || '—';
    return `
      <section class="report_section">
        <h2>Конфигурация элемента</h2>
        ${renderFieldGrid([
          renderRow('Размер', pouchSize),
          renderRow('Заметки', config.pouch_notes || '—', { wide: true, text: true })
        ])}
      </section>
    `;
  }

  if (formFactor === 'cylindrical') {
    const config = report.cyl_config || {};
    return `
      <section class="report_section">
        <h2>Конфигурация элемента</h2>
        ${renderFieldGrid([
          renderRow('Размер цилиндра', config.cyl_size_code || '—'),
          renderRow('Заметки', config.cyl_notes || '—', { wide: true, text: true })
        ])}
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
    const roleLabel = formatElectrodeRole(source.role);
    const tapeLabel = source.tape_id
      ? `#${source.tape_id} | ${source.tape_name || '—'}`
      : '—';
    const batchLabel = source.cut_batch_id
      ? `#${source.cut_batch_id} | ${formatBatchTarget(source)} | ${formatBatchGeometry(source)}`
      : '—';
    const batchMeta = [
      source.electrode_count != null ? `${source.electrode_count} эл.` : null,
      source.cut_batch_created_by_name
    ].filter(Boolean).join(' · ') || '—';

    return `
      <div class="report_subsection">
        <h3>${escapeHtml(roleLabel)}</h3>
        ${renderFieldGrid([
          renderRow('Лента', tapeLabel),
          renderRow('Проект ленты', source.tape_project_name || '—'),
          renderRow('Рецепт', source.tape_recipe_name || '—'),
          renderRow('Партия', batchLabel),
          renderRow('Детали', batchMeta),
          renderRow('Заметки', source.source_notes || '—', { text: true })
        ], 'narrow')}
      </div>
    `;
  }).join('');

  return `
    <section class="report_section">
      <h2>Источники электродов</h2>
      <div class="report_two_col">${blocks}</div>
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
              <th class="report_number">Поз.</th>
              <th>Роль</th>
              <th>ID электрода</th>
              <th class="report_number" title="Номер электрода в партии">№ в партии</th>
              <th>ID партии</th>
              <th class="report_number">m, г</th>
              <th class="report_number">C расч. по факт. массе, мАч</th>
              <th class="report_number">C по рецепту, мАч</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td class="report_number">${escapeHtml(row.position_index ?? '—')}</td>
                <td>${escapeHtml(formatElectrodeRole(row.role))}</td>
                <td>${escapeHtml(row.electrode_id ?? '—')}</td>
                <td class="report_number">${escapeHtml(row.number_in_batch ?? '—')}</td>
                <td>${escapeHtml(row.cut_batch_id ?? '—')}</td>
                <td class="report_number">${escapeHtml(formatMass(row.electrode_mass_g))}</td>
                <td class="report_number">${escapeHtml(formatCapacity(row.capacity_actual_mAh))}</td>
                <td class="report_number">${escapeHtml(formatCapacity(row.capacity_theoretical_mAh))}</td>
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
  const separatorDetails = [
    separator.separator_supplier,
    separator.separator_brand,
    separator.separator_batch
  ].filter(Boolean).join(' · ') || '—';
  const electrolyteDetails = [
    electrolyte.solvent_system,
    electrolyte.salts,
    electrolyte.concentration,
    electrolyte.additives
  ].filter(Boolean).join(' · ') || '—';

  return `
    <section class="report_section">
      <h2>Параметры сборки</h2>
      <div class="report_two_col">
        <div class="report_subsection">
          <h3>Сепаратор</h3>
          ${renderFieldGrid([
            renderRow('Материал', separator.separator_id ? `#${separator.separator_id} | ${separator.separator_name || '—'}` : '—'),
            renderRow('Партия', separatorDetails),
            renderRow('Толщина', separator.separator_thickness_um != null ? `${separator.separator_thickness_um} мкм` : '—'),
            renderRow('Заметки', separator.separator_notes || '—', { text: true })
          ], 'narrow')}
        </div>
        <div class="report_subsection">
          <h3>Электролит</h3>
          ${renderFieldGrid([
            renderRow('Материал', electrolyte.electrolyte_id ? `#${electrolyte.electrolyte_id} | ${electrolyte.electrolyte_name || '—'}` : '—'),
            renderRow('Состав', electrolyteDetails),
            renderRow('Объём', electrolyte.electrolyte_total_ul != null ? `${electrolyte.electrolyte_total_ul} мкл` : '—', { numeric: true }),
            renderRow('Заметки', electrolyte.electrolyte_notes || '—', { text: true })
          ], 'narrow')}
        </div>
      </div>
    </section>
  `;
}

function renderQcSection(report) {
  const qc = report.qc || {};
  return `
    <section class="report_section">
      <h2>Выходной контроль</h2>
      ${renderFieldGrid([
        renderRow('НРЦ', qc.ocv_v != null ? `${qc.ocv_v} В` : '—', { numeric: true }),
        renderRow('ESR', qc.esr_mohm != null ? `${qc.esr_mohm} мОм` : '—', { numeric: true }),
        renderRow('Статус', formatStatus(report?.battery?.status)),
        renderRow('Заметки', qc.qc_notes || '—', { wide: true, text: true })
      ])}
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
              <th class="report_number">Загружен</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(entry => `
              <tr>
                <td>${escapeHtml(entry.file_name || '—')}</td><!-- R1: имя файла без ссылки — /uploads приватный, в печатной форме ссылка не работает -->
                <td>${escapeHtml(entry.electrochem_notes || '—')}</td>
                <td class="report_number">${escapeHtml(formatDateTime(entry.uploaded_at))}</td>
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
      <p class="report_count_line">
        Катодов: ${escapeHtml(summary.cathode_count ?? 0)} · Анодов: ${escapeHtml(summary.anode_count ?? 0)}
      </p>
      <table class="report_table report_summary_table">
        <thead>
          <tr>
            <th>Показатель</th>
            <th>Расчёт по факт. массе</th>
            <th>По рецепту</th>
          </tr>
        </thead>
        <tbody>
          ${renderMetricRow(
          'Σ катодов',
          formatCapacity(summary.cathode_capacity_actual_mAh),
          formatCapacity(summary.cathode_capacity_theoretical_mAh)
        )}
          ${renderMetricRow(
          'Σ анодов',
          formatCapacity(summary.anode_capacity_actual_mAh),
          formatCapacity(summary.anode_capacity_theoretical_mAh)
        )}
          ${renderMetricRow(
          'Лимитирующая ёмкость',
          formatCapacity(summary.limiting_capacity_actual_mAh),
          formatCapacity(summary.limiting_capacity_theoretical_mAh)
        )}
          ${renderMetricRow(
          'N/P',
          formatRatio(summary.np_actual),
          formatRatio(summary.np_theoretical)
        )}
          ${renderMetricRow(
          'Ёмкость/площадь катодов',
          formatArealCapacity(summary.cathode_areal_capacity_actual_mAh_cm2),
          formatArealCapacity(summary.cathode_areal_capacity_theoretical_mAh_cm2)
        )}
          ${renderMetricRow(
          'Ёмкость/площадь анодов',
          formatArealCapacity(summary.anode_areal_capacity_actual_mAh_cm2),
          formatArealCapacity(summary.anode_areal_capacity_theoretical_mAh_cm2)
        )}
          ${renderMetricRow(
          'Лимитирующая ёмкость/площадь',
          formatArealCapacity(summary.limiting_areal_capacity_actual_mAh_cm2),
          formatArealCapacity(summary.limiting_areal_capacity_theoretical_mAh_cm2)
        )}
        </tbody>
      </table>
    </section>
  `;
}

function renderReport(report) {
  const battery = report.battery || {};
  const root = document.getElementById('reportRoot');
  const batteryNotesSection = (battery.battery_notes || battery.purpose) ? `
    <section class="report_section">
      <h2>Заметки</h2>
      ${renderFieldGrid([
        ...(battery.purpose
          ? [renderRow('Цель партии', battery.purpose, { wide: true, text: true })]
          : []),
        ...(battery.battery_notes
          ? [renderRow('Комментарий', battery.battery_notes, { wide: true, text: true })]
          : [])
      ])}
    </section>
  ` : '';

  root.innerHTML = `
    <header class="report_header">
      <div>
        <p class="report_title">Протокол сборки</p>
        <h1 class="report_subtitle">Аккумулятор #${escapeHtml(battery.battery_id || '—')}</h1>
      </div>
      <div class="report_status_box">
        <span class="report_status_label">Статус</span>
        <span class="report_status_value">${escapeHtml(formatStatus(battery.status))}</span>
      </div>
    </header>
    <div class="report_meta">
      ${renderRow('Проект', battery.project_names || battery.project_name || '—')}
      ${renderRow('Форм-фактор', formatFormFactor(battery.form_factor))}
      ${renderRow('Оператор', battery.created_by_name || '—')}
      ${renderRow('Создан', formatDateOnly(battery.item_created_at) || formatDateTime(battery.created_at), { numeric: true })}
      ${renderRow('Обновлён', formatDateTime(battery.updated_at), { numeric: true })}
    </div>

    ${batteryNotesSection}
    ${renderCapacitySection(report)}
    ${renderConfigSection(report)}
    ${renderAssemblySection(report)}
    ${renderSourcesSection(report)}
    ${renderStackSection(report)}
    ${renderQcSection(report)}
    ${renderElectrochemSection(report)}
  `;
}

// Read the JWT the Vue SPA saves on login — same pattern as the
// electrode-batch-print.js auth patch (commit 2cca4b4). Without this
// header the report endpoint returns 401.
function getAuthHeader() {
  try {
    const token = localStorage.getItem('badb_auth_token') || sessionStorage.getItem('badb_auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
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
