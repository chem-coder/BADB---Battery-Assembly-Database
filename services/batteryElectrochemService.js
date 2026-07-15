const fs = require('fs/promises');
const path = require('path');

const ELECTROCHEM_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'electrochem');

// Uploaded lab files are private (no public /uploads static since R1) —
// every row with a file gets a computed download_url pointing at the
// authenticated API route. file_link stays in the payload as an internal
// storage reference for backward compatibility, but UIs must not use it
// as an href anymore.
function addElectrochemDownloadUrl(row) {
  return {
    ...row,
    download_url: row.file_link
      ? `/api/batteries/battery_electrochem/${row.battery_electrochem_id}/download`
      : null
  };
}

async function fetchBatteryElectrochem(pool, batteryId) {
  const result = await pool.query(
    `
    SELECT
      battery_electrochem_id,
      battery_id,
      file_name,
      file_link,
      electrochem_notes,
      uploaded_at
    FROM battery_electrochem
    WHERE battery_id = $1
    ORDER BY battery_electrochem_id
    `,
    [batteryId]
  );

  return result.rows.length === 0 ? null : result.rows.map(addElectrochemDownloadUrl);
}

// Fetch one electrochem row for the authenticated download route.
async function getBatteryElectrochemFile(pool, electrochemId) {
  const result = await pool.query(
    `
    SELECT
      battery_electrochem_id,
      battery_id,
      file_name,
      file_link
    FROM battery_electrochem
    WHERE battery_electrochem_id = $1
    `,
    [electrochemId]
  );

  return result.rows[0] || null;
}

// Resolve a stored file_link to a safe absolute path under
// uploads/electrochem/, or null if the link is missing/escapes the dir.
// Same defense-in-depth traversal guard as the delete path below.
function resolveElectrochemAbsolutePath(link) {
  if (typeof link !== 'string' || !link.startsWith('/uploads/electrochem/')) {
    return null;
  }
  const fileName = link.replace(/^\/uploads\/electrochem\//, '');
  const absolutePath = path.join(ELECTROCHEM_UPLOAD_DIR, path.basename(fileName));
  const expectedRoot = path.resolve(ELECTROCHEM_UPLOAD_DIR);
  const resolvedPath = path.resolve(absolutePath);
  if (resolvedPath !== expectedRoot && resolvedPath.startsWith(expectedRoot + path.sep)) {
    return resolvedPath;
  }
  return null;
}

async function saveBatteryElectrochem(pool, batteryId, entries = [], notes = null) {
  const cleanNotes = typeof notes === 'string' && notes.trim()
    ? notes.trim()
    : null;
  const normalizedEntries = Array.isArray(entries) ? entries : [];

  if (normalizedEntries.length === 0 && cleanNotes) {
    await pool.query(
      `
      INSERT INTO battery_electrochem (
        battery_id,
        file_name,
        file_link,
        electrochem_notes
      )
      VALUES ($1,$2,$3,$4)
      `,
      [
        batteryId,
        null,
        null,
        cleanNotes
      ]
    );

    return (await fetchBatteryElectrochem(pool, batteryId)) || [];
  }

  await fs.mkdir(ELECTROCHEM_UPLOAD_DIR, { recursive: true });

  for (const entry of normalizedEntries) {
    const originalName = entry.file_name || 'electrochem_file';
    const safeName = String(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
    const relativePath = `/uploads/electrochem/${storedName}`;
    const absolutePath = path.join(ELECTROCHEM_UPLOAD_DIR, storedName);

    if (!entry.file_content_base64) {
      throw new Error('Не передано содержимое файла');
    }

    const buffer = Buffer.from(entry.file_content_base64, 'base64');
    await fs.writeFile(absolutePath, buffer);

    await pool.query(
      `
      INSERT INTO battery_electrochem (
        battery_id,
        file_name,
        file_link,
        electrochem_notes
      )
      VALUES ($1,$2,$3,$4)
      `,
      [
        batteryId,
        originalName,
        relativePath,
        entry.electrochem_notes || cleanNotes
      ]
    );
  }

  return (await fetchBatteryElectrochem(pool, batteryId)) || [];
}

// Delete a single battery_electrochem row + its file on disk.
//
// Disk cleanup is best-effort: if the DB row is removed successfully we try
// to unlink the file under uploads/electrochem/ but swallow ENOENT and
// other filesystem errors — the row is the source of truth; a missing file
// behind a deleted row is harmless, and the directory is app-owned so no
// path-traversal concern beyond the file_link we stored ourselves.
//
// Throws a 404-shaped error if no row matched.
async function deleteBatteryElectrochemFileLink(link) {
  if (typeof link !== 'string' || !link.startsWith('/uploads/electrochem/')) {
    return;
  }

  const fileName = link.replace(/^\/uploads\/electrochem\//, '');
  const absolutePath = path.join(ELECTROCHEM_UPLOAD_DIR, fileName);

  // Defense-in-depth path traversal check: if file_link in the DB was
  // tampered (e.g. "/uploads/electrochem/../../etc/passwd"), path.join
  // would normalize the .. and escape ELECTROCHEM_UPLOAD_DIR. Reject
  // any resolved path that doesn't stay inside the expected directory.
  // Practical attack requires direct DB compromise — the API path
  // (saveBatteryElectrochem) sanitizes filenames via regex — but a small
  // guard here costs nothing and stops a class of mistake outright.
  const expectedRoot = path.resolve(ELECTROCHEM_UPLOAD_DIR);
  const resolvedPath = path.resolve(absolutePath);

  if (resolvedPath === expectedRoot || resolvedPath.startsWith(expectedRoot + path.sep)) {
    await fs.unlink(resolvedPath).catch(() => {
      // File already gone or permission — not fatal, DB row is the source of truth.
    });
  }
  // else: refuse to unlink — file_link escaped the upload dir.
}

async function deleteBatteryElectrochemFileLinks(links) {
  const uniqueLinks = [...new Set((Array.isArray(links) ? links : []).filter(Boolean))];

  await Promise.all(uniqueLinks.map(deleteBatteryElectrochemFileLink));
}

async function deleteBatteryElectrochem(pool, electrochemId) {
  const result = await pool.query(
    `
    DELETE FROM battery_electrochem
    WHERE battery_electrochem_id = $1
    RETURNING battery_electrochem_id, file_link
    `,
    [electrochemId]
  );

  if (!result.rowCount) {
    const err = new Error('Файл не найден');
    err.statusCode = 404;
    throw err;
  }

  await deleteBatteryElectrochemFileLink(result.rows[0].file_link);

  return { deleted: true, battery_electrochem_id: electrochemId };
}

module.exports = {
  deleteBatteryElectrochem,
  deleteBatteryElectrochemFileLinks,
  fetchBatteryElectrochem,
  getBatteryElectrochemFile,
  resolveElectrochemAbsolutePath,
  saveBatteryElectrochem
};
