'use strict';

function statusError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function normalizeProjectIds(values) {
  const source = Array.isArray(values) ? values : [values];
  const projectIds = [];

  source.forEach((value) => {
    if (value === null || value === undefined || value === '') return;
    const projectId = Number(value);
    if (!Number.isInteger(projectId)) {
      throw statusError('Некорректный project_id', 400);
    }
    if (!projectIds.includes(projectId)) {
      projectIds.push(projectId);
    }
  });

  return projectIds;
}

function getPayloadProjectIds(payload = {}) {
  if (Object.prototype.hasOwnProperty.call(payload, 'project_ids')) {
    return normalizeProjectIds(payload.project_ids);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'project_id')) {
    return normalizeProjectIds(payload.project_id);
  }
  return null;
}

async function validateProjectIds(db, projectIds) {
  if (!projectIds.length) return;

  const result = await db.query(
    'SELECT project_id FROM projects WHERE project_id = ANY($1::int[])',
    [projectIds]
  );
  const found = new Set(result.rows.map((row) => Number(row.project_id)));
  const missing = projectIds.filter((projectId) => !found.has(projectId));

  if (missing.length) {
    throw statusError('Некорректный project_id', 400);
  }
}

async function getCutBatchProjectIds(db, cutBatchId) {
  if (!cutBatchId) return [];

  const result = await db.query(
    `
    SELECT project_id
    FROM electrode_cut_batch_projects
    WHERE cut_batch_id = $1

    UNION

    SELECT t.project_id
    FROM electrode_cut_batches ecb
    JOIN tapes t
      ON t.tape_id = ecb.tape_id
    WHERE ecb.cut_batch_id = $1
      AND t.project_id IS NOT NULL

    ORDER BY project_id
    `,
    [cutBatchId]
  );

  return result.rows.map((row) => Number(row.project_id));
}

function normalizeCutBatchIds(values) {
  const source = Array.isArray(values) ? values : [values];
  const cutBatchIds = [];

  source.forEach((value) => {
    if (value === null || value === undefined || value === '') return;
    const cutBatchId = Number(value);
    if (Number.isInteger(cutBatchId) && !cutBatchIds.includes(cutBatchId)) {
      cutBatchIds.push(cutBatchId);
    }
  });

  return cutBatchIds;
}

function getRequiredBatterySourceRoles({ formFactor, coinCellMode, halfCellType }) {
  if (formFactor === 'coin' && coinCellMode === 'half_cell') {
    if (halfCellType === 'cathode_vs_li') return ['cathode'];
    if (halfCellType === 'anode_vs_li') return ['anode'];
    return [];
  }

  return ['cathode', 'anode'];
}

function intersectProjectIds(projectIdGroups) {
  if (!projectIdGroups.length) return [];

  return projectIdGroups
    .slice(1)
    .reduce(
      (acc, group) => acc.filter((projectId) => group.includes(projectId)),
      [...projectIdGroups[0]]
    );
}

async function deriveAllowedBatteryProjectIds(db, {
  formFactor,
  coinCellMode,
  halfCellType,
  cathodeCutBatchId,
  cathodeCutBatchIds,
  anodeCutBatchId,
  anodeCutBatchIds
}) {
  const requiredRoles = getRequiredBatterySourceRoles({ formFactor, coinCellMode, halfCellType });

  if (!requiredRoles.length) return [];

  const projectGroups = [];
  const idsByRole = {
    cathode: normalizeCutBatchIds(cathodeCutBatchIds || cathodeCutBatchId),
    anode: normalizeCutBatchIds(anodeCutBatchIds || anodeCutBatchId)
  };

  if (requiredRoles.includes('cathode')) {
    if (!idsByRole.cathode.length) return [];
    for (const cutBatchId of idsByRole.cathode) {
      projectGroups.push(await getCutBatchProjectIds(db, cutBatchId));
    }
  }

  if (requiredRoles.includes('anode')) {
    if (!idsByRole.anode.length) return [];
    for (const cutBatchId of idsByRole.anode) {
      projectGroups.push(await getCutBatchProjectIds(db, cutBatchId));
    }
  }

  if (projectGroups.some((group) => group.length === 0)) return [];

  return intersectProjectIds(projectGroups);
}

async function validateBatteryProjectIdsForSources(db, projectIds, context) {
  await validateProjectIds(db, projectIds);

  if (!projectIds.length) {
    throw statusError('Выберите хотя бы один проект аккумулятора', 400);
  }

  const allowedProjectIds = await deriveAllowedBatteryProjectIds(db, context);
  const allowed = new Set(allowedProjectIds);
  const invalid = projectIds.filter((projectId) => !allowed.has(projectId));

  if (!allowedProjectIds.length) {
    throw statusError('Выбранные партии электродов не имеют общего проекта', 400);
  }

  if (invalid.length) {
    throw statusError('Проекты аккумулятора должны быть связаны с выбранными партиями электродов', 400);
  }
}

async function replaceBatteryProjects(db, batteryId, projectIds, userId) {
  await validateProjectIds(db, projectIds);
  await db.query(
    'DELETE FROM battery_projects WHERE battery_id = $1',
    [batteryId]
  );

  for (const projectId of projectIds) {
    await db.query(
      `
      INSERT INTO battery_projects (battery_id, project_id, created_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (battery_id, project_id) DO NOTHING
      `,
      [batteryId, projectId, userId || null]
    );
  }
}

async function attachBatteryProjects(db, rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const batteryIds = sourceRows
    .map((row) => Number(row.battery_id))
    .filter((batteryId) => Number.isInteger(batteryId));

  if (!batteryIds.length) return sourceRows;

  const result = await db.query(
    `
    SELECT
      bp.battery_id,
      bp.project_id,
      p.name AS project_name
    FROM battery_projects bp
    JOIN projects p
      ON p.project_id = bp.project_id
    WHERE bp.battery_id = ANY($1::int[])
    ORDER BY bp.battery_id, p.name, bp.project_id
    `,
    [batteryIds]
  );

  const projectsByBatteryId = new Map();
  result.rows.forEach((row) => {
    const batteryId = Number(row.battery_id);
    if (!projectsByBatteryId.has(batteryId)) {
      projectsByBatteryId.set(batteryId, []);
    }
    projectsByBatteryId.get(batteryId).push({
      project_id: Number(row.project_id),
      name: row.project_name
    });
  });

  return sourceRows.map((row) => {
    const batteryId = Number(row.battery_id);
    let projects = projectsByBatteryId.get(batteryId) || [];

    if (!projects.length && row.project_id) {
      projects = [{
        project_id: Number(row.project_id),
        name: row.project_name || null
      }];
    }

    const projectIds = projects.map((project) => project.project_id);
    const projectNames = projects
      .map((project) => project.name)
      .filter(Boolean)
      .join(', ');

    return {
      ...row,
      project_id: row.project_id ?? (projectIds[0] || null),
      project_name: projectNames || row.project_name || null,
      project_ids: projectIds,
      projects,
      project_names: projectNames || null
    };
  });
}

module.exports = {
  attachBatteryProjects,
  deriveAllowedBatteryProjectIds,
  getPayloadProjectIds,
  normalizeProjectIds,
  replaceBatteryProjects,
  validateBatteryProjectIdsForSources,
  validateProjectIds
};
