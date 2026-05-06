# Upload Storage Transition Plan

Created: 2026-05-06
Edited: 2026-05-06
Status: future idea
Verified against code: light check 2026-05-06
Source paths: `app.js`, `routes/batteries.js`, `routes/cycling.js`, `public/js/3-batteries.js`, `client-web/src/components/BatteryElectrochemEditor.vue`, `uploads/`

This is a proposed transition, not current behavior. Current `app.js` still serves
`/uploads` statically, and vanilla battery electrochem links still use
`battery_electrochem.file_link` directly. Separator, electrolyte, and material
attachments already use authenticated download routes because those files are
DB-backed. Battery electrochemistry and cycling raw files remain the disk-backed
areas that need the transition below.

Purpose: make file storage predictable, secure, and easy to back up without breaking the working vanilla app.

This document is written as an implementation handoff for an agent. Follow it carefully and keep changes small.

## Current Situation

The app currently has two file-storage patterns.

### DB-backed attachments

These files are stored directly in PostgreSQL as `BYTEA` and downloaded through authenticated API routes.

- Material source-info files
  - Tables/routes: `material_source_files`, `/api/materials/source-files/:fileId/download`
- Material property/detail files
  - Tables/routes: `material_property_files`, `/api/materials/property-files/:fileId/download`
- Separator files
  - Tables/routes: `separator_files`, `/api/separators/files/:fileId/download`
- Electrolyte files
  - Tables/routes: `electrolyte_files`, `/api/electrolytes/files/:fileId/download`
- Feedback attachments
  - Table/routes: `feedback_attachments`, `/api/feedback/attachments/:id/download`

This pattern is good for small reference documents, certificates, spec sheets, and other files that should travel with DB backups.

### Disk-backed raw files

These files are stored on disk under `uploads/`, while the DB stores metadata and a path.

- Battery electrochemistry files
  - Directory: `uploads/electrochem/`
  - Table: `battery_electrochem`
  - Current DB columns include `file_name`, `file_link`, `electrochem_notes`
- Cycling raw files
  - Directories: `uploads/cycling/raw/`, `uploads/cycling/processing/`
  - Table: `cycling_sessions`
  - Current DB columns include `file_name`, `file_path`, `file_hash`

Disk storage is reasonable for large raw instrument files, but these files should not be exposed by public static hosting.

## Problem

`app.js` currently exposes the full `uploads/` directory:

```js
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
```

That means a disk-backed upload can be opened directly by URL if the path is known. This bypasses normal API permission checks.

The transition goal is not to move every file into the DB. The goal is to make the storage rule explicit and make disk-backed files private by default.

## Target Policy

Use this rule going forward:

- Store small reference/catalog attachments in the DB.
- Store large raw experiment/instrument files on disk.
- Never expose private uploaded files through public static `/uploads`.
- Download every uploaded file through an authenticated API route.
- Keep DB rows as the source of truth for file metadata.
- Keep disk cleanup best-effort: deleting the DB row should try to delete the disk file, but a missing disk file should not crash normal delete behavior.

## Do Not Change Yet

Do not change schema unless strictly necessary.

Do not rewrite all upload systems into one abstraction in the first pass.

Do not move existing DB-backed files out of the DB.

Do not move cycling raw files into the DB.

Do not break the vanilla HTML pages. Vanilla is the primary production UI right now.

## Implementation Scope

The first transition should do three things:

1. Stop public static exposure of `uploads/`.
2. Add authenticated download routes for disk-backed battery electrochemistry files.
3. Update vanilla and Vue consumers to use the authenticated download URL instead of `file_link`.

Cycling raw files are parsed by the backend and may not need a user-facing raw-file download immediately. If a raw cycling download UI exists or is added later, it must use the same authenticated route pattern.

## Step 1: Remove Static Upload Exposure

File:

- `app.js`

Change:

- Remove or comment out:

```js
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
```

Preferred replacement comment:

```js
// Uploaded lab files are private. Serve them only through authenticated
// API download routes, not as public static files.
```

Important:

- Keep `app.use(express.static('public'))`.
- Do not remove static hosting for the vanilla UI.

## Step 2: Add Authenticated Battery Electrochemistry Download Route

Files:

- `routes/batteries.js`
- `services/batteryElectrochemService.js`

Add a service helper similar to:

```js
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
```

Add a route:

```js
router.get('/battery_electrochem/:electrochem_id/download', auth, async (req, res) => {
  // validate id
  // fetch row
  // verify row exists and has file_link
  // verify file_link starts with /uploads/electrochem/
  // resolve absolute path under uploads/electrochem
  // prevent path traversal
  // send file with res.download or res.sendFile
});
```

Path safety requirements:

- Extract only the stored basename from `file_link`.
- Resolve against the expected upload directory.
- Reject any path that escapes the expected upload directory.
- Return `404` if the row or disk file does not exist.
- Return `400` if the row exists but has no file attached because notes-only electrochem rows are allowed.

Suggested download behavior:

