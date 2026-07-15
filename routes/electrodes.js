const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');
const {
  requireEntityView,
  requireEntityModify,
  requireCreateInProjects,
  filterRowsByEntityAccess
} = require('../middleware/projectAccess');
const { getEntityProjectIds } = require('../services/projectAccessService');

// R1: a new cut batch belongs to its parent tape's projects — the user
// needs edit/admin access there.
async function cutBatchCreateProjects(req, db) {
  const tapeId = Number(req.body && req.body.tape_id);
  if (!Number.isInteger(tapeId)) {
    return { error: { status: 400, message: 'Некорректные данные' } };
  }
  const { exists, projectIds } = await getEntityProjectIds(db, 'tape', tapeId);
  if (!exists) return { error: { status: 404, message: 'Лента не найдена' } };
  return { projectIds };
}

// R1: a new electrode belongs to its parent cut batch's projects.
async function electrodeCreateProjects(req, db) {
  const cutBatchId = Number(req.body && req.body.cut_batch_id);
  if (!Number.isInteger(cutBatchId)) {
    return { error: { status: 400, message: 'Некорректные данные' } };
  }
  const { exists, projectIds } = await getEntityProjectIds(db, 'cutBatch', cutBatchId);
  if (!exists) return { error: { status: 404, message: 'Партия электродов не найдена' } };
  return { projectIds };
}
const {
  sendDependencyConflict,
  sendForeignKeyConflict
} = require('../utils/dependencyConflicts');
const {
  collectCutBatchDeleteDependencies,
  createElectrodeCutBatch,
  deleteElectrodeCutBatch,
  getElectrodeCutBatchDeleteCheck,
  getElectrodeCutBatch,
  getElectrodeCutBatchReport,
  listElectrodeCutBatches,
  updateElectrodeCutBatch
} = require('../services/electrodeCutBatchService');
const {
  addFoilMassMeasurement,
  deleteFoilMassMeasurement,
  deleteFoilMassMeasurementsForBatch,
  listFoilMassMeasurements,
  updateFoilMassMeasurement
} = require('../services/electrodeFoilMassService');
const {
  deleteElectrodeDrying,
  getElectrodeDrying,
  saveElectrodeDrying,
  updateElectrodeDrying
} = require('../services/electrodeDryingService');
const {
  createElectrode,
  deleteElectrode,
  getElectrodeDeleteConflict,
  listElectrodesForCutBatch,
  updateElectrode,
  updateElectrodeStatus
} = require('../services/electrodeCatalogService');

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});

router.get('/electrode-cut-batches', auth, async (req, res) => {
  try {
    // R1: users only see batches belonging to projects they can access.
    const rows = await listElectrodeCutBatches(pool);
    res.json(await filterRowsByEntityAccess(req, 'cutBatch', rows, 'cut_batch_id'));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- ELECTRODE CUT BATCHES --------
// CREATE cut batch
router.post('/electrode-cut-batches', auth, requireCreateInProjects(cutBatchCreateProjects), async (req, res) => {
  const tapeId = Number(req.body.tape_id);

  if (!Number.isInteger(tapeId)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const cutBatch = await createElectrodeCutBatch(pool, req.body, req.user.userId);
    res.status(201).json(cutBatch);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE
router.put('/electrode-cut-batches/:id', auth, requireEntityModify('cutBatch'), async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId) || cutBatchId <= 0) {
    return res.status(400).json({ error: 'Некорректный ID партии' });
  }

  try {
    res.json(await updateElectrodeCutBatch(pool, cutBatchId, req.body, req.user.userId));

  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET cut batch by ID
router.get('/electrode-cut-batches/:id', auth, requireEntityView('cutBatch'), async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    res.json(await getElectrodeCutBatch(pool, cutBatchId));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/electrode-cut-batches/:id/report', auth, requireEntityView('cutBatch'), async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    res.json(await getElectrodeCutBatchReport(pool, cutBatchId));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки печатного отчёта по партии электродов' });
  }
});

router.get('/electrode-cut-batches/:id/delete-check', auth, requireEntityModify('cutBatch'), async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    res.json(await getElectrodeCutBatchDeleteCheck(pool, cutBatchId));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка проверки удаления партии электродов' });
  }
});

