<script setup>
/**
 * AccessGraph — force-directed MEMBERSHIP constellation (Obsidian-style).
 *
 * People + projects are nodes. A person connects to a project when they belong
 * to it; the edge encodes their role (see utils/accessGraphModel.js):
 *   - manager (lead / owner / admin) → red, thick — runs the project
 *   - member  (listed participant)   → muted    — can CRUD the project's data
 * A person node is sized by how many projects they belong to; people on nothing
 * float to the outskirts. Projects are uniform, coloured by confidentiality.
 *
 * The transform lives in buildAccessGraph() (unit-tested); this component only
 * renders it. The backend (GET /api/access/graph) returns the raw rows.
 */
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import api from '@/services/api'
import { buildAccessGraph } from '@/utils/accessGraphModel'
import { accessLabel } from '@/utils/projectAccess'

cytoscape.use(fcose)

const containerRef = ref(null)
let cy = null

const loading = ref(true)
const selectedNode = ref(null)
const searchQuery = ref('')

const NODE_COLORS = {
  user: '#6CACE4',
  project: '#003274',
}

const PROJECT_CONF_COLORS = {
  public: '#52C9A6',
  confidential: '#E74C3C',
}

const TYPE_LABELS = {
  user: 'Человек',
  project: 'Проект',
}

// Edge role → style. Manager is red+thick (runs the project); member is a muted
// connector (on the team, CRUD the data).
const EDGE_STYLES = {
  manager: { color: '#E74C3C', width: 3 },
  member: { color: 'rgba(120, 150, 190, 0.6)', width: 1.6 },
}

const ROLE_LABELS = {
  manager: 'руководит',
  member: 'участник',
}

const FCOSE_LAYOUT = {
  name: 'fcose',
  quality: 'default',
  animate: true,
  animationDuration: 600,
  randomize: true,
  packComponents: true, // keep the many isolated people tidy on the outskirts
  nodeRepulsion: 6500,
  idealEdgeLength: 75,
  nodeSeparation: 80,
  padding: 30,
}

async function loadGraph() {
  loading.value = true
  try {
    const { data } = await api.get('/api/access/graph')
    // Reveal the container BEFORE rendering: it is v-show-hidden while loading,
    // and cytoscape captures the container size at init — initialising into a
    // 0×0 hidden box leaves the graph blank. Flip loading off, wait for the DOM,
    // then render into the now-visible, sized container.
    loading.value = false
    await nextTick()
    renderGraph(buildAccessGraph(data))
  } catch (err) {
    console.error(err)
    loading.value = false
  }
}

function renderGraph(graph) {
  if (!containerRef.value) return
  if (cy) cy.destroy()

  const elements = []
  for (const n of graph.nodes) {
    elements.push({
      group: 'nodes',
      data: { id: n.id, label: n.label, type: n.type, size: n.size, ...n.data },
    })
  }
  for (const e of graph.edges) {
    elements.push({
      group: 'edges',
      data: { source: e.source, target: e.target, role: e.role },
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
          'text-max-width': '110px',
          'text-valign': 'bottom',
          'text-margin-y': 3,
          'color': '#333',
          'border-width': 2,
          'border-color': '#fff',
        },
      },
      // People — blue ellipse, sized by how many projects they belong to.
      {
        selector: 'node[type="user"]',
        style: {
          'background-color': NODE_COLORS.user,
          'shape': 'ellipse',
          'width': 'data(size)',
          'height': 'data(size)',
        },
      },
      // Projects — uniform diamond, coloured by confidentiality below.
      {
        selector: 'node[type="project"]',
        style: {
          'background-color': NODE_COLORS.project,
          'shape': 'diamond',
          'width': 34,
          'height': 34,
          'font-size': '11px',
          'font-weight': 'bold',
        },
      },
      { selector: 'node[type="project"][confidentiality_level="public"]', style: { 'background-color': PROJECT_CONF_COLORS.public } },
      { selector: 'node[type="project"][confidentiality_level="confidential"]', style: { 'background-color': PROJECT_CONF_COLORS.confidential } },
      // Legacy `department` confidentiality → restricted (mirror normalizeAccess).
      { selector: 'node[type="project"][confidentiality_level="department"]', style: { 'background-color': PROJECT_CONF_COLORS.confidential } },
      // Edges — undirected constellation lines, styled by role.
      {
        selector: 'edge',
        style: {
          'curve-style': 'bezier',
          'opacity': 0.7,
        },
      },
      { selector: 'edge[role="manager"]', style: { 'line-color': EDGE_STYLES.manager.color, 'width': EDGE_STYLES.manager.width } },
      { selector: 'edge[role="member"]', style: { 'line-color': EDGE_STYLES.member.color, 'width': EDGE_STYLES.member.width } },
      // Highlight / dim states (click a node to focus its neighbourhood).
      { selector: 'node.highlighted', style: { 'border-width': 3, 'border-color': '#003274', 'overlay-color': '#003274', 'overlay-padding': 4, 'overlay-opacity': 0.08, 'z-index': 10 } },
      { selector: 'node.dimmed', style: { 'opacity': 0.12 } },
      { selector: 'edge.dimmed', style: { 'opacity': 0.06 } },
      { selector: 'edge.highlighted', style: { 'opacity': 1, 'z-index': 10 } },
    ],
    layout: FCOSE_LAYOUT,
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
    selectedNode.value = {
      ...node.data(),
      neighbors: node.neighborhood('node').map((n) => n.data()),
    }
  })

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      cy.elements().removeClass('highlighted dimmed')
      selectedNode.value = null
    }
  })
}

