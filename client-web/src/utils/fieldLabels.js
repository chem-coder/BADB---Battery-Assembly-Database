// ═══════════════════════════════════════════════════════════════════
// Field label translation for audit log / changelog display.
//
// The field_changelog table stores raw SQL column names (notes,
// project_id, target_mass_g, ...). This utility translates them to
// human-readable Russian labels used in the UI, so the changelog shows
// "Примечания" instead of "notes".
// ═══════════════════════════════════════════════════════════════════

// Common field labels shared across most entities.
const COMMON_LABELS = {
  // Identity / ownership
  name:             'Название',
  active:           'Активен',
  role:             'Роль',
  position:         'Должность',
  department_id:    'Отдел',
  project_id:       'Проект',
  created_by:       'Создал',
  updated_by:       'Изменил',
  performed_by:     'Оператор',
  // Text / notes
  notes:            'Примечания',
  comments:         'Комментарии',
  description:      'Описание',
  // Sizes / measurements
  mass_g:           'Масса, г',
  diameter_mm:      'Диаметр, мм',
  length_mm:        'Длина, мм',
  width_mm:         'Ширина, мм',
  thickness_um:     'Толщина, мкм',
  temperature_c:    'Температура, °C',
  start_time:       'Начало',
  end_time:         'Конец',
  started_at:       'Дата/время',
  other_parameters: 'Доп. параметры',
}

