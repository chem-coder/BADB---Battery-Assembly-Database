<script setup>
/**
 * DashboardGraph — Interactive entity relationship graph (Cytoscape.js).
 *
 * Features:
 *  - Dagre hierarchical layout (LR production flow)
 *  - Info panel (right side, node details + neighbors)
 *  - Radial context menu (cxtmenu)
 *  - Edge labels
 *  - Compound nodes (group by project)
 *  - Canvas minimap
 *  - Path tracing between two nodes
 *  - Focus on project subtree
 *  - Type filters + search (Obsidian-style)
 */
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import cytoscape from 'cytoscape'
import dagre from 'cytoscape-dagre'
import cxtmenu from 'cytoscape-cxtmenu'

cytoscape.use(dagre)
cytoscape.use(cxtmenu)

const props = defineProps({
  graphData: { type: Object, default: () => ({ nodes: [], edges: [] }) },
})

const router = useRouter()
const containerRef = ref(null)
const minimapRef = ref(null)
let cy = null
let _minimapTimer = null

// ── State ──
const spacing = ref(80)
const searchQuery = ref('')
const selectedNode = ref(null)
const pathMode = ref(false)
const pathNodeA = ref(null)

const visibleTypes = ref({
  project: true,
  material: true,
  recipe: true,
  tape: true,
  electrode_batch: true,
  separator: true,
  sep_structure: false,
  electrolyte: true,
  battery: true,
})

// ── Constants ──
const NODE_COLORS = {
  project: '#003274',
  material: '#8A939D',
  recipe: '#6CACE4',
  tape: '#52C9A6',
  electrode_batch: '#025EA1',
  separator: '#9B59B6',
  sep_structure: '#8E7CC3',
  electrolyte: '#E67E22',
  battery: '#D3A754',
}

const NODE_SHAPES = {
  project: 'diamond',
  material: 'ellipse',
  recipe: 'round-rectangle',
  tape: 'round-rectangle',
  electrode_batch: 'hexagon',
  separator: 'round-triangle',
  sep_structure: 'round-triangle',
  electrolyte: 'ellipse',
  battery: 'star',
}

const TYPE_LABELS = {
  project: 'Проект',
  material: 'Материал',
  recipe: 'Рецепт',
  tape: 'Лента',
  electrode_batch: 'Электроды',
  separator: 'Сепаратор',
  sep_structure: 'Структура сеп.',
  electrolyte: 'Электролит',
  battery: 'Аккумулятор',
}

const EDGE_LABELS = {
  contains: 'содержит',
  uses_recipe: 'рецепт',
  cut_from: 'нарезка',
  assembled_into: 'сборка',
  source_tape: 'лента',
  has_structure: 'структура',
}

const DETAIL_LABELS = {
  operator: 'Оператор',
  status: 'Статус',
  role: 'Роль',
  electrodes: 'Электродов',
  form_factor: 'Форм-фактор',
  type: 'Тип',
}

// ── Layout ──
function getLayoutConfig() {
  return {
    name: 'dagre',
    rankDir: 'TB',
    nodeSep: 40,
    rankSep: spacing.value,
    edgeSep: 10,
    animate: true,
    animationDuration: 400,
    padding: 30,
  }
}

