/**
 * Material-instance composition validation (sum-to-100 full editor).
 *
 * Mirrors vanilla `public/js/materials.js` openCompositionEditor save-path and
 * the backend `services/materialCompositionService.js` normalizeCompositionPayload,
 * so the Vue Materials full-composition editor enforces the same rules vanilla
 * does before hitting the canonical replace-all
 * `PUT /api/materials/instances/:id/components`:
 *   - at least one component;
 *   - each component is a real instance, not the parent (no self-reference);
 *   - no duplicate component;
 *   - each mass fraction ∈ (0, 1];
 *   - the fractions sum to exactly 100% (within COMPOSITION_TOLERANCE).
 *
 * The canonical PUT re-validates all of this server-side; this util is the
 * client-side guard that mirrors vanilla so the user gets the same up-front
 * "must be 100%" feedback. Per-component inline edit/delete intentionally do
 * NOT use this — vanilla leaves those single-row ops un-revalidated and Vue
 * matches that.
 */

// Same tolerance the backend uses (Math.abs(total - 1) > 0.0001 → reject).
export const COMPOSITION_TOLERANCE = 0.0001

/**
 * Convert a user-facing percent (0..100, number or string) to a mass fraction
 * (0..1). Returns NaN for blank / non-numeric input so callers can flag the row.
 */
export function percentToFraction(percent) {
  if (percent === '' || percent === null || percent === undefined) return NaN
  return Number(percent) / 100
}

/**
 * Running total of the percents currently entered, for a live "Σ = NN.NN%"
 * hint. Blank / non-numeric rows count as 0.
 *
 * @param {Array<{ percent: number|string }>} rows
 * @returns {number} sum of percents (0..100 scale)
 */
export function sumPercent(rows) {
  return (rows || []).reduce((acc, r) => {
    const n = Number(r?.percent)
    return acc + (Number.isFinite(n) ? n : 0)
  }, 0)
}

/**
 * Validate + normalize editor rows into a replace-all payload.
 *
 * @param {Array<{ component_material_instance_id: number|string, percent: number|string, notes?: string }>} rows
 * @param {number|string} parentInstanceId  instance whose composition is edited
 * @returns {{ ok: true, components: Array<{ component_material_instance_id: number, mass_fraction: number, notes: string|null }> }
 *          | { ok: false, error: string }}
 */
export function validateComposition(rows, parentInstanceId) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: 'Добавьте хотя бы один компонент состава' }
  }

  const parentId = Number(parentInstanceId)
  const components = []
  const seen = new Set()
  let total = 0

  for (const r of rows) {
    const componentId = Number(r.component_material_instance_id)
    const massFraction = percentToFraction(r.percent)

    if (
      !Number.isInteger(componentId) ||
      componentId <= 0 ||
      !Number.isFinite(massFraction) ||
      massFraction <= 0 ||
      massFraction > 1
    ) {
      // Vanilla: «Заполните все строки состава корректно перед сохранением.»
      return { ok: false, error: 'Заполните все строки состава корректно перед сохранением.' }
    }

    if (componentId === parentId) {
      return { ok: false, error: 'Экземпляр не может содержать сам себя' }
    }

    if (seen.has(componentId)) {
      return { ok: false, error: 'Один и тот же экземпляр нельзя добавить дважды' }
    }

    seen.add(componentId)
    total += massFraction

    const notes = r.notes != null && String(r.notes).trim() !== '' ? String(r.notes).trim() : null
    components.push({ component_material_instance_id: componentId, mass_fraction: massFraction, notes })
  }

  if (Math.abs(total - 1) > COMPOSITION_TOLERANCE) {
    // Vanilla: «Сумма состава должна быть ровно 100%.»
    return { ok: false, error: 'Сумма состава должна быть ровно 100%.' }
  }

  return { ok: true, components }
}
