<script setup>
/**
 * MaterialsPage — "Материалы" (справочник)
 * Master-detail layout: left panel = material list, right panel = instances & components.
 * All CRUD inline, no dialogs.
 */
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import api from '@/services/api'
import PageHeader from '@/components/PageHeader.vue'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'

const toast = useToast()

const roleMap = {
  cathode_active: 'катодный АМ',
  anode_active: 'анодный АМ',
  binder: 'связующее',
  conductive_additive: 'добавка',
  solvent: 'растворитель',
  other: 'другое',
}

const roleOptions = [
  { value: 'cathode_active', label: 'Катодный АМ' },
  { value: 'anode_active', label: 'Анодный АМ' },
  { value: 'binder', label: 'Связующее' },
  { value: 'conductive_additive', label: 'Добавка' },
  { value: 'solvent', label: 'Растворитель' },
  { value: 'other', label: 'Другое' },
]

// ── Materials ─────────────────────────────────────────────────────────
const materials = ref([])
const filterText = ref('')
const filterRole = ref('')
const selectedMaterialId = ref(null)

const filteredMaterials = computed(() => {
  let result = materials.value
  const q = filterText.value.toLowerCase().trim()
  if (q) result = result.filter(m => m.name.toLowerCase().includes(q))
  if (filterRole.value) result = result.filter(m => m.role === filterRole.value)
  return result
})

const selectedMaterial = computed(() =>
  materials.value.find(m => m.material_id === selectedMaterialId.value) || null
)

async function loadMaterials() {
  try {
    const { data } = await api.get('/api/materials')
    materials.value = data.sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Не удалось загрузить материалы', life: 3000 })
  }
}

onMounted(loadMaterials)

function selectMaterial(m) {
  if (selectedMaterialId.value === m.material_id) return
  selectedMaterialId.value = m.material_id
  editForm.value = { name: m.name, role: m.role }
  instances.value = []
  openInstances.value = new Set()
  componentsMap.value = {}
  componentsLoaded.value = {}
  cancelAllEdits()
  resetInstanceCreate()
  resetComponentCreate()
  loadInstances(m.material_id)
}

// ── Create material (inline in left panel) ────────────────────────────
const creatingMaterial = ref(false)
const newMaterialForm = ref({ name: '', role: '' })

function startMaterialCreate() {
  creatingMaterial.value = true
  newMaterialForm.value = { name: '', role: '' }
}

function cancelMaterialCreate() {
  creatingMaterial.value = false
  newMaterialForm.value = { name: '', role: '' }
}

async function saveNewMaterial() {
  const name = newMaterialForm.value.name.trim()
  if (!name) { toast.add({ severity: 'warn', summary: 'Название обязательно', life: 3000 }); return }
  if (!newMaterialForm.value.role) { toast.add({ severity: 'warn', summary: 'Роль обязательна', life: 3000 }); return }
  try {
    const { data } = await api.post('/api/materials', { name, role: newMaterialForm.value.role })
    toast.add({ severity: 'success', summary: 'Материал создан', life: 3000 })
    cancelMaterialCreate()
    await loadMaterials()
    // Auto-select the new material
    const created = materials.value.find(m => m.name === name)
    if (created) selectMaterial(created)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: err.response?.data?.error || 'Ошибка создания', life: 3000 })
  }
}

// ── Edit material (right panel metadata) ──────────────────────────────
const editForm = ref({ name: '', role: '' })

async function saveMaterialEdit() {
  const name = editForm.value.name.trim()
  if (!name) return
  try {
    await api.put(`/api/materials/${selectedMaterialId.value}`, {
      name,
      role: editForm.value.role,
    })
    toast.add({ severity: 'success', summary: 'Материал обновлён', life: 3000 })
    await loadMaterials()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: err.response?.data?.error || 'Ошибка обновления', life: 3000 })
  }
}

async function deleteMaterial(m) {
  if (!confirm(`Удалить материал "${m.name}"?`)) return
  try {
    await api.delete(`/api/materials/${m.material_id}`)
    toast.add({ severity: 'success', summary: 'Удалено', life: 3000 })
    if (selectedMaterialId.value === m.material_id) {
      selectedMaterialId.value = null
    }
    await loadMaterials()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: err.response?.data?.error || 'Ошибка удаления', life: 3000 })
  }
}

// ── Instances ─────────────────────────────────────────────────────────
const instances = ref([])
const instancesLoading = ref(false)
const openInstances = ref(new Set())
const componentsMap = ref({})
const componentsLoaded = ref({})
const allInstances = ref([])

