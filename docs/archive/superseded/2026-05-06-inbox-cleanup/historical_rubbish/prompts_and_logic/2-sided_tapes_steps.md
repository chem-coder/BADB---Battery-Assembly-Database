Yes. I think the best place is:

- `tape_step_coating.coating_sidedness`

Why there:
- this is clearly a property of the coating step
- not of the recipe
- not of the foil
- and not really of the tape in the abstract, independent of process

So I would add a new column to `tape_step_coating`, something like:
- `coating_sidedness`

Values:
- `one_sided`
- `two_sided`

UI label in Russian:
- `Тип нанесения:`
- options:
  - `Одностороннее`
  - `Двустороннее`

I would not call it “1-sided tape / 2-sided tape” in the form, because what is being chosen there is really the coating configuration/process, not the metaphysical identity of the tape.

For the tape list label:
- yes, include it there too
- but derive it from the saved coating step
- for example append:
  - `— односторонняя`
  - `— двусторонняя`

So the clean model is:
1. store it once on `tape_step_coating`
2. use it in the UI form
3. surface it in the tape list label
4. later also include it in print/export

My recommendation for naming:
- DB: `coating_sidedness`
- UI: `Тип нанесения`
- values shown to users:
  - `Одностороннее`
  - `Двустороннее`

If you want, I can implement this now:
- migration
- backend save/load
- tapes form
- tapes list label
- print report mention if appropriate.




Yes. The property must propagate **downstream**, but must remain **derived and read-only**.

---

## Step 1 — Do NOT store sidedness on electrodes or batteries

Do **not** add:

* `electrodes.sidedness`
* `batteries.sidedness`

Reason:

* it is fully determined by `tapes.sidedness`
* storing it would introduce inconsistency risk

---

## Step 2 — Expose sidedness on electrodes (read-only)

At electrode level:

* sidedness must be **derived from source tape**
* displayed, but not editable

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

* read sidedness of selected electrode
* compare with existing ones

### If mismatch:

* block selection
* show error:

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

* battery-level sidedness selector
* electrode-level selector

Everything must flow:

```
Tape → Electrode → Battery
```

---

## Final model

* Tape: **source of truth**
* Electrode: **inherits (read-only)**
* Battery: **derived + validated**

---

## Key principle

Sidedness is:

* **not a choice**
* **not editable downstream**
* **only selectable indirectly via tape**

---

If needed, next step can define exact SQL constraints or frontend validation hooks.
