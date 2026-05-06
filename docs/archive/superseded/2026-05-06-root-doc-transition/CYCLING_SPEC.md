# Cycling Module — Technical Specification

Updated: 2026-05-06

Status: partially implemented. The current implementation lives in
`routes/cycling.js`, `scripts/parse_cycling.py`, `client-web/src/pages/CyclingPage.vue`,
`client-web/src/components/CyclingCharts.vue`, and migrations `015`, `019`, `020`.
This document describes the implemented shape first; future/aspirational items
are explicitly marked.

## Overview

Battery cycling (charge/discharge testing) module for BADB. Covers the full
pipeline from equipment file upload through data storage to interactive
chart visualization and export.

---

## 1. Data Model

### 1.1 cycling_sessions

One row per test run (one file upload = one session).

| Column | Type | Notes |
|--------|------|-------|
| session_id | SERIAL PK | |
| battery_id | INT FK → batteries | Required |
| equipment_type | TEXT | 'neware', 'arbin', 'biologic', 'generic' |
| file_name | TEXT | Original filename |
| file_path | TEXT | Server path to raw file |
| file_hash | TEXT | SHA-256 for dedup |
| channel | INT | Equipment channel number |
| protocol | TEXT | Test protocol name (optional) |
| started_at | TIMESTAMP | First datapoint timestamp |
| ended_at | TIMESTAMP | Last datapoint timestamp |
| total_cycles | INT | Computed after parse |
| status | TEXT | 'processing', 'ready', 'error' |
| error_message | TEXT | If status = 'error' |
| uploaded_by | INT FK → users | |
| uploaded_at | TIMESTAMP DEFAULT now() | |
| notes | TEXT | |
| created_at | TIMESTAMP DEFAULT now() | |
| active_mass_mg | DOUBLE PRECISION | Optional; used for mAh/g plots and Excel export |

### 1.2 cycling_datapoints

Raw time-series data. Potentially millions of rows.

| Column | Type | Notes |
|--------|------|-------|
| datapoint_id | BIGSERIAL PK | |
| session_id | INT FK → cycling_sessions | Indexed |
| cycle_number | INT | 0-based |
| step_number | INT | Step within cycle |
| step_type | TEXT | 'charge', 'discharge', 'rest', 'cccv' |
| time_s | DOUBLE PRECISION | Seconds from session start |
| voltage_v | DOUBLE PRECISION | |
| current_a | DOUBLE PRECISION | |
| capacity_ah | DOUBLE PRECISION | |
| energy_wh | DOUBLE PRECISION | |
| temperature_c | DOUBLE PRECISION | Nullable |

**Index:** `(session_id, cycle_number)` for cycle-based queries.

### 1.3 cycling_cycle_summary

Pre-computed per-cycle metrics for fast chart rendering.

| Column | Type | Notes |
|--------|------|-------|
| summary_id | SERIAL PK | |
| session_id | INT FK → cycling_sessions | |
| cycle_number | INT | |
| charge_capacity_ah | DOUBLE PRECISION | |
| discharge_capacity_ah | DOUBLE PRECISION | |
| coulombic_efficiency | DOUBLE PRECISION | discharge/charge × 100 |
| charge_energy_wh | DOUBLE PRECISION | |
| discharge_energy_wh | DOUBLE PRECISION | |
| max_voltage_v | DOUBLE PRECISION | |
| min_voltage_v | DOUBLE PRECISION | |
| avg_temperature_c | DOUBLE PRECISION | Nullable |
| duration_s | DOUBLE PRECISION | Cycle duration |
| energy_efficiency | DOUBLE PRECISION | Added by migration 019 |
| avg_charge_voltage_v | DOUBLE PRECISION | Added by migration 019 |
| avg_discharge_voltage_v | DOUBLE PRECISION | Added by migration 019 |

**Unique:** `(session_id, cycle_number)`

---

## 2. File Upload & Security

### 2.1 Storage Layout

```
uploads/
  cycling/
    raw/           # Original files, never deleted
    processing/    # Temp during parse
```

- Directory outside Express static root (not served via HTTP)
- FS permissions: 700 (server process only)
- Files renamed to `{session_id}_{timestamp}_{hash_prefix}.{ext}`
- SHA-256 hash computed on upload for deduplication

### 2.2 Upload Flow

```
Browser: select file + battery_id + equipment_type
  → POST /api/cycling/upload (multipart/form-data, auth required)
  → Server: validate extension (.csv, .xlsx, .txt), max 100 MB
  → Save to raw/, compute SHA-256, check for duplicates
  → Create cycling_session (status='processing')
  → Spawn Python parser as child process
  → Parser writes JSON to stdout → bulk INSERT
  → Update session (status='ready', total_cycles, started_at, ended_at)
  → Log to activity_log
```

### 2.3 Validation Rules