```js
res.download(absolutePath, file.file_name || `electrochem_${electrochemId}`);
```

Keep notes-only rows working.

## Step 3: Return Download URLs From Battery Electrochem API

Files:

- `services/batteryElectrochemService.js`
- possibly `routes/batteries.js`

Where `fetchBatteryElectrochem()` returns rows, include a computed `download_url` for rows with a file.

Example:

```js
function addElectrochemDownloadUrl(row) {
  return {
    ...row,
    download_url: row.file_link
      ? `/api/batteries/battery_electrochem/${row.battery_electrochem_id}/download`
      : null
  };
}
```

Return `download_url` from:

- `GET /api/batteries/battery_electrochem/:battery_id`
- `POST /api/batteries/battery_electrochem`
- any PATCH/update route that returns electrochem rows

Do not remove `file_link` in the first pass if current UI expects it. Keep it for backward compatibility, but stop using it in UI.

## Step 4: Update Battery UI Links

Files to inspect and update:

- `public/js/3-batteries.js`
- `client-web/src/components/BatteryElectrochemEditor.vue`

Rule:

- If a row has `download_url`, use it.
- Do not render direct `/uploads/electrochem/...` links.

Vanilla links should look like regular file links/buttons but point to the API URL.

Example logic:

```js
const href = row.download_url || '#';
```

If no file is attached, render only the notes/status, not an empty download link.

## Step 5: Decide Whether Cycling Raw File Download Is Needed

Files:

- `routes/cycling.js`
- `client-web/src/pages/CyclingPage.vue`

Check whether the UI exposes raw uploaded cycling files for download.

If yes:

- Add an authenticated route such as:

```txt
GET /api/cycling/sessions/:session_id/raw-file
```

Route requirements:

- `auth`
- verify session exists
- verify `file_path` exists
- prevent path traversal
- send/download file

If no user-facing raw download exists:

- Do not add the route yet.
- Keep cycling file paths backend-only.

## Step 6: Keep DB-backed Attachments As They Are

Do not rewrite these in the first pass:

- `material_source_files`
- `material_property_files`
- `separator_files`
- `electrolyte_files`
- `feedback_attachments`

They already download through authenticated API routes and do not rely on `/uploads`.

Only review them for consistent headers:

- `Content-Type`
- `Content-Disposition`
- sensible filename

## Step 7: Update API Contract

Files:

- `contracts/vanilla_api_endpoints.json`
- `scripts/check_vanilla_api_contract.js` only if the checker needs a new pattern

Add the new battery electrochemistry download endpoint:

```txt
GET /api/batteries/battery_electrochem/:electrochem_id/download
```

If a cycling raw-file download route is added, add it too.

## Step 8: Update Smoke Tests

File:

- `scripts/smoke_vanilla_api.js`

Add a small check that proves:

- electrochemistry notes-only save still works
- electrochemistry file save still works
- returned row includes `download_url`
- direct `/uploads/electrochem/...` is not required by the UI
- authenticated download endpoint returns the file

Do not require public `/uploads/...` to work.

If the test currently assumes `/uploads` is public, change that assumption.

## Step 9: Manual Browser Test

Test in vanilla:

1. Login.
2. Open Batteries page.
3. Select or create a battery.
4. Add electrochemistry notes without a file.
5. Confirm notes save and reload.
6. Add a small text file.
7. Confirm file appears in the electrochemistry list.
8. Click/download the file.
9. Confirm the download works through `/api/batteries/.../download`.
10. Confirm the UI no longer depends on a visible `/uploads/electrochem/...` URL.

Test that existing DB-backed attachments still work:

1. Open Materials source-info.
2. Upload/download a source file.
3. Open Materials properties/details.
4. Upload/download a property file.
5. Open Separators.
6. Upload/download a separator file.
7. Open Electrolytes.
8. Upload/download an electrolyte file.

## Step 10: Verification Commands

Run:

```bash
node --check app.js
node --check routes/batteries.js
node --check services/batteryElectrochemService.js
node --check public/js/3-batteries.js
npm run contract:vanilla
npm run smoke:vanilla
```

If Vue code changed, also run:

```bash
npm --prefix client-web run build
```

## Migration Notes

No DB migration should be needed for the first pass.

Existing `battery_electrochem.file_link` values can remain as-is. They become internal storage references rather than public links.

Existing files under `uploads/electrochem/` should not be moved.

If future policy requires a cleaner schema, a later migration can rename `file_link` to `storage_path`, but do not do that in this first transition.

## Git Hygiene

Recommended branch name:

```bash
feature/private-upload-downloads
```

Suggested commit message:

```txt
Serve uploaded lab files through authenticated routes
```

## Acceptance Criteria

The transition is complete when:

- Public static `/uploads` is no longer required for app behavior.
- Battery electrochemistry files download through an authenticated API route.
- DB-backed files still upload/download normally.
- Notes-only battery electrochemistry rows still work.
- Vanilla contract and smoke tests pass.
- Vue build passes if Vue code changed.
- No schema changes were introduced unless explicitly approved.
