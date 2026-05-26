// Unit tests for src/stores/auth.js
//
// Focused on the storage layer (sessionStorage migration + read/write/clear).
// Login/fetchMe network paths are not exercised — they are covered by their
// own integration scenarios.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { TOKEN_KEY } from '@/constants/auth'

// Lazy import so we can clear storage before the store reads it on init
async function freshStore() {
  vi.resetModules()
  const { useAuthStore } = await import('@/stores/auth')
  return useAuthStore()
}

describe('useAuthStore — storage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  it('starts with null token when no storage entry exists', async () => {
    const auth = await freshStore()
    expect(auth.token).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })

  it('reads token from sessionStorage on init', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok-abc')
    const auth = await freshStore()
    expect(auth.token).toBe('tok-abc')
    expect(auth.isAuthenticated).toBe(true)
  })

  it('migrates a legacy localStorage token to sessionStorage on init', async () => {
    // Pre-condition: legacy token in localStorage, nothing in sessionStorage
    localStorage.setItem(TOKEN_KEY, 'legacy-tok')

    const auth = await freshStore()

    expect(auth.token).toBe('legacy-tok')
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('legacy-tok')
    // Legacy entry should have been cleaned up
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('does not overwrite an existing sessionStorage token with legacy', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'current-tok')
    localStorage.setItem(TOKEN_KEY, 'older-legacy-tok')

    const auth = await freshStore()

    expect(auth.token).toBe('current-tok')
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('current-tok')
    // Legacy should still be cleaned out
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('logout clears sessionStorage', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok-xyz')
    const auth = await freshStore()
    expect(auth.token).toBe('tok-xyz')

    auth.logout()

    expect(auth.token).toBeNull()
    expect(auth.user).toBeNull()
    expect(auth.projects).toEqual([])
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('logout does not touch localStorage entries that are not the token', async () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok')
    localStorage.setItem('badb-cycling-style-library-1', '{"foo":1}')
    localStorage.setItem('badb-login-tile', '3')

    const auth = await freshStore()
    auth.logout()

    expect(localStorage.getItem('badb-cycling-style-library-1')).toBe('{"foo":1}')
    expect(localStorage.getItem('badb-login-tile')).toBe('3')
  })
})
