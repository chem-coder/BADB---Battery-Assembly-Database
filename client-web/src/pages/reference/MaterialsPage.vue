<script setup>
import { ref, onMounted } from 'vue'
import api from '@/services/api'
import { useStatus } from '@/composables/useStatus'

const { statusMsg, statusError, showStatus } = useStatus()

const roleMap = {
  cathode_active: 'катодный активный материал',
  anode_active: 'анодный активный материал',
  binder: 'связующее',
  conductive_additive: 'проводящая добавка',
  solvent: 'растворитель',
  other: 'другое',
}

// --- State ---
const materials = ref([])
const newName = ref('')
const newRole = ref('')

// Toggle state
const allMaterialsExpanded = ref(false)
const compositionsExpanded = ref(false)

// Open state tracking for preservation
const openMaterials = ref(new Set())
const openInstances = ref(new Set())

// Instances & components loaded per parent
const instancesMap = ref({})   // materialId → [instances]
const componentsMap = ref({})  // instanceId → [components]
const instancesLoaded = ref({})
const componentsLoaded = ref({})

// Inline edit state (only one at a time)
const editType = ref(null)   // 'material' | 'instance' | 'component'
const editId = ref(null)
const editName = ref('')
const editRole = ref('')
const editNotes = ref('')
const editMassFraction = ref('')

// Inline create state
const creatingInstanceFor = ref(null) // materialId
const newInstanceName = ref('')
const newInstanceNotes = ref('')

const creatingComponentFor = ref(null) // instanceId
const newComponentInstanceId = ref('')
const newComponentPercent = ref('')
const newComponentNotes = ref('')
const allInstances = ref([]) // for component dropdown

// --- API ---
async function loadMaterials() {
  const { data } = await api.get('/api/materials')
  materials.value = data.sort((a, b) => a.name.localeCompare(b.name))
}

