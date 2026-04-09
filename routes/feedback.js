const express = require('express');
const router = express.Router();
const pool = require('../db');
const { auth } = require('../middleware/auth');

// ── GET /api/feedback — list all feedback ─────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.feedback_id, f.title, f.body, f.category, f.status,
             f.created_at, f.resolved_at,
             u.name AS user_name, u.user_id,
             r.name AS resolved_by_name,
             (SELECT count(*) FROM feedback_attachments a WHERE a.feedback_id = f.feedback_id) AS attachment_count
      FROM feedback f
      LEFT JOIN users u ON u.user_id = f.user_id
      LEFT JOIN users r ON r.user_id = f.resolved_by
      ORDER BY f.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки обратной связи' });
  }
});

// ── POST /api/feedback — create feedback ──────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { title, body, category } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Заголовок обязателен' });

    const result = await pool.query(
      `INSERT INTO feedback (user_id, title, body, category)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.userId, title.trim(), body?.trim() || null, category || 'other']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания' });
  }
});

// ── POST /api/feedback/:id/attachments — upload file ──────────────────
router.post('/:id/attachments', auth, async (req, res) => {
  try {
    const feedbackId = Number(req.params.id);
    const { filename, data, mime_type } = req.body;

    if (!filename || !data) {
      return res.status(400).json({ error: 'filename и data обязательны' });
    }

    const buffer = Buffer.from(data, 'base64');

    const result = await pool.query(
      `INSERT INTO feedback_attachments (feedback_id, filename, original_name, mime_type, size_bytes, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING attachment_id, feedback_id, filename, original_name, mime_type, size_bytes, created_at`,
      [feedbackId, filename, filename, mime_type || 'application/octet-stream', buffer.length, buffer]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

// ── GET /api/feedback/:id/attachments — list attachments ──────────────
router.get('/:id/attachments', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT attachment_id, feedback_id, filename, original_name, mime_type, size_bytes, created_at
       FROM feedback_attachments WHERE feedback_id = $1 ORDER BY created_at`,
      [Number(req.params.id)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки вложений' });
  }
});

// ── GET /api/feedback/attachments/:attachmentId/download ──────────────
router.get('/attachments/:attachmentId/download', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT data, original_name, mime_type FROM feedback_attachments WHERE attachment_id = $1`,
      [Number(req.params.attachmentId)]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Файл не найден' });

    const { data, original_name, mime_type } = result.rows[0];
    res.set('Content-Type', mime_type || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(original_name)}"`);
    res.send(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка скачивания' });
  }
});

// ── PATCH /api/feedback/:id/status — change status (admin/lead) ───────
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const updates = { status };
    if (status === 'resolved' || status === 'closed') {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = req.user.userId;
    }

    const result = await pool.query(
      `UPDATE feedback SET status = $1, resolved_at = $2, resolved_by = $3
       WHERE feedback_id = $4 RETURNING *`,
      [status, updates.resolved_at || null, updates.resolved_by || null, Number(req.params.id)]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Не найдено' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления статуса' });
  }
});

// ── DELETE /api/feedback/:id ──────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM feedback WHERE feedback_id = $1', [Number(req.params.id)]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

module.exports = router;