async function loadInstances(materialId) {
  instancesLoading.value = true
  try {
    const { data } = await api.get(`/api/materials/${materialId}/instances`)
    instances.value = data.sort((a, b) => a.name.localeCompare(b.name))
    // Auto-expand all instances and load their components
    const ids = instances.value.map(i => i.material_instance_id)
    openInstances.value = new Set(ids)
    ids.forEach(id => {
      if (!componentsLoaded.value[id]) loadComponents(id)
    })
  } finally {
    instancesLoading.value = false
  }
}

async function loadComponents(instanceId) {
  const { data } = await api.get(`/api/materials/instances/${instanceId}/components`)
  componentsMap.value[instanceId] = data
  componentsLoaded.value[instanceId] = true
}

async function loadAllInstances() {
  const { data } = await api.get('/api/materials/instances')
  allInstances.value = data
}

function toggleInstance(inst) {
  const id = inst.material_instance_id
  if (openInstances.value.has(id)) {
    openInstances.value = new Set([...openInstances.value].filter(x => x !== id))
  } else {
    openInstances.value = new Set([...openInstances.value, id])
    if (!componentsLoaded.value[id]) loadComponents(id)
  }
}

// ── Mutual exclusion for edit/create states ───────────────────────────
const editingInstanceId = ref(null)
const editInstanceForm = ref({ name: '', notes: '' })
const editingComponentId = ref(null)
const editComponentForm = ref({ mass_fraction: '', notes: '' })
const creatingInstance = ref(false)
const newInstanceForm = ref({ name: '', notes: '' })
const creatingComponentFor = ref(null)
const newComponentForm = ref({ instance_id: '', percent: '', notes: '' })

function cancelAllEdits() {
  editingInstanceId.value = null
  editingComponentId.value = null
  creatingInstance.value = false
  creatingComponentFor.value = null
}

// ── Instance CRUD ─────────────────────────────────────────────────────
function startEditInstance(inst) {
  cancelAllEdits()
  editingInstanceId.value = inst.material_instance_id
  editInstanceForm.value = { name: inst.name, notes: inst.notes || '' }
}

function cancelEditInstance() { editingInstanceId.value = null }

async function saveEditInstance(inst) {
  const name = editInstanceForm.value.name.trim()
  if (!name) return
  try {
    await api.put(`/api/materials/instances/${inst.material_instance_id}`, {
      name,
      notes: editInstanceForm.value.notes.trim() || null,
    })
    toast.add({ severity: 'success', summary: 'Экземпляр обновлён', life: 3000 })
    editingInstanceId.value = null
    await loadInstances(selectedMaterialId.value)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: err.response?.data?.error || 'Ошибка обновления', life: 3000 })
  }
}

async function deleteInstance(inst) {
  if (!confirm(`Удалить экземпляр "${inst.name}"?`)) return
  try {
    await api.delete(`/api/materials/instances/${inst.material_instance_id}`)
    toast.add({ severity: 'success', summary: 'Экземпляр удалён', life: 3000 })
    await loadInstances(selectedMaterialId.value)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: err.response?.data?.error || 'Ошибка удаления', life: 3000 })
  }
}

function startInstanceCreate() {
  cancelAllEdits()
  creatingInstance.value = true
  newInstanceForm.value = { name: '', notes: '' }
}

function resetInstanceCreate() {
  creatingInstance.value = false
  newInstanceForm.value = { name: '', notes: '' }
}

async function saveNewInstance() {
  const name = newInstanceForm.value.name.trim()
  if (!name) return
  try {
    await api.post(`/api/materials/${selectedMaterialId.value}/instances`, {
      name,
      notes: newInstanceForm.value.notes.trim() || null,
    })
    toast.add({ severity: 'success', summary: 'Экземпляр создан', life: 3000 })
    resetInstanceCreate()
    await loadInstances(selectedMaterialId.value)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: err.response?.data?.error || 'Ошибка создания', life: 3000 })
  }
}

// ── Component CRUD ────────────────────────────────────────────────────
function startEditComponent(comp) {
  cancelAllEdits()
  editingComponentId.value = comp.material_instance_component_id
  editComponentForm.value = {
    mass_fraction: (comp.mass_fraction * 100).toFixed(2),
    notes: comp.notes || '',
  }
}

function cancelEditComponent() { editingComponentId.value = null }

