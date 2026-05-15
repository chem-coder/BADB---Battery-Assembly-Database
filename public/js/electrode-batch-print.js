function getCutBatchIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('cut_batch_id');
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

function formatRole(value) {
  if (value === 'cathode') return 'Катодная';
  if (value === 'anode') return 'Анодная';
  return value || '—';
}

function formatTapeSidedness(value) {
  if (value === 'one_sided') return '1-сторонняя';
  if (value === 'two_sided') return '2-сторонняя';
  return '—';
}

function formatTarget(batch) {
  if (!batch) return '—';
  const formFactorMap = {
    coin: 'Монеточный',
    pouch: 'Пакетный',
    prism: 'Призматическая',
    cylindrical: 'Цилиндрический'
  };
  const formFactor = formFactorMap[batch.target_form_factor] || batch.target_form_factor || '';
  const config = batch.target_config_code === 'other'
    ? (batch.target_config_other || 'other')
    : (batch.target_config_code || '');
  return [formFactor, config].filter(Boolean).join(' ') || '—';
}

function formatGeometry(batch) {
  if (!batch) return '—';
  if (batch.shape === 'circle' && batch.diameter_mm != null) {
    return `${batch.diameter_mm} мм`;
  }
  if (batch.length_mm != null && batch.width_mm != null) {
    return `${batch.length_mm} × ${batch.width_mm} мм`;
  }
  if (batch.length_mm != null) return `${batch.length_mm} мм`;
  if (batch.width_mm != null) return `${batch.width_mm} мм`;
  return '—';
}