// DELETE cut batch.
// Electrode records must be deleted intentionally first; batch deletion should
// never be used as a hidden cascade path for removing electrodes.
router.delete('/electrode-cut-batches/:id', auth, requireEntityModify('cutBatch'), async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const dependencies = await collectCutBatchDeleteDependencies(pool, cutBatchId);

    if (dependencies.length > 0) {
      return sendDependencyConflict(
        res,
        'Нельзя удалить партию электродов: сначала удалите связанные электроды и аккумуляторные связи',
        dependencies
      );
    }

    res.json(await deleteElectrodeCutBatch(pool, cutBatchId));
  } catch (err) {
    if (err.statusCode === 409 && err.dependencies) {
      return sendDependencyConflict(res, err.message, err.dependencies);
    }
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    if (sendForeignKeyConflict(res, err, 'Нельзя удалить партию электродов: она связана с другими записями')) {
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// GET electrodes by batch
router.get('/electrode-cut-batches/:id/electrodes', auth, requireEntityView('cutBatch'), async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    res.json(await listElectrodesForCutBatch(pool, cutBatchId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- FOIL MASS MEASUREMENTS --------

// ADD measurement
router.post('/electrode-cut-batches/:id/foil-masses', auth, requireEntityModify('cutBatch'), async (req, res) => {
  const cutBatchId = Number(req.params.id);
  const { mass_g } = req.body;
  const mass = Number(mass_g);

  if (!Number.isInteger(cutBatchId) || !Number.isFinite(mass) || mass <= 0) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    res.status(201).json(await addFoilMassMeasurement(pool, cutBatchId, mass));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET measurements
router.get('/electrode-cut-batches/:id/foil-masses', auth, requireEntityView('cutBatch'), async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    res.json(await listFoilMassMeasurements(pool, cutBatchId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE all measurements for a batch
router.delete('/electrode-cut-batches/:id/foil-masses', auth, requireEntityModify('cutBatch'), async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    res.json(await deleteFoilMassMeasurementsForBatch(pool, cutBatchId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


// These don't seem to appear anywhere... 
// THere are no foil-measurements routes in the html files... 
// UPDATE measurement
router.put('/foil-measurements/:id', auth, requireEntityModify('foilMeasurement'), async (req, res) => {
  const measurementId = Number(req.params.id);
  const { mass_g } = req.body;

  if (!Number.isInteger(measurementId) || !mass_g || Number(mass_g) <= 0) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    res.json(await updateFoilMassMeasurement(pool, measurementId, mass_g, req.user.userId));
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE measurement
router.delete('/foil-measurements/:id', auth, requireEntityModify('foilMeasurement'), async (req, res) => {
  const measurementId = Number(req.params.id);

  if (!Number.isInteger(measurementId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    res.json(await deleteFoilMassMeasurement(pool, measurementId));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- ELECTRODES --------

// CREATE electrode
router.post('/', auth, requireCreateInProjects(electrodeCreateProjects), async (req, res) => {
  const {
    cut_batch_id,
    electrode_mass_g,
    cup_number,
    comments
  } = req.body;

  const mass = Number(electrode_mass_g);
  
  if (
    !Number.isInteger(cut_batch_id) ||
    !Number.isFinite(mass) ||
    mass <= 0
  ) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    res.status(201).json(await createElectrode(pool, req.body));

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });

  }
});

// UPDATE electrode status
router.put('/:id/status', auth, requireEntityModify('electrode'), async (req, res) => {
  const electrodeId = Number(req.params.id);
  const { status_code, used_in_battery_id, scrapped_reason } = req.body;

  if (!Number.isInteger(electrodeId) || !Number.isInteger(status_code)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  if (![1,2,3].includes(status_code)) {
    return res.status(400).json({ error: 'Некорректный статус' });
  }

  if (status_code === 3 && !scrapped_reason) {
    return res.status(400).json({ error: 'Нужно указать причину списания' });
  }

  if (status_code === 2 && !used_in_battery_id) {
    return res.status(400).json({ error: 'Нужно указать батарею' });
  }

  if (status_code === 1 && (used_in_battery_id || scrapped_reason)) {
    return res.status(400).json({ error: 'Доступный электрод не должен быть связан с батареей или причиной списания' });
  }

  if (status_code === 2 && scrapped_reason) {
    return res.status(400).json({ error: 'Использованный электрод не должен иметь причину списания' });
  }

  if (status_code === 3 && used_in_battery_id) {
    return res.status(400).json({ error: 'Списанный электрод не должен быть связан с батареей' });
  }
  
  try {
    res.json(await updateElectrodeStatus(pool, electrodeId, req.body, req.user.userId));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE electrode fields (mass, cup, comments, capacity-average inclusion)
router.put('/:id', auth, requireEntityModify('electrode'), async (req, res) => {

  const electrodeId = Number(req.params.id);
  const {
    electrode_mass_g,
    cup_number,
    comments
  } = req.body;

  if (!Number.isInteger(electrodeId)) {
    return res.status(400).json({ error: 'Invalid electrode id' });
  }

  try {
    res.json(await updateElectrode(pool, electrodeId, req.body, req.user.userId));

  } catch (err) {

    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });

  }

});

// DELETE single electrode
router.delete('/:id', auth, requireEntityModify('electrode'), async (req, res) => {

  const electrodeId = Number(req.params.id);

  if (!Number.isInteger(electrodeId)) {
    return res.status(400).json({ error: 'Invalid electrode id' });
  }

  try {
    const conflict = await getElectrodeDeleteConflict(pool, electrodeId);
    if (conflict) {
      return sendDependencyConflict(res, conflict.message, conflict.dependencies);
    }

    res.json(await deleteElectrode(pool, electrodeId));

  } catch (err) {

    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    if (sendForeignKeyConflict(res, err, 'Нельзя удалить электрод: он связан с другими записями')) {
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });

  }

});


// -------- ELECTRODE DRYING --------

// CREATE or UPDATE drying record (UPSERT)
router.post('/electrode-cut-batches/:id/drying', auth, requireEntityModify('cutBatch'), async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const drying = await saveElectrodeDrying(pool, cutBatchId, req.body);
    res.json(drying);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET drying records by batch
router.get('/electrode-cut-batches/:id/drying', auth, requireEntityView('cutBatch'), async (req, res) => {
  const cutBatchId = Number(req.params.id);

  if (!Number.isInteger(cutBatchId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const drying = await getElectrodeDrying(pool, cutBatchId);
    res.json(drying);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT update drying record
router.put('/electrode-drying/:id', auth, requireEntityModify('electrodeDrying'), async (req, res) => {
  const dryingId = Number(req.params.id);

  if (!Number.isInteger(dryingId)) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const drying = await updateElectrodeDrying(pool, dryingId, req.body, req.user.userId);
    res.json(drying);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE drying record
router.delete('/electrode-drying/:id', auth, requireEntityModify('electrodeDrying'), async (req, res) => {
  const dryingId = Number(req.params.id);

  if (!Number.isInteger(dryingId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const result = await deleteElectrodeDrying(pool, dryingId);
    res.json(result);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});




module.exports = router;