async function saveEditComponent(comp, instanceId) {
  const pct = Number(editComponentForm.value.mass_fraction)
  if (isNaN(pct) || pct <= 0 || pct > 100) {
    toast.add({ severity: 'warn', summary: 'Некорректный % (0-100)', life: 3000 })
    return
  }
  try {
    await api.put(`/api/materials/instances/components/${comp.material_instance_component_id}`, {
      mass_fraction: pct / 100,
      notes: editComponentForm.value.notes.trim() || null,
    })
    toast.add({ severity: 'success', summary: 'Компонент обновлён', life: 3000 })
    editingComponentId.value = null
    await loadComponents(instanceId)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: err.response?.data?.error || 'Ошибка обновления', life: 3000 })
  }
}

async function deleteComponent(comp, instanceId) {
  if (!confirm('Удалить компонент?')) return
  try {
    await api.delete(`/api/materials/instances/components/${comp.material_instance_component_id}`)
    toast.add({ severity: 'success', summary: 'Компонент удалён', life: 3000 })
    await loadComponents(instanceId)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: err.response?.data?.error || 'Ошибка удаления', life: 3000 })
  }
}

async function startComponentCreate(instanceId) {
  cancelAllEdits()
  creatingComponentFor.value = instanceId
  newComponentForm.value = { instance_id: '', percent: '', notes: '' }
  await loadAllInstances()
}

function resetComponentCreate() {
  creatingComponentFor.value = null
  newComponentForm.value = { instance_id: '', percent: '', notes: '' }
}

async function saveNewComponent(instanceId) {
  const matInstId = newComponentForm.value.instance_id
  const pct = Number(newComponentForm.value.percent)
  if (!matInstId) { toast.add({ severity: 'warn', summary: 'Выберите экземпляр', life: 3000 }); return }
  if (isNaN(pct) || pct <= 0 || pct > 100) {
    toast.add({ severity: 'warn', summary: 'Некорректный % (0-100)', life: 3000 })
    return
  }
  try {
    await api.post(`/api/materials/instances/${instanceId}/components`, {
      component_material_instance_id: Number(matInstId),
      mass_fraction: pct / 100,
      notes: newComponentForm.value.notes.trim() || null,
    })
    toast.add({ severity: 'success', summary: 'Компонент добавлен', life: 3000 })
    resetComponentCreate()
    await loadComponents(instanceId)
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Ошибка', detail: err.response?.data?.error || 'Ошибка создания', life: 3000 })
  }
}

function onEditKeydown(e, saveFn, cancelFn) {
  if (e.key === 'Enter') { e.preventDefault(); saveFn() }
  if (e.key === 'Escape') cancelFn()
}
</script>

