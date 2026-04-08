<script setup>
/**
 * DashboardGraph — Interactive entity relationship graph using Cytoscape.js.
 * Hierarchical layout: Project → Tape → Recipe → ElectrodeBatch → Battery
 * Click → highlight neighbors, double-click → navigate to entity page.
 */
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import cytoscape from 'cytoscape'

const props = defineProps({
  graphData: { type: Object, default: () => ({ nodes: [], edges: [] }) },
})

const emit = defineEmits(['navigate'])
const router = useRouter()
const containerRef = ref(null)
let cy = null
const tooltip = ref({ visible: false, x: 0, y: 0, label: '', type: '', details: '' })

// ── Layout settings (Obsidian-style sliders) ──
const layoutMode = ref('breadthfirst') // 'breadthfirst' | 'cose'
const spacing = ref(90)
const compactness = ref(1.5)

const NODE_COLORS = {
  project: '#003274',
  tape: '#52C9A6',
  recipe: '#6CACE4',
  material: '#8A939D',
  electrode_batch: '#025EA1',
  battery: '#D3A754',
}

const NODE_SHAPES = {
  project: 'diamond',
  tape: 'round-rectangle',
  recipe: 'ellipse',
  material: 'ellipse',
  electrode_batch: 'hexagon',
  battery: 'star',
}

// Hierarchy order for breadthfirst: project first, battery last
const TYPE_DEPTH = { project: 0, tape: 1, recipe: 2, electrode_batch: 3, battery: 4, material: 2 }

const TYPE_LABELS = {
  project: 'Проект',
  tape: 'Лента',
  recipe: 'Рецепт',
  material: 'Материал',
  electrode_batch: 'Партия электродов',
  battery: 'Аккумулятор',
}

function getLayoutConfig() {
  if (layoutMode.value === 'breadthfirst') {
    return {
      name: 'breadthfirst',
      directed: true,
      spacingFactor: spacing.value / 40,
      avoidOverlap: true,
      padding: 30,
      animate: true,
      animationDuration: 600,
      // Roots = projects (top of hierarchy)
      roots: cy ? cy.nodes('[type="project"]') : undefined,
    }
  }
  return {
    name: 'cose',
    animate: true,
    animationDuration: 600,
    nodeRepulsion: spacing.value * 150,
    idealEdgeLength: spacing.value * compactness.value,
    gravity: 0.4 / compactness.value,
    padding: 30,
  }
}

