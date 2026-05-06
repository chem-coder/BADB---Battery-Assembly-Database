# Прослеживаемость данных (Traceability) — Спецификация

> **Цель:** каждая запись в системе должна показывать кто её создал, кто последний редактировал, когда, и какие поля изменились. Для коллектива ~40 человек это критично.

## Текущий статус на 2026-05-06

Traceability уже реализована частично и не должна описываться как будущая
миграция:

- миграция `013_traceability.sql` создала `field_changelog`;
- `middleware/trackChanges.js` пишет field-level изменения для подключённых
  CRUD-маршрутов;
- `activity_log` создан миграцией `012_activity_log.sql` и используется для
  агрегированных событий, включая guided battery delete;
- `auth_log` остаётся отдельным append-only журналом аутентификации;
- `updated_at` для лент/батарей и дочерних секций поддерживается Dalia
  миграциями `d013`-`d015`;
- не каждая таблица имеет `updated_by/updated_at`, поэтому новые маршруты
  должны либо подключать `trackChanges`, либо явно документировать отсутствие
  field-level аудита.

Ниже сохранён исторический план как справочный контекст. Он не является
актуальным списком задач и не должен использоваться для генерации новой
миграции `009_add_traceability_columns.sql`.

## 1. Проблема

До внедрения traceability:
- `created_by` + `created_at` есть на основных таблицах (tapes, batteries, electrodes)
- `updated_by` + `updated_at` — **отсутствуют** почти везде
- Activity log записывает только action + entity + entity_id — **без деталей** (какие поля изменены)
- На карточках в UI нет информации "кем/когда редактировалось"

## 2. Решение

### Фаза B: Database + Backend

#### 2.1 Миграция БД — добавить `updated_by` + `updated_at`

```sql
-- Migration 009_add_traceability_columns.sql

-- Tapes
ALTER TABLE tapes ADD COLUMN IF NOT EXISTS updated_by integer REFERENCES users(user_id);
ALTER TABLE tapes ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Tape process steps
ALTER TABLE tape_process_steps ADD COLUMN IF NOT EXISTS updated_by integer REFERENCES users(user_id);
ALTER TABLE tape_process_steps ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Electrode cut batches
ALTER TABLE electrode_cut_batches ADD COLUMN IF NOT EXISTS updated_by integer REFERENCES users(user_id);
ALTER TABLE electrode_cut_batches ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Batteries
ALTER TABLE batteries ADD COLUMN IF NOT EXISTS updated_by integer REFERENCES users(user_id);
ALTER TABLE batteries ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_by integer REFERENCES users(user_id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Materials + instances
ALTER TABLE materials ADD COLUMN IF NOT EXISTS updated_by integer REFERENCES users(user_id);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Recipes
ALTER TABLE tape_recipes ADD COLUMN IF NOT EXISTS updated_by integer REFERENCES users(user_id);
ALTER TABLE tape_recipes ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Separators
ALTER TABLE separators ADD COLUMN IF NOT EXISTS updated_by integer REFERENCES users(user_id);
ALTER TABLE separators ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Electrolytes
ALTER TABLE electrolytes ADD COLUMN IF NOT EXISTS updated_by integer REFERENCES users(user_id);
ALTER TABLE electrolytes ADD COLUMN IF NOT EXISTS updated_at timestamptz;
```

#### 2.2 Field-level audit log — новая таблица

```sql
CREATE TABLE IF NOT EXISTS field_changelog (
  id serial PRIMARY KEY,
  entity_type text NOT NULL,       -- 'tape', 'battery', 'project', etc.
  entity_id integer NOT NULL,
  field_name text NOT NULL,        -- 'name', 'temperature_c', 'status'
  old_value text,                  -- stringified old value (null = created)
  new_value text,                  -- stringified new value (null = deleted)
  changed_by integer REFERENCES users(user_id),
  changed_at timestamptz DEFAULT now()
);

CREATE INDEX idx_changelog_entity ON field_changelog(entity_type, entity_id);
CREATE INDEX idx_changelog_user ON field_changelog(changed_by);
CREATE INDEX idx_changelog_date ON field_changelog(changed_at);
```

#### 2.3 Backend middleware — auto-track changes

```javascript
// middleware/trackChanges.js
// Wraps PUT/PATCH handlers to compare old vs new values
// and write diffs to field_changelog
```

Для каждого PUT/PATCH route:
1. До UPDATE — SELECT текущие значения
2. После UPDATE — сравнить с payload
3. Записать изменённые поля в `field_changelog`
4. Обновить `updated_by = req.user.userId`, `updated_at = now()`

### Фаза C: Frontend

#### 3.1 Метаданные на каждой карточке

В CrudTable + Dialog формах добавить footer:

```
Создано: Мараулайте Даля Казевна, 25.03.2026 23:52
Изменено: Меняйлов Дмитрий Сергеевич, 08.04.2026 14:30
```

#### 3.2 Подробный журнал изменений

Новая страница или расширение ActivityPage:

```
08.04.2026 14:30 — Меняйлов Д.С. — tape #2
  temperature_c: 80 → 120
  comments: "" → "повторная сушка"

08.04.2026 14:25 — Мараулайте Д.К. — battery #6
  status: "draft" → "assembled"
```

#### 3.3 Фильтр по людям в Dashboard

В filter bar добавить dropdown "Оператор" — фильтрует весь Dashboard (KPI, Pipeline, Graph) по created_by.

## 3. Приоритет

| Фаза | Задача | Оценка |
|------|--------|--------|
| B1 | Миграция `updated_by/at` | 1 час |
| B2 | Field changelog таблица | 30 мин |
| B3 | Middleware trackChanges | 3-4 часа |
| B4 | Обновить все PUT routes | 2-3 часа |
| C1 | UI метаданные на карточках | 2-3 часа |
| C2 | Журнал field-level | 2-3 часа |
| C3 | Фильтр по оператору в Dashboard | 1 час |

**Итого: ~2 рабочих дня**
