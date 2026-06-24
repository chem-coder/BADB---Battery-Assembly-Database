# Frontend State Rules (Vue / client-web)

Created: 2026-06-24
Edited: 2026-06-24
Status: rule

How state is organized in the Vue app. The goal is **repeatable and predictable**:
the same kind of state always goes in the same place, so nobody re-decides it per
feature. Applies to `client-web/`. (Vanilla `public/` keeps its own per-page
module-state pattern — out of scope here.)

## The decision: where does this piece of state go?

Walk the ladder top-to-bottom and stop at the **first** match:

1. **Used only inside one component, and disappears when it unmounts**
   (a search box, an expanded/collapsed flag, a local edit buffer)
   → a **local `ref()` / `reactive()`** in that component. Most state is this.

2. **The same state + logic is needed by more than one component/page**, OR it's
   a non-trivial chunk of behavior worth naming
   (open-record/form/dirty/save, fetch-by-id+cache, a delete-check, a wizard)
   → a **composable** `useX()` in `src/composables/`. This is the workhorse layer.

3. **Server data** that's fetched by id and cached / deduped
   → `useBackendCache` (don't hand-roll fetch+cache+loading per page).

4. **Truly app-wide** — potentially read by *any* page, lives for the whole
   session (who's logged in, global prefs)
   → a **Pinia store** `useXStore` in `src/stores/`. Today the only one is
   `auth`. Adding a store is a deliberate act, not a default.

> Rule of thumb: **push state DOWN, not up.** Start local; promote to a composable
> when it's reused; promote to Pinia only when the whole app needs it. Never start
> with a global store "just in case."

## The shared-state rule (learned the hard way)

**If two pieces of state must agree, connect them — never keep two copies that need
manual syncing.**

- Parent ↔ child → **props down, `emit` up** (or `v-model`).
- App-wide agreement → a **Pinia store** (single source).

Concretely: a CRUD page's "unsaved changes" guard must see *all* unsaved state. A
sub-panel that saves separately (e.g. `ProjectMembersTable`) **must** surface its
dirty state to the page (`emit('update:dirty', …)`) so the page can fold it into
`useRowOpenForm`'s `extraDirty`. (Skipping this caused silent data loss — 2026-06-24.)

## Standing conventions

- **CRUD row-open pages** (Projects, Users, Recipes, Separators, …) use
  `useRowOpenForm` for record/open/mode/form/dirty/save. Do **not** re-roll
  `currentId` / `mode` / `form` refs per page.
- **Unsaved-state** is exposed as a boolean via `emit('update:dirty', value)` and,
  if it lives outside the form, passed to `useRowOpenForm({ extraDirty })`.
- **The backend is the source of truth.** The client holds "what's on screen now,"
  not a mirror of the database. Reload from the API after a save; don't try to keep
  a long-lived client cache in sync by hand.
- **Naming:** composables `useThing()`, stores `useThingStore()`, files match.
- **Reactivity does the rendering.** Mutate a ref; never manually poke the DOM to
  match state (that's the vanilla pattern, not this one).

## Do / Don't

| Do | Don't |
|---|---|
| Start state local, promote when reused | Reach for a global store first |
| One Pinia store per truly-global concern | Put page/feature state in Pinia |
| Lift shared state via props/emit or Pinia | Keep two copies you sync by hand |
| Reuse `useRowOpenForm` / `useBackendCache` | Re-implement open-record or fetch+cache |
| Reload from API after mutations | Hand-maintain a client-side DB mirror |

## Enforcement

This is a human + AI convention (agents follow `docs/rules/`). Architectural state
placement isn't lint-checkable, but two sub-rules could be lint-enforced later if
drift appears: composable/store **naming** (`use*` / `*Store`), and "no new Pinia
store without a one-line justification in its file header."