function initCytoscape() {
  if (!containerRef.value) return
  if (cy) cy.destroy()

  const elements = []

  for (const node of props.graphData.nodes) {
    elements.push({
      group: 'nodes',
      data: { id: node.id, label: node.label, type: node.type, ...node.data },
    })
  }

  for (const edge of props.graphData.edges) {
    elements.push({
      group: 'edges',
      data: { source: edge.source, target: edge.target, type: edge.type },
    })
  }

  cy = cytoscape({
    container: containerRef.value,
    elements,
    style: [
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'font-size': '11px',
          'font-family': 'Rosatom, system-ui, sans-serif',
          'text-wrap': 'ellipsis',
          'text-max-width': '90px',
          'text-valign': 'bottom',
          'text-margin-y': 5,
          'color': '#333',
          'width': 32,
          'height': 32,
          'border-width': 2,
          'border-color': '#fff',
          'shadow-blur': 6,
          'shadow-color': 'rgba(0,0,0,0.1)',
          'shadow-offset-x': 0,
          'shadow-offset-y': 2,
        },
      },
      ...Object.entries(NODE_COLORS).map(([type, color]) => ({
        selector: `node[type="${type}"]`,
        style: {
          'background-color': color,
          'shape': NODE_SHAPES[type] || 'ellipse',
          'width': type === 'project' ? 48 : type === 'tape' ? 38 : type === 'battery' ? 34 : 28,
          'height': type === 'project' ? 48 : type === 'tape' ? 38 : type === 'battery' ? 34 : 28,
        },
      })),
      {
        selector: 'edge',
        style: {
          'width': 1.5,
          'line-color': 'rgba(0, 50, 116, 0.15)',
          'target-arrow-color': 'rgba(0, 50, 116, 0.25)',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 0.7,
        },
      },
      { selector: 'edge[type="contains"]', style: { 'line-color': 'rgba(0, 50, 116, 0.2)', 'width': 2 } },
      { selector: 'edge[type="uses_recipe"]', style: { 'line-color': 'rgba(108, 172, 228, 0.35)', 'line-style': 'dashed' } },
      { selector: 'edge[type="assembled_into"]', style: { 'line-color': 'rgba(211, 167, 84, 0.4)', 'width': 2 } },
      { selector: 'edge[type="cut_from"]', style: { 'line-color': 'rgba(2, 94, 161, 0.3)' } },
      // States
      { selector: 'node.highlighted', style: { 'border-width': 3, 'border-color': '#003274', 'overlay-color': '#003274', 'overlay-padding': 5, 'overlay-opacity': 0.08 } },
      { selector: 'node.dimmed', style: { 'opacity': 0.15 } },
      { selector: 'edge.dimmed', style: { 'opacity': 0.06 } },
      { selector: 'edge.highlighted', style: { 'width': 3, 'line-color': 'rgba(0, 50, 116, 0.5)' } },
    ],
    layout: { name: 'preset' }, // layout applied after init
    minZoom: 0.2,
    maxZoom: 4,
    wheelSensitivity: 0.25,
  })

  // Apply layout
  cy.layout(getLayoutConfig()).run()

  // ── Interactions ──
  cy.on('tap', 'node', (evt) => {
    const node = evt.target
    cy.elements().removeClass('highlighted dimmed')
    const neighborhood = node.neighborhood().add(node)
    cy.elements().not(neighborhood).addClass('dimmed')
    neighborhood.addClass('highlighted')
    neighborhood.edges().addClass('highlighted')
  })

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      cy.elements().removeClass('highlighted dimmed')
      tooltip.value.visible = false
    }
  })

  // Double-click → navigate to specific entity
  cy.on('dbltap', 'node', (evt) => {
    const data = evt.target.data()
    navigateToEntity(data.type, data.id)
  })

  cy.on('mouseover', 'node', (evt) => {
    const node = evt.target
    const pos = node.renderedPosition()
    const data = node.data()
    tooltip.value = {
      visible: true,
      x: pos.x + 20,
      y: pos.y - 10,
      label: data.label,
      type: data.type,
      details: formatDetails(data),
    }
    containerRef.value.style.cursor = 'pointer'
  })

  cy.on('mouseout', 'node', () => {
    tooltip.value.visible = false
    if (containerRef.value) containerRef.value.style.cursor = 'default'
  })
}

function navigateToEntity(type, nodeId) {
  const id = nodeId.split('-').slice(1).join('-') // 'tape-5' → '5'
  switch (type) {
    case 'project':       router.push('/reference/projects'); break
    case 'tape':          router.push(`/tapes?select=${id}`); break
    case 'recipe':        router.push('/reference/recipes'); break
    case 'material':      router.push('/reference/materials'); break
    case 'electrode_batch': router.push(`/electrodes/${id}`); break
    case 'battery':       router.push(`/assembly/${id}`); break
  }
}

function formatDetails(data) {
  const parts = []
  if (data.operator) parts.push(`Оператор: ${data.operator}`)
  if (data.status) parts.push(`Статус: ${data.status}`)
  if (data.role) parts.push(`Роль: ${data.role}`)
  if (data.electrodes) parts.push(`Электродов: ${data.electrodes}`)
  if (data.form_factor) parts.push(`Форм-фактор: ${data.form_factor}`)
  return parts.join(' · ')
}

function relayout() {
  if (cy) cy.layout(getLayoutConfig()).run()
}

function fitGraph() {
  if (cy) cy.fit(undefined, 30)
}

function resetHighlight() {
  if (cy) cy.elements().removeClass('highlighted dimmed')
}

