const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const pool = require('../db/pool');
const { auth } = require('../middleware/auth');

const router = Router();

// ── Upload directory setup ────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'cycling', 'raw');
const PROCESSING_DIR = path.join(__dirname, '..', 'uploads', 'cycling', 'processing');
const PARSER_SCRIPT = path.join(__dirname, '..', 'scripts', 'parse_cycling.py');
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.txt'];

// Ensure directories exist
[UPLOAD_DIR, PROCESSING_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
});

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PROCESSING_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ts = Date.now();
    const rand = crypto.randomBytes(4).toString('hex');
    cb(null, `upload_${ts}_${rand}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error(`File type ${ext} not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`));
    }
    cb(null, true);
  },
});

/**
 * Content-type sanity check. Extension-whitelist alone can be bypassed by
 * renaming malware.exe → data.csv. Read the first few bytes and verify:
 *   - .xlsx → ZIP magic "PK\x03\x04"
 *   - .xls  → OLE2 compound magic "\xD0\xCF\x11\xE0"
 *   - .csv / .txt → ASCII/UTF-8 text-like, and NOT a known executable header
 *
 * Returns null on OK, or an error message string on reject.
 * The file is NOT deleted here — caller handles cleanup.
 */
function verifyMagicBytes(filePath, ext) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buf, 0, 16, 0);
    if (bytesRead === 0) return 'Файл пустой';

    // Executable headers — reject regardless of extension
    // MZ (Windows PE), ELF (Linux), Mach-O (macOS, 4 variants)
    const execPatterns = [
      [0x4d, 0x5a],                                 // MZ (PE/COFF)
      [0x7f, 0x45, 0x4c, 0x46],                     // ELF
      [0xfe, 0xed, 0xfa, 0xce],                     // Mach-O 32 BE
      [0xfe, 0xed, 0xfa, 0xcf],                     // Mach-O 64 BE
      [0xce, 0xfa, 0xed, 0xfe],                     // Mach-O 32 LE
      [0xcf, 0xfa, 0xed, 0xfe],                     // Mach-O 64 LE
      [0xca, 0xfe, 0xba, 0xbe],                     // Mach-O universal / Java class
    ];
    for (const pat of execPatterns) {
      let match = true;
      for (let i = 0; i < pat.length; i++) {
        if (buf[i] !== pat[i]) { match = false; break; }
      }
      if (match) return 'Файл похож на исполняемый — отклонён';
    }

    if (ext === '.xlsx') {
      // ZIP archive magic
      if (buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
        return 'Файл не похож на .xlsx (нет ZIP-сигнатуры)';
      }
      return null;
    }
    if (ext === '.xls') {
      // OLE2 compound document magic
      if (buf[0] !== 0xd0 || buf[1] !== 0xcf || buf[2] !== 0x11 || buf[3] !== 0xe0) {
        return 'Файл не похож на .xls (нет OLE2-сигнатуры)';
      }
      return null;
    }
    if (ext === '.csv' || ext === '.txt') {
      // Text files: every byte must be printable ASCII/UTF-8 or common whitespace
      // (tab, LF, CR). Any other control byte (0x00-0x08, 0x0e-0x1f, 0x7f) is a red flag.
      for (let i = 0; i < bytesRead; i++) {
        const b = buf[i];
        if (b === 0x09 || b === 0x0a || b === 0x0d) continue; // tab/LF/CR
        if (b < 0x20 || b === 0x7f) return 'Файл содержит бинарные данные — ожидался текст';
      }
      return null;
    }
    return null; // unknown ext slipped past — handled upstream
  } catch (err) {
    return `Не удалось проверить файл: ${err.message}`;
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

// ── POST /api/cycling/upload ──────────────────────────────────────────
router.post('/upload', auth, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large (max 100 MB)' });
      return res.status(400).json({ error: err.message || 'Upload error' });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Magic-byte content check — reject renamed executables and fake Excels
  const magicErr = verifyMagicBytes(req.file.path, path.extname(req.file.originalname).toLowerCase());
  if (magicErr) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: magicErr });
  }

  const { battery_id, equipment_type, channel, protocol, notes } = req.body;

  if (!battery_id || !Number.isInteger(Number(battery_id))) {
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'battery_id is required' });
  }

  // Verify battery exists
  const batteryCheck = await pool.query('SELECT battery_id FROM batteries WHERE battery_id = $1', [Number(battery_id)]);
  if (batteryCheck.rowCount === 0) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Battery not found' });
  }

  // Track the file's current location throughout the handler — req.file.path
  // gets stale after renameSync, and the cleanup-on-error path needs the
  // up-to-date location to actually delete the orphan.
  let currentFilePath = req.file.path;
  try {
    // Compute SHA-256
    const fileBuffer = fs.readFileSync(currentFilePath);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Check for duplicate
    const dupCheck = await pool.query('SELECT session_id FROM cycling_sessions WHERE file_hash = $1', [fileHash]);
    const isDuplicate = dupCheck.rowCount > 0;

    // Move file to raw/
    const rawFilename = `${Date.now()}_${fileHash.slice(0, 8)}${path.extname(req.file.originalname).toLowerCase()}`;
    const rawPath = path.join(UPLOAD_DIR, rawFilename);
    fs.renameSync(currentFilePath, rawPath);
    currentFilePath = rawPath;

    // Create session
    const sessionResult = await pool.query(`
      INSERT INTO cycling_sessions (battery_id, equipment_type, file_name, file_path, file_hash,
        channel, protocol, notes, status, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'processing', $9)
      RETURNING session_id
    `, [
      Number(battery_id),
      equipment_type || 'generic',
      req.file.originalname,
      rawPath,
      fileHash,
      channel ? Number(channel) : null,
      protocol || null,
      notes || null,
      req.user.userId,
    ]);

    const sessionId = sessionResult.rows[0].session_id;

    // Spawn Python parser in background
    processFile(sessionId, rawPath, equipment_type || 'generic');

    res.status(201).json({
      session_id: sessionId,
      status: 'processing',
      duplicate: isDuplicate,
      duplicate_session_id: isDuplicate ? dupCheck.rows[0].session_id : null,
    });
  } catch (err) {
    // Clean up the orphan file at its ACTUAL current location (could be
    // the processing dir if we failed before rename, or raw/ if we failed
    // during/after rename but before the session INSERT committed).
    try {
      if (fs.existsSync(currentFilePath)) fs.unlinkSync(currentFilePath);
    } catch (cleanupErr) {
      console.error('Cleanup failed for', currentFilePath, ':', cleanupErr.message);
    }
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ── Background file processing ────────────────────────────────────────
async function processFile(sessionId, filePath, format) {
  try {
    const result = await runParser(filePath, format, sessionId);

    if (result.error) {
      await pool.query(
        'UPDATE cycling_sessions SET status = $1, error_message = $2 WHERE session_id = $3',
        ['error', result.error, sessionId]
      );
      return;
    }

    const { datapoints, summary, meta } = result;

    // Bulk insert datapoints (batches of 1000)
    const BATCH_SIZE = 1000;
    for (let i = 0; i < datapoints.length; i += BATCH_SIZE) {
      const batch = datapoints.slice(i, i + BATCH_SIZE);
      const values = [];
      const params = [];
      let paramIdx = 1;

      for (const dp of batch) {
        values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
        params.push(
          sessionId,
          dp.cycle_number ?? 0,
          dp.step_number ?? null,
          dp.step_type ?? null,
          dp.time_s ?? null,
          dp.voltage_v ?? null,
          dp.current_a ?? null,
          dp.capacity_ah ?? null,
          dp.energy_wh ?? null,
          dp.temperature_c ?? null,
        );
      }

      await pool.query(`
        INSERT INTO cycling_datapoints (session_id, cycle_number, step_number, step_type,
          time_s, voltage_v, current_a, capacity_ah, energy_wh, temperature_c)
        VALUES ${values.join(', ')}
      `, params);
    }

    // Insert cycle summary
    for (const s of summary) {
      await pool.query(`
        INSERT INTO cycling_cycle_summary (session_id, cycle_number,
          charge_capacity_ah, discharge_capacity_ah, coulombic_efficiency,
          charge_energy_wh, discharge_energy_wh, max_voltage_v, min_voltage_v,
          avg_temperature_c, duration_s)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (session_id, cycle_number) DO UPDATE SET
          charge_capacity_ah = EXCLUDED.charge_capacity_ah,
          discharge_capacity_ah = EXCLUDED.discharge_capacity_ah,
          coulombic_efficiency = EXCLUDED.coulombic_efficiency
      `, [
        sessionId, s.cycle_number,
        s.charge_capacity_ah, s.discharge_capacity_ah, s.coulombic_efficiency,
        s.charge_energy_wh, s.discharge_energy_wh, s.max_voltage_v, s.min_voltage_v,
        s.avg_temperature_c, s.duration_s,
      ]);
    }

    // Update session
    await pool.query(`
      UPDATE cycling_sessions SET
        status = 'ready',
        total_cycles = $1,
        started_at = $2,
        ended_at = $3
      WHERE session_id = $4
    `, [
      meta.total_cycles || summary.length,
      meta.started_at || null,
      meta.ended_at || null,
      sessionId,
    ]);

  } catch (err) {
    console.error('Process file error:', err);
    await pool.query(
      'UPDATE cycling_sessions SET status = $1, error_message = $2 WHERE session_id = $3',
      ['error', String(err.message || err), sessionId]
    ).catch(() => {});
  }
}

function runParser(filePath, format, sessionId) {
  return new Promise((resolve) => {
    const proc = spawn('python3', [
      PARSER_SCRIPT,
      '--file', filePath,
      '--format', format,
      '--session-id', String(sessionId),
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ error: stderr || `Parser exited with code ${code}` });
        return;
      }
      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          resolve({ error: result.error });
        } else {
          resolve(result);
        }
      } catch (e) {
        resolve({ error: `Failed to parse output: ${e.message}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ error: `Failed to spawn parser: ${err.message}` });
    });
  });
}

