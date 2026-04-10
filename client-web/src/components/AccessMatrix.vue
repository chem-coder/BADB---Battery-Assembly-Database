<script setup>
/**
 * AccessMatrix — spreadsheet view of who has access to what.
 * Rows = users, columns = projects, cells = effective access.
 *
 * Cell types:
 *  - AUTO (public/own-dept): light gray, no edit
 *  - Direct grant: colored by level (view/edit/admin), editable
 *  - Department grant: colored by level with dept icon, editable
 *  - Blank: no access
 */
import { ref, computed, onMounted } from 'vue'
import api from '@/services/api'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'

const loading = ref(true)
const users = ref([])
const projects = ref([])
const userGrants = ref([])
const deptGrants = ref([])
const departments = ref([])

// Filters
const searchQuery = ref('')
const selectedDepts = ref([])
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
    deptGrants.value = data.dept_grants
    departments.value = data.departments
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

// Build lookup maps for efficient cell rendering
const userGrantMap = computed(() => {
  const m = new Map()
  for (const g of userGrants.value) {
    if (!showExpired.value && g.is_expired) continue
    m.set(`${g.user_id}-${g.project_id}`, g)
  }
  return m
})

const deptGrantMap = computed(() => {
  const m = new Map()
  for (const g of deptGrants.value) {
    if (!showExpired.value && g.is_expired) continue
    m.set(`${g.department_id}-${g.project_id}`, g)
  }
  return m
})

const departmentHeadSet = computed(() => {
  // user_id → department_id where they are head
  const m = new Map()
  for (const d of departments.value) {
    if (d.head_user_id) m.set(d.head_user_id, d.department_id)
  }
  return m
})

// User lookup for dept-head creator checks
const userById = computed(() => {
  const m = new Map()
  for (const u of users.value) m.set(u.user_id, u)
  return m
})

// Precomputed cell map: key = "userId-projectId", value = cell data or null.
// Rebuilds when data/filters change; cell lookup in template is O(1).
const cellMap = computed(() => {
  const map = new Map()
  for (const user of users.value) {
    for (const project of projects.value) {
      const cell = computeCell(user, project)
      if (cell) map.set(`${user.user_id}-${project.project_id}`, cell)
    }
  }
  return map
})

function computeCell(user, project) {
  // Admin / director override
  if (user.role === 'admin') return { level: 'admin', source: 'admin_role', is_expired: false }
  if ((user.position || '').toLowerCase().includes('директор')) {
    return { level: 'admin', source: 'director', is_expired: false }
  }

  // Direct grant (highest priority)
  const direct = userGrantMap.value.get(`${user.user_id}-${project.project_id}`)
  if (direct) {
    return { level: direct.access_level, source: 'direct', is_expired: direct.is_expired }
  }

  // Department grant
  if (user.department_id) {
    const dept = deptGrantMap.value.get(`${user.department_id}-${project.project_id}`)
    if (dept) {
      return { level: dept.access_level, source: 'dept_grant', is_expired: dept.is_expired }
    }
  }

  // Department head seeing creator's department projects
  const headsOfDept = departmentHeadSet.value.get(user.user_id)
  if (headsOfDept) {
    const creator = userById.value.get(project.created_by)
    if (creator && creator.department_id === headsOfDept) {
      return { level: 'view', source: 'dept_head', is_expired: false }
    }
  }

  // Public project — everyone sees
  if (project.confidentiality_level === 'public') {
    return { level: 'view', source: 'public', is_expired: false }
  }

  // Department match
  if (project.confidentiality_level === 'department' && project.department_id === user.department_id) {
    return { level: 'view', source: 'own_department', is_expired: false }
  }

  return null
}

// O(1) template lookup
function cellFor(user, project) {
  return cellMap.value.get(`${user.user_id}-${project.project_id}`) || null
}

// Filtered rows
const filteredUsers = computed(() => {
  let list = users.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(u =>
      u.name.toLowerCase().includes(q) ||
      (u.position || '').toLowerCase().includes(q)
    )
  }
  if (selectedDepts.value.length > 0) {
    const s = new Set(selectedDepts.value)
    list = list.filter(u => s.has(u.department_id))
  }
  if (showOnlyWithGrants.value) {
    list = list.filter(u =>
      projects.value.some(p => {
        const c = cellFor(u, p)
        return c && (c.source === 'direct' || c.source === 'dept_grant')
      })
    )
  }
  return list
})

const filteredProjects = computed(() => {
  let list = projects.value
  if (selectedConfidentiality.value) {
    list = list.filter(p => p.confidentiality_level === selectedConfidentiality.value)
  }
  return list
})

