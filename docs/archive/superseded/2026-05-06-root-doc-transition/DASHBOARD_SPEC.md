# Координационный центр — Dashboard Specification

Updated: 2026-05-06

Status: product/design specification with partial implementation. Current
backend routes include `/api/dashboard/kpi`, `/api/dashboard/filter-options`,
`/api/dashboard/activity`, `/api/dashboard/production`, `/api/dashboard/graph`,
`/api/dashboard/funnel`, and `/api/dashboard/materials-usage`. Vue components
such as `DashboardGraph.vue`, `DashboardPipeline.vue`, and
`DashboardAnalytics.vue` exist, but this document still contains aspirational
UX details. Treat it as a design direction, not a proof that every described
control is implemented.

> **Цель:** превратить Главную из "витрины последних записей" в командный центр лаборатории — единую точку для обзора, навигации и принятия решений по всем проектам и образцам.

## 1. Проблема

Сейчас при масштабе:
- **100+ проектов** (исследовательские серии, гранты, внутренние)
- **1000+ материалов** (активные, связующие, добавки, растворители + тысячи экземпляров/партий)
- **100+ рецептур** (варианты катод/анод, версии)
- **Тысячи лент → электродов → аккумуляторов**

...навигация через sidebar + CrudTable нечеловеческая. Руководитель не может за минуту ответить:
- "В каком статусе проект X?"
- "Сколько аккумуляторов собрано за последний месяц?"
- "Какие рецепты использовались в проекте Y?"
- "Покажи все ленты на NMC811, которые прошли каландрирование"
- "Какие материалы связаны с проектом Z?"

## 2. Решение: трёхуровневый Dashboard

### Уровень 1 — Граф связей (Graph View)

Интерактивный граф, вдохновлённый Obsidian, показывающий **связи между сущностями**:

```
[Проект] ───→ [Рецепт] ───→ [Материал]
    │              │
    ▼              ▼
 [Лента] ──→ [Электрод] ──→ [Аккумулятор]
```

**Узлы:**
- Проекты (синие, размер = количество образцов)
- Рецепты (зелёные)
- Материалы (серые)
- Ленты (мятные, размер = прогресс по стадиям)
- Электроды (бирюзовые)
- Аккумуляторы (золотые)

**Рёбра:**
- Проект → Лента (created_in)
- Лента → Рецепт (uses_recipe)
- Рецепт → Материал (contains)
- Лента → Электрод (cut_from)
- Электрод → Аккумулятор (assembled_into)

**Интерактивность:**
- Hover на узле — tooltip с ключевыми полями
- Click — фокус (связанные узлы подсвечиваются, остальные тускнеют)
- Double-click — переход на страницу сущности
- Drag для перемещения узлов
- Zoom (scroll) для масштабирования
- Физика: force-directed layout (d3-force / vis.js / cytoscape.js)

**Фильтры графа (sidebar слева):**
- По проекту (multi-select)
- По типу узла (checkbox: проекты, рецепты, материалы...)
- По дате создания (range slider)
- По статусу (draft, processing, completed)
- Поиск по имени (глобальный)

### Уровень 2 — Kanban / Pipeline View

Горизонтальная pipeline-доска для отслеживания прогресса:

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  РЕЦЕПТ     │  │  ПАСТА      │  │  НАНЕСЕНИЕ  │  │  ЭЛЕКТРОДЫ  │  │  СБОРКА     │
│  (draft)    │→ │  (mixing)   │→ │  (coating)  │→ │  (cutting)  │→ │  (assembly) │
├─────────────┤  ├─────────────┤  ├─────────────┤  ├─────────────┤  ├─────────────┤
│ ● NMC-v3    │  │ ● Tape #45  │  │ ● Tape #44  │  │ ● Batch #12 │  │ ● Cell #89  │
│ ● LFP-v2   │  │ ● Tape #46  │  │ ● Tape #43  │  │ ● Batch #11 │  │ ● Cell #88  │
│             │  │             │  │             │  │             │  │             │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

**Колонки = стадии процесса** (из tapeStages.js):
1. Рецепт создан → 2. Сушка АМ → 3. Замес → 4. Нанесение → 5. Сушка → 6. Каландрирование → 7. Вырезка электродов → 8. Сборка аккумулятора

**Карточки:**
- Название ленты/электрода/аккумулятора
- Проект (badge)
- Оператор (avatar)
- Дата последнего действия
- Прогресс-бар (стадии из конструктора)

