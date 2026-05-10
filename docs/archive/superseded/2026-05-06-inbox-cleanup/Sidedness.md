The property must propagate **downstream**, but must remain **derived and read-only**.

---

## Step 1 — Do NOT store sidedness on electrodes or batteries

Do **not** add:

- `electrodes.sidedness`

- `batteries.sidedness`


Reason:

- it is fully determined by `tapes.sidedness`

- storing it would introduce inconsistency risk


---

## Step 2 — Expose sidedness on electrodes (read-only)

At electrode level:

- sidedness must be **derived from source tape**

- displayed, but not editable


### Implementation

When loading electrode:

```js
electrode.sidedness = electrode.tape.sidedness
```

### UI

Add near electrode info:

```
Тип покрытия: 1-сторонний / 2-сторонний
```

No input.

---

## Step 3 — Enforce consistency at battery level

Rule:

```text
All electrodes in a battery must have the same sidedness
```

This must be **validated**, not selected.

---

## Step 4 — Battery sidedness = derived global property

At battery level:

```js
battery.sidedness = electrodes[0].sidedness
```

### UI

Display once (top of assembly section):

```
Тип электродов: 1-сторонние / 2-сторонние
```

No dropdown.

---

## Step 5 — Add validation when selecting electrodes

When adding electrodes to battery:

### On selection:

- read sidedness of selected electrode

- compare with existing ones


### If mismatch:

- block selection

- show error:


```
Нельзя смешивать 1- и 2-сторонние электроды в одной ячейке
```

---

## Step 6 — Show sidedness in dropdowns

### Tape dropdown (electrodes page)

Change labels:

```
Tape A → Tape A (1-sided)
Tape B → Tape B (2-sided)
```

---

### Electrode batch dropdown (battery page)

Same:

```
Batch 12 → Batch 12 (2-sided)
```

---

## Step 7 — No global manual input

Do NOT add:

- battery-level sidedness selector

- electrode-level selector


Everything must flow:

```
Tape → Electrode → Battery
```

---

## Final model

- Tape: **source of truth**

- Electrode: **inherits (read-only)**

- Battery: **derived + validated**


---

## Key principle

Sidedness is:

- **not a choice**

- **not editable downstream**

- **only selectable indirectly via tape**


---

If needed, next step can define exact SQL constraints or frontend validation hooks.