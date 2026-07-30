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
        // d036 + docs/current/batteries.md: prism is its own form_factor
        // but intentionally reuses the pouch-like config (battery_pouch_config).
        { value: 'prism', label: 'Призматическая' },
        { value: 'cylindrical', label: 'Цилиндрический' },
      ]},
      { key: 'project_ids', label: 'Проекты', type: 'multiselect', ref: 'projects' },
      // d054: batteries are assembled in glovebox BATCHES — this is the
      // batch assembly start moment (stored per battery as TIMESTAMPTZ).
      // State holds a naive MSK 'YYYY-MM-DDTHH:mm:ss' string; the
      // composable converts at the save/restore boundary.
      { key: 'item_created_at', label: 'Дата и время создания партии', type: 'datetime-iso' },
      { key: 'purpose', label: 'Цель партии', type: 'textarea' },
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
      // Label + option labels/order verbatim from vanilla
      // (public/workflow/3-batteries.html:817-835, fieldset #coin_layout).
      // Stored values stay 'ESE'/'ES'/'SE' — battery_coin_config.coin_layout.
      { key: 'coin_layout', label: 'Схема расположения сепаратора и электролита', type: 'select', showIfFormFactor: 'coin', options: [
        { value: 'ESE', label: 'E-S-E' },
        { value: 'ES', label: 'E-S' },
        { value: 'SE', label: 'S-E' },
      ]},
      // Vanilla parity (3-batteries.html #coin_half_cell_type): a SELECT.
      // Was type:'text' — free-typed values like «anode v Li» broke the
      // exact-match role logic in AssemblyPage (_cathode_is_li/_anode_is_li)
      // and killed batch selection (2026-07-30).
      { key: 'half_cell_type', label: 'Тип полуячейки', type: 'select', showIfFormFactor: 'coin', options: [
        { value: 'cathode_vs_li', label: 'Катодный материал || Li/Li⁺' },
        { value: 'anode_vs_li', label: 'Анодный материал || Li/Li⁺' },
      ]},
      { key: 'spacer_thickness_mm', label: 'Толщина спейсера, мм', type: 'number', showIfFormFactor: 'coin' },
      { key: 'spacer_count', label: 'Кол-во спейсеров', type: 'number', showIfFormFactor: 'coin' },
      { key: 'spacer_notes', label: 'Заметки (спейсер)', type: 'textarea', showIfFormFactor: 'coin' },
      { key: 'li_foil_notes', label: 'Li фольга', type: 'textarea', showIfFormFactor: 'coin' },
      // ── Pouch-cell fields (Dalia's new schema: battery_pouch_config) ──
      // Prism reuses the pouch config table + fields (d036) — hence the
      // ['pouch', 'prism'] visibility (showIfFormFactor accepts arrays).
      { key: 'pouch_case_size_code', label: 'Корпус (пауч)', type: 'select', showIfFormFactor: ['pouch', 'prism'], options: POUCH_CASE_SIZE_OPTIONS },
      { key: 'pouch_case_size_other', label: 'Другой корпус', type: 'text', showIfFormFactor: ['pouch', 'prism'] },
      { key: 'pouch_notes', label: 'Заметки (пауч)', type: 'textarea', showIfFormFactor: ['pouch', 'prism'] },
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
    // Multi-source rows per role (vanilla parity). Each field backs onto
    // an ARRAY of {tape_id, cut_batch_id, source_notes} rows in
    // useBatteryState (`cathodeSources` / `anodeSources`, row 0 =
    // primary) rendered by ElectrodeSourcesEditor via the
    // 'electrode-sources' branch in StageCompareEditor. `role` routes
    // tape/batch filtering inside the editor.
    fields: [
      { key: 'cathodeSources', label: 'Катодные источники', type: 'electrode-sources', role: 'cathode' },
      { key: 'anodeSources', label: 'Анодные источники', type: 'electrode-sources', role: 'anode' },
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
  // NB: there is deliberately NO 'assembly' stage. Vanilla's «4 Параметры
  // сборки» section maps onto the config (coin_layout, spacer), separator
  // and electrolyte stages above. The stage that used to sit here held only
  // phantom fields with no backend column or restore path — `separator_layout`
  // (duplicated battery_coin_config.coin_layout and could null the config
  // value on autosave) and `electrolyte_assembly_notes` (PATCHed nowhere,
  // silently lost) — both removed 2026-07-17. Don't reintroduce a stage here
  // without a real column to persist to.
  {
    code: 'qc',
    label: 'Контроль',
    icon: 'pi pi-check-circle',
    hasApiStep: true,
    fields: [
      // d054: the batch testing moment (OCV/ESR measured for the whole
      // glovebox batch; stored per battery in battery_qc.tested_at).
      { key: 'tested_at', label: 'Дата и время тестирования партии', type: 'datetime-iso' },
      { key: 'ocv_v', label: 'OCV, В', type: 'number' },
      { key: 'esr_mohm', label: 'ESR, мОм', type: 'number' },
      { key: 'qc_notes', label: 'Заметки КК', type: 'textarea' },
      // NB: electrochem measurement data lives in the separate
      // battery_electrochem table (file attachments + per-file notes),
      // rendered by <BatteryElectrochemEditor> on AssemblyPage. The
      // previously-here "Электрохимия" textarea was misleading — it
      // used to save into batteries.battery_notes together with OCV/ESR
      // as a formatted string, bypassing the dedicated tables.
    ],
  },
]

export const BATTERY_STAGE_CODES = BATTERY_STAGES.map(s => s.code)
