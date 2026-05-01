import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import LoginPage from '@/pages/LoginPage.vue'
import AppLayout from '@/layouts/AppLayout.vue'
import {
  workflowSections,
  testSections,
  referenceSections,
  adminSections,
  referencePages,
} from '@/config/navigation'

// ── Build routes from navigation config ──────────────────────────
function buildSectionRoutes(sections, baseCrumbs = []) {
  return sections.flatMap((s) => {
    const routes = [
      {
        path: s.path.slice(1), // remove leading /
        component: s.listPage,
        meta: { title: s.label, crumbs: baseCrumbs },
      },
    ]
    if (s.formPage) {
      routes.push(
        {
          path: s.path.slice(1) + '/new',
          component: s.formPage,
          meta: {
            title: s.formTitles.new,
            crumbs: [...baseCrumbs, { label: s.label, to: s.path }],
          },
        },
        {
          path: s.path.slice(1) + '/:id',
          component: s.formPage,
          meta: {
            title: s.formTitles.edit,
            crumbs: [...baseCrumbs, { label: s.label, to: s.path }],
          },
        },
      )
    }
    return routes
  })
}

const workflowRoutes = buildSectionRoutes(workflowSections)
// Testing (Испытания): same shape as workflow, different sidebar group.
// Primary URL keeps s.path unchanged (e.g. /cycling) so existing bookmarks work.
// No breadcrumb prefix — the sidebar already groups this section, adding a
// "Главная › Испытания › Циклирование" trail in the page header is noise.
const testRoutes = buildSectionRoutes(testSections)

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
          : s.key === 'feedback'
            ? () => import('@/pages/FeedbackPage.vue')
            : s.key === 'access'
              ? () => import('@/pages/AccessPage.vue')
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
      ...testRoutes,

      // Aliases for the new "Испытания" URL namespace. Primary URLs stay as
      // /cycling etc. for existing bookmarks, but /testing/cycling also works.
      ...testSections.map((s) => ({
        path: 'testing' + s.path,
        redirect: s.path,
      })),

      // Backward compat: /tapes/new and /tapes/:id redirect to /tapes
      // (Constructor is now inline on TapesPage)
      { path: 'tapes/new', redirect: '/tapes' },
      { path: 'tapes/:id', redirect: '/tapes' },

      // /assembly/:id → AssemblyPage with constructor auto-open (reads route.params.id)
      { path: 'assembly/new', redirect: '/assembly' },
      { path: 'assembly/:id',
        component: () => import('@/pages/AssemblyPage.vue'),
        meta: { title: 'Аккумулятор', crumbs: [{ label: 'Аккумуляторы', to: '/assembly' }] } },

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
  if (to.meta.role) {
    // Role hierarchy: admin > lead > employee. Admin always passes.
    const userRole = auth.user?.role
    const required = to.meta.role
    const allowed = userRole === 'admin' || userRole === required
    if (!allowed) {
      // Flash the reason via a query param — HomePage picks it up on
      // mount, fires a toast, and cleans the URL. Without this, a user
      // hitting a role-gated URL (e.g. /reference/users as a non-admin,
      // common after Phase δ redirects a legacy bookmark) gets
      // silently bounced with no explanation.
      // Pitfall #7 in CLAUDE.md "Common pitfalls".
      return next({ path: '/', query: { denied: required } })
    }
  }
  next()
})

export default router
