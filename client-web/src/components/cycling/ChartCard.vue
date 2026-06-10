<script setup>
/**
 * ChartCard — карточка графика циклирования: рамка, переключатель фиксации
 * осей (XY/X/Y), кнопки ⚙/сброс-зума/PNG (появляются на ховере), даблклик
 * по полю = сброс зума. Сам график — в слоте.
 *
 * Извлечено из CyclingCharts.vue (механический рефакторинг): раньше эта
 * разметка и CSS дублировались на каждую из 4 карточек.
 */
defineProps({
  // какие режимы фиксации осей предлагает график (Ёмкость: без 'y' —
  // двойная ось Y, независимая панорама Y рассинхронизировала бы КЭ)
  axisModes: { type: Array, default: () => ['xy', 'x', 'y'] },
  axisLock: { type: String, default: 'xy' },
  axisTitle: {
    type: String,
    default: 'Фиксация оси при зуме/панораме · XY — обе · X — только X (Y зафиксирован) · Y — только Y',
  },
  tall: { type: Boolean, default: true },
})

defineEmits(['update:axisLock', 'style-click', 'reset', 'export'])
</script>

<template>
  <div class="chart-card chart-card--wide">
    <div v-if="axisModes?.length" class="chart-axis-lock" :title="axisTitle">
      <button
        v-for="m in axisModes"
        :key="m"
        :class="{ 'is-active': axisLock === m }"
        @click="$emit('update:axisLock', m)"
      >{{ m.toUpperCase() }}</button>
    </div>
    <button class="chart-style-btn" title="Настройки стиля графика" @click="$emit('style-click', $event)">
      <i class="pi pi-sliders-h"></i>
    </button>
    <button class="chart-reset-zoom-btn" title="Сброс зума · колесо — масштаб (где курсор), перетаскивание — панорама" @click="$emit('reset')">
      <i class="pi pi-refresh"></i>
    </button>
    <button class="chart-export-btn" title="Скачать PNG" @click="$emit('export')">
      <i class="pi pi-download"></i>
    </button>
    <div class="chart-wrap" :class="{ 'chart-wrap--tall': tall }" @dblclick="$emit('reset')">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.chart-card {
  border: 1px solid rgba(0, 50, 116, 0.06);
  border-radius: 8px;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.5);
  position: relative;
}
.chart-card--wide { grid-column: 1 / -1; }

.chart-wrap { position: relative; height: 240px; }
.chart-wrap--tall { height: 300px; }

/* Кнопки карточки — правый верхний угол, проявляются на ховере */
.chart-export-btn,
.chart-reset-zoom-btn,
.chart-style-btn {
  position: absolute;
  top: 6px;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid rgba(0, 50, 116, 0.1);
  background: rgba(255, 255, 255, 0.85);
  color: #003274;
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;
  z-index: 2;
}
.chart-export-btn { right: 6px; }
.chart-reset-zoom-btn { right: 38px; }
.chart-style-btn    { right: 70px; }
.chart-card:hover .chart-export-btn,
.chart-card:hover .chart-reset-zoom-btn,
.chart-card:hover .chart-style-btn {
  opacity: 1;
}
.chart-export-btn:hover,
.chart-reset-zoom-btn:hover,
.chart-style-btn:hover {
  background: #003274;
  color: white;
}

/* Переключатель фиксации осей — левый верх, всегда слегка виден */
.chart-axis-lock {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 2;
  display: inline-flex;
  border: 1px solid rgba(0, 50, 116, 0.12);
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.85);
  opacity: 0.5;
  transition: opacity 0.15s ease;
}
.chart-card:hover .chart-axis-lock { opacity: 1; }
.chart-axis-lock button {
  border: none;
  border-right: 1px solid rgba(0, 50, 116, 0.1);
  background: transparent;
  color: rgba(0, 50, 116, 0.6);
  font-size: 10px;
  font-weight: 600;
  font-family: inherit;
  letter-spacing: 0.02em;
  padding: 3px 7px;
  min-width: 22px;
  cursor: pointer;
}
.chart-axis-lock button:last-child { border-right: none; }
.chart-axis-lock button.is-active { background: #003274; color: #fff; }
</style>
