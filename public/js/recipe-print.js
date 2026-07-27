function getRecipeIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('recipe_id') || params.get('tape_recipe_id');
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

function formatRecipeRole(value) {
  const map = {
    cathode: 'катод',
    anode: 'анод'
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

function formatRecipeLineRole(value) {
  const map = {
    cathode_active: 'катодный активный материал',
    anode_active: 'анодный активный материал',
    binder: 'связующее',
    additive: 'добавка',
    solvent: 'растворитель'
  };

  return map[value] || value || '—';
}

function formatMaterialRole(value) {
  const map = {
    active: 'активный материал',
    cathode_active: 'катодный активный материал',
    anode_active: 'анодный активный материал',
    binder: 'связующее',
    conductive_additive: 'проводящая добавка',
    solvent: 'растворитель',
    other: 'другое'
  };

  return map[value] || value || '—';
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '—';

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);

  return `${numeric.toLocaleString('ru-RU', {
    maximumFractionDigits: 4
  })} %`;
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

function isActiveSlotLine(line) {
  return line.material_id == null &&
    (line.recipe_role === 'cathode_active' || line.recipe_role === 'anode_active');
}

function formatRecipeLineMaterial(line) {
  if (line.material_name) return line.material_name;
  if (isActiveSlotLine(line)) return 'АМ — активный материал (выбирается на ленте)';
  return '—';
}

function renderCompositionSection(lines) {
  const rows = Array.isArray(lines) ? lines : [];

  return `
    <section class="report_section">
      <h2>Состав рецепта</h2>
      ${rows.length === 0 ? '<p class="muted">Строки состава не найдены.</p>' : `
        <table class="report_table">
          <thead>
            <tr>
              <th class="report_number">ID</th>
              <th>Функциональная роль</th>
              <th>Материал</th>
              <th>Роль материала</th>
              <th class="report_number">% в пасте</th>
              <th>Заметки</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(line => `
              <tr>
                <td class="report_number">${escapeHtml(line.recipe_line_id ?? '—')}</td>
                <td>${escapeHtml(formatRecipeLineRole(line.recipe_role))}</td>
                <td>${escapeHtml(formatRecipeLineMaterial(line))}</td>
                <td>${escapeHtml(formatMaterialRole(line.material_role))}</td>
                <td class="report_number">${escapeHtml(formatPercent(line.slurry_percent))}</td>
                <td>${escapeHtml(line.line_notes || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </section>
  `;
}

function renderUsageSection(tapes) {
  const rows = Array.isArray(tapes) ? tapes : [];

  return `
    <section class="report_section">
      <h2>Где используется</h2>
      ${rows.length === 0 ? '<p class="muted">Не используется в лентах</p>' : `
        <table class="report_table">
          <thead>
            <tr>
              <th class="report_number">ID ленты</th>
              <th>Лента</th>
              <th>Проект</th>
              <th>Тип</th>
              <th class="report_number">Создана</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(tape => `
              <tr>
                <td class="report_number">${escapeHtml(tape.tape_id ?? '—')}</td>
                <td>${escapeHtml(tape.name || '—')}</td>
                <td>${escapeHtml(tape.project_names || tape.project_name || '—')}</td>
                <td>${escapeHtml(formatTapeRole(tape.role))}</td>
                <td class="report_number">${escapeHtml(formatDateTime(tape.created_at))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </section>
  `;
}

function renderAuditSection(recipe) {
  return `
    <section class="report_section">
      <h2>Метаданные</h2>
      ${renderFieldGrid([
        renderRow('Создал', recipe.created_by_name || '—'),
        renderRow('Создан', formatDateTime(recipe.created_at), { numeric: true }),
        renderRow('Обновил', recipe.updated_by_name || '—'),
        renderRow('Обновлён', formatDateTime(recipe.updated_at), { numeric: true })
      ])}
    </section>
  `;
}

function renderReport(report) {
  const recipe = report?.recipe || {};
  const lines = Array.isArray(report?.lines) ? report.lines : [];
  const tapeUsage = Array.isArray(report?.tape_usage) ? report.tape_usage : [];
  const root = document.getElementById('reportRoot');
  const title = recipe.name || 'Рецепт';

  document.title = `Печатный отчёт по рецепту #${recipe.tape_recipe_id || ''}`.trim();

  root.innerHTML = `
    <header class="report_header">
      <div>
        <p class="report_title">Печатный отчёт по рецепту</p>
        <h1 class="report_subtitle">#${escapeHtml(recipe.tape_recipe_id ?? '—')} | ${escapeHtml(title)}</h1>
      </div>
      <div class="report_status_box">
        <span class="report_status_label">Роль</span>
        <span class="report_status_value">${escapeHtml(formatRecipeRole(recipe.role))}</span>
      </div>
    </header>

    <div class="report_meta">
      ${renderRow('ID', recipe.tape_recipe_id ?? '—', { numeric: true })}
      ${renderRow('Роль', formatRecipeRole(recipe.role))}
      ${renderRow('Строки', lines.length, { numeric: true })}
      ${renderRow('Ленты', tapeUsage.length, { numeric: true })}
      ${renderRow('Версия', recipe.variant_label || '—')}
      ${renderRow('Создал', recipe.created_by_name || '—')}
    </div>

    <section class="report_section">
      <h2>Описание</h2>
      ${renderFieldGrid([
        renderRow('Название', recipe.name || '—'),
        renderRow('Вариант/версия', recipe.variant_label || '—'),
        renderRow('Комментарии', hasMeaningfulText(recipe.notes) ? recipe.notes : '—', { wide: true, text: true })
      ])}
    </section>

    ${renderCompositionSection(lines)}
    ${renderUsageSection(tapeUsage)}
    ${renderAuditSection(recipe)}
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

async function loadRecipeReport() {
  const recipeId = getRecipeIdFromQuery();
  const root = document.getElementById('reportRoot');

  if (!recipeId) {
    root.innerHTML = '<p class="muted">Не передан recipe_id.</p>';
    return;
  }

  try {
    const res = await fetch(
      `/api/recipes/${recipeId}/report`,
      { headers: getAuthHeader() }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Не удалось загрузить отчёт по рецепту');
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
        window.location.href = '/reference/recipes.html';
        return;
      }

      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      window.location.href = '/reference/recipes.html';
    }
  }, 50);
});

loadRecipeReport();
