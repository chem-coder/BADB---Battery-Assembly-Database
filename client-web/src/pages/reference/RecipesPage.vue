<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import { useStatus } from '@/composables/useStatus'

const { statusMsg, statusError, showStatus } = useStatus()

const recipes = ref([])
const activeUsers = ref([])
const newName = ref('')
let cachedMaterials = null

// Form state
const formVisible = ref(false)
const mode = ref(null)
const currentId = ref(null)
const titleText = ref('')
const titleEditing = ref(false)
const titleInput = ref('')

const form = ref({
  created_by: '',
  variant_label: '',
  role: '',
  notes: '',
})

const recipeLines = ref([])
let lineCounter = 0

function makeEmptyLine() {
  return {
    _key: lineCounter++,
    recipe_role: '',
    material_id: '',
    slurry_percent: '',
    line_notes: '',
    filteredMaterials: [],
  }
}

function resetForm() {
  form.value = { created_by: '', variant_label: '', role: '', notes: '' }
  titleText.value = ''
  titleEditing.value = false
  titleInput.value = ''
  mode.value = null
  currentId.value = null
  recipeLines.value = []
  formVisible.value = false
}

// API
async function loadRecipes() {
  const { data } = await api.get('/api/recipes')
  recipes.value = data
}

async function loadUsers() {
  const { data } = await api.get('/api/users')
  activeUsers.value = data.filter(u => u.active)
}

async function fetchMaterials() {
  if (cachedMaterials) return cachedMaterials
  const { data } = await api.get('/api/materials')
  cachedMaterials = data
  return cachedMaterials
}

async function fetchRecipeLines(recipeId) {
  const { data } = await api.get(`/api/recipes/${recipeId}/lines`)
  return data
}

function filterMaterialsByRole(materials, recipeRole) {
  if (!recipeRole || recipeRole === 'other') return materials
  const roleMap = {
    cathode_active: 'cathode_active',
    anode_active: 'anode_active',
    binder: 'binder',
    additive: 'conductive_additive',
    solvent: 'solvent',
  }
  const materialRole = roleMap[recipeRole]
  if (!materialRole) return materials
  return materials.filter(m => m.role === materialRole)
}

async function updateLineFiltering(line) {
  const materials = await fetchMaterials()
  line.filteredMaterials = filterMaterialsByRole(materials, line.recipe_role)

  // Auto-set recipe role from active material selection
  if (line.recipe_role === 'cathode_active') form.value.role = 'cathode'
  if (line.recipe_role === 'anode_active') form.value.role = 'anode'
}

function addLine() {
  const line = makeEmptyLine()
  recipeLines.value.push(line)
}

function removeLine(index) {
  recipeLines.value.splice(index, 1)
}

// Validation
function validate() {
  const missing = []
  if (!form.value.created_by) missing.push('Кто добавил')
  if (!form.value.role) missing.push('Роль электрода')
  if (missing.length) {
    showStatus('Заполните обязательные поля: ' + missing.join(', '), true)
    return false
  }

  if (recipeLines.value.length === 0) {
    showStatus('Добавьте хотя бы один компонент', true)
    return false
  }

  for (const line of recipeLines.value) {
    if (!line.material_id) {
      showStatus('Выберите материал для каждого компонента', true)
      return false
    }
    if (line.recipe_role !== 'solvent') {
      const pct = Number(line.slurry_percent)
      if (line.slurry_percent === '' || isNaN(pct) || pct < 0 || pct > 100) {
        showStatus('Укажите корректный % (0–100) для каждого компонента', true)
        return false
      }
    }
  }

  // Duplicate name+variant check
  const variant = (form.value.variant_label || '').trim()
  const exists = recipes.value.some(r => {
    if (mode.value === 'edit' && r.tape_recipe_id === currentId.value) return false
    return r.name === titleText.value && (r.variant_label || '') === variant
  })
  if (exists) {
    showStatus('Рецепт с таким названием и версией уже существует', true)
    return false
  }

  return true
}