<template>
  <div class="materials-page">
    <PageHeader title="Материалы" icon="pi pi-warehouse" />

    <div class="materials-content">
      <!-- ── Left Panel: Material List ── -->
      <div class="left-panel">
        <div class="left-toolbar">
          <Button label="Добавить" icon="pi pi-plus" severity="secondary" outlined class="add-btn" @click="startMaterialCreate" />
        </div>

        <!-- Inline create material -->
        <div v-if="creatingMaterial" class="create-material-form">
          <InputText
            v-model="newMaterialForm.name"
            placeholder="Название"
            class="w-full"
            @keydown.enter.prevent="saveNewMaterial"
            @keydown.escape="cancelMaterialCreate"
          />
          <Select
            v-model="newMaterialForm.role"
            :options="roleOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="-- роль --"
            class="w-full"
          />
          <div class="create-material-actions">
            <Button label="Создать" @click="saveNewMaterial" />
            <Button label="Отмена" severity="secondary" outlined @click="cancelMaterialCreate" />
          </div>
        </div>

        <!-- Filters -->
        <div class="filter-wrap">
          <InputText v-model="filterText" placeholder="Поиск..." class="w-full" />
          <div class="role-chips">
            <button
              v-for="opt in roleOptions"
              :key="opt.value"
              :class="['role-chip', { active: filterRole === opt.value }]"
              @click="filterRole = filterRole === opt.value ? '' : opt.value"
            >{{ opt.label }}</button>
          </div>
        </div>

        <!-- Material list -->
        <div class="material-list">
          <div
            v-for="m in filteredMaterials"
            :key="m.material_id"
            :class="['material-item', { active: selectedMaterialId === m.material_id }]"
            @click="selectMaterial(m)"
          >
            <div class="material-item-info">
              <span class="material-item-name">{{ m.name }}</span>
              <span class="material-item-role">{{ roleMap[m.role] || m.role }}</span>
            </div>
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              class="material-item-delete"
              @click.stop="deleteMaterial(m)"
            />
          </div>
          <div v-if="filteredMaterials.length === 0" class="empty-text">
            {{ filterText ? 'Ничего не найдено' : 'Нет материалов' }}
          </div>
        </div>
      </div>

      <!-- ── Right Panel: Selected Material Detail ── -->
      <div class="right-panel">
        <template v-if="selectedMaterial">
          <!-- Metadata -->
          <div class="detail-section">
            <div class="section-title">Метаданные</div>
            <div class="metadata-row">
              <InputText v-model="editForm.name" placeholder="Название" class="meta-name" />
              <Select
                v-model="editForm.role"
                :options="roleOptions"
                optionLabel="label"
                optionValue="value"
                class="meta-role"
              />
              <Button label="Сохранить" @click="saveMaterialEdit" />
            </div>
          </div>

          <!-- Instances -->
          <div class="detail-section">
            <div class="section-header">
              <span class="section-title">Экземпляры</span>
              <Button label="Экземпляр" icon="pi pi-plus" severity="secondary" outlined @click="startInstanceCreate" />
            </div>

            <div v-if="instancesLoading" class="loading-text">Загрузка...</div>

            <div v-else class="instances-list">
              <div v-for="inst in instances" :key="inst.material_instance_id" class="instance-block">
                <!-- Instance row -->
                <div class="instance-row">
                  <button type="button" class="expand-btn" @click="toggleInstance(inst)">
                    <i :class="['pi', openInstances.has(inst.material_instance_id) ? 'pi-chevron-down' : 'pi-chevron-right']" />
                  </button>

                  <template v-if="editingInstanceId === inst.material_instance_id">
                    <InputText
                      v-model="editInstanceForm.name"
                      class="inst-name-input"
                      @keydown="onEditKeydown($event, () => saveEditInstance(inst), cancelEditInstance)"
                    />
                    <InputText
                      v-model="editInstanceForm.notes"
                      placeholder="Комментарий"
                      class="inst-notes-input"
                      @keydown="onEditKeydown($event, () => saveEditInstance(inst), cancelEditInstance)"
                    />
                    <Button icon="pi pi-check" text @click="saveEditInstance(inst)" />
                    <Button icon="pi pi-times" text severity="secondary" @click="cancelEditInstance" />
                  </template>

                  <template v-else>
                    <span class="inst-name">{{ inst.name }}</span>
                    <span v-if="inst.notes" class="inst-notes">{{ inst.notes }}</span>
                    <div class="actions">
                      <Button icon="pi pi-pencil" text @click.stop="startEditInstance(inst)" />
                      <Button icon="pi pi-trash" text severity="danger" @click.stop="deleteInstance(inst)" />
                    </div>
                  </template>
                </div>

                <!-- Components (expanded) -->
                <div v-if="openInstances.has(inst.material_instance_id)" class="components-section">
                  <template v-if="componentsLoaded[inst.material_instance_id]">
                    <table v-if="(componentsMap[inst.material_instance_id] || []).length > 0" class="comp-table">
                      <thead>
                        <tr>
                          <th>Компонент</th>
                          <th>%</th>
                          <th>Заметки</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="comp in componentsMap[inst.material_instance_id]" :key="comp.material_instance_component_id">
                          <template v-if="editingComponentId === comp.material_instance_component_id">
                            <td>{{ comp.component_name }}</td>
                            <td>
                              <InputText
                                v-model="editComponentForm.mass_fraction"
                                class="input-narrow"
                                @keydown="onEditKeydown($event, () => saveEditComponent(comp, inst.material_instance_id), cancelEditComponent)"
                              />
                            </td>
                            <td>
                              <InputText
                                v-model="editComponentForm.notes"
                                placeholder="Комментарий"
                                @keydown="onEditKeydown($event, () => saveEditComponent(comp, inst.material_instance_id), cancelEditComponent)"
                              />
                            </td>
                            <td>
                              <Button icon="pi pi-check" text @click="saveEditComponent(comp, inst.material_instance_id)" />
                              <Button icon="pi pi-times" text severity="secondary" @click="cancelEditComponent" />
                            </td>
                          </template>
                          <template v-else>
                            <td>{{ comp.component_name }}</td>
                            <td>{{ (comp.mass_fraction * 100).toFixed(2) }}%</td>
                            <td class="meta-text">{{ comp.notes || '' }}</td>
                            <td>
                              <Button icon="pi pi-pencil" text @click="startEditComponent(comp)" />
                              <Button icon="pi pi-trash" text severity="danger" @click="deleteComponent(comp, inst.material_instance_id)" />
                            </td>
                          </template>
                        </tr>
                      </tbody>
                    </table>
                    <div v-else class="empty-text">Нет компонентов</div>

                    <!-- Create component inline -->
                    <div v-if="creatingComponentFor === inst.material_instance_id" class="create-comp-row">
                      <Select
                        v-model="newComponentForm.instance_id"
                        :options="allInstances"
                        optionLabel="name"
                        optionValue="material_instance_id"
                        placeholder="-- экземпляр --"
                        class="comp-select"
                      />
                      <InputText
                        v-model="newComponentForm.percent"
                        placeholder="%"
                        class="input-narrow"
                        @keydown.enter.prevent="saveNewComponent(inst.material_instance_id)"
                        @keydown.escape="resetComponentCreate"
                      />
                      <InputText
                        v-model="newComponentForm.notes"
                        placeholder="Комментарий"
                        class="input-flex"
                        @keydown.enter.prevent="saveNewComponent(inst.material_instance_id)"
                        @keydown.escape="resetComponentCreate"
                      />
                      <Button icon="pi pi-check" text @click="saveNewComponent(inst.material_instance_id)" />
                      <Button icon="pi pi-times" text severity="secondary" @click="resetComponentCreate" />
                    </div>
                    <Button
                      v-else
                      label="Состав"
                      icon="pi pi-plus"
                      text
                      severity="secondary"
                      @click="startComponentCreate(inst.material_instance_id)"
                    />
                  </template>
                  <div v-else class="loading-text">Загрузка...</div>
                </div>
              </div>

              <div v-if="instances.length === 0 && !instancesLoading" class="empty-text">Нет экземпляров</div>

              <!-- Create instance inline -->
              <div v-if="creatingInstance" class="create-inst-row">
                <InputText
                  v-model="newInstanceForm.name"
                  placeholder="Название экземпляра"
                  @keydown.enter.prevent="saveNewInstance"
                  @keydown.escape="resetInstanceCreate"
                />
                <InputText
                  v-model="newInstanceForm.notes"
                  placeholder="Комментарий"
                  class="input-flex"
                  @keydown.enter.prevent="saveNewInstance"
                  @keydown.escape="resetInstanceCreate"
                />
                <Button icon="pi pi-check" text @click="saveNewInstance" />
                <Button icon="pi pi-times" text severity="secondary" @click="resetInstanceCreate" />
              </div>
            </div>
          </div>
        </template>

        <!-- Empty state -->
        <div v-else class="empty-state">
          <i class="pi pi-arrow-left" style="font-size: 1.5rem; color: #D1D7DE"></i>
          <p>Выберите материал из списка слева</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.materials-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.materials-page :deep(.page-header) { margin-bottom: 3px !important; }

