/**
 * usePrintHandlers — shared print-button handlers for parity surface pages.
 *
 * Every parity surface page (Recipes, Projects, Electrolytes, Separators)
 * wires the same two handlers:
 *
 *   - onRowPrint(id):    fires from RowActionIcons (per-row 🖨 button)
 *   - onHeaderPrint():   fires from OpenedRecordHeader (currently opened
 *                        record's 🖨 button)
 *
 * Both call `openAuthenticatedWindow(parityUrls.printReport(...))` with the
 * same entity type. This composable factors out that boilerplate.
 *
 * The composable is reactive only in that it reads `ctx.currentId.value`
 * lazily — the handlers themselves are plain functions. It is a composable
 * (in `composables/`, not `utils/`) because consumers tend to call it from
 * the same setup block as `useRowOpenForm(ctx)`.
 *
 * Usage
 * -----
 *   import { useRowOpenForm } from '@/composables/useRowOpenForm'
 *   import { usePrintHandlers } from '@/composables/usePrintHandlers'
 *
 *   const ctx = useRowOpenForm({ entityType: 'recipes', ... })
 *   const { onRowPrint, onHeaderPrint } = usePrintHandlers('recipes', ctx)
 */
import { parityUrls } from '@/utils/parityUrls'
import { openAuthenticatedWindow } from '@/utils/authenticatedWindow'

/**
 * @param {string} entityType — must match a key in `parityUrls`
 *                              (recipes, projects, electrolytes, separators,
 *                              tapes, batteries, electrodes).
 * @param {object} ctx        — the value returned by `useRowOpenForm`. Only
 *                              `ctx.currentId.value` is read.
 * @returns {{ onRowPrint: (id: number|string) => void,
 *             onHeaderPrint: () => void }}
 */
export function usePrintHandlers(entityType, ctx) {
  if (!entityType) {
    throw new Error('usePrintHandlers: entityType is required')
  }
  if (!ctx || !ctx.currentId) {
    throw new Error('usePrintHandlers: ctx with currentId ref is required')
  }

  function onRowPrint(id) {
    openAuthenticatedWindow(parityUrls.printReport(entityType, id))
  }

  function onHeaderPrint() {
    const id = ctx.currentId.value
    if (id == null) return
    openAuthenticatedWindow(parityUrls.printReport(entityType, id))
  }

  return { onRowPrint, onHeaderPrint }
}