// ── GET /api/cycling/sessions ─────────────────────────────────────────
router.get('/sessions', auth, async (req, res) => {
  try {
    const { battery_id, status } = req.query;
    const conditions = [];
    const params = [];

    if (battery_id) {
      params.push(Number(battery_id));
      conditions.push(`cs.battery_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`cs.status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT cs.*,
        u.name AS uploader_name,
        b.form_factor,
        p.name AS project_name
      FROM cycling_sessions cs
      LEFT JOIN users u ON u.user_id = cs.uploaded_by
      LEFT JOIN batteries b ON b.battery_id = cs.battery_id
      LEFT JOIN projects p ON p.project_id = b.project_id
      ${where}
      ORDER BY cs.created_at DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load sessions' });
  }
});

// ── GET /api/cycling/sessions/:id ─────────────────────────────────────
router.get('/sessions/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cs.*,
        u.name AS uploader_name,
        b.form_factor,
        p.name AS project_name
      FROM cycling_sessions cs
      LEFT JOIN users u ON u.user_id = cs.uploaded_by
      LEFT JOIN batteries b ON b.battery_id = cs.battery_id
      LEFT JOIN projects p ON p.project_id = b.project_id
      WHERE cs.session_id = $1
    `, [Number(req.params.id)]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load session' });
  }
});

// ── DELETE /api/cycling/sessions/:id ──────────────────────────────────
router.delete('/sessions/:id', auth, async (req, res) => {
  const sessionId = Number(req.params.id);

  try {
    const session = await pool.query('SELECT uploaded_by, file_path FROM cycling_sessions WHERE session_id = $1', [sessionId]);
    if (session.rowCount === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Only uploader or admin can delete
    if (session.rows[0].uploaded_by !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Delete from DB (CASCADE deletes datapoints + summary)
    await pool.query('DELETE FROM cycling_sessions WHERE session_id = $1', [sessionId]);

    // Don't delete the raw file — keep for audit trail

    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// ── GET /api/cycling/sessions/:id/summary ─────────────────────────────
router.get('/sessions/:id/summary', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM cycling_cycle_summary
      WHERE session_id = $1
      ORDER BY cycle_number
    `, [Number(req.params.id)]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load summary' });
  }
});

