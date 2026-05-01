// ═══════════════════════════════════════════════════════════════════
// BADB Navigation — Single Source of Truth
// ═══════════════════════════════════════════════════════════════════
//
// Этот файл — ЕДИНСТВЕННОЕ место где определяются разделы, названия
// и маршруты. Sidebar и Router импортируют отсюда.
//
// Названия ДОЛЖНЫ совпадать с Далиным public/index.html:
//   Основная папка → СОЗДАНИЕ
//   Справочная папка → СПРАВОЧНИКИ
//
// При обновлении Далиного репо — менять ТОЛЬКО этот файл.
// ═══════════════════════════════════════════════════════════════════

// --- СОЗДАНИЕ (Далины: Основная папка / workflow) ---
// Источник: public/index.html + public/workflow/*.html
export const workflowSections = [
  {
    key: 'tapes',
    label: 'Подготовка лент',           // Дали: "Ленты | Подготовка новой ленты"
    shortLabel: 'Ленты',                // короткое для KPI-карточки
    path: '/tapes',
    apiPath: '/api/tapes',
    idField: 'tape_id',
    nameField: 'name',
    icon: 'pi pi-bars',
    listPage: () => import('@/pages/TapesPage.vue'),
    formPage: null,  // Constructor is now inline on TapesPage
    formTitles: null,
  },
  {
    key: 'electrodes',
    label: 'Электроды',                 // Дали: "Электроды | Вырезание электродов"
    shortLabel: 'Электроды',
    path: '/electrodes',
    apiPath: '/api/electrodes/electrode-cut-batches',
    idField: 'cut_batch_id',
    nameField: 'cut_batch_id',
    nameFormat: (row) => `#${row.cut_batch_id} ${row.tape_name || ''}`.trim(),
    icon: 'pi pi-clone',
    listPage: () => import('@/pages/ElectrodesPage.vue'),
    formPage: () => import('@/pages/ElectrodeFormPage.vue'),
    formTitles: { new: 'Новая партия', edit: 'Партия' },
  },
  {
    key: 'assembly',
    label: 'Аккумуляторы',              // Дали: "Аккумуляторы | Сборка аккумулятора"
    shortLabel: 'Аккумуляторы',
    path: '/assembly',
    apiPath: '/api/batteries',
    idField: 'battery_id',
    nameField: 'battery_id',
    nameFormat: (row) => `${row.form_factor || 'Аккум.'} #${row.battery_id}${row.project_name ? ` — ${row.project_name}` : ''}`,
    icon: 'pi pi-box',
    listPage: () => import('@/pages/AssemblyPage.vue'),
    formPage: null,  // Constructor is now inline on AssemblyPage
    formTitles: null,
  },
  {
    key: 'modules',
    label: 'Модули',                     // Дали: "Модули | Сборка модулей - coming soon"
    shortLabel: 'Модули',
    path: '/modules',
    apiPath: null,                       // пока нет API
    idField: null,
    nameField: null,
    icon: 'pi pi-th-large',
    listPage: () => import('@/pages/PlaceholderPage.vue'),
    formPage: null,                      // ещё нет формы
    formTitles: null,
  },
]

// --- ИСПЫТАНИЯ (Vue-расширение: электрохимические тесты и аналитика) ---
// Сюда переносится всё, что относится к тестированию готовых ячеек/модулей.
// Задел: циклирование, GITT, EIS, rate capability, калориметрия и т.д.
export const testSections = [
  {
    key: 'cycling',
    label: 'Циклирование',
    shortLabel: 'Циклирование',
    path: '/cycling',
    apiPath: '/api/cycling/sessions',
    idField: 'session_id',
    nameField: 'session_id',
    nameFormat: (row) => `Сессия #${row.session_id}`,
    icon: 'pi pi-sync',
    listPage: () => import('@/pages/CyclingPage.vue'),
    formPage: null,
    formTitles: null,
  },
]

// --- СПРАВОЧНИКИ (Далины: Справочная папка / reference) ---
// Источник: public/index.html + public/reference/*.html
export const referenceSections = [
  { key: 'materials',            label: 'Материалы',              path: '/reference/materials',            icon: 'pi pi-warehouse',  apiPath: '/api/materials' },
  { key: 'recipes',              label: 'Рецептуры',              path: '/reference/recipes',              icon: 'pi pi-file-edit',  apiPath: '/api/recipes' },
    // ^ Дали: "Рецепты". Мы используем "Рецептуры" — точнее для лаб. контекста
  { key: 'electrolytes',         label: 'Электролиты',            path: '/reference/electrolytes',         icon: null, customIcon: 'droplet',  apiPath: '/api/electrolytes' },
  { key: 'separators',           label: 'Сепараторы',             path: '/reference/separators',           icon: null, customIcon: 'vline',    apiPath: '/api/separators' },
  { key: 'separator-structures', label: 'Структуры сепараторов',  path: '/reference/separator-structures', icon: 'pi pi-sitemap',    apiPath: '/api/structures' },
    // ^ У Дали: страница есть (public/reference/separator-structures.html), но нет в index.html меню
  { key: 'projects',             label: 'Проекты',                path: '/reference/projects',             icon: 'pi pi-briefcase',  apiPath: '/api/projects' },
]

// --- АДМИНИСТРИРОВАНИЕ (расширение Vue — нет в Далином public/) ---
export const adminSections = [
  { key: 'users',       label: 'Пользователи',   path: '/reference/users', icon: 'pi pi-users',    role: 'admin' },
  { key: 'access',      label: 'Управление доступом', path: '/access',     icon: 'pi pi-shield',   role: 'lead' },
  { key: 'activity',    label: 'Журнал действий', path: '/activity',        icon: 'pi pi-history' },
  { key: 'audit',       label: 'Журнал входов',   path: '/audit',           icon: 'pi pi-sign-in' },
  { key: 'feedback',    label: 'Обратная связь',   path: '/feedback',        icon: 'pi pi-comments' },
  { key: 'design',      label: 'Дизайн код',      path: '/design-system',   icon: 'pi pi-palette',  role: 'admin' },
]

// --- Маппинг справочников на Vue-компоненты ---
// (workflow секции уже имеют component внутри себя)
export const referencePages = {
  'materials':            () => import('@/pages/reference/MaterialsPage.vue'),
  'recipes':              () => import('@/pages/reference/RecipesPage.vue'),
  'electrolytes':         () => import('@/pages/reference/ElectrolytesPage.vue'),
  'separators':           () => import('@/pages/reference/SeparatorsPage.vue'),
  'separator-structures': () => import('@/pages/reference/SeparatorStructuresPage.vue'),
  'projects':             () => import('@/pages/reference/ProjectsPage.vue'),
  'users':                () => import('@/pages/reference/UsersPage.vue'),
}
