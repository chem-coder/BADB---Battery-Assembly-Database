const { trackChanges } = require('../middleware/trackChanges');

const ALLOWED_COIN_LAYOUTS = new Set(['SE', 'ES', 'ESE']);
const ALLOWED_POUCH_CASE_SIZE_CODES = new Set(['103x83', '86x56', 'other']);

class BatteryCellConfigValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BatteryCellConfigValidationError';
    this.statusCode = 400;
  }
}

function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function validateCoinLayout(coinLayout) {
  if (coinLayout != null && coinLayout !== '' && !ALLOWED_COIN_LAYOUTS.has(coinLayout)) {
    throw new BatteryCellConfigValidationError('Допустимые схемы для coin cell: SE, ES, ESE');
  }
}

function validatePouchCaseSize(pouchCaseSizeCode, pouchCaseSizeOther) {
  if (pouchCaseSizeCode == null || pouchCaseSizeCode === '') {
    return;
  }

  if (!ALLOWED_POUCH_CASE_SIZE_CODES.has(pouchCaseSizeCode)) {
    throw new BatteryCellConfigValidationError('Допустимые размеры пакетного/призматического элемента: 103x83, 86x56, other');
  }

  if (
    pouchCaseSizeCode === 'other' &&
    (!pouchCaseSizeOther || !String(pouchCaseSizeOther).trim())
  ) {
    throw new BatteryCellConfigValidationError('Для pouch_case_size_code = other необходимо заполнить pouch_case_size_other');
  }
}

function hasOwn(payload, key) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

async function saveCoinConfig(pool, payload) {
  validateCoinLayout(payload.coin_layout);

  const result = await pool.query(
    `
    INSERT INTO battery_coin_config (
      battery_id,
      coin_cell_mode,
      coin_size_code,
      half_cell_type,
      li_foil_notes,
      spacer_thickness_mm,
      spacer_count,
      spacer_notes,
      coin_layout
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (battery_id) DO UPDATE SET
      coin_cell_mode = EXCLUDED.coin_cell_mode,
      coin_size_code = EXCLUDED.coin_size_code,
      half_cell_type = EXCLUDED.half_cell_type,
      li_foil_notes = EXCLUDED.li_foil_notes,
      spacer_thickness_mm = EXCLUDED.spacer_thickness_mm,
      spacer_count = EXCLUDED.spacer_count,
      spacer_notes = EXCLUDED.spacer_notes,
      coin_layout = EXCLUDED.coin_layout
    RETURNING *
    `,
    [
      payload.battery_id,
      payload.coin_cell_mode || null,
      payload.coin_size_code || null,
      payload.half_cell_type || null,
      payload.li_foil_notes || null,
      payload.spacer_thickness_mm != null ? Number(payload.spacer_thickness_mm) : null,
      payload.spacer_count != null ? Number(payload.spacer_count) : null,
      payload.spacer_notes || null,
      payload.coin_layout || null
    ]
  );

  return result.rows[0];
}

async function getCoinConfig(pool, batteryId) {
  const result = await pool.query(
    `
    SELECT
      battery_id,
      coin_cell_mode,
      coin_size_code,
      half_cell_type,
      li_foil_notes,
      spacer_thickness_mm,
      spacer_count,
      spacer_notes,
      coin_layout
    FROM battery_coin_config
    WHERE battery_id = $1
    `,
    [batteryId]
  );

  return result.rows[0] || null;
}

