/**
 * parityUrls — URL builders for vanilla v1 print-report pages.
 *
 * The vanilla print pages live under `public/workflow/<entity>-print.html`
 * and accept a query parameter naming the record id. The parameter name
 * is NOT uniform across entities (see `public/js/<entity>-print.js`).
 *
 * Verified 2026-05-13 against public/js/*-print.js:
 *   recipes      → recipe_id
 *   tapes        → tape_id
 *   projects     → project_id
 *   electrolytes → electrolyte_id
 *   separators   → sep_id            ← asymmetric, intentional
 *   batteries    → battery_id        (per docs/current/batteries.md)
 *   electrodes   → cut_batch_id      (per docs/current/electrodes.md)
 *
 * If an entity is added to vanilla with a new print page, extend the map
 * here and reference the matching public/js/<entity>-print.js for the
 * authoritative param name.
 */

const PRINT_REPORT_CONFIG = Object.freeze({
  recipes:      { path: '/workflow/recipe-print.html',         param: 'recipe_id' },
  tapes:        { path: '/workflow/tape-print.html',           param: 'tape_id' },
  projects:     { path: '/workflow/project-print.html',        param: 'project_id' },
  electrolytes: { path: '/workflow/electrolyte-print.html',    param: 'electrolyte_id' },
  separators:   { path: '/workflow/separator-print.html',      param: 'sep_id' },
  batteries:    { path: '/workflow/battery-print.html',        param: 'battery_id' },
  electrodes:   { path: '/workflow/electrode-batch-print.html', param: 'cut_batch_id' },
});

function printReport(entityType, id) {
  const config = PRINT_REPORT_CONFIG[entityType];
  if (!config) {
    throw new Error(`parityUrls.printReport: unknown entityType "${entityType}"`);
  }
  if (id == null || id === '') {
    throw new Error(`parityUrls.printReport: missing id for "${entityType}"`);
  }
  return `${config.path}?${config.param}=${encodeURIComponent(id)}`;
}

function hasPrintReport(entityType) {
  return Object.prototype.hasOwnProperty.call(PRINT_REPORT_CONFIG, entityType);
}

export const parityUrls = {
  printReport,
  hasPrintReport,
};