// ── Init ──
function initCytoscape() {
  if (!containerRef.value) return
  if (cy) cy.destroy()

  const elements = []
  const projectIds = new Set()

  // Collect project IDs for compound grouping
  for (const node of props.graphData.nodes) {
    if (node.type === 'project') projectIds.add(node.id)
  }

  // Add nodes with parent assignment for compound grouping
  for (const node of props.graphData.nodes) {
    const el = {
      group: 'nodes',
      data: { id: node.id, label: node.label, type: node.type, ...node.data },
    }
    // Tapes and batteries belong to projects → set parent for compound grouping
    if ((node.type === 'tape' || node.type === 'battery') && node.data?.project_id) {
      const parentId = `project-${node.data.project_id}`
      if (projectIds.has(parentId)) el.data.parent = parentId
    }
    elements.push(el)
  }

  for (const edge of props.graphData.edges) {
    elements.push({
      group: 'edges',
      data: {
        source: edge.source,
        target: edge.target,
        type: edge.type,
        label: EDGE_LABELS[edge.type] || '',
      },
    })
  }

  cy = cytoscape({
    container: containerRef.value,
    elements,
    style: [
      // Base node style
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'font-size': '10px',
          'font-family': 'Rosatom, system-ui, sans-serif',
          'text-wrap': 'ellipsis',
          'text-max-width': '85px',
          'text-valign': 'bottom',
          'text-margin-y': 4,
          'color': '#333',
          'width': 28,
          'height': 28,
          'border-width': 2,
          'border-color': '#fff',
        },
      },
      // Type-specific styles
      ...Object.entries(NODE_COLORS).map(([type, color]) => ({
        selector: `node[type="${type}"]`,
        style: {
          'background-color': color,
          'shape': NODE_SHAPES[type] || 'ellipse',
          'width': type === 'project' ? 44 : type === 'tape' ? 36 : type === 'battery' ? 32 : 26,
          'height': type === 'project' ? 44 : type === 'tape' ? 36 : type === 'battery' ? 32 : 26,
        },
      })),
      // Compound parent nodes (project groups)
      {
        selector: ':parent',
        style: {
          'background-opacity': 0.03,
          'border-width': 1.5,
          'border-color': 'rgba(0, 50, 116, 0.12)',
          'border-style': 'dashed',
          'label': 'data(label)',
          'text-valign': 'top',
          'text-halign': 'center',
          'font-size': '11px',
          'font-weight': 600,
          'color': 'rgba(0, 50, 116, 0.4)',
          'padding': 20,
          'shape': 'round-rectangle',
        },
      },
      // Edge styles with labels
      {
        selector: 'edge',
        style: {
          'width': 1,
          'line-color': 'rgba(0, 50, 116, 0.10)',
          'target-arrow-color': 'rgba(0, 50, 116, 0.15)',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 0.6,
          'opacity': 0.5,
          'label': 'data(label)',
          'font-size': '8px',
          'color': 'rgba(0, 50, 116, 0.3)',
          'text-rotation': 'autorotate',
          'text-margin-y': -8,
        },
      },
      // Highlight states
      { selector: 'node.highlighted', style: { 'border-width': 3, 'border-color': '#003274', 'overlay-color': '#003274', 'overlay-padding': 4, 'overlay-opacity': 0.06, 'z-index': 10 } },
      { selector: 'node.dimmed', style: { 'opacity': 0.1 } },
      { selector: 'edge.dimmed', style: { 'opacity': 0.03 } },
      { selector: 'edge.highlighted', style: { 'width': 2.5, 'line-color': 'rgba(0, 50, 116, 0.5)', 'target-arrow-color': 'rgba(0, 50, 116, 0.6)', 'opacity': 1, 'z-index': 10, 'font-size': '9px', 'color': 'rgba(0, 50, 116, 0.6)' } },
      { selector: 'node.path-node', style: { 'border-width': 4, 'border-color': '#E67E22', 'overlay-color': '#E67E22', 'overlay-padding': 6, 'overlay-opacity': 0.1, 'z-index': 20 } },
      { selector: 'edge.path-edge', style: { 'width': 3, 'line-color': '#E67E22', 'target-arrow-color': '#E67E22', 'opacity': 1, 'z-index': 20 } },
      { selector: 'node.selected-node', style: { 'border-width': 3, 'border-color': '#52C9A6', 'overlay-color': '#52C9A6', 'overlay-padding': 5, 'overlay-opacity': 0.08 } },
    ],
    layout: { name: 'grid' },
    minZoom: 0.15,
    maxZoom: 4,
    wheelSensitivity: 0.25,
  })

  // Apply layout
  cy.layout(getLayoutConfig()).run()

  // ── Hover → highlight neighborhood ──
  cy.on('mouseover', 'node', (evt) => {
    if (pathMode.value) return
    const node = evt.target
    if (node.isParent()) return
    const neighborhood = node.neighborhood().add(node)
    cy.elements().not(neighborhood).addClass('dimmed')
    neighborhood.addClass('highlighted')
    neighborhood.edges().addClass('highlighted')
    containerRef.value.style.cursor = 'pointer'
  })

  cy.on('mouseout', 'node', () => {
    if (pathMode.value) return
    if (!selectedNode.value) {
      cy.elements().removeClass('highlighted dimmed')
    }
    if (containerRef.value) containerRef.value.style.cursor = 'default'
  })

  // ── Click → info panel ──
  cy.on('tap', 'node', (evt) => {
    const node = evt.target
    if (node.isParent()) return

    if (pathMode.value) {
      handlePathClick(node)
      return
    }

    cy.elements().removeClass('highlighted dimmed selected-node')
    const neighborhood = node.neighborhood().add(node)
    cy.elements().not(neighborhood).addClass('dimmed')
    neighborhood.addClass('highlighted')
    neighborhood.edges().addClass('highlighted')
    node.addClass('selected-node')

    // Animate viewport to fit the selected neighborhood
    cy.animate({ fit: { eles: neighborhood, padding: 60 }, duration: 400 })

    const data = node.data()
    const neighbors = node.neighborhood().nodes().map(n => ({
      id: n.data('id'),
      label: n.data('label'),
      type: n.data('type'),
    }))
    selectedNode.value = { id: data.id, type: data.type, label: data.label, data, neighbors }
  })

  // ── Click background → reset ──
  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      cy.elements().removeClass('highlighted dimmed selected-node path-node path-edge')
      selectedNode.value = null
      if (pathMode.value && !pathNodeA.value) {
        pathMode.value = false
      }
    }
  })

  // ── Radial context menu: nodes ──
  cy.cxtmenu({
    selector: 'node:childless',
    commands: [
      {
        content: '<i class="pi pi-external-link" style="font-size:14px"></i>',
        select: (ele) => navigateToEntity(ele.data('type'), ele.data('id')),
      },
      {
        content: '<i class="pi pi-eye" style="font-size:14px"></i>',
        select: (ele) => focusOnNeighborhood(ele),
      },
      {
        content: '<i class="pi pi-eye-slash" style="font-size:14px"></i>',
        select: (ele) => { ele.style('display', 'none'); ele.connectedEdges().style('display', 'none') },
      },
    ],
    fillColor: 'rgba(0, 50, 116, 0.75)',
    activeFillColor: 'rgba(82, 201, 166, 0.75)',
    activePadding: 8,
    indicatorSize: 12,
    separatorWidth: 3,
    spotlightPadding: 4,
    adaptativeNodeSpotlightRadius: true,
    minSpotlightRadius: 16,
    maxSpotlightRadius: 30,
    menuRadius: function(ele) { return 60 },
    itemTextStrokeColor: 'transparent',
    zIndex: 9999,
  })

  // ── Radial context menu: background ──
  cy.cxtmenu({
    selector: 'core',
    commands: [
      {
        content: '<i class="pi pi-eye" style="font-size:14px"></i>',
        select: () => showAll(),
      },
      {
        content: '<i class="pi pi-expand" style="font-size:14px"></i>',
        select: () => cy.fit(undefined, 30),
      },
    ],
    fillColor: 'rgba(0, 50, 116, 0.6)',
    activeFillColor: 'rgba(82, 201, 166, 0.75)',
    menuRadius: function() { return 50 },
    zIndex: 9999,
  })

  // ── Minimap ──
  cy.on('viewport', debounce(updateMinimap, 250))
  setTimeout(updateMinimap, 600)
}

