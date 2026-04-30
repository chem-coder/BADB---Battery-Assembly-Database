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

function formatMass(value, digits = 4) {
  if (value == null || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${num.toFixed(digits)} г`;
}

function formatCapacity(value, digits = 3) {
  if (value == null || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${num.toFixed(digits)} мАч`;
}

function formatArealCapacity(value, digits = 3) {
  if (value == null || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${num.toFixed(digits)} мАч/см²`;
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

function renderRow(label, value) {
  return `<div class="report_row"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value ?? '—')}</div>`;
}

function renderCompactLine(value) {
  return `<div class="report_compact">${escapeHtml(value ?? '—')}</div>`;
}

function renderDualMetric(label, theoreticalValue, actualValue) {
  return `
    <div class="report_dual_metric">
      <div class="report_dual_label">${escapeHtml(label)}</div>
      <div class="report_dual_primary">Теор.: ${escapeHtml(theoreticalValue ?? '—')}</div>
      <div class="report_dual_secondary">Факт.: ${escapeHtml(actualValue ?? '—')}</div>
    </div>
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
      ${renderRow('Среднее', average)}
      ${renderCompactLine(allValues)}
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
      ${renderCompactLine(timeLine)}
      ${detailParts.length ? renderCompactLine(detailParts.join(', ')) : ''}
      ${renderRow('Длительность', formatDryingSummary(batch))}
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
      <div class="report_dual_grid">
        ${renderDualMetric(
          'Активный материал',
          summary.active_material_name || '—',
          summary.coating_sidedness ? formatTapeSidedness(summary.coating_sidedness) : '—'
        )}
        ${renderDualMetric(
          'Удельная ёмкость материала',
          formatCapacity(summary.specific_capacity_mAh_g, 2).replace(' мАч', ''),
          formatCapacity(summary.specific_capacity_mAh_g, 2).replace(' мАч', '')
        )}
        ${renderDualMetric(
          'Доля активного вещества',
          formatFraction(summary.active_fraction_theoretical, 2),
          actualFractionText
        )}
        ${renderDualMetric(
          'Средняя масса фольги',
          formatMass(summary.average_foil_mass_g, 4),
          summary.foil_measurement_count ? `${summary.foil_measurement_count} изм.` : '—'
        )}
        ${renderDualMetric(
          'Площадь электрода',
          summary.electrode_area_cm2 != null ? `${Number(summary.electrode_area_cm2).toFixed(3)} см²` : '—',
          summary.electrode_area_mm2 != null ? `${Number(summary.electrode_area_mm2).toFixed(2)} мм²` : '—'
        )}
        ${renderDualMetric(
          'Средняя масса покрытия',
          formatMass(summary.average_coating_mass_g, 4),
          '—'
        )}
        ${renderDualMetric(
          'Средняя масса активного материала',
          formatMass(summary.average_active_material_mass_theoretical_g, 4),
          formatMass(summary.average_active_material_mass_actual_g, 4)
        )}
        ${renderDualMetric(
          'Средняя ёмкость партии',
          formatCapacity(summary.average_capacity_theoretical_mAh, 3),
          formatCapacity(summary.average_capacity_actual_mAh, 3)
        )}
        ${renderDualMetric(
          'Удельная ёмкость по площади',
          formatArealCapacity(summary.areal_capacity_theoretical_mAh_cm2, 3),
          formatArealCapacity(summary.areal_capacity_actual_mAh_cm2, 3)
        )}
        ${renderDualMetric(
          'Удельная ёмкость на сторону',
          formatArealCapacity(summary.capacity_per_side_theoretical_mAh_cm2, 3),
          formatArealCapacity(summary.capacity_per_side_actual_mAh_cm2, 3)
        )}
        ${renderDualMetric(
          'В расчёте участвовало',
          `${summary.included_capacity_theoretical_count ?? 0} шт.`,
          `${summary.included_capacity_actual_count ?? 0} шт.`
        )}
      </div>
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
      ${renderRow('Всего', total ? `${total} | новые ${available} | в батареях ${used} | списано ${scrapped}` : '0')}
      ${rows.length === 0 ? '<p class="muted">Электроды не сохранены.</p>' : `
        <table class="report_table">
          <thead>
            <tr>
              <th>№</th>
              <th>ID</th>
              <th>m, г</th>
              <th>Покрытие, г</th>
              <th>Активная масса (теор.), г</th>
              <th>Активная масса (факт.), г</th>
              <th>Ёмкость (теор.), мАч</th>
              <th>Ёмкость (факт.), мАч</th>
              <th>Стаканчик</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td>${escapeHtml(row.number_in_batch ?? '—')}</td>
                <td>${escapeHtml(row.electrode_id ?? '—')}</td>
                <td>${escapeHtml(formatMass(row.electrode_mass_g))}</td>
                <td>${escapeHtml(formatMass(row.coating_mass_g))}</td>
                <td>${escapeHtml(formatMass(row.active_material_mass_theoretical_g))}</td>
                <td>${escapeHtml(formatMass(row.active_material_mass_actual_g))}</td>
                <td>${escapeHtml(formatCapacity(row.capacity_theoretical_mAh))}</td>
                <td>${escapeHtml(formatCapacity(row.capacity_actual_mAh))}</td>
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
              <th>№</th>
              <th>ID</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            ${electrodeComments.map(row => `
              <tr>
                <td>${escapeHtml(row.number_in_batch ?? '—')}</td>
                <td>${escapeHtml(row.electrode_id ?? '—')}</td>
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
    <h1 class="report_title">Протокол вырезания</h1>
    <h2 class="report_subtitle">Партия электродов #${escapeHtml(batch.cut_batch_id || '—')}</h2>
    <div class="report_meta">
      <div class="report_row"><strong>Проект:</strong> ${escapeHtml(batch.project_name || '—')}</div>
      <div class="report_row"><strong>Оператор:</strong> ${escapeHtml(batch.created_by_name || '—')}</div>
      <div class="report_row"><strong>Создана:</strong> ${escapeHtml(formatDateTime(batch.created_at))}</div>
      <div class="report_row"><strong>Обновлена:</strong> ${escapeHtml(formatDateTime(batch.updated_at))}</div>
    </div>

    <section class="report_section">
      <h2>Источник и параметры партии</h2>
      ${renderCompactLine(sourceTapeLine || '—')}
      ${renderRow('Рецепт', batch.tape_recipe_name || '—')}
      ${renderRow('Назначение', formatTarget(batch))}
      ${renderRow('Геометрия', formatGeometry(batch))}
    </section>

    ${renderFoilMassSection(foilMasses)}
    ${renderCapacitySection(capacitySummary)}
    ${renderDryingSection(batch)}
    ${renderElectrodesSection(electrodes)}
    ${renderCommentsSection(batch, electrodes)}
  `;
}

// Read the JWT the Vue SPA saves on login (src/stores/auth.js:4 —
// STORAGE_KEY = 'badb_auth_token'). Same-origin localStorage is
// shared: this print page opens from Vue's session, so the token is
// already there. Without this header the auth middleware returns
// 401 in any build where AUTH_BYPASS is disabled (prod).
function getAuthHeader() {
  try {
    const token = localStorage.getItem('badb_auth_token');
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
