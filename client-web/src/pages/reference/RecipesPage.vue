<script setup>
/**
 * RecipesPage — "Рецептуры" (справочник)
 * Uses CrudTable + SaveIndicator (from Design System).
 * Create/edit form in Dialog with nested recipe lines table.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import api from '@/services/api'
import { toastApiError } from '@/utils/errorClassifier'
import PageHeader from '@/components/PageHeader.vue'
import SaveIndicator from '@/components/SaveIndicator.vue'
import CrudTable from '@/components/CrudTable.vue'
import EntityMeta from '@/components/EntityMeta.vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'

const toast = useToast()
const crudTable = ref(null)

// ── Data ───────────────────────────────────────────────────────────────
const recipes = ref([])
const loading = ref(false)
let cachedMaterials = null

async function loadRecipes() {
  loading.value = true
  try {
    const { data } = await api.get('/api/recipes')
    recipes.value = data
  } catch (err) {
    toastApiError(toast, err, 'Не удалось загрузить рецептуры')
  } finally {
    loading.value = false
  }
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

onMounted(() => { loadRecipes() })

// Invalidate material cache on window refocus
function onWindowFocus() { cachedMaterials = null }
onMounted(() => window.addEventListener('focus', onWindowFocus))
onUnmounted(() => window.removeEventListener('focus', onWindowFocus))

// ── Column config ──────────────────────────────────────────────────────
const columns = [
  { field: 'name',                 header: 'Название',       minWidth: '150px' },
  { field: 'role',                 header: 'Электрод',       minWidth: '80px',  width: '110px' },
  { field: 'active_percent',       header: '% АМ',           minWidth: '60px',  width: '80px' },
  { field: 'active_material_name', header: 'Активный материал', minWidth: '120px', width: '180px' },
  { field: 'variant_label',        header: 'Версия',         minWidth: '100px', width: '180px' },
  { field: 'created_by_name',      header: 'Оператор',       minWidth: '90px',  width: '130px' },
]

// ── Save indicator (delete flow) ──────────────────────────────────────
const pendingDelete = ref([])
const saveState = ref('idle')
let saveTimer = null

function onDelete(items) {
  pendingDelete.value = items
  saveState.value = 'idle'
}

async function confirmSave() {
  try {
    for (const item of pendingDelete.value) {
      await api.delete(`/api/recipes/${item.tape_recipe_id}`)
    }
    pendingDelete.value = []
    saveState.value = 'saved'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveState.value = 'idle' }, 2000)
    crudTable.value?.clearSelection()
    await loadRecipes()
  } catch (err) {
    toastApiError(toast, err, 'Не удалось удалить')
  }
}

function discardChanges() {
  pendingDelete.value = []
  saveState.value = 'idle'
  crudTable.value?.clearSelection()
}

onUnmounted(() => clearTimeout(saveTimer))

// ── Recipe lines ──────────────────────────────────────────────────────
let lineCounter = 0
const recipeLines = ref([])

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

function addLine() {
  recipeLines.value.push(makeEmptyLine())
}

function removeLine(index) {
  recipeLines.value.splice(index, 1)
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
  if (line.recipe_role === 'cathode_active') form.value.role = 'cathode'
  if (line.recipe_role === 'anode_active') form.value.role = 'anode'
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

// ── Form (Dialog) ─────────────────────────────────────────────────────
const formVisible = ref(false)
const mode = ref(null)
const currentId = ref(null)
// Full row of the entity being edited — fed to EntityMeta for the
// "Создано: ФИО, дата" + "Изменено: ФИО, дата" read-only audit trail.
const currentItem = ref(null)

// `created_by` is NOT part of the form — backend forces it from the
// authenticated user (req.user.userId, see routes/recipes.js). The
// existing creator is shown read-only via EntityMeta when available.
const form = ref({
  name: '',
  variant_label: '',
  role: '',
  notes: '',
})

function resetForm() {
  form.value = { name: '', variant_label: '', role: '', notes: '' }
  mode.value = null
  currentId.value = null
  currentItem.value = null
  recipeLines.value = []
  formVisible.value = false
}

function openCreate() {
  resetForm()
  mode.value = 'create'
  cachedMaterials = null
  recipeLines.value = [makeEmptyLine()]
  formVisible.value = true
}

async function openEdit(recipe) {
  mode.value = 'edit'
  currentId.value = recipe.tape_recipe_id
  currentItem.value = recipe
  form.value = {
    name: recipe.name || '',
    variant_label: recipe.variant_label || '',
    role: recipe.role || '',
    notes: recipe.notes || '',
  }
  formVisible.value = true
  cachedMaterials = null

  const lines = await fetchRecipeLines(recipe.tape_recipe_id)
  await loadLinesIntoForm(lines)
}

async function openDuplicate(recipe) {
  mode.value = 'create'
  currentId.value = null
  form.value = {
    name: recipe.name + ' (копия)',
    variant_label: recipe.variant_label || '',
    role: recipe.role || '',
    notes: recipe.notes || '',
  }
  formVisible.value = true
  cachedMaterials = null

  const lines = await fetchRecipeLines(recipe.tape_recipe_id)
  await loadLinesIntoForm(lines)
}

// ── Validation & Save ─────────────────────────────────────────────────
function validate() {
  if (!form.value.name?.trim()) {
    toast.add({ severity: 'warn', summary: 'Заполните название рецепта', life: 3000 })
    return false
  }
  if (!form.value.role) {
    toast.add({ severity: 'warn', summary: 'Выберите роль электрода', life: 3000 })
    return false
  }
  if (recipeLines.value.length === 0) {
    toast.add({ severity: 'warn', summary: 'Добавьте хотя бы один компонент', life: 3000 })
    return false
  }
  for (const line of recipeLines.value) {
    if (!line.material_id) {
      toast.add({ severity: 'warn', summary: 'Выберите материал для каждого компонента', life: 3000 })
      return false
    }
    if (line.recipe_role !== 'solvent') {
      const pct = Number(line.slurry_percent)
      if (line.slurry_percent === '' || isNaN(pct) || pct < 0 || pct > 100) {
        toast.add({ severity: 'warn', summary: 'Укажите корректный % (0-100) для каждого компонента', life: 3000 })
        return false
      }
    }
  }
  const variant = (form.value.variant_label || '').trim()
  const exists = recipes.value.some(r => {
    if (mode.value === 'edit' && r.tape_recipe_id === currentId.value) return false
    return r.name === form.value.name.trim() && (r.variant_label || '') === variant
  })
  if (exists) {
    toast.add({ severity: 'warn', summary: 'Рецепт с таким названием и версией уже существует', life: 3000 })
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

  // created_by intentionally NOT in the payload — backend forces it
  // from the authenticated user (routes/recipes.js POST).
  const payload = {
    name: form.value.name.trim(),
    role: form.value.role,
    variant_label: form.value.variant_label || null,
    notes: form.value.notes || null,
    lines,
  }

  try {
    if (mode.value === 'create') {
      await api.post('/api/recipes', payload)
      toast.add({ severity: 'success', summary: 'Рецепт сохранён', life: 3000 })
    } else {
      await api.put(`/api/recipes/${currentId.value}`, payload)
      toast.add({ severity: 'success', summary: 'Изменения сохранены', life: 3000 })
    }
    resetForm()
    await loadRecipes()
  } catch (err) {
    toastApiError(toast, err, 'Ошибка сохранения')
  }
}

function roleLabel(role) {
  return role === 'cathode' ? 'катод' : role === 'anode' ? 'анод' : role || '—'
}
</script>

<template>
  <div class="recipes-page">

    <PageHeader title="Рецептуры" icon="pi pi-file-edit">
      <template #actions>
        <SaveIndicator
          :visible="pendingDelete.length > 0 || saveState === 'saved'"
          :saved="saveState === 'saved'"
          @save="confirmSave"
          @cancel="discardChanges"
        />
      </template>
    </PageHeader>

    <CrudTable
      ref="crudTable"
      :columns="columns"
      :data="recipes"
      :loading="loading"
      id-field="tape_recipe_id"
      table-name="Рецептуры"
      show-add
      row-clickable
      @add="openCreate"
      @delete="onDelete"
      @row-click="(data) => openEdit(data)"
    >
      <template #col-name="{ data }">
        <strong>{{ data.name }}</strong>
      </template>
      <template #col-role="{ data }">
        <span :class="['role-badge', data.role === 'cathode' ? 'role-badge--cathode' : 'role-badge--anode']">
          {{ roleLabel(data.role) }}
        </span>
      </template>
      <template #col-active_percent="{ data }">
        {{ data.active_percent != null ? data.active_percent + '%' : '' }}
      </template>
      <template #col-active_material_name="{ data }">
        <span class="meta-text">{{ data.active_material_name || '' }}</span>
      </template>
      <template #col-variant_label="{ data }">
        <span class="meta-text">{{ data.variant_label || '' }}</span>
      </template>
    </CrudTable>

    <!-- ── Create / Edit Dialog ── -->
    <Dialog
      v-model:visible="formVisible"
      :header="mode === 'create' ? 'Новый рецепт' : 'Редактирование рецепта'"
      :style="{ width: '700px' }"
      modal
    >
      <div class="form-section">
        <div class="form-grid">
          <label>Название</label>
          <InputText v-model="form.name" placeholder="Название рецепта" class="w-full" />

          <label>Версия</label>
          <InputText v-model="form.variant_label" placeholder="A / B / low binder / v2" class="w-full" />

          <label>Электрод</label>
          <Select
            v-model="form.role"
            :options="[{ label: 'катод', value: 'cathode' }, { label: 'анод', value: 'anode' }]"
            optionLabel="label"
            optionValue="value"
            placeholder="-- выбрать --"
            class="w-full"
          />

          <label>Комментарии</label>
          <Textarea v-model="form.notes" rows="2" placeholder="Кратко: что это за рецепт" class="w-full" />
        </div>
      </div>

      <!-- Recipe lines -->
      <div class="form-section">
        <div class="section-header">
          <span class="section-title">Состав рецепта</span>
          <Button label="+ Компонент" severity="secondary" outlined size="small" @click="addLine" />
        </div>

        <div class="lines-table-wrap">
          <table class="lines-table">
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
              <tr v-for="(line, idx) in recipeLines" :key="line._key">
                <td>
                  <Select
                    v-model="line.recipe_role"
                    :options="[{ label: 'катодный АМ', value: 'cathode_active' }, { label: 'анодный АМ', value: 'anode_active' }, { label: 'связующее', value: 'binder' }, { label: 'добавка', value: 'additive' }, { label: 'растворитель', value: 'solvent' }]"
                    optionLabel="label"
                    optionValue="value"
                    placeholder="-- роль --"
                    @change="updateLineFiltering(line)"
                  />
                </td>
                <td>
                  <Select
                    v-model="line.material_id"
                    :options="line.filteredMaterials"
                    optionLabel="name"
                    optionValue="material_id"
                    placeholder="-- материал --"
                  />
                </td>
                <td>
                  <InputText v-model="line.slurry_percent" style="width: 80px" />
                </td>
                <td>
                  <InputText v-model="line.line_notes" placeholder="Комментарий" />
                </td>
                <td>
                  <Button icon="pi pi-trash" severity="danger" text @click="removeLine(idx)" />
                </td>
              </tr>
              <tr v-if="recipeLines.length === 0">
                <td colspan="5" class="empty-lines">Нет компонентов</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <EntityMeta
        v-if="mode === 'edit' && currentItem"
        :createdByName="currentItem.created_by_name"
        :createdAt="currentItem.created_at"
        :updatedByName="currentItem.updated_by_name"
        :updatedAt="currentItem.updated_at"
      />

      <template #footer>
        <div class="dialog-footer">
          <div>
            <Button
              v-if="mode === 'edit'"
              label="Дублировать"
              severity="secondary"
              outlined
              @click="() => { const r = recipes.find(r => r.tape_recipe_id === currentId); if (r) openDuplicate(r) }"
            />
          </div>
          <div class="dialog-footer-right">
            <Button label="Отмена" severity="secondary" outlined @click="resetForm" />
            <Button :label="mode === 'create' ? 'Создать' : 'Сохранить'" @click="saveRecipe" />
          </div>
        </div>
      </template>
    </Dialog>

  </div>
</template>

<style scoped>
.recipes-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.recipes-page :deep(.page-header) { margin-bottom: 3px !important; }

/* ── Form styles ── */
.form-section {
  margin-bottom: 1.25rem;
}
.form-grid {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 10px 16px;
  align-items: center;
}
.form-grid label {
  font-size: 13px;
  font-weight: 500;
  color: #003274;
}
.w-full { width: 100%; }