async function updateCoinConfig(pool, batteryId, payload, userId) {
  const hasCoinCellMode = hasOwn(payload, 'coin_cell_mode');
  const hasCoinSizeCode = hasOwn(payload, 'coin_size_code');
  const hasHalfCellType = hasOwn(payload, 'half_cell_type');
  const hasLiFoilNotes = hasOwn(payload, 'li_foil_notes');
  const hasSpacerThickness = hasOwn(payload, 'spacer_thickness_mm');
  const hasSpacerCount = hasOwn(payload, 'spacer_count');
  const hasSpacerNotes = hasOwn(payload, 'spacer_notes');
  const hasCoinLayout = hasOwn(payload, 'coin_layout');

  if (hasCoinLayout) validateCoinLayout(payload.coin_layout);

  const current = await pool.query(
    'SELECT coin_cell_mode, coin_size_code, half_cell_type, li_foil_notes, spacer_thickness_mm, spacer_count, spacer_notes, coin_layout FROM battery_coin_config WHERE battery_id = $1',
    [batteryId]
  );

  const result = await pool.query(
    `
    UPDATE battery_coin_config
    SET
      coin_cell_mode = CASE WHEN $1 THEN $2 ELSE coin_cell_mode END,
      coin_size_code = CASE WHEN $3 THEN $4 ELSE coin_size_code END,
      half_cell_type = CASE WHEN $5 THEN $6 ELSE half_cell_type END,
      li_foil_notes = CASE WHEN $7 THEN $8 ELSE li_foil_notes END,
      spacer_thickness_mm = CASE WHEN $9 THEN $10 ELSE spacer_thickness_mm END,
      spacer_count = CASE WHEN $11 THEN $12 ELSE spacer_count END,
      spacer_notes = CASE WHEN $13 THEN $14 ELSE spacer_notes END,
      coin_layout = CASE WHEN $15 THEN $16 ELSE coin_layout END
    WHERE battery_id = $17
    RETURNING
      battery_id,
      coin_cell_mode,
      coin_size_code,
      half_cell_type,
      li_foil_notes,
      spacer_thickness_mm,
      spacer_count,
      spacer_notes,
      coin_layout
    `,
    [
      hasCoinCellMode,
      hasCoinCellMode ? (payload.coin_cell_mode || null) : null,
      hasCoinSizeCode,
      hasCoinSizeCode ? (payload.coin_size_code || null) : null,
      hasHalfCellType,
      hasHalfCellType ? (payload.half_cell_type || null) : null,
      hasLiFoilNotes,
      hasLiFoilNotes ? (payload.li_foil_notes || null) : null,
      hasSpacerThickness,
      hasSpacerThickness ? (
        payload.spacer_thickness_mm != null ? Number(payload.spacer_thickness_mm) : null
      ) : null,
      hasSpacerCount,
      hasSpacerCount ? (
        payload.spacer_count != null ? Number(payload.spacer_count) : null
      ) : null,
      hasSpacerNotes,
      hasSpacerNotes ? (payload.spacer_notes || null) : null,
      hasCoinLayout,
      hasCoinLayout ? (payload.coin_layout || null) : null,
      batteryId
    ]
  );

  if (result.rows.length === 0) {
    throw statusError('Конфигурация не найдена', 404);
  }

  if (current.rowCount > 0) {
    const newVals = {};
    if (hasCoinCellMode) newVals.coin_cell_mode = payload.coin_cell_mode || null;
    if (hasCoinSizeCode) newVals.coin_size_code = payload.coin_size_code || null;
    if (hasHalfCellType) newVals.half_cell_type = payload.half_cell_type || null;
    if (hasLiFoilNotes) newVals.li_foil_notes = payload.li_foil_notes || null;
    if (hasSpacerThickness) newVals.spacer_thickness_mm = payload.spacer_thickness_mm != null ? Number(payload.spacer_thickness_mm) : null;
    if (hasSpacerCount) newVals.spacer_count = payload.spacer_count != null ? Number(payload.spacer_count) : null;
    if (hasSpacerNotes) newVals.spacer_notes = payload.spacer_notes || null;
    if (hasCoinLayout) newVals.coin_layout = payload.coin_layout || null;
    await trackChanges(pool, 'battery_coin_config', 'battery_coin_config', 'battery_id', batteryId, current.rows[0], newVals, userId, null, false);
  }

  return result.rows[0];
}

async function savePouchConfig(pool, payload) {
  const batteryId = Number(payload.battery_id);
  validatePouchCaseSize(payload.pouch_case_size_code, payload.pouch_case_size_other);

  const result = await pool.query(
    `
    INSERT INTO battery_pouch_config (
      battery_id,
      pouch_case_size_code,
      pouch_case_size_other,
      pouch_notes
    )
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (battery_id)
    DO UPDATE SET
      pouch_case_size_code = EXCLUDED.pouch_case_size_code,
      pouch_case_size_other = EXCLUDED.pouch_case_size_other,
      pouch_notes = EXCLUDED.pouch_notes
    RETURNING *
    `,
    [
      batteryId,
      payload.pouch_case_size_code || null,
      payload.pouch_case_size_other?.trim() || null,
      payload.pouch_notes || null
    ]
  );

  return result.rows[0];
}

