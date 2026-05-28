// ═══════════════════════════════════════════════════════════════════
// Tape Stage Definitions — shared between Constructor, Navigator, Editor
// ═══════════════════════════════════════════════════════════════════

/**
 * Each stage has:
 *  - code: matches API step codes and dirty-flag keys
 *  - label: display name (Russian)
 *  - icon: PrimeIcons class
 *  - hasApiStep: whether this stage uses /api/tapes/:id/steps/by-code/:code
 *  - fields: list of field descriptors for comparison view
 */
export const TAPE_STAGES = [
  {
    code: 'general_info',
    label: 'Общая информация',
    icon: 'pi pi-info-circle',
    hasApiStep: false, // general info is saved via /api/tapes directly
    fields: [
      { key: 'name',         label: 'Название',       type: 'text' },
      { key: 'projectIds',   label: 'Проекты',         type: 'multiselect', ref: 'projects' },
      { key: 'itemCreatedAt', label: 'Дата создания партии', type: 'date' },
      { key: 'tapeType',     label: 'Тип',             type: 'select', options: [
        { value: 'cathode', label: 'Катод' }, { value: 'anode', label: 'Анод' },
      ]},
      { key: 'tapeRecipeId', label: 'Рецепт',          type: 'select', ref: 'recipes' },
      { key: 'calcMode',     label: 'Расчёт по',       type: 'select', options: [
        { value: 'from_active_mass', label: 'массе активного материала' },
        { value: 'from_slurry_mass', label: 'общей массе суспензии' },
      ]},
      { key: 'targetMassG',  label: 'Масса, г',        type: 'number' },
      { key: 'tapeNotes',    label: 'Примечания',      type: 'textarea' },
    ],
  },
  {
    code: 'drying_am',
    label: 'Сушка АМ',
    icon: 'pi pi-sun',
    hasApiStep: true,
    fields: [
      { key: 'operator',       label: 'Оператор',          type: 'select', ref: 'users' },
      { key: 'datetime',       label: 'Дата + время',       type: 'datetime-with-now',
        dateKey: 'date', timeKey: 'time' },
      { key: 'temperature',    label: 'Температура, °C',    type: 'number' },
      { key: 'atmosphere',     label: 'Атмосфера',          type: 'select', ref: 'atmospheres' },
      { key: 'targetDuration', label: 'Длительность, мин',  type: 'number' },
      { key: 'drying_speed_text', label: 'Скорость',        type: 'text' },
      { key: 'otherParam',     label: 'Доп. параметры',     type: 'textarea' },
      { key: 'notes',          label: 'Примечания',         type: 'textarea' },
    ],
  },
  {
    code: 'weighing',
    label: 'Замес пасты',
    icon: 'pi pi-chart-bar',
    hasApiStep: true,
    fields: [
      { key: 'operator', label: 'Оператор',    type: 'select', ref: 'users' },
      { key: 'datetime', label: 'Дата + время', type: 'sequential-datetime',
        dateKey: 'date', timeKey: 'time', prevStageCode: 'drying_am' },
      { key: 'notes',    label: 'Примечания',   type: 'textarea' },
    ],
  },
  {
    code: 'mixing',
    label: 'Перемешивание',
    icon: 'pi pi-sync',
    hasApiStep: true,
    fields: [
      { key: 'operator',       label: 'Оператор',               type: 'select', ref: 'users' },
      { key: 'datetime',       label: 'Дата + время',            type: 'sequential-datetime',
        dateKey: 'date', timeKey: 'time', prevStageCode: 'weighing' },
      { key: 'slurryVolumeMl', label: 'Объём пасты, мл',        type: 'number' },
      // ── Группа: Сухое смешивание ──
      { isGroupSeparator: true, group: 'dry_mixing',
        label: 'Сухое смешивание', persistKey: 'mixing-dry' },
      { key: 'dryMixingId',    label: 'Метод',                  type: 'select', ref: 'dryMixingMethods', group: 'dry_mixing' },
      { key: 'dryDurationMin', label: 'Длительность, мин',      type: 'number', group: 'dry_mixing' },
      { key: 'dryRpm',         label: 'RPM',                    type: 'text',   group: 'dry_mixing' },
      // ── Группа: Мокрое смешивание ──
      { isGroupSeparator: true, group: 'wet_mixing',
        label: 'Мокрое смешивание (паста)', persistKey: 'mixing-wet' },
      { key: 'wetMixingId',    label: 'Метод',                  type: 'select', ref: 'wetMixingMethods', group: 'wet_mixing' },
      { key: 'wetDurationMin', label: 'Длительность, мин',      type: 'number', group: 'wet_mixing' },
      { key: 'wetRpm',         label: 'RPM',                    type: 'text',   group: 'wet_mixing' },
      { key: 'viscosityCp',    label: 'Вязкость, cP',          type: 'number', group: 'wet_mixing' },
      { key: 'viscosity_conditions', label: 'Условия измерения вязкости', type: 'text', group: 'wet_mixing' },
      { key: 'notes',          label: 'Примечания',             type: 'textarea' },
    ],
  },
  {
    code: 'coating',
    label: 'Нанесение',
    icon: 'pi pi-pencil',
    hasApiStep: true,
    fields: [
      { key: 'operator',   label: 'Оператор',          type: 'select', ref: 'users' },
      { key: 'datetime',   label: 'Дата + время',       type: 'sequential-datetime',
        dateKey: 'date', timeKey: 'time', prevStageCode: 'mixing' },
      { key: 'foilId',     label: 'Фольга',             type: 'select', ref: 'foils' },
      { key: 'coatingId',  label: 'Метод нанесения',    type: 'select', ref: 'coatingMethods' },
      // Coating sidedness — enum column added by Dalia in migration d024.
      // Inline options (no reference table) because it's only 2 fixed values.
      // Backfilled for existing rows in d025: dr_blade → one_sided,
      // coater_machine → two_sided. User can still override per coating.
      { key: 'coatingSidedness', label: 'Сторонность покрытия', type: 'select', options: [
        { value: 'one_sided', label: '1-сторонняя' },
        { value: 'two_sided', label: '2-сторонняя' },
      ]},
      // d033 + d040 — gap and measured thickness per side. For 1-sided
      // coatings only side-1 values are meaningful; the side-2 fields
      // are still shown so vanilla v1 records aren't hidden.
      { key: 'gap_um',                   label: 'Зазор сторона 1, мкм',     type: 'number' },
      { key: 'gap_um_side2',             label: 'Зазор сторона 2, мкм',     type: 'number' },
      { key: 'coated_thickness_um',      label: 'Толщина покрытия с1, мкм', type: 'number' },
      { key: 'coated_thickness_um_side2',label: 'Толщина покрытия с2, мкм', type: 'number' },
      { key: 'notes',      label: 'Примечания',         type: 'textarea' },
    ],
  },
  {
    code: 'drying_tape',
    label: 'Сушка ленты',
    icon: 'pi pi-sun',
    hasApiStep: true,
    fields: [
      { key: 'operator',       label: 'Оператор',          type: 'select', ref: 'users' },
      { key: 'datetime',       label: 'Дата + время',       type: 'sequential-datetime',
        dateKey: 'date', timeKey: 'time', prevStageCode: 'coating' },
      { key: 'temperature',    label: 'Температура, °C',    type: 'number' },
      { key: 'atmosphere',     label: 'Атмосфера',          type: 'select', ref: 'atmospheres' },
      { key: 'targetDuration', label: 'Длительность, мин',  type: 'number' },
      { key: 'drying_speed_text', label: 'Скорость',        type: 'text' },
      { key: 'otherParam',     label: 'Доп. параметры',     type: 'textarea' },
      { key: 'notes',          label: 'Примечания',         type: 'textarea' },
    ],
  },
  {
    code: 'calendering',
    label: 'Каландрирование',
    icon: 'pi pi-arrows-h',
    hasApiStep: true,
    fields: [
      { key: 'operator',              label: 'Оператор',               type: 'select', ref: 'users' },
      { key: 'datetime',              label: 'Дата + время',            type: 'sequential-datetime',
        dateKey: 'date', timeKey: 'time', prevStageCode: 'drying_tape' },
      { key: 'tempC',                 label: 'Темп. валков, °C',        type: 'number' },
      { key: 'pressureValue',         label: 'Давление',                type: 'number' },
      { key: 'pressureUnits',         label: 'Ед. давления',            type: 'select', options: [
        { value: 'bar', label: 'bar' }, { value: 'MPa', label: 'MPa' }, { value: 'kN', label: 'kN' },
      ]},
      { key: 'drawSpeedMMin',         label: 'Скорость, м/мин',         type: 'number' },
      { key: 'initThicknessMicrons',  label: 'Нач. толщина, мкм',       type: 'number' },
      { key: 'finalThicknessMicrons', label: 'Кон. толщина, мкм',       type: 'number' },
      { key: 'noPasses',              label: 'Кол-во проходов',         type: 'number' },
      { key: 'otherParams',           label: 'Доп. параметры',          type: 'textarea' },
      // ── Группа: Внешний вид ── (audit #10 — composable already
      // serialises these to `appearance` text column; UI was missing.)
      { isGroupSeparator: true, group: 'cal_appearance',
        label: 'Внешний вид', persistKey: 'cal-appearance' },
      { key: 'shine',      label: 'Блеск',                type: 'boolean', group: 'cal_appearance' },
      { key: 'curl',       label: 'Закрутка',             type: 'boolean', group: 'cal_appearance' },
      { key: 'dots',       label: 'Точечки',              type: 'boolean', group: 'cal_appearance' },
      { key: 'otherCheck', label: 'Другое (отметить)',    type: 'boolean', group: 'cal_appearance' },
      { key: 'otherText',  label: 'Другое (описание)',    type: 'text',    group: 'cal_appearance' },
      { key: 'notes',                 label: 'Примечания',              type: 'textarea' },
    ],
  },
  {
    code: 'drying_pressed_tape',
    label: 'Сушка готовой ленты',
    icon: 'pi pi-sun',
    hasApiStep: true,
    fields: [
      { key: 'operator',       label: 'Оператор',          type: 'select', ref: 'users' },
      { key: 'datetime',       label: 'Дата + время',       type: 'sequential-datetime',
        dateKey: 'date', timeKey: 'time', prevStageCode: 'calendering' },
      { key: 'temperature',    label: 'Температура, °C',    type: 'number' },
      { key: 'atmosphere',     label: 'Атмосфера',          type: 'select', ref: 'atmospheres' },
      { key: 'targetDuration', label: 'Длительность, мин',  type: 'number' },
      { key: 'drying_speed_text', label: 'Скорость',        type: 'text' },
      { key: 'otherParam',     label: 'Доп. параметры',     type: 'textarea' },
      { key: 'notes',          label: 'Примечания',         type: 'textarea' },
    ],
  },
]

export const STAGE_CODES = TAPE_STAGES.map(s => s.code)

export function getStageByCode(code) {
  return TAPE_STAGES.find(s => s.code === code)
}
