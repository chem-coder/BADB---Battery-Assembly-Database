Understood. The requirement is:

- **UI: remove completely**

- **Backend: untouched**


Below is the corrected **Codex prompt**.

---

````markdown
# Remove Drying Step from UI (Strict)

## Goal

Completely remove the **drying_tape step (II.2)** from the **UI only**.

- The step must **not appear anywhere in the interface**
- The step must **still exist in the database and backend logic**
- All drying data must be **controlled from the coating step (II.1)**

---

## Step 1 — Delete drying UI block

**File:** `1-tapes.html`

Find the entire fieldset:

```html
<fieldset data-step="2a-drying_tape">
````

DELETE the entire block including all children.

No exceptions.

---

## Step 2 — Ensure no rendering logic remains

**File:** `1-tapes.js`

Find any logic that references:

```
2a-drying_tape
```

REMOVE:

- visibility toggles

- render logic

- step progression handling


The UI must behave as if this step does not exist.

---

## Step 3 — Keep drying logic in background

DO NOT delete:

- `applyDryingTapePrefillFromCoating()`

- any backend calls related to drying

- any state structure storing drying_tape


Drying must still be:

- created automatically

- updated automatically


---

## Step 4 — Bind drying data to coating inputs

Ensure these coating inputs control drying:

```
2-coating-dry-temp
2-coating-dry-atmosphere
2-coating-dry-duration
```

On coating change, trigger:

```js
applyDryingTapePrefillFromCoating({ force: true })
```

---

## Step 5 — Ensure drying is saved with coating

When coating is saved:

- drying_tape must be:

    - created if missing

    - updated if exists


There must be **no separate save action for drying**

---

## Step 6 — Remove all drying event listeners

Delete any code that:

- listens to drying form inputs

- submits drying independently

- validates drying step UI


---

## Final Result

### UI:

- Only **II.1. Нанесение** is visible

- Drying does not exist visually

- No duplicate fields

- No second step


### Backend:

- Drying step still exists

- Fully populated automatically

- Used in reports and timing


---

## Constraint

Do NOT:

- modify database schema

- remove drying step from backend

- remove drying-related API


Only UI and frontend logic are affected.

```

---
```

The instruction is clear now:

- remove **only from UI**

- keep **everything else intact**

- no reinterpretation


The corrected Codex prompt already reflects exactly that.

If anything still behaves incorrectly after this change, the issue will not be in interpretation—it will be in implementation details (likely leftover JS references or hidden rendering paths).

