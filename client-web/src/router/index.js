import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import LoginPage from '@/pages/LoginPage.vue'
import AppLayout from '@/layouts/AppLayout.vue'

const routes = [
  { path: '/login', component: LoginPage, meta: { public: true } },
  {
    path: '/',
    component: AppLayout,
    meta: { requiresAuth: true },
    children: [
      { path: '', component: () => import('@/pages/HomePage.vue'),
        meta: { title: 'Главная', crumbs: [] } },

      // Производство
      { path: 'tapes',     component: () => import('@/pages/TapesPage.vue'),
        meta: { title: 'Подготовка лент', crumbs: [] } },
      { path: 'tapes/new', component: () => import('@/pages/TapeFormPage.vue'),
        meta: { title: 'Новая лента',     crumbs: [{ label: 'Подготовка лент', to: '/tapes' }] } },
      { path: 'tapes/:id', component: () => import('@/pages/TapeFormPage.vue'),
        meta: { title: 'Лента',           crumbs: [{ label: 'Подготовка лент', to: '/tapes' }] } },
      { path: 'electrodes',     component: () => import('@/pages/ElectrodesPage.vue'),
        meta: { title: 'Электроды', crumbs: [] } },
      { path: 'electrodes/new', component: () => import('@/pages/ElectrodeFormPage.vue'),
        meta: { title: 'Новая партия', crumbs: [{ label: 'Электроды', to: '/electrodes' }] } },
      { path: 'electrodes/:id', component: () => import('@/pages/ElectrodeFormPage.vue'),
        meta: { title: 'Партия',       crumbs: [{ label: 'Электроды', to: '/electrodes' }] } },
      { path: 'assembly',       component: () => import('@/pages/AssemblyPage.vue'),
        meta: { title: 'Аккумуляторы',    crumbs: [] } },
      { path: 'assembly/new',   component: () => import('@/pages/AssemblyFormPage.vue'),
        meta: { title: 'Новый аккумулятор', crumbs: [{ label: 'Аккумуляторы', to: '/assembly' }] } },
      { path: 'assembly/:id',   component: () => import('@/pages/AssemblyFormPage.vue'),
        meta: { title: 'Аккумулятор',      crumbs: [{ label: 'Аккумуляторы', to: '/assembly' }] } },
      { path: 'modules',        component: () => import('@/pages/PlaceholderPage.vue'),
        meta: { title: 'Модули',           crumbs: [] } },

      // Справочники
      { path: 'reference/materials', component: () => import('@/pages/reference/MaterialsPage.vue'),
        meta: { title: 'Материалы', crumbs: [{ label: 'Справочники' }] } },
      { path: 'reference/recipes',   component: () => import('@/pages/reference/RecipesPage.vue'),
        meta: { title: 'Рецептуры', crumbs: [{ label: 'Справочники' }] } },
      { path: 'reference/electrolytes', component: () => import('@/pages/reference/ElectrolytesPage.vue'),
        meta: { title: 'Электролиты', crumbs: [{ label: 'Справочники' }] } },
      { path: 'reference/separators', component: () => import('@/pages/reference/SeparatorsPage.vue'),
        meta: { title: 'Сепараторы', crumbs: [{ label: 'Справочники' }] } },
      { path: 'reference/separator-structures', component: () => import('@/pages/reference/SeparatorStructuresPage.vue'),
        meta: { title: 'Структуры сепараторов', crumbs: [{ label: 'Справочники' }] } },
      { path: 'reference/projects', component: () => import('@/pages/reference/ProjectsPage.vue'),
        meta: { title: 'Проекты', crumbs: [{ label: 'Справочники' }] } },

      // Администрирование
      { path: 'reference/users', component: () => import('@/pages/reference/UsersPage.vue'),
        meta: { title: 'Пользователи', role: 'admin', crumbs: [{ label: 'Администрирование' }] } },
      { path: 'activity',   component: () => import('@/pages/PlaceholderPage.vue'),
        meta: { title: 'Журнал действий', crumbs: [{ label: 'Администрирование' }] } },
      { path: 'audit',      component: () => import('@/pages/PlaceholderPage.vue'),
        meta: { title: 'Журнал входов',   crumbs: [{ label: 'Администрирование' }] } },
      { path: 'submissions', component: () => import('@/pages/PlaceholderPage.vue'),
        meta: { title: 'Журнал подач',    crumbs: [{ label: 'Администрирование' }] } },

      // Дизайн код — admin only
      { path: 'design-system', component: () => import('@/pages/DesignSystemPage.vue'),
        meta: { title: 'Дизайн код', role: 'admin', crumbs: [] } },

      // Аккаунт
      { path: 'profile', component: () => import('@/pages/ProfilePage.vue'),
        meta: { title: 'Профиль', crumbs: [] } },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const auth = useAuthStore()
  if (to.meta.public) return next()
  if (!auth.isAuthenticated) return next('/login')
  if (to.meta.role && auth.user?.role !== to.meta.role) return next('/')
  next()
})

export default router
