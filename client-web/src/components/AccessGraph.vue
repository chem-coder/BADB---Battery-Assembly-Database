<script setup>
/**
 * AccessGraph — Cytoscape visualization of project access relationships.
 * Nodes: users, departments, projects
 * Edges: access grants (direct user, department, implicit)
 * Reuses dagre layout pattern from DashboardGraph.
 */
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import cytoscape from 'cytoscape'
import dagre from 'cytoscape-dagre'
import api from '@/services/api'

cytoscape.use(dagre)

const containerRef = ref(null)
let cy = null

const loading = ref(true)
const selectedNode = ref(null)
const visibleTypes = ref({ user: true, department: true, project: true })
const visibleEdges = ref({ member_of: true, implicit_dept: true, grant_user: true, grant_dept: true })
const searchQuery = ref('')

const NODE_COLORS = {
  user: '#6CACE4',
  department: '#D3A754',
  project: '#003274',
}

const NODE_SHAPES = {
  user: 'ellipse',
  department: 'round-rectangle',
  project: 'diamond',
}

const PROJECT_CONF_COLORS = {
  public: '#52C9A6',
  department: '#003274',
  confidential: '#E74C3C',
}

const TYPE_LABELS = {
  user: 'Пользователь',
  department: 'Отдел',
  project: 'Проект',
}

const EDGE_LABELS = {
  member_of: 'в отделе',
  implicit_dept: 'отдел→проект',
  grant_user: 'явный grant',
  grant_dept: 'grant отделу',
}

const ACCESS_COLORS = {
  view: 'rgba(82, 201, 166, 0.6)',
  edit: 'rgba(0, 50, 116, 0.6)',
  admin: 'rgba(231, 76, 60, 0.7)',
}

async function loadGraph() {
  loading.value = true
  try {
    const { data } = await api.get('/api/access/graph')
    renderGraph(data)
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

function renderGraph(data) {
  if (!containerRef.value) return
  if (cy) cy.destroy()

  const elements = []
  for (const n of data.nodes) {
    elements.push({
      group: 'nodes',
      data: { id: n.id, label: n.label, type: n.type, ...n.data },
    })
  }
  for (const e of data.edges) {
    elements.push({
      group: 'edges',
      data: {
        source: e.source,
        target: e.target,
        type: e.type,
        access_level: e.access_level || null,
        label: EDGE_LABELS[e.type] || '',
      },
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
          'font-size': '10px',
          'font-family': 'Rosatom, system-ui, sans-serif',
          'text-wrap': 'ellipsis',
          'text-max-width': '100px',
          'text-valign': 'bottom',
          'text-margin-y': 4,
          'color': '#333',
          'width': 28,
          'height': 28,
          'border-width': 2,
          'border-color': '#fff',
        },
      },
      ...Object.entries(NODE_COLORS).map(([type, color]) => ({
        selector: `node[type="${type}"]`,
        style: {
          'background-color': color,
          'shape': NODE_SHAPES[type],
          'width': type === 'project' ? 40 : type === 'department' ? 36 : 26,
          'height': type === 'project' ? 40 : type === 'department' ? 36 : 26,
        },
      })),
      // Project confidentiality overlay
      { selector: 'node[type="project"][confidentiality_level="public"]', style: { 'background-color': PROJECT_CONF_COLORS.public } },
      { selector: 'node[type="project"][confidentiality_level="department"]', style: { 'background-color': PROJECT_CONF_COLORS.department } },
      { selector: 'node[type="project"][confidentiality_level="confidential"]', style: { 'background-color': PROJECT_CONF_COLORS.confidential } },
      // Edges
      {
        selector: 'edge',
        style: {
          'width': 1,
          'line-color': 'rgba(0, 50, 116, 0.1)',
          'target-arrow-color': 'rgba(0, 50, 116, 0.15)',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 0.5,
          'opacity': 0.5,
          'font-size': '8px',
          'color': 'rgba(0, 50, 116, 0.3)',
        },
      },
      { selector: 'edge[type="member_of"]', style: { 'line-style': 'dashed', 'line-color': 'rgba(108, 172, 228, 0.3)' } },
      { selector: 'edge[type="grant_user"][access_level="view"]', style: { 'line-color': ACCESS_COLORS.view, 'target-arrow-color': ACCESS_COLORS.view, 'width': 2 } },
      { selector: 'edge[type="grant_user"][access_level="edit"]', style: { 'line-color': ACCESS_COLORS.edit, 'target-arrow-color': ACCESS_COLORS.edit, 'width': 2.5 } },
      { selector: 'edge[type="grant_user"][access_level="admin"]', style: { 'line-color': ACCESS_COLORS.admin, 'target-arrow-color': ACCESS_COLORS.admin, 'width': 3 } },
      { selector: 'edge[type="grant_dept"]', style: { 'line-color': 'rgba(211, 167, 84, 0.6)', 'target-arrow-color': 'rgba(211, 167, 84, 0.8)', 'width': 2 } },
      { selector: 'edge[type="implicit_dept"]', style: { 'line-style': 'dotted', 'line-color': 'rgba(0, 50, 116, 0.25)' } },
      // Highlight states
      { selector: 'node.highlighted', style: { 'border-width': 3, 'border-color': '#003274', 'overlay-color': '#003274', 'overlay-padding': 4, 'overlay-opacity': 0.08, 'z-index': 10 } },
      { selector: 'node.dimmed', style: { 'opacity': 0.12 } },
      { selector: 'edge.dimmed', style: { 'opacity': 0.05 } },
      { selector: 'edge.highlighted', style: { 'width': 3, 'opacity': 1, 'z-index': 10 } },
    ],
    layout: {
      name: 'dagre',
      rankDir: 'TB',
      nodeSep: 30,
      rankSep: 80,
      animate: true,
      animationDuration: 400,
      padding: 30,
    },
    minZoom: 0.15,
    maxZoom: 4,
    wheelSensitivity: 0.25,
  })

  cy.on('tap', 'node', (evt) => {
    const node = evt.target
    cy.elements().removeClass('highlighted dimmed')
    const neighborhood = node.closedNeighborhood()
    cy.elements().not(neighborhood).addClass('dimmed')
    neighborhood.addClass('highlighted')
    neighborhood.edges().addClass('highlighted')
    cy.animate({ fit: { eles: neighborhood, padding: 60 }, duration: 400 })
    selectedNode.value = { ...node.data(), neighbors: node.neighborhood().nodes().map(n => n.data()) }
  })

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      cy.elements().removeClass('highlighted dimmed')
      selectedNode.value = null
    }
  })
}