**Фильтры:**
- По проекту
- По оператору
- По дате (today / this week / this month / custom range)
- По рецепту/материалу

### Уровень 3 — Аналитические карточки (расширенные KPI)

Замена текущих простых KPI на интерактивные карточки с drill-down:

**Карточка "Проекты":**
- Количество по статусам (stacked bar: active / paused / completed)
- Click → список проектов с фильтром по статусу

**Карточка "Производство за период":**
- Line chart: ленты / электроды / аккумуляторы created per week
- Date range selector (7d / 30d / 90d / YTD)

**Карточка "Материалы":**
- Treemap: материалы по роли (размер = количество использований в рецептах)
- Click на секцию → список материалов этой роли

**Карточка "Воронка":**
- Funnel chart: рецепты → ленты → электроды → аккумуляторы
- Показывает конверсию на каждом шаге
- Highlight bottleneck (красный если conversion < threshold)

**Карточка "Последняя активность":**
- Timeline (vertical) с событиями: "Лента #45 — каландрирование завершено", "Аккумулятор #89 — собран"
- Фильтр по типу события, проекту, оператору

## 3. Переключение видов

Три таба в верхней части Dashboard:

```
┌──────────────┬──────────────┬──────────────┐
│  🔗 Граф     │  📋 Pipeline │  📊 Аналитика│
└──────────────┴──────────────┴──────────────┘
```

По умолчанию — **Pipeline** (самый практичный для ежедневного использования). Граф — для стратегического обзора. Аналитика — для отчётов руководству.

## 4. Глобальные фильтры (persistent)

В верхней панели Dashboard — unified filter bar:

```
[📅 Период: 30 дней ▾] [🏗 Проект: все ▾] [👤 Оператор: все ▾] [🔍 Поиск...]
```

Фильтры применяются ко ВСЕМ трём видам одновременно. Состояние сохраняется в localStorage.

## 5. Технический стек