// ── Navigation ──
function navigateToEntity(type, nodeId) {
  const id = nodeId.split('-').slice(1).join('-')
  switch (type) {
    case 'project':       router.push('/reference/projects'); break
    case 'tape':          router.push(`/tapes?select=${id}`); break
    case 'recipe':        router.push('/reference/recipes'); break
    case 'material':      router.push('/reference/materials'); break
    case 'electrode_batch': router.push(`/electrodes/${id}`); break
    case 'battery':       router.push(`/assembly/${id}`); break
  }
}

function selectNodeInGraph(nodeId) {
  if (!cy) return
  const node = cy.getElementById(nodeId)
  if (node.length) {
    cy.elements().removeClass('highlighted dimmed selected-node')
    const neighborhood = node.neighborhood().add(node)
    cy.elements().not(neighborhood).addClass('dimmed')
    neighborhood.addClass('highlighted')
    neighborhood.edges().addClass('highlighted')
    node.addClass('selected-node')
    cy.animate({ center: { eles: node }, zoom: 1.5, duration: 300 })

    const data = node.data()
    const neighbors = node.neighborhood().nodes().map(n => ({
      id: n.data('id'), label: n.data('label'), type: n.data('type'),
    }))
    selectedNode.value = { id: data.id, type: data.type, label: data.label, data, neighbors }
  }
}

