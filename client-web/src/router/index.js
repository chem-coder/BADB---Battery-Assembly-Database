import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import LoginPage from '@/pages/LoginPage.vue'
import AppLayout from '@/layouts/AppLayout.vue'
import {
  workflowSections,
  referenceSections,
  adminSections,
  referencePages,
} from '@/config/navigation'

// ── Build routes from navigation config ──────────────────────────
const workflowRoutes = workflowSections.flatMap((s) => {
  const routes = [
    {
      path: s.path.slice(1), // remove leading /
      component: s.listPage,
      meta: { title: s.label, crumbs: [] },
    },
  ]
  if (s.formPage) {
    routes.push(
      {
        path: s.path.slice(1) + '/new',
        component: s.formPage,
        meta: { title: s.formTitles.new, crumbs: [{ label: s.label, to: s.path }] },
      },
      {
        path: s.path.slice(1) + '/:id',
        component: s.formPage,
        meta: { title: s.formTitles.edit, crumbs: [{ label: s.label, to: s.path }] },
      },
    )
  }
  return routes
})

const referenceRoutes = referenceSections.map((s) => ({
  path: s.path.slice(1),
  component: referencePages[s.key],
  meta: { title: s.label, crumbs: [{ label: 'Справочники' }] },
}))

const adminRoutes = adminSections.map((s) => {
  const page = s.key === 'users'
    ? referencePages.users
    : s.key === 'design'
      ? () => import('@/pages/DesignSystemPage.vue')
      : s.key === 'activity'
        ? () => import('@/pages/ActivityPage.vue')
        : s.key === 'audit'
          ? () => import('@/pages/AuditPage.vue')
          : () => import('@/pages/PlaceholderPage.vue')
  return {
    path: s.path.slice(1),
    component: page,
    meta: {
      title: s.label,
      ...(s.role && { role: s.role }),
      crumbs: [{ label: 'Администрирование' }],
    },
  }
})

const routes = [
  { path: '/login', component: LoginPage, meta: { public: true } },
  {
    path: '/',
    component: AppLayout,
    meta: { requiresAuth: true },
    children: [
      { path: '', component: () => import('@/pages/HomePage.vue'),
        meta: { title: 'Главная', crumbs: [] } },

      ...workflowRoutes,

      // Backward compat: /tapes/new and /tapes/:id redirect to /tapes
      // (Constructor is now inline on TapesPage)
      { path: 'tapes/new', redirect: '/tapes' },
      { path: 'tapes/:id', redirect: '/tapes' },

      ...referenceRoutes,
      ...adminRoutes,

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

router.beforeEach(async (to, from, next) => {
  const auth = useAuthStore()
  if (to.meta.public) return next()

  // Dev bypass: auto-authenticate without login screen
  if (import.meta.env.VITE_AUTH_BYPASS === 'true' && !auth.isAuthenticated) {
    await auth.initBypass()
  }

  // Restore session from localStorage on page refresh
  if (auth.isAuthenticated && !auth.user) {
    await auth.tryRestoreSession()
  }

  if (!auth.isAuthenticated) return next('/login')
  if (to.meta.role && auth.user?.role !== to.meta.role) return next('/')
  next()
})

export default router
