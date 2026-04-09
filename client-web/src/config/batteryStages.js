// ═══════════════════════════════════════════════════════════════════
// Battery Stage Definitions — for battery assembly constructor
// ═══════════════════════════════════════════════════════════════════

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
    fields: [
      { key: 'coin_cell_mode', label: 'Режим ячейки', type: 'select', options: [
        { value: 'full_cell', label: 'Full cell' },
        { value: 'half_cell', label: 'Half cell' },
      ]},
      { key: 'coin_size_code', label: 'Размер корпуса', type: 'text' },
      { key: 'coin_layout', label: 'Схема сборки', type: 'select', options: [
        { value: 'SE', label: 'SE' },
        { value: 'ES', label: 'ES' },
        { value: 'ESE', label: 'ESE' },
      ]},
      { key: 'half_cell_type', label: 'Тип полуячейки', type: 'text' },
      { key: 'spacer_thickness_mm', label: 'Толщина спейсера, мм', type: 'number' },
      { key: 'spacer_count', label: 'Кол-во спейсеров', type: 'number' },
      { key: 'spacer_notes', label: 'Заметки (спейсер)', type: 'textarea' },
      { key: 'li_foil_notes', label: 'Li фольга', type: 'textarea' },
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