function applyFilters() {
  if (!cy) return
  const q = searchQuery.value.toLowerCase().trim()
  cy.nodes().forEach((n) => {
    const match = !q || (n.data('label') || '').toLowerCase().includes(q)
    n.style('display', match ? 'element' : 'none')
  })
  cy.edges().forEach((e) => {
    const visible = e.source().style('display') !== 'none' && e.target().style('display') !== 'none'
    e.style('display', visible ? 'element' : 'none')
  })
}

function fitGraph() {
  if (cy) cy.fit(undefined, 30)
}

function resetView() {
  if (!cy) return
  searchQuery.value = ''
  cy.elements().style('display', 'element')
  cy.elements().removeClass('highlighted dimmed')
  selectedNode.value = null
  cy.layout(FCOSE_LAYOUT).run()
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
      <button class="graph-btn" @click="resetView" title="Сбросить"><i class="pi pi-replay"></i></button>
      <div class="graph-search">
        <i class="pi pi-search"></i>
        <input v-model="searchQuery" @input="applyFilters" placeholder="Поиск..." />
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
        <button class="info-close" @click="selectedNode = null; resetView()"><i class="pi pi-times"></i></button>
      </div>
      <div class="info-name">{{ selectedNode.label }}</div>
      <div v-if="selectedNode.type === 'user'" class="info-meta">
        Проектов: {{ selectedNode.project_count ?? 0 }}
      </div>
      <div v-if="selectedNode.type === 'project' && selectedNode.confidentiality_level" class="info-meta">
        Доступ: {{ accessLabel(selectedNode.confidentiality_level) }}
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
        <strong>Связи:</strong>
        <span class="legend-item"><span class="line-sample" :style="{ background: EDGE_STYLES.manager.color, height: '3px' }"></span> руководит проектом</span>
        <span class="legend-item"><span class="line-sample" :style="{ background: EDGE_STYLES.member.color }"></span> участник — CRUD данных</span>
        <span class="legend-item"><span class="dot-grow"></span> размер = число проектов</span>
      </div>
      <div class="legend-row">
        <strong>Узлы:</strong>
        <span class="legend-item"><span class="dot" :style="{ background: NODE_COLORS.user }"></span> человек</span>
        <span class="legend-item"><span class="dot" :style="{ background: PROJECT_CONF_COLORS.public }"></span> открытый проект</span>
        <span class="legend-item"><span class="dot" :style="{ background: PROJECT_CONF_COLORS.confidential }"></span> ограниченный проект</span>
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
  width: 110px;
  outline: none;
  font-family: inherit;
}

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
  bottom: 70px;
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
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.legend-row { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
.legend-row strong { color: rgba(0, 50, 116, 0.6); font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; }
.legend-item { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
.line-sample { width: 20px; height: 2px; display: inline-block; border-radius: 2px; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot-grow {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: radial-gradient(circle, #6CACE4 30%, rgba(108, 172, 228, 0.25) 70%);
  display: inline-block;
}
</style>