### Frontend
- **Graph View:** [Cytoscape.js](https://js.cytoscape.org/) — лучший для Vue, поддерживает compound nodes, cola layout, styling
- **Charts:** [Chart.js](https://www.chartjs.org/) via [vue-chartjs](https://vue-chartjs.org/) — для line/bar/funnel/treemap
- **Kanban:** custom Vue component (CrudTable уже есть, канбан — похожая сложность)
- **Date range:** PrimeVue DatePicker с range mode

### Backend — новые API endpoints

```
GET /api/dashboard/graph
  → { nodes: [...], edges: [...] }
  Query: ?project_id=&date_from=&date_to=

GET /api/dashboard/pipeline
  → { stages: [...], items: [...] }
  Query: ?project_id=&operator_id=&date_from=&date_to=

GET /api/dashboard/kpi
  → { projects: {...}, production: {...}, materials: {...}, funnel: {...} }
  Query: ?period=30d

GET /api/dashboard/activity
  → { events: [...] }
  Query: ?limit=50&type=&project_id=
```

### Database
- Все данные уже в БД — нужны только JOIN queries
- Граф строится из существующих FK связей (tapes → projects, tapes → recipes, recipes → materials, electrode_cut_batches → tapes, batteries → electrodes)
- Pipeline stages определяются по наличию/отсутствию данных в tape_process_steps
- KPI — агрегатные COUNT/SUM с GROUP BY

## 6. Linked Filters — Взаимосвязанная система фильтрации

Ключевая идея: **фильтры не изолированы — они каскадно влияют друг на друга**. Выбор проекта сужает список рецептов, выбор рецепта сужает материалы, и т.д. Это работает в обе стороны (top-down и bottom-up).

### 6.1 Архитектура фильтров

```
┌─────────────────────────────────────────────────────────────────────┐
│                    UNIFIED FILTER BAR                                │
│                                                                     │
│  [📅 Период ▾]  [🏗 Проект ▾]  [📋 Рецепт ▾]  [🧪 Материал ▾]   │
│  [👤 Оператор ▾]  [📊 Статус ▾]  [🔍 Поиск...]  [✕ Сбросить]     │
│                                                                     │
│  Активные фильтры: ┌──────┐ ┌──────────┐ ┌───────┐                 │
│                     │Проект│ │NMC811    │ │Катод  │  ← clickable    │
│                     │TEST 1│ │          │ │       │    to remove     │
│                     └──────┘ └──────────┘ └───────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Каскадная логика фильтров

Каждый фильтр **сужает options** для остальных:

```
Пользователь выбирает "Проект: TEST 1"
  → Рецепт dropdown: показывает только рецепты, использованные в TEST 1
  → Материал dropdown: показывает только материалы из этих рецептов
  → Оператор dropdown: показывает только операторов, работавших в TEST 1
  → Граф: подсвечивает узлы TEST 1, тускнеет остальные
  → Pipeline: показывает только ленты/электроды/аккумуляторы TEST 1
  → KPI: пересчитываются для TEST 1

Пользователь дополнительно выбирает "Материал: NMC811"
  → Рецепт dropdown: сужается до рецептов, содержащих NMC811
  → Ленты: только те, что используют эти рецепты
  → Граф: фокус на подграф NMC811 внутри TEST 1
```

**Bottom-up (обратная навигация):**
```
Пользователь кликает на аккумулятор #89 в графе
  → Автоматически подсвечиваются:
    - электроды, из которых собран
    - ленты, из которых вырезаны электроды
    - рецепты этих лент
    - материалы рецептов
    - проект
  → Filter bar обновляется: показывает контекст выбранного аккумулятора
  → Другие views (Pipeline, KPI) фильтруются по этой цепочке
```

### 6.3 Filter State Machine

```typescript
interface DashboardFilters {
  // Temporal
  period: '7d' | '30d' | '90d' | 'ytd' | 'all' | { from: Date, to: Date }
  
  // Entity filters (multi-select)
  projectIds: number[]
  recipeIds: number[]
  materialIds: number[]
  operatorIds: number[]
  
  // Status
  statuses: ('draft' | 'processing' | 'completed')[]
  
  // Electrode type
  electrodeRole: 'cathode' | 'anode' | null
  
  // Free text
  search: string
  
  // Focus (from graph click)
  focusEntity: { type: 'tape' | 'electrode' | 'battery' | ..., id: number } | null
}
```

**Фильтры хранятся в:**
1. `URL query params` — для shareability (отправить ссылку коллеге)
2. `localStorage` — для persistence между сессиями
3. `Pinia store` — для реактивности между компонентами

### 6.4 Cascading API

Один endpoint возвращает **доступные значения фильтров** с учётом текущего состояния:

```
GET /api/dashboard/filter-options
  Query: ?project_id=1&material_id=5&period=30d
  Response: {
    projects:  [{ id: 1, name: "TEST 1", count: 45 }, ...],
    recipes:   [{ id: 3, name: "LFP S19", count: 12 }, ...],   // только связанные
    materials: [{ id: 5, name: "NMC811", count: 8 }, ...],      // только связанные
    operators: [{ id: 2, name: "Даля", count: 30 }, ...],       // только участвовавшие
    statuses:  [{ value: "draft", count: 20 }, { value: "completed", count: 25 }]
  }
```

`count` показывается рядом с опцией — пользователь видит сколько записей покажет каждый фильтр **до** его выбора.

### 6.5 Preset фильтры (быстрые сценарии)

Под filter bar — clickable presets:

```
[🔥 Активные проекты]  [📅 За эту неделю]  [⚠️ Bottleneck]  [👤 Мои образцы]  [📊 Полный обзор]
```

- **Активные проекты:** status=active, period=all
- **За эту неделю:** period=7d, все проекты
- **Bottleneck:** стадии с наибольшим количеством "застрявших" образцов
- **Мои образцы:** operator=current_user
- **Полный обзор:** все фильтры сброшены

### 6.6 Cross-view синхронизация

Фильтры единые для ВСЕХ видов:

| Действие | Граф | Pipeline | Аналитика |
|----------|------|----------|-----------|
| Выбрать проект в filter bar | Подсветить узлы проекта | Показать только карточки проекта | Пересчитать KPI для проекта |
| Кликнуть узел в графе | Фокус на узле | Scroll к карточке этого элемента | Highlight в графиках |
| Кликнуть карточку в Pipeline | Фокус в графе | Показать детали | Highlight |
| Кликнуть сегмент в chart | Установить соответствующий фильтр | Отфильтровать | Drill-down |

## 7. Адаптивная загрузка данных

### 7.1 Три режима отображения

```
[🌍 Обзор]  [🔬 Фокус]  [📋 Детали]
```

**Обзор (по умолчанию):**
- Граф: кластеры проектов (compound nodes), без деталей
- Pipeline: counts per stage, без карточек
- KPI: агрегаты по всей БД
- Запрос: 1 lightweight query (~50ms)

**Фокус (выбран проект или фильтр):**
- Граф: развёрнутый подграф выбранного проекта (ленты, рецепты, материалы)
- Pipeline: карточки лент этого проекта с прогресс-барами
- KPI: метрики выбранного среза
- Запрос: 2-3 targeted queries (~200ms)

**Детали (клик на конкретный элемент):**
- Граф: фокус на узле + ±1 hop neighbors
- Pipeline: развёрнутая карточка с полями (inline preview, без перехода на страницу)
- KPI: micro-KPI для этого элемента (сколько шагов завершено, связанные элементы)
- Запрос: 1 entity query + relationships (~100ms)

### 7.2 Progressive loading

```
1. Первый рендер (< 100ms):
   - Skeleton layout (shimmer анимация)
   - Filter bar с presets
   
2. KPI загружены (< 300ms):
   - Числа в карточках появляются
   - Filter options populated (counts)

3. Pipeline загружен (< 500ms):
   - Stage columns с counts
   - Первые 10 карточек на стадию

4. Граф загружен (< 1s):
   - Кластеры проектов анимированно появляются
   - Force simulation стабилизируется за 2-3 сек

5. Lazy: при scroll/expand
   - Pipeline: подгрузка следующих карточек
   - Граф: expand node → загрузка children
```

### 7.3 Caching strategy

```
Browser cache (in-memory, Pinia):
  - filter-options: TTL 60s (обновляется при смене фильтра)
  - kpi-summary: TTL 30s
  - pipeline-stages: TTL 30s
  - graph-nodes: TTL 120s (граф меняется реже)

HTTP cache headers:
  - Cache-Control: private, max-age=30
  - ETag: hash of last_modified timestamp
```

### 7.4 Backend optimization

```sql
-- Materialized view для быстрого pipeline
CREATE MATERIALIZED VIEW dashboard_tape_progress AS
SELECT
  t.tape_id,
  t.name,
  t.project_id,
  p.name AS project_name,
  t.created_by,
  u.name AS operator_name,
  t.created_at,
  -- Computed stage: last completed step
  (SELECT step_code FROM tape_process_steps 
   WHERE tape_id = t.tape_id AND completed_at IS NOT NULL
   ORDER BY step_order DESC LIMIT 1) AS current_stage,
  -- Step completion bitmask for progress bar
  array_agg(DISTINCT tps.step_code) FILTER (WHERE tps.completed_at IS NOT NULL) AS completed_steps
FROM tapes t
LEFT JOIN projects p ON t.project_id = p.project_id
LEFT JOIN users u ON t.created_by = u.user_id
LEFT JOIN tape_process_steps tps ON t.tape_id = tps.tape_id
GROUP BY t.tape_id, p.name, u.name;

-- Refresh every 5 minutes or on-demand
REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_tape_progress;
```

## 8. Масштабирование

При 100 проектах × 10 рецептов × 50 лент × 5 электродов × 2 аккумулятора = ~100K узлов в графе. Это слишком много для одного view.

**Решение:**
- Граф по умолчанию показывает только **выбранный проект** или **последние 30 дней**
- "Zoom out" загружает связи лениво (expand-on-click)
- Кластеризация: группировка лент одного проекта в compound node
- Backend paginates: граф endpoints возвращают max 500 узлов, с cursor для подгрузки
- Pipeline показывает max 50 карточек на стадию, с "Show more" scroll

## 7. Приоритизация (фазы)

### Фаза 1 — Enhanced KPI (1-2 дня)
- Расширенные KPI карточки с drill-down
- Timeline последней активности
- Без графа и канбана

### Фаза 2 — Pipeline View (3-5 дней)
- Kanban-доска по стадиям процесса
- Фильтры по проекту / оператору / дате
- Карточки лент с прогресс-баром

### Фаза 3 — Graph View (5-7 дней)
- Cytoscape.js интеграция
- Force-directed layout
- Интерактивный фокус и навигация
- Глобальные фильтры

### Фаза 4 — Аналитика (3-5 дней)
- Chart.js графики (production over time, funnel, treemap)
- Экспорт отчётов

## 8. Зависимости

- [ ] **Стадии процесса для каждой ленты** — сейчас определяются по наличию step data в tape_process_steps. Нужен computed status field или SQL view.
- [ ] **Activity log** — уже есть (activity_log table), но нужен API endpoint для Dashboard timeline.
- [ ] **Связи electrodes ↔ batteries** — через battery_electrode_sources table.
- [ ] **Проектная привязка** — tapes.project_id, batteries.project_id уже есть.
