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
    path: '/tapes',
    icon: 'pi pi-sliders-h',
    listPage: () => import('@/pages/TapesPage.vue'),
    formPage: () => import('@/pages/TapeFormPage.vue'),
    formTitles: { new: 'Новая лента', edit: 'Лента' },
  },
  {
    key: 'electrodes',
    label: 'Электроды',                 // Дали: "Электроды | Вырезание электродов"
    path: '/electrodes',
    icon: 'pi pi-stop-circle',
    listPage: () => import('@/pages/ElectrodesPage.vue'),
    formPage: () => import('@/pages/ElectrodeFormPage.vue'),
    formTitles: { new: 'Новая партия', edit: 'Партия' },
  },
  {
    key: 'assembly',
    label: 'Аккумуляторы',              // Дали: "Аккумуляторы | Сборка аккумулятора"
    path: '/assembly',
    icon: 'pi pi-box',
    listPage: () => import('@/pages/AssemblyPage.vue'),
    formPage: () => import('@/pages/AssemblyFormPage.vue'),
    formTitles: { new: 'Новый аккумулятор', edit: 'Аккумулятор' },
  },
  {
    key: 'modules',
    label: 'Модули',                     // Дали: "Модули | Сборка модулей - coming soon"
    path: '/modules',
    icon: 'pi pi-objects-column',
    listPage: () => import('@/pages/PlaceholderPage.vue'),
    formPage: null,                      // ещё нет формы
    formTitles: null,
  },
]

// --- СПРАВОЧНИКИ (Далины: Справочная папка / reference) ---
// Источник: public/index.html + public/reference/*.html
export const referenceSections = [
  { key: 'materials',            label: 'Материалы',              path: '/reference/materials',            icon: 'pi pi-database' },
  { key: 'recipes',              label: 'Рецептуры',              path: '/reference/recipes',              icon: 'pi pi-book' },
    // ^ Дали: "Рецепты". Мы используем "Рецептуры" — точнее для лаб. контекста
  { key: 'electrolytes',         label: 'Электролиты',            path: '/reference/electrolytes',         icon: 'pi pi-info-circle' },
  { key: 'separators',           label: 'Сепараторы',             path: '/reference/separators',           icon: 'pi pi-minus' },
  { key: 'separator-structures', label: 'Структуры сепараторов',  path: '/reference/separator-structures', icon: 'pi pi-sitemap' },
    // ^ У Дали: страница есть (public/reference/separator-structures.html), но нет в index.html меню
  { key: 'projects',             label: 'Проекты',                path: '/reference/projects',             icon: 'pi pi-folder' },
]

// --- АДМИНИСТРИРОВАНИЕ (расширение Vue — нет в Далином public/) ---
export const adminSections = [
  { key: 'users',       label: 'Пользователи',   path: '/reference/users', icon: 'pi pi-users',    role: 'admin' },
  { key: 'activity',    label: 'Журнал действий', path: '/activity',        icon: 'pi pi-history' },
  { key: 'audit',       label: 'Журнал входов',   path: '/audit',           icon: 'pi pi-sign-in' },
  { key: 'submissions', label: 'Журнал подач',    path: '/submissions',     icon: 'pi pi-upload' },
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
