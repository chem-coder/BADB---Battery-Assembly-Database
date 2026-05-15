const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');
const {
  sendDependencyConflict,
  sendForeignKeyConflict
} = require('../utils/dependencyConflicts');
const {
  createBattery,
  getBattery,
  listBatteries,
  updateBattery
} = require('../services/batteryCatalogService');
const {
  deleteBatteryRecord,
  disassembleBattery,
  getBatteryDeleteCheck
} = require('../services/batteryLifecycleService');
const {
  fetchCompatibleElectrodeCutBatches
} = require('../services/batteryCompatibleCutBatchService');
const {
  fetchBatteryAssembly,
  fetchBatteryReport
} = require('../services/batteryAssemblyService');
const {
  BatteryElectrodeStackConflictError,
  fetchBatteryElectrodeStack,
  saveBatteryElectrodeStack
} = require('../services/batteryElectrodeStackService');
const {
  BatteryElectrodeSourceValidationError,
  fetchBatteryElectrodeSources,
  saveBatteryElectrodeSources,
  updateBatteryElectrodeSources
} = require('../services/batteryElectrodeSourceService');
const {
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
} = require('../services/batteryCellConfigService');
const {
  getElectrolyteConfig,
  getSeparatorConfig,
  saveElectrolyteConfig,
  saveSeparatorConfig,
  updateElectrolyteConfig,
  updateSeparatorConfig
} = require('../services/batteryComponentConfigService');
const {
  getBatteryQc,
  saveBatteryQc,
  updateBatteryQc
} = require('../services/batteryQcService');
const {
  deleteBatteryElectrochem,
  fetchBatteryElectrochem,
  saveBatteryElectrochem
} = require('../services/batteryElectrochemService');

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});



// ---------- BATTERIES ----------

// Create a new battery header
router.post('/', auth, async (req, res) => {

  try {
    res.status(201).json(await createBattery(pool, req.body, req.user.userId));

  } catch (err) {

    if (err.statusCode === 400 || err.statusCode === 404) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания аккумулятора' });

  }

});

// List batteries
router.get('/', auth, async (req, res) => {
  try {
    res.json(await listBatteries(pool));

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки аккумуляторов' });

  }
});

router.get('/:id/electrode-cut-batches', auth, async (req, res) => {

  const batteryId = Number(req.params.id);
  const tapeId = Number(req.query.tape_id);
  const selectedBatchIdRaw = req.query.selected_batch_id;
  const selectedBatchId =
    selectedBatchIdRaw == null || selectedBatchIdRaw === ''
      ? null
      : Number(selectedBatchIdRaw);

  if (!Number.isInteger(batteryId) || !Number.isInteger(tapeId)) {
    return res.status(400).json({ error: 'Некорректные battery_id или tape_id' });
  }

  if (selectedBatchId !== null && !Number.isInteger(selectedBatchId)) {
    return res.status(400).json({ error: 'Некорректный selected_batch_id' });
  }

  try {
    res.json(await fetchCompatibleElectrodeCutBatches(pool, batteryId, tapeId, selectedBatchId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки совместимых партий электродов' });
  }

});

// Read battery header
router.get('/:id', auth, async (req, res) => {

  const batteryId = Number(req.params.id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный ID батареи' });
  }

  try {
    res.json(await getBattery(pool, batteryId));

  } catch (err) {

    if (err.statusCode === 404) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки батареи' });

  }

});

// Update battery header
router.patch('/:id', auth, async (req, res) => {

  const batteryId = Number(req.params.id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный ID батареи' });
  }

  try {
    res.json(await updateBattery(pool, batteryId, req.body, req.user.userId));

  } catch (err) {

    if (err.statusCode === 400 || err.statusCode === 404) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления батареи' });

  }

});

router.post('/:id/disassemble', auth, async (req, res) => {
  const batteryId = Number(req.params.id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный ID батареи' });
  }

  try {
    res.json(await disassembleBattery(pool, batteryId, req.user.userId));
  } catch (err) {
    if (err.statusCode === 409 && err.dependencies) {
      return sendDependencyConflict(res, err.message, err.dependencies);
    }
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка разборки аккумулятора' });
  }
});

router.get('/:id/delete-check', auth, async (req, res) => {
  const batteryId = Number(req.params.id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный ID батареи' });
  }

  try {
    res.json(await getBatteryDeleteCheck(pool, batteryId));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка проверки удаления аккумулятора' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  const batteryId = Number(req.params.id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный ID батареи' });
  }

  try {
    res.json(await deleteBatteryRecord(pool, batteryId, req.user.userId, req.body || {}));
  } catch (err) {
    if (err.statusCode === 409 && err.dependencies) {
      return sendDependencyConflict(res, err.message, err.dependencies);
    }
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    if (sendForeignKeyConflict(res, err, 'Нельзя удалить аккумулятор: он связан с другими записями')) {
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления аккумулятора' });
  }
});



// Save coin-cell configuration
router.post('/battery_coin_config', auth, async (req, res) => {

  try {
    res.status(201).json(await saveCoinConfig(pool, req.body));

  } catch (err) {

    if (err instanceof BatteryCellConfigValidationError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания конфигурации монеточного элемента' });

  }

});

// Read coin-cell configuration
router.get('/battery_coin_config/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.json(await getCoinConfig(pool, batteryId));

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки конфигурации монеточного элемента' });

  }

});

