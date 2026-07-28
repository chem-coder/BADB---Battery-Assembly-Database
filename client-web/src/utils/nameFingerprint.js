// nameFingerprint — comparison fingerprint for duplicate detection at
// material creation (materials_model_cleanup.md §6.3, decision D3).
//
// Pipeline (order matters, matches the spec text literally):
//   lowercase → trim → strip whitespace entirely → strip punctuation/hyphens →
//   map confusable Cyrillic letters to their Latin homoglyphs.
//
// Why the homoglyph step: «СМС» typed in Cyrillic and "CMC" typed in
// Latin are pixel-identical on screen; without normalization they would
// silently fragment the catalog into two "different" materials.
//
// The fingerprint is for COMPARISON ONLY — never stored, never shown.
// The user's original spelling is what gets saved (spec §6.3 p.3).
//
// The same helper is intended to serve the recipe duplicate-detection
// designed earlier — one function, two callers.

// Confusable Cyrillic → Latin homoglyphs (spec list: А В Е К М Н О Р С
// Т У Х → A B E K M H O P C T Y X). Input is lowercased before this map
// is applied, so only the lowercase forms are needed here — uppercase
// Cyrillic arrives already folded (А → а → a).
const CYR_TO_LAT = {
  'а': 'a',
  'в': 'b',
  'е': 'e',
  'к': 'k',
  'м': 'm',
  'н': 'h',
  'о': 'o',
  'р': 'p',
  'с': 'c',
  'т': 't',
  'у': 'y',
  'х': 'x',
}

const CYR_CONFUSABLE_RE = /[авекмнорстух]/g

/**
 * Compute the comparison fingerprint of a material/recipe name.
 * @param {string|null|undefined} s raw name as typed
 * @returns {string} fingerprint ('' for null/undefined/blank input)
 */
export function nameFingerprint(s) {
  if (s == null) return ''
  return String(s)
    .toLowerCase()
    .trim()
    // Strip punctuation and hyphens — keep letters, digits and spaces.
    // \p{L}/\p{N} (unicode property escapes) so Cyrillic survives.
    .replace(/[^\p{L}\p{N}\s]+/gu, '')
    // Strip ALL whitespace entirely: «NMC811» and «NMC 811» are the same
    // product typed two ways — a classic duplicate pattern.
    .replace(/\s+/g, '')
    .trim()
    .replace(CYR_CONFUSABLE_RE, (ch) => CYR_TO_LAT[ch])
}

export default nameFingerprint