async function loadInstances(materialId) {
  const { data } = await api.get(`/api/materials/${materialId}/instances`)
  instancesMap.value[materialId] = data.sort((a, b) => a.name.localeCompare(b.name))
  instancesLoaded.value[materialId] = true
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

// --- Material CRUD ---
async function createMaterial() {
  const name = newName.value.trim()
  if (!name) { showStatus('Название обязательно', true); return }
  if (!newRole.value) { showStatus('Роль обязательна', true); return }
  try {
    await api.post('/api/materials', { name, role: newRole.value })
    newName.value = ''
    newRole.value = ''
    showStatus('Материал создан')
    await loadMaterials()
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка создания', true)
  }
}

async function deleteMaterial(m) {
  if (!confirm(`Удалить материал "${m.name}"?`)) return
  try {
    await api.delete(`/api/materials/${m.material_id}`)
    showStatus('Удалено')
    await loadMaterials()
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка удаления', true)
  }
}

// --- Instance CRUD ---
async function deleteInstance(inst) {
  if (!confirm(`Удалить экземпляр "${inst.name}"?`)) return
  try {
    await api.delete(`/api/materials/instances/${inst.material_instance_id}`)
    showStatus('Удалено')
    // Reload parent instances
    const matId = inst.material_id
    if (matId) await loadInstances(matId)
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка удаления', true)
  }
}

// --- Component CRUD ---
async function deleteComponent(comp, instanceId) {
  if (!confirm('Удалить компонент?')) return
  try {
    await api.delete(`/api/materials/instances/components/${comp.material_instance_component_id}`)
    showStatus('Удалено')
    await loadComponents(instanceId)
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка удаления', true)
  }
}

// --- Toggle expand/collapse ---
function toggleMaterials() {
  allMaterialsExpanded.value = !allMaterialsExpanded.value
  if (allMaterialsExpanded.value) {
    materials.value.forEach(m => {
      openMaterials.value.add(m.material_id)
      if (!instancesLoaded.value[m.material_id]) loadInstances(m.material_id)
    })
  } else {
    openMaterials.value.clear()
    openInstances.value.clear()
    compositionsExpanded.value = false
  }
}

function toggleCompositions() {
  if (!allMaterialsExpanded.value) return
  compositionsExpanded.value = !compositionsExpanded.value
  if (compositionsExpanded.value) {
    for (const matId of openMaterials.value) {
      const insts = instancesMap.value[matId] || []
      insts.forEach(inst => {
        openInstances.value.add(inst.material_instance_id)
        if (!componentsLoaded.value[inst.material_instance_id]) {
          loadComponents(inst.material_instance_id)
        }
      })
    }
  } else {
    openInstances.value.clear()
  }
}

// --- Material toggle ---
function toggleMaterial(m) {
  const id = m.material_id
  if (openMaterials.value.has(id)) {
    openMaterials.value.delete(id)
  } else {
    openMaterials.value.add(id)
    if (!instancesLoaded.value[id]) loadInstances(id)
  }
}

function toggleInstance(inst) {
  const id = inst.material_instance_id
  if (openInstances.value.has(id)) {
    openInstances.value.delete(id)
  } else {
    openInstances.value.add(id)
    if (!componentsLoaded.value[id]) loadComponents(id)
  }
}

// --- Inline edit ---
function startEdit(type, item) {
  cancelEdit()
  editType.value = type
  if (type === 'material') {
    editId.value = item.material_id
    editName.value = item.name
    editRole.value = item.role
  } else if (type === 'instance') {
    editId.value = item.material_instance_id
    editName.value = item.name
    editNotes.value = item.notes || ''
  } else if (type === 'component') {
    editId.value = item.material_instance_component_id
    editMassFraction.value = (item.mass_fraction * 100).toFixed(2)
    editNotes.value = item.notes || ''
  }
}

function cancelEdit() {
  editType.value = null
  editId.value = null
  editName.value = ''
  editRole.value = ''
  editNotes.value = ''
  editMassFraction.value = ''
}

async function saveEditMaterial(m) {
  const name = editName.value.trim()
  if (!name) return
  try {
    await api.put(`/api/materials/${m.material_id}`, { name, role: editRole.value || m.role })
    cancelEdit()
    showStatus('Сохранено')
    await loadMaterials()
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка обновления', true)
  }
}

async function saveEditInstance(inst) {
  const name = editName.value.trim()
  if (!name) return
  try {
    await api.put(`/api/materials/instances/${inst.material_instance_id}`, {
      name,
      notes: editNotes.value.trim() || null,
    })
    cancelEdit()
    showStatus('Сохранено')
    if (inst.material_id) await loadInstances(inst.material_id)
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка обновления', true)
  }
}

async function saveEditComponent(comp, instanceId) {
  const pct = Number(editMassFraction.value)
  if (isNaN(pct) || pct <= 0 || pct > 100) {
    showStatus('Некорректный % (0–100)', true)
    return
  }
  try {
    await api.put(`/api/materials/instances/components/${comp.material_instance_component_id}`, {
      mass_fraction: pct / 100,
      notes: editNotes.value.trim() || null,
    })
    cancelEdit()
    showStatus('Сохранено')
    await loadComponents(instanceId)
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка обновления', true)
  }
}

function onEditKeydown(e, saveFn) {
  if (e.key === 'Enter') { e.preventDefault(); saveFn() }
  if (e.key === 'Escape') cancelEdit()
}

// --- Inline create: Instance ---
function startCreateInstance(materialId) {
  cancelEdit()
  cancelCreateComponent()
  creatingInstanceFor.value = materialId
  newInstanceName.value = ''
  newInstanceNotes.value = ''
}

function cancelCreateInstance() {
  creatingInstanceFor.value = null
  newInstanceName.value = ''
  newInstanceNotes.value = ''
}

async function saveNewInstance(materialId) {
  const name = newInstanceName.value.trim()
  if (!name) return
  try {
    await api.post(`/api/materials/${materialId}/instances`, {
      name,
      notes: newInstanceNotes.value.trim() || null,
    })
    cancelCreateInstance()
    showStatus('Экземпляр создан')
    await loadInstances(materialId)
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка создания', true)
  }
}

// --- Inline create: Component ---
async function startCreateComponent(instanceId) {
  cancelEdit()
  cancelCreateInstance()
  creatingComponentFor.value = instanceId
  newComponentInstanceId.value = ''
  newComponentPercent.value = ''
  newComponentNotes.value = ''
  await loadAllInstances()
}

function cancelCreateComponent() {
  creatingComponentFor.value = null
  newComponentInstanceId.value = ''
  newComponentPercent.value = ''
  newComponentNotes.value = ''
}

async function saveNewComponent(instanceId) {
  const matInstId = newComponentInstanceId.value
  const pct = Number(newComponentPercent.value)
  if (!matInstId) { showStatus('Выберите экземпляр', true); return }
  if (isNaN(pct) || pct <= 0 || pct > 100) {
    showStatus('Некорректный % (0–100)', true)
    return
  }
  try {
    await api.post(`/api/materials/instances/${instanceId}/components`, {
      component_material_instance_id: Number(matInstId),
      mass_fraction: pct / 100,
      notes: newComponentNotes.value.trim() || null,
    })
    cancelCreateComponent()
    showStatus('Компонент добавлен')
    await loadComponents(instanceId)
  } catch (err) {
    showStatus(err.response?.data?.error || 'Ошибка создания', true)
  }
}

function isEditing(type, id) {
  return editType.value === type && editId.value === id
}

onMounted(loadMaterials)
</script>

<template>
  <div>
    <!-- Create material -->
    <div class="material-create-form">
      <input
        v-model="newName"
        class="add-input"
        placeholder="Название материала"
        autocomplete="off"
        @keydown.enter="createMaterial"
      />
      <select v-model="newRole" style="margin: 0.25rem 0">
        <option value="">— выбрать роль —</option>
        <option value="cathode_active">катодный активный материал</option>
        <option value="anode_active">анодный активный материал</option>
        <option value="binder">связующее</option>
        <option value="conductive_additive">проводящая добавка</option>
        <option value="solvent">растворитель</option>
        <option value="other">другое</option>
      </select>
      <button type="button" @click="createMaterial">Добавить</button>
    </div>

    <div
      v-if="statusMsg"
      class="status-feedback"
      :style="{ color: statusError ? '#b00020' : 'darkcyan' }"
    >
      {{ statusMsg }}
    </div>

    <!-- Toolbar -->
    <div class="materials-toolbar">
      <button type="button" @click="toggleMaterials">
        Развернуть/свернуть экземпляры
      </button>
      <button
        type="button"
        :disabled="!allMaterialsExpanded"
        @click="toggleCompositions"
      >
        Развернуть/свернуть составы
      </button>
    </div>

    <!-- Tree -->
    <ul class="items-list">
      <li v-for="m in materials" :key="m.material_id" class="tree-row level-material">
        <!-- Material summary -->
        <div class="tree-summary" @click="toggleMaterial(m)">
          <span class="tree-arrow" :class="{ open: openMaterials.has(m.material_id) }">▸</span>

          <template v-if="isEditing('material', m.material_id)">
            <input
              v-model="editName"
              style="flex: 1"
              @keydown="onEditKeydown($event, () => saveEditMaterial(m))"
              @click.stop
            />
            <select v-model="editRole" @click.stop>
              <option value="cathode_active">катодный активный материал</option>
              <option value="anode_active">анодный активный материал</option>
              <option value="binder">связующее</option>
              <option value="conductive_additive">проводящая добавка</option>
              <option value="solvent">растворитель</option>
              <option value="other">другое</option>
            </select>
            <button type="button" @click.stop="saveEditMaterial(m)">Сохранить</button>
            <button type="button" @click.stop="cancelEdit">Отмена</button>
          </template>

          <template v-else>
            <span class="row-title" style="display: inline-block; width: 10vw">{{ m.name }}</span>
            <span class="row-meta" style="display: inline-block; width: 25vw">{{ roleMap[m.role] || m.role }}</span>
            <div class="actions" @click.stop>
              <button title="Редактировать" @click="startEdit('material', m)">✏️</button>
              <button title="Удалить" @click="deleteMaterial(m)">🗑</button>
            </div>
          </template>
        </div>

        <!-- Instances (Level 2) -->
        <div v-if="openMaterials.has(m.material_id)" class="children-container">
          <template v-if="instancesLoaded[m.material_id]">
            <div
              v-for="inst in (instancesMap[m.material_id] || [])"
              :key="inst.material_instance_id"
              class="tree-row level-instance"
            >
              <!-- Instance summary -->
              <div class="tree-summary" @click="toggleInstance(inst)">
                <span class="tree-arrow" :class="{ open: openInstances.has(inst.material_instance_id) }">▸</span>

                <template v-if="isEditing('instance', inst.material_instance_id)">
                  <input
                    v-model="editName"
                    style="flex: 1"
                    @keydown="onEditKeydown($event, () => saveEditInstance(inst))"
                    @click.stop
                  />
                  <textarea
                    v-model="editNotes"
                    rows="2"
                    placeholder="Комментарий"
                    style="display: block; margin-top: 0.4rem"
                    @click.stop
                  ></textarea>
                  <button type="button" @click.stop="saveEditInstance(inst)">Сохранить</button>
                  <button type="button" @click.stop="cancelEdit">Отмена</button>
                </template>

                <template v-else>
                  <span class="row-title" style="display: inline-block; width: 35vw">{{ inst.name }}</span>
                  <div class="actions" @click.stop>
                    <button title="Редактировать" @click="startEdit('instance', inst)">✏️</button>
                    <button title="Удалить" @click="deleteInstance(inst)">🗑</button>
                  </div>
                </template>
              </div>

              <!-- Components (Level 3) -->
              <div v-if="openInstances.has(inst.material_instance_id)" class="children-container">
                <template v-if="componentsLoaded[inst.material_instance_id]">
                  <div
                    v-for="comp in (componentsMap[inst.material_instance_id] || [])"
                    :key="comp.material_instance_component_id"
                    class="tree-row level-component"
                  >
                    <div class="tree-summary">
                      <template v-if="isEditing('component', comp.material_instance_component_id)">
                        <input
                          v-model="editMassFraction"
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          style="width: 80px"
                          @keydown="onEditKeydown($event, () => saveEditComponent(comp, inst.material_instance_id))"
                          @click.stop
                        />
                        <span style="margin: 0 0.25rem">%</span>
                        <textarea
                          v-model="editNotes"
                          rows="2"
                          placeholder="Комментарий"
                          style="display: block; margin-top: 0.4rem"
                          @click.stop
                        ></textarea>
                        <button type="button" @click.stop="saveEditComponent(comp, inst.material_instance_id)">Сохранить</button>
                        <button type="button" @click.stop="cancelEdit">Отмена</button>
                      </template>

                      <template v-else>
                        <span class="row-title" style="display: inline-block; width: 10vw">{{ comp.component_name }}</span>
                        <span class="row-meta" style="display: inline-block; width: 10vw">{{ (comp.mass_fraction * 100).toFixed(2) }} %</span>
                        <div class="actions" @click.stop>
                          <button title="Редактировать" @click="startEdit('component', comp)">✏️</button>
                          <button title="Удалить" @click="deleteComponent(comp, inst.material_instance_id)">🗑</button>
                        </div>
                      </template>
                    </div>
                  </div>

                  <!-- Create component inline -->
                  <div v-if="creatingComponentFor === inst.material_instance_id" class="inline-create level-component">
                    <select v-model="newComponentInstanceId" style="margin-right: 0.5rem">
                      <option value="">— экземпляр —</option>
                      <option
                        v-for="ai in allInstances"
                        :key="ai.material_instance_id"
                        :value="ai.material_instance_id"
                      >{{ ai.name }}</option>
                    </select>
                    <input
                      v-model="newComponentPercent"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="%"
                      style="width: 80px"
                      @keydown.enter.prevent="saveNewComponent(inst.material_instance_id)"
                      @keydown.escape="cancelCreateComponent"
                    />
                    <textarea
                      v-model="newComponentNotes"
                      rows="2"
                      placeholder="Комментарий (необязательно)"
                      style="display: block; margin-top: 0.4rem"
                    ></textarea>
                    <button type="button" @click="saveNewComponent(inst.material_instance_id)">Сохранить</button>
                    <button type="button" @click="cancelCreateComponent">Отмена</button>
                  </div>

                  <button
                    v-if="creatingComponentFor !== inst.material_instance_id"
                    type="button"
                    class="add-child-btn level-component"
                    @click="startCreateComponent(inst.material_instance_id)"
                  >+ Состав</button>
                </template>
                <div v-else style="margin-left: 3rem; color: #999">Загрузка...</div>
              </div>
            </div>

            <!-- Create instance inline -->
            <div v-if="creatingInstanceFor === m.material_id" class="inline-create level-instance">
              <input
                v-model="newInstanceName"
                type="text"
                placeholder="Название экземпляра"
                style="margin-right: 0.5rem"
                @keydown.enter.prevent="saveNewInstance(m.material_id)"
                @keydown.escape="cancelCreateInstance"
              />
              <textarea
                v-model="newInstanceNotes"
                rows="2"
                placeholder="Комментарий (необязательно)"
                style="display: block; margin-top: 0.4rem"
              ></textarea>
              <button type="button" @click="saveNewInstance(m.material_id)">Сохранить</button>
              <button type="button" @click="cancelCreateInstance">Отмена</button>
            </div>

            <button
              v-if="creatingInstanceFor !== m.material_id"
              type="button"
              class="add-child-btn level-instance"
              @click="startCreateInstance(m.material_id)"
            >+ Экземпляр</button>
          </template>
          <div v-else style="margin-left: 1.5rem; color: #999">Загрузка...</div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.material-create-form {
  margin-bottom: 1rem;
}

.materials-toolbar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin: 0.75rem 0;
}

.materials-toolbar button[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}

.tree-row {
  list-style: none;
}

.level-instance {
  margin-left: 1.5rem;
}

.level-component {
  margin-left: 3rem;
}

.tree-summary {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.25rem;
  cursor: pointer;
  border-bottom: 1px solid #eee;
}

.tree-summary:hover {
  background-color: #f6f7f8;
}

.tree-arrow {
  display: inline-block;
  margin-right: 0.5rem;
  color: #666;
  transition: transform 0.15s ease;
  user-select: none;
}

.tree-arrow.open {
  transform: rotate(90deg);
}

.inline-create {
  padding: 0.5rem 0;
}

.add-child-btn {
  margin: 0.25rem 0;
  font-size: 0.9rem;
  cursor: pointer;
}
</style>
