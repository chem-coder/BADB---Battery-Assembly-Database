<script setup>
/**
 * AccessMatrix — spreadsheet view of who has access to what.
 * Rows = users, columns = projects, cells = effective access.
 *
 * Access is PROJECT-based (there is no department-based visibility): a user's
 * effective access to a project is resolved by resolveProjectAccess() in
 * @/utils/projectAccess, strongest-access-first. Cell sources:
 *  - admin / director: role/position override (red / purple)
 *  - lead / owner: project lead or creator — admin-tone
 *  - direct: explicit user→project grant, colored by level (view/edit/admin)
 *  - participant: on the project team — view-tone
 *  - public: open project — view-tone, light
 *  - blank: no access
 */
import { ref, computed, onMounted } from 'vue'
import api from '@/services/api'
import Select from 'primevue/select'
import { resolveProjectAccess } from '@/utils/projectAccess'

const loading = ref(true)
const users = ref([])
const projects = ref([])
const userGrants = ref([])
const participants = ref([])

// Filters
const searchQuery = ref('')
const selectedConfidentiality = ref(null)
const showOnlyWithGrants = ref(false)
const showExpired = ref(false)

async function loadData() {
  loading.value = true
  try {
    const { data } = await api.get('/api/access/matrix')
    users.value = data.users
    projects.value = data.projects
    userGrants.value = data.user_grants
    participants.value = data.participants
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

// Lookup of explicit grants: key = "userId-projectId" → grant. Built once over
// the raw grants (independent of filters); resolveProjectAccess handles expiry.
const userGrantMap = computed(() => {
  const m = new Map()
  for (const g of userGrants.value) m.set(`${g.user_id}-${g.project_id}`, g)
  return m
})

// Set of team memberships: "userId-projectId". Built once.
const participantSet = computed(() => {
  const s = new Set()
  for (const p of participants.value) s.add(`${p.user_id}-${p.project_id}`)
  return s
})

// Filtered columns (projects).
const filteredProjects = computed(() => {
  let list = projects.value
  if (selectedConfidentiality.value) {
    list = list.filter(p => p.confidentiality_level === selectedConfidentiality.value)
  }
  return list
})

// Filtered rows (users): search + "only with explicit grants".
const filteredUsers = computed(() => {
  let list = users.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(u =>
      u.name.toLowerCase().includes(q) ||
      (u.position || '').toLowerCase().includes(q)
    )
  }
  if (showOnlyWithGrants.value) {
    list = list.filter(u =>
      projects.value.some(p => {
        const cell = resolveProjectAccess(
          u, p,
          userGrantMap.value.get(`${u.user_id}-${p.project_id}`) || null,
          participantSet.value.has(`${u.user_id}-${p.project_id}`),
          showExpired.value,
        )
        return cell && cell.source === 'direct'
      })
    )
  }
  return list
})

// Precomputed grid: one row per filtered user, each carrying its already-resolved
// cells (one per filtered project). The template iterates `rows` and each <td>
// reads a single resolved cell object — no per-cell function calls in render.
// A single O(filteredUsers × filteredProjects) pass; rebuilds only when the
// filtered sets or `showExpired` change.
// (Future optimization: virtualize the table body for very large matrices.)
const rows = computed(() => {
  const grants = userGrantMap.value
  const team = participantSet.value
  const cols = filteredProjects.value
  return filteredUsers.value.map(user => ({
    user,
    cells: cols.map(project => resolveProjectAccess(
      user, project,
      grants.get(`${user.user_id}-${project.project_id}`) || null,
      team.has(`${user.user_id}-${project.project_id}`),
      showExpired.value,
    )),
  }))
})

// Stats
const stats = computed(() => {
  const activeGrants = userGrants.value.filter(g => !g.is_expired).length
  const expiredGrants = userGrants.value.filter(g => g.is_expired).length
  return {
    users: filteredUsers.value.length,
    projects: filteredProjects.value.length,
    grants: activeGrants,
    expired: expiredGrants,
  }
})

const confLevels = [
  { label: 'Все', value: null },
  { label: 'Открытый', value: 'public' },
  { label: 'Конф.', value: 'confidential' },
]

// CSV export
function exportCsv() {
  const header = ['Пользователь', ...filteredProjects.value.map(p => p.name)]
  const csvRows = rows.value.map(({ user, cells }) => {
    const row = [user.name]
    for (const c of cells) {
      if (!c) row.push('')
      else row.push(`${c.level}${c.is_expired ? ' (expired)' : ''} [${c.source}]`)
    }
    return row
  })
  const csv = [header, ...csvRows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `access_matrix_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="access-matrix">
    <!-- Filter bar -->
    <div class="filter-bar glass-card">
      <div class="filter-left">
        <div class="filter-search">
          <i class="pi pi-search"></i>
          <input v-model="searchQuery" placeholder="Поиск пользователя..." />
        </div>
        <Select
          v-model="selectedConfidentiality"
          :options="confLevels"
          optionLabel="label"
          optionValue="value"
          placeholder="Уровень"
          class="filter-conf"
        />
        <label class="filter-check">
          <input type="checkbox" v-model="showOnlyWithGrants" />
          Только с явными grants
        </label>
        <label class="filter-check">
          <input type="checkbox" v-model="showExpired" />
          Показывать истёкшие
        </label>
      </div>
      <div class="filter-right">
        <button class="btn-export" @click="exportCsv" title="Экспорт CSV">
          <i class="pi pi-download"></i> CSV
        </button>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats-row">
      <span class="stat"><strong>{{ stats.users }}</strong> польз.</span>
      <span class="stat"><strong>{{ stats.projects }}</strong> проект.</span>
      <span class="stat stat--green"><strong>{{ stats.grants }}</strong> активных grants</span>
      <span v-if="stats.expired > 0" class="stat stat--red"><strong>{{ stats.expired }}</strong> истёкших</span>
    </div>

    <!-- Matrix -->
    <div v-if="loading" class="loading">
      <i class="pi pi-spin pi-spinner"></i> Загрузка...
    </div>
    <div v-else class="matrix-wrap glass-card">
      <div class="matrix-scroll">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="th-sticky th-user">Пользователь</th>
              <th v-for="p in filteredProjects" :key="p.project_id" class="th-proj" :title="p.name">
                <div class="proj-label">
                  <span :class="['proj-conf', `proj-conf--${p.confidentiality_level || 'public'}`]" :title="p.confidentiality_level"></span>
                  <span class="proj-name">{{ p.name }}</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.user.user_id">
              <td class="td-user">
                <div class="user-name">{{ row.user.name }}</div>
                <div v-if="row.user.position" class="user-pos">{{ row.user.position }}</div>
              </td>
              <td v-for="(cell, i) in row.cells" :key="filteredProjects[i].project_id" class="td-cell">
                <template v-if="cell">
                  <span
                    :class="['cell-badge', `cell-badge--${cell.source}`, cell.is_expired ? 'cell-badge--expired' : '']"
                    :title="`${cell.level} via ${cell.source}${cell.is_expired ? ' (истёк)' : ''}`"
                  >
                    {{ cell.level === 'admin' ? 'A' : cell.level === 'edit' ? 'E' : 'V' }}
                  </span>
                </template>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td :colspan="filteredProjects.length + 1" class="empty-row">Нет пользователей по фильтру</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Legend -->
    <div class="legend">
      <span class="legend-title">Легенда:</span>
      <span class="legend-item"><span class="cell-badge cell-badge--direct">V</span> явный grant</span>
      <span class="legend-item"><span class="cell-badge cell-badge--lead">A</span> лид проекта</span>
      <span class="legend-item"><span class="cell-badge cell-badge--owner">A</span> владелец</span>
      <span class="legend-item"><span class="cell-badge cell-badge--participant">V</span> участник</span>
      <span class="legend-item"><span class="cell-badge cell-badge--public">V</span> public</span>
      <span class="legend-item"><span class="cell-badge cell-badge--admin">A</span> admin</span>
      <span class="legend-item"><span class="cell-badge cell-badge--director">A</span> director</span>
      <span class="legend-item"><span class="cell-badge cell-badge--direct cell-badge--expired">V</span> истёк</span>
    </div>
  </div>
</template>

<style scoped>
.access-matrix { display: flex; flex-direction: column; gap: 0.75rem; }

.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.filter-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.filter-search {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(180, 210, 255, 0.55);
  border-radius: 7px;
}
.filter-search i { font-size: 11px; color: #9CA3AF; }
.filter-search input {
  border: none;
  background: transparent;
  font-size: 12px;
  width: 160px;
  outline: none;
  font-family: inherit;
  color: #333;
}
.filter-conf { width: 180px; }
.filter-check {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6B7280;
  white-space: nowrap;
  cursor: pointer;
}
.btn-export {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid rgba(0, 50, 116, 0.12);
  border-radius: 6px;
  background: rgba(0, 50, 116, 0.04);
  color: #003274;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.btn-export:hover { background: rgba(0, 50, 116, 0.08); }

/* Stats */
.stats-row {
  display: flex;
  gap: 1rem;
  padding: 0 0.25rem;
}
.stat {
  font-size: 11px;
  color: rgba(0, 50, 116, 0.5);
}
.stat strong {
  color: #003274;
  font-weight: 700;
  margin-right: 3px;
}
.stat--green strong { color: #1a8a64; }
.stat--red strong { color: #b00020; }

/* Loading */
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 3rem;
  color: rgba(0, 50, 116, 0.4);
}

/* Matrix */
.matrix-wrap {
  padding: 0;
  overflow: hidden;
}
.matrix-scroll {
  overflow: auto;
  max-height: 700px;
  /* Isolate this scroll from the page: reaching an edge won't bounce the whole
     document (that hand-off is a real source of scroll "eye-hurt"). Momentum on
     touch devices. */
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.matrix-table {
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
}
.matrix-table th, .matrix-table td {
  /* No per-cell grid lines — thin lines crawl/shimmer during scroll. Rows are
     separated by zebra striping (opaque fills don't shimmer); columns by cell
     alignment + the sticky header divider. (No `padding: 0` reset here either —
     it would out-specify the per-cell padding rules below.) */
}
/* Zebra rows: opaque tints, so the frozen column scrolls cleanly and there are
   no moving lines to shimmer. */
.matrix-table tbody tr:nth-child(even) td { background: #f6f8fb; }

/* Sticky headers */
.th-sticky {
  position: sticky;
  background: #fff;
  z-index: 3;
}
/* Sole sticky first column — body cells use 6px 10px horizontal padding, so the
   header must match or header/data misalign (global rule above zeroes padding). */
.th-user {
  left: 0;
  top: 0;
  min-width: 200px;
  max-width: 240px;
  z-index: 4;
  background: #fff;
  padding: 8px 16px;
  text-align: left;
  border-bottom: 2px solid rgba(0, 50, 116, 0.1);
  box-shadow: 2px 0 5px -2px rgba(0, 50, 116, 0.1);
}
.th-proj {
  position: sticky;
  top: 0;
  min-width: 90px;
  max-width: 110px;
  background: #fff;
  z-index: 3;
  padding: 8px 6px;
  text-align: center;
  font-weight: 600;
  color: #003274;
  border-bottom: 2px solid rgba(0, 50, 116, 0.1);
}

.proj-label {
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: center;
}
.proj-conf {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.proj-conf--public { background: #52C9A6; }
.proj-conf--confidential { background: #E74C3C; }
.proj-name {
  font-size: 10px;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Data cells */
.td-user {
  position: sticky;
  left: 0;
  background: #fff;
  padding: 8px 16px;
  min-width: 200px;
  max-width: 240px;
  z-index: 2;
  box-shadow: 2px 0 5px -2px rgba(0, 50, 116, 0.1);
}
.user-name { font-weight: 500; color: #003274; line-height: 1.3; }
.user-pos { font-size: 10px; color: #6B7280; line-height: 1.3; margin-top: 2px; }
.td-cell {
  padding: 4px;
  text-align: center;
  min-width: 90px;
  background: white;
}

/* Badges */
.cell-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: white;
}
.cell-badge--direct { background: #003274; }
.cell-badge--lead { background: #025EA1; }
.cell-badge--owner { background: #0476C9; }
.cell-badge--participant { background: rgba(0, 50, 116, 0.25); color: #003274; }
.cell-badge--public { background: rgba(82, 201, 166, 0.5); color: #1a8a64; }
.cell-badge--admin { background: #E74C3C; }
.cell-badge--director { background: #8E44AD; }
.cell-badge--expired {
  opacity: 0.4;
  text-decoration: line-through;
}

.empty-row {
  text-align: center;
  padding: 2rem;
  color: rgba(0, 50, 116, 0.3);
}

/* Legend */
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0.5rem 0.25rem;
  font-size: 11px;
  color: #6B7280;
}
.legend-title {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(0, 50, 116, 0.5);
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.legend-item .cell-badge { width: 18px; height: 18px; font-size: 10px; }
</style>