async function saveRecipe() {
  if (!mode.value) return
  if (!validate()) return

  const lines = recipeLines.value.map(l => ({
    material_id: Number(l.material_id),
    recipe_role: l.recipe_role,
    slurry_percent: l.slurry_percent === '' ? null : Number(l.slurry_percent),
    line_notes: l.line_notes || null,
  }))

  const payload = {
    name: titleText.value,
    role: form.value.role,
    variant_label: form.value.variant_label || null,
    notes: form.value.notes || null,
    created_by: Number(form.value.created_by),
    lines,
  }

  try {
    if (mode.value === 'create') {
      await api.post('/api/recipes', payload)
      showStatus('Рецепт сохранён')
    } else {
      await api.put(`/api/recipes/${currentId.value}`, payload)
      showStatus('Изменения сохранены')
    }
    resetForm()
    loadRecipes()
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка сохранения', true)
  }
}

async function deleteRecipe(r) {
  if (!confirm(`Удалить рецепт "${r.name}"?`)) return
  try {
    await api.delete(`/api/recipes/${r.tape_recipe_id}`)
    showStatus('Рецепт удалён')
    loadRecipes()
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка удаления', true)
  }
}

// Actions
async function onAddEnter() {
  if (formVisible.value) return
  const name = newName.value.trim()
  if (!name) return

  mode.value = 'create'
  currentId.value = null
  titleText.value = name
  formVisible.value = true
  newName.value = ''

  cachedMaterials = null
  recipeLines.value = []
  addLine()
}

async function startEdit(r) {
  mode.value = 'edit'
  currentId.value = r.tape_recipe_id
  titleText.value = r.name

  form.value = {
    created_by: r.created_by || '',
    variant_label: r.variant_label || '',
    role: r.role || '',
    notes: r.notes || '',
  }

  formVisible.value = true
  cachedMaterials = null
  loadUsers()

  const lines = await fetchRecipeLines(r.tape_recipe_id)
  await loadLinesIntoForm(lines)
}

async function duplicateRecipeUI(r) {
  mode.value = 'create'
  currentId.value = null
  titleText.value = r.name + ' (копия)'

  form.value = {
    created_by: '',
    variant_label: r.variant_label || '',
    role: r.role || '',
    notes: r.notes || '',
  }

  formVisible.value = true
  cachedMaterials = null
  loadUsers()

  const lines = await fetchRecipeLines(r.tape_recipe_id)
  await loadLinesIntoForm(lines)
}

async function loadLinesIntoForm(lines) {
  const materials = await fetchMaterials()
  recipeLines.value = lines.map(l => ({
    _key: lineCounter++,
    recipe_role: l.recipe_role || '',
    material_id: l.material_id || '',
    slurry_percent: l.slurry_percent ?? '',
    line_notes: l.line_notes || '',
    filteredMaterials: filterMaterialsByRole(materials, l.recipe_role),
  }))
}

// Editable title
function startTitleEdit() {
  titleInput.value = titleText.value
  titleEditing.value = true
}

function finishTitleEdit() {
  const val = titleInput.value.trim()
  if (val) titleText.value = val
  titleEditing.value = false
}

function roleLabel(role) {
  return role === 'cathode' ? 'катод' : role === 'anode' ? 'анод' : role
}

// Invalidate material cache on window refocus
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => { cachedMaterials = null })
}

onMounted(() => { loadRecipes(); loadUsers() })
</script>

