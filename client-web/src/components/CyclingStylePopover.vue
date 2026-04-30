<script setup>
/**
 * CyclingStylePopover — per-chart style overrides, scoped to the active
 * preset in the user's style library.
 *
 * Parent controls visibility via ref: parent sets `chartId` + `chartLabel`,
 * then calls `.toggle(event)` on the ref to position the popover.
 *
 * Emits `update(partial)` on every control change; parent persists the
 * change into the active preset via useCyclingStyles().setChartStyle().
 * Emits `reset()` when the user clicks "Сбросить к дефолту".
 *
 * If the active preset is read-only (built-in theme), the controls are
 * disabled and a hint explains how to clone it.
 */
import { ref, computed } from 'vue'
import Popover from 'primevue/popover'
import {
  PALETTES,
  POINT_STYLE_OPTIONS,
} from '@/composables/useCyclingStyles'

const props = defineProps({
  chartId: { type: String, default: '' },
  chartLabel: { type: String, default: '' },
  style: { type: Object, default: () => ({}) },
  readonly: { type: Boolean, default: false },
  presetName: { type: String, default: '' },
})

const emit = defineEmits(['update', 'reset', 'clone'])

const popRef = ref(null)

function toggle(event) {
  popRef.value?.toggle(event)
}
defineExpose({ toggle })

const thicknessOptions = [1, 1.5, 2, 3, 4]

function onPalette(p) { if (!props.readonly) emit('update', { palette: p }) }
function onThickness(t) { if (!props.readonly) emit('update', { borderWidth: t }) }
function onPointStyle(v) { if (!props.readonly) emit('update', { pointStyle: v }) }
function onPointRadius(e) {
  if (props.readonly) return
  const n = Number(e.target.value)
  emit('update', { pointRadius: Number.isFinite(n) ? n : 0 })
}
function onReset() { if (!props.readonly) emit('reset') }
function onClone() { emit('clone') }

const paletteEntries = computed(() => Object.entries(PALETTES).map(([id, p]) => ({ id, ...p })))
</script>

<template>
  <Popover ref="popRef">
    <div class="style-popover" :class="{ 'is-readonly': readonly }">
      <div class="style-popover__head">
        <strong>Настройки:</strong>
        <span>{{ chartLabel || chartId }}</span>
        <span v-if="readonly" class="style-readonly-badge" title="Встроенный пресет защищён от изменений">
          <i class="pi pi-lock"></i> read-only
        </span>
      </div>

      <div v-if="readonly" class="style-readonly-hint">
        Пресет <strong>«{{ presetName }}»</strong> защищён. Чтобы изменить стиль,
        <button class="style-linklike" @click="onClone">сохраните его копию</button>.
      </div>

      <div class="style-row">
        <label class="style-label">Палитра</label>
        <div class="style-palettes">
          <button
            v-for="p in paletteEntries"
            :key="p.id"
            class="style-palette-btn"
            :class="{ 'is-active': style.palette === p.id }"
            :disabled="readonly"
            :title="p.label"
            @click="onPalette(p.id)"
          >
            <span class="style-palette-swatches">
              <span
                v-for="c in p.colors.slice(0, 5)"
                :key="c"
                class="style-palette-swatch"
                :style="{ background: c }"
              ></span>
            </span>
            <span class="style-palette-name">{{ p.label }}</span>
          </button>
        </div>
      </div>

      <div class="style-row">
        <label class="style-label">Толщина</label>
        <div class="style-seg">
          <button
            v-for="t in thicknessOptions"
            :key="t"
            class="style-seg-btn"
            :class="{ 'is-active': Number(style.borderWidth) === t }"
            :disabled="readonly"
            @click="onThickness(t)"
          >{{ t }}</button>
        </div>
      </div>

      <div class="style-row">
        <label class="style-label">Маркер</label>
        <div class="style-seg">
          <button
            v-for="p in POINT_STYLE_OPTIONS"
            :key="p.key"
            class="style-seg-btn style-seg-btn--marker"
            :class="{ 'is-active': style.pointStyle === p.value }"
            :disabled="readonly"
            @click="onPointStyle(p.value)"
            :title="p.key"
          >{{ p.label }}</button>
        </div>
      </div>

      <div class="style-row">
        <label class="style-label">Размер точки
          <span class="style-radius-val">{{ style.pointRadius ?? 0 }}</span>
        </label>
        <input
          type="range"
          min="0"
          max="10"
          step="0.5"
          :value="style.pointRadius ?? 0"
          class="style-radius-slider"
          :disabled="readonly"
          @input="onPointRadius"
        />
      </div>

      <div class="style-popover__foot">
        <button v-if="!readonly" class="style-reset-btn" @click="onReset">Сбросить к дефолту</button>
      </div>
    </div>
  </Popover>