// Stats
const stats = computed(() => {
  const activeGrants = userGrants.value.filter(g => !g.is_expired).length
          + deptGrants.value.filter(g => !g.is_expired).length
  const expiredGrants = userGrants.value.filter(g => g.is_expired).length
          + deptGrants.value.filter(g => g.is_expired).length
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
  { label: 'Отдел', value: 'department' },
  { label: 'Конф.', value: 'confidential' },
]

// CSV export
function exportCsv() {
  const header = ['Пользователь', 'Отдел', ...filteredProjects.value.map(p => p.name)]
  const rows = filteredUsers.value.map(u => {
    const row = [u.name, u.department_name || '']
    for (const p of filteredProjects.value) {
      const c = cellFor(u, p)
      if (!c) row.push('')
      else row.push(`${c.level}${c.is_expired ? ' (expired)' : ''} [${c.source}]`)
    }
    return row
  })
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
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
        <MultiSelect
          v-model="selectedDepts"
          :options="departments"
          optionLabel="name"
          optionValue="department_id"
          placeholder="Отделы"
          :maxSelectedLabels="2"
          selectedItemsLabel="{0} отделов"
          class="filter-dept"
        />
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
              <th class="th-sticky th-dept">Отдел</th>
              <th v-for="p in filteredProjects" :key="p.project_id" class="th-proj" :title="p.name">
                <div class="proj-label">
                  <span :class="['proj-conf', `proj-conf--${p.confidentiality_level || 'public'}`]" :title="p.confidentiality_level"></span>
                  <span class="proj-name">{{ p.name }}</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in filteredUsers" :key="u.user_id">
              <td class="td-user">
                <div class="user-name">{{ u.name }}</div>
                <div v-if="u.position" class="user-pos">{{ u.position }}</div>
              </td>
              <td class="td-dept">{{ u.department_name || '—' }}</td>
              <td v-for="p in filteredProjects" :key="p.project_id" class="td-cell">
                <template v-if="cellFor(u, p)">
                  <span
                    :class="['cell-badge', `cell-badge--${cellFor(u, p).source}`, cellFor(u, p).is_expired ? 'cell-badge--expired' : '']"
                    :title="`${cellFor(u, p).level} via ${cellFor(u, p).source}${cellFor(u, p).is_expired ? ' (истёк)' : ''}`"
                  >
                    {{ cellFor(u, p).level === 'admin' ? 'A' : cellFor(u, p).level === 'edit' ? 'E' : 'V' }}
                  </span>
                </template>
              </td>
            </tr>
            <tr v-if="!filteredUsers.length">
              <td :colspan="filteredProjects.length + 2" class="empty-row">Нет пользователей по фильтру</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Legend -->
    <div class="legend">
      <span class="legend-title">Легенда:</span>
      <span class="legend-item"><span class="cell-badge cell-badge--direct">V</span> явный grant</span>
      <span class="legend-item"><span class="cell-badge cell-badge--dept_grant">V</span> через отдел</span>
      <span class="legend-item"><span class="cell-badge cell-badge--public">V</span> public</span>
      <span class="legend-item"><span class="cell-badge cell-badge--own_department">V</span> свой отдел</span>
      <span class="legend-item"><span class="cell-badge cell-badge--dept_head">V</span> dept head</span>
      <span class="legend-item"><span class="cell-badge cell-badge--admin_role">A</span> admin</span>
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
.filter-dept, .filter-conf { width: 180px; }
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
}

.matrix-table {
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
}
.matrix-table th, .matrix-table td {
  border-bottom: 1px solid rgba(0, 50, 116, 0.05);
  border-right: 1px solid rgba(0, 50, 116, 0.04);
  padding: 0;
}

/* Sticky headers */
.th-sticky {
  position: sticky;
  background: rgba(255, 255, 255, 0.98);
  z-index: 3;
  backdrop-filter: blur(6px);
}
.th-user { left: 0; top: 0; min-width: 180px; max-width: 220px; z-index: 4; }
.th-dept { left: 180px; top: 0; min-width: 120px; z-index: 4; }
.th-proj {
  position: sticky;
  top: 0;
  min-width: 90px;
  max-width: 110px;
  background: rgba(255, 255, 255, 0.98);
  z-index: 2;
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
.proj-conf--department { background: #003274; }
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
  background: white;
  padding: 6px 10px;
  min-width: 180px;
  max-width: 220px;
  z-index: 1;
}
.user-name { font-weight: 500; color: #003274; }
.user-pos { font-size: 10px; color: #6B7280; }
.td-dept {
  position: sticky;
  left: 180px;
  background: white;
  padding: 6px 10px;
  font-size: 11px;
  color: #6B7280;
  min-width: 120px;
  z-index: 1;
}
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
.cell-badge--dept_grant { background: #025EA1; }
.cell-badge--public { background: rgba(82, 201, 166, 0.5); color: #1a8a64; }
.cell-badge--own_department { background: rgba(0, 50, 116, 0.25); color: #003274; }
.cell-badge--dept_head { background: rgba(211, 167, 84, 0.5); color: #8a6d2b; }
.cell-badge--admin_role { background: #E74C3C; }
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