function toggleType(type) {
  visibleTypes.value[type] = !visibleTypes.value[type]
  applyFilters()
}

function toggleEdge(type) {
  visibleEdges.value[type] = !visibleEdges.value[type]
  applyFilters()
}

function applyFilters() {
  if (!cy) return
  const q = searchQuery.value.toLowerCase().trim()
  cy.nodes().forEach(n => {
    const typeVisible = visibleTypes.value[n.data('type')] !== false
    const searchMatch = !q || (n.data('label') || '').toLowerCase().includes(q)
    n.style('display', typeVisible && searchMatch ? 'element' : 'none')
  })
  cy.edges().forEach(e => {
    const typeVisible = visibleEdges.value[e.data('type')] !== false
    const endpointsVisible =
      e.source().style('display') !== 'none' && e.target().style('display') !== 'none'
    e.style('display', typeVisible && endpointsVisible ? 'element' : 'none')
  })
  cy.layout({ name: 'dagre', rankDir: 'TB', nodeSep: 30, rankSep: 80, animate: true, animationDuration: 400, padding: 30 }).run()
}

function fitGraph() {
  if (cy) cy.fit(undefined, 30)
}

function showAll() {
  if (!cy) return
  cy.elements().style('display', 'element')
  cy.elements().removeClass('highlighted dimmed')
  selectedNode.value = null
  applyFilters()
}

onMounted(() => {
  nextTick(loadGraph)
})

onUnmounted(() => {
  if (cy) cy.destroy()
})
</script>

