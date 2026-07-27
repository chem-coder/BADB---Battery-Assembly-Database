/**
 * Tape print-report URL.
 *
 * Matches vanilla `public/js/1-tapes.js` (getTapePrintReportUrl):
 *   /workflow/tape-print.html?tape_id=<id>
 *
 * Opened in-app via PrintPreviewDialog (same pattern as the electrode-batch and
 * battery print reports), which loads the vanilla print page in an iframe and
 * inherits the shared session.
 */
export function tapePrintUrl(tapeId) {
  return `/workflow/tape-print.html?tape_id=${encodeURIComponent(tapeId)}`
}
