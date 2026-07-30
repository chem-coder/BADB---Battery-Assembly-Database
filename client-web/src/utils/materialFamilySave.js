// materialFamilySave — family value for a material save payload.
//
// PUT /api/materials/:id is NOT a partial update: whatever `family`
// arrives in the payload is what gets stored (missing/blank → NULL).
// The family control, however, is only shown for active roles
// (spec §4) — for binder/solvent/additive/other the field is hidden.
//
// So when the control is hidden the payload must resend the STORED
// value, not null: otherwise editing a non-active material (or
// switching a material's role away from active) silently NULLs a
// stored family — a data-loss bug vanilla never had.

/**
 * Resolve the `family` value to send in a material save payload.
 * @param {object} p
 * @param {boolean} p.applies    whether the family control is shown (familyApplies(role))
 * @param {string|null|undefined} p.formValue   current form value (only meaningful when applies)
 * @param {string|null|undefined} p.storedValue family currently stored on the material
 * @returns {string|null}
 */
export function familyForSave({ applies, formValue, storedValue }) {
  if (applies) return (formValue || '').trim() || null
  return storedValue ?? null
}

export default familyForSave
