#!/usr/bin/env node
/**
 * One-off cleanup: delete drifted tape_recipe_line_actuals rows.
 *
 * A row is "drifted" when its recipe_line belongs to a recipe the tape no
 * longer uses (tape_recipe_lines.tape_recipe_id ≠ tapes.tape_recipe_id).
 * This happened when a tape's recipe was changed after weighing actuals
 * were saved — updateTape now guards against it (409 + confirmed delete),
 * so this script only mops up rows created before the guard existed.
 *
 * Drifted rows are invisible to the UI and all reports (every query joins
 * actuals through the CURRENT recipe's lines) but keep blocking
 * material-instance deletion and misrepresent material consumption.
 *
 * Usage:
 *   node scripts/cleanup_stale_tape_actuals.js           # dry run: list only
 *   node scripts/cleanup_stale_tape_actuals.js --apply   # backup + delete
 *
 * Before deleting, the full rows are written as JSON to
 * sql_backups/stale_tape_actuals_<timestamp>.json (sql_backups/ is
 * gitignored). Restore by INSERTing the saved rows back.
 */

const fs = require('fs')
const path = require('path')
const pool = require('../db')

const APPLY = process.argv.includes('--apply')

async function main() {
  const { rows } = await pool.query(`
    SELECT
      a.*,
      t.tape_recipe_id AS tape_current_recipe_id,
      l.tape_recipe_id AS line_recipe_id
    FROM tape_recipe_line_actuals a
    JOIN tapes t USING (tape_id)
    JOIN tape_recipe_lines l ON l.recipe_line_id = a.recipe_line_id
    WHERE l.tape_recipe_id IS DISTINCT FROM t.tape_recipe_id
    ORDER BY a.actual_id
  `)

  if (rows.length === 0) {
    console.log('No drifted actuals found — nothing to do.')
    return
  }

  console.log(`Found ${rows.length} drifted actual(s):`)
  for (const r of rows) {
    console.log(
      `  actual_id=${r.actual_id} tape_id=${r.tape_id} ` +
      `line_recipe=${r.line_recipe_id} tape_recipe=${r.tape_current_recipe_id} ` +
      `instance=${r.material_instance_id} mode=${r.measure_mode} ` +
      `mass_g=${r.actual_mass_g} volume_ml=${r.actual_volume_ml}`
    )
  }

  if (!APPLY) {
    console.log('\nDry run — re-run with --apply to back up and delete these rows.')
    return
  }

  const backupDir = path.join(__dirname, '..', 'sql_backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupDir, `stale_tape_actuals_${stamp}.json`)
  fs.writeFileSync(backupPath, JSON.stringify(rows, null, 2))
  console.log(`\nBacked up ${rows.length} row(s) to ${backupPath}`)

  const ids = rows.map((r) => r.actual_id)
  const res = await pool.query(
    'DELETE FROM tape_recipe_line_actuals WHERE actual_id = ANY($1::int[])',
    [ids]
  )
  console.log(`Deleted ${res.rowCount} row(s).`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
