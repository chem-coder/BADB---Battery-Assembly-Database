# BADB Excel Client

## ⛔ СТРОГИЕ ПРАВИЛА (Bypass Mode)

**ВНИМАНИЕ: Репозиторий работает с включённым Bypass permissions. Следующие правила ОБЯЗАТЕЛЬНЫ.**

### Запрещено ВСЕГДА

1. **НЕ удалять файлы** — ни rm, ни git rm, ни перемещение в /dev/null. Если файл не нужен — оставить как есть и сообщить.
2. **НЕ запускать git push** — пуш делает только человек вручную.
3. **НЕ запускать git push --force** — НИКОГДА, ни при каких условиях.
4. **НЕ менять .git/config** — никакой конфигурации git.
5. **НЕ менять .claude/** — этот файл и настройки менять запрещено.
6. **НЕ создавать .env файлы** — секреты только через переменные окружения.
7. **НЕ запускать npm install / pip install** — зависимости ставит человек.
8. **НЕ трогать ветку main** — работать только в feature-ветках.
9. **НЕ выполнять команды вне репозитория** — только в пределах рабочей директории.
10. **НЕ обращаться к внешним URL** — curl, wget, fetch запрещены. LAN-only проект.

### Обязательно ВСЕГДА

1. **Читать этот файл** перед началом любой задачи.
2. **Показать план** перед изменением более чем 1 файла.
3. **Коммитить атомарно** — один коммит = одна логическая единица.
4. **Писать коммит-сообщения** на английском, формат: `type(scope): description`.
5. **Сохранять существующий стиль кода** — VBA: PascalCase для Public, camelCase для Private.
6. **Проверять компиляцию** — каждый .bas/.cls должен быть синтаксически корректным VBA.
7. **Соблюдать паттерн cmd/svc** — UI только в cmd, логика только в svc.
8. **JSON Schema draft-07** — все контракты данных.
9. **Спрашивать при неясности** — лучше уточнить, чем сделать неправильно.

### Git workflow

- Ветки: `feat/xxx`, `fix/xxx`, `docs/xxx`, `refactor/xxx`
- Коммиты: `feat(svcHttp): add GET/POST client`, `fix(cfgApp): correct SERVER_URL constant`
- НЕ мержить — мерж делает человек через PR

---

## Проект
DatabaseUI.xlam — Excel-надстройка для ввода лабораторных данных.
Часть системы BADB (Battery Assembly Database).

## Стек
VBA (Excel 2016+), CommonJS-style модули (cmd/svc/util/cfg).

## Архитектура

```
Ribbon XML (вкладка «База данных»)
  → modDBUI_2026.bas  (callbacks: OnLogin, OnLoadData, OnSync, ...)
    → modRouter.bas   (dispatch по cmdKey через массивы keys/procs)
      → cmd*.bas      (команды — UI: MsgBox, InputBox + вызов svc)
        → svc*.bas    (сервисы — чистая логика, без UI)
          → util*.bas (утилиты — ошибки, логи)
  AppContext.cls      (состояние сессии: user, role, token, flags)
  cfgApp.bas          (все константы: команды, роли, пути, колонки)
```

### Паттерн модулей

| Префикс | Назначение | UI |
|---------|-----------|-----|
| cmd*    | Команды (бизнес-логика + интерфейс) | MsgBox, InputBox — ТОЛЬКО здесь |
| svc*    | Сервисы (данные, HTTP, файлы) | Запрещён любой UI |
| util*   | Утилиты (ошибки, логи) | Debug.Print только |
| cfg*    | Конфигурация (константы) | — |
| mod*    | Инфраструктура (Router, Build, Ribbon) | Минимально |

## Инварианты

- UI (MsgBox, InputBox) ТОЛЬКО в cmd*.bas
- svc*.bas НИКОГДА не показывает UI
- Все пути — через cfgApp константы
- Collection вместо Dictionary (кросс-платформенность Mac/Win)
- JSON собирается по контракту из contracts/schemas/
- Ошибки через utilError.RaiseAppError (vbObjectError + 512)
- Логи через utilLog.LogError (Debug.Print + timestamp)

## Модули

### Реализованные

| Файл | Строк | Что делает |
|------|-------|-----------|
| cfgApp.bas | 46 | Константы: 10 команд, 4 роли, пути, колонки, SERVER_URL, API_SUBMIT |
| AppContext.cls | 86 | Состояние: UserName, Role, IsAuthorized, Token, LastLoadResponse |
| modDBUI_2026.bas | 90 | Ribbon callbacks: OnLogin, OnLoadData, OnSync и др. |
| modRouter.bas | 106 | Маршрутизатор: cmdKey → Application.Run(proc, ctx) |
| modBuild.bas | 648 | CI/CD: Export VBA → src/, Import src/ → VBA, Make .xlam |
| cmdAuth.bas | 29 | Login: InputBox → svcAuth.Authenticate → MsgBox |
| cmdLoad.bas | 59 | Загрузка: InputBox ProjectIDs → svcLoad.LoadProjects → MsgBox |
| cmdSync.bas | 191 | Синхронизация: JSON → выбор HTTP/файловая очередь → fallback |
| cmdSelfTest.bas | 31 | Тест auth flow |
| svcHttp.bas | 165 | HTTP-клиент: GET/POST/Auth через MSXML2.ServerXMLHTTP.6.0 |
| svcAuth.bas | 92 | Аутентификация: HTTP POST /api/auth → parseJsonValue → ctx |
| svcLoad.bas | 83 | Загрузка: HTTP GET /api/projects + /api/references |
| svcSubmit.bas | 70 | Отправка JSON: HTTP POST /api/submit + fallback в file queue |
| svcPackages.bas | 242 | Файловая очередь: атомарная запись JSON в Queue/Inbox |
| svcWorkbook.bas | 74 | Открытие Database_1.xlsm, поиск таблиц |
| svcJson.bas | 304 | Сборка JSON по контракту tape_prepare.v1 (envelope + payload) |
| svcSearch.bas | 221 | Поиск в загруженных данных: FindById, FindByStage, CountMatches |
| svcNavigation.bas | 37 | Переход к Named Ranges |
| cmdAdd.bas | 79 | MVP ввод tape: 3 InputBox → svcJson → svcSubmit.SubmitWithFallback |
| cmdFindID.bas | 33 | Поиск по ID в загруженных данных |
| cmdFindStage.bas | 33 | Поиск по operation_type |
| cmdFindAllStages.bas | 46 | Сводка по всем 7 operation types |
| utilError.bas | 6 | Err.Raise wrapper |
| utilLog.bas | 7 | Debug.Print с timestamp |

### Заглушки (TODO)

| Файл | Что должен делать |
|------|------------------|
| cmdShare.bas | Экспорт/обмен данными |
| cmdNewTemplate.bas | Создание шаблонов параметров |
| cmdChartsToggle.bas | Показать/скрыть графики |
| svcAccess.bas | DEPRECATED — заглушка, запланирован к удалению |
| svcCharts.bas | Управление графиками (перенести из V1) |
| svcTemplates.bas | Работа с шаблонами |

## Сервер (Даля)

- Node.js + Express + PostgreSQL 16
- LAN: http://server:3000
- API:
  - POST /api/auth → {token, role, userName}
  - GET /api/projects?ids=1,2,3 → JSON
  - POST /api/submit → приём JSON-пакетов
  - GET /api/references/:type → справочники

## Контракты данных

JSON Schema файлы в `contracts/schemas/`.
Каждый контракт — формат одного типа пакета данных.
Версионирование: `{name}.v{N}.json` (tape_prepare.v1.json).

Envelope (общая обёртка):
```json
{
  "contract_version": "tape_prepare.v1",
  "submission_type": "tape_prepare",
  "submission_id": "uuid",
  "created_at": "ISO 8601",
  "user": "login",
  "machine": "hostname",
  "checksum": "sha256(payload)"
}
```

## Структура репозитория

```
badb-excel/
├── .claude/
│   └── CLAUDE.md               ← этот файл
├── src/
│   ├── classes/
│   │   └── AppContext.cls
│   ├── modules/
│   │   ├── cfgApp.bas
│   │   ├── modRouter.bas
│   │   ├── modDBUI_2026.bas
│   │   ├── modBuild.bas
│   │   ├── cmd*.bas
│   │   ├── svc*.bas
│   │   └── util*.bas
│   └── forms/                  ← UserForms (будущее)
├── contracts/
│   ├── schemas/                ← JSON Schema контракты
│   │   └── tape_prepare.v1.json
│   └── enums/                  ← Общие перечисления
├── tests/                      ← тесты (rubberduck или ручные)
├── docs/
│   └── index.md               ← маршрутизатор документации
├── template/
│   └── DatabaseUI_template.xlam
├── archive/
│   └── v1-scripts/            ← VBA из первой версии (справочно)
├── .gitignore
└── README.md
```

## Команды сборки

```vba
' В VBA Immediate Window:
modBuild.Build_Export_All     ' экспорт VBA → src/
modBuild.Build_Import_All     ' импорт src/ → VBA
modBuild.Build_Make_Addin     ' сборка .xlam
```

## Люди

- **Дима** — Excel/VBA, архитектура, контракты, ML-видение
- **Даля** — Server/Node.js/PostgreSQL/Web UI

## Домены БД (ключевые для контрактов)

1. **Materials**: materials → active_materials → material_instances → material_instance_components
2. **Recipes**: tape_recipes → tape_recipe_lines (role: cathode_active/anode_active/binder/additive/solvent)
3. **Tapes**: tapes → tape_process_steps → tape_step_mixing/coating/drying/calendering
4. **Actuals**: tape_recipe_line_actuals (measure_mode: mass/volume)
5. **Electrodes**: electrodes → electrode_cut_batches → electrode_circle/rectangle → electrode_drying
6. **Batteries**: batteries → battery_electrodes/electrolyte/sep_config → battery_qc
7. **Modules**: modules → module_batteries → module_qc

## ENUMs (PostgreSQL)

- electrode_role: cathode, anode
- measure_mode: mass, volume
- recipe_component_role: cathode_active, anode_active, binder, additive, solvent
- tape_status: ok, experimental, discarded

## Operation Types (справочник)

1. drying_am → Drying AM
2. weighing → Weighing
3. mixing → Mixing
4. coating → Coating
5. drying_tape → Drying (tape)
6. calendering → Calendering
7. drying_pressed_tape → Drying (pressed tape)