</template>

<style scoped>
.style-popover {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 4px 2px;
  min-width: 300px;
}
.style-popover__head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(0, 50, 116, 0.08);
  font-size: 13px;
  color: #1F2937;
}
.style-popover__head strong { color: #003274; }
.style-readonly-badge {
  margin-left: auto;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(211, 167, 84, 0.15);
  color: #8B6914;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.style-readonly-hint {
  font-size: 11px;
  color: #8B6914;
  padding: 6px 8px;
  background: rgba(211, 167, 84, 0.08);
  border-radius: 5px;
  line-height: 1.4;
}
.style-linklike {
  border: none;
  background: none;
  color: #003274;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  font-size: inherit;
  font-family: inherit;
  text-decoration: underline;
}
.style-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.style-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(0, 50, 116, 0.55);
  display: flex;
  align-items: center;
  gap: 8px;
}
.style-radius-val {
  display: inline-block;
  min-width: 22px;
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(0, 50, 116, 0.08);
  color: #003274;
  font-weight: 600;
  font-size: 11px;
  text-align: center;
  letter-spacing: 0;
  text-transform: none;
}

/* ── Palette picker ── */
.style-palettes {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.style-palette-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1.5px solid rgba(0, 50, 116, 0.15);
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  color: #1F2937;
  transition: all 0.12s ease;
}
.style-palette-btn:hover:not(:disabled):not(.is-active) {
  background: rgba(0, 50, 116, 0.04);
  border-color: rgba(0, 50, 116, 0.3);
}
.style-palette-btn.is-active {
  border-color: #003274;
  background: rgba(0, 50, 116, 0.06);
  color: #003274;
  font-weight: 600;
}
.style-palette-btn:disabled { cursor: not-allowed; opacity: 0.5; }
.style-palette-swatches {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: white;
  border-radius: 3px;
}
.style-palette-swatch {
  width: 14px;
  height: 14px;
  border-radius: 2px;
}
.style-palette-name { flex: 1; text-align: left; }

/* ── Segmented controls (thickness / marker) ── */
.style-seg {
  display: inline-flex;
  border: 1px solid rgba(0, 50, 116, 0.15);
  border-radius: 6px;
  overflow: hidden;
  background: white;
  flex-wrap: wrap;
}
.style-seg-btn {
  min-width: 28px;
  padding: 4px 8px;
  border: none;
  border-right: 1px solid rgba(0, 50, 116, 0.08);
  background: white;
  color: rgba(0, 50, 116, 0.7);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.1s;
}
.style-seg-btn:last-child { border-right: none; }
.style-seg-btn:hover:not(.is-active):not(:disabled) { background: rgba(0, 50, 116, 0.05); }
.style-seg-btn.is-active {
  background: #003274;
  color: white;
  font-weight: 600;
}
.style-seg-btn:disabled { cursor: not-allowed; opacity: 0.5; }
.style-seg-btn--marker { font-size: 13px; line-height: 1; }

.style-radius-slider {
  width: 100%;
  accent-color: #003274;
  cursor: pointer;
}
.style-radius-slider:disabled { cursor: not-allowed; opacity: 0.5; }

.style-popover__foot {
  display: flex;
  justify-content: flex-end;
  padding-top: 6px;
  border-top: 1px solid rgba(0, 50, 116, 0.08);
  min-height: 28px;
}
.style-reset-btn {
  padding: 4px 10px;
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-radius: 6px;
  background: transparent;
  color: #E74C3C;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.style-reset-btn:hover { background: #E74C3C; color: white; }
</style>
