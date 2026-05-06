# Гайд для Дали: миграция Form Pages на PrimeVue

Updated: 2026-05-06

Status: historical/partial guide. Do not use this as a current work order.
`ElectrodeFormPage.vue` already uses PrimeVue components. The old file names
`AssemblyFormPage.vue` and `TapeFormPage.vue` are not present in the current
`client-web/src/pages` tree; current pages are `AssemblyPage.vue` and
`TapesPage.vue`. Any future PrimeVue cleanup must inspect the current page
files directly and preserve existing behavior.

> **Цель:** заменить native HTML form elements (`<select>`, `<input>`, `<textarea>`) на PrimeVue компоненты (Select, InputText, Textarea) для единого стиля с остальным приложением.
>
> **Принцип:** ни одна строка логики не меняется. Только шаблон (template) и CSS. Данные, API, валидация — всё остаётся.

## Порядок миграции

Current reality:

1. **ElectrodeFormPage.vue** — already migrated enough to PrimeVue for the current Vue electrode form.
2. **AssemblyPage.vue** — current Vue assembly page; do not follow the obsolete `AssemblyFormPage.vue` instructions blindly.
3. **TapesPage.vue** — current Vue tapes page; do not follow the obsolete `TapeFormPage.vue` instructions blindly.

## Что нужно импортировать

В каждый из 3 файлов добавить после текущих imports:

```js
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
```

Дополнительно по файлам:
- **ElectrodeFormPage:** + `import RadioButton from 'primevue/radiobutton'`
- **AssemblyFormPage:** + `import Checkbox from 'primevue/checkbox'` + `import RadioButton from 'primevue/radiobutton'`
- **TapeFormPage:** + `import Checkbox from 'primevue/checkbox'`

## Паттерны замены

### Select (dropdown)

**Было:**
```html
<select v-model="projectId">
  <option value="">— выбрать —</option>
  <option v-for="p in projects" :key="p.project_id" :value="p.project_id">
    {{ p.name }}
  </option>
</select>
```

**Стало:**
```html
<Select
  v-model="projectId"
  :options="projects"
  optionLabel="name"
  optionValue="project_id"
  placeholder="— выбрать —"
/>
```

**Для статических опций** (cathode/anode, coin/pouch):

```html
<!-- Было -->
<select v-model="tapeType">
  <option value="cathode">катод</option>
  <option value="anode">анод</option>
</select>

<!-- Стало — определи массив в script: -->
const tapeTypeOptions = [
  { label: 'катод', value: 'cathode' },
  { label: 'анод', value: 'anode' },
]

<!-- В template: -->
<Select v-model="tapeType" :options="tapeTypeOptions" optionLabel="label" optionValue="value" />
```

### Input text / number

**Было:**
```html
<input v-model="mixing.temperature" type="number" step="0.1" />
```

**Стало:**
```html
<InputText v-model="mixing.temperature" />
```

> **Примечание:** мы НЕ используем InputNumber (у него другой формат v-model — Number вместо String). InputText безопаснее — не ломает существующую логику.

### Textarea

**Было:**
```html
<textarea v-model="notes" rows="3" placeholder="Комментарий"></textarea>
```

**Стало:**
```html
<Textarea v-model="notes" rows="3" placeholder="Комментарий" />
```

### Date / Time

**Было:**
```html
<input v-model="dryAm.date" type="date" />
<input v-model="dryAm.time" type="time" />
```

**Стало (минимальное изменение):**
```html
<InputText v-model="dryAm.date" type="date" />
<InputText v-model="dryAm.time" type="time" />
```

> Оставляем type="date" / type="time" — браузер показывает нативный picker, но стиль берётся из PrimeVue. Полноценный DatePicker — на будущее.

### RadioButton

**Было:**
```html
<label>
  <input type="radio" v-model="shape" value="circle" /> Круг
</label>
```

**Стало:**
```html
<div class="flex align-items-center gap-2">
  <RadioButton v-model="shape" value="circle" inputId="shape-circle" />
  <label for="shape-circle">Круг</label>
</div>
```

### Checkbox

**Было:**
```html
<label>
  <input type="checkbox" v-model="calendering.shine" /> Блеск
</label>
```

**Стало:**
```html
<div class="flex align-items-center gap-2">
  <Checkbox v-model="calendering.shine" :binary="true" inputId="cal-shine" />
  <label for="cal-shine">Блеск</label>
</div>
```

> **Важно:** добавь `:binary="true"` — без этого Checkbox работает как мультиселект.

## Опасные места (осторожно!)

### 1. TapeFormPage: select с `:value` + `@change`

В recipe lines и actuals table есть паттерн:
```html
<select :value="selectedInstanceByLineId[line.id]" @change="onInstanceChange(line.id, $event.target.value)">
```

PrimeVue Select **не использует** `$event.target.value`. Он передаёт значение напрямую:

```html
<Select
  :modelValue="selectedInstanceByLineId[line.id]"
  :options="instances"
  optionLabel="name"
  optionValue="material_instance_id"
  @update:modelValue="val => onInstanceChange(line.id, val)"
/>
```

**Строки в TapeFormPage:** 1071, 1161, 1168

### 2. AssemblyFormPage: checkbox с `:checked` + `@change`

```html
<input type="checkbox" :checked="isCathodeSelected(e)" @change="toggleCathode(e, $event.target.checked)" />
```

PrimeVue Checkbox не поддерживает `:checked`. Два варианта:

**Вариант A (простой — оставить native):** не мигрировать эти 2 чекбокса, они в таблице и работают.

**Вариант B (полный — через computed):**
```html
<Checkbox
  :modelValue="isCathodeSelected(e)"
  :binary="true"
  @update:modelValue="checked => toggleCathode(e, checked)"
/>
```

### 3. Stepper кнопки — НЕ ТРОГАТЬ

Кнопки шагов (Step 1, Step 2, ...) в Stepper slots — это кастомные `<button class="step-btn">`. Их менять НЕ нужно. Они работают внутри PrimeVue Stepper slot pattern.

## CSS — что удалить

В каждом из 3 файлов есть блок ~10 строк в `<style scoped>`:

```css
select, input[type="text"], input[type="number"], input[type="date"], input[type="time"], textarea {
  padding: 0.4rem 0.5rem;
  border: 1px solid #D1D7DE;
  border-radius: 6px;
  font-size: 0.9rem;
}
select:focus, input:focus, textarea:focus {
  border-color: #003274;
  outline: none;
  box-shadow: 0 0 0 2px rgba(0, 51, 102, 0.15);
}
```

После миграции **удали весь этот блок** — PrimeVue компоненты стилизуются глобально через `global.css`.

## Объём работы

| Файл | Замен | Новых строк | Удалённых строк | Сложность |
|------|-------|-------------|-----------------|-----------|
| ElectrodeFormPage | ~20 | ~10 imports | ~10 CSS | Простая |
| AssemblyFormPage | ~55 | ~40 (options arrays) | ~10 CSS | Средняя |
| TapeFormPage | ~80 | ~15 imports+opts | ~15 CSS | Сложная |

## Как тестировать

После каждого файла:
1. Открыть страницу в браузере
2. Проверить что все dropdowns показывают правильные опции
3. Заполнить форму и сохранить — данные должны сохраняться как раньше
4. Проверить что `required` validation всё ещё работает
5. Проверить console на ошибки

## Ветка

Рекомендую работать в отдельной ветке:
```bash
git checkout -b dalia/primevue-forms
```

После тестирования — merge в `main` или `dima/frontend-april-sync`.
