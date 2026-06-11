# Импорт нативных файлов циклеров (navani)

Загружает файлы приборов **напрямую** в BADB (без ручной перегонки в Excel):
`cycling_sessions` + `cycling_datapoints` (полный поток точек) + `cycling_cycle_summary`.

| Формат | Прибор | Статус |
|---|---|---|
| `.mpr` | Biologic | ✅ проверено (46k точек, reconcile 26/26) |
| `.xlsx` / `.xls` | Arbin, Land, Ivium | ✅ проверено (Arbin 4.5k, Land 62k точек) |
| `.ndax` | Neware | ✅ парсится (summary navani даёт NaN → гейт деградирован, смотреть диапазоны) |
| `.nda` | Neware (старый) | ⚠ их тестовый фикстур кривой; на реальном файле — проверять гейтом |
| `.res` | Arbin (MDB) | требует `brew install mdbtools` |

## Установка (один раз)

```bash
cd dalia-main
python3 -m venv .local/navani_venv
# PyPI бывает недоступен — ставим из тарбола GitHub:
curl -sL https://codeload.github.com/be-smith/navani/tar.gz/refs/heads/main -o /tmp/navani-src.tgz
tar -xzf /tmp/navani-src.tgz -C /tmp
.local/navani_venv/bin/pip install /tmp/navani-main
```

## Использование

```bash
# 1) DRY RUN — парсинг + reconcile-гейт + SQL во /tmp, БД не трогается
.local/navani_venv/bin/python scripts/cycling-file-import/import_cycler_file.py \
    --file ~/data/cell_07.mpr --battery-id 56 \
    --protocol "GCPL C/24 2.0–3.8V" --active-mass-mg 12.4

# 2) Глазами проверить отчёт: точки/циклы, диапазоны V/I/Q, гейт

# 3) Импорт + пост-проверка из БД
…тот же вызов + --apply
```

Откат любого импорта: `DELETE FROM cycling_sessions WHERE session_id=N;`
(FK с каскадом — точки и summary уходят вместе с сессией).

## Гарантии

- **Дедуп**: sha256 файла в `cycling_sessions.file_hash` — повторный запуск на том же файле = СТОП.
- **Reconcile-гейт**: наши пер-цикловые ёмкости (max Q по полуциклу) и средние напряжения (⟨V⟩=∫V dQ/Q) сверяются с `cycle_summary` самой navani (допуск 0.5% / 20 мВ). Расхождение → SQL не генерируется. 0 сверяемых величин (NaN у navani) → громкое предупреждение.
- **Пост-проверка** при `--apply`: количество точек и циклов перечитывается из БД.
- **Прослеживаемость**: notes начинаются с `NAVANI_IMPORT: <файл>`.

## Единицы

navani нормализует: Capacity → **mAh** (Arbin Ah авто-конвертится), Current → **mA**
(для поддерживаемых загрузчиков). Скрипт пишет в БД **Ah / A** (÷1000).
CE считаем по конвенции BADB: **DChg/Chg × 100** (у navani наоборот — их CE не используем).
`step_type` определяется по **знаку тока** внутри каждой группы state (не по коду состояния —
он у загрузчиков разный).

## Лицензия (важно для будущего)

navani — MIT, но его зависимость galvani (Biologic .mpr) — **GPLv3**.
Для внутреннего использования ЛИМС-ХИТ ок (нет распространения). Если продукт
когда-либо пойдёт наружу — юр. вопрос по GPL-цепочке поднять заново.
venv живёт в `.local/` (вне git) — в репо только этот скрипт.
