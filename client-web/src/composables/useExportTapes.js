import api from '@/services/api'

const STEP_CODES = ['drying_am', 'weighing', 'mixing', 'coating', 'drying_tape', 'calendering', 'drying_pressed_tape']

const SECTIONS = [
  { key: 'general', label: 'Общая информация', color: '#e8edf5', fields: [
    { key: 'tape_id', label: 'ID' },
    { key: 'name', label: 'Название' },
    { key: 'project_name', label: 'Проект' },
    { key: 'role', label: 'Тип' },
    { key: 'recipe_name', label: 'Рецепт' },
    { key: 'calc_mode', label: 'Расчёт по' },
    { key: 'target_mass_g', label: 'Масса, г' },
    { key: 'notes', label: 'Примечания' },
    { key: 'status', label: 'Статус' },
    { key: 'created_at', label: 'Создана' },
  ]},
  { key: 'drying_am', label: 'Сушка АМ', color: '#fff3e0', fields: [
    { key: 'drying_am__operator', label: 'Оператор' },
    { key: 'drying_am__date', label: 'Дата' },
    { key: 'drying_am__temperature_c', label: 'Температура, °C' },
    { key: 'drying_am__atmosphere', label: 'Атмосфера' },
    { key: 'drying_am__target_duration_min', label: 'Длительность, мин' },
    { key: 'drying_am__comments', label: 'Примечания' },
  ]},
  { key: 'weighing', label: 'Замес пасты', color: '#e3f2fd', fields: [
    { key: 'weighing__operator', label: 'Оператор' },
    { key: 'weighing__date', label: 'Дата' },
    { key: 'weighing__comments', label: 'Примечания' },
  ]},
  { key: 'mixing', label: 'Перемешивание', color: '#f3e5f5', fields: [
    { key: 'mixing__operator', label: 'Оператор' },
    { key: 'mixing__date', label: 'Дата' },
    { key: 'mixing__slurry_volume_ml', label: 'Объём суспензии, мл' },
    { key: 'mixing__dry_mixing_id', label: 'Метод сухого смешивания' },
    { key: 'mixing__dry_duration_min', label: 'Длит. сухого, мин' },
    { key: 'mixing__dry_rpm', label: 'Об/мин сухого' },
    { key: 'mixing__wet_mixing_id', label: 'Метод мокрого смешивания' },
    { key: 'mixing__wet_duration_min', label: 'Длит. мокрого, мин' },
    { key: 'mixing__wet_rpm', label: 'Об/мин мокрого' },
    { key: 'mixing__viscosity_cp', label: 'Вязкость, сП' },
    { key: 'mixing__comments', label: 'Примечания' },
  ]},
  { key: 'coating', label: 'Нанесение', color: '#e8f5e9', fields: [
    { key: 'coating__operator', label: 'Оператор' },
    { key: 'coating__date', label: 'Дата' },
    { key: 'coating__foil_id', label: 'Фольга' },
    { key: 'coating__coating_id', label: 'Метод нанесения' },
    { key: 'coating__coating_sidedness', label: 'Сторонность покрытия' },
    { key: 'coating__comments', label: 'Примечания' },
  ]},
  { key: 'drying_tape', label: 'Сушка ленты', color: '#fff3e0', fields: [
    { key: 'drying_tape__operator', label: 'Оператор' },
    { key: 'drying_tape__date', label: 'Дата' },
    { key: 'drying_tape__temperature_c', label: 'Температура, °C' },
    { key: 'drying_tape__atmosphere', label: 'Атмосфера' },
    { key: 'drying_tape__target_duration_min', label: 'Длительность, мин' },
    { key: 'drying_tape__comments', label: 'Примечания' },
  ]},
  { key: 'calendering', label: 'Каландрирование', color: '#fce4ec', fields: [
    { key: 'calendering__operator', label: 'Оператор' },
    { key: 'calendering__date', label: 'Дата' },
    { key: 'calendering__temp_c', label: 'Температура, °C' },
    { key: 'calendering__pressure_value', label: 'Давление' },
    { key: 'calendering__pressure_units', label: 'Ед. давления' },
    { key: 'calendering__draw_speed_m_min', label: 'Скорость, м/мин' },
    { key: 'calendering__init_thickness_microns', label: 'Толщ. до, мкм' },
    { key: 'calendering__final_thickness_microns', label: 'Толщ. после, мкм' },
    { key: 'calendering__no_passes', label: 'Проходов' },
    { key: 'calendering__appearance', label: 'Внешний вид' },
    { key: 'calendering__comments', label: 'Примечания' },
  ]},
  { key: 'drying_pressed_tape', label: 'Сушка после каландр.', color: '#fff3e0', fields: [
    { key: 'drying_pressed_tape__operator', label: 'Оператор' },
    { key: 'drying_pressed_tape__date', label: 'Дата' },
    { key: 'drying_pressed_tape__temperature_c', label: 'Температура, °C' },
    { key: 'drying_pressed_tape__atmosphere', label: 'Атмосфера' },
    { key: 'drying_pressed_tape__target_duration_min', label: 'Длительность, мин' },
    { key: 'drying_pressed_tape__comments', label: 'Примечания' },
  ]},
]

