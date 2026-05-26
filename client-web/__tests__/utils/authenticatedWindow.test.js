// Unit tests for src/utils/authenticatedWindow.js
//
// Covers the same-origin token-sharing flow and the popup-blocker fallback.
//
// The fallback path uses an injectable `navigateInPlace` callable so we can
// verify that the helper actually navigates the current window when popup
// is blocked, without depending on jsdom's non-reconfigurable
// `window.location`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { openAuthenticatedWindow } from '@/utils/authenticatedWindow'
import { TOKEN_KEY } from '@/constants/auth'

function makeOpenedWindow() {
  return {
    sessionStorage: {
      _store: {},
      setItem(k, v) { this._store[k] = v },
      getItem(k) { return this._store[k] ?? null },
    },
    location: {
      _calls: [],
      replace(url) { this._calls.push(['replace', url]) },
      set href(url) { this._calls.push(['href', url]) },
    },
    opener: { foo: 'bar' },
    focus: vi.fn(),
  }
}

describe('authenticatedWindow', () => {
  let originalWindowOpen
  let opened

  beforeEach(() => {
    sessionStorage.clear()
    opened = makeOpenedWindow()
    originalWindowOpen = window.open
    window.open = vi.fn(() => opened)
  })

  afterEach(() => {
    window.open = originalWindowOpen
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('throws when url is missing', () => {
    expect(() => openAuthenticatedWindow('')).toThrow(/url is required/)
    expect(() => openAuthenticatedWindow(undefined)).toThrow(/url is required/)
  })

  it('opens about:blank synchronously (popup-blocker compatible)', () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok-123')
    openAuthenticatedWindow('/workflow/recipe-print.html?recipe_id=1')
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank')
  })

  it('uses custom target when provided', () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok-123')
    openAuthenticatedWindow('/workflow/x.html', { target: 'report' })
    expect(window.open).toHaveBeenCalledWith('about:blank', 'report')
  })

  it('copies the current token into the new window sessionStorage', () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok-xyz')
    openAuthenticatedWindow('/workflow/recipe-print.html?recipe_id=42')
    expect(opened.sessionStorage.getItem(TOKEN_KEY)).toBe('tok-xyz')
  })

  it('skips token injection when there is no token in current session', () => {
    // sessionStorage is empty
    openAuthenticatedWindow('/workflow/recipe-print.html?recipe_id=42')
    expect(opened.sessionStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('detaches opener for the new window', () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok')
    openAuthenticatedWindow('/workflow/x.html')
    expect(opened.opener).toBeNull()
  })

  it('navigates the new window via location.replace', () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok')
    openAuthenticatedWindow('/workflow/recipe-print.html?recipe_id=7')
    const replaceCalls = opened.location._calls.filter(c => c[0] === 'replace')
    expect(replaceCalls).toHaveLength(1)
    expect(replaceCalls[0][1]).toContain('/workflow/recipe-print.html?recipe_id=7')
  })

  it('focuses the new window if possible', () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok')
    openAuthenticatedWindow('/workflow/x.html')
    expect(opened.focus).toHaveBeenCalled()
  })

  it('returns the opened window reference on success', () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok')
    const result = openAuthenticatedWindow('/workflow/x.html')
    expect(result).toBe(opened)
  })

  // Fallback path — properly tested via injected navigateInPlace
  it('calls navigateInPlace with the resolved URL when popup is blocked', () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok')
    window.open = vi.fn(() => null) // simulate blocked popup
    const navigateInPlace = vi.fn()

    const result = openAuthenticatedWindow(
      '/workflow/x.html?recipe_id=1',
      { navigateInPlace }
    )

    expect(result).toBeNull()
    expect(navigateInPlace).toHaveBeenCalledTimes(1)
    // URL passed to navigateInPlace is the resolved absolute form
    expect(navigateInPlace.mock.calls[0][0]).toContain('/workflow/x.html?recipe_id=1')
  })

  it('does not call navigateInPlace when popup succeeds', () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok')
    const navigateInPlace = vi.fn()

    openAuthenticatedWindow('/workflow/x.html', { navigateInPlace })

    expect(navigateInPlace).not.toHaveBeenCalled()
  })

  it('resolves relative URLs against origin before navigation', () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok')
    openAuthenticatedWindow('/workflow/x.html')
    const replaceCalls = opened.location._calls.filter(c => c[0] === 'replace')
    expect(replaceCalls[0][1]).toMatch(/^https?:\/\//)
  })
})
