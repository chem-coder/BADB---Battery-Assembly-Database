const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');
const {
  sendDependencyConflict,
  sendForeignKeyConflict
} = require('../utils/dependencyConflicts');
const {
  createMaterial,
  deleteMaterial,
  listMaterials,
  updateMaterial
} = require('../services/materialCatalogService');
const {
  createMaterialInstance,
  deleteMaterialInstance,
  listAllMaterialInstances,
  listMaterialInstancesForMaterial,
  updateMaterialInstance
} = require('../services/materialInstanceService');
const {
  addMaterialPropertyFiles,
  addMaterialSourceFiles,
  deleteMaterialPropertyFile,
  deleteMaterialSourceFile,
  getMaterialPropertyFile,
  getMaterialSourceFile,
  listMaterialPropertyFiles,
  listMaterialSourceFiles
} = require('../services/materialFileService');
const {
  getMaterialProperties,
  getMaterialSourceInfo,
  saveMaterialProperties,
  saveMaterialSourceInfo
} = require('../services/materialInfoService');
const {
  addMaterialInstanceComponent,
  deleteMaterialInstanceComponent,
  MaterialCompositionValidationError,
  fetchMaterialInstanceComponents,
  replaceMaterialInstanceComposition,
  updateMaterialInstanceComponent
} = require('../services/materialCompositionService');

router.get('/test', async (req, res) => {
  const result = await pool.query('SELECT 1 as ok');
  res.json(result.rows);
});

/*
  materials
    └── material_instances
          └── material_instance_components
*/


// -------- MATERIALS --------