- Allowed extensions: `.csv`, `.xlsx`, `.xls`, `.txt`
- Max file size: 100 MB
- MIME type check
- SHA-256 duplicate detection (warn, don't block)
- First 10 lines parsed to verify expected columns

---

## 3. Python Parser

### 3.1 Interface

```bash
python3 scripts/parse_cycling.py \
  --file /path/to/raw/file.csv \
  --format neware|arbin|biologic|generic \
  --session-id 42
```

Output: JSON to stdout

```json
{
  "datapoints": [
    {"cycle": 0, "step": 1, "step_type": "charge", "time_s": 0.0,
     "voltage_v": 3.0, "current_a": 0.1, "capacity_ah": 0.0, ...},
    ...
  ],
  "summary": [
    {"cycle": 0, "charge_capacity_ah": 0.150, "discharge_capacity_ah": 0.148, ...},
    ...
  ],
  "meta": {
    "total_cycles": 100,
    "started_at": "2026-04-01T10:00:00",
    "ended_at": "2026-04-05T14:30:00",
    "channel": 3
  }
}
```

### 3.2 Format Handlers

**Generic CSV** (fallback): expects columns: `cycle`, `step`, `time_s`,
`voltage_v`, `current_a`, `capacity_ah`. Auto-detect delimiter.

**Neware**: specific column mapping from Neware BTS export format.

**Arbin**: specific column mapping from Arbin MITS Pro export.

**BioLogic**: specific column mapping from EC-Lab .mpt/.txt export.

Each handler is a function that returns a normalized list of datapoints.

---

## 4. API Endpoints

### 4.1 Upload

```
POST /api/cycling/upload
Content-Type: multipart/form-data
Auth: required

Fields:
  file: File
  battery_id: number (required)
  equipment_type: string (required)
  channel: number (optional)
  protocol: string (optional)
  notes: string (optional)

Response: { session_id, status: 'processing' }
```

### 4.2 Sessions

```
GET /api/cycling/sessions
  ?battery_id=N        # filter by battery
  ?status=ready        # filter by status

Response: [{ session_id, battery_id, equipment_type, file_name,
             total_cycles, status, uploaded_by, uploaded_at, ... }]

GET /api/cycling/sessions/:id
Response: { ...session, uploader_name }

PATCH /api/cycling/sessions/:id
Body: { channel?, protocol?, notes?, active_mass_mg? }
Response: { session_id, channel, protocol, notes, active_mass_mg }

DELETE /api/cycling/sessions/:id
Auth: admin or uploader
```

### 4.3 Data

```
GET /api/cycling/sessions/:id/summary
Response: [{ cycle_number, charge_capacity_ah, discharge_capacity_ah,
             coulombic_efficiency, ... }]

GET /api/cycling/sessions/:id/cycles/:cycle
Response: [{ time_s, voltage_v, current_a, capacity_ah, ... }]
  # Returns raw datapoints for ONE cycle (for detailed view)

GET /api/cycling/sessions/:id/datapoints
  ?from_cycle=0&to_cycle=10    # range filter
  ?downsample=100              # max points per cycle (for overview)
Response: [{ cycle_number, time_s, voltage_v, current_a, ... }]
```

### 4.4 Export

```
GET /api/cycling/sessions/:id/export
  ?format=csv|xlsx
  ?cycles=0-10          # optional range
Response: file download

GET /api/cycling/export/xlsx
  ?session_ids=1,2,3
  ?label=optional_export_name
Response: multi-sheet Excel workbook
```

---

## 5. Frontend

### 5.1 CyclingPage

New page at `/cycling`. Navigation: add to workflowSections after 'assembly'.

**Layout:** List of sessions (CrudTable) + chart area below.

**Session list columns:**
- Session ID
- Battery (link)
- Equipment
- Cycles
- Status badge
- Uploaded by
- Date
- Actions (view charts, delete)

**Upload dialog:**
- File input
- Battery select (dropdown from /api/batteries)
- Equipment type select
- Channel, protocol, notes (optional)
- Upload button → progress indicator → auto-refresh table

### 5.2 Charts (Chart.js)

Shown when a session is selected:

1. **Capacity vs Cycle** — discharge capacity per cycle (primary chart)
   - X: cycle number, Y: capacity (Ah)
   - Line chart, shows capacity fade

2. **Coulombic Efficiency vs Cycle**
   - X: cycle number, Y: efficiency (%)
   - Scatter/line, typically 99.5-100%

3. **Voltage Profile** — V vs time for selected cycle(s)
   - X: time (s or min), Y: voltage (V)
   - Multi-cycle overlay (select cycles via checkboxes)

4. **dQ/dV** (differential capacity) — future phase
   - X: voltage, Y: dQ/dV
   - Shows electrochemical peaks

### 5.3 Chart Controls

- Cycle range selector (from/to slider)
- Multi-session overlay (compare two sessions)
- Export chart as PNG
- Export data as CSV

---

## 6. Implementation Phases

### Phase 1: Foundation (implemented)
- Migration (3 tables + indexes)
- Python parser (generic CSV format)
- API: upload, sessions list, summary, cycle data
- CyclingPage: session table + upload dialog + capacity chart

### Phase 2: Charts & UX (partly implemented)
- Voltage profile chart with cycle selector
- Coulombic efficiency chart
- Chart export (PNG)
- Data export (CSV/XLSX)
- Multi-session comparison

### Phase 3: Equipment-specific parsers (future)
- Neware BTS format handler
- Arbin format handler
- BioLogic .mpt handler
- Auto-detect format

### Phase 4: Advanced analytics (future)
- dQ/dV differential capacity
- Rate capability comparison
- Impedance data (if available)
- Statistical analysis across sessions

---

## 7. File Security Checklist

- [ ] uploads/ outside Express static
- [ ] File extension whitelist
- [ ] MIME type validation
- [ ] Max size 100 MB (configurable)
- [ ] SHA-256 dedup check
- [ ] Files renamed (no user-controlled filenames in FS)
- [ ] FS permissions 700
- [ ] Upload logged in activity_log
- [ ] Only uploader or admin can delete
- [ ] Backup script covers uploads/cycling/raw/
