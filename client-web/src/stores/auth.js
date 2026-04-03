import { defineStore } from 'pinia'
import api from '@/services/api'

const STORAGE_KEY = 'badb_auth_token'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(STORAGE_KEY) || null,
    user: null,
    projects: [],
  }),

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
      localStorage.setItem(STORAGE_KEY, data.token)
    },

    async fetchMe() {
      const { data } = await api.get('/api/auth/me')
      this.user = {
        userId: data.userId,
        name: data.name,
        login: data.login,
        role: data.role,
        position: data.position || null,
      }
      this.projects = data.projects || []
    },

    logout() {
      this.token = null
      this.user = null
      this.projects = []
      localStorage.removeItem(STORAGE_KEY)
    },

    // Dev bypass: set fake token, then load real user from API
    async initBypass() {
      this.token = 'bypass'
      try {
        await this.fetchMe()
      } catch {
        // Fallback if /api/auth/me fails
        this.user = { userId: 1, login: 'dev', name: 'Dev Bypass', role: 'admin' }
        this.projects = []
      }
    },

    // Restore session on app start (called from App.vue or router guard)
    async tryRestoreSession() {
      if (!this.token || this.token === 'bypass') return false
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