const ALL_FIELDS = SECTIONS.flatMap(s => s.fields)

function formatDate(v) {
  if (!v) return ''
  try { return new Date(v).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) }
  catch { return String(v) }
}

function stepDateTime(step) {
  if (!step?.started_at) return ''
  return formatDate(step.started_at)
}

async function fetchFullTapeData(tapeId) {
  const [tapeRes, ...stepResults] = await Promise.allSettled([
    api.get(`/api/tapes/${tapeId}`),
    ...STEP_CODES.map(code => api.get(`/api/tapes/${tapeId}/steps/by-code/${code}`)),
  ])

  const tape = tapeRes.status === 'fulfilled' ? tapeRes.value.data : {}
  const steps = {}
  STEP_CODES.forEach((code, i) => {
    steps[code] = stepResults[i].status === 'fulfilled' ? stepResults[i].value.data : null
  })

  // Flatten into export row
  const row = {
    tape_id: tape.tape_id,
    name: tape.name || '',
    project_name: tape.project_name || '',
    role: tape.role || '',
    recipe_name: tape.recipe_name || '',
    calc_mode: tape.calc_mode || '',
    target_mass_g: tape.target_mass_g ?? '',
    notes: tape.notes || '',
    status: tape.status || '',
    created_at: formatDate(tape.created_at),
  }

  for (const code of STEP_CODES) {
    const s = steps[code]
    if (!s) {
      // Fill empties for all fields of this section
      const section = SECTIONS.find(sec => sec.key === code)
      if (section) section.fields.forEach(f => { row[f.key] = '' })
      continue
    }
    row[`${code}__operator`] = s.performed_by ?? ''
    row[`${code}__date`] = stepDateTime(s)
    row[`${code}__comments`] = s.comments || ''

    // Step-specific fields
    if (code.startsWith('drying')) {
      row[`${code}__temperature_c`] = s.temperature_c ?? ''
      row[`${code}__atmosphere`] = s.atmosphere || ''
      row[`${code}__target_duration_min`] = s.target_duration_min ?? ''
    }
    if (code === 'mixing') {
      row.mixing__slurry_volume_ml = s.slurry_volume_ml ?? ''
      row.mixing__dry_mixing_id = s.dry_mixing_id ?? ''
      row.mixing__dry_duration_min = s.dry_duration_min ?? ''
      row.mixing__dry_rpm = s.dry_rpm ?? ''
      row.mixing__wet_mixing_id = s.wet_mixing_id ?? ''
      row.mixing__wet_duration_min = s.wet_duration_min ?? ''
      row.mixing__wet_rpm = s.wet_rpm ?? ''
      row.mixing__viscosity_cp = s.viscosity_cp ?? ''
    }
    if (code === 'coating') {
      row.coating__foil_id = s.foil_id ?? ''
      row.coating__coating_id = s.coating_id ?? ''
      // Humanise the enum for spreadsheet export — users who open the CSV
      // in Excel expect Russian, not "one_sided" / "two_sided". Blank stays
      // blank. Mirrors public/js/3-batteries.js:formatTapeSidednessLabel.
      row.coating__coating_sidedness =
        s.coating_sidedness === 'one_sided' ? '1-сторонняя' :
        s.coating_sidedness === 'two_sided' ? '2-сторонняя' : ''
    }
    if (code === 'calendering') {
      row.calendering__temp_c = s.temp_c ?? ''
      row.calendering__pressure_value = s.pressure_value ?? ''
      row.calendering__pressure_units = s.pressure_units || ''
      row.calendering__draw_speed_m_min = s.draw_speed_m_min ?? ''
      row.calendering__init_thickness_microns = s.init_thickness_microns ?? ''
      row.calendering__final_thickness_microns = s.final_thickness_microns ?? ''
      row.calendering__no_passes = s.no_passes ?? ''
      row.calendering__appearance = s.appearance || ''
    }
  }

  return row
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function makeFilename(tapes, ext) {
  if (tapes.length === 1) {
    const safe = (tapes[0].name || 'tape').replace(/[^\w\u0400-\u04FF -]/g, '_').slice(0, 60)
    return `Лента_${safe}.${ext}`
  }
  const d = new Date().toISOString().slice(0, 10)
  return `Ленты_экспорт_${d}.${ext}`
}

// ── Excel (.xls) — HTML table with colored section headers ──
function toExcel(rows) {
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Section header row (merged-like visual via coloring)
  let sectionHeaderCells = ''
  SECTIONS.forEach(s => {
    s.fields.forEach((f, i) => {
      sectionHeaderCells += `<th style="background:${s.color};font-size:11px;color:#666;border:1px solid #ccc;padding:2px 6px">${i === 0 ? esc(s.label) : ''}</th>`
    })
  })

  // Field header row
  const fieldHeaderCells = ALL_FIELDS.map(f =>
    `<th style="background:#e8edf5;font-weight:bold;border:1px solid #ccc;padding:4px 8px;font-size:12px">${esc(f.label)}</th>`
  ).join('')

  // Data rows
  const bodyRows = rows.map(row =>
    '<tr>' + ALL_FIELDS.map(f => `<td style="border:1px solid #ddd;padding:4px 8px">${esc(row[f.key])}</td>`).join('') + '</tr>'
  ).join('\n')

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"
xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"/></head>
<body><table>
<tr>${sectionHeaderCells}</tr>
<tr>${fieldHeaderCells}</tr>
${bodyRows}
</table></body></html>`
}

// ── CSV — semicolon-delimited, UTF-8 BOM ──
function toCSV(rows) {
  const headers = ALL_FIELDS.map(f => f.label)
  const lines = rows.map(row =>
    ALL_FIELDS.map(f => String(row[f.key] ?? '').replace(/;/g, ',')).join(';')
  )
  return '\uFEFF' + headers.join(';') + '\n' + lines.join('\n')
}

// ── JSON — nested structure ──
function toJSON(rows) {
  const structured = rows.map(row => {
    const obj = {}
    SECTIONS.forEach(s => {
      if (s.key === 'general') {
        s.fields.forEach(f => { obj[f.key] = row[f.key] ?? null })
      } else {
        const step = {}
        s.fields.forEach(f => { step[f.key.replace(`${s.key}__`, '')] = row[f.key] ?? null })
        obj[s.key] = step
      }
    })
    return obj
  })
  return JSON.stringify(structured.length === 1 ? structured[0] : structured, null, 2)
}

export function useExportTapes() {
  const exporting = { value: false }

  async function exportTapes({ format, items }) {
    if (!items.length) return
    exporting.value = true
    try {
      const rows = await Promise.all(items.map(t => fetchFullTapeData(t.tape_id)))

      if (format === 'excel') {
        downloadBlob(
          new Blob(['\uFEFF' + toExcel(rows)], { type: 'application/vnd.ms-excel;charset=utf-8' }),
          makeFilename(rows, 'xls')
        )
      } else if (format === 'csv') {
        downloadBlob(
          new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' }),
          makeFilename(rows, 'csv')
        )
      } else if (format === 'json') {
        downloadBlob(
          new Blob([toJSON(rows)], { type: 'application/json;charset=utf-8' }),
          makeFilename(rows, 'json')
        )
      }
    } finally {
      exporting.value = false
    }
  }

  return { exportTapes, exporting }
}