async function getPouchConfig(pool, batteryId) {
  const result = await pool.query(
    `
    SELECT
      battery_id,
      pouch_case_size_code,
      pouch_case_size_other,
      pouch_notes
    FROM battery_pouch_config
    WHERE battery_id = $1
    `,
    [batteryId]
  );

  return result.rows[0] || null;
}

async function updatePouchConfig(pool, batteryId, payload, userId) {
  validatePouchCaseSize(payload.pouch_case_size_code, payload.pouch_case_size_other);

  const current = await pool.query('SELECT pouch_notes FROM battery_pouch_config WHERE battery_id = $1', [batteryId]);

  const result = await pool.query(
    `
    UPDATE battery_pouch_config
    SET
      pouch_case_size_code = $1,
      pouch_case_size_other = $2,
      pouch_notes = $3
    WHERE battery_id = $4
    RETURNING
      battery_id,
      pouch_case_size_code,
      pouch_case_size_other,
      pouch_notes
    `,
    [
      payload.pouch_case_size_code || null,
      payload.pouch_case_size_other?.trim() || null,
      payload.pouch_notes || null,
      batteryId
    ]
  );

  if (result.rows.length === 0) {
    throw statusError('Конфигурация не найдена', 404);
  }

  if (current.rowCount > 0) {
    await trackChanges(pool, 'battery_pouch_config', 'battery_pouch_config', 'battery_id', batteryId, current.rows[0], { pouch_notes: payload.pouch_notes || null }, userId, null, false);
  }

  return result.rows[0];
}

async function saveCylConfig(pool, payload) {
  const batteryId = Number(payload.battery_id);

  const result = await pool.query(
    `
    INSERT INTO battery_cyl_config (
      battery_id,
      cyl_size_code,
      cyl_notes
    )
    VALUES ($1, $2, $3)
    ON CONFLICT (battery_id)
    DO UPDATE SET
      cyl_size_code = EXCLUDED.cyl_size_code,
      cyl_notes = EXCLUDED.cyl_notes
    RETURNING *
    `,
    [
      batteryId,
      payload.cyl_size_code || null,
      payload.cyl_notes || null
    ]
  );

  return result.rows[0];
}

async function getCylConfig(pool, batteryId) {
  const result = await pool.query(
    `
    SELECT
      battery_id,
      cyl_size_code,
      cyl_notes
    FROM battery_cyl_config
    WHERE battery_id = $1
    `,
    [batteryId]
  );

  return result.rows[0] || null;
}

async function updateCylConfig(pool, batteryId, payload, userId) {
  const current = await pool.query('SELECT cyl_size_code, cyl_notes FROM battery_cyl_config WHERE battery_id = $1', [batteryId]);

  const result = await pool.query(
    `
    UPDATE battery_cyl_config
    SET
      cyl_size_code = $1,
      cyl_notes = $2
    WHERE battery_id = $3
    RETURNING
      battery_id,
      cyl_size_code,
      cyl_notes
    `,
    [
      payload.cyl_size_code || null,
      payload.cyl_notes || null,
      batteryId
    ]
  );

  if (result.rows.length === 0) {
    throw statusError('Конфигурация не найдена', 404);
  }

  if (current.rowCount > 0) {
    await trackChanges(pool, 'battery_cyl_config', 'battery_cyl_config', 'battery_id', batteryId, current.rows[0], { cyl_size_code: payload.cyl_size_code || null, cyl_notes: payload.cyl_notes || null }, userId, null, false);
  }

  return result.rows[0];
}

module.exports = {
  BatteryCellConfigValidationError,
  getCoinConfig,
  getCylConfig,
  getPouchConfig,
  saveCoinConfig,
  saveCylConfig,
  savePouchConfig,
  updateCoinConfig,
  updateCylConfig,
  updatePouchConfig
};
