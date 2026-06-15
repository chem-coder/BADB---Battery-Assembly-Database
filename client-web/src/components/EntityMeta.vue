<script setup>
import { formatDateTimeMsk } from '@/utils/dateFormat'

/**
 * EntityMeta — audit footer of an opened record.
 *
 * Distinction (per the project's operator vs creator convention):
 *   - "Заполнил" / "Изменил" → AUDIT info from created_by / updated_by.
 *     Backend always derives these from the JWT. The user CANNOT edit
 *     this. It answers: "who entered or modified this row in the system".
 *   - Form fields like "Оператор" / "Performed by" → BUSINESS fact about
 *     who physically did the work. User-selectable, lives elsewhere in
 *     the form, NOT in this footer.
 */
defineProps({
  createdByName: { type: String, default: null },
  createdAt: { type: String, default: null },
  updatedByName: { type: String, default: null },
  updatedAt: { type: String, default: null },
})
</script>

<template>
  <div class="entity-meta" v-if="createdByName || createdAt || updatedByName || updatedAt">
    <div v-if="createdByName || createdAt" class="entity-meta-line">
      <span class="entity-meta-label">Заполнил:</span>
      <span class="entity-meta-value">{{ createdByName || '—' }}, {{ formatDateTimeMsk(createdAt) }} <span class="tz">МСК</span></span>
    </div>
    <div v-if="updatedByName || updatedAt" class="entity-meta-line">
      <span class="entity-meta-label">Изменил:</span>
      <span class="entity-meta-value">{{ updatedByName || '—' }}, {{ formatDateTimeMsk(updatedAt) }} <span class="tz">МСК</span></span>
    </div>
  </div>
</template>

<style scoped>
.entity-meta {
  padding: 8px 16px;
  border-top: 1px solid rgba(0, 50, 116, 0.08);
  font-size: 12px;
  color: #6B7280;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.entity-meta-label {
  font-weight: 600;
  margin-right: 4px;
}
.entity-meta-value {
  color: #8A939D;
}
.tz {
  font-size: 10px;
  font-weight: 600;
  color: rgba(0, 50, 116, 0.45);
  margin-left: 2px;
  letter-spacing: 0.02em;
}
</style>