/* ── Master-detail layout (glass-card) ── */
.materials-content {
  display: flex;
  background: rgba(255, 255, 255, 0.62);
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 12px;
  box-shadow: 0 4px 11px rgba(0, 50, 116, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(12px) saturate(1.4);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  min-height: 500px;
  max-height: calc(100vh - 160px);
  overflow: hidden;
}

/* ── Left panel ── */
.left-panel {
  width: 280px;
  flex-shrink: 0;
  border-right: 0.5px solid rgba(180, 210, 255, 0.4);
  display: flex;
  flex-direction: column;
  background: rgba(248, 252, 255, 0.5);
}

.left-toolbar {
  padding: 0.75rem;
  border-bottom: 0.5px solid rgba(180, 210, 255, 0.3);
}
.add-btn { width: 100%; }

.create-material-form {
  padding: 0.75rem;
  border-bottom: 0.5px solid rgba(180, 210, 255, 0.3);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.create-material-actions {
  display: flex;
  gap: 0.4rem;
}

.filter-wrap {
  padding: 0.5rem 0.75rem;
  border-bottom: 0.5px solid rgba(180, 210, 255, 0.3);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.role-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.role-chip {
  padding: 2px 8px;
  border: 0.5px solid rgba(180, 210, 255, 0.55);
  border-radius: 20px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.6);
  color: #6B7280;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.role-chip:hover {
  border-color: rgba(82, 201, 166, 0.45);
  color: #003274;
  box-shadow: 2px 3px 6px rgba(82, 201, 166, 0.12);
}
.role-chip.active {
  background: rgba(0, 50, 116, 0.08);
  border-color: #003274;
  color: #003274;
  font-weight: 600;
}

.material-list {
  flex: 1;
  overflow-y: auto;
}

.material-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  border-bottom: 0.5px solid rgba(180, 210, 255, 0.2);
  transition: background 0.15s;
}
.material-item:hover { background: rgba(0, 50, 116, 0.04); }
.material-item.active {
  background: rgba(0, 50, 116, 0.08);
  border-left: 3px solid #003274;
  box-shadow: inset 0 0 0 0.5px rgba(0, 50, 116, 0.08);
}

.material-item-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow: hidden;
}
.material-item-name {
  font-size: 13px;
  font-weight: 600;
  color: #003274;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.material-item-role {
  font-size: 11px;
  color: #6B7280;
}

