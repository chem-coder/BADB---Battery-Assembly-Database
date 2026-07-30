// ═══════════════════════════════════════════════════════════════════
// Tape Stage Definitions — shared between Constructor, Navigator, Editor
// ═══════════════════════════════════════════════════════════════════

import { todayIsoMsk } from '@/utils/dateFormat'

/**
 * Each stage has:
 *  - code: matches API step codes and dirty-flag keys
 *  - label: display name (Russian)
 *  - icon: PrimeIcons class
 *  - hasApiStep: whether this stage uses /api/tapes/:id/steps/by-code/:code
 *  - fields: list of field descriptors for comparison view
 */

// ── d047: recipe ↔ active material role compatibility ────────────────
// Recipes are reusable formulations with an open active-material slot;
// the tape picks the chemistry via tapes.active_material_id. A recipe
// of role 'cathode' pairs only with materials of role 'cathode_active'
// (same for anode). Shared with useTapeState's compat-reset logic.
export const RECIPE_ROLE_TO_MATERIAL_ROLE = {
  cathode: 'cathode_active',
  anode: 'anode_active',
}
export const MATERIAL_ROLE_TO_RECIPE_ROLE = {
  cathode_active: 'cathode',
  anode_active: 'anode',
}

// ── d048: wet-mixing method capabilities ─────────────────────────────
// wet_mixing_methods rows now carry `uses_balls` / `uses_containers`
// flags (planetary-centrifugal mixers like the Vilitek V-ITT-300s use
// agate milling balls inside dedicated cups). The container select and
// the balls editor in the mixing stage are only shown when the selected
// method has the matching flag.
function _selectedWetMethodHas(steps, refs, flag) {
  const id = steps?.mixing?.wetMixingId
  if (!id && id !== 0) return false
  const m = (refs?.wetMixingMethods || []).find(
    (x) => String(x.wet_mixing_id) === String(id)
  )
  return !!m?.[flag]
}

// max_working_volume_ml of the currently selected mixing container
// (slurry + balls working limit; null when no container or no limit).
function _selectedContainerMaxMl(steps, refs) {
  const cid = steps?.mixing?.containerId
  if (!cid && cid !== 0) return null
  const c = (refs?.mixingContainers || []).find(
    (x) => String(x.container_id) === String(cid)
  )
  const v = Number(c?.max_working_volume_ml)
  return Number.isFinite(v) && v > 0 ? v : null
}

export const TAPE_STAGES = [
  {
    code: 'general_info',
    label: 'Общая информация',
    icon: 'pi pi-info-circle',
    hasApiStep: false, // general info is saved via /api/tapes directly
    fields: [
      { key: 'name',         label: 'Название',       type: 'text' },
      { key: 'projectIds',   label: 'Проекты',         type: 'multiselect', ref: 'projects' },
      // Business date can be backdated but never lies in the future —
      // `max` is a function so "today" is evaluated at render time, not
      // at module load (long-lived tabs cross midnight).
      { key: 'itemCreatedAt', label: 'Дата создания партии', type: 'date', max: () => todayIsoMsk() },
      { key: 'tapeType',     label: 'Тип',             type: 'select', options: [
        { value: 'cathode', label: 'Катод' }, { value: 'anode', label: 'Анод' },
      ]},
      // d047 — bidirectional role filtering with «Активный материал»:
      // once a material is chosen, only recipes of the matching
      // electrode role are offered (and vice versa below).
      { key: 'tapeRecipeId', label: 'Рецепт',          type: 'select', ref: 'recipes',
        optionsFilter: (recipe, general, refs) => {
          const matId = general?.activeMaterialId
          if (!matId) return true
          const mat = (refs?.materials || []).find(m => String(m.material_id) === String(matId))
          const wanted = mat ? MATERIAL_ROLE_TO_RECIPE_ROLE[mat.role] : null
          return wanted ? recipe.role === wanted : true
        },
      },
      // d047 — the tape's chemistry for the recipe's open slot. Options
      // are grouped by material `family` via a label prefix + sort (the
      // constructor's AutoComplete renders flat lists, no optgroups).
      { key: 'activeMaterialId', label: 'Активный материал', type: 'select', ref: 'materials',
        refConfig: { idField: 'material_id', nameField: 'name' },
        optionsFilter: (mat, general, refs) => {
          if (!MATERIAL_ROLE_TO_RECIPE_ROLE[mat.role]) return false
          const rid = general?.tapeRecipeId
          if (!rid) return true
          const recipe = (refs?.recipes || []).find(r => String(r.tape_recipe_id) === String(rid))
          const wanted = recipe ? RECIPE_ROLE_TO_MATERIAL_ROLE[recipe.role] : null
          return wanted ? mat.role === wanted : true
        },
        optionLabel: (mat) => (mat.family ? `«${mat.family}» — ${mat.name}` : mat.name),
        optionsSort: (a, b) => {
          const fa = a.family || ''
          const fb = b.family || ''
          if (fa !== fb) {
            if (!fa) return 1   // family-less materials go last
            if (!fb) return -1
            return fa.localeCompare(fb, 'ru')
          }
          return (a.name || '').localeCompare(b.name || '', 'ru')
        },
      },
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
      // d048 — mixing cup for planetary-centrifugal mixers. Shown only
      // when the selected wet method uses containers (Vilitek). Label
      // includes the working limit WITH balls when the row has one
      // (e.g. «Стакан 375 мл — до 200 мл с шарами»).
      { key: 'containerId',    label: 'Стакан/ёмкость',         type: 'select', ref: 'mixingContainers', group: 'wet_mixing',
        refConfig: { idField: 'container_id', nameField: 'name' },
        optionLabel: (c) => {
          const max = Number(c.max_working_volume_ml)
          return Number.isFinite(max) && max > 0
            ? `${c.name} — до ${max.toLocaleString('ru-RU')} мл с шарами`
            : (c.name || '')
        },
        visibleIf: (general, steps, refs) => _selectedWetMethodHas(steps, refs, 'uses_containers'),
      },
      // d048 — agate milling balls: three fixed diameters, checkbox +
      // count each. Rendered by MixingBallsEditor.vue (compound widget —
      // the generic field types can't express checkbox+count rows with a
      // live suggestion hint). State: steps.mixing.balls =
      // [{diameter_cm, ball_count}], checked rows with count>0 only.
      { key: 'balls',          label: 'Шары (агат)',            type: 'mixing-balls', group: 'wet_mixing',
        visibleIf: (general, steps, refs) => _selectedWetMethodHas(steps, refs, 'uses_balls'),
        componentProps: (general, steps, refs) => ({
          slurryVolumeMl: steps?.mixing?.slurryVolumeMl ?? '',
          maxWorkingVolumeMl: _selectedContainerMaxMl(steps, refs),
        }),
      },
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
      // Parity — vanilla «Комментарий к нанесению и сушке» (payload key
      // method_comments, column tape_step_coating.method_comments).
      // Distinct from `notes` → step-header `comments`.
      { key: 'method_comments', label: 'Комментарий к нанесению и сушке', type: 'textarea' },
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