/* ── Section header ── */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}
.section-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.5);
}

/* ── Lines table ── */
.lines-table-wrap {
  overflow-x: auto;
}
.lines-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 600px;
}
.lines-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #4B5563;
  padding: 0.35rem 0.4rem;
  border-bottom: 1px solid #D1D7DE;
}
.lines-table td {
  padding: 0.3rem 0.4rem;
  vertical-align: middle;
}
.lines-table :deep(.p-select),
.lines-table :deep(.p-inputtext) {
  width: 100%;
}
.lines-table th:nth-child(1), .lines-table td:nth-child(1) { width: 160px; }
.lines-table th:nth-child(2), .lines-table td:nth-child(2) { width: 200px; }
.lines-table th:nth-child(3), .lines-table td:nth-child(3) { width: 80px; }
.lines-table th:nth-child(5), .lines-table td:nth-child(5) { width: 40px; }

.empty-lines {
  text-align: center;
  color: #6B7280;
  font-size: 13px;
  padding: 1rem 0;
}


/* ── Role badges ── */
.role-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}
.role-badge--cathode { background: rgba(0, 50, 116, 0.08); color: #003274; }
.role-badge--anode { background: rgba(211, 167, 84, 0.15); color: #9a7030; }

.meta-text { color: #6B7280; font-size: 13px; }

/* ── Dialog footer ── */
.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.dialog-footer-right {
  display: flex;
  gap: 0.5rem;
}
</style>
