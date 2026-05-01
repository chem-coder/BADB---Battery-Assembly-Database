// ─── fileToBase64 — browser file → base64 payload ─────────────────────
// Reads a File/Blob and resolves with the base64-encoded content,
// with the "data:<mime>;base64," prefix stripped (backend expects
// just the payload).
//
// Used by file-upload flows: material source-info/property attachments
// (MaterialsPage) and battery electrochem uploads (G2). Previously
// copy-pasted inline; factored out here so the next upload site
// doesn't paste it a third time.
//
// Size note: FileReader holds the whole file in memory while reading,
// and the base64 string is ~1.34× the raw byte length. With an
// Express JSON body limit of 10 MB (app.js:19), the practical cap for
// a single-file POST is ~7 MB raw. Callers should enforce this
// client-side before calling — otherwise the backend returns 413.

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const commaIdx = result.indexOf(',')
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
