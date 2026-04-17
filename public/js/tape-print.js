function getTapeIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('tape_id');
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

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRole(value) {
  if (value === 'cathode') return 'Катод';
  if (value === 'anode') return 'Анод';
  return value || '—';
}

function formatRecipeRole(value) {
  const map = {
    cathode_active: 'Катодный активный материал',
    anode_active: 'Анодный активный материал',
    conductive_additive: 'Проводящая добавка',
    binder: 'Связующее',
    solvent: 'Растворитель',
    additive: 'Добавка',
    filler: 'Наполнитель'
  };

  return map[value] || value || '—';
}

function formatCalcMode(value) {
  if (value === 'from_active_mass') return 'по массе активного материала';
  if (value === 'from_slurry_mass') return 'по общей массе суспензии';
  return value || '—';
}

function renderRow(label, value) {
  return `<div class="report_row"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value ?? '—')}</div>`;
}

function hasMeaningfulText(value) {
  return value != null && String(value).trim() !== '';
}

function formatAtmosphere(value) {
  const map = {
    vacuum: 'вакуум',
    air: 'воздух'
  };
  return map[String(value || '').trim().toLowerCase()] || value || '—';
}

function renderStepLine(value, extraClass = '') {
  return `<div class="step_line${extraClass ? ` ${extraClass}` : ''}">${escapeHtml(value ?? '—')}</div>`;
}

function renderStepMetaRow(label, value, { hideIfEmpty = false, extraClass = '' } = {}) {
  if (hideIfEmpty && !hasMeaningfulText(value)) return '';
  return `
    <div class="step_meta_row${extraClass ? ` ${extraClass}` : ''}">
      <span class="step_meta_label">${escapeHtml(label)}:</span>
      <span class="step_meta_value">${escapeHtml(value ?? '—')}</span>
    </div>
  `;
}

function renderStepSpacer() {
  return '<div class="step_spacer"></div>';
}

function renderCompactStepHeader(step) {
  const operator = step.performed_by_name || '—';
  const startedAt = formatDateTime(step.started_at);
  return renderStepLine(`${operator} - ${startedAt}`, 'step_operator');
}

function formatDurationMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 0) return '—';

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  if (h <= 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

function formatDurationBetweenDates(startValue, endValue) {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start || !end) return '—';

  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return '—';

  return formatDurationMinutes(Math.round(diffMs / 60000));
}

function formatDurationFromNow(startValue) {
  const start = parseDate(startValue);
  if (!start) return '—';
  const diffMs = Date.now() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return '—';
  return formatDurationMinutes(Math.round(diffMs / 60000));
}

function getStepStartedAt(step) {
  return step?.started_at || null;
}

function getStepActualEnd(step, nextStep) {
  if (!step) return null;

  if (step.code === 'drying_am' || step.code === 'drying_tape' || step.code === 'drying_pressed_tape') {
    return step.ended_at || getStepStartedAt(step);
  }

  if (step.code === 'mixing') {
    const candidates = [step.dry_end_time, step.wet_end_time, step.dry_start_time, step.wet_start_time, step.started_at]
      .map(parseDate)
      .filter(Boolean);

    if (!candidates.length) return getStepStartedAt(step);

    const latest = candidates.reduce((best, current) => (
      !best || current.getTime() > best.getTime() ? current : best
    ), null);

    return latest ? latest.toISOString() : getStepStartedAt(step);
  }

  if (step.code === 'weighing' || step.code === 'coating' || step.code === 'calendering') {
    return getStepStartedAt(nextStep) || getStepStartedAt(step);
  }

  return getStepStartedAt(step);
}

function getStepPlannedDurationText(step) {
  if (!step) return '—';

  if (step.code === 'drying_am' || step.code === 'drying_tape' || step.code === 'drying_pressed_tape') {
    return formatDurationMinutes(step.target_duration_min);
  }

  if (step.code === 'mixing') {
    const parts = [];
    if (step.dry_duration_min != null) {
      parts.push(`сухое: ${formatDurationMinutes(step.dry_duration_min)}`);
    }
    if (step.wet_duration_min != null) {
      parts.push(`мокрое: ${formatDurationMinutes(step.wet_duration_min)}`);
    }
    return parts.join(', ') || '—';
  }

  if (step.code === 'coating') {
    return formatDurationMinutes(step.coat_time_min);
  }

  return '—';
}

function getStepActualDurationText(step, nextStep) {
  if (!step) return '—';

  if (step.code === 'mixing') {
    const dry = formatDurationBetweenDates(step.dry_start_time, step.dry_end_time);
    const wet = formatDurationBetweenDates(step.wet_start_time, step.wet_end_time);
    const parts = [];
    if (dry !== '—') parts.push(`сухое: ${dry}`);
    if (wet !== '—') parts.push(`мокрое: ${wet}`);
    return parts.join(', ') || '—';
  }

  return formatDurationBetweenDates(getStepStartedAt(step), getStepActualEnd(step, nextStep));
}

