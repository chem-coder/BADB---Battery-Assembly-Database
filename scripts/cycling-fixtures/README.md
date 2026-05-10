# Cycling parser test fixtures

Synthetic ELITECH P-20X8 export files for verifying `scripts/parse_cycling.py`
without needing access to a real ELITECH cycler. Two formats are covered
because real exports come in either flavor depending on the lab's locale.

## Files

| File | Format | Encoding | Cycles | Steps/cycle | Datapoints |
|------|--------|----------|--------|-------------|------------|
| `elitech_en_minimal.txt` | EN headers (`Cycle N` / `Step N`) | utf-8 | 2 | 2 (charge + discharge) | 20 |
| `elitech_ru_minimal.txt` | RU headers (`Цикл N, Шаг M`) | cp1251 | 1 | 2 (charge + discharge) | 10 |

Both fixtures use **3-column data rows** (`Time / Voltage / Current`) which is
the canonical ELITECH layout. Capacity and energy are computed by the parser
via `current * dt` integration — they're not in the source file.

The EN fixture has 2 cycles where cycle 2 has slightly lower discharge
current (-0.0009 A vs -0.001 A) — produces a non-trivial coulombic
efficiency drop in the summary, which is useful for testing UI features
that highlight cycle-to-cycle degradation.

## Verifying the parser by hand

```bash
# EN format
python3 scripts/parse_cycling.py \
  --file scripts/cycling-fixtures/elitech_en_minimal.txt \
  --format elitech \
  --session-id 1 | python3 -m json.tool

# RU format (cp1251 encoded — parser auto-detects)
python3 scripts/parse_cycling.py \
  --file scripts/cycling-fixtures/elitech_ru_minimal.txt \
  --format elitech \
  --session-id 1 | python3 -m json.tool
```

Expected output shape (`{ datapoints, summary, meta }`):
- `datapoints`: array of `{cycle_number, step_number, time_s, voltage_v,
  current_a, step_type, capacity_ah, energy_wh}` rows
- `summary`: array of per-cycle aggregates with `charge_capacity_ah`,
  `discharge_capacity_ah`, `coulombic_efficiency`, `energy_efficiency`,
  `avg_charge_voltage_v`, `avg_discharge_voltage_v`, `max_voltage_v`,
  `min_voltage_v`, `duration_s`
- `meta`: `{total_cycles, total_datapoints, encoding, source_format,
  detected_format}` plus any RU metadata fields (`sample_name`, `date`,
  `time`, `instrument`, `channel`, `user_comment`) when the file has them

Reference snapshots are stored beside the fixtures:

- `expected_en.json`
- `expected_ru.json`

## Expected output examples

### `elitech_en_minimal.txt` — first cycle summary

```json
{
  "cycle_number": 1,
  "charge_capacity_ah": 0.000066667,
  "discharge_capacity_ah": 0.000066667,
  "coulombic_efficiency": 100.0,
  "energy_efficiency": 100.0,
  "avg_charge_voltage_v": 3.44,
  "avg_discharge_voltage_v": 3.44,
  "max_voltage_v": 4.2,
  "min_voltage_v": 2.5,
  "duration_s": 240.0
}
```

Cycle 2 has `coulombic_efficiency ≈ 90.0` because the discharge current is
0.9× the charge current (intentional asymmetry to verify the percent
calculation works).

### `elitech_ru_minimal.txt` — meta

```json
{
  "encoding": "cp1251",
  "source_format": "elitech",
  "detected_format": "elitech",
  "sample_name": "Test cell #1",
  "date": "2026-04-30",
  "time": "12:00:00",
  "instrument": "ELITECH P-20X8",
  "channel": 5,
  "user_comment": "Synthetic minimal RU fixture for parser tests"
}
```

The `encoding` field shows the parser correctly auto-detected cp1251
(it tries utf-8 first, falls back when non-ASCII bytes don't decode).

## Why these fixtures exist

- **Format documentation** — anyone building a new parser feature can see
  what a valid file looks like without having to dig through the
  ELITECH user manual.
- **Manual smoke test** — quick sanity check after parser changes:
  `python3 ... --file ...minimal.txt` should produce the snapshot above.
- **Future automated tests** — once we have Python test infrastructure
  (e.g. pytest), these fixtures can be loaded and asserted against
  for regression coverage.

## Regenerating the expected snapshots

The `expected_en.json` and `expected_ru.json` files are pretty-printed
parser outputs frozen at the time the parser was last validated. **When
the parser logic changes (output shape, new fields, computation
adjustments), the expected files MUST be regenerated** or future
diffs will misleadingly suggest the parser is broken.

To regenerate after a parser change:

```bash
python3 scripts/parse_cycling.py \
  --file scripts/cycling-fixtures/elitech_en_minimal.txt \
  --format elitech --session-id 1 \
| python3 -c 'import json,sys; json.dump(json.load(sys.stdin), open("scripts/cycling-fixtures/expected_en.json","w"), indent=2, ensure_ascii=False)'

python3 scripts/parse_cycling.py \
  --file scripts/cycling-fixtures/elitech_ru_minimal.txt \
  --format elitech --session-id 1 \
| python3 -c 'import json,sys; json.dump(json.load(sys.stdin), open("scripts/cycling-fixtures/expected_ru.json","w"), indent=2, ensure_ascii=False)'

git diff scripts/cycling-fixtures/expected_*.json
# Review the diff carefully — any unexpected change is a parser bug.
```

If the diff shows unintended changes (precision shift, missing field,
etc.), that's a parser regression — investigate before committing.

## What's NOT covered (deliberately)

- Multi-step cycles with more than 2 steps (CCCV, rest steps)
- Files with temperature columns
- Files with `Тип работы: Вольтметр` (OCV / rest detection)
- Files larger than ~1 KB (real exports can be hundreds of MB)
- Malformed files (missing headers, truncated rows, encoding errors)

These are real edge cases the parser handles, but they're not needed for
the minimal smoke-test purpose of these fixtures. Add bigger fixtures
under `scripts/cycling-fixtures/edge-cases/` when needed.

## Dependency

Requires `scripts/parse_cycling.py` to exist on the branch you're testing
from. The parser landed in PR #11 (cycling-backend) — these fixtures only
work on branches that have that PR's contents.