function formatNumber(value, digits = 3, unit = '') {
  if (value == null || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${num.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
}

function formatMass(value, digits = 4) {
  return formatNumber(value, digits, 'г');
}

function formatCapacity(value, digits = 3) {
  return formatNumber(value, digits, 'мАч');
}

function formatArealCapacity(value, digits = 3) {
  return formatNumber(value, digits, 'мАч/см²');
}

function formatFraction(value, digits = 2) {
  if (value == null || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${(num * 100).toFixed(digits)} %`;
}

function formatTemperature(value) {
  if (value == null || value === '') return '—';
  return `${value} °C`;
}

function formatDuration(startValue, endValue) {
  if (!startValue || !endValue) return '—';
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—';
  const diffMin = Math.round((end.getTime() - start.getTime()) / 60000);
  if (!Number.isFinite(diffMin) || diffMin < 0) return '—';
  const hours = Math.floor(diffMin / 60);
  const minutes = diffMin % 60;
  if (hours <= 0) return `${minutes} мин`;
  if (minutes === 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
}

function formatDryingSummary(drying) {
  if (!drying || !drying.drying_start_time) return '—';
  const actual = drying.drying_end_time
    ? formatDuration(drying.drying_start_time, drying.drying_end_time)
    : 'идёт';
  return actual;
}

function formatElectrodeStatus(electrode) {
  if (electrode.status_code === 1) return 'новый';
  if (electrode.status_code === 2) {
    return electrode.used_in_battery_id
      ? `в батарее #${electrode.used_in_battery_id}`
      : 'использован';
  }
  if (electrode.status_code === 3) {
    return electrode.scrapped_reason
      ? `списан: ${electrode.scrapped_reason}`
      : 'списан';
  }
  return '—';
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

function renderMetricRow(label, theoreticalValue, actualValue) {
  return `
    <tr>
      <td class="report_metric_label">${escapeHtml(label)}</td>
      <td class="report_number">${escapeHtml(theoreticalValue ?? '—')}</td>
      <td class="report_number">${escapeHtml(actualValue ?? '—')}</td>
    </tr>
  `;
}

function renderFoilMassSection(foilMasses) {
  if (!Array.isArray(foilMasses) || !foilMasses.length) {
    return `
      <section class="report_section">
        <h2>Масса фольги</h2>
        <p class="muted">Измерения не сохранены.</p>
      </section>
    `;
  }

  const numericValues = foilMasses
    .map(row => Number(row.mass_g))
    .filter(value => Number.isFinite(value));
  const average = numericValues.length
    ? `${(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length).toFixed(4)} г`
    : '—';
  const allValues = numericValues.length
    ? `${numericValues.map(value => value.toFixed(4)).join(' / ')} г`
    : '—';

  return `
    <section class="report_section">
      <h2>Масса фольги</h2>
      ${renderFieldGrid([
        renderRow('Среднее', average, { numeric: true }),
        renderRow('Измерения', allValues, { wide: true })
      ])}
    </section>
  `;
}

function renderDryingSection(batch) {
  if (!batch?.drying_start_time && !batch?.drying_end_time && batch?.drying_temperature_c == null && !hasMeaningfulText(batch?.drying_other_parameters)) {
    return `
      <section class="report_section">
        <h2>Сушка партии</h2>
        <p class="muted">Сушка не сохранена.</p>
      </section>
    `;
  }

  const timeLine = batch.drying_start_time
    ? batch.drying_end_time
      ? `${formatDateTime(batch.drying_start_time)} - ${formatDateTime(batch.drying_end_time)}`
      : `С ${formatDateTime(batch.drying_start_time)}`
    : '—';
  const detailParts = [];
  if (batch.drying_temperature_c != null) {
    detailParts.push(formatTemperature(batch.drying_temperature_c));
  }
  if (hasMeaningfulText(batch.drying_other_parameters)) {
    detailParts.push(batch.drying_other_parameters);
  }

  return `
    <section class="report_section">
      <h2>Сушка партии</h2>
      ${renderFieldGrid([
        renderRow('Период', timeLine),
        renderRow('Длительность', formatDryingSummary(batch), { numeric: true }),
        renderRow('Параметры', detailParts.join(', ') || '—', { wide: true, text: true })
      ])}
    </section>
  `;
}

function renderCapacitySection(summary) {
  if (!summary) return '';

  const actualFractionText = summary.actual_fraction_status === 'complete'
    ? formatFraction(summary.active_fraction_actual, 2)
    : 'недоступно';

  return `
    <section class="report_section">
      <h2>Расчёт ёмкости</h2>
      <p class="report_count_line">
        В расчёте: ${escapeHtml(summary.included_electrode_count ?? 0)} эл. ·
        ёмкость теор.: ${escapeHtml(summary.included_capacity_theoretical_count ?? 0)} ·
        ёмкость факт.: ${escapeHtml(summary.included_capacity_actual_count ?? 0)}
      </p>
      ${renderFieldGrid([
        renderRow('Активный материал', summary.active_material_name || '—'),
        renderRow('Покрытие', summary.coating_sidedness ? formatTapeSidedness(summary.coating_sidedness) : '—'),
        renderRow('Удельная ёмкость', formatNumber(summary.specific_capacity_mAh_g, 2, 'мАч/г'), { numeric: true }),
        renderRow('Доля АМ', `теор.: ${formatFraction(summary.active_fraction_theoretical, 2)} / факт.: ${actualFractionText}`),
        renderRow('Средняя фольга', `${formatMass(summary.average_foil_mass_g, 4)} · ${summary.foil_measurement_count ?? 0} изм.`, { numeric: true }),
        renderRow(
          'Площадь',
          `${formatNumber(summary.electrode_area_cm2, 3, 'см²')} / ${formatNumber(summary.electrode_area_mm2, 2, 'мм²')}`,
          { numeric: true }
        )
      ])}
      <table class="report_table report_summary_table">
        <thead>
          <tr>
            <th>Показатель</th>
            <th>Теория</th>
            <th>Факт</th>
          </tr>
        </thead>
        <tbody>
          ${renderMetricRow(
            'Средняя масса покрытия',
            formatMass(summary.average_coating_mass_g, 4),
            '—'
          )}
          ${renderMetricRow(
            'Средняя масса активного материала',
            formatMass(summary.average_active_material_mass_theoretical_g, 4),
            formatMass(summary.average_active_material_mass_actual_g, 4)
          )}
          ${renderMetricRow(
            'Средняя ёмкость партии',
            formatCapacity(summary.average_capacity_theoretical_mAh, 3),
            formatCapacity(summary.average_capacity_actual_mAh, 3)
          )}
          ${renderMetricRow(
            'Удельная ёмкость по площади',
            formatArealCapacity(summary.areal_capacity_theoretical_mAh_cm2, 3),
            formatArealCapacity(summary.areal_capacity_actual_mAh_cm2, 3)
          )}
          ${renderMetricRow(
            'Удельная ёмкость на сторону',
            formatArealCapacity(summary.capacity_per_side_theoretical_mAh_cm2, 3),
            formatArealCapacity(summary.capacity_per_side_actual_mAh_cm2, 3)
          )}
        </tbody>
      </table>
    </section>
  `;
}

function renderElectrodesSection(electrodes) {
  const rows = Array.isArray(electrodes) ? electrodes : [];
  const total = rows.length;
  const available = rows.filter(row => row.status_code === 1).length;
  const used = rows.filter(row => row.status_code === 2).length;
  const scrapped = rows.filter(row => row.status_code === 3).length;

  return `
    <section class="report_section">
      <h2>Электроды в партии</h2>
      <p class="report_count_line">
        Всего: ${escapeHtml(total)} · новые: ${escapeHtml(available)} · в батареях: ${escapeHtml(used)} · списано: ${escapeHtml(scrapped)}
      </p>
      ${rows.length === 0 ? '<p class="muted">Электроды не сохранены.</p>' : `
        <table class="report_table">
          <thead>
            <tr>
              <th class="report_number">№</th>
              <th class="report_number">ID</th>
              <th class="report_number">m, г</th>
              <th class="report_number">Покрытие, г</th>
              <th class="report_number">АМ теор., г</th>
              <th class="report_number">АМ факт., г</th>
              <th class="report_number">C теор., мАч</th>
              <th class="report_number">C факт., мАч</th>
              <th>Стаканчик</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td class="report_number">${escapeHtml(row.number_in_batch ?? '—')}</td>
                <td class="report_number">${escapeHtml(row.electrode_id ?? '—')}</td>
                <td class="report_number">${escapeHtml(formatMass(row.electrode_mass_g))}</td>
                <td class="report_number">${escapeHtml(formatMass(row.coating_mass_g))}</td>
                <td class="report_number">${escapeHtml(formatMass(row.active_material_mass_theoretical_g))}</td>
                <td class="report_number">${escapeHtml(formatMass(row.active_material_mass_actual_g))}</td>
                <td class="report_number">${escapeHtml(formatCapacity(row.capacity_theoretical_mAh))}</td>
                <td class="report_number">${escapeHtml(formatCapacity(row.capacity_actual_mAh))}</td>
                <td>${escapeHtml(row.cup_number ?? '—')}</td>
                <td>${escapeHtml(formatElectrodeStatus(row))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </section>
  `;
}

function renderCommentsSection(batch, electrodes) {
  const commentBlocks = [];

  if (hasMeaningfulText(batch?.comments)) {
    commentBlocks.push(`
      <div class="comment_block">
        <span class="comment_label">По партии</span>
        <div class="comment_text">${escapeHtml(batch.comments)}</div>
      </div>
    `);
  }

  if (hasMeaningfulText(batch?.drying_comments)) {
    commentBlocks.push(`
      <div class="comment_block">
        <span class="comment_label">По сушке</span>
        <div class="comment_text">${escapeHtml(batch.drying_comments)}</div>
      </div>
    `);
  }

  const electrodeComments = (Array.isArray(electrodes) ? electrodes : [])
    .filter(row => hasMeaningfulText(row.comments));

  if (electrodeComments.length) {
    commentBlocks.push(`
      <div class="comment_block">
        <span class="comment_label">По электродам</span>
        <table class="report_table">
          <thead>
            <tr>
              <th class="report_number">№</th>
              <th class="report_number">ID</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            ${electrodeComments.map(row => `
              <tr>
                <td class="report_number">${escapeHtml(row.number_in_batch ?? '—')}</td>
                <td class="report_number">${escapeHtml(row.electrode_id ?? '—')}</td>
                <td>${escapeHtml(row.comments)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `);
  }

  if (!commentBlocks.length) return '';

  return `
    <section class="report_section">
      <h2>Комментарии</h2>
      ${commentBlocks.join('')}
    </section>
  `;
}

function renderReport(report) {
  const batch = report.batch || {};
  const foilMasses = Array.isArray(report.foil_masses) ? report.foil_masses : [];
  const electrodes = Array.isArray(report.electrodes) ? report.electrodes : [];
  const capacitySummary = report.capacity_summary || null;
  const root = document.getElementById('reportRoot');

  const sourceTapeLine = [
    `${formatRole(batch.tape_role)} лента #${batch.tape_id || '—'}`,
    batch.tape_name || null,
    batch.tape_coating_sidedness ? formatTapeSidedness(batch.tape_coating_sidedness) : null
  ].filter(Boolean).join(' | ');

  root.innerHTML = `
    <header class="report_header">
      <div>
        <p class="report_title">Протокол вырезания</p>
        <h1 class="report_subtitle">Партия электродов #${escapeHtml(batch.cut_batch_id || '—')}</h1>
      </div>
      <div class="report_status_box">
        <span class="report_status_label">Тип</span>
        <span class="report_status_value">${escapeHtml(formatRole(batch.tape_role))}</span>
      </div>
    </header>
    <div class="report_meta">
      ${renderRow('Проект', batch.project_names || batch.project_name || '—')}
      ${renderRow('Оператор', batch.created_by_name || '—')}
      ${renderRow('Создана', formatDateOnly(batch.item_created_at) || formatDateTime(batch.created_at), { numeric: true })}
      ${renderRow('Обновлена', formatDateTime(batch.updated_at), { numeric: true })}
    </div>

    <section class="report_section">
      <h2>Источник и параметры партии</h2>
      ${renderFieldGrid([
        renderRow('Лента', sourceTapeLine || '—', { wide: true }),
        renderRow('Рецепт', batch.tape_recipe_name || '—'),
        renderRow('Назначение', formatTarget(batch)),
        renderRow('Геометрия', formatGeometry(batch)),
        renderRow('Покрытие', batch.tape_coating_sidedness ? formatTapeSidedness(batch.tape_coating_sidedness) : '—')
      ])}
    </section>

    ${renderFoilMassSection(foilMasses)}
    ${renderCapacitySection(capacitySummary)}
    ${renderDryingSection(batch)}
    ${renderElectrodesSection(electrodes)}
    ${renderCommentsSection(batch, electrodes)}
  `;
}

// Read the same-origin session JWT saved on login. Without this header the auth
// middleware returns 401 in any build where AUTH_BYPASS is disabled.
function getAuthHeader() {
  try {
    const token = sessionStorage.getItem('badb_auth_token');
    return token && token !== 'bypass' ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function loadElectrodeBatchReport() {
  const cutBatchId = getCutBatchIdFromQuery();
  const root = document.getElementById('reportRoot');

  if (!cutBatchId) {
    root.innerHTML = '<p class="muted">Не передан cut_batch_id.</p>';
    return;
  }

  try {
    const res = await fetch(
      `/api/electrodes/electrode-cut-batches/${cutBatchId}/report`,
      { headers: getAuthHeader() }
    );
    if (!res.ok) {
      throw new Error('Не удалось загрузить отчёт по партии электродов');
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
});

loadElectrodeBatchReport();
