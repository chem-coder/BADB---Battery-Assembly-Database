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
      { key: 'projectId',    label: 'Проект',          type: 'select', ref: 'projects' },
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
      { key: 'date',           label: 'Дата',               type: 'date' },
      { key: 'time',           label: 'Время',              type: 'time' },
      { key: 'temperature',    label: 'Температура, °C',    type: 'number' },
      { key: 'atmosphere',     label: 'Атмосфера',          type: 'select', ref: 'atmospheres' },
      { key: 'targetDuration', label: 'Длительность, мин',  type: 'number' },
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
      { key: 'date',     label: 'Дата',         type: 'date' },
      { key: 'time',     label: 'Время',        type: 'time' },
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
      { key: 'date',           label: 'Дата',                    type: 'date' },
      { key: 'time',           label: 'Время',                   type: 'time' },
      { key: 'slurryVolumeMl', label: 'Объём пасты, мл',        type: 'number' },
      { key: 'dryMixingId',    label: 'Сухая смесь — метод',    type: 'select', ref: 'dryMixingMethods' },
      { key: 'dryDurationMin', label: 'Сухая — длительность',   type: 'number' },
      { key: 'dryRpm',         label: 'Сухая — RPM',            type: 'text' },
      { key: 'wetMixingId',    label: 'Паста — метод',          type: 'select', ref: 'wetMixingMethods' },
      { key: 'wetDurationMin', label: 'Паста — длительность',   type: 'number' },
      { key: 'wetRpm',         label: 'Паста — RPM',            type: 'text' },
      { key: 'viscosityCp',    label: 'Вязкость, cP',          type: 'number' },
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
      { key: 'date',       label: 'Дата',               type: 'date' },
      { key: 'time',       label: 'Время',              type: 'time' },
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
      { key: 'date',           label: 'Дата',               type: 'date' },
      { key: 'time',           label: 'Время',              type: 'time' },
      { key: 'temperature',    label: 'Температура, °C',    type: 'number' },
      { key: 'atmosphere',     label: 'Атмосфера',          type: 'select', ref: 'atmospheres' },
      { key: 'targetDuration', label: 'Длительность, мин',  type: 'number' },
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
      { key: 'date',                  label: 'Дата',                    type: 'date' },
      { key: 'time',                  label: 'Время',                   type: 'time' },
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
      { key: 'date',           label: 'Дата',               type: 'date' },
      { key: 'time',           label: 'Время',              type: 'time' },
      { key: 'temperature',    label: 'Температура, °C',    type: 'number' },
      { key: 'atmosphere',     label: 'Атмосфера',          type: 'select', ref: 'atmospheres' },
      { key: 'targetDuration', label: 'Длительность, мин',  type: 'number' },
      { key: 'otherParam',     label: 'Доп. параметры',     type: 'textarea' },
      { key: 'notes',          label: 'Примечания',         type: 'textarea' },
    ],
  },
]

export const STAGE_CODES = TAPE_STAGES.map(s => s.code)

export function getStageByCode(code) {
  return TAPE_STAGES.find(s => s.code === code)
}