// Per-entity field labels. Fall back to COMMON_LABELS, then to raw name.
const LABELS_BY_ENTITY = {
  // ─── Tape ───
  tape: {
    tape_recipe_id:  'Рецепт',
    calc_mode:       'Расчёт по',
    target_mass_g:   'Целевая масса, г',
    role:            'Тип',
  },

  // ─── Tape recipe ───
  recipe: {
    role:            'Тип',
    target_mass_g:   'Целевая масса, г',
  },

  // ─── Project ───
  project: {
    code:            'Код',
    confidentiality_level: 'Конфиденциальность',
    leader_user_id:  'Руководитель',
  },

  // ─── User ───
  user: {
    login:           'Логин',
  },

  // ─── Electrode cut batch (Dalia's new fields) ───
  electrode_cut_batch: {
    target_form_factor:  'Семейство элемента',
    target_config_code:  'Конфигурация',
    target_config_other: 'Другая конф.',
    shape:               'Форма',
    tape_id:             'Лента',
  },

  // ─── Electrode (single, inside cut batch) ───
  electrode: {
    cup_number:       'Номер стакана',
    electrode_mass_g: 'Масса электрода, г',
  },

  // ─── Electrode drying ───
  electrode_drying: {
    cut_batch_id:     'Партия нарезки',
  },

  // ─── Tape process steps — 7 operation codes ───
  // Audited via routes/tapes.js POST /:id/steps/by-code/:code dispatcher.
  // Each entity_type is `tape_step_${code}` so the same subtype table
  // (e.g. tape_step_drying) can be disambiguated across 3 drying variants.

  // Drying AM (активного материала)
  tape_step_drying_am: {
    atmosphere:          'Атмосфера',
    target_duration_min: 'Длительность, мин',
  },
  // Drying tape (ленты до каландрирования)
  tape_step_drying_tape: {
    atmosphere:          'Атмосфера',
    target_duration_min: 'Длительность, мин',
  },
  // Drying pressed tape (ленты после каландрирования)
  tape_step_drying_pressed_tape: {
    atmosphere:          'Атмосфера',
    target_duration_min: 'Длительность, мин',
  },
  // Weighing (замес пасты — header only, no subtype)
  tape_step_weighing: {
    // all fields covered by COMMON_LABELS (performed_by, started_at, comments)
  },
  // Mixing (перемешивание — dry + wet phases)
  tape_step_mixing: {
    slurry_volume_ml:    'Объём пасты, мл',
    dry_mixing_id:       'Сухая смесь — метод',
    dry_start_time:      'Сухая — начало',
    dry_duration_min:    'Сухая — длительность, мин',
    dry_rpm:             'Сухая — RPM',
    wet_mixing_id:       'Паста — метод',
    wet_start_time:      'Паста — начало',
    wet_duration_min:    'Паста — длительность, мин',
    wet_rpm:             'Паста — RPM',
    viscosity_cp:        'Вязкость, cP',
  },
  // Coating (нанесение)
  tape_step_coating: {
    foil_id:          'Фольга',
    coating_id:       'Метод нанесения',
    gap_um:           'Зазор, мкм',
    coat_temp_c:      'Темп. нанесения, °C',
    coat_time_min:    'Длительность, мин',
    method_comments:  'Параметры метода',
  },
  // Calendering (каландрирование)
  tape_step_calendering: {
    temp_c:                  'Темп. валков, °C',
    pressure_value:          'Давление',
    pressure_units:          'Ед. давления',
    draw_speed_m_min:        'Скорость, м/мин',
    other_params:            'Доп. параметры',
    init_thickness_microns:  'Нач. толщина, мкм',
    final_thickness_microns: 'Кон. толщина, мкм',
    no_passes:               'Кол-во проходов',
    appearance:              'Внешний вид',
  },

  // ─── Foil mass measurement ───
  foil_measurement: {
    mass_g:           'Масса фольги, г',
  },

  // ─── Battery ───
  battery: {
    form_factor:      'Форм-фактор',
    battery_notes:    'Заметки',
  },

  // ─── Battery coin config ───
  battery_coin_config: {
    coin_cell_mode:       'Режим ячейки',
    coin_size_code:       'Размер корпуса',
    half_cell_type:       'Тип полуячейки',
    coin_layout:          'Схема сборки',
    spacer_thickness_mm:  'Толщина спейсера, мм',
    spacer_count:         'Кол-во спейсеров',
    spacer_notes:         'Заметки (спейсер)',
    li_foil_notes:        'Li фольга',
  },

  // ─── Battery pouch config (Dalia's new fields) ───
  battery_pouch_config: {
    pouch_case_size_code:  'Корпус (пауч)',
    pouch_case_size_other: 'Другой корпус',
    pouch_notes:           'Заметки (пауч)',
  },

  // ─── Battery cylindrical config ───
  battery_cyl_config: {
    cyl_size_code:    'Размер (цил.)',
    cyl_notes:        'Заметки (цил.)',
  },

  // ─── Battery electrode sources (cathode / anode) ───
  battery_electrode_source_cathode: {
    tape_id:          'Катодная лента',
    cut_batch_id:     'Катодная партия',
    source_notes:     'Заметки (катод)',
  },
  battery_electrode_source_anode: {
    tape_id:          'Анодная лента',
    cut_batch_id:     'Анодная партия',
    source_notes:     'Заметки (анод)',
  },

  // ─── Separator ───
  separator: {
    thickness_um:     'Толщина, мкм',
    porosity_pct:     'Пористость, %',
    material_desc:    'Материал',
    manufacturer:     'Производитель',
  },

  // ─── Electrolyte ───
  electrolyte: {
    composition_desc: 'Состав',
    manufacturer:     'Производитель',
  },

  // ─── Separator structure ───
  sep_structure: {
    sep_id:           'Сепаратор',
  },

  // ─── Material / material instance / component ───
  material: {
    category:         'Категория',
    formula:          'Формула',
    manufacturer:     'Производитель',
  },
  material_instance: {
    material_id:      'Материал',
    lot_number:       'Номер партии',
    received_at:      'Получено',
    received_mass_g:  'Масса при получении, г',
  },
  material_composition: {
    material_instance_id: 'Экземпляр',
  },
  material_component: {
    child_instance_id: 'Дочерний экземпляр',
    fraction:          'Доля',
  },

  // ─── Project access (used by access audit) ───
  project_access: {
    access_level:     'Уровень доступа',
    grantee_type:     'Тип получателя',
    expires_at:       'Срок действия',
  },
}

/**
 * Resolve a field column name to its Russian UI label.
 *
 * @param {string} entityType — audit entity_type (e.g. 'tape', 'battery')
 * @param {string} fieldName  — raw SQL column name (e.g. 'notes', 'project_id')
 * @returns {string} human-readable label or the raw field name as fallback
 */
export function fieldLabel(entityType, fieldName) {
  if (!fieldName) return '—'
  const scoped = LABELS_BY_ENTITY[entityType]?.[fieldName]
  if (scoped) return scoped
  if (COMMON_LABELS[fieldName]) return COMMON_LABELS[fieldName]
  return fieldName
}