function getStepIntervalToNextText(step, nextStep) {
  if (!step || !nextStep) return '—';
  return formatDurationBetweenDates(getStepActualEnd(step, nextStep), getStepStartedAt(nextStep));
}

function getMixingPhaseTimingSummaryText({ plannedMinutes, startValue, endValue, nextStartValue = null }) {
  const planned = formatDurationMinutes(plannedMinutes);
  const actual = formatDurationBetweenDates(startValue, endValue);
  const interval = nextStartValue
    ? formatDurationBetweenDates(endValue || startValue, nextStartValue)
    : '—';

  return `${planned || '—'} / ${actual || '—'} / ${interval || '—'}`;
}

function getDryBoxTimingSummaryText(dryBoxState) {
  if (!dryBoxState || !dryBoxState.started_at) {
    return '— / — / —';
  }

  const actual = dryBoxState.removed_at
    ? formatDurationBetweenDates(dryBoxState.started_at, dryBoxState.removed_at)
    : formatDurationFromNow(dryBoxState.started_at);

  return `— / ${actual || '—'} / —`;
}

function renderRecipeSection(report) {
  const recipeRows = Array.isArray(report.recipe_lines) ? report.recipe_lines : [];
  const mixtureRows = Array.isArray(report.mixture_rows) ? report.mixture_rows : [];

  function formatActualValue(row) {
    if (row.measure_mode === 'mass' && row.actual_mass_g != null) {
      return `${Number(row.actual_mass_g).toFixed(4)} г`;
    }
    if (row.measure_mode === 'volume' && row.actual_volume_ml != null) {
      return `${row.actual_volume_ml} мл`;
    }
    return '—';
  }

  function formatMassValue(value) {
    if (value == null) return '—';
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return `${num.toFixed(4)} г`;
  }

  function formatSignedGrams(value) {
    if (value == null) return '—';
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    if (num === 0) return '0.0000 г';
    return `${num > 0 ? '+' : ''}${num.toFixed(4)} г`;
  }

  function formatPercentError(value) {
    if (value == null) return '—';
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    if (num === 0) return '0%';
    return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;
  }

  return `
    <section class="report_section">
      <h2>Рецепт и фактические данные</h2>
      ${recipeRows.length === 0 ? '<p class="muted">Строки рецепта не найдены.</p>' : `
        <div class="report_subsection">
          <h3>Рецепт</h3>
          <table class="report_table">
            <thead>
              <tr>
                <th>Материал</th>
                <th>Роль</th>
                <th>В расчёте</th>
                <th>План, %</th>
              </tr>
            </thead>
            <tbody>
              ${recipeRows.map((row) => `
                <tr>
                  <td>${escapeHtml(row.material_name || '—')}</td>
                  <td>${escapeHtml(formatRecipeRole(row.recipe_role))}</td>
                  <td>${escapeHtml(row.include_in_pct ? 'Да' : 'Нет')}</td>
                  <td>${escapeHtml(row.slurry_percent != null ? row.slurry_percent : '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="report_subsection">
          <h3>Смесь</h3>
          <table class="report_table">
            <thead>
              <tr>
                <th>Экземпляр</th>
                <th>Целевая навеска</th>
                <th>Факт</th>
                <th>Разница</th>
                <th>Ошибка, %</th>
              </tr>
            </thead>
            <tbody>
              ${mixtureRows.map((row) => `
                <tr>
                  <td>${escapeHtml(row.instance_display || '—')}</td>
                  <td>${escapeHtml(formatMassValue(row.target_quantity_g))}</td>
                  <td>${escapeHtml(formatActualValue(row))}</td>
                  <td>${escapeHtml(formatSignedGrams(row.difference_g))}</td>
                  <td>${escapeHtml(formatPercentError(row.percent_error))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </section>
  `;
}

function renderStepDetails(step) {
  const code = step.code;

  if (code === 'drying_am' || code === 'drying_tape' || code === 'drying_pressed_tape') {
    const dryingDetails = [
      step.temperature_c != null ? `${step.temperature_c} °C` : null,
      formatAtmosphere(step.atmosphere) || null,
      step.target_duration_min != null ? `${step.target_duration_min} мин` : null
    ].filter(Boolean).join(', ') || '—';

    return `
      ${renderCompactStepHeader(step)}
      ${renderStepLine(dryingDetails)}
      ${renderStepMetaRow('Примечания', step.comments, { hideIfEmpty: true })}
      ${renderStepMetaRow('Доп. параметры', step.other_parameters, { hideIfEmpty: true })}
    `;
  }

  if (code === 'weighing') {
    return '<div class="step_line muted">Фактические массы и объёмы указаны в разделе рецепта выше.</div>';
  }

  if (code === 'mixing') {
    const dryLabel = [
      step.dry_mixing_label || '—',
      step.dry_duration_min != null ? `${step.dry_duration_min} мин` : '—',
      `RPM: ${step.dry_rpm != null ? step.dry_rpm : '—'}`
    ].join('; ');

    const wetLabel = [
      step.wet_mixing_label || '—',
      step.wet_duration_min != null ? `${step.wet_duration_min} мин` : '—',
      `RPM: ${step.wet_rpm != null ? step.wet_rpm : '—'}`
    ].join('; ');

    return `
      ${renderStepSpacer()}
      ${renderStepMetaRow('Объём суспензии', step.slurry_volume_ml != null ? `${step.slurry_volume_ml} мл` : '—')}
      ${renderStepSpacer()}
      ${renderStepLine('Сухое смешивание:')}
      ${renderStepLine(dryLabel)}
      ${renderStepMetaRow(
        'Длительность (план / факт / до след. этапа)',
        getMixingPhaseTimingSummaryText({
          plannedMinutes: step.dry_duration_min,
          startValue: step.dry_start_time,
          endValue: step.dry_end_time,
          nextStartValue: step.wet_start_time
        }),
        { extraClass: 'step_timing_row' }
      )}
      ${renderStepSpacer()}
      ${renderStepLine('Влажное смешивание:')}
      ${renderStepLine(wetLabel)}
      ${renderStepMetaRow(
        'Длительность (план / факт / до след. этапа)',
        getMixingPhaseTimingSummaryText({
          plannedMinutes: step.wet_duration_min,
          startValue: step.wet_start_time,
          endValue: step.wet_end_time,
          nextStartValue: null
        }),
        { extraClass: 'step_timing_row' }
      )}
      ${renderStepSpacer()}
      ${renderStepLine('Вязкость:')}
      ${renderStepLine(step.viscosity_cp != null ? `${step.viscosity_cp} cP` : '—')}
    `;
  }

  if (code === 'coating') {
    return `
      ${renderStepSpacer()}
      ${renderStepMetaRow('Фольга', step.foil_type || '—')}
      ${renderStepLine(step.coating_method_label || '—')}
      ${renderStepMetaRow('Зазор', step.gap_um != null ? `${step.gap_um} мкм` : '—')}
      ${renderStepMetaRow('Температура', step.coat_temp_c != null ? `${step.coat_temp_c} °C` : '—')}
      ${renderStepMetaRow('Примечания к методу', step.method_comments, { hideIfEmpty: true })}
    `;
  }

  if (code === 'calendering') {
    return `
      ${renderStepSpacer()}
      ${renderStepMetaRow('Температура валков', step.temp_c != null ? `${step.temp_c} °C` : '—')}
      ${renderStepMetaRow('Давление', step.pressure_value != null ? `${step.pressure_value} ${step.pressure_units || ''}`.trim() : '—')}
      ${renderStepMetaRow('Скорость протяжки', step.draw_speed_m_min != null ? `${step.draw_speed_m_min} м/мин` : '—')}
      ${renderStepMetaRow('Количество проходов', step.no_passes != null ? step.no_passes : '—')}
      ${renderStepSpacer()}
      ${renderStepMetaRow(
        'Толщина',
        `начальная: ${step.init_thickness_microns != null ? `${step.init_thickness_microns} мкм` : '—'} / конечная: ${step.final_thickness_microns != null ? `${step.final_thickness_microns} мкм` : '—'}`
      )}
      ${renderStepMetaRow('Внешний вид', step.appearance || '—')}
      ${renderStepMetaRow('Доп. параметры', step.other_params, { hideIfEmpty: true })}
    `;
  }

  return '';
}

function renderStepsSection(report) {
  const rows = Array.isArray(report.steps) ? report.steps : [];
  const labelByCode = {
    recipe_materials: 'Выбор экземпляров',
    drying_am: '0. Сушка активного материала',
    weighing: 'I.1. Замес пасты',
    mixing: 'I.2. Перемешивание',
    coating: 'II.1. Нанесение',
    drying_tape: 'II.1.a. Сушка до каландрирования',
    calendering: 'II.2. Каландрирование',
    drying_pressed_tape: 'II.2.a. Сушка после каландрирования'
  };

  return `
    <section class="report_section">
      <h2>Этапы процесса</h2>
      ${rows.length === 0 ? '<p class="muted">Сохранённые этапы не найдены.</p>' : rows.map((step, index) => `
        <div class="report_subsection process_step">
          <h3>${escapeHtml(labelByCode[step.code] || step.code || 'Этап')}</h3>
          ${step.code === 'drying_am' || step.code === 'drying_tape' || step.code === 'drying_pressed_tape'
            ? `
              <div class="process_step_body">
                ${renderStepDetails(step)}
                ${renderStepTimingSummary(step, rows[index + 1])}
              </div>
            `
            : `
              <div class="process_step_body">
                ${renderCompactStepHeader(step)}
                ${renderStepMetaRow('Примечания', step.comments, { hideIfEmpty: true })}
                ${renderStepDetails(step)}
                ${step.code === 'mixing' ? '' : renderStepTimingSummary(step, rows[index + 1])}
              </div>
            `}
        </div>
      `).join('')}
      ${renderDryBoxSection(report.dry_box_state)}
    </section>
  `;
}

function getStepTimingSummaryText(step, nextStep) {
  const planned = getStepPlannedDurationText(step);
  const actual = getStepActualDurationText(step, nextStep);
  const interval = getStepIntervalToNextText(step, nextStep);

  return `${planned || '—'} / ${actual || '—'} / ${interval || '—'}`;
}

function renderStepTimingSummary(step, nextStep) {
  return renderStepMetaRow(
    'Длительность (план / факт / до след. этапа)',
    getStepTimingSummaryText(step, nextStep),
    { extraClass: 'step_timing_row' }
  );
}

function renderDryBoxSection(dryBoxState) {
  if (!dryBoxState || !dryBoxState.started_at) return '';

  const pseudoStep = {
    performed_by_name: dryBoxState.updated_by_name || '—',
    started_at: dryBoxState.started_at,
    temperature_c: dryBoxState.temperature_c,
    atmosphere: dryBoxState.atmosphere,
    target_duration_min: null,
    comments: dryBoxState.comments,
    other_parameters: dryBoxState.other_parameters
  };

  const statusLine = dryBoxState.availability_status === 'in_dry_box'
    ? 'Партия находится в сушильном шкафу'
    : dryBoxState.availability_status === 'out_of_dry_box'
      ? 'Партия вынута из сушильного шкафа'
      : 'Партия израсходована';

  return `
    <div class="report_subsection process_step">
      <h3>III.1. Последняя сушка ленты в шкафу</h3>
      <div class="process_step_body">
        ${renderStepDetails({ ...pseudoStep, code: 'drying_pressed_tape' })}
        ${renderStepMetaRow('Статус', statusLine)}
        ${renderStepMetaRow(
          'Длительность (план / факт / до след. этапа)',
          getDryBoxTimingSummaryText(dryBoxState),
          { extraClass: 'step_timing_row' }
        )}
      </div>
    </div>
  `;
}

function renderReport(report) {
  const tape = report.tape || {};
  const workflowStatus = report.workflow_status || {};
  const root = document.getElementById('reportRoot');

  root.innerHTML = `
    <h1 class="report_title">Протокол приготовления</h1>
    <h2 class="report_subtitle">Лента #${escapeHtml(tape.tape_id || '—')}</h2>
    <div class="report_meta">
      <div class="report_row"><strong>Название:</strong> ${escapeHtml(tape.name || '—')}</div>
      <div class="report_row"><strong>Проект:</strong> ${escapeHtml(tape.project_name || '—')}</div>
      <div class="report_row"><strong>Тип:</strong> ${escapeHtml(formatRole(tape.role))}</div>
      <div class="report_row"><strong>Рецепт:</strong> ${escapeHtml(tape.recipe_name || '—')}</div>
      <div class="report_row"><strong>Оператор:</strong> ${escapeHtml(tape.created_by_name || '—')}</div>
      <div class="report_row"><strong>Статус:</strong> ${escapeHtml(workflowStatus.workflow_status_label || tape.status || '—')}</div>
      <div class="report_row"><strong>Расчёт:</strong> ${escapeHtml(formatCalcMode(tape.calc_mode))}</div>
      <div class="report_row"><strong>Целевая масса активного материала:</strong> ${escapeHtml(tape.target_mass_g != null ? `${tape.target_mass_g} г` : '—')}</div>
      <div class="report_row"><strong>Создана:</strong> ${escapeHtml(formatDateTime(tape.created_at))}</div>
      <div class="report_row"><strong>Обновлена:</strong> ${escapeHtml(formatDateTime(tape.updated_at))}</div>
    </div>

    <section class="report_section">
      <h2>Общая информация</h2>
      ${renderRow('Примечания', tape.notes || '—')}
    </section>

    ${renderRecipeSection(report)}
    ${renderStepsSection(report)}
  `;
}

async function loadTapeReport() {
  const tapeId = getTapeIdFromQuery();
  const root = document.getElementById('reportRoot');

  if (!tapeId) {
    root.innerHTML = '<p class="muted">Не передан tape_id.</p>';
    return;
  }

  try {
    const res = await fetch(`/api/tapes/${tapeId}/report`);
    if (!res.ok) {
      throw new Error('Не удалось загрузить отчёт по ленте');
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

loadTapeReport();
