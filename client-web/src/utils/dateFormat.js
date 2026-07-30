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
 * Normalise a backend `item_created_at` value to the YYYY-MM-DD string a
 * date picker expects, read as the MOSCOW calendar day.
 *
 * Why this exists (Dima 2026-06-02): `item_created_at` is a Postgres
 * DATE column, but node-postgres parses DATE into a JS Date at the
 * server's local midnight, and JSON serialises that instant as UTC. On
 * the MSK dev/prod server, DATE `2026-05-12` comes back as
 * `"2026-05-11T21:00:00.000Z"`. Naively slicing the first 10 chars gives
 * `2026-05-11` — the operator sees the day BEFORE the one they picked.
 *
 * Fix: if the value is a bare `YYYY-MM-DD` (no time part) trust it as-is;
 * otherwise re-read the instant as the Moscow calendar day via Intl, which
 * recovers the originally-entered date for any server at or west of MSK
 * (covers the LAN-only Moscow deployment). The proper long-term fix is a
 * backend DATE type-parser that returns the raw string — see
 * docs/instructions/operator-vs-creator.md.
 */
export function isoDateToMskInput(raw) {
  if (!raw) return '';
  const s = String(raw);
  // Already a plain calendar date — no timezone ambiguity, use directly.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = safeDate(s);
  if (!d) {
    // Unparseable but date-prefixed — fall back to the leading 10 chars.
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : s;
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: MSK,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d).map((p) => [p.type, p.value])
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

/**
 * d054 batch-times helpers — the constructor's `datetime-iso` fields hold
 * a NAIVE Moscow wall-clock string 'YYYY-MM-DDTHH:mm[:ss]' in state (what
 * the date+time inputs edit), while the backend stores TIMESTAMPTZ.
 * These two convert at the save/restore boundary. MSK is fixed UTC+3
 * (no DST since 2014), so the offset can be a constant.
 */

/**
 * Backend TIMESTAMPTZ ISO → naive MSK 'YYYY-MM-DDTHH:mm:ss' for the
 * date+time inputs. '' for null/unparseable.
 */
export function isoToMskDateTimeInput(raw) {
  const d = safeDate(raw);
  if (!d) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: MSK,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d).map((p) => [p.type, p.value])
  );
  // en-CA with hour12:false can render midnight as '24' — normalize.
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}`;
}

/**
 * Naive MSK 'YYYY-MM-DDTHH:mm[:ss]' (or bare 'YYYY-MM-DD') → ISO with an
 * explicit +03:00 offset for the backend. '' / null → null.
 */
export function mskDateTimeInputToIso(naive) {
  if (!naive) return null;
  const s = String(naive).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00+03:00`;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return `${m[1]}T${m[2]}:${m[3]}:${m[4] || '00'}+03:00`;
}

/**
 * Current moment as a naive MSK 'YYYY-MM-DDTHH:mm:ss' — default for the
 * batch-creation field in the create dialog (glovebox batch starts now).
 */
export function nowMskDateTimeInput(now = new Date()) {
  return isoToMskDateTimeInput(now.toISOString());
}
