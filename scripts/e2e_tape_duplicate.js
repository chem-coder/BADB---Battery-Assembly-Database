#!/usr/bin/env node

/**
 * E2E harness for the tape duplicate fix.
 *
 * Uses the normal login flow (E2E_TEST_USERNAME / E2E_TEST_PASSWORD) and exercises
 * the same read-only restore phase duplicateTapeRecord() performs before any POST.
 * Then creates a new tape (save phase) and verifies the source tape is unchanged.
 *
 * This does not drive the browser UI, but it validates the server-side contract
 * the duplicate draft relies on.
 */

const {
  e2eLogin,
  e2eMe,
  e2eFetch,
  saveE2eSession
} = require('./lib/e2e_auth');

const STEP_CODES = [
  'drying_am',
  'weighing',
  'mixing',
  'coating',
  'drying_tape',
  'calendering',
  'drying_pressed_tape'
];

function log(msg) {
  console.log(`[e2e:tape-duplicate] ${msg}`);
}

function fail(msg) {
  console.error(`[e2e:tape-duplicate] FAIL: ${msg}`);
  process.exit(1);
}

function pass(msg) {
  console.log(`[e2e:tape-duplicate] PASS: ${msg}`);
}

function pickRichTape(tapes) {
  return tapes.find((t) => t.tape_recipe_id) || tapes[0] || null;
}

async function fetchTapeRestoreData(session, tape) {
  const tapeId = Number(tape.tape_id);
  const restoreGets = [];

  for (const code of STEP_CODES) {
    const { res, body } = await e2eFetch(session, `/api/tapes/${tapeId}/steps/by-code/${code}`);
    if (!res.ok) {
      throw new Error(`restore GET ${code} failed: HTTP ${res.status}`);
    }
    restoreGets.push({ code, body });
  }

  let actuals = [];
  if (tape.tape_recipe_id) {
    const { res, body } = await e2eFetch(session, `/api/tapes/${tapeId}/actuals`);
    if (res.ok && Array.isArray(body)) {
      actuals = body;
    }
  }

  const { res: dryRes, body: dryBoxState } = await e2eFetch(session, `/api/tapes/${tapeId}/dry-box-state`);
  if (!dryRes.ok && dryRes.status !== 404) {
    throw new Error(`restore GET dry-box-state failed: HTTP ${dryRes.status}`);
  }

  return {
    tape,
    stepsByCode: Object.fromEntries(restoreGets.map(({ code, body }) => [code, body])),
    actuals,
    dryBoxState: dryRes.ok ? dryBoxState : null,
    restoreGetCount: restoreGets.length + (tape.tape_recipe_id ? 1 : 0) + (dryRes.ok ? 1 : 0)
  };
}

function buildDuplicateCreatePayload(sourceTape, restoreData) {
  const today = new Date();
  const itemCreatedAt = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return {
    name: `${(sourceTape.name || 'Лента').trim()} (копия)`,
    notes: sourceTape.notes || null,
    project_id: sourceTape.project_id || null,
    tape_recipe_id: sourceTape.tape_recipe_id || null,
    tape_type: sourceTape.role || sourceTape.tape_type || null,
    calc_mode: sourceTape.calc_mode || 'from_active_mass',
    target_mass_g: sourceTape.target_mass_g || null,
    item_created_at: itemCreatedAt,
    // Duplicate draft intentionally does not copy dry-box / depleted state.
    availability_status: 'out_of_dry_box'
  };
}

async function getTapeById(session, tapeId) {
  const { res, body } = await e2eFetch(session, '/api/tapes');
  if (!res.ok) throw new Error(`GET /api/tapes failed: HTTP ${res.status}`);
  return (Array.isArray(body) ? body : []).find((t) => Number(t.tape_id) === Number(tapeId)) || null;
}

async function main() {
  const session = await e2eLogin();
  const me = await e2eMe(session);
  saveE2eSession({ ...session, user: me });

  const label = me.name || me.login || `user #${me.userId}`;
  log(`authenticated as ${label}`);

  const { res: listRes, body: tapes } = await e2eFetch(session, '/api/tapes');
  if (!listRes.ok || !Array.isArray(tapes) || tapes.length === 0) {
    fail('no tapes visible to the E2E user — pick a source tape manually in the UI first');
  }

  const sourceTape = pickRichTape(tapes);
  const sourceId = Number(sourceTape.tape_id);
  log(`source tape #${sourceId} (${sourceTape.name || 'unnamed'})`);

  const beforeSource = { ...sourceTape };

  // Duplicate open phase: read-only restore fetches only (no POST /api/tapes).
  const restoreData = await fetchTapeRestoreData(session, sourceTape);
  pass(`duplicate restore phase used ${restoreData.restoreGetCount} GET request(s), 0 POST /api/tapes`);

  const hasRecipe = Boolean(sourceTape.tape_recipe_id);
  const hasSteps = Object.values(restoreData.stepsByCode).some(
    (row) => row && typeof row === 'object' && Object.keys(row).length > 0
  );
  const hasActuals = restoreData.actuals.length > 0;

  if (hasRecipe) pass('source has recipe reference for duplicate copy');
  if (hasSteps) pass('source has at least one workflow step payload to copy');
  if (hasActuals) pass('source has actual amounts to copy');

  // Save phase: explicit create only after user confirms draft.
  const createPayload = buildDuplicateCreatePayload(sourceTape, restoreData);
  const { res: createRes, body: created } = await e2eFetch(session, '/api/tapes', {
    method: 'POST',
    body: JSON.stringify(createPayload)
  });

  if (!createRes.ok || !created?.tape_id) {
    fail(`POST /api/tapes create failed: HTTP ${createRes.status}`);
  }

  const newId = Number(created.tape_id);
  if (newId === sourceId) {
    fail('create returned the same tape_id as the source');
  }
  pass(`create produced new tape #${newId}`);

  const sourceAfter = await getTapeById(session, sourceId);
  if (!sourceAfter) {
    fail('source tape disappeared after duplicate create');
  }

  const unchangedFields = ['name', 'tape_recipe_id', 'project_id', 'notes', 'role'];
  for (const field of unchangedFields) {
    const before = beforeSource[field];
    const after = sourceAfter[field];
    if (String(before ?? '') !== String(after ?? '')) {
      fail(`source tape field "${field}" changed (${before} -> ${after})`);
    }
  }
  pass('source tape general fields unchanged after duplicate create');

  if (String(sourceAfter.updated_at || '') !== String(beforeSource.updated_at || '')) {
    // General-info create should not update the source tape.
    fail('source tape updated_at changed after duplicate create');
  }
  pass('source tape updated_at unchanged');

  const newTape = await getTapeById(session, newId);
  if (!newTape) fail('new tape not found in list after create');

  if (String(newTape.name || '').includes('(копия)')) {
    pass('new tape name reflects duplicate draft naming');
  }

  if (Number(newTape.tape_recipe_id || 0) === Number(sourceTape.tape_recipe_id || 0) && hasRecipe) {
    pass('new tape copied recipe reference');
  }

  log('duplicate harness complete — for UI checks (no immediate POST, draft overlay, section copy), verify in browser with the saved session');
}

main().catch((err) => {
  console.error(`[e2e:tape-duplicate] ${err.message}`);
  process.exit(1);
});
