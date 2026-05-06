# Material Sources, Quality Rating, and Capacity Calculation

Created: unknown
Edited: 2026-05-06
Status: superseded

Superseded by:

- `docs/current/materials.md`
- `docs/current/capacity_calculations.md`
- `docs/rules/material_composition_rules.md`
- `docs/future/materials_capacity_next.md`

## Overview

This feature introduces:

1. **Material source tracking (supplier / lot / quality)**
2. **Quality rating system (label + score + notes)**
3. **Traceability from source → instance → tapes → electrodes → batteries**
4. **Capacity calculations at electrode and battery level**

The design preserves existing architecture:
- `materials` remain abstract
- `material_instances` remain workflow objects
- new table handles procurement + evaluation

---

# 1. Data Model

## 1.1 Materials (existing, unchanged)

Abstract material definition used in recipes.

```sql
materials
- material_id (PK)
- name
- role
- ...
## 1.2 Material Sources (NEW)

Represents **purchased supplier/product/lot records**.

```sql
material_sources
- source_id (PK)
- material_id (FK → materials.material_id)

-- supplier identity
- supplier TEXT
- brand TEXT
- model_or_catalog_no TEXT
- lot_number TEXT

-- logistics
- date_ordered DATE
- date_received DATE

-- evaluation
- quality_rating_label TEXT  -- ENUM: good | ok | bad | tbd
- quality_rating_score INTEGER  -- 1–5, nullable
- evaluation_notes TEXT

-- state
- is_evaluated BOOLEAN DEFAULT FALSE
```

### Notes

- One material can have multiple sources
    
- Rating is optional initially
    
- Default rating = `tbd`
    

---

## 1.3 Material Instances (MODIFIED)

Add link to source.

```sql
material_instances
- material_instance_id (PK)
- material_id (FK)

-- NEW
- source_id (FK → material_sources.source_id, NULL allowed)
```

### Rules

```text
IF instance is purchased pure material:
  source_id MUST exist

IF instance is derived/composite:
  source_id = NULL
```

---

# 2. Creation Flow

## 2.1 Creating a Material

When a new material is created:

```text
1. Insert into materials
2. Auto-create 100% pure material_instance
3. Auto-create material_source
4. Link:
     material_instance.source_id = material_source.source_id
5. Set:
     quality_rating_label = 'tbd'
     is_evaluated = false
```

---

## 2.2 Creating Additional Pure Instances

When user creates another pure instance:

```text
1. Create new material_instance
2. Create new material_source
3. Link them
4. Mark source as incomplete (tbd)
```

---

# 3. UI Behavior

## 3.1 Materials Page

Each **material instance row** shows:

```text
[ Instance Name ]   [ Details ]   [ ● Rating ]
```

### Rating Display

|State|Color|
|---|---|
|good|green|
|ok|blue or grey|
|bad|red|
|tbd|empty / white / neutral|

---

### Visibility Rule

```text
IF material_instance.source_id IS NOT NULL
  → show rating dot
ELSE
  → show nothing
```

---

## 3.2 Details Button

- Opens **new tab**
    
- Opens page for **specific material_instance**
    
- Edits linked `material_source`
    

---

## 3.3 Details Page

Edits:

```text
supplier
brand
model/catalog
lot_number
date_ordered
date_received

quality_rating_label
quality_rating_score
evaluation_notes
```

---

### Behavior

```text
record exists at creation (empty)

user edits → saves → updates same record
```

---

# 4. Quality Rating System

## 4.1 Fields

```text
quality_rating_label   → fast decision
quality_rating_score   → analytics
evaluation_notes       → explanation
```

---

## 4.2 Label Values

```text
good
ok
bad
tbd
```

---

## 4.3 Score (Optional)

```text
1–5 scale
```

Suggested interpretation:

```text
5 → excellent
4 → good
3 → ok
2 → poor
1 → bad
```

---

## 4.4 Key Principle

```text
rating belongs to source
instance only displays it
```

---

# 5. Traceability

Full chain:

```text
material_source
  ↓
material_instance
  ↓
mix / protocol
  ↓
tape
  ↓
electrode_cut_batch
  ↓
electrode
  ↓
battery
```

---

# 6. Capacity Calculations

## 6.1 Electrode Capacity

### Formula

```text
capacity_mAh = coating_mass_g × active_fraction × specific_capacity_mAh_per_g
```

### Areal Capacity

```text
capacity_mAh_per_cm2 = capacity_mAh / electrode_area_cm2
```

### One-Sided Capacity (for double-sided electrodes)

```text
one_side_capacity = capacity_mAh_per_cm2 / 2
```

---

## 6.2 Batch Average

```text
average_capacity = mean(capacity_mAh_per_cm2 across electrodes)
```

---

## 6.3 Battery Capacity

For assembled battery:

```text
total_cathode_capacity = sum(cathode electrodes)
total_anode_capacity   = sum(anode electrodes)

limiting_capacity = min(cathode, anode)

N/P ratio = anode / cathode
```

---

## 6.4 Half Cells

```text
only working electrode capacity is shown
limiting capacity logic is NOT applied
```

---

# 7. Future Analytics

This structure enables:

```text
- supplier performance tracking
- lot-level failure analysis
- correlation: supplier → battery performance
- filtering: show all "bad" suppliers
```

---

# 8. Key Design Rules

```text
materials = abstract chemistry

material_sources = purchased product / lot / evaluation

material_instances = workflow substance (used in lab)

rating lives in material_sources ONLY

instances reflect rating via source_id
```

---

# End of Spec

```

---

Next step (separate task): schema migration SQL + API routes + UI wiring can be generated from this.
```

# Phases

PHASE 1 — DATABASE
- create material_sources table
- add source_id to material_instances
- define constraints

PHASE 2 — CREATION LOGIC
- modify material creation flow
- auto-create:
    material_instance
    material_source
- link them

PHASE 3 — API
- GET /material-sources/:id
- PATCH /material-sources/:id
- include source info in material_instances queries

PHASE 4 — UI (materials page)
- add Details button per instance
- add rating dot display
- implement visibility rule

PHASE 5 — DETAILS PAGE
- build form
- load + save material_source

PHASE 6 — CAPACITY (later)
- electrode calculation
- batch averages
- battery limiting capacity

## Phase 1

Write a PostgreSQL migration file that introduces material source tracking.

Requirements:

1. Create a new table: material_sources

Columns:
- source_id (primary key, auto-increment)
- material_id (integer, NOT NULL, foreign key → materials.material_id, ON DELETE CASCADE)

Supplier / identity fields:
- supplier (text)
- brand (text)
- model_or_catalog_no (text)
- lot_number (text)

Logistics:
- date_ordered (date)
- date_received (date)

Evaluation:
- quality_rating_label (text, default 'tbd')
- quality_rating_score (integer, must be between 1 and 5, nullable)
- evaluation_notes (text)

State:
- is_evaluated (boolean, default false)

Timestamps:
- created_at (timestamp, default now())
- updated_at (timestamp, default now())

2. Modify existing table: material_instances

- Add column: source_id (integer, nullable)
- Add foreign key: material_instances.source_id → material_sources.source_id
- ON DELETE SET NULL

3. Indexes:

- Index on material_sources.material_id
- Index on material_instances.source_id

4. Do NOT:
- add triggers
- add business logic constraints (pure vs derived)
- modify any other tables

5. Output:
- a single SQL migration file
- clean, readable, properly formatted

## Phase 
