/**
 * Date/time formatters — always render in Europe/Moscow (MSK).
 *
 * The DB stores TIMESTAMPTZ, so the server hands back proper ISO
 * timestamps with timezone info; the browser would normally render
 * them in the user's local zone. Because the lab is in Moscow and
 * audit/changelog readers expect MSK times consistently regardless of
 * where the browser is, every date display goes through these helpers.
 *
 * Internal `toLocaleString` honours the `timeZone` option to do the
 * conversion — no third-party dep needed.
 */

const RU = 'ru-RU';
const MSK = 'Europe/Moscow';

function safeDate(input) {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * "17.05.2026, 14:32:08" — full date + 24h time with seconds in MSK.
 * Seconds are included by default (Dima 2026-05-28) — lab workflow
 * needs sub-minute precision for sequential measurements.
 */
export function formatDateTimeMsk(input) {
  const d = safeDate(input);
  if (!d) return '—';
  return d.toLocaleString(RU, {
    timeZone: MSK,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * "17.05.2026" — date only in MSK.
 */
export function formatDateMsk(input) {
  const d = safeDate(input);
  if (!d) return '—';
  return d.toLocaleDateString(RU, {
    timeZone: MSK,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * "14:32:08" — 24h time with seconds in MSK.
 */
export function formatTimeMsk(input) {
  const d = safeDate(input);
  if (!d) return '—';
  return d.toLocaleTimeString(RU, {
    timeZone: MSK,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Today in MSK as YYYY-MM-DD — for default values on `item_created_at`
 * and other business dates that should snap to the operator's local
 * working day in the lab (Moscow), regardless of the browser's TZ.
 */
export function todayIsoMsk(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: MSK,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA gives YYYY-MM-DD directly; just guard against `formatToParts`
  // exotic outputs by joining explicitly.
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Compact "17.05" date label for chips/badges in MSK.
 */
export function formatDateShortMsk(input) {
  const d = safeDate(input);
  if (!d) return '';
  return d.toLocaleDateString(RU, {
    timeZone: MSK,
    day: '2-digit',
    month: '2-digit',
  });
}
