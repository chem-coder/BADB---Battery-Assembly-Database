# Cycling reference-data import (SOH verification)

One-time, **manually-run** pipeline that loads colleague cycling data (LFP / NMC /
NCA cells) into the DB so the in-app SOH / capacity charts can be validated
against a known-good Excel source. **Not** wired into CI or app startup.

## What it does

**Canonical importer: `import_from_combined.py`** — reads the colleague's clean
combined long-format sheet `SOH_DSh_cycles` (in `почта/LFP NMC NCA.xlsm`),
columns: `Серия | Тип | C | № | Chg | DChg | Energy | Volt | SOH`. Segments it
into blocks (one `cycling_session` per cell × rate-step) and loads full per-cycle
metrics into `cycling_cycle_summary`.

```
SOH(n) = DChg.Cap(n) / DChg.Cap(first working cycle) × 100 %   (derived in-app)
CE(n)  = DChg.Cap(n) / Chg.Cap(n) × 100 %        (QC: nulled outside [50,105]%)
```

Result: **134 sessions, 21 479 rows, 7 protocols** — verified **exactly equal**
to the sheet (DChg multiset: 0 missed, 0 extra). The importer refuses to emit SQL
unless its parsed data matches the sheet bit-for-bit.

## Files

| script | purpose |
|--------|---------|
| **`import_from_combined.py`** | **canonical** — import from the clean `SOH_DSh_cycles` table, with a strict parsed↔sheet reconcile gate |
| `discover_percell.py`   | (legacy) map every per-cell sheet's layout |
| `percell_extract.py`    | (legacy) header-anchored per-cell extractor |
| `rich_import.py`        | (legacy) per-cell rich import — superseded; 135 sessions, 2 extra boundary cycles |
| `verify_soh.py`         | prove our SOH == colleague SOH column |
| `audit_completeness.py` | per-cell truncation audit |
| `import_ref_cycling.py` | (legacy) summary-only (DChg) import |

The per-cell scripts are kept for provenance; they produced the same data the
hard way. Use `import_from_combined.py` going forward.

## Usage

```bash
export REF_XLSX="/path/to/LFP NMC NCA.xlsm"   # default: ~/Desktop/почта/...
python3 import_from_combined.py                       # parse + STRICT reconcile + plan
python3 import_from_combined.py --sql combined.sql    # generate SQL (only if reconciled)
psql -U Dalia -d badb_app_v1 -v ON_ERROR_STOP=1 -f combined.sql   # apply
```

Requires `openpyxl`. Connects to PostgreSQL as the app owner (`-U Dalia`,
see the DB-ownership note in project memory).

## Tagged + removable

Every imported session has `notes LIKE 'REF_IMPORT:%'`. Remove all (cascades to
summary + datapoints):

```sql
DELETE FROM cycling_sessions WHERE notes LIKE 'REF_IMPORT:%';
```

The import SQL is idempotent — it runs this DELETE first, so re-running replaces
cleanly rather than duplicating.

## Caveats

- Reference sessions attach to `battery_id = 1` (no dedicated reference battery /
  `is_reference` flag yet — a schema improvement to discuss with the DB owner).
- `charge_energy` is absent in the source → `energy_efficiency` stays null.
- `avg_discharge_voltage_v` holds the source's "Med. Volt" (mean cycle voltage).