// ── Focus / Show All ──
function focusOnNeighborhood(ele) {
  cy.elements().style('display', 'none')
  const neighborhood = ele.neighborhood().add(ele)
  neighborhood.style('display', 'element')
  neighborhood.connectedEdges().forEach(e => {
    if (e.source().style('display') !== 'none' && e.target().style('display') !== 'none') {
      e.style('display', 'element')
    }
  })
  cy.fit(neighborhood, 40)
}

function focusOnProject(projectNodeId) {
  if (!cy) return
  const projectNode = cy.getElementById(projectNodeId)
  if (!projectNode.length) return
  // Show project + all descendants (compound children) + their neighborhoods
  const children = projectNode.descendants()
  const related = children.neighborhood().add(children).add(projectNode)
  cy.elements().style('display', 'none')
  related.style('display', 'element')
  related.connectedEdges().forEach(e => {
    if (e.source().style('display') !== 'none' && e.target().style('display') !== 'none') {
      e.style('display', 'element')
    }
  })
  cy.fit(related, 40)
}

function showAll() {
  if (!cy) return
  cy.elements().style('display', 'element')
  cy.elements().removeClass('highlighted dimmed selected-node path-node path-edge')
  applyFilters()
  selectedNode.value = null
}

// ── Path tracing ──
function togglePathMode() {
  pathMode.value = !pathMode.value
  pathNodeA.value = null
  if (!pathMode.value) {
    cy.elements().removeClass('path-node path-edge highlighted dimmed')
  }
}

function handlePathClick(node) {
  if (!pathNodeA.value) {
    pathNodeA.value = node.data('id')
    node.addClass('path-node')
  } else {
    const targetId = node.data('id')
    if (targetId === pathNodeA.value) return
    // Find shortest path
    const result = cy.elements().aStar({
      root: cy.getElementById(pathNodeA.value),
      goal: cy.getElementById(targetId),
      directed: false,
    })
    cy.elements().removeClass('path-node path-edge highlighted dimmed')
    if (result.found) {
      cy.elements().addClass('dimmed')
      result.path.removeClass('dimmed')
      result.path.nodes().addClass('path-node')
      result.path.edges().addClass('path-edge')
    }
    pathNodeA.value = null
    pathMode.value = false
  }
}

// ── Filters ──
function applyFilters() {
  if (!cy) return
  const q = searchQuery.value.toLowerCase().trim()
  cy.nodes().forEach(node => {
    if (node.isParent()) return // parent visibility follows children
    const type = node.data('type')
    const label = (node.data('label') || '').toLowerCase()
    const typeVisible = visibleTypes.value[type] !== false
    const searchMatch = !q || label.includes(q)
    node.style('display', typeVisible && searchMatch ? 'element' : 'none')
  })
  cy.edges().forEach(edge => {
    const srcOk = edge.source().style('display') !== 'none'
    const tgtOk = edge.target().style('display') !== 'none'
    edge.style('display', srcOk && tgtOk ? 'element' : 'none')
  })
  relayout()
}

function toggleType(type) {
  visibleTypes.value[type] = !visibleTypes.value[type]
  applyFilters()
}

// ── Layout helpers ──
function relayout() {
  if (cy) cy.layout(getLayoutConfig()).run()
}

function fitGraph() {
  if (cy) cy.fit(undefined, 30)
}

// ── Minimap ──
function updateMinimap() {
  if (!cy || !minimapRef.value) return
  const ctx = minimapRef.value.getContext('2d')
  if (!ctx) return
  const w = minimapRef.value.width
  const h = minimapRef.value.height
  ctx.clearRect(0, 0, w, h)
  try {
    const png = cy.png({ scale: 0.08, full: true, bg: 'transparent' })
    if (!png) return
    const img = new Image()
    img.onload = () => {
      const ratio = Math.min(w / img.width, h / img.height)
      const dw = img.width * ratio
      const dh = img.height * ratio
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
    }
    img.src = png
  } catch { /* silent */ }
}

function debounce(fn, ms) {
  let timer
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms) }
}

