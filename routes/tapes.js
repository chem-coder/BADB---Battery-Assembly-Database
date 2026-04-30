const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const {
  sendDependencyConflict,
  sendForeignKeyConflict
} = require('../utils/dependencyConflicts');
const {
  depleteTapeDryBox,
  fetchTapeDryBoxState,
  fetchTapeDryingStepByCode,
  normalizeDryingOperationCode,
  removeTapeFromDryBox,
  returnTapeToDryBox,
  saveTapeDryBoxParameters
} = require('../services/tapeDryBoxService');
const {
  getTapeStepSaveErrorMessage,
  saveTapeStepByCode
} = require('../services/tapeStepSaveService');
const {
  listTapeActuals,
  saveTapeActual
} = require('../services/tapeActualService');
const {
  collectTapeDeleteDependencies,
  createTape,
  deleteTape,
  listTapes,
  updateTape
} = require('../services/tapeCatalogService');
const {
  getTape,
  getTapeReport,
  getTapeStepByCode,
  listElectrodeCutBatchesByTape,
  listTapesForElectrodes
} = require('../services/tapeReadService');

router.get('/test', async (req, res) => {
  try {
    const result = await pool.query('SELECT 1 as ok');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database connection failed' });
  }
});



// --------  RECIPE LINE ACTUALS -------- 

// CREATE
router.post('/:id/actuals', auth, async (req, res) => {
  const tapeId = Number(req.params.id);

  if (!Number.isInteger(tapeId)) {
    return res.status(400).json({ error: 'Некорректный tape_id' });
  }

  try {
    res.json(await saveTapeActual(pool, tapeId, req.body));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения фактических данных' });
  }
});

// READ
router.get('/:id/actuals', auth, async (req, res) => {
  const tapeId = Number(req.params.id);

  if (!Number.isInteger(tapeId)) {
    return res.status(400).json({ error: 'Некорректный tape_id' });
  }

  try {
    res.json(await listTapeActuals(pool, tapeId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки фактических данных' });
  }
});



// -------- TAPES --------

// CREATE tape
router.post('/', auth, async (req, res) => {
  const {
    project_id,
    tape_recipe_id
  } = req.body;

  const projectId = project_id ? Number(project_id) : null;
  const recipeId  = tape_recipe_id ? Number(tape_recipe_id) : null;

  if (project_id && !Number.isInteger(projectId)) {
    return res.status(400).json({ error: 'Некорректный project_id' });
  }
  if (tape_recipe_id && !Number.isInteger(recipeId)) {
    return res.status(400).json({ error: 'Некорректный tape_recipe_id' });
  }

  try {
    res.status(201).json(await createTape(pool, req.body, req.user.userId));

  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ
router.get('/', auth, async (req, res) => {
  const { role } = req.query;

  try {
    res.json(await listTapes(pool, role));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// EDIT
router.put('/:id', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    res.json(await updateTape(pool, id, req.body, req.user.userId));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

// DELETE
// Restricted to admin/lead: employees should not be able to destroy
// arbitrary tapes owned by other users. Before this guard, any authenticated
// user could DELETE /api/tapes/:id and the only barrier was the schema-level
// dependency check.
router.delete('/:id', auth, requireRole('admin', 'lead'), async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный tape_id' });
  }

  try {
    const dependencies = await collectTapeDeleteDependencies(pool, id);

    if (dependencies.length > 0) {
      return sendDependencyConflict(
        res,
        'Нельзя удалить ленту: её электроды или партии используются в аккумуляторах',
        dependencies
      );
    }

    res.json(await deleteTape(pool, id));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    if (sendForeignKeyConflict(res, err, 'Нельзя удалить ленту: она связана с другими записями')) {
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});



// --------- GENERAL/GENERIC STEP READING (for any operation type) --------

// WRITE (dispatcher): POST /:id/steps/by-code/:code
router.post('/:id/steps/by-code/:code', auth, async (req, res) => {
  const tapeId = Number(req.params.id);
  const code = String(req.params.code || '').trim();

  if (!Number.isInteger(tapeId) || !code) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }

  try {
    const result = await saveTapeStepByCode(pool, {
      tapeId,
      code,
      body: req.body || {},
      userId: req.user.userId
    });

    return res.status(result.statusCode).json(result.payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: getTapeStepSaveErrorMessage(code) });
  }
});

// READ
router.get('/:id/steps/drying', auth, async (req, res) => {
  const tapeId = Number(req.params.id);
  const code = normalizeDryingOperationCode(req.query.operation_code);

  if (!Number.isInteger(tapeId)) {
    return res.status(400).json({ error: 'Некорректный tape_id' });
  }

  if (!code) {
    return res.status(400).json({ error: 'Некорректный operation_code' });
  }

  try {
    const step = await fetchTapeDryingStepByCode(pool, tapeId, code);
    res.json(step);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки сушки' });
  }
});

router.get('/:id/steps/by-code/:code', auth, async (req, res) => {
  const tapeId = Number(req.params.id);
  const code = String(req.params.code || '').trim();

  if (!Number.isInteger(tapeId) || !code) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }

  try {
    res.json(await getTapeStepByCode(pool, tapeId, code));

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки этапа' });
  }
});



// -------- TAPES FOR ELECTRODE CUTTING DROPDOWN --------

router.get('/for-electrodes', auth, async (req, res) => {

  try {
    res.json(await listTapesForElectrodes(pool));

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });

  }

});



// -------- ELECTRODE CUT BATCHES BY TAPE --------

// GET cut batches by tape
router.get('/:id/electrode-cut-batches', auth, async (req, res) => {
  const tapeId = Number(req.params.id);

  if (!Number.isInteger(tapeId)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    res.json(await listElectrodeCutBatchesByTape(pool, tapeId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


router.get('/:id/report', auth, async (req, res) => {
  const tapeId = Number(req.params.id);

  if (!Number.isInteger(tapeId)) {
    return res.status(400).json({ error: 'Некорректный tape_id' });
  }

  try {
    res.json(await getTapeReport(pool, tapeId));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки печатного отчёта по ленте' });
  }
});



// READ ONE — must be after /for-electrodes to avoid /:id catching "for-electrodes"
router.get('/:id', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    res.json(await getTape(pool, id));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/:id/dry-box-state', auth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    const stateRow = await fetchTapeDryBoxState(pool, id);

    if (!stateRow) {
      return res.status(404).json({ error: 'Лента не найдена' });
    }

    res.json(stateRow);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки состояния сушильного шкафа' });
  }
});

router.put('/:id/dry-box-state', auth, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    res.json(await saveTapeDryBoxParameters(pool, id, req.body || {}, req.user.userId));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения параметров сушки в шкафу' });
  }
});

router.post('/:id/dry-box-state/return-now', auth, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    res.json(await returnTapeToDryBox(pool, id, req.body || {}, req.user.userId));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка возврата ленты в сушильный шкаф' });
  }
});

router.post('/:id/dry-box-state/remove-now', auth, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    res.json(await removeTapeFromDryBox(pool, id, req.user.userId));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка изменения статуса ленты в сушильном шкафу' });
  }
});

router.post('/:id/dry-box-state/deplete', auth, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный ID' });
  }

  try {
    res.json(await depleteTapeDryBox(pool, id, req.user.userId));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка изменения статуса ленты' });
  }
});

module.exports = router;