function toggleLayout() {
  layoutMode.value = layoutMode.value === 'breadthfirst' ? 'cose' : 'breadthfirst'
  relayout()
}

watch(() => props.graphData, () => {
  nextTick(() => initCytoscape())
}, { deep: true })

onMounted(() => {
  // Delay init to ensure container has dimensions after v-if mount
  setTimeout(() => {
    if (props.graphData.nodes.length > 0) initCytoscape()
  }, 100)
})

onUnmounted(() => { if (cy) cy.destroy() })
</script>

<template>
  <div class="graph-wrapper">
    <!-- Toolbar -->
    <div class="graph-toolbar">
      <button class="graph-btn" @click="fitGraph" title="Вписать в экран"><i class="pi pi-expand"></i></button>
      <button class="graph-btn" @click="resetHighlight" title="Сбросить выделение"><i class="pi pi-replay"></i></button>
      <button class="graph-btn" @click="toggleLayout" :title="layoutMode === 'breadthfirst' ? 'Свободный layout' : 'Иерархический layout'">
        <i :class="layoutMode === 'breadthfirst' ? 'pi pi-objects-column' : 'pi pi-sitemap'"></i>
      </button>

      <div class="graph-slider">
        <span class="slider-label">Расстояние</span>
        <input type="range" v-model.number="spacing" min="20" max="120" @change="relayout" />
      </div>

      <div class="graph-legend">
        <span v-for="(color, type) in NODE_COLORS" :key="type" class="legend-item">
          <span class="legend-dot" :style="{ background: color }"></span>
          {{ TYPE_LABELS[type] || type }}
        </span>
      </div>
    </div>

    <div ref="containerRef" class="graph-container"></div>

    <!-- Tooltip -->
    <div v-if="tooltip.visible" class="graph-tooltip" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
      <div class="tooltip-type">{{ TYPE_LABELS[tooltip.type] || tooltip.type }}</div>
      <div class="tooltip-label">{{ tooltip.label }}</div>
      <div v-if="tooltip.details" class="tooltip-details">{{ tooltip.details }}</div>
      <div class="tooltip-hint">Двойной клик — перейти</div>
    </div>

    <div v-if="!graphData.nodes.length" class="graph-empty">
      <i class="pi pi-sitemap" style="font-size: 2rem; color: #D1D7DE"></i>
      <p>Нет данных для графа</p>
    </div>
  </div>
</template>

<style scoped>
.graph-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 450px;
}

.graph-toolbar {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  right: 0.75rem;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.graph-btn {
  width: 32px;
  height: 32px;
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  color: #003274;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: background 0.15s;
  flex-shrink: 0;
}
.graph-btn:hover { background: rgba(255, 255, 255, 0.98); }

.graph-slider {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 8px;
}
.slider-label { font-size: 11px; color: #6B7280; white-space: nowrap; }
.graph-slider input[type="range"] {
  width: 80px;
  height: 4px;
  accent-color: #003274;
}

.graph-legend {
  display: flex;
  gap: 0.6rem;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 8px;
  font-size: 11px;
  color: #333;
  margin-left: auto;
}
.legend-item { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

.graph-container {
  width: 100%;
  height: 100%;
  min-height: 450px;
}

.graph-tooltip {
  position: absolute;
  z-index: 20;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(10px);
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 8px;
  padding: 8px 12px;
  box-shadow: 0 4px 12px rgba(0, 50, 116, 0.12);
  pointer-events: none;
  max-width: 260px;
}
.tooltip-type { font-size: 10px; text-transform: uppercase; color: rgba(0, 50, 116, 0.5); font-weight: 700; letter-spacing: 0.05em; }
.tooltip-label { font-size: 13px; font-weight: 600; color: #003274; margin: 2px 0; }
.tooltip-details { font-size: 11px; color: #6B7280; }
.tooltip-hint { font-size: 10px; color: #9CA3AF; margin-top: 4px; font-style: italic; }

.graph-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: #6B7280;
  font-size: 14px;
}

@media (max-width: 768px) {
  .graph-legend { display: none; }
  .graph-slider { display: none; }
}
</style>
