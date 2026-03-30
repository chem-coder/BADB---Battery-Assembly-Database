import { defineStore } from 'pinia'
import api from '@/services/api'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: null,
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
    },
  },
})
