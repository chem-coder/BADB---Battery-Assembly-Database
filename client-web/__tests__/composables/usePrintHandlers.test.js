// Unit tests for src/composables/usePrintHandlers.js
//
// Verifies that the composable produces handlers that route to
// openAuthenticatedWindow with the correct parity URL.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref } from 'vue'

// Mock the dependencies before importing the composable
vi.mock('@/utils/authenticatedWindow', () => ({
  openAuthenticatedWindow: vi.fn(),
}))

import { usePrintHandlers } from '@/composables/usePrintHandlers'
import { openAuthenticatedWindow } from '@/utils/authenticatedWindow'

describe('usePrintHandlers', () => {
  beforeEach(() => {
    openAuthenticatedWindow.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws when entityType is missing', () => {
    expect(() => usePrintHandlers('', { currentId: ref(null) })).toThrow(/entityType is required/)
    expect(() => usePrintHandlers(undefined, { currentId: ref(null) })).toThrow(/entityType is required/)
  })

  it('throws when ctx or ctx.currentId is missing', () => {
    expect(() => usePrintHandlers('recipes')).toThrow(/ctx with currentId ref is required/)
    expect(() => usePrintHandlers('recipes', {})).toThrow(/ctx with currentId ref is required/)
  })

  it('returns onRowPrint and onHeaderPrint functions', () => {
    const ctx = { currentId: ref(null) }
    const handlers = usePrintHandlers('recipes', ctx)
    expect(typeof handlers.onRowPrint).toBe('function')
    expect(typeof handlers.onHeaderPrint).toBe('function')
  })

  it('onRowPrint builds the URL with the given id and entityType', () => {
    const ctx = { currentId: ref(null) }
    const { onRowPrint } = usePrintHandlers('recipes', ctx)

    onRowPrint(42)

    expect(openAuthenticatedWindow).toHaveBeenCalledTimes(1)
    const url = openAuthenticatedWindow.mock.calls[0][0]
    expect(url).toContain('/workflow/recipe-print.html')
    expect(url).toContain('recipe_id=42')
  })

  it('onRowPrint works for different entity types (verifies parametrization)', () => {
    const ctx = { currentId: ref(null) }
    const { onRowPrint: rPrint } = usePrintHandlers('projects', ctx)

    rPrint(7)

    const url = openAuthenticatedWindow.mock.calls[0][0]
    expect(url).toContain('/workflow/project-print.html')
    expect(url).toContain('project_id=7')
  })

  it('onHeaderPrint uses ctx.currentId.value', () => {
    const ctx = { currentId: ref(99) }
    const { onHeaderPrint } = usePrintHandlers('electrolytes', ctx)

    onHeaderPrint()

    expect(openAuthenticatedWindow).toHaveBeenCalledTimes(1)
    const url = openAuthenticatedWindow.mock.calls[0][0]
    expect(url).toContain('/workflow/electrolyte-print.html')
    expect(url).toContain('electrolyte_id=99')
  })

  it('onHeaderPrint does nothing when ctx.currentId.value is null', () => {
    const ctx = { currentId: ref(null) }
    const { onHeaderPrint } = usePrintHandlers('recipes', ctx)

    onHeaderPrint()

    expect(openAuthenticatedWindow).not.toHaveBeenCalled()
  })

  it('onHeaderPrint reads currentId lazily — pickups up later assignments', () => {
    const ctx = { currentId: ref(null) }
    const { onHeaderPrint } = usePrintHandlers('separators', ctx)

    // First call — id is null, nothing happens
    onHeaderPrint()
    expect(openAuthenticatedWindow).not.toHaveBeenCalled()

    // User opens record #5 — composable picks it up on next click
    ctx.currentId.value = 5
    onHeaderPrint()

    expect(openAuthenticatedWindow).toHaveBeenCalledTimes(1)
    expect(openAuthenticatedWindow.mock.calls[0][0]).toContain('sep_id=5')
  })
})