// ── Lifecycle ──
watch(() => props.graphData, () => {
  nextTick(() => initCytoscape())
}, { deep: true })

onMounted(() => {
  setTimeout(() => {
    if (props.graphData.nodes.length > 0) initCytoscape()
  }, 100)
})

onUnmounted(() => {
  if (cy) cy.destroy()
  clearTimeout(_minimapTimer)
})
</script>

<template>
  <div class="graph-wrapper">
    <!-- Toolbar -->
    <div class="graph-toolbar">
      <button class="graph-btn" @click="fitGraph" title="Вписать"><i class="pi pi-expand"></i></button>
      <button class="graph-btn" @click="showAll" title="Показать всё"><i class="pi pi-replay"></i></button>
      <button :class="['graph-btn', pathMode ? 'graph-btn--active' : '']" @click="togglePathMode" title="Найти путь между двумя нодами">
        <i class="pi pi-directions"></i>
      </button>

      <div class="graph-search">
        <i class="pi pi-search"></i>
        <input v-model="searchQuery" @input="applyFilters" placeholder="Поиск..." />
      </div>

      <div class="graph-slider">
        <input type="range" v-model.number="spacing" min="40" max="160" @change="relayout" />
      </div>

      <div class="graph-type-filters">
        <button
          v-for="(color, type) in NODE_COLORS"
          :key="type"
          :class="['type-toggle', visibleTypes[type] ? '' : 'inactive']"
          @click="toggleType(type)"
          :title="(visibleTypes[type] ? 'Скрыть' : 'Показать') + ' ' + (TYPE_LABELS[type] || type)"
        >
          <span class="legend-dot" :style="{ background: visibleTypes[type] ? color : '#ccc' }"></span>
          {{ TYPE_LABELS[type] || type }}
        </button>
      </div>
    </div>

    <!-- Path mode hint -->
    <div v-if="pathMode" class="path-hint">
      <i class="pi pi-directions"></i>
      {{ pathNodeA ? 'Кликните на вторую ноду' : 'Кликните на первую ноду' }}
      <button class="path-cancel" @click="togglePathMode">Отмена</button>
    </div>

    <!-- Graph container -->
    <div ref="containerRef" class="graph-container"></div>

    <!-- Minimap -->
    <canvas ref="minimapRef" class="graph-minimap" width="160" height="100"></canvas>

    <!-- Info panel -->
    <div v-if="selectedNode" class="info-panel">
      <div class="info-header">
        <span class="info-type-badge" :style="{ background: NODE_COLORS[selectedNode.type] }">
          {{ TYPE_LABELS[selectedNode.type] || selectedNode.type }}
        </span>
        <button class="info-close" @click="selectedNode = null; showAll()"><i class="pi pi-times"></i></button>
      </div>
      <div class="info-name">{{ selectedNode.label }}</div>

      <!-- Details -->
      <div class="info-details">
        <div v-for="(label, key) in DETAIL_LABELS" :key="key">
          <template v-if="selectedNode.data[key]">
            <span class="info-detail-label">{{ label }}:</span>
            <span class="info-detail-value">{{ selectedNode.data[key] }}</span>
          </template>
        </div>
      </div>

      <!-- Actions -->
      <div class="info-actions">
        <button class="info-action-btn" @click="navigateToEntity(selectedNode.type, selectedNode.id)">
          <i class="pi pi-external-link"></i> Перейти
        </button>
        <button v-if="selectedNode.type === 'project'" class="info-action-btn" @click="focusOnProject(selectedNode.id)">
          <i class="pi pi-filter"></i> Только этот проект
        </button>
      </div>

      <!-- Neighbors -->
      <div v-if="selectedNode.neighbors.length" class="info-neighbors">
        <div class="info-section-title">Связанные ({{ selectedNode.neighbors.length }})</div>
        <div
          v-for="n in selectedNode.neighbors"
          :key="n.id"
          class="info-neighbor-item"
          @click="selectNodeInGraph(n.id)"
        >
          <span class="legend-dot" :style="{ background: NODE_COLORS[n.type] || '#999' }"></span>
          <span class="info-neighbor-label">{{ n.label }}</span>
          <span class="info-neighbor-type">{{ TYPE_LABELS[n.type] || n.type }}</span>
        </div>
      </div>
    </div>

    <!-- Empty state -->
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
  min-height: 500px;
}