.material-item-delete {
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.material-item:hover .material-item-delete { opacity: 1; }
.material-item-delete.p-button { width: 2rem; height: 2rem; }

/* ── Right panel ── */
.right-panel {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 0.75rem;
  color: #6B7280;
  font-size: 14px;
}

/* ── Detail sections ── */
.detail-section {
  margin-bottom: 1.5rem;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}
.section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(0, 50, 116, 0.50);
  margin-bottom: 0.5rem;
}

.metadata-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.meta-name { flex: 1; }
.meta-role { width: 160px; flex-shrink: 0; }

/* ── Shared form styles ── */
.w-full { width: 100%; }
.input-narrow { width: 80px; flex-shrink: 0; }
.input-flex { flex: 1; }
.comp-select { min-width: 200px; }

.meta-text { color: #6B7280; font-size: 12px; }
.loading-text { color: #6B7280; font-size: 13px; padding: 0.5rem 0; }
.empty-text { color: #6B7280; font-size: 13px; padding: 0.5rem 0; text-align: center; }

/* ── Instances ── */
.instances-list {
  display: flex;
  flex-direction: column;
}
.instance-block {
  border-bottom: 0.5px solid rgba(180, 210, 255, 0.3);
}
.instance-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.25rem;
  transition: background 0.12s;
}
.instance-row:hover { background: rgba(0, 50, 116, 0.03); }

.expand-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #6B7280;
  padding: 2px 4px;
  font-size: 11px;
}

.inst-name {
  font-weight: 600;
  font-size: 13px;
  color: #003274;
  flex-shrink: 0;
}
.inst-notes {
  color: #6B7280;
  font-size: 12px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inst-name-input { flex: 0 0 200px; }
.inst-notes-input { flex: 1; }

.actions { display: flex; gap: 0.15rem; margin-left: auto; flex-shrink: 0; }

/* ── Components ── */
.components-section {
  margin-left: 1.75rem;
  padding-bottom: 0.5rem;
}
.comp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.comp-table th {
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  color: #6B7280;
  padding: 0.25rem 0.4rem;
  border-bottom: 0.5px solid rgba(180, 210, 255, 0.4);
}
.comp-table td {
  padding: 0.25rem 0.4rem;
  vertical-align: middle;
}
.comp-table th:nth-child(2), .comp-table td:nth-child(2) { width: 80px; }
.comp-table th:nth-child(4), .comp-table td:nth-child(4) { width: 70px; }

.create-comp-row, .create-inst-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
}
.create-comp-row .pv-select { max-width: 250px; }

/* ── PrimeVue overrides for compact areas ── */
.instance-row :deep(.p-button-icon-only) {
  width: 2rem;
  height: 2rem;
}
.comp-table :deep(.p-button-icon-only) {
  width: 2rem;
  height: 2rem;
}
.material-item-delete :deep(.p-button) {
  width: 2rem;
  height: 2rem;
}

/* ── Mobile ── */
@media (max-width: 768px) {
  .materials-content {
    flex-direction: column;
    max-height: none;
    min-height: auto;
  }
  .left-panel {
    width: 100%;
    max-height: 40vh;
    border-right: none;
    border-bottom: 0.5px solid rgba(180, 210, 255, 0.4);
  }
  .right-panel {
    padding: 1rem;
  }
  .metadata-row {
    flex-wrap: wrap;
  }
  .meta-name { flex: 1 1 100%; }
  .meta-role { width: 100%; }
}
</style>
