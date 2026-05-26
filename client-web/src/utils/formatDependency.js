/**
 * formatDependency — format a delete-check response into a single Russian sentence
 * for display in the opened-record status line or a blocker list.
 *
 * Mirrors vanilla v1 behavior in `public/js/recipes.js:435-455` (and similar
 * vanilla pages). Used by `useDeleteCheck` and surfaces that surface 409
 * dependency conflicts.
 *
 * Input shape (from backend delete-check or 409 response):
 *   {
 *     message?: string,
 *     dependencies?: Array<{
 *       records?: Array<{ id: number, name?: string }>
 *     }>
 *   }
 *
 * Output: a single Russian sentence. Up to 4 dependency records are listed
 * inline; more are truncated silently to keep the message short.
 */

const DEFAULT_MESSAGE = 'Нельзя удалить запись: есть связанные данные.';

function formatRecord(record) {
  if (!record) return '';
  if (record.name) return `#${record.id}: ${record.name}`;
  if (record.id != null) return `#${record.id}`;
  return '';
}

function formatRecords(dependencies) {
  if (!Array.isArray(dependencies)) return '';
  return dependencies
    .flatMap((dep) => (Array.isArray(dep?.records) ? dep.records : []))
    .slice(0, 4)
    .map(formatRecord)
    .filter(Boolean)
    .join(', ');
}

export function formatDependency(check) {
  const base = check?.message || DEFAULT_MESSAGE;
  const records = formatRecords(check?.dependencies);
  return records ? `${base} Сначала уберите связи: ${records}.` : base;
}
