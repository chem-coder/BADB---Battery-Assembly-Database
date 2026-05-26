<script setup>
/**
 * OpenedRecordHeader — sticky header above the opened-record form area.
 *
 * Single place that owns: title, compact meta, dirty flag, action buttons,
 * inline status. Per docs/instructions/vanilla_ui_patterns.md, all visible
 * labels and tooltips are Russian and verbatim:
 *
 *   Сохранить       — Сохранить изменения
 *   Печать          — Печать отчёта
 *   Выйти           — Вернуться к списку, не выходя из аккаунта
 *   Удалить         — Удалить запись
 *
 * Sticky positioning uses CSS `position: sticky; top: 0`. The parent page
 * scrolls the document to top via window.scrollTo when opening a record
 * (see vanilla_ui_patterns.md §"Top-Of-Page Scroll").
 *
 * Inline status uses aria-live="polite" so screen readers announce changes
 * without interrupting other activity.
 */

const props = defineProps({
  title: { type: String, default: '' },
  titlePlaceholder: { type: String, default: 'Новая запись' },
  meta: { type: String, default: '' },
  dirty: { type: Boolean, default: false },
  // status: { message: string, tone: 'ok'|'error'|'info' } | null
  status: { type: Object, default: null },
  showPrint: { type: Boolean, default: false },
  showDelete: { type: Boolean, default: false },
  saveLabel: { type: String, default: 'Сохранить' },
  saveTooltip: { type: String, default: 'Сохранить изменения' },
  deleteLabel: { type: String, default: 'Удалить' },
  deleteTooltip: { type: String, default: 'Удалить запись' },
  printLabel: { type: String, default: 'Печать' },
  printTooltip: { type: String, default: 'Печать отчёта' },
  exitLabel: { type: String, default: 'Выйти' },
  exitTooltip: { type: String, default: 'Вернуться к списку, не выходя из аккаунта' },
  // Disable save while validation is pending or form is incomplete.
  saveDisabled: { type: Boolean, default: false },
});

const emit = defineEmits(['save', 'print', 'exit', 'delete']);

function statusClass(tone) {
  if (tone === 'ok') return 'status-ok';
  if (tone === 'error') return 'status-error';
  return 'status-info';
}
</script>

<template>
  <div class="opened-record-header">
    <div class="header-info">
      <div class="header-title-row">
        <slot name="title">
          <span class="header-title">{{ title || titlePlaceholder }}</span>
        </slot>
        <span v-if="dirty" class="dirty-flag">Не сохранено</span>
      </div>
      <div v-if="meta" class="header-meta">{{ meta }}</div>
    </div>

    <div class="header-actions">
      <button
        type="button"
        class="btn-primary"
        :title="saveTooltip"
        :disabled="saveDisabled"
        @click="emit('save')"
      >
        {{ saveLabel }}
      </button>

      <button
        v-if="showPrint"
        type="button"
        class="btn-secondary"
        :title="printTooltip"
        @click="emit('print')"
      >
        {{ printLabel }}
      </button>

      <button
        type="button"
        class="btn-secondary"
        :title="exitTooltip"
        @click="emit('exit')"
      >
        {{ exitLabel }}
      </button>

      <button
        v-if="showDelete"
        type="button"
        class="btn-danger"
        :title="deleteTooltip"
        @click="emit('delete')"
      >
        {{ deleteLabel }}
      </button>

      <span
        v-if="status"
        class="header-status"
        :class="statusClass(status.tone)"
        aria-live="polite"
      >
        {{ status.message }}
      </span>
    </div>

    <slot />
  </div>
</template>

<style scoped>
.opened-record-header {
  position: sticky;
  top: 0;
  z-index: 5;
  background: white;
  border-bottom: 1px solid rgba(0, 50, 116, 0.15);
  padding: 10px 16px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
}
.header-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.header-title-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}
.header-title {
  font-size: 16px;
  font-weight: 600;
  color: #003274;
}
.dirty-flag {
  font-size: 11px;
  color: #b45309;
  background: #fef3c7;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
}
.header-meta {
  font-size: 12px;
  color: #6B7280;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.btn-primary,
.btn-secondary,
.btn-danger {
  font: inherit;
  padding: 5px 14px;
  border-radius: 3px;
  cursor: pointer;
  border: 1px solid transparent;
}
.btn-primary {
  background: #003274;
  color: white;
  border-color: #003274;
}
.btn-primary:hover:not(:disabled) {
  background: #002558;
}
.btn-primary:disabled {
  background: rgba(0, 50, 116, 0.4);
  cursor: not-allowed;
}
.btn-secondary {
  background: white;
  color: #003274;
  border-color: rgba(0, 50, 116, 0.4);
}
.btn-secondary:hover {
  background: rgba(0, 50, 116, 0.05);
}
.btn-danger {
  background: white;
  color: #b91c1c;
  border-color: rgba(185, 28, 28, 0.4);
}
.btn-danger:hover {
  background: #fef2f2;
}
.header-status {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 3px;
  margin-left: 8px;
}
.status-ok {
  color: #166534;
  background: #f0fdf4;
}
.status-error {
  color: #b91c1c;
  background: #fef2f2;
}
.status-info {
  color: #1e40af;
  background: #eff6ff;
}
</style>
