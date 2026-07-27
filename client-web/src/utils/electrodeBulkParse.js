/**
 * Parser for the electrode bulk-paste dialog.
 *
 * Accepts text pasted from Excel/Google Sheets/CSV (tab- or comma-separated)
 * and returns an array of electrode-row candidates. Each candidate has at
 * least `mass_g` plus optional `comments`.
 *
 * Column detection rules (in priority order):
 *   1. If the first line is a header row with recognised keywords
 *      ("масса", "mass", "коммент", "comment"), use it to map columns.
 *      A "стакан"/"cup" header column is still RECOGNISED but its values
 *      are discarded: cup numbers were removed from the UI on 2026-07-17
 *      (nobody records them; the comments field suffices), so old sheets
 *      that still carry a cup column are ignored gracefully instead of
 *      erroring or polluting comments.
 *   2. Otherwise, fall back to positional defaults:
 *        1 column  → [mass]
 *        2 columns → [mass, comments]
 *        3+ cols   → [mass, comments, …] (extra columns joined into
 *                    comments with " | " separators so nothing is
 *                    silently dropped)
 *
 * Cells are trimmed; empty `mass` cells skip the whole row.
 * Russian decimal commas (1,23) and dots (1.23) both parse to Number.
 *
 * Output row shape: { mass_g: number, comments: string }
 */

const HEADER_PATTERNS = {
  mass: /(масса|вес|mass|weight)/i,
  // Recognised only to EXCLUDE the column from output (deprecated field).
  cup: /(стакан|cup)/i,
  comments: /(коммент|comment|примеч|note)/i,
};

const FIELD_ORDER_FALLBACK = ['mass', 'comments'];

function splitLine(line) {
  // Tab-first, then comma. Excel paste is always tab-separated.
  if (line.includes('\t')) return line.split('\t');
  if (line.includes(',') && !line.includes(';')) return line.split(',');
  if (line.includes(';')) return line.split(';');
  return [line];
}

function parseNumberLoose(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim().replace(/\s+/g, '');
  if (!trimmed) return null;
  // Russian decimal commas (1,23) and dots (1.23) both work.
  const normalized = trimmed.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function detectHeader(cells) {
  if (!cells.some((c) => /[a-zа-яё]/i.test(c))) return null; // numeric row, not a header
  const map = {};
  cells.forEach((cell, idx) => {
    const trimmed = cell.trim();
    for (const [field, pattern] of Object.entries(HEADER_PATTERNS)) {
      if (pattern.test(trimmed) && map[field] == null) {
        map[field] = idx;
        return;
      }
    }
  });
  if (map.mass == null) return null;
  return map;
}

function buildPositionalMap(colCount) {
  const map = {};
  FIELD_ORDER_FALLBACK.slice(0, Math.min(colCount, FIELD_ORDER_FALLBACK.length)).forEach((field, idx) => {
    map[field] = idx;
  });
  return map;
}

/**
 * Parse pasted clipboard text into electrode row candidates.
 *
 * @param {string} text - raw clipboard text (tab/comma/semicolon separated)
 * @returns {{rows: Array, columnsDetected: string[], skippedLines: number}}
 */
export function parseBulkPaste(text) {
  if (!text || typeof text !== 'string') {
    return { rows: [], columnsDetected: [], skippedLines: 0 };
  }
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { rows: [], columnsDetected: [], skippedLines: 0 };
  }

  // Try header detection on first line.
  const firstCells = splitLine(lines[0]).map((c) => c.trim());
  const headerMap = detectHeader(firstCells);
  const startLine = headerMap ? 1 : 0;
  const colMap = headerMap || buildPositionalMap(firstCells.length);

  // A mapped cup column is deliberately not surfaced: it exists in the
  // map only so its cells are claimed (and skipped) rather than parsed
  // as something else.
  const columnsDetected = Object.keys(colMap).filter((f) => f !== 'cup');
  const rows = [];
  let skippedLines = 0;

  for (let i = startLine; i < lines.length; i++) {
    const cells = splitLine(lines[i]).map((c) => c.trim());
    const massRaw = cells[colMap.mass];
    const mass_g = parseNumberLoose(massRaw);
    if (mass_g == null) {
      skippedLines += 1;
      continue;
    }

    let comments = '';
    if (colMap.comments != null && cells[colMap.comments]) {
      comments = cells[colMap.comments];
    }
    // If positional fallback and there are extra columns beyond what we
    // mapped, join them into comments so nothing is silently dropped.
    if (!headerMap && cells.length > FIELD_ORDER_FALLBACK.length) {
      const extra = cells.slice(FIELD_ORDER_FALLBACK.length).filter(Boolean).join(' | ');
      comments = comments ? `${comments} | ${extra}` : extra;
    }

    rows.push({ mass_g, comments });
  }

  return { rows, columnsDetected, skippedLines };
}