<template>
  <div class="access-graph-wrapper">
    <!-- Toolbar -->
    <div class="graph-toolbar">
      <button class="graph-btn" @click="fitGraph" title="Вписать"><i class="pi pi-expand"></i></button>
      <button class="graph-btn" @click="showAll" title="Сбросить"><i class="pi pi-replay"></i></button>
      <div class="graph-search">
        <i class="pi pi-search"></i>
        <input v-model="searchQuery" @input="applyFilters" placeholder="Поиск..." />
      </div>
      <div class="type-filters">
        <button
          v-for="(color, type) in NODE_COLORS"
          :key="type"
          :class="['type-toggle', visibleTypes[type] ? '' : 'inactive']"
          @click="toggleType(type)"
        >
          <span class="dot" :style="{ background: visibleTypes[type] ? color : '#ccc' }"></span>
          {{ TYPE_LABELS[type] }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">
      <i class="pi pi-spin pi-spinner"></i> Загрузка...
    </div>

    <div ref="containerRef" class="graph-container" v-show="!loading"></div>

    <!-- Info panel -->
    <div v-if="selectedNode" class="info-panel">
      <div class="info-header">
        <span class="info-type-badge" :style="{ background: NODE_COLORS[selectedNode.type] }">
          {{ TYPE_LABELS[selectedNode.type] }}
        </span>
        <button class="info-close" @click="selectedNode = null; showAll()"><i class="pi pi-times"></i></button>
      </div>
      <div class="info-name">{{ selectedNode.label }}</div>
      <div v-if="selectedNode.confidentiality_level" class="info-meta">
        Уровень: {{ selectedNode.confidentiality_level }}
      </div>
      <div class="info-section-title">Связи ({{ selectedNode.neighbors?.length || 0 }})</div>
      <div class="info-neighbors">
        <div v-for="n in selectedNode.neighbors" :key="n.id" class="info-neighbor-item">
          <span class="dot" :style="{ background: NODE_COLORS[n.type] || '#999' }"></span>
          <span class="info-neighbor-label">{{ n.label }}</span>
          <span class="info-neighbor-type">{{ TYPE_LABELS[n.type] }}</span>
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div class="graph-legend">
      <div class="legend-row">
        <strong>Доступы:</strong>
        <span class="legend-item"><span class="line-sample" :style="{ background: ACCESS_COLORS.view }"></span> view</span>
        <span class="legend-item"><span class="line-sample" :style="{ background: ACCESS_COLORS.edit }"></span> edit</span>
        <span class="legend-item"><span class="line-sample" :style="{ background: ACCESS_COLORS.admin }"></span> admin</span>
        <span class="legend-item"><span class="line-sample" style="background: rgba(211, 167, 84, 0.6)"></span> grant отделу</span>
        <span class="legend-item"><span class="line-sample dotted"></span> implicit dept→project</span>
        <span class="legend-item"><span class="line-sample dashed"></span> член отдела</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.access-graph-wrapper {
  position: relative;
  width: 100%;
  min-height: 600px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

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
}
.graph-btn:hover { background: rgba(255, 255, 255, 0.98); }

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
.graph-search input {
  border: none;
  background: transparent;
  font-size: 12px;
  width: 100px;
  outline: none;
  font-family: inherit;
}

.type-filters { display: flex; gap: 0.25rem; margin-left: auto; }
.type-toggle {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  font-size: 11px;
  color: #333;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}
.type-toggle.inactive { opacity: 0.45; text-decoration: line-through; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 3rem;
  color: rgba(0, 50, 116, 0.4);
  min-height: 500px;
}

.graph-container {
  width: 100%;
  height: 600px;
  border: 1px solid rgba(0, 50, 116, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.5);
}

/* Info panel */
.info-panel {
  position: absolute;
  top: 70px;
  right: 12px;
  bottom: 60px;
  width: 260px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(180, 210, 255, 0.35);
  border-radius: 8px;
  z-index: 15;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.info-header { display: flex; align-items: center; justify-content: space-between; }
.info-type-badge {
  display: inline-flex;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: white;
}
.info-close {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  color: rgba(0, 50, 116, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}
.info-close:hover { background: rgba(200, 80, 70, 0.1); }
.info-name { font-size: 15px; font-weight: 700; color: #003274; }
.info-meta { font-size: 11px; color: #6B7280; }
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
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 11px;
}
.info-neighbor-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #333; }
.info-neighbor-type { font-size: 9px; color: #9CA3AF; }

/* Legend */
.graph-legend {
  padding: 0.5rem 0.75rem;
  font-size: 11px;
  color: #6B7280;
}
.legend-row { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
.legend-row strong { color: rgba(0, 50, 116, 0.6); font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; }
.legend-item { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.line-sample { width: 20px; height: 2px; display: inline-block; }
.line-sample.dotted { border-top: 2px dotted rgba(0, 50, 116, 0.3); background: transparent; }
.line-sample.dashed { border-top: 2px dashed rgba(108, 172, 228, 0.4); background: transparent; }
</style>
