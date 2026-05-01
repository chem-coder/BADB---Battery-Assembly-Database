<script setup>
/**
 * PrintPreviewDialog — modal overlay around an iframe that loads
 * Dalia's `/workflow/*-print.html` pages.
 *
 * Why an in-app overlay instead of `window.open(_blank)`:
 *   - the user keeps context: the underlying constructor / table is
 *     visible behind the dimmed backdrop, no «изолированной системы»
 *     feeling
 *   - no popup blocker / tab-clutter
 *
 * On iframe load we inject a stylesheet that:
 *   - restyles the legacy `<button>` controls so they match the site
 *     (navy primary, glass-card secondary, rounded, sized for touch)
 *   - hides «Закрыть» — Dalia's button calls `window.close()` which
 *     no-ops in an iframe and then falls back to navigating the
 *     iframe to `/workflow/3-batteries.html` (bad UX). The wrapper's
 *     own Esc / dismiss-mask covers closing.
 *   - turns each `.report_section` into a visually-distinct card on a
 *     light grey backdrop so the user can see how the report would
 *     paginate (each section already has `page-break-inside: avoid`,
 *     i.e. it's the natural unit Dalia's CSS treats as one "page").
 *
 * Same-origin iframe → `contentDocument` access is permitted.
 *
 * v-model:visible from parent. Iframe `v-if` unloads on close so
 * memory + auth-token revalidation reset cleanly on the next open.
 */
import { computed, ref } from 'vue'
import Dialog from 'primevue/dialog'

const props = defineProps({
  visible: { type: Boolean, default: false },
  url:     { type: String,  default: '' },
  title:   { type: String,  default: 'Предпросмотр' },
})
const emit = defineEmits(['update:visible'])

const visibleProxy = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
})

const iframeRef = ref(null)

// Inline stylesheet injected into the legacy print page on load.
// Kept here (not in a separate file) so the override travels with
// the component — tweaking print-preview styling shouldn't require
// editing static assets.
const PREVIEW_CSS = `
  /* Light grey paper-tray backdrop so each section card stands out. */
  body {
    background: #f1f3f5 !important;
    padding: 18px 14px 36px !important;
  }

  /* The whole report container loses its old centered max-width box —
     each section becomes its own card instead. */
  .print_report {
    max-width: 880px !important;
    margin: 0 auto !important;
    padding: 0 !important;
    background: transparent !important;
  }

  /* Action toolbar — restyled buttons, matching the rest of the
     site's navy palette. */
  .report_actions {
    margin-bottom: 14px !important;
    display: flex !important;
    gap: 8px !important;
    align-items: center !important;
  }
  .report_actions button {
    appearance: none !important;
    -webkit-appearance: none !important;
    border: none !important;
    border-radius: 6px !important;
    padding: 8px 16px !important;
    font: 500 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI",
            Arial, sans-serif !important;
    cursor: pointer !important;
    transition: background 0.15s, transform 0.05s !important;
  }
  /* Hide Закрыть — broken inside iframe (см. comment вверху файла). */
  #closeReportBtn {
    display: none !important;
  }
  /* Print button = primary navy. */
  #printReportBtn {
    background: #003274 !important;
    color: #fff !important;
    box-shadow: 0 1px 3px rgba(0, 50, 116, 0.20) !important;
  }
  #printReportBtn:hover {
    background: #00254f !important;
  }
  #printReportBtn:active {
    transform: translateY(1px);
  }

  /* Header block: title + meta — float over the first card so the
     report still feels like one document. */
  .print_report > .report_title,
  .print_report > .report_subtitle,
  .print_report > .report_meta {
    margin-left: 12px !important;
    margin-right: 12px !important;
  }
  .print_report > .report_subtitle {
    color: #003274 !important;
  }

  /* Each section becomes its own paper-card. Adds the visual
     "this is one page" cue the user asked for — sections already
     have page-break-inside: avoid, so they're the natural unit. */
  .report_section {
    background: #fff !important;
    border: 1px solid rgba(0, 50, 116, 0.10) !important;
    border-radius: 10px !important;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04),
                0 0 0 1px rgba(0, 50, 116, 0.02) !important;
    margin-top: 14px !important;
    padding: 16px 20px !important;
  }
  .report_section h2 {
    color: #003274 !important;
    border-bottom: 1px solid rgba(0, 50, 116, 0.12) !important;
    padding-bottom: 6px !important;
    margin-bottom: 10px !important;
  }
  .report_subsection h3 {
    color: rgba(0, 50, 116, 0.80) !important;
  }

  /* Tables: keep Dalia's own layout (the print stylesheet sets
     width:100% and border-collapse:collapse) and only re-tint
     borders + the header row to match the SPA palette. Earlier we
     forced table-layout:auto + word-break:break-word +
     overflow-wrap:anywhere, which broke dates/IDs mid-string and
     squished some columns — user reported «автоширина работает
     криво». Reverted to Dalia's natural sizing.

     .report_section no longer has overflow:hidden: the rounded
     corners look slightly less crisp on pathological-width tables,
     but the trade-off was clipping legitimate wide tables. Wide
     tables can extend past the card; long-form rendering wins
     over visual perfection. */
  .report_table th {
    background: rgba(0, 50, 116, 0.06) !important;
    color: #003274 !important;
    font-weight: 600 !important;
  }
  .report_table th,
  .report_table td {
    border-color: rgba(0, 50, 116, 0.12) !important;
  }

  /* Dual-metric tiles: subtle navy accent on the "factual" column. */
  .report_dual_metric {
    border-color: rgba(0, 50, 116, 0.12) !important;
    background: #fff !important;
  }
  .report_dual_col_label.fact {
    color: #003274 !important;
  }
  .report_dual_fact {
    color: #003274 !important;
  }
`

function injectPreviewStyles(doc) {
  if (!doc) return
  // Idempotent: only inject once per iframe document. Re-mounting the
  // iframe (visible toggle) loads a fresh document so the style needs
  // to be re-added; the marker prevents double-injection if `load`
  // fires more than once for the same document.
  if (doc.getElementById('badb-preview-styles')) return
  const style = doc.createElement('style')
  style.id = 'badb-preview-styles'
  style.textContent = PREVIEW_CSS
  doc.head?.appendChild(style)
}

function onIframeLoad() {
  const frame = iframeRef.value
  if (!frame) return
  try {
    // Same-origin (both served by Express on :3003 in prod, proxied
    // via Vite in dev). Throws on cross-origin → caught silently.
    injectPreviewStyles(frame.contentDocument)
  } catch {
    // No-op — print page just renders with its default styling.
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visibleProxy"
    :header="title"
    :style="{ width: '94vw', maxWidth: '1200px', height: '92vh' }"
    :contentStyle="{ padding: '0', display: 'flex', flexDirection: 'column' }"
    modal
    dismissableMask
  >
    <div class="pp-shell">
      <iframe
        v-if="visible && url"
        ref="iframeRef"
        :src="url"
        class="pp-iframe"
        title="Печать"
        @load="onIframeLoad"
      />
    </div>
  </Dialog>
</template>

<style scoped>
.pp-shell {
  flex: 1;
  display: flex;
  background: #f1f3f5;
  min-height: 0;
}
.pp-iframe {
  flex: 1;
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
}
</style>