// ── GET /api/cycling/sessions/:id/cycles/:cycle ───────────────────────
router.get('/sessions/:id/cycles/:cycle', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT time_s, voltage_v, current_a, capacity_ah, energy_wh, temperature_c, step_type
      FROM cycling_datapoints
      WHERE session_id = $1 AND cycle_number = $2
      ORDER BY time_s
    `, [Number(req.params.id), Number(req.params.cycle)]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load cycle data' });
  }
});

// ── GET /api/cycling/sessions/:id/datapoints ──────────────────────────
router.get('/sessions/:id/datapoints', auth, async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const fromCycle = Number(req.query.from_cycle) || 0;
    const toCycle = Number(req.query.to_cycle) || 999999;
    const downsample = Math.min(Number(req.query.downsample) || 500, 2000);

    // Get total count for this range
    const countResult = await pool.query(`
      SELECT count(*) AS total FROM cycling_datapoints
      WHERE session_id = $1 AND cycle_number >= $2 AND cycle_number <= $3
    `, [sessionId, fromCycle, toCycle]);
    const total = Number(countResult.rows[0].total);

    // If total is small enough, return all
    if (total <= downsample * (toCycle - fromCycle + 1)) {
      const result = await pool.query(`
        SELECT cycle_number, time_s, voltage_v, current_a, capacity_ah, step_type
        FROM cycling_datapoints
        WHERE session_id = $1 AND cycle_number >= $2 AND cycle_number <= $3
        ORDER BY cycle_number, time_s
      `, [sessionId, fromCycle, toCycle]);
      return res.json(result.rows);
    }

    // Downsample using nth-row selection
    const nth = Math.ceil(total / (downsample * (toCycle - fromCycle + 1)));
    const result = await pool.query(`
      SELECT cycle_number, time_s, voltage_v, current_a, capacity_ah, step_type
      FROM (
        SELECT *, row_number() OVER (ORDER BY cycle_number, time_s) AS rn
        FROM cycling_datapoints
        WHERE session_id = $1 AND cycle_number >= $2 AND cycle_number <= $3
      ) sub
      WHERE rn % $4 = 0
      ORDER BY cycle_number, time_s
    `, [sessionId, fromCycle, toCycle, nth]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load datapoints' });
  }
});

// ── GET /api/cycling/sessions/:id/export ──────────────────────────────
router.get('/sessions/:id/export', auth, async (req, res) => {
  try {
    const sessionId = Number(req.params.id);

    const session = await pool.query('SELECT file_name FROM cycling_sessions WHERE session_id = $1', [sessionId]);
    if (session.rowCount === 0) return res.status(404).json({ error: 'Session not found' });

    const result = await pool.query(`
      SELECT cycle_number, step_number, step_type, time_s, voltage_v,
             current_a, capacity_ah, energy_wh, temperature_c
      FROM cycling_datapoints
      WHERE session_id = $1
      ORDER BY cycle_number, time_s
    `, [sessionId]);

    // CSV export
    const header = 'cycle,step,step_type,time_s,voltage_v,current_a,capacity_ah,energy_wh,temperature_c';
    const rows = result.rows.map(r =>
      [r.cycle_number, r.step_number, r.step_type, r.time_s, r.voltage_v,
       r.current_a, r.capacity_ah, r.energy_wh, r.temperature_c].join(',')
    );

    const baseName = path.basename(session.rows[0].file_name || `session_${sessionId}`, path.extname(session.rows[0].file_name || ''));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}_export.csv"`);
    res.send(header + '\n' + rows.join('\n'));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Export failed' });
  }
});

module.exports = router;
