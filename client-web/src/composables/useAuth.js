import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

export function useAuth() {
  const auth = useAuthStore()
  const router = useRouter()

  const currentUser = computed(() => auth.user)
  const isAuthenticated = computed(() => auth.isAuthenticated)
  const isAdmin = computed(() => auth.isAdmin)

  async function login(login, password) {
    await auth.login(login, password)
    router.push('/')
  }

  function logout() {
    auth.logout()
    router.push('/login')
  }

  return { currentUser, isAuthenticated, isAdmin, login, logout }
}