// Update coin-cell configuration
router.patch('/battery_coin_config/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.json(await updateCoinConfig(pool, batteryId, req.body, req.user.userId));

  } catch (err) {

    if (err instanceof BatteryCellConfigValidationError || err.statusCode === 404) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления конфигурации монеточного элемента' });

  }

});


// Save pouch/prism-cell configuration
router.post('/battery_pouch_config', auth, async (req, res) => {

  const batteryId = Number(req.body.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.status(200).json(await savePouchConfig(pool, req.body));

  } catch (err) {

    if (err instanceof BatteryCellConfigValidationError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения конфигурации пакетного/призматического элемента' });

  }

});

// Read pouch/prism-cell configuration
router.get('/battery_pouch_config/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.json(await getPouchConfig(pool, batteryId));

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки конфигурации пакетного/призматического элемента' });

  }

});

// Update pouch/prism-cell configuration
router.patch('/battery_pouch_config/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.json(await updatePouchConfig(pool, batteryId, req.body, req.user.userId));

  } catch (err) {

    if (err instanceof BatteryCellConfigValidationError || err.statusCode === 404) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления конфигурации пакетного/призматического элемента' });

  }

});



// Save cylindrical-cell configuration
router.post('/battery_cyl_config', auth, async (req, res) => {

  const batteryId = Number(req.body.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.status(200).json(await saveCylConfig(pool, req.body));

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения конфигурации цилиндрического элемента' });

  }

});

// Read cylindrical-cell configuration
router.get('/battery_cyl_config/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.json(await getCylConfig(pool, batteryId));

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки конфигурации цилиндрического элемента' });

  }

});

// Update cylindrical-cell configuration
router.patch('/battery_cyl_config/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.json(await updateCylConfig(pool, batteryId, req.body, req.user.userId));

  } catch (err) {

    if (err.statusCode === 404) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления конфигурации цилиндрического элемента' });

  }

});



// Save electrode sources for a battery

router.post('/battery_electrode_sources', auth, async (req, res) => {
  const batteryId = Number(req.body.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.status(200).json(await saveBatteryElectrodeSources(pool, batteryId, req.body));

  } catch (err) {
    if (err instanceof BatteryElectrodeSourceValidationError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения источников электродов' });
  }
});

// Read electrode sources for a battery
router.get('/battery_electrode_sources/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.json(await fetchBatteryElectrodeSources(pool, batteryId));

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки источников электродов' });

  }

});

// Update electrode sources for a battery
router.patch('/battery_electrode_sources/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.json(await updateBatteryElectrodeSources(pool, batteryId, req.body, req.user.userId));

  } catch (err) {

    if (err instanceof BatteryElectrodeSourceValidationError) {
      // Expose missing_roles + updated metadata when present (404 case)
      // so the UI can decide whether to POST instead.
      const body = { error: err.message };
      if (err.missing_roles) body.missing_roles = err.missing_roles;
      if (err.updated) body.updated = err.updated;
      return res.status(err.statusCode).json(body);
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления источников электродов' });

  }

});


// Update electrode stack
router.put('/battery_electrodes/:battery_id', auth, async (req, res) => {
  const batteryId = Number(req.params.battery_id);
  const stack = req.body;

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  if (!Array.isArray(stack)) {
    return res.status(400).json({ error: 'Стек должен быть массивом' });
  }

  try {
    await saveBatteryElectrodeStack(pool, batteryId, stack);
    res.json({ success: true });
  } catch (err) {
    console.error(err);

    if (err instanceof BatteryElectrodeStackConflictError) {
      return res.status(err.statusCode).json({ error: err.message });
    }

    res.status(500).json({
      error: 'Ошибка сохранения стека электродов'
    });
  }
});

// Read electrode stack for a battery
router.get('/battery_electrodes/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.json(await fetchBatteryElectrodeStack(pool, batteryId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки стека электродов' });
  }
});



