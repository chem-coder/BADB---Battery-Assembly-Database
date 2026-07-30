// recipeDuplicate — client-side duplicate guard for recipe save.
//
// Neither the backend nor the DB enforces uniqueness of the recipe
// name+variant_label pair, so a duplicate pair would be created
// silently. Until a DB constraint exists, the save path pre-checks the
// already-loaded list and blocks with a clear message instead.
//
// Comparison uses nameFingerprint («one function, two callers» — see
// its doc header): trim, case, spacing/punctuation and Cyrillic/Latin
// homoglyph variants all count as the same name/variant. Blank and
// null variant labels compare equal (both mean «no variant»).

import { nameFingerprint } from './nameFingerprint'

/**
 * Find an already-loaded recipe (a DIFFERENT record — currentId is
 * excluded) whose name+variant_label pair collides with the form's.
 *
 * @param {Array<object>|null|undefined} recipes loaded list rows
 *   ({ tape_recipe_id, name, variant_label, ... })
 * @param {{ name: string, variantLabel?: string|null, currentId?: number|null }} target
 *   form values; currentId is null in create mode
 * @returns {object|null} the colliding recipe row, or null
 */
export function findDuplicateRecipe(recipes, { name, variantLabel, currentId }) {
  const nameFp = nameFingerprint(name)
  if (!nameFp) return null
  const variantFp = nameFingerprint(variantLabel)
  return (recipes || []).find((r) =>
    (currentId == null || r.tape_recipe_id !== currentId)
    && nameFingerprint(r.name) === nameFp
    && nameFingerprint(r.variant_label) === variantFp
  ) || null
}

export default findDuplicateRecipe
