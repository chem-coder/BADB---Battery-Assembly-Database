/**
 * Select-option helpers for reference pages.
 *
 * Legacy DB rows can carry free-text values (e.g. separators.air_perm_units
 * = 'с/100 мл') that predate the fixed option lists. A PrimeVue Select with
 * option-value bound to such a value renders blank, and the first save
 * silently replaces the stored value. `withStoredValueOption` appends the
 * stored value as an extra option so it displays and round-trips unchanged.
 */

/**
 * Return `options`, extended with `{ value, label: '<value> (как сохранено)' }`
 * when `value` is non-empty and not already present in the list.
 * Never mutates `options`.
 */
export function withStoredValueOption(options, value) {
  if (!value) return options;
  if (options.some((o) => o.value === value)) return options;
  return [...options, { value, label: `${value} (как сохранено)` }];
}