/* ── Toolbar ── */
.graph-toolbar {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  right: 0.75rem;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.graph-btn {
  width: 30px;
  height: 30px;
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(8px);
  color: #003274;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  transition: background 0.15s;
  flex-shrink: 0;
}
.graph-btn:hover { background: rgba(255, 255, 255, 0.98); }
.graph-btn--active {
  background: rgba(230, 126, 34, 0.15) !important;
  border-color: #E67E22 !important;
  color: #E67E22 !important;
}

.graph-search {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 7px;
}
.graph-search i { font-size: 11px; color: #6B7280; }
.graph-search input {
  border: none;
  background: transparent;
  font-size: 12px;
  width: 100px;
  outline: none;
  font-family: inherit;
  color: #333;
}
.graph-search input::placeholder { color: #9CA3AF; }

.graph-slider {
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 7px;
}
.graph-slider input[type="range"] { width: 60px; height: 3px; accent-color: #003274; }

.graph-type-filters { display: flex; gap: 0.25rem; margin-left: auto; flex-wrap: wrap; }
.type-toggle {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  font-size: 10px;
  color: #333;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  white-space: nowrap;
}
.type-toggle:hover { border-color: rgba(0, 50, 116, 0.3); }
.type-toggle.inactive { opacity: 0.45; background: rgba(200, 200, 200, 0.3); text-decoration: line-through; }
.legend-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

/* ── Path hint ── */
.path-hint {
  position: absolute;
  top: 52px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  background: rgba(230, 126, 34, 0.12);
  border: 1px solid rgba(230, 126, 34, 0.3);
  border-radius: 8px;
  font-size: 12px;
  color: #9a5a10;
  font-weight: 500;
}
.path-cancel {
  border: none;
  background: rgba(230, 126, 34, 0.15);
  color: #9a5a10;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
}
.path-cancel:hover { background: rgba(230, 126, 34, 0.25); }

/* ── Graph container ── */
.graph-container { width: 100%; height: 100%; min-height: 500px; }

/* ── Minimap ── */
.graph-minimap {
  position: absolute;
  bottom: 12px;
  left: 12px;
  z-index: 10;
  border: 1px solid rgba(180, 210, 255, 0.4);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(6px);
  pointer-events: none;
}

/* ── Info panel ── */
.info-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 260px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  border-left: 1px solid rgba(180, 210, 255, 0.35);
  z-index: 15;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  gap: 0.75rem;
}

.info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.info-type-badge {
  display: inline-flex;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #fff;
}

.info-close {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  color: rgba(0, 50, 116, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.info-close:hover { background: rgba(200, 80, 70, 0.1); color: rgba(200, 80, 70, 0.7); }
.info-close .pi { font-size: 12px; }

.info-name { font-size: 16px; font-weight: 700; color: #003274; }

.info-details { display: flex; flex-direction: column; gap: 4px; }
.info-detail-label { font-size: 11px; font-weight: 600; color: rgba(0, 50, 116, 0.5); margin-right: 4px; }
.info-detail-value { font-size: 12px; color: #333; }

.info-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.info-action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border: 1px solid rgba(0, 50, 116, 0.12);
  border-radius: 6px;
  background: rgba(0, 50, 116, 0.04);
  color: #003274;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.info-action-btn:hover { background: rgba(0, 50, 116, 0.08); border-color: rgba(0, 50, 116, 0.2); }
.info-action-btn .pi { font-size: 12px; }

.info-section-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(0, 50, 116, 0.4);
  margin-top: 0.25rem;
}

.info-neighbors { display: flex; flex-direction: column; gap: 2px; }

.info-neighbor-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s;
  font-size: 12px;
}
.info-neighbor-item:hover { background: rgba(0, 50, 116, 0.05); }
.info-neighbor-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #333; }
.info-neighbor-type { font-size: 10px; color: #9CA3AF; flex-shrink: 0; }

/* ── Empty ── */
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
  .graph-type-filters { display: none; }
  .graph-slider { display: none; }
  .info-panel { width: 100%; height: 50%; top: auto; border-left: none; border-top: 1px solid rgba(180, 210, 255, 0.35); }
  .graph-minimap { display: none; }
}
</style>