// Save separator configuration
router.post('/battery_sep_config', auth, async (req, res) => {

  const batteryId = Number(req.body.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.status(200).json(await saveSeparatorConfig(pool, req.body));

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения конфигурации сепаратора' });

  }

});

// Read separator configuration
router.get('/battery_sep_config/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.json(await getSeparatorConfig(pool, batteryId));

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки конфигурации сепаратора' });

  }

});

// Update separator configuration
router.patch('/battery_sep_config/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.json(await updateSeparatorConfig(pool, batteryId, req.body));

  } catch (err) {

    if (err.statusCode === 404) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления конфигурации сепаратора' });

  }

});



// Save electrolyte configuration
router.post('/battery_electrolyte', auth, async (req, res) => {

  const batteryId = Number(req.body.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.status(200).json(await saveElectrolyteConfig(pool, req.body));

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения электролита' });

  }

});

// Read electrolyte configuration
router.get('/battery_electrolyte/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.json(await getElectrolyteConfig(pool, batteryId));

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки конфигурации электролита' });

  }

});

// Update electrolyte configuration
router.patch('/battery_electrolyte/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.json(await updateElectrolyteConfig(pool, batteryId, req.body));

  } catch (err) {

    if (err.statusCode === 404) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления конфигурации электролита' });

  }

});



// Save battery QC data
router.post('/battery_qc', auth, async (req, res) => {

  const batteryId = Number(req.body.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.status(200).json(await saveBatteryQc(pool, req.body));

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения выходного контроля' });

  }

});

// Read battery QC data
router.get('/battery_qc/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.json(await getBatteryQc(pool, batteryId));

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки данных выходного контроля' });

  }

});

// Update battery QC data
router.patch('/battery_qc/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.json(await updateBatteryQc(pool, batteryId, req.body));

  } catch (err) {

    if (err.statusCode === 404) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления данных выходного контроля' });

  }

});


// Save battery electrochem data
router.post('/battery_electrochem', auth, async (req, res) => {

  const {
    battery_id,
    entries,
    electrochem_notes
  } = req.body;

  const batteryId = Number(battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const hasNotes = typeof electrochem_notes === 'string' && electrochem_notes.trim();

  if (normalizedEntries.length === 0 && !hasNotes) {
    return res.status(400).json({ error: 'Добавьте заметку или файл испытаний' });
  }

  try {
    res.status(200).json(await saveBatteryElectrochem(
      pool,
      batteryId,
      normalizedEntries,
      electrochem_notes
    ));

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения электрохимических испытаний' });

  }

});

// Read battery electrochem data
router.get('/battery_electrochem/:battery_id', auth, async (req, res) => {

  const batteryId = Number(req.params.battery_id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    res.json(await fetchBatteryElectrochem(pool, batteryId));

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки электрохимических испытаний' });

  }

});

// Update battery electrochem data
router.patch('/battery_electrochem/:battery_id', auth, async (req, res) => {
  res.status(405).json({ error: 'Используйте POST для добавления новых файлов электрохимических испытаний' });

});


// Delete a single battery_electrochem file (DB row + file on disk).
//
// Route shape matches /battery_electrochem/* sibling routes (POST/GET/PATCH
// are keyed by battery_id; this one is keyed by battery_electrochem_id since
// a delete needs to target exactly one row).
//
// Disk cleanup is best-effort and lives inside the service: a missing file
// behind a deleted row is harmless. Returns 404 if no row matched the id.
router.delete('/battery_electrochem/:electrochem_id', auth, async (req, res) => {
  const electrochemId = Number(req.params.electrochem_id);

  if (!Number.isInteger(electrochemId)) {
    return res.status(400).json({ error: 'Некорректный battery_electrochem_id' });
  }

  try {
    res.json(await deleteBatteryElectrochem(pool, electrochemId));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления файла электрохимических испытаний' });
  }
});



// ---------- LOAD THE FULL BATTERY RECORD ----------

// Generates JSON
router.get('/:id/assembly', auth, async (req, res) => {
  const batteryId = Number(req.params.id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    const assembly = await fetchBatteryAssembly(pool, batteryId);

    if (!assembly) {
      return res.status(404).json({ error: 'Батарея не найдена' });
    }

    res.json(assembly);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки сборки батареи' });
  }
});

router.get('/:id/report', auth, async (req, res) => {
  const batteryId = Number(req.params.id);

  if (!Number.isInteger(batteryId)) {
    return res.status(400).json({ error: 'Некорректный battery_id' });
  }

  try {
    const report = await fetchBatteryReport(pool, batteryId);

    if (!report) {
      return res.status(404).json({ error: 'Батарея не найдена' });
    }

    res.json(report);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки печатного отчёта по батарее' });
  }
});



module.exports = router;
