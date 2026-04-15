// ═══════════════════════════════════════════════════════════════════
// Electrode Stage Definitions — for electrode cut batch constructor
// ═══════════════════════════════════════════════════════════════════

// Target form factor / config code cascade (mirrors backend validator
// in routes/electrodes.js: normalizeCutBatchGeometry)
export const TARGET_FORM_FACTOR_OPTIONS = [
  { value: 'coin', label: 'Монеточный' },
  { value: 'pouch', label: 'Пакетный' },
  { value: 'cylindrical', label: 'Цилиндрический' },
]

export const TARGET_CONFIG_CODE_OPTIONS_BY_FORM_FACTOR = {
  coin: [
    { value: '2016', label: '2016' },
    { value: '2025', label: '2025' },
    { value: '2032', label: '2032' },
    { value: 'other', label: 'Другое' },
  ],
  pouch: [
    { value: '103x83', label: '103 × 83' },
    { value: '86x56', label: '86 × 56' },
    { value: 'other', label: 'Другое' },
  ],
  cylindrical: [
    { value: '18650', label: '18650' },
    { value: '21700', label: '21700' },
    { value: 'other', label: 'Другое' },
  ],
}

// Flat list (unique) used as fallback when no form factor is chosen
export const ALL_TARGET_CONFIG_CODE_OPTIONS = (() => {
  const seen = new Set()
  const out = []
  for (const list of Object.values(TARGET_CONFIG_CODE_OPTIONS_BY_FORM_FACTOR)) {
    for (const o of list) {
      if (!seen.has(o.value)) {
        seen.add(o.value)
        out.push(o)
      }
    }
  }
  return out
})()

// Shape auto-derived from form factor (coin → circle, else → rectangle)
export function shapeForFormFactor(formFactor) {
  if (formFactor === 'coin') return 'circle'
  if (formFactor === 'pouch' || formFactor === 'cylindrical') return 'rectangle'
  return ''
}

// Whether a config_code is valid for the given form factor
export function isConfigCodeValidFor(formFactor, code) {
  if (!formFactor || !code) return false
  const list = TARGET_CONFIG_CODE_OPTIONS_BY_FORM_FACTOR[formFactor] || []
  return list.some(o => o.value === code)
}

export const ELECTRODE_STAGES = [
  {
    code: 'cutting',
    label: 'Нарезка',
    icon: 'pi pi-stop-circle',
    hasApiStep: false, // saved via /api/electrodes/electrode-cut-batches/:id
    fields: [
      { key: 'target_form_factor', label: 'Семейство', type: 'select', options: TARGET_FORM_FACTOR_OPTIONS },
      { key: 'target_config_code', label: 'Конфигурация', type: 'select',
        dependsOn: 'target_form_factor',
        optionsByDep: TARGET_CONFIG_CODE_OPTIONS_BY_FORM_FACTOR,
        fallbackOptions: ALL_TARGET_CONFIG_CODE_OPTIONS,
      },
      { key: 'target_config_other', label: 'Другая конф.', type: 'text' },
      { key: 'shape', label: 'Форма', type: 'select', options: [
        { value: 'circle', label: 'Круг' },
        { value: 'rectangle', label: 'Прямоугольник' },
      ]},
      { key: 'diameter_mm', label: 'Диаметр, мм', type: 'number' },
      { key: 'length_mm', label: 'Длина, мм', type: 'number' },
      { key: 'width_mm', label: 'Ширина, мм', type: 'number' },
      { key: 'comments', label: 'Комментарии', type: 'textarea' },
    ],
  },
  {
    code: 'drying',
    label: 'Сушка',
    icon: 'pi pi-sun',
    hasApiStep: true, // saved via /api/electrodes/electrode-cut-batches/:id/drying
    fields: [
      { key: 'temperature_c', label: 'Температура, °C', type: 'number' },
      { key: 'start_time', label: 'Начало', type: 'text' },
      { key: 'end_time', label: 'Конец', type: 'text' },
      { key: 'other_parameters', label: 'Параметры', type: 'textarea' },
      { key: 'comments', label: 'Комментарии', type: 'textarea' },
    ],
  },
]

export const ELECTRODE_STAGE_CODES = ELECTRODE_STAGES.map(s => s.code)
