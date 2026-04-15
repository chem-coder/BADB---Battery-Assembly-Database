// ═══════════════════════════════════════════════════════════════════
// Battery Stage Definitions — for battery assembly constructor
// ═══════════════════════════════════════════════════════════════════

// Pouch case size options (mirrors backend validator in routes/batteries.js:
// validatePouchCaseSizeInput)
export const POUCH_CASE_SIZE_OPTIONS = [
  { value: '103x83', label: '103 × 83' },
  { value: '86x56', label: '86 × 56' },
  { value: 'other', label: 'Другое' },
]

// Coin cell size codes (free-text field, but these are the known ones)
export const COIN_SIZE_OPTIONS = [
  { value: '2016', label: '2016' },
  { value: '2025', label: '2025' },
  { value: '2032', label: '2032' },
]

// Cylindrical case size codes (backend field is free-text cyl_size_code with
// no separate "other" field — unlike electrode cut batches or pouch. If users
// need a non-standard size, they use the cyl_notes textarea.)
export const CYL_SIZE_OPTIONS = [
  { value: '18650', label: '18650' },
  { value: '21700', label: '21700' },
  { value: '26650', label: '26650' },
  { value: '32700', label: '32700' },
]

export const BATTERY_STAGES = [
  {
    code: 'general',
    label: 'Общее',
    icon: 'pi pi-info-circle',
    hasApiStep: false,
    fields: [
      { key: 'form_factor', label: 'Форм-фактор', type: 'select', options: [
        { value: 'coin', label: 'Монеточный' },
        { value: 'pouch', label: 'Пакетный' },
        { value: 'cylindrical', label: 'Цилиндрический' },
      ]},
      { key: 'project_id', label: 'Проект', type: 'select', ref: 'projects' },
      { key: 'battery_notes', label: 'Заметки', type: 'textarea' },
    ],
  },
  {
    code: 'config',
    label: 'Конфигурация',
    icon: 'pi pi-cog',
    hasApiStep: true,
    // `showIfFormFactor` is a cross-stage visibility hint used by
    // StageCompareEditor. Fields with this key are only rendered when at
    // least one tape in the current view has a matching general.form_factor.
    // If no tape has a form_factor set yet, all fields are shown (fall-back).
    fields: [
      // ── Coin-cell fields ──
      { key: 'coin_cell_mode', label: 'Режим ячейки', type: 'select', showIfFormFactor: 'coin', options: [
        { value: 'full_cell', label: 'Full cell' },
        { value: 'half_cell', label: 'Half cell' },
      ]},
      { key: 'coin_size_code', label: 'Размер корпуса', type: 'select', showIfFormFactor: 'coin', options: COIN_SIZE_OPTIONS },
      { key: 'coin_layout', label: 'Схема сборки', type: 'select', showIfFormFactor: 'coin', options: [
        { value: 'SE', label: 'SE' },
        { value: 'ES', label: 'ES' },
        { value: 'ESE', label: 'ESE' },
      ]},
      { key: 'half_cell_type', label: 'Тип полуячейки', type: 'text', showIfFormFactor: 'coin' },
      { key: 'spacer_thickness_mm', label: 'Толщина спейсера, мм', type: 'number', showIfFormFactor: 'coin' },
      { key: 'spacer_count', label: 'Кол-во спейсеров', type: 'number', showIfFormFactor: 'coin' },
      { key: 'spacer_notes', label: 'Заметки (спейсер)', type: 'textarea', showIfFormFactor: 'coin' },
      { key: 'li_foil_notes', label: 'Li фольга', type: 'textarea', showIfFormFactor: 'coin' },
      // ── Pouch-cell fields (Dalia's new schema: battery_pouch_config) ──
      { key: 'pouch_case_size_code', label: 'Корпус (пауч)', type: 'select', showIfFormFactor: 'pouch', options: POUCH_CASE_SIZE_OPTIONS },
      { key: 'pouch_case_size_other', label: 'Другой корпус', type: 'text', showIfFormFactor: 'pouch' },
      { key: 'pouch_notes', label: 'Заметки (пауч)', type: 'textarea', showIfFormFactor: 'pouch' },
      // ── Cylindrical-cell fields (battery_cyl_config) ──
      { key: 'cyl_size_code', label: 'Размер (цил.)', type: 'select', showIfFormFactor: 'cylindrical', options: CYL_SIZE_OPTIONS },
      { key: 'cyl_notes', label: 'Заметки (цил.)', type: 'textarea', showIfFormFactor: 'cylindrical' },
    ],
  },
  {
    code: 'electrodes',
    label: 'Электроды',
    icon: 'pi pi-clone',
    hasApiStep: true,
    fields: [
      { key: 'cathode_tape_id', label: 'Катодная лента', type: 'select', ref: 'cathodeTapes' },
      { key: 'cathode_cut_batch_id', label: 'Катодная партия', type: 'select', ref: 'electrodeBatches',
        refConfig: { idField: 'cut_batch_id', nameField: '_label' } },
      { key: 'cathode_source_notes', label: 'Заметки (катод)', type: 'textarea' },
      { key: 'anode_tape_id', label: 'Анодная лента', type: 'select', ref: 'anodeTapes' },
      { key: 'anode_cut_batch_id', label: 'Анодная партия', type: 'select', ref: 'electrodeBatches',
        refConfig: { idField: 'cut_batch_id', nameField: '_label' } },
      { key: 'anode_source_notes', label: 'Заметки (анод)', type: 'textarea' },
    ],
  },
  {
    code: 'separator',
    label: 'Сепаратор',
    icon: 'pi pi-minus',
    hasApiStep: true,
    fields: [
      { key: 'separator_id', label: 'Сепаратор', type: 'select', ref: 'separators' },
      { key: 'separator_notes', label: 'Заметки', type: 'textarea' },
    ],
  },
  {
    code: 'electrolyte',
    label: 'Электролит',
    icon: 'pi pi-database',
    hasApiStep: true,
    fields: [
      { key: 'electrolyte_id', label: 'Электролит', type: 'select', ref: 'electrolytes' },
      { key: 'electrolyte_total_ul', label: 'Объём, мкл', type: 'number' },
      { key: 'electrolyte_notes', label: 'Заметки', type: 'textarea' },
    ],
  },
  {
    code: 'assembly',
    label: 'Сборка',
    icon: 'pi pi-wrench',
    hasApiStep: true,
    fields: [
      { key: 'separator_layout', label: 'Схема укладки', type: 'select', options: [
        { value: 'ESE', label: 'ESE (электрод-сепаратор-электрод)' },
        { value: 'ES', label: 'ES (электрод-сепаратор)' },
        { value: 'SE', label: 'SE (сепаратор-электрод)' },
      ]},
      { key: 'electrolyte_assembly_notes', label: 'Заметки по заливке', type: 'textarea' },
    ],
  },
  {
    code: 'qc',
    label: 'Контроль',
    icon: 'pi pi-check-circle',
    hasApiStep: true,
    fields: [
      { key: 'ocv_v', label: 'OCV, В', type: 'number' },
      { key: 'esr_mohm', label: 'ESR, мОм', type: 'number' },
      { key: 'qc_notes', label: 'Заметки КК', type: 'textarea' },
      { key: 'electrochem_notes', label: 'Электрохимия', type: 'textarea' },
    ],
  },
]

export const BATTERY_STAGE_CODES = BATTERY_STAGES.map(s => s.code)
