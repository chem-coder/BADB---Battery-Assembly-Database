#!/usr/bin/env node

/**
 * BADB vanilla API smoke/regression harness.
 *
 * This script restores a full SQL dump into a throwaway database, starts the
 * Express API against that database with auth bypass, exercises the endpoints
 * used by the vanilla public UI, and then cleans up.
 *
 * Usage:
 *   npm run smoke:vanilla
 *   node scripts/smoke_vanilla_api.js --dump=sql_backups/local_only/0424_badb_app_v1_full.sql
 *   node scripts/smoke_vanilla_api.js --keep-db --verbose
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOCAL_ONLY_DUMP = path.join(ROOT, 'sql_backups', 'local_only', '0424_badb_app_v1_full.sql');
const LEGACY_DUMP = path.join(ROOT, 'sql_backups', '0424_badb_app_v1_full.sql');
const DEFAULT_DUMP = fs.existsSync(LOCAL_ONLY_DUMP) ? LOCAL_ONLY_DUMP : LEGACY_DUMP;
const DEFAULT_DB = 'badb_app_v1_smoke';
const DEFAULT_LOGIN = 'dkmaraulayte';
const POST_DUMP_MIGRATIONS = [
  path.join(ROOT, 'migrations', '002_raw_submissions.sql'),
  path.join(ROOT, 'migrations', '018_department_real_names_and_assignments.sql'),
  path.join(ROOT, 'migrations', '019_cycling_summary_extra_metrics.sql'),
  path.join(ROOT, 'migrations', '020_cycling_active_mass.sql'),
  path.join(ROOT, 'migrations', 'd028_tape_projects_many_to_many.sql'),
  path.join(ROOT, 'migrations', 'd029_electrode_cut_batch_projects_many_to_many.sql'),
  path.join(ROOT, 'migrations', 'd030_battery_projects_many_to_many.sql'),
  path.join(ROOT, 'migrations', 'd031_harden_battery_stack_validate_trigger.sql'),
  path.join(ROOT, 'migrations', 'd032_create_schema_migrations_table.sql'),
  path.join(ROOT, 'migrations', 'd033_add_coating_side2_gap_and_drying_speed.sql'),
  path.join(ROOT, 'migrations', 'd034_update_wet_mixing_methods.sql'),
  path.join(ROOT, 'migrations', 'd035_add_item_created_at_dates.sql'),
  path.join(ROOT, 'migrations', 'd036_add_prism_form_factor.sql'),
  path.join(ROOT, 'migrations', 'd037_add_viscosity_conditions.sql'),
  path.join(ROOT, 'migrations', 'd038_add_electrode_capacity_average_flag.sql'),
  path.join(ROOT, 'migrations', 'd039_add_electrode_test_batch_flag.sql'),
  path.join(ROOT, 'migrations', 'd040_add_coated_thickness_fields.sql'),
  path.join(ROOT, 'migrations', 'd041_project_participants.sql'),
  path.join(ROOT, 'migrations', 'd042_project_leads_as_team_members.sql'),
  path.join(ROOT, 'migrations', 'd043_enable_multi_battery_electrode_sources.sql'),
  path.join(ROOT, 'migrations', 'd044_access_level_none.sql'),
  path.join(ROOT, 'migrations', 'd045_material_instance_components_ddl.sql'),
  path.join(ROOT, 'migrations', 'd046_indexes_and_timestamps.sql'),
  path.join(ROOT, 'migrations', 'd047_recipe_active_material_slot.sql'),
  path.join(ROOT, 'migrations', 'd048_vilitek_mixer_containers_and_balls.sql'),
  path.join(ROOT, 'migrations', 'd049_fix_vilitek_cup_sizes.sql'),
  path.join(ROOT, 'migrations', 'd050_recipe_slot_marker_am.sql'),
  path.join(ROOT, 'migrations', 'd051_backfill_ledger_rows_d044_d046.sql')
];

function parseArgs(argv) {
  const opts = {
    dump: DEFAULT_DUMP,
    db: DEFAULT_DB,
    port: null,
    bypassLogin: DEFAULT_LOGIN,
    keepDb: false,
    keepServer: false,
    restoreOnly: false,
    getOnly: false,
    verbose: false
  };

  for (const arg of argv) {
    if (arg.startsWith('--dump=')) opts.dump = path.resolve(ROOT, arg.slice('--dump='.length));
    else if (arg.startsWith('--db=')) opts.db = arg.slice('--db='.length);
    else if (arg.startsWith('--port=')) opts.port = Number(arg.slice('--port='.length));
    else if (arg.startsWith('--bypass-login=')) opts.bypassLogin = arg.slice('--bypass-login='.length);
    else if (arg === '--keep-db') opts.keepDb = true;
    else if (arg === '--keep-server') opts.keepServer = true;
    else if (arg === '--restore-only') opts.restoreOnly = true;
    else if (arg === '--get-only') opts.getOnly = true;
    else if (arg === '--verbose') opts.verbose = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!opts.db.startsWith('badb_app_v1_smoke')) {
    throw new Error(`Refusing to manage non-smoke database: ${opts.db}`);
  }

  if (opts.port !== null && (!Number.isInteger(opts.port) || opts.port <= 0)) {
    throw new Error(`Invalid port: ${opts.port}`);
  }

  return opts;
}

function printHelp() {
  console.log(`
BADB vanilla API smoke/regression harness

Options:
  --dump=<path>          SQL dump to restore
  --db=<name>            Throwaway DB name; must start with badb_app_v1_smoke
  --port=<port>          API port; random free port by default
  --bypass-login=<login> Auth-bypass login; default ${DEFAULT_LOGIN}
  --get-only             Skip write-path smoke tests
  --restore-only         Restore dump, then exit
  --keep-db              Do not drop smoke DB at the end
  --keep-server          Leave spawned API server running; also keeps DB
  --verbose              Print server output and successful checks
`);
}

function log(message) {
  console.log(`[smoke] ${message}`);
}

function findTool(tool) {
  const candidates = [
    tool,
    `/Applications/Postgres.app/Contents/Versions/latest/bin/${tool}`,
    `/Applications/Postgres.app/Contents/Versions/16/bin/${tool}`,
    `/opt/homebrew/bin/${tool}`,
    `/usr/local/bin/${tool}`
  ];

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && fs.existsSync(candidate)) return candidate;
    const found = spawnSync('which', [candidate], { encoding: 'utf8' });
    if (found.status === 0) return found.stdout.trim().split('\n')[0];
  }

  throw new Error(`Could not find ${tool}`);
}

function run(command, args, { env, quiet = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: { ...process.env, PAGER: '', ...(env || {}) },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 50
  });

  if (result.status !== 0) {
    const rendered = [command, ...args].join(' ');
    const stderr = (result.stderr || '').trim();
    const stdout = (result.stdout || '').trim();
    throw new Error(`${rendered} failed\n${stderr || stdout}`);
  }

  if (!quiet && result.stdout) process.stdout.write(result.stdout);
  return result.stdout || '';
}

function runSmokeSql(context, sql) {
  if (!context?.psql || !context?.db) {
    throw new Error('Smoke SQL context is not available');
  }

  return run(context.psql, [
    '-d',
    context.db,
    '-v',
    'ON_ERROR_STOP=1',
    '-At',
    '-c',
    sql
  ], { quiet: true }).trim();
}

function formatDateOnly(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForApi(baseUrl, serverLog) {
  const deadline = Date.now() + 20000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/users`);
      if (res.ok) return;
      lastError = new Error(`HTTP ${res.status}: ${await res.text()}`);
    } catch (err) {
      lastError = err;
    }
    await sleep(300);
  }

  throw new Error(`API did not become ready. Last error: ${lastError?.message || 'unknown'}\n${serverLog()}`);
}

function startApi({ db, port, bypassLogin, verbose }) {
  const lines = [];
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      DB_NAME: db,
      PORT: String(port),
      AUTH_BYPASS: 'true',
      BYPASS_LOGIN: bypassLogin
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const remember = (chunk, stream) => {
    const text = chunk.toString();
    if (verbose) process[stream].write(text);
    for (const line of text.split(/\r?\n/).filter(Boolean)) {
      lines.push(line);
      while (lines.length > 60) lines.shift();
    }
  };

  proc.stdout.on('data', (chunk) => remember(chunk, 'stdout'));
  proc.stderr.on('data', (chunk) => remember(chunk, 'stderr'));

  return {
    proc,
    log: () => lines.join('\n')
  };
}

async function stopApi(server) {
  if (!server?.proc || server.proc.killed) return;
  server.proc.kill('SIGTERM');
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (server.proc.exitCode !== null || server.proc.signalCode !== null) return;
    await sleep(100);
  }
  server.proc.kill('SIGKILL');
}

function installGlobalErrorContext() {
  process.on('unhandledRejection', (err) => {
    console.error(err);
    process.exit(1);
  });
}

class SmokeClient {
  constructor(baseUrl, { verbose = false } = {}) {
    this.baseUrl = baseUrl;
    this.verbose = verbose;
    this.checks = [];
    this.failures = [];
  }

  async request(method, endpoint, body, accept = [200, 201, 204]) {
    const res = await fetch(this.baseUrl + endpoint, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    const record = {
      method,
      endpoint,
      status: res.status,
      ok: accept.includes(res.status),
      body: parsed,
      text: text.slice(0, 800)
    };
    this.checks.push(record);

    if (!record.ok) {
      this.failures.push(record);
      console.error(`FAIL ${method} ${endpoint} -> ${res.status}`);
      if (record.text) console.error(record.text);
    } else if (this.verbose) {
      console.log(`OK   ${method} ${endpoint}`);
    }

    return parsed;
  }

  get(endpoint, accept) {
    return this.request('GET', endpoint, undefined, accept);
  }

  post(endpoint, body, accept) {
    return this.request('POST', endpoint, body, accept);
  }

  put(endpoint, body, accept) {
    return this.request('PUT', endpoint, body, accept);
  }

  patch(endpoint, body, accept) {
    return this.request('PATCH', endpoint, body, accept);
  }

  del(endpoint, accept) {
    return this.request('DELETE', endpoint, undefined, accept);
  }

  async expectDependencyConflict(method, endpoint, body) {
    const parsed = await this.request(method, endpoint, body, [409]);
    const hasConflictPayload = parsed &&
      typeof parsed.error === 'string' &&
      Array.isArray(parsed.dependencies) &&
      parsed.dependencies.length > 0;

    if (!hasConflictPayload) {
      this.failures.push({
        method,
        endpoint,
        status: 'assertion',
        ok: false,
        body: parsed,
        text: 'Expected 409 dependency payload with error and dependencies[]'
      });
      console.error(`FAIL ${method} ${endpoint} -> missing dependency conflict payload`);
    }

    return parsed;
  }

  assertEqual(actual, expected, label) {
    if (String(actual) === String(expected)) return;

    this.failures.push({
      method: 'ASSERT',
      endpoint: label,
      status: 'assertion',
      ok: false,
      body: { actual, expected },
      text: `${label}: expected ${expected}, got ${actual}`
    });
    console.error(`FAIL ASSERT ${label}: expected ${expected}, got ${actual}`);
  }

  assertNoFailures(label) {
    if (this.failures.length > 0) {
      throw new Error(`${label} failed: ${this.failures.length} failed check(s)`);
    }
  }
}

async function runGetSmoke(client) {
  const seed = {};

  seed.me = await client.get('/api/auth/me');
  seed.users = await client.get('/api/users');
  seed.projects = await client.get('/api/projects');
  seed.materials = await client.get('/api/materials');
  seed.materialInstances = await client.get('/api/materials/instances');
  seed.recipes = await client.get('/api/recipes');
  seed.separators = await client.get('/api/separators');
  seed.structures = await client.get('/api/structures');
  seed.electrolytes = await client.get('/api/electrolytes');
  seed.tapes = await client.get('/api/tapes');
  seed.tapesForElectrodes = await client.get('/api/tapes/for-electrodes');
  seed.cutBatches = await client.get('/api/electrodes/electrode-cut-batches');
  seed.batteries = await client.get('/api/batteries');

  for (const ref of [
    'drying-atmospheres',
    'dry-mixing-methods',
    'wet-mixing-methods',
    'coating-methods',
    'foils'
  ]) {
    await client.get(`/api/reference/${ref}`);
  }

  const project = first(seed.projects);
  if (project) {
    await client.get(`/api/projects/${project.project_id}/access`, [200, 403]);
    await client.get(`/api/projects/${project.project_id}/participants`, [200, 403]);
    await client.get(`/api/projects/${project.project_id}/report`, [200, 403]);
  }

  const user = first(seed.users);
  if (user) await client.get(`/api/users/${user.user_id}/projects`, [200, 403]);

  const material = first(seed.materials);
  if (material) await client.get(`/api/materials/${material.material_id}/instances`);

  const pureInstance = seed.materialInstances.find((item) => item.is_pure) || first(seed.materialInstances);
  if (pureInstance) {
    const id = pureInstance.material_instance_id;
    await client.get(`/api/materials/instances/${id}/components`);
    await client.get(`/api/materials/instances/${id}/source-info`);
    await client.get(`/api/materials/instances/${id}/source-info/files`);
    await client.get(`/api/materials/instances/${id}/properties`);
    await client.get(`/api/materials/instances/${id}/properties/files`);
  }

  const recipe = first(seed.recipes);
  if (recipe) {
    await client.get(`/api/recipes/${recipe.tape_recipe_id}`);
    await client.get(`/api/recipes/${recipe.tape_recipe_id}/lines`);
  }

  const separator = first(seed.separators);
  if (separator) await client.get(`/api/separators/${separator.sep_id}/files`);

  const electrolyte = first(seed.electrolytes);
  if (electrolyte) await client.get(`/api/electrolytes/${electrolyte.electrolyte_id}/files`);

  const tape = first(seed.tapes);
  if (tape) {
    const id = tape.tape_id;
    await client.get(`/api/tapes/${id}`);
    await client.get(`/api/tapes/${id}/actuals`);
    await client.get(`/api/tapes/${id}/dry-box-state`);
    await client.get(`/api/tapes/${id}/electrode-cut-batches`);
    await client.get(`/api/tapes/${id}/report`);

    for (const code of [
      'drying_am',
      'weighing',
      'mixing',
      'coating',
      'drying_tape',
      'calendering',
      'drying_pressed_tape'
    ]) {
      await client.get(`/api/tapes/${id}/steps/by-code/${code}`);
    }

    for (const code of ['drying_am', 'drying_tape', 'drying_pressed_tape']) {
      await client.get(`/api/tapes/${id}/steps/drying?operation_code=${code}`);
    }
    await client.get(`/api/tapes/${id}/steps/drying`);
  }

  const batch = first(seed.cutBatches);
  if (batch) {
    const id = batch.cut_batch_id;
    await client.get(`/api/electrodes/electrode-cut-batches/${id}`);
    await client.get(`/api/electrodes/electrode-cut-batches/${id}/report`);
    await client.get(`/api/electrodes/electrode-cut-batches/${id}/electrodes`);
    await client.get(`/api/electrodes/electrode-cut-batches/${id}/foil-masses`);
    await client.get(`/api/electrodes/electrode-cut-batches/${id}/drying`);
  }

  const battery = first(seed.batteries);
  const batteryTapeId = first(seed.cutBatches)?.tape_id || tape?.tape_id;
  if (battery) {
    const id = battery.battery_id;
    await client.get(`/api/batteries/${id}`);
    await client.get(`/api/batteries/${id}/assembly`);
    await client.get(`/api/batteries/${id}/report`);
    if (batteryTapeId) await client.get(`/api/batteries/${id}/electrode-cut-batches?tape_id=${batteryTapeId}`);

    for (const route of [
      'battery_coin_config',
      'battery_pouch_config',
      'battery_cyl_config',
      'battery_electrode_sources',
      'battery_electrodes',
      'battery_sep_config',
      'battery_electrolyte',
      'battery_qc',
      'battery_electrochem'
    ]) {
      await client.get(`/api/batteries/${route}/${id}`, [200, 404]);
    }
  }

  return seed;
}

async function runWriteSmoke(client, seed, context) {
  const suffix = Date.now();
  const fileBase64 = Buffer.from('BADB smoke file').toString('base64');
  const made = {};

  try {
    const userId = seed.me?.userId ||
      seed.users.find((u) => u.login === DEFAULT_LOGIN)?.user_id ||
      first(seed.users)?.user_id;
    const projectId = first(seed.projects)?.project_id;
    // d047: tapes name their own active material; keep the picked recipe and
    // material role-compatible (cathode recipe <-> cathode_active material).
    const existingRecipeId = (seed.recipes.find((r) => r.role === 'cathode') || first(seed.recipes))?.tape_recipe_id;
    const existingElectrolyteId = first(seed.electrolytes)?.electrolyte_id;
    const activeMaterial = seed.materials.find((m) => m.role === 'cathode_active') ||
      seed.materials.find((m) => String(m.role).includes('active')) || first(seed.materials);
    const binderMaterial = seed.materials.find((m) => m.role === 'binder') || seed.materials[1] || first(seed.materials);
    const solventMaterial = seed.materials.find((m) => m.role === 'solvent') || seed.materials[2] || first(seed.materials);

    requireSeed({ userId, projectId, existingRecipeId, existingElectrolyteId, activeMaterial, binderMaterial, solventMaterial });

    made.userId = (await client.post('/api/users', {
      name: `Codex Smoke User ${suffix}`,
      login: `codex_smoke_${suffix}`,
      password: `Smoke-${suffix}`,
      active: true,
      role: 'employee',
      position: 'QA',
      department_id: 1
    })).user_id;
    await client.put(`/api/users/${made.userId}`, {
      name: `Codex Smoke User ${suffix} Updated`,
      login: `codex_smoke_${suffix}`,
      active: true,
      role: 'employee',
      position: 'QA2',
      department_id: 1
    });
    const forgedUserId = made.userId;

    made.projectId = (await client.post('/api/projects', {
      name: `Codex Smoke Project ${suffix}`,
      lead_id: userId,
      created_by: forgedUserId,
      status: 'active',
      description: 'smoke',
      confidentiality_level: 'public'
    })).project_id;
    client.assertEqual(
      (await client.get('/api/projects')).find((project) => project.project_id === made.projectId)?.created_by,
      userId,
      'project create ignores browser-created created_by'
    );
    await client.put(`/api/projects/${made.projectId}`, {
      name: `Codex Smoke Project ${suffix} Updated`,
      lead_id: userId,
      status: 'active',
      description: 'smoke update',
      confidentiality_level: 'public'
    });
    const leadParticipants = await client.get(`/api/projects/${made.projectId}/participants`);
    client.assertEqual(
      leadParticipants.some((row) => Number(row.user_id) === Number(userId)),
      true,
      'project lead is added to project participants'
    );
    const leadAccessRows = await client.get(`/api/projects/${made.projectId}/access`);
    client.assertEqual(
      leadAccessRows.some((row) => (
        row.grantee_type === 'user' &&
        Number(row.grantee_id) === Number(userId) &&
        row.access_level === 'admin'
      )),
      true,
      'project lead receives admin access'
    );
    const participant = await client.post(`/api/projects/${made.projectId}/participants`, {
      user_id: made.userId,
      role_in_team: 'Smoke analyst'
    });
    made.projectParticipantId = participant.participant_id;
    client.assertEqual(participant.role_in_team, 'Smoke analyst', 'project participant role is saved');
    await client.put(`/api/projects/${made.projectId}/participants/${made.projectParticipantId}`, {
      role_in_team: 'Smoke lead analyst'
    });
    const participantRows = await client.get(`/api/projects/${made.projectId}/participants`);
    client.assertEqual(
      participantRows.some(row => row.participant_id === made.projectParticipantId && row.role_in_team === 'Smoke lead analyst'),
      true,
      'project participant role is updated'
    );
    const participantAccessRows = await client.get(`/api/projects/${made.projectId}/access`);
    client.assertEqual(
      participantAccessRows.some(row => row.grantee_type === 'participant' && row.grantee_id === made.userId),
      true,
      'project participant appears as a project access source'
    );
    client.assertEqual(
      participantAccessRows.some(row => (
        row.grantee_type === 'user' &&
        row.grantee_id === made.userId &&
        row.access_level === 'view'
      )),
      true,
      'project participant receives direct view access'
    );
    await client.post(`/api/projects/${made.projectId}/access`, {
      user_id: made.userId,
      access_level: 'edit'
    });
    const editAccessRows = await client.get(`/api/projects/${made.projectId}/access`);
    client.assertEqual(
      editAccessRows.some(row => (
        row.grantee_type === 'user' &&
        row.grantee_id === made.userId &&
        row.access_level === 'edit'
      )),
      true,
      'project participant access can be changed to edit'
    );
    const userProjectRows = await client.get(`/api/users/${made.userId}/projects`);
    client.assertEqual(
      userProjectRows.some((row) => (
        Number(row.project_id) === Number(made.projectId) &&
        row.role_in_team === 'Smoke lead analyst' &&
        row.access_level === 'edit'
      )),
      true,
      'user projects endpoint lists participant role and access level'
    );
    const projectReport = await client.get(`/api/projects/${made.projectId}/report`);
    client.assertEqual(
      Array.isArray(projectReport.participants) &&
      projectReport.participants.some((row) => row.participant_id === made.projectParticipantId),
      true,
      'project report includes participants'
    );
    client.assertEqual(
      Array.isArray(projectReport.access?.effective_users) &&
      projectReport.access.effective_users.some((row) => (
        Number(row.user_id) === Number(made.userId) &&
        row.access_level === 'edit'
      )),
      true,
      'project report includes effective participant access'
    );
    await client.del(`/api/projects/${made.projectId}/participants/${made.projectParticipantId}`, [204]);
    const participantsAfterDelete = await client.get(`/api/projects/${made.projectId}/participants`);
    client.assertEqual(
      participantsAfterDelete.some((row) => row.participant_id === made.projectParticipantId),
      false,
      'participant removal deletes team membership'
    );
    const accessAfterDelete = await client.get(`/api/projects/${made.projectId}/access`);
    client.assertEqual(
      accessAfterDelete.some((row) => row.grantee_type === 'user' && Number(row.grantee_id) === Number(made.userId)),
      false,
      'participant removal revokes direct user access grant'
    );
    made.projectParticipantId = null;

    made.structureId = (await client.post('/api/structures', {
      name: `Codex Smoke Structure ${suffix}`,
      comments: 'smoke'
    })).sep_str_id;
    await client.put(`/api/structures/${made.structureId}`, {
      name: `Codex Smoke Structure ${suffix} Updated`,
      comments: 'smoke update'
    });

    made.separatorId = (await client.post('/api/separators', {
      name: `Codex Smoke Separator ${suffix}`,
      supplier: 'Codex',
      brand: 'Smoke',
      batch: String(suffix),
      structure_id: made.structureId,
      air_perm: 1,
      air_perm_units: 's/100ml',
      thickness_um: 20,
      porosity: 40,
      comments: 'smoke',
      status: 'available',
      created_by: forgedUserId
    })).sep_id;
    client.assertEqual(
      (await client.get('/api/separators')).find((separator) => separator.sep_id === made.separatorId)?.created_by,
      userId,
      'separator create ignores browser-created created_by'
    );
    await client.expectDependencyConflict('DELETE', `/api/structures/${made.structureId}`);
    await client.put(`/api/separators/${made.separatorId}`, {
      name: `Codex Smoke Separator ${suffix} Updated`,
      supplier: 'Codex',
      brand: 'Smoke',
      batch: String(suffix),
      structure_id: made.structureId,
      air_perm: 2,
      air_perm_units: 's/100ml',
      thickness_um: 21,
      porosity: 41,
      comments: 'smoke update',
      status: 'available',
      created_by: userId
    });
    made.separatorFileId = (await client.post(`/api/separators/${made.separatorId}/files`, {
      entries: [{ file_name: 'separator.txt', mime_type: 'text/plain', file_content_base64: fileBase64 }]
    }))?.[0]?.separator_file_id;
    client.assertEqual(Boolean(made.separatorFileId), true, 'separator file upload returns file id');
    const separatorReport = await client.get(`/api/separators/${made.separatorId}/report`);
    client.assertEqual(separatorReport.separator?.sep_id, made.separatorId, 'separator report returns current separator');
    client.assertEqual(
      separatorReport.files?.some((file) => Number(file.separator_file_id) === Number(made.separatorFileId)),
      true,
      'separator report includes uploaded file metadata'
    );
    if (made.separatorFileId) {
      const separatorDownload = await client.get(`/api/separators/files/${made.separatorFileId}/download`);
      client.assertEqual(separatorDownload, 'BADB smoke file', 'separator file download returns uploaded bytes');
    }
    const clearSeparatorDeleteCheck = await client.get(`/api/separators/${made.separatorId}/delete-check`);
    client.assertEqual(clearSeparatorDeleteCheck.can_delete, true, 'separator delete preflight allows unused separator');

    const electrolyte = await client.post('/api/electrolytes', {
      name: `Codex Smoke Electrolyte ${suffix}`,
      electrolyte_type: 'liquid',
      solvent_system: 'EC:DMC',
      salts: 'LiPF6',
      concentration: '1M',
      additives: 'none',
      notes: 'smoke',
      status: 'active',
      created_by: forgedUserId
    });
    made.electrolyteId = electrolyte.electrolyte_id;
    client.assertEqual(
      electrolyte.created_by,
      userId,
      'electrolyte create ignores browser-created created_by'
    );
    await client.put(`/api/electrolytes/${made.electrolyteId}`, {
      name: `Codex Smoke Electrolyte ${suffix} Updated`,
      electrolyte_type: 'liquid',
      solvent_system: 'EC:DMC',
      salts: 'LiPF6',
      concentration: '1M',
      additives: 'none',
      notes: 'smoke update',
      status: 'active'
    });
    made.electrolyteFileId = (await client.post(`/api/electrolytes/${made.electrolyteId}/files`, {
      entries: [{ file_name: 'electrolyte.txt', mime_type: 'text/plain', file_content_base64: fileBase64 }]
    }))?.[0]?.electrolyte_file_id;
    client.assertEqual(Boolean(made.electrolyteFileId), true, 'electrolyte file upload returns file id');
    const electrolyteReport = await client.get(`/api/electrolytes/${made.electrolyteId}/report`);
    client.assertEqual(electrolyteReport.electrolyte?.electrolyte_id, made.electrolyteId, 'electrolyte report returns current electrolyte');
    client.assertEqual(
      electrolyteReport.files?.some((file) => Number(file.electrolyte_file_id) === Number(made.electrolyteFileId)),
      true,
      'electrolyte report includes uploaded file metadata'
    );
    if (made.electrolyteFileId) {
      const electrolyteDownload = await client.get(`/api/electrolytes/files/${made.electrolyteFileId}/download`);
      client.assertEqual(electrolyteDownload, 'BADB smoke file', 'electrolyte file download returns uploaded bytes');
    }
    const unusedElectrolyteDeleteCheck = await client.get(`/api/electrolytes/${made.electrolyteId}/delete-check`);
    client.assertEqual(unusedElectrolyteDeleteCheck.can_delete, true, 'electrolyte delete preflight allows unused electrolyte');

    made.materialId = (await client.post('/api/materials', {
      name: `Codex Smoke Material ${suffix}`,
      role: 'other',
      family: 'Smoke Family'
    })).material_id;
    await client.put(`/api/materials/${made.materialId}`, {
      name: `Codex Smoke Material ${suffix} Updated`,
      role: 'other',
      family: 'Smoke Family Updated'
    });
    client.assertEqual(
      (await client.get('/api/materials')).find((m) => m.material_id === made.materialId)?.family,
      'Smoke Family Updated',
      'material family round-trips (d047)'
    );
    made.materialInstanceId = (await client.get(`/api/materials/${made.materialId}/instances`))[0]?.material_instance_id;
    await client.expectDependencyConflict('DELETE', `/api/materials/${made.materialId}`);
    made.extraMaterialInstanceId = (await client.post(`/api/materials/${made.materialId}/instances`, {
      name: `Codex Smoke Extra Instance ${suffix}`,
      notes: 'extra',
      is_pure: true
    })).material_instance_id;
    await client.put(`/api/materials/instances/${made.extraMaterialInstanceId}`, {
      name: `Codex Smoke Extra Instance ${suffix} Updated`,
      notes: 'extra update'
    });
    const compositionRows = await client.put(`/api/materials/instances/${made.extraMaterialInstanceId}/components`, {
      components: [{
        component_material_instance_id: made.materialInstanceId,
        mass_fraction: 1,
        notes: 'smoke composition'
      }]
    });
    client.assertEqual(compositionRows.length, 1, 'material composition replacement returns one row');
    client.assertEqual(
      compositionRows[0]?.component_material_instance_id,
      made.materialInstanceId,
      'material composition replacement uses selected component'
    );
    const updatedCompositionRow = await client.put(
      `/api/materials/instances/components/${compositionRows[0].material_instance_component_id}`,
      {
        mass_fraction: 1,
        notes: 'smoke composition update'
      }
    );
    client.assertEqual(updatedCompositionRow.notes, 'smoke composition update', 'material component update persists notes');
    await client.del(`/api/materials/instances/components/${compositionRows[0].material_instance_component_id}`);
    const addedCompositionRow = await client.post(`/api/materials/instances/${made.extraMaterialInstanceId}/components`, {
      component_material_instance_id: made.materialInstanceId,
      mass_fraction: 1
    });
    client.assertEqual(
      addedCompositionRow.component_material_instance_id,
      made.materialInstanceId,
      'material component add returns selected component'
    );
    await client.put(`/api/materials/instances/${made.materialInstanceId}/source-info`, {
      supplier: 'Codex',
      brand: 'Smoke',
      model_or_catalog_no: 'SMK-1',
      lot_number: String(suffix),
      date_ordered: '2026-04-24',
      date_received: '2026-04-24',
      quality_rating_label: 'good',
      quality_rating_score: 5,
      evaluation_notes: 'smoke',
      is_evaluated: true
    });
    made.sourceFileId = (await client.post(`/api/materials/instances/${made.materialInstanceId}/source-info/files`, {
      entries: [{ file_name: 'source.txt', mime_type: 'text/plain', file_content_base64: fileBase64 }]
    }))?.[0]?.material_source_file_id;
    await client.put(`/api/materials/instances/${made.materialInstanceId}/properties`, {
      specific_capacity_mAh_g: 123,
      density_g_ml: 1.23,
      notes: 'smoke props'
    });
    made.propertyFileId = (await client.post(`/api/materials/instances/${made.materialInstanceId}/properties/files`, {
      entries: [{ file_name: 'props.txt', mime_type: 'text/plain', file_content_base64: fileBase64 }]
    }))?.[0]?.material_property_file_id;

    made.recipeId = (await client.post('/api/recipes', {
      role: 'cathode',
      name: `Codex Smoke Recipe ${suffix}`,
      variant_label: 'A',
      notes: 'smoke',
      created_by: forgedUserId,
      lines: [
        // d047: the active line is an open slot — no material on the recipe
        recipeLine(null, 'cathode_active', true, 90, 'active'),
        recipeLine(binderMaterial.material_id, 'binder', true, 10, 'binder'),
        recipeLine(solventMaterial.material_id, 'solvent', false, null, 'solvent')
      ]
    })).tape_recipe_id;
    client.assertEqual(
      (await client.get(`/api/recipes/${made.recipeId}`)).created_by,
      userId,
      'recipe create ignores browser-created created_by'
    );
    made.duplicateRecipeId = (await client.post(`/api/recipes/${made.recipeId}/duplicate`, {
      name: `Codex Smoke Recipe ${suffix} Copy`,
      created_by: forgedUserId
    })).tape_recipe_id;
    client.assertEqual(
      (await client.get(`/api/recipes/${made.duplicateRecipeId}`)).created_by,
      userId,
      'recipe duplicate ignores browser-created created_by'
    );
    await client.put(`/api/recipes/${made.recipeId}`, {
      role: 'cathode',
      name: `Codex Smoke Recipe ${suffix} Updated`,
      variant_label: 'B',
      notes: 'smoke update',
      lines: [
        recipeLine(null, 'cathode_active', true, 88, 'active'),
        recipeLine(binderMaterial.material_id, 'binder', true, 12, 'binder'),
        recipeLine(solventMaterial.material_id, 'solvent', false, null, 'solvent')
      ]
    });

    const tapeProjectIds = made.projectId && Number(made.projectId) !== Number(projectId)
      ? [projectId, made.projectId]
      : [projectId];

    const tape = await client.post('/api/tapes', {
      name: `Codex Smoke Tape ${suffix}`,
      project_id: projectId,
      project_ids: tapeProjectIds,
      tape_recipe_id: existingRecipeId,
      active_material_id: activeMaterial.material_id,
      created_by: forgedUserId,
      item_created_at: '2024-01-02',
      notes: 'smoke',
      calc_mode: 'from_active_mass',
      target_mass_g: 1.5
    });
    made.tapeId = tape.tape_id;
    client.assertEqual(tape.created_by, userId, 'tape create ignores browser-created created_by');
    client.assertEqual(
      Number(tape.active_material_id),
      Number(activeMaterial.material_id),
      'tape create stores active material (d047)'
    );
    client.assertEqual(formatDateOnly(tape.item_created_at), '2024-01-02', 'tape create stores physical item date');
    client.assertEqual(
      Array.isArray(tape.project_ids) && tape.project_ids.map(Number).includes(Number(made.projectId)),
      true,
      'tape create stores secondary project link'
    );
    await client.expectDependencyConflict('DELETE', `/api/projects/${made.projectId}`);
    const updatedTape = await client.put(`/api/tapes/${made.tapeId}`, {
      name: `Codex Smoke Tape ${suffix} Updated`,
      project_id: projectId,
      project_ids: [projectId],
      tape_recipe_id: existingRecipeId,
      active_material_id: activeMaterial.material_id,
      created_by: forgedUserId,
      item_created_at: '2024-01-03',
      notes: 'smoke update',
      calc_mode: 'from_slurry_mass',
      target_mass_g: 2.5
    });
    client.assertEqual(updatedTape.created_by, userId, 'tape update preserves server-owned created_by');
    client.assertEqual(formatDateOnly(updatedTape.item_created_at), '2024-01-03', 'tape update preserves physical item date');

    await client.put(`/api/tapes/${made.tapeId}`, {
      name: `Codex Smoke Tape ${suffix} Updated`,
      project_id: projectId,
      project_ids: [projectId],
      tape_recipe_id: made.recipeId,
      active_material_id: activeMaterial.material_id,
      created_by: userId,
      notes: 'smoke recipe dependency check',
      calc_mode: 'from_slurry_mass',
      target_mass_g: 2.5
    });
    await client.expectDependencyConflict('DELETE', `/api/recipes/${made.recipeId}`);
    await client.put(`/api/tapes/${made.tapeId}`, {
      name: `Codex Smoke Tape ${suffix} Updated`,
      project_id: projectId,
      project_ids: [projectId],
      tape_recipe_id: existingRecipeId,
      active_material_id: activeMaterial.material_id,
      created_by: userId,
      notes: 'smoke update',
      calc_mode: 'from_slurry_mass',
      target_mass_g: 2.5
    });

    const firstLine = (await client.get(`/api/recipes/${existingRecipeId}/lines`)).find((line) => line.include_in_pct);
    // d047: the active slot line has material_id null — its instances come
    // from the tape's active material, and the actuals save validates that.
    const firstLineMaterialId = firstLine.material_id ?? activeMaterial.material_id;
    const instanceId = (await client.get(`/api/materials/${firstLineMaterialId}/instances`))[0]?.material_instance_id;
    await client.post(`/api/tapes/${made.tapeId}/actuals`, {
      recipe_line_id: firstLine.recipe_line_id,
      material_instance_id: instanceId,
      measure_mode: 'mass',
      actual_mass_g: 1.1,
      actual_volume_ml: null
    });

    const now = '2026-04-24T10:00:00.000Z';
    await client.post(`/api/tapes/${made.tapeId}/steps/by-code/weighing`, {
      performed_by: userId,
      started_at: now,
      comments: 'smoke weighing'
    });
    // d048: Vilitek planetary centrifugal mixer with cup + milling balls
    const wetMethods = await client.get('/api/reference/wet-mixing-methods');
    const vilitek = wetMethods.find((m) => m.name === 'vilitek_vitt_300s');
    const containers = await client.get('/api/reference/mixing-containers');
    const smokeContainer = first(containers);
    requireSeed({ vilitek, smokeContainer });

    await client.post(`/api/tapes/${made.tapeId}/steps/by-code/mixing`, {
      performed_by: userId,
      started_at: now,
      comments: 'smoke mixing',
      slurry_volume_ml: 1,
      dry_start_time: now,
      dry_duration_min: 1,
      dry_rpm: '100',
      wet_mixing_id: vilitek.wet_mixing_id,
      wet_start_time: now,
      wet_duration_min: 1,
      wet_rpm: '100',
      viscosity_cP: 5,
      viscosity_conditions: '#3, 6 об/мин',
      container_id: smokeContainer.container_id,
      balls: [
        { diameter_cm: 0.5, ball_count: 10 },
        { diameter_cm: 1.0, ball_count: 3 }
      ]
    });
    const savedMixing = await client.get(`/api/tapes/${made.tapeId}/steps/by-code/mixing`);
    client.assertEqual(
      savedMixing.viscosity_conditions,
      '#3, 6 об/мин',
      'tape mixing stores viscosity measurement conditions'
    );
    client.assertEqual(
      Number(savedMixing.container_id),
      Number(smokeContainer.container_id),
      'tape mixing stores the mixing container (d048)'
    );
    client.assertEqual(
      (savedMixing.mixing_balls || []).map((b) => `${b.diameter_cm}x${b.ball_count}`).join(','),
      '0.5x10,1x3',
      'tape mixing stores milling balls (d048)'
    );
    await client.post(`/api/tapes/${made.tapeId}/steps/by-code/coating`, {
      performed_by: userId,
      started_at: now,
      comments: 'smoke coating',
      foil_id: 1,
      coating_id: 1,
      coating_sidedness: 'two_sided',
      gap_um: 100,
      gap_um_side2: 105,
      coated_thickness_um: 82,
      coated_thickness_um_side2: 84,
      coat_temp_c: null,
      coat_time_min: 10,
      method_comments: 'smoke'
    });
    const savedCoating = await client.get(`/api/tapes/${made.tapeId}/steps/by-code/coating`);
    client.assertEqual(
      savedCoating.coated_thickness_um,
      82,
      'tape coating stores side 1 measured coated thickness'
    );
    client.assertEqual(
      savedCoating.coated_thickness_um_side2,
      84,
      'tape coating stores side 2 measured coated thickness'
    );
    await client.post(`/api/tapes/${made.tapeId}/steps/by-code/drying_pressed_tape`, {
      performed_by: userId,
      started_at: now,
      ended_at: '2026-04-24T11:00:00.000Z',
      comments: 'smoke final drying',
      temperature_c: 80,
      atmosphere: 'vacuum',
      target_duration_min: 60,
      drying_speed_text: 'smoke speed',
      other_parameters: 'none'
    });
    await client.get(`/api/tapes/${made.tapeId}/steps/drying?operation_code=drying_pressed_tape`);
    const dryBoxState = await client.put(`/api/tapes/${made.tapeId}/dry-box-state`, {
      started_at: '2026-04-24T11:05:00.000Z',
      removed_at: null,
      temperature_c: 80,
      atmosphere: 'vacuum',
      other_parameters: 'none',
      comments: 'smoke',
      updated_by: forgedUserId
    });
    client.assertEqual(dryBoxState.updated_by, userId, 'dry-box update ignores browser-created updated_by');

    await client.post('/api/electrodes/electrode-cut-batches', {
      tape_id: made.tapeId,
      project_ids: [made.projectId],
      target_form_factor: 'coin',
      target_config_code: '2032',
      shape: 'circle',
      diameter_mm: 16,
      comments: 'smoke invalid cut project'
    }, [400]);

    const cutBatch = await client.post('/api/electrodes/electrode-cut-batches', {
      tape_id: made.tapeId,
      project_ids: [projectId],
      created_by: forgedUserId,
      item_created_at: '2024-02-02',
      target_form_factor: 'coin',
      target_config_code: '2032',
      shape: 'circle',
      diameter_mm: 16,
      comments: 'smoke cut'
    });
    made.cutBatchId = cutBatch.cut_batch_id;
    client.assertEqual(
      cutBatch.created_by,
      userId,
      'electrode cut batch create ignores browser-created created_by'
    );
    client.assertEqual(formatDateOnly(cutBatch.item_created_at), '2024-02-02', 'electrode cut batch create stores physical item date');
    client.assertEqual(
      Array.isArray(cutBatch.project_ids) && cutBatch.project_ids.map(Number).includes(Number(projectId)),
      true,
      'electrode cut batch create stores tape project link'
    );
    const updatedCutBatch = await client.put(`/api/electrodes/electrode-cut-batches/${made.cutBatchId}`, {
      project_ids: [projectId],
      target_form_factor: 'coin',
      target_config_code: '2032',
      item_created_at: '2024-02-03',
      shape: 'circle',
      diameter_mm: 15.9,
      comments: 'smoke cut update'
    });
    client.assertEqual(formatDateOnly(updatedCutBatch.item_created_at), '2024-02-03', 'electrode cut batch update preserves physical item date');
    const prismCutBatch = await client.post('/api/electrodes/electrode-cut-batches', {
      tape_id: made.tapeId,
      project_ids: [projectId],
      target_form_factor: 'prism',
      target_config_code: '103x83',
      item_created_at: '2024-02-04',
      is_test_batch: true,
      shape: 'rectangle',
      length_mm: 103,
      width_mm: 83,
      comments: 'smoke prism cut'
    });
    made.prismCutBatchId = prismCutBatch.cut_batch_id;
    client.assertEqual(prismCutBatch.target_form_factor, 'prism', 'electrode cut batch create accepts prism target');
    client.assertEqual(prismCutBatch.is_test_batch, true, 'electrode cut batch create stores test-batch flag');
    const prismReport = await client.get(`/api/electrodes/electrode-cut-batches/${made.prismCutBatchId}/report`);
    client.assertEqual(prismReport.batch?.is_test_batch, true, 'electrode cut batch report includes test-batch flag');
    const foil = await client.post(`/api/electrodes/electrode-cut-batches/${made.cutBatchId}/foil-masses`, {
      mass_g: 0.0123
    });
    await client.put(`/api/electrodes/foil-measurements/${foil.foil_measurement_id}`, {
      mass_g: 0.0124
    });
    await client.post(`/api/electrodes/electrode-cut-batches/${made.cutBatchId}/drying`, {
      start_time: now,
      end_time: '2026-04-24T12:00:00.000Z',
      temperature_c: 80,
      other_parameters: 'none',
      comments: 'smoke electrode drying'
    });
    const drying = await client.get(`/api/electrodes/electrode-cut-batches/${made.cutBatchId}/drying`);
    await client.put(`/api/electrodes/electrode-drying/${drying.drying_id}`, {
      start_time: now,
      end_time: '2026-04-24T12:30:00.000Z',
      temperature_c: 81,
      other_parameters: 'none',
      comments: 'smoke electrode drying update'
    });
    made.electrodeId = (await client.post('/api/electrodes', {
      cut_batch_id: made.cutBatchId,
      electrode_mass_g: 0.1234,
      cup_number: 1,
      comments: 'smoke electrode'
    })).electrode_id;
    made.anodeElectrodeId = (await client.post('/api/electrodes', {
      cut_batch_id: made.cutBatchId,
      electrode_mass_g: 0.1236,
      cup_number: 3,
      comments: 'smoke anode electrode'
    })).electrode_id;
    made.lifecycleElectrodeId = (await client.post('/api/electrodes', {
      cut_batch_id: made.cutBatchId,
      electrode_mass_g: 0.1237,
      cup_number: 4,
      comments: 'smoke lifecycle cathode electrode'
    })).electrode_id;
    made.lifecycleAnodeElectrodeId = (await client.post('/api/electrodes', {
      cut_batch_id: made.cutBatchId,
      electrode_mass_g: 0.1238,
      cup_number: 5,
      comments: 'smoke lifecycle anode electrode'
    })).electrode_id;
    made.prismCathodeElectrodeId = (await client.post('/api/electrodes', {
      cut_batch_id: made.prismCutBatchId,
      electrode_mass_g: 0.1241,
      cup_number: 6,
      comments: 'smoke prism cathode electrode'
    })).electrode_id;
    made.prismAnodeElectrodeId = (await client.post('/api/electrodes', {
      cut_batch_id: made.prismCutBatchId,
      electrode_mass_g: 0.1242,
      cup_number: 7,
      comments: 'smoke prism anode electrode'
    })).electrode_id;
    await client.put(`/api/electrodes/${made.electrodeId}`, {
      electrode_mass_g: 0.1235,
      cup_number: 2,
      comments: 'smoke electrode update'
    });
    const clearedCommentElectrode = await client.put(`/api/electrodes/${made.electrodeId}`, {
      comments: null
    });
    client.assertEqual(clearedCommentElectrode.comments, null, 'electrode update clears comments with null');
    await client.put(`/api/electrodes/${made.electrodeId}/status`, {
      status_code: 1,
      used_in_battery_id: null,
      scrapped_reason: null
    });
    const capacityBeforeIncludeToggle = await client.get(`/api/electrodes/electrode-cut-batches/${made.cutBatchId}`);
    const includedBeforeToggle = Number(capacityBeforeIncludeToggle.capacity_summary?.included_electrode_count);
    const electrodesBeforeIncludeToggle = await client.get(`/api/electrodes/electrode-cut-batches/${made.cutBatchId}/electrodes`);
    const defaultIncludedElectrode = electrodesBeforeIncludeToggle
      .find((electrode) => Number(electrode.electrode_id) === Number(made.electrodeId));
    client.assertEqual(defaultIncludedElectrode?.include_in_capacity_average, true, 'new electrode defaults into capacity average');
    const includeToggledElectrode = await client.put(`/api/electrodes/${made.electrodeId}`, {
      include_in_capacity_average: false
    });
    client.assertEqual(includeToggledElectrode.include_in_capacity_average, false, 'electrode update saves capacity average inclusion flag');
    const capacityAfterIncludeToggle = await client.get(`/api/electrodes/electrode-cut-batches/${made.cutBatchId}`);
    client.assertEqual(
      Number(capacityAfterIncludeToggle.capacity_summary?.included_electrode_count),
      includedBeforeToggle - 1,
      'electrode capacity summary count follows manual include flag'
    );

    const battery = await client.post('/api/batteries', {
      project_id: projectId,
      form_factor: 'coin',
      created_by: forgedUserId,
      item_created_at: '2024-03-02',
      battery_notes: `Codex Smoke Battery ${suffix}`
    });
    made.batteryId = battery.battery_id;
    client.assertEqual(battery.created_by, userId, 'battery create ignores browser-created created_by');
    client.assertEqual(formatDateOnly(battery.item_created_at), '2024-03-02', 'battery create stores physical item date');
    const identityBattery = await client.post('/api/batteries', {
      project_id: projectId,
      project_ids: [projectId],
      form_factor: 'coin',
      coin_cell_mode: 'half_cell',
      coin_size_code: '2032',
      half_cell_type: 'cathode_vs_li',
      cathode_tape_id: made.tapeId,
      cathode_cut_batch_id: made.cutBatchId,
      cathode_source_notes: 'smoke identity source',
      created_by: forgedUserId,
      battery_notes: `Codex Smoke Battery ${suffix} Identity`
    });
    client.assertEqual(
      Array.isArray(identityBattery.project_ids) && identityBattery.project_ids.map(Number).includes(Number(projectId)),
      true,
      'battery identity create stores battery project link'
    );
    await client.patch(`/api/batteries/battery_electrode_sources/${identityBattery.battery_id}`, {
      cathode_tape_id: null,
      cathode_cut_batch_id: null,
      cathode_source_notes: null,
      anode_tape_id: null,
      anode_cut_batch_id: null,
      anode_source_notes: null
    });
    await client.request('DELETE', `/api/batteries/${identityBattery.battery_id}`, {
      confirmation: `DELETE BATTERY ${identityBattery.battery_id}`
    });
    if (made.projectId) {
      await client.post('/api/batteries', {
        project_id: made.projectId,
        project_ids: [made.projectId],
        form_factor: 'coin',
        coin_cell_mode: 'half_cell',
        coin_size_code: '2032',
        half_cell_type: 'cathode_vs_li',
        cathode_tape_id: made.tapeId,
        cathode_cut_batch_id: made.cutBatchId,
        battery_notes: `Codex Smoke Battery ${suffix} Invalid Project`
      }, [400]);
    }
    const patchedBattery = await client.patch(`/api/batteries/${made.batteryId}`, {
      project_id: projectId,
      form_factor: 'coin',
      created_by: forgedUserId,
      item_created_at: '2024-03-03',
      battery_notes: `Codex Smoke Battery ${suffix} Updated`
    });
    client.assertEqual(patchedBattery.created_by, userId, 'battery update preserves server-owned created_by');
    client.assertEqual(formatDateOnly(patchedBattery.item_created_at), '2024-03-03', 'battery update preserves physical item date');
    await client.patch(`/api/batteries/${made.batteryId}`, {
      status: 'assembled'
    }, [400]);
    await client.patch(`/api/batteries/${made.batteryId}`, {
      project_id: made.projectId,
      form_factor: 'coin',
      battery_notes: `Codex Smoke Battery ${suffix} Updated`
    });
    await client.expectDependencyConflict('DELETE', `/api/projects/${made.projectId}`);
    await client.patch(`/api/batteries/${made.batteryId}`, {
      project_id: projectId,
      form_factor: 'coin',
      battery_notes: `Codex Smoke Battery ${suffix} Updated`
    });
    await client.post('/api/batteries/battery_coin_config', {
      battery_id: made.batteryId,
      coin_cell_mode: 'full_cell',
      coin_size_code: '2032',
      spacer_thickness_mm: 1,
      spacer_count: 1,
      spacer_notes: 'smoke',
      coin_layout: 'SE'
    });
    await client.patch(`/api/batteries/battery_coin_config/${made.batteryId}`, {
      coin_cell_mode: 'full_cell',
      coin_size_code: '2032',
      spacer_count: 2,
      coin_layout: 'ESE'
    });
    made.pouchBatteryId = (await client.post('/api/batteries', {
      project_id: projectId,
      form_factor: 'pouch',
      created_by: forgedUserId,
      battery_notes: `Codex Smoke Battery ${suffix} Pouch`
    })).battery_id;
    await client.post('/api/batteries/battery_pouch_config', {
      battery_id: made.pouchBatteryId,
      pouch_case_size_code: 'other',
      pouch_case_size_other: 'smoke pouch',
      pouch_notes: 'smoke pouch config'
    });
    const pouchConfig = await client.patch(`/api/batteries/battery_pouch_config/${made.pouchBatteryId}`, {
      pouch_case_size_code: '103x83',
      pouch_case_size_other: null,
      pouch_notes: 'smoke pouch update'
    });
    client.assertEqual(pouchConfig.pouch_case_size_code, '103x83', 'pouch config update persists size code');
    made.prismBatteryId = (await client.post('/api/batteries', {
      project_id: projectId,
      form_factor: 'prism',
      created_by: forgedUserId,
      battery_notes: `Codex Smoke Battery ${suffix} Prism`
    })).battery_id;
    const prismConfig = await client.post('/api/batteries/battery_pouch_config', {
      battery_id: made.prismBatteryId,
      pouch_case_size_code: '103x83',
      pouch_case_size_other: null,
      pouch_notes: 'smoke prism config'
    });
    client.assertEqual(prismConfig.pouch_case_size_code, '103x83', 'prism reuses pouch config route');
    const prismCompatibleBatches = await client.get(`/api/batteries/${made.prismBatteryId}/electrode-cut-batches?tape_id=${made.tapeId}`);
    client.assertEqual(
      prismCompatibleBatches.some((batch) => Number(batch.cut_batch_id) === Number(made.prismCutBatchId)),
      true,
      'prism battery sees prism rectangular electrode cut batches as compatible'
    );
    const prismCompatibleBatchesWithoutTape = await client.get(`/api/batteries/${made.prismBatteryId}/electrode-cut-batches`);
    client.assertEqual(
      prismCompatibleBatchesWithoutTape.some((batch) => Number(batch.cut_batch_id) === Number(made.prismCutBatchId)),
      true,
      'battery compatible cut batch lookup works without a tape filter'
    );
    made.cylBatteryId = (await client.post('/api/batteries', {
      project_id: projectId,
      form_factor: 'cylindrical',
      created_by: forgedUserId,
      battery_notes: `Codex Smoke Battery ${suffix} Cyl`
    })).battery_id;
    await client.post('/api/batteries/battery_cyl_config', {
      battery_id: made.cylBatteryId,
      cyl_size_code: '18650',
      cyl_notes: 'smoke cylindrical config'
    });
    const cylConfig = await client.patch(`/api/batteries/battery_cyl_config/${made.cylBatteryId}`, {
      cyl_size_code: '21700',
      cyl_notes: 'smoke cylindrical update'
    });
    client.assertEqual(cylConfig.cyl_size_code, '21700', 'cylindrical config update persists size code');

    for (const [batteryId, label, cutBatchId, cathodeElectrodeId, anodeElectrodeId] of [
      [made.pouchBatteryId, 'pouch', made.cutBatchId, made.electrodeId, made.anodeElectrodeId],
      [made.prismBatteryId, 'prism', made.prismCutBatchId, made.prismCathodeElectrodeId, made.prismAnodeElectrodeId],
      [made.cylBatteryId, 'cylindrical', made.cutBatchId, made.electrodeId, made.anodeElectrodeId]
    ]) {
      await client.post('/api/batteries/battery_electrode_sources', {
        battery_id: batteryId,
        cathode_tape_id: made.tapeId,
        cathode_cut_batch_id: cutBatchId,
        anode_tape_id: made.tapeId,
        anode_cut_batch_id: cutBatchId
      });
      await client.put(`/api/batteries/battery_electrodes/${batteryId}`, [
        {
          electrode_id: cathodeElectrodeId,
          role: 'cathode',
          position_index: 1
        },
        {
          electrode_id: anodeElectrodeId,
          role: 'anode',
          position_index: 2
        }
      ]);
      const savedCathodeFirstStack = await client.get(`/api/batteries/battery_electrodes/${batteryId}`);
      client.assertEqual(savedCathodeFirstStack[0]?.role, 'cathode', `${label} stack preserves original cathode position`);
      client.assertEqual(savedCathodeFirstStack[1]?.role, 'anode', `${label} stack preserves original anode position`);
      await client.put(`/api/batteries/battery_electrodes/${batteryId}`, []);
      await client.patch(`/api/batteries/battery_electrode_sources/${batteryId}`, {
        cathode_tape_id: null,
        cathode_cut_batch_id: null,
        cathode_source_notes: null,
        anode_tape_id: null,
        anode_cut_batch_id: null,
        anode_source_notes: null
      });
    }

    const multiSourceBatteryId = (await client.post('/api/batteries', {
      project_id: projectId,
      project_ids: [projectId],
      form_factor: 'pouch',
      battery_notes: `Codex Smoke Battery ${suffix} Multi Source`
    })).battery_id;
    await client.post('/api/batteries/battery_pouch_config', {
      battery_id: multiSourceBatteryId,
      pouch_case_size_code: '103x83',
      pouch_case_size_other: null,
      pouch_notes: 'smoke multi-source pouch config'
    });
    const multiSourceRows = await client.post('/api/batteries/battery_electrode_sources', {
      battery_id: multiSourceBatteryId,
      sources: [
        { role: 'cathode', cut_batch_id: made.cutBatchId, sort_order: 0, is_primary: true },
        { role: 'cathode', cut_batch_id: made.prismCutBatchId, sort_order: 1, is_primary: false },
        { role: 'anode', cut_batch_id: made.cutBatchId, sort_order: 0, is_primary: true },
        { role: 'anode', cut_batch_id: made.prismCutBatchId, sort_order: 1, is_primary: false }
      ]
    });
    client.assertEqual(multiSourceRows.length, 4, 'multi-source save persists all selected source rows');
    await client.put(`/api/batteries/battery_electrodes/${multiSourceBatteryId}`, [
      {
        electrode_id: made.electrodeId,
        role: 'cathode',
        position_index: 1
      },
      {
        electrode_id: made.prismAnodeElectrodeId,
        role: 'anode',
        position_index: 2
      }
    ]);
    const multiAssembly = await client.get(`/api/batteries/${multiSourceBatteryId}/assembly`);
    client.assertEqual(
      Array.isArray(multiAssembly.electrode_sources) && multiAssembly.electrode_sources.length,
      4,
      'assembly returns every multi-source electrode batch row'
    );
    client.assertEqual(
      multiAssembly.electrode_sources.filter(row => row.role === 'cathode' && row.is_primary).length,
      1,
      'multi-source cathode rows expose exactly one primary'
    );
    client.assertEqual(
      multiAssembly.electrodes.some(row => Number(row.electrode_id) === Number(made.prismAnodeElectrodeId)),
      true,
      'stack accepts an electrode from a secondary selected source batch'
    );
    await client.put(`/api/batteries/battery_electrodes/${multiSourceBatteryId}`, []);
    await client.patch(`/api/batteries/battery_electrode_sources/${multiSourceBatteryId}`, {
      cathode_tape_id: null,
      cathode_cut_batch_id: null,
      cathode_source_notes: null,
      anode_tape_id: null,
      anode_cut_batch_id: null,
      anode_source_notes: null
    });
    await client.request('DELETE', `/api/batteries/${multiSourceBatteryId}`, {
      confirmation: `DELETE BATTERY ${multiSourceBatteryId}`
    });

    const lifecycleBattery = await client.post('/api/batteries', {
      project_id: projectId,
      project_ids: [projectId],
      form_factor: 'coin',
      battery_notes: `Codex Smoke Battery ${suffix} Lifecycle`
    });
    await client.post('/api/batteries/battery_coin_config', {
      battery_id: lifecycleBattery.battery_id,
      coin_cell_mode: 'full_cell',
      coin_size_code: '2032',
      coin_layout: 'SE'
    });
    await client.post('/api/batteries/battery_electrode_sources', {
      battery_id: lifecycleBattery.battery_id,
      cathode_tape_id: made.tapeId,
      cathode_cut_batch_id: made.cutBatchId,
      anode_tape_id: made.tapeId,
      anode_cut_batch_id: made.cutBatchId
    });
    await client.put(`/api/batteries/battery_electrodes/${lifecycleBattery.battery_id}`, [
      {
        electrode_id: made.lifecycleElectrodeId,
        role: 'cathode',
        position_index: 1
      },
      {
        electrode_id: made.lifecycleAnodeElectrodeId,
        role: 'anode',
        position_index: 2
      }
    ]);
    const blockedLifecycleBattery = await client.post('/api/batteries', {
      project_id: projectId,
      project_ids: [projectId],
      form_factor: 'coin',
      battery_notes: `Codex Smoke Battery ${suffix} Cycling Blocker`
    });
    runSmokeSql(
      context,
      `INSERT INTO cycling_sessions (battery_id, equipment_type, file_name, status, uploaded_by, notes) ` +
      `VALUES (${Number(blockedLifecycleBattery.battery_id)}, 'generic', 'battery-delete-blocker-${suffix}.txt', 'ready', ${Number(userId)}, 'smoke hard blocker')`
    );
    const blockedBatteryDeleteCheck = await client.get(`/api/batteries/${blockedLifecycleBattery.battery_id}/delete-check`);
    client.assertEqual(blockedBatteryDeleteCheck.can_delete, false, 'battery delete preflight blocks cycling data');
    client.assertEqual(
      blockedBatteryDeleteCheck.hard_blockers?.some((dependency) => dependency.key === 'cycling_sessions'),
      true,
      'battery delete preflight reports cycling hard blocker before confirmation'
    );
    await client.expectDependencyConflict('DELETE', `/api/batteries/${blockedLifecycleBattery.battery_id}`, {
      confirmation: `DELETE BATTERY ${blockedLifecycleBattery.battery_id}`
    });
    runSmokeSql(context, `DELETE FROM cycling_sessions WHERE battery_id = ${Number(blockedLifecycleBattery.battery_id)}`);
    await client.request('DELETE', `/api/batteries/${blockedLifecycleBattery.battery_id}`, {
      confirmation: `DELETE BATTERY ${blockedLifecycleBattery.battery_id}`
    });

    const clearBatteryDeleteCheck = await client.get(`/api/batteries/${lifecycleBattery.battery_id}/delete-check`);
    client.assertEqual(clearBatteryDeleteCheck.can_delete, true, 'battery delete preflight allows guided electrode disposition');
    client.assertEqual(
      clearBatteryDeleteCheck.linked_electrodes?.length >= 2,
      true,
      'battery delete preflight returns linked electrodes'
    );
    client.assertEqual(
      clearBatteryDeleteCheck.confirmable_owned_data?.some((dependency) => dependency.key === 'battery_electrodes'),
      true,
      'battery delete preflight returns confirmable owned data'
    );
    await client.request('DELETE', `/api/batteries/${lifecycleBattery.battery_id}`, {
      confirmation: 'DELETE BATTERY wrong',
      electrode_disposition: 'available'
    }, [400]);
    await client.post('/api/batteries/battery_qc', {
      battery_id: lifecycleBattery.battery_id,
      ocv_v: 3.1,
      esr_mohm: 22,
      qc_notes: 'smoke owned QC cleanup'
    });
    const lifecycleElectrochemRows = await client.post('/api/batteries/battery_electrochem', {
      battery_id: lifecycleBattery.battery_id,
      entries: [{
        file_name: `lifecycle-electrochem-${suffix}.txt`,
        file_content_base64: fileBase64,
        electrochem_notes: 'smoke owned electrochem cleanup'
      }]
    });
    const lifecycleElectrochemFile = lifecycleElectrochemRows.find((row) => row.file_name === `lifecycle-electrochem-${suffix}.txt`);
    client.assertEqual(Boolean(lifecycleElectrochemFile?.file_link), true, 'lifecycle electrochem cleanup fixture has an upload file');
    const ownedDataBatteryDeleteCheck = await client.get(`/api/batteries/${lifecycleBattery.battery_id}/delete-check`);
    client.assertEqual(ownedDataBatteryDeleteCheck.can_delete, true, 'battery delete preflight allows battery-owned QC/electrochem cleanup');
    await client.request('DELETE', `/api/batteries/${lifecycleBattery.battery_id}`, {
      confirmation: `DELETE BATTERY ${lifecycleBattery.battery_id}`,
      electrode_disposition: 'available'
    });
    const lifecycleElectrochemPath = lifecycleElectrochemFile?.file_link
      ? path.join(ROOT, String(lifecycleElectrochemFile.file_link).replace(/^\/+/, ''))
      : null;
    client.assertEqual(
      lifecycleElectrochemPath ? fs.existsSync(lifecycleElectrochemPath) : false,
      false,
      'battery delete removes owned electrochem upload file'
    );
    const availableLifecycleElectrodes = await client.get(`/api/electrodes/electrode-cut-batches/${made.cutBatchId}/electrodes`);
    const availableLifecycleCathode = availableLifecycleElectrodes
      .find((electrode) => Number(electrode.electrode_id) === Number(made.lifecycleElectrodeId));
    client.assertEqual(availableLifecycleCathode?.status_code, 1, 'battery delete can return linked electrode as available');
    client.assertEqual(availableLifecycleCathode?.used_in_battery_id, null, 'battery delete clears electrode battery link');
    const availableAuditDetails = runSmokeSql(
      context,
      `SELECT details::text FROM activity_log WHERE action = 'delete' AND entity = 'battery' AND entity_id = ${Number(lifecycleBattery.battery_id)} ORDER BY id DESC LIMIT 1`
    );
    const parsedAvailableAudit = availableAuditDetails ? JSON.parse(availableAuditDetails) : null;
    client.assertEqual(Boolean(parsedAvailableAudit), true, 'battery delete writes activity audit event');
    client.assertEqual(parsedAvailableAudit?.electrode_disposition, 'available', 'battery delete audit records available disposition');
    client.assertEqual(
      runSmokeSql(context, `SELECT count(*) FROM battery_qc WHERE battery_id = ${Number(lifecycleBattery.battery_id)}`),
      '0',
      'battery delete removes owned QC rows'
    );
    client.assertEqual(
      runSmokeSql(context, `SELECT count(*) FROM projects WHERE project_id = ${Number(projectId)}`),
      '1',
      'battery delete does not delete upstream project'
    );

    const scrappedLifecycleBattery = await client.post('/api/batteries', {
      project_id: projectId,
      project_ids: [projectId],
      form_factor: 'coin',
      battery_notes: `Codex Smoke Battery ${suffix} Scrapped Disposition`
    });
    await client.post('/api/batteries/battery_coin_config', {
      battery_id: scrappedLifecycleBattery.battery_id,
      coin_cell_mode: 'full_cell',
      coin_size_code: '2032',
      coin_layout: 'SE'
    });
    await client.post('/api/batteries/battery_electrode_sources', {
      battery_id: scrappedLifecycleBattery.battery_id,
      cathode_tape_id: made.tapeId,
      cathode_cut_batch_id: made.cutBatchId,
      anode_tape_id: made.tapeId,
      anode_cut_batch_id: made.cutBatchId
    });
    await client.put(`/api/batteries/battery_electrodes/${scrappedLifecycleBattery.battery_id}`, [
      {
        electrode_id: made.lifecycleElectrodeId,
        role: 'cathode',
        position_index: 1
      },
      {
        electrode_id: made.lifecycleAnodeElectrodeId,
        role: 'anode',
        position_index: 2
      }
    ]);
    const scrappedReason = `smoke returned from battery ${scrappedLifecycleBattery.battery_id}`;
    await client.request('DELETE', `/api/batteries/${scrappedLifecycleBattery.battery_id}`, {
      confirmation: `DELETE BATTERY ${scrappedLifecycleBattery.battery_id}`,
      electrode_disposition: 'scrapped',
      scrapped_reason: scrappedReason
    });
    const scrappedLifecycleElectrodes = await client.get(`/api/electrodes/electrode-cut-batches/${made.cutBatchId}/electrodes`);
    const scrappedLifecycleCathode = scrappedLifecycleElectrodes
      .find((electrode) => Number(electrode.electrode_id) === Number(made.lifecycleElectrodeId));
    client.assertEqual(scrappedLifecycleCathode?.status_code, 3, 'battery delete can return linked electrode as scrapped');
    client.assertEqual(scrappedLifecycleCathode?.scrapped_reason, scrappedReason, 'battery delete records scrapped electrode reason');
    const scrappedAuditDetails = runSmokeSql(
      context,
      `SELECT details::text FROM activity_log WHERE action = 'delete' AND entity = 'battery' AND entity_id = ${Number(scrappedLifecycleBattery.battery_id)} ORDER BY id DESC LIMIT 1`
    );
    const parsedScrappedAudit = scrappedAuditDetails ? JSON.parse(scrappedAuditDetails) : null;
    client.assertEqual(parsedScrappedAudit?.electrode_disposition, 'scrapped', 'battery delete audit records scrapped disposition');

    await client.post('/api/batteries/battery_sep_config', {
      battery_id: made.batteryId,
      separator_id: made.separatorId,
      separator_notes: 'smoke separator dependency check'
    });
    const blockedSeparatorDeleteCheck = await client.get(`/api/separators/${made.separatorId}/delete-check`);
    client.assertEqual(blockedSeparatorDeleteCheck.can_delete, false, 'separator delete preflight blocks battery use');
    client.assertEqual(
      blockedSeparatorDeleteCheck.dependencies?.some((dependency) => dependency.key === 'battery_sep_config'),
      true,
      'separator delete preflight reports battery separator dependency'
    );
    await client.expectDependencyConflict('DELETE', `/api/separators/${made.separatorId}`);
    await client.patch(`/api/batteries/battery_sep_config/${made.batteryId}`, {
      separator_id: null,
      separator_notes: null
    });
    const unblockedSeparatorDeleteCheck = await client.get(`/api/separators/${made.separatorId}/delete-check`);
    client.assertEqual(unblockedSeparatorDeleteCheck.can_delete, true, 'separator delete preflight clears after battery reset');
    await client.post('/api/batteries/battery_electrolyte', {
      battery_id: made.batteryId,
      electrolyte_id: made.electrolyteId,
      electrolyte_notes: 'smoke electrolyte dependency check',
      electrolyte_total_ul: 50
    });
    const blockedElectrolyteDeleteCheck = await client.get(`/api/electrolytes/${made.electrolyteId}/delete-check`);
    client.assertEqual(blockedElectrolyteDeleteCheck.can_delete, false, 'electrolyte delete preflight blocks battery use');
    client.assertEqual(
      blockedElectrolyteDeleteCheck.dependencies?.some((dependency) => dependency.key === 'battery_electrolyte'),
      true,
      'electrolyte delete preflight reports battery electrolyte dependency'
    );
    await client.expectDependencyConflict('DELETE', `/api/electrolytes/${made.electrolyteId}`);
    await client.patch(`/api/batteries/battery_electrolyte/${made.batteryId}`, {
      electrolyte_id: existingElectrolyteId,
      electrolyte_notes: 'smoke electrolyte dependency reset',
      electrolyte_total_ul: null
    });
    const clearElectrolyteDeleteCheck = await client.get(`/api/electrolytes/${made.electrolyteId}/delete-check`);
    client.assertEqual(clearElectrolyteDeleteCheck.can_delete, true, 'electrolyte delete preflight clears after battery reset');
    await client.post('/api/batteries/battery_qc', {
      battery_id: made.batteryId,
      ocv_v: 3.7,
      esr_mohm: 12.5,
      qc_notes: 'smoke qc'
    });
    const qc = await client.patch(`/api/batteries/battery_qc/${made.batteryId}`, {
      ocv_v: 3.8,
      esr_mohm: 11.5,
      qc_notes: 'smoke qc update'
    });
    client.assertEqual(qc.qc_notes, 'smoke qc update', 'battery QC update persists notes');
    const electrochemRows = await client.post('/api/batteries/battery_electrochem', {
      battery_id: made.batteryId,
      entries: [{
        file_name: `electrochem-${suffix}.txt`,
        file_content_base64: fileBase64,
        electrochem_notes: 'smoke electrochem'
      }]
    });
    client.assertEqual(electrochemRows.length, 1, 'battery electrochem upload returns one row');
    const electrochemNoteRows = await client.post('/api/batteries/battery_electrochem', {
      battery_id: made.batteryId,
      entries: [],
      electrochem_notes: 'smoke electrochem note without file'
    });
    made.electrochemFileLinks = electrochemNoteRows.map((row) => row.file_link).filter(Boolean);
    client.assertEqual(
      electrochemNoteRows.some((row) => !row.file_link && row.electrochem_notes === 'smoke electrochem note without file'),
      true,
      'battery electrochem notes can be saved without a file upload'
    );
    const uploadedElectrochemFile = electrochemRows.find((row) => row.file_link);
    await client.request('DELETE', `/api/batteries/battery_electrochem/${uploadedElectrochemFile.battery_electrochem_id}`);
    const electrochemAfterDelete = await client.get(`/api/batteries/battery_electrochem/${made.batteryId}`);
    client.assertEqual(
      electrochemAfterDelete.some((row) => Number(row.battery_electrochem_id) === Number(uploadedElectrochemFile.battery_electrochem_id)),
      false,
      'battery electrochem file rows can be deleted'
    );
    await client.post('/api/batteries/battery_electrode_sources', {
      battery_id: made.batteryId,
      cathode_tape_id: made.tapeId,
      cathode_cut_batch_id: made.cutBatchId,
      cathode_source_notes: 'smoke source dependency check',
      anode_tape_id: made.tapeId,
      anode_cut_batch_id: made.cutBatchId,
      anode_source_notes: 'smoke source dependency check'
    });
    const blockedTapeDeleteCheck = await client.get(`/api/tapes/${made.tapeId}/delete-check`);
    client.assertEqual(blockedTapeDeleteCheck.can_delete, false, 'tape delete preflight blocks electrode dependencies');
    const blockedBatchDeleteCheck = await client.get(`/api/electrodes/electrode-cut-batches/${made.cutBatchId}/delete-check`);
    client.assertEqual(blockedBatchDeleteCheck.can_delete, false, 'cut batch delete preflight blocks electrode/source dependencies');
    await client.expectDependencyConflict('DELETE', `/api/tapes/${made.tapeId}`);
    await client.expectDependencyConflict('DELETE', `/api/electrodes/electrode-cut-batches/${made.cutBatchId}`);
    await client.patch(`/api/batteries/battery_electrode_sources/${made.batteryId}`, {
      cathode_tape_id: null,
      cathode_cut_batch_id: null,
      cathode_source_notes: null,
      anode_tape_id: null,
      anode_cut_batch_id: null,
      anode_source_notes: null
    });
    await client.post('/api/batteries/battery_electrode_sources', {
      battery_id: made.batteryId,
      cathode_tape_id: made.tapeId,
      cathode_cut_batch_id: made.cutBatchId,
      cathode_source_notes: 'smoke stack cathode source',
      anode_tape_id: made.tapeId,
      anode_cut_batch_id: made.cutBatchId,
      anode_source_notes: 'smoke stack anode source'
    });
    const batteryStackPayload = [
      {
        electrode_id: made.electrodeId,
        role: 'cathode',
        position_index: 1
      },
      {
        electrode_id: made.anodeElectrodeId,
        role: 'anode',
        position_index: 2
      }
    ];
    await client.put(`/api/batteries/battery_electrodes/${made.batteryId}`, batteryStackPayload);
    await client.put(`/api/batteries/battery_electrodes/${made.batteryId}`, batteryStackPayload);
    await client.patch(`/api/batteries/battery_sep_config/${made.batteryId}`, {
      separator_id: made.separatorId,
      separator_notes: 'smoke complete separator'
    });
    await client.patch(`/api/batteries/battery_electrolyte/${made.batteryId}`, {
      electrolyte_id: made.electrolyteId,
      electrolyte_notes: 'smoke complete electrolyte',
      electrolyte_total_ul: 50
    });
    const assembledStatusBattery = await client.patch(`/api/batteries/${made.batteryId}`, {
      status: 'assembled'
    });
    client.assertEqual(assembledStatusBattery.status, 'assembled', 'battery status can become assembled after required records exist');
    const testingStatusBattery = await client.patch(`/api/batteries/${made.batteryId}`, {
      status: 'testing'
    });
    client.assertEqual(testingStatusBattery.status, 'testing', 'battery status can move to testing after assembly completion');
    await client.patch(`/api/batteries/${made.batteryId}`, {
      status: ''
    }, [400]);
    await client.patch(`/api/batteries/${made.batteryId}`, {
      status: 'disassembled'
    }, [400]);
    await client.patch(`/api/batteries/battery_sep_config/${made.batteryId}`, {
      separator_id: null,
      separator_notes: null
    });
    await client.patch(`/api/batteries/battery_electrolyte/${made.batteryId}`, {
      electrolyte_id: existingElectrolyteId,
      electrolyte_notes: 'smoke electrolyte dependency reset',
      electrolyte_total_ul: null
    });
    await client.expectDependencyConflict('DELETE', `/api/electrodes/${made.electrodeId}`);
    await client.put(`/api/batteries/battery_electrodes/${made.batteryId}`, []);
    const releasedElectrode = (await client.get(`/api/electrodes/electrode-cut-batches/${made.cutBatchId}/electrodes`))
      .find((electrode) => Number(electrode.electrode_id) === Number(made.electrodeId));
    client.assertEqual(releasedElectrode?.status_code, 1, 'clearing battery stack releases electrode status');
    client.assertEqual(releasedElectrode?.used_in_battery_id, null, 'clearing battery stack clears used_in_battery_id');
    await client.patch(`/api/batteries/battery_electrode_sources/${made.batteryId}`, {
      cathode_tape_id: null,
      cathode_cut_batch_id: null,
      cathode_source_notes: null,
      anode_tape_id: null,
      anode_cut_batch_id: null,
      anode_source_notes: null
    });
    await client.expectDependencyConflict('DELETE', `/api/electrodes/electrode-cut-batches/${made.cutBatchId}`);
    await client.put(`/api/electrodes/${made.electrodeId}/status`, {
      status_code: 1,
      used_in_battery_id: null,
      scrapped_reason: null
    });
    await client.get(`/api/batteries/${made.batteryId}/assembly`);
  } finally {
    await cleanupCreatedData(client, made);
  }
}

async function cleanupCreatedData(client, made) {
  const electrochemRoot = path.join(ROOT, 'uploads', 'electrochem');
  for (const fileLink of made.electrochemFileLinks || []) {
    const absolutePath = path.join(ROOT, String(fileLink).replace(/^\/+/, ''));
    if (!absolutePath.startsWith(electrochemRoot)) continue;
    try {
      fs.unlinkSync(absolutePath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  const cleanup = [
    made.lifecycleAnodeElectrodeId && ['DELETE', `/api/electrodes/${made.lifecycleAnodeElectrodeId}`],
    made.lifecycleElectrodeId && ['DELETE', `/api/electrodes/${made.lifecycleElectrodeId}`],
    made.prismAnodeElectrodeId && ['DELETE', `/api/electrodes/${made.prismAnodeElectrodeId}`],
    made.prismCathodeElectrodeId && ['DELETE', `/api/electrodes/${made.prismCathodeElectrodeId}`],
    made.anodeElectrodeId && ['DELETE', `/api/electrodes/${made.anodeElectrodeId}`],
    made.electrodeId && ['DELETE', `/api/electrodes/${made.electrodeId}`],
    made.prismCutBatchId && ['DELETE', `/api/electrodes/electrode-cut-batches/${made.prismCutBatchId}`],
    made.cutBatchId && ['DELETE', `/api/electrodes/electrode-cut-batches/${made.cutBatchId}`],
    made.tapeId && ['DELETE', `/api/tapes/${made.tapeId}`],
    made.batteryId && ['SQL_DELETE_BATTERY', made.batteryId],
    made.projectId && ['DELETE', `/api/projects/${made.projectId}`],
    made.recipeId && ['DELETE', `/api/recipes/${made.recipeId}`],
    made.duplicateRecipeId && ['DELETE', `/api/recipes/${made.duplicateRecipeId}`],
    made.separatorFileId && ['DELETE', `/api/separators/files/${made.separatorFileId}`],
    made.separatorId && ['DELETE', `/api/separators/${made.separatorId}`],
    made.structureId && ['DELETE', `/api/structures/${made.structureId}`],
    made.electrolyteFileId && ['DELETE', `/api/electrolytes/files/${made.electrolyteFileId}`],
    made.electrolyteId && ['DELETE', `/api/electrolytes/${made.electrolyteId}`],
    made.sourceFileId && ['DELETE', `/api/materials/source-files/${made.sourceFileId}`],
    made.propertyFileId && ['DELETE', `/api/materials/property-files/${made.propertyFileId}`],
    made.extraMaterialInstanceId && ['DELETE', `/api/materials/instances/${made.extraMaterialInstanceId}`],
    made.materialInstanceId && ['DELETE', `/api/materials/instances/${made.materialInstanceId}`],
    made.materialId && ['DELETE', `/api/materials/${made.materialId}`],
    made.userId && ['DELETE', `/api/users/${made.userId}`]
  ].filter(Boolean);

  for (const [method, value] of cleanup) {
    if (method === 'SQL_DELETE_BATTERY') continue;
    await client.request(method, value, undefined, [200, 204, 404, 409, 500]);
  }
}

function first(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function requireSeed(values) {
  for (const [key, value] of Object.entries(values)) {
    if (!value) throw new Error(`Missing seed data: ${key}`);
  }
}

function recipeLine(materialId, recipeRole, includeInPct, slurryPercent, notes) {
  return {
    material_id: materialId,
    recipe_role: recipeRole,
    include_in_pct: includeInPct,
    slurry_percent: slurryPercent,
    line_notes: notes
  };
}

function restoreDatabase(opts, tools) {
  if (!fs.existsSync(opts.dump)) {
    throw new Error(`Dump not found: ${opts.dump}`);
  }

  log(`Resetting throwaway database ${opts.db}`);
  run(tools.dropdb, ['--if-exists', opts.db], { quiet: true });
  run(tools.createdb, [opts.db], { quiet: true });

  log(`Restoring ${path.relative(ROOT, opts.dump)} into ${opts.db}`);
  run(tools.psql, ['-d', opts.db, '-v', 'ON_ERROR_STOP=1', '-f', opts.dump], { quiet: true });

  for (const migration of POST_DUMP_MIGRATIONS) {
    if (!fs.existsSync(migration)) continue;
    log(`Applying ${path.relative(ROOT, migration)} to ${opts.db}`);
    run(tools.psql, ['-d', opts.db, '-v', 'ON_ERROR_STOP=1', '-f', migration], { quiet: true });
  }
}

function dropDatabase(opts, tools) {
  log(`Dropping throwaway database ${opts.db}`);
  run(tools.dropdb, ['--if-exists', opts.db], { quiet: true });
}

function deleteSmokeBatteries(opts, tools) {
  run(tools.psql, [
    '-d',
    opts.db,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    "WITH target AS (SELECT battery_id FROM batteries WHERE battery_notes LIKE 'Codex Smoke Battery%') DELETE FROM battery_projects WHERE battery_id IN (SELECT battery_id FROM target); DELETE FROM batteries WHERE battery_notes LIKE 'Codex Smoke Battery%';"
  ], { quiet: true });
}

function assertNoLeftovers(opts, tools) {
  const output = run(tools.psql, [
    '-d',
    opts.db,
    '-Atc',
    `
    SELECT
      (SELECT count(*) FROM projects WHERE name LIKE 'Codex Smoke%') || ',' ||
      (SELECT count(*) FROM tapes WHERE name LIKE 'Codex Smoke%') || ',' ||
      (SELECT count(*) FROM separators WHERE name LIKE 'Codex Smoke%') || ',' ||
      (SELECT count(*) FROM electrolytes WHERE name LIKE 'Codex Smoke%') || ',' ||
      (SELECT count(*) FROM batteries WHERE battery_notes LIKE 'Codex Smoke Battery%') || ',' ||
      (SELECT count(*) FROM materials WHERE name LIKE 'Codex Smoke%') || ',' ||
      (SELECT count(*) FROM users WHERE name LIKE 'Codex Smoke%');
    `
  ], { quiet: true }).trim();

  const counts = output.split(',').map((value) => Number(value));
  if (counts.some((count) => count !== 0)) {
    throw new Error(`Smoke data leftovers detected: ${output}`);
  }
}

async function main() {
  installGlobalErrorContext();
  const opts = parseArgs(process.argv.slice(2));

  log('Checking vanilla API contract');
  run(process.execPath, ['scripts/check_vanilla_api_contract.js']);

  const tools = {
    psql: findTool('psql'),
    createdb: findTool('createdb'),
    dropdb: findTool('dropdb')
  };

  let server = null;
  let shouldDropDb = !opts.keepDb && !opts.keepServer;

  try {
    restoreDatabase(opts, tools);
    if (opts.restoreOnly) {
      shouldDropDb = false;
      log(`Restore complete. Kept database ${opts.db}.`);
      return;
    }

    const port = opts.port || await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    log(`Starting API on ${baseUrl}`);
    server = startApi({ db: opts.db, port, bypassLogin: opts.bypassLogin, verbose: opts.verbose });
    await waitForApi(baseUrl, server.log);

    const client = new SmokeClient(baseUrl, { verbose: opts.verbose });
    log('Running vanilla GET smoke tests');
    const seed = await runGetSmoke(client);
    client.assertNoFailures('GET smoke');

    if (!opts.getOnly) {
      log('Running write-path smoke tests');
      await runWriteSmoke(client, seed, { db: opts.db, psql: tools.psql });
      deleteSmokeBatteries(opts, tools);
      assertNoLeftovers(opts, tools);
      client.assertNoFailures('write smoke');
    }

    log(`PASS: ${client.checks.filter((check) => check.ok).length} checks, 0 failures`);
  } finally {
    if (server && !opts.keepServer) {
      await stopApi(server);
    }
    if (shouldDropDb) {
      dropDatabase(opts, tools);
    } else {
      log(`Kept throwaway database ${opts.db}`);
    }
  }
}

main().catch((err) => {
  console.error(`\n[smoke] FAIL: ${err.message}`);
  process.exit(1);
});