<template>
  <div>
    <input
      v-model="newName"
      class="add-input"
      :disabled="formVisible"
      placeholder="+ Добавить рецепт"
      autocomplete="off"
      @keydown.enter="onAddEnter"
    />

    <!-- Form -->
    <form v-if="formVisible" autocomplete="off" @submit.prevent="saveRecipe">
      <fieldset>
        <legend>Метаданные</legend>
        <label>Кто добавил</label>
        <select
          v-model="form.created_by"
          :class="{ 'required-missing': !form.created_by && mode }"
          @focus="loadUsers"
        >
          <option value="">— выбрать пользователя —</option>
          <option v-for="u in activeUsers" :key="u.user_id" :value="u.user_id">{{ u.name }}</option>
        </select>
        <RouterLink to="/reference/users" target="_blank" class="ref-link">Управление пользователями</RouterLink>
      </fieldset>

      <fieldset>
        <legend>Описание рецепта</legend>

        <input
          v-if="titleEditing"
          v-model="titleInput"
          @blur="finishTitleEdit"
          @keydown.enter.prevent="finishTitleEdit"
        />
        <h2 v-else style="cursor: pointer" @click="startTitleEdit">{{ titleText }}</h2>

        <label>Вариант/версия</label>
        <input v-model="form.variant_label" type="text" placeholder="A / B / low binder / v2" />

        <label>Роль электрода</label>
        <select
          v-model="form.role"
          :class="{ 'required-missing': !form.role && mode }"
        >
          <option value="">— выбрать —</option>
          <option value="cathode">катод</option>
          <option value="anode">анод</option>
        </select>

        <label>Комментарии</label>
        <textarea v-model="form.notes" rows="3" placeholder="Кратко: что это за рецепт и чем отличается"></textarea>
      </fieldset>

      <fieldset>
        <legend>Состав рецепта</legend>
        <div style="overflow-x: auto">
          <table class="recipe-table">
            <thead>
              <tr>
                <th>Функциональная роль</th>
                <th>Материал</th>
                <th>% в пасте</th>
                <th>Заметки</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, idx) in recipeLines" :key="line._key" class="recipe-line-row">
                <td>
                  <select v-model="line.recipe_role" @change="updateLineFiltering(line)">
                    <option value="">— выбрать —</option>
                    <option value="cathode_active">катодный активный материал</option>
                    <option value="anode_active">анодный активный материал</option>
                    <option value="binder">Связующее</option>
                    <option value="additive">Добавка</option>
                    <option value="solvent">Растворитель</option>
                  </select>
                </td>
                <td>
                  <select v-model="line.material_id">
                    <option value="">— выбрать —</option>
                    <option
                      v-for="m in line.filteredMaterials"
                      :key="m.material_id"
                      :value="m.material_id"
                    >{{ m.name }}</option>
                  </select>
                </td>
                <td>
                  <input v-model="line.slurry_percent" type="number" step="0.01" min="0" max="100" />
                </td>
                <td>
                  <input v-model="line.line_notes" type="text" placeholder="Комментарий" />
                </td>
                <td>
                  <button type="button" @click="removeLine(idx)">🗑</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button type="button" @click="addLine">+ Добавить компонент</button>
        <RouterLink to="/reference/materials" target="_blank" class="ref-link">Управление материалами</RouterLink>
      </fieldset>

      <button type="submit">Сохранить запись</button>
      <button type="button" @click="resetForm">Выйти</button>
    </form>

    <div
      v-if="statusMsg"
      class="status-feedback"
      :style="{ color: statusError ? '#b00020' : 'darkcyan' }"
    >
      {{ statusMsg }}
    </div>

    <!-- List -->
    <ul class="items-list">
      <li v-for="r in recipes" :key="r.tape_recipe_id" class="item-row">
        <div class="item-info">
          <span style="display: inline-block; width: 14vw">{{ r.name }}</span>
          <span style="display: inline-block; width: 7vw">{{ roleLabel(r.role) }}</span>
          <span v-if="r.active_percent != null" style="display: inline-block; width: 4vw">{{ r.active_percent }}%</span>
          <span v-else style="display: inline-block; width: 4vw"></span>
          <span style="display: inline-block; width: 10vw">{{ r.active_material_name || '' }}</span>
          <span style="display: inline-block; width: 20vw">{{ r.variant_label || '' }}</span>
        </div>
        <div class="actions">
          <button title="Редактировать" @click="startEdit(r)">✏️</button>
          <button title="Дублировать" @click="duplicateRecipeUI(r)">📄</button>
          <button title="Удалить" @click="deleteRecipe(r)">🗑</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.recipe-table {
  border-collapse: collapse;
  table-layout: fixed;
  min-width: 900px;
}

.recipe-table th,
.recipe-table td {
  padding: 0.25rem 0.4rem;
  vertical-align: middle;
  white-space: nowrap;
  text-align: left;
}

.recipe-table thead th {
  border-bottom: 1px solid #ccc;
  font-weight: 600;
}

.recipe-table input,
.recipe-table select {
  width: 100%;
  box-sizing: border-box;
}

.recipe-table th:nth-child(1),
.recipe-table td:nth-child(1) { width: 180px; }

.recipe-table th:nth-child(2),
.recipe-table td:nth-child(2) { width: 260px; }
</style>