// CREATE
router.post('/', auth, async (req, res) => {
  const { name, role } = req.body;
  const cleanName = typeof name === 'string' ? name.trim() : '';

  if (!cleanName) {
    return res.status(400).json({ error: 'Название обязательно' });
  }

  // role is optional in schema (role public.material_role), but UI requires it.
  if (typeof role !== 'string' || !role.trim()) {
    return res.status(400).json({ error: 'Роль обязательна' });
  }

  try {
    res.status(201).json(await createMaterial(pool, { name: cleanName, role }, req.user.userId));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Материал с таким названием уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ
router.get('/', auth, async (req, res) => {
  try {
    res.json(await listMaterials(pool));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// UPDATE
router.put('/:id', auth, async (req, res) => {
  const id = Number(req.params.id);
  const { name, role } = req.body;

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный material_id' });
  }

  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Название обязательно' });
  }

  if (typeof role !== 'string' || !role.trim()) {
    return res.status(400).json({ error: 'Роль обязательна' });
  }

  try {
    res.json(await updateMaterial(pool, id, { name: name.trim(), role }, req.user.userId));
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: err.message });
    }
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Материал с таким названием уже существует' });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE
router.delete('/:id', auth, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный material_id' });
  }

  try {
    await deleteMaterial(pool, id);
    res.status(204).end();
  } catch (err) {
    if (err.statusCode === 409 && Array.isArray(err.dependencies)) {
      return sendDependencyConflict(
        res,
        err.message,
        err.dependencies
      );
    }

    if (err.statusCode === 404) {
      return res.status(404).json({ error: 'Материал не найден' });
    }

    if (sendForeignKeyConflict(res, err, 'Нельзя удалить материал: он связан с другими записями')) {
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// -------- MATERIAL INSTANCES --------

// CREATE instance for material
router.post('/:id/instances', auth, async (req, res) => {
  const materialId = Number(req.params.id);

  if (!Number.isInteger(materialId)) {
    return res.status(400).json({ error: 'Некорректный material_id' });
  }

  try {
    res.status(201).json(await createMaterialInstance(pool, materialId, req.body, req.user.userId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// READ all instances for composition dropdowns
router.get('/instances', auth, async (req, res) => {
  try {
    res.json(await listAllMaterialInstances(pool));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки экземпляров материалов' });
  }
});

// READ instances for a material
router.get('/:id/instances', auth, async (req, res) => {
  const materialId = Number(req.params.id);

  if (!Number.isInteger(materialId)) {
    return res.status(400).json({ error: 'Некорректный material_id' });
  }

  try {
    res.json(await listMaterialInstancesForMaterial(pool, materialId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});



// UPDATE instance
// OLD ROUTE: .put('/api/material-instances/:id'
router.put('/instances/:id', auth, async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  try {
    res.json(await updateMaterialInstance(pool, instanceId, req.body, req.user.userId));
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE instance
// OLD ROUTE: .delete('/api/material-instances/:id'
router.delete('/instances/:id', auth, async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  try {
    await deleteMaterialInstance(pool, instanceId);
    res.status(204).end();
  } catch (err) {
    if (err.statusCode === 409 && Array.isArray(err.dependencies)) {
      return sendDependencyConflict(
        res,
        err.message,
        err.dependencies
      );
    }

    if (err.statusCode === 404) {
      return res.status(404).json({ error: 'Экземпляр материала не найден' });
    }

    if (sendForeignKeyConflict(res, err, 'Нельзя удалить экземпляр материала: он связан с другими записями')) {
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


// -------- MATERIAL PROPERTIES --------

router.get('/instances/:id/properties', auth, async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  try {
    res.json(await getMaterialProperties(pool, instanceId));
  } catch (err) {
    const statusCode = err.statusCode || 500;
    if (statusCode === 500) console.error(err);
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Ошибка загрузки свойств материала' : err.message
    });
  }
});

router.put('/instances/:id/properties', auth, async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  try {
    res.json(await saveMaterialProperties(pool, instanceId, req.body, req.user.userId));
  } catch (err) {
    const statusCode = err.statusCode || 500;
    if (statusCode === 500) console.error(err);
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Ошибка сохранения свойств материала' : err.message
    });
  }
});


// -------- MATERIAL SOURCE INFO --------

router.get('/instances/:id/source-info', auth, async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  try {
    res.json(await getMaterialSourceInfo(pool, instanceId));
  } catch (err) {
    const statusCode = err.statusCode || 500;
    if (statusCode === 500) console.error(err);
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Ошибка загрузки информации об источнике материала' : err.message
    });
  }
});

router.put('/instances/:id/source-info', auth, async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  try {
    res.json(await saveMaterialSourceInfo(pool, instanceId, req.body, req.user.userId));
  } catch (err) {
    const statusCode = err.statusCode || 500;
    if (statusCode === 500) console.error(err);
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Ошибка сохранения информации об источнике материала' : err.message
    });
  }
});

router.get('/instances/:id/source-info/files', auth, async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  try {
    res.json(await listMaterialSourceFiles(pool, instanceId));
  } catch (err) {
    const statusCode = err.statusCode || 500;
    console.error(err);
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Ошибка загрузки файлов источника материала' : err.message
    });
  }
});

router.post('/instances/:id/source-info/files', auth, async (req, res) => {
  const instanceId = Number(req.params.id);
  const { entries } = req.body;

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'Не переданы файлы источника материала' });
  }

  try {
    res.json(await addMaterialSourceFiles(pool, instanceId, entries, req.user.userId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения файлов источника материала' });
  }
});

router.get('/source-files/:fileId/download', auth, async (req, res) => {
  const fileId = Number(req.params.fileId);

  if (!Number.isInteger(fileId)) {
    return res.status(400).json({ error: 'Некорректный идентификатор файла' });
  }

  try {
    const file = await getMaterialSourceFile(pool, fileId);

    if (!file) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.file_name || 'material-source-file')}`
    );
    res.send(file.file_data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка скачивания файла источника материала' });
  }
});

router.delete('/source-files/:fileId', auth, async (req, res) => {
  const fileId = Number(req.params.fileId);

  if (!Number.isInteger(fileId)) {
    return res.status(400).json({ error: 'Некорректный идентификатор файла' });
  }

  try {
    const deleted = await deleteMaterialSourceFile(pool, fileId);

    if (!deleted) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления файла источника материала' });
  }
});

router.get('/instances/:id/properties/files', auth, async (req, res) => {
  const instanceId = Number(req.params.id);

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  try {
    res.json(await listMaterialPropertyFiles(pool, instanceId));
  } catch (err) {
    const statusCode = err.statusCode || 500;
    console.error(err);
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Ошибка загрузки файлов свойств материала' : err.message
    });
  }
});

router.post('/instances/:id/properties/files', auth, async (req, res) => {
  const instanceId = Number(req.params.id);
  const { entries } = req.body;

  if (!Number.isInteger(instanceId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'Не переданы файлы свойств материала' });
  }

  try {
    res.json(await addMaterialPropertyFiles(pool, instanceId, entries, req.user.userId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения файлов свойств материала' });
  }
});

router.get('/property-files/:fileId/download', auth, async (req, res) => {
  const fileId = Number(req.params.fileId);

  if (!Number.isInteger(fileId)) {
    return res.status(400).json({ error: 'Некорректный идентификатор файла' });
  }

  try {
    const file = await getMaterialPropertyFile(pool, fileId);

    if (!file) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.file_name || 'material-property-file')}`
    );
    res.send(file.file_data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка скачивания файла свойств материала' });
  }
});

router.delete('/property-files/:fileId', auth, async (req, res) => {
  const fileId = Number(req.params.fileId);

  if (!Number.isInteger(fileId)) {
    return res.status(400).json({ error: 'Некорректный идентификатор файла' });
  }

  try {
    const deleted = await deleteMaterialPropertyFile(pool, fileId);

    if (!deleted) {
      return res.status(404).json({ error: 'Файл не найден' });
    }

    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления файла свойств материала' });
  }
});


// -------- MATERIAL INSTANCE COMPONENTS --------

// --- GET components for a material instance ---
router.get('/instances/:id/components', auth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    res.json(await fetchMaterialInstanceComponents(pool, id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки компонентов' });
  }
});

// --- ADD component to instance ---
router.post('/instances/:id/components', auth, async (req, res) => {
  const parentId = Number(req.params.id);
  const { component_material_instance_id, mass_fraction } = req.body;

  if (!Number.isInteger(parentId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  try {
    res.json(await addMaterialInstanceComponent(pool, parentId, component_material_instance_id, mass_fraction));
  } catch (err) {
    if (err instanceof MaterialCompositionValidationError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка добавления компонента' });
  }
});

// --- REPLACE full composition for an instance ---
router.put('/instances/:id/components', auth, async (req, res) => {
  const parentId = Number(req.params.id);
  const components = Array.isArray(req.body.components) ? req.body.components : null;

  if (!Number.isInteger(parentId)) {
    return res.status(400).json({ error: 'Некорректный material_instance_id' });
  }

  try {
    res.json(await replaceMaterialInstanceComposition(pool, parentId, components, req.user.userId));
  } catch (err) {
    if (err instanceof MaterialCompositionValidationError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения состава' });
  }
});



// --- UPDATE component ---
router.put('/instances/components/:id', auth, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Некорректный material_instance_component_id' });
  }

  try {
    res.json(await updateMaterialInstanceComponent(pool, id, req.body, req.user.userId));
  } catch (err) {
    if (err instanceof MaterialCompositionValidationError || err.statusCode === 404) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// --- DELETE component ---
router.delete('/instances/components/:id', auth, async (req, res) => {
  const id = Number(req.params.id);
  try {
    res.json(await deleteMaterialInstanceComponent(pool, id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления компонента' });
  }
});




module.exports = router;
