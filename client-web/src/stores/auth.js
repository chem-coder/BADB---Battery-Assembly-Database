import { defineStore } from 'pinia'
import api from '@/services/api'
import { TOKEN_KEY } from '@/constants/auth'

/**
 * One-time migration helper.
 *
 * Until May 2026, Vue's auth token lived in localStorage. Vanilla v1 then
 * moved to sessionStorage as a session-only token policy. Vue is now
 * aligned with vanilla.
 *
 * On the first session after this change ships, an existing user has a
 * token in localStorage but nothing in sessionStorage — without this
 * migration they would be redirected to /login. We copy the legacy token
 * across once and remove the localStorage copy.
 *
 * The helper is idempotent and safe to call on every store init.
 */
function migrateLegacyTokenIfNeeded() {
  let legacy = null
  try { legacy = localStorage.getItem(TOKEN_KEY) } catch { return }
  if (!legacy) return

  let existing = null
  try { existing = sessionStorage.getItem(TOKEN_KEY) } catch {}
  if (!existing) {
    try { sessionStorage.setItem(TOKEN_KEY, legacy) } catch {}
  }
  try { localStorage.removeItem(TOKEN_KEY) } catch {}
}

function readToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || null } catch { return null }
}

function writeToken(token) {
  try { sessionStorage.setItem(TOKEN_KEY, token) } catch {}
}

function clearToken() {
  try { sessionStorage.removeItem(TOKEN_KEY) } catch {}
}

export const useAuthStore = defineStore('auth', {
  state: () => {
    migrateLegacyTokenIfNeeded()
    return {
      token: readToken(),
      user: null,
      projects: [],
    }
  },

  getters: {
    isAuthenticated: (state) => !!state.token,
    isAdmin: (state) => state.user?.role === 'admin',
    isLead: (state) => ['admin', 'lead'].includes(state.user?.role),
    fullName: (state) => state.user?.name || '',
  },

  actions: {
    async login(login, password) {
      const { data } = await api.post('/api/auth/login', { login, password })
      this.token = data.token
      this.user = data.user
      this.projects = data.projects || []
      writeToken(data.token)
    },

    async fetchMe() {
      const { data } = await api.get('/api/auth/me')
      this.user = {
        userId: data.userId,
        name: data.name,
        login: data.login,
        role: data.role,
        position: data.position || null,
        department: data.department || null,
        isDepartmentHead: data.isDepartmentHead || false,
        isDirector: data.isDirector || false,
      }
      this.projects = data.projects || []
    },

    logout() {
      this.token = null
      this.user = null
      this.projects = []
      clearToken()
    },

    // Restore session on app start (called from App.vue or router guard)
    async tryRestoreSession() {
      if (!this.token) return false
      try {
        await this.fetchMe()
        return true
      } catch {
        this.logout()
        return false
      }
    },
  },
})
