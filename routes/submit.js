const { Router } = require('express');
const pool = require('../db/pool');
const { auth } = require('../middleware/auth');
const { ajv } = require('../middleware/validate');

const router = Router();

// Schema selection: contract_version → JSON Schema
const schemas = {
  'tape_prepare.v1': require('../contracts/tape_prepare.v1.json'),
  'electrode_cut.v1': require('../contracts/electrode_cut.v1.json'),
  'battery_assembly.v1': require('../contracts/battery_assembly.v1.json'),
};

// Compile all schemas upfront
const validators = {};
for (const [version, schema] of Object.entries(schemas)) {
  validators[version] = ajv.compile(schema);
}

// POST /api/submit (requires auth)
// Append-only: inserts into raw_submissions, never updates or deletes
router.post('/', auth, async (req, res) => {
  const { contract_version, submission_id, checksum } = req.body;

  // Check contract_version is known
  if (!contract_version || !validators[contract_version]) {
    return res.status(400).json({
      error: 'Unknown contract_version',
      known: Object.keys(schemas)
    });
  }

  // Validate against schema
  const valid = validators[contract_version](req.body);
  if (!valid) {
    return res.status(400).json({
      error: 'Validation failed',
      details: validators[contract_version].errors
    });
  }

  try {
    // Check for duplicates (submission_id + checksum)
    const dupCheck = await pool.query(
      'SELECT 1 FROM raw_submissions WHERE submission_id = $1 AND checksum = $2',
      [submission_id, checksum]
    );

    if (dupCheck.rowCount > 0) {
      return res.status(409).json({ error: 'Duplicate submission' });
    }

    // Insert into raw_submissions (append-only)
    const result = await pool.query(
      `INSERT INTO raw_submissions
       (submission_id, submission_type, contract_version, payload, checksum, submitted_by, source, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'accepted')
       RETURNING id, submission_id, status`,
      [
        submission_id,
        req.body.submission_type,
        contract_version,
        JSON.stringify(req.body),
        checksum,
        req.user.userId,
        'excel'
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    // UNIQUE constraint violation (race condition on duplicate)
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Duplicate submission' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
