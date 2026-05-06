# UI Styling Consistency Plan

## Purpose

Make BADB feel like one application across the legacy vanilla pages and the newer Vue pages.

This should cover recurring interface states and small design details:

- dirty / unsaved flags;
- saved, saving, and error messages;
- disabled and readonly fields;
- locked workflow indicators;
- fonts and typography;
- buttons and action areas;
- fieldset, section, and table styling;
- small status metadata and helper text.

The goal is not a redesign. The goal is a calm, consistent technical interface.

## Current Observations

The app currently has two styling systems.

The Vue app is more tokenized:

- fonts come from `client-web/src/assets/styles/global.css`;
- brand tokens live in `client-web/src/assets/styles/tvel-theme.css`;
- disabled PrimeVue fields already have a clear grey/hatch treatment;
- `SaveIndicator.vue` gives a reusable saved / unsaved pattern.

The legacy vanilla pages are more ad hoc:

- dirty flags appear as inline spans with different classes or inline styles;
- batteries define `.dirty_marker` in `3-batteries.html`;
- electrodes use `.dirty_marker` too, but styling comes from page-local or inherited CSS;
- tapes use many inline `style="display:none; margin-left:8px;"` dirty spans;
- saved / saving / error messages appear as `.status-feedback`, `.inline-save-status`, `.inline_status`, `.save_message`, and `.autosave-message`;
- disabled styling is split between shared `public/css/styles.css` and page-local overrides.

## Design Direction

Use one restrained visual language:

- typography: same default app font stack everywhere possible;
- neutral surfaces: white fields and panels, pale blue-grey borders;
- success: mint / green, used quietly;
- warning / dirty: amber / ochre, not red;
- error: red, reserved for actual errors;
- disabled / readonly: pale grey background, muted text, not-allowed cursor;
- locked / fixed state: same disabled treatment plus a short status banner when needed;
- no heavy boxes for small messages;
- no loud color unless action is needed.

## Decisions So Far

Updated May 4, 2026.

Pass 2 update, May 5, 2026:

- vanilla workflow pages now rely more directly on shared CSS for dirty flags, inline save/status messages, disabled fields, and the battery lock banner;
- tapes dirty markers were changed from inline bullet text to the shared amber `dirty_marker` pill;
- electrodes inline status messages were added to the shared status selectors;
- tapes, electrodes, and batteries now add shared success/error/saving classes for transient save feedback where needed;
- removed duplicate page-local styles that competed with the shared styling.

### Legacy Font

Recommendation: legacy vanilla pages should eventually use the same Rosatom font stack as Vue.

Reason:

- the font is already available to the app;
- Vue already uses Rosatom as the app voice;
- matching typography is one of the fastest ways to make the old and new app feel related.

Implementation caution:

- do this through `public/css/styles.css`, not per page;
- verify dense workflow pages after the change because label widths and table wrapping may shift;
- keep print reports separate for now because the new print sheet design intentionally uses a print-safe sans-serif style.

Discovery note: as of the first vanilla CSS pass, the Rosatom font files are available under `client-web/public/fonts`, but not under the vanilla `public/` directory served by Express. Do not switch vanilla pages to Rosatom until the font assets are intentionally made available to the vanilla app.

Decision status: recommended later, but not part of the first safe rollout.

### Dirty Flags

Decision: use amber / ochre dirty flags everywhere, including batteries.

Dirty state is a warning / attention state, not an error state. Red and pink should be reserved for actual errors.

Preferred text:

- `Не сохранено`

### Saved Messages

Recommendation: saved messages should be transient in the vanilla app.

Recommended behavior:

- show `Сохранение...` while saving;
- show `Сохранено` after a successful save;
- fade or clear it after about 3 seconds;
- keep dirty flags hidden after save.

Reason:

- persistent `Сохранено` messages add visual noise on dense lab workflow pages;
- the absence of a dirty flag is already a stable saved-state signal;
- transient saved feedback gives reassurance without competing with the form.

Decision status: recommended.

### Disabled Fields

Recommendation: use plain grey disabled fields in the vanilla app for now.

Reason:

- the Vue stylesheet includes a very subtle diagonal hatch, but it is easy to miss and may not appear consistently depending on component surface;
- plain grey is clearer, calmer, and close to the legacy app's current behavior;
- hatching can be reserved later for a stronger distinction between ordinary disabled fields and locked/finalized workflow fields, if that distinction proves useful.

Decision status: recommended plain grey for this vanilla pass.

### Print Pages

Decision: print pages are not part of this interactive app UI consistency pass.

The print reports already have their own technical print-sheet design. They should stay accessible from both vanilla and Vue entry points, but their typography and layout do not need to match interactive form styling.

This plan may leave notes for Vue integration work, but this implementation pass should focus on the vanilla app.

## Proposed Shared Tokens

For legacy CSS, mirror the Vue theme tokens in `public/css/styles.css`:

```css
:root {
  --badb-blue: #003274;
  --badb-blue-hover: #025EA1;
  --badb-mint: #52C9A6;
  --badb-success: #2E9E7E;
  --badb-warning: #D3A754;
  --badb-danger: #E74C3C;
  --badb-text: #20242b;
  --badb-muted: #687484;
  --badb-border: #d8dee6;
  --badb-border-soft: #e3e7ec;
  --badb-surface: #ffffff;
  --badb-disabled-bg: #f3f5f7;
  --badb-disabled-text: #98a2af;
}
```

Do not force every color immediately. Add tokens first, then migrate page sections gradually.

## Dirty / Saved States

Use one visual model:

- Dirty flag: compact amber pill.
- Saved message: compact mint text or pill, depending on placement.
- Saving message: neutral grey text.
- Error message: compact red text.

Recommended legacy classes:

```css
.dirty_marker,
.badb-dirty-flag {
  display: none;
  margin-left: 0.45rem;
  padding: 0.1rem 0.45rem;
  border: 1px solid rgba(211, 167, 84, 0.35);
  border-radius: 999px;
  background: rgba(211, 167, 84, 0.12);
  color: #9a6c18;
  font-size: 0.75rem;
  font-weight: 600;
  vertical-align: middle;
}

.dirty_marker.visible,
.badb-dirty-flag.visible {
  display: inline-block;
}
```

Preferred text:

- dirty: `Не сохранено`
- saving: `Сохранение...`
- saved: `Сохранено`
- error: a concise human-readable error

Avoid the red dirty flag unless the state is truly an error.

Saved messages should normally be transient in vanilla pages. Use the dirty flag as the persistent state indicator.

## Status Messages

Normalize legacy message classes behind one shared style:

```css
.status-feedback,
.inline-save-status,
.inline_status,
.save_message,
.autosave-message {
  min-height: 1.2em;
  color: var(--badb-muted);
  font-size: 0.88rem;
  line-height: 1.35;
}

.is-saving {
  color: var(--badb-muted);
}

.is-saved,
.is-success {
  color: var(--badb-success);
}

.is-error {
  color: var(--badb-danger);
}
```

Then update JS only where needed to add `is-saving`, `is-saved`, or `is-error` consistently.

## Disabled And Readonly Elements

Use the Vue approach as the north star:

- grey background;
- muted text;
- pale border;
- not-allowed cursor;
- no hatch for the first vanilla pass.

Legacy target:

```css
body[data-page] input:not([type="checkbox"]):not([type="radio"]):disabled,
body[data-page] select:disabled,
body[data-page] textarea:disabled,
body[data-page] input:not([type="checkbox"]):not([type="radio"])[readonly],
body[data-page] textarea[readonly] {
  background: var(--badb-disabled-bg);
  color: var(--badb-disabled-text);
  border-color: #d9e0e7;
  cursor: not-allowed;
}
```

Keep checkbox disabled treatment separate because opacity changes can make selected states hard to read.

## Locked Workflow Indicators

Current battery assembly has a local `.assembly_locked_banner`.

Make this reusable:

```css
.badb-lock-banner {
  display: none;
  margin: 0.45rem 0;
  padding: 0.38rem 0.6rem;
  border: 1px solid var(--badb-border);
  border-radius: 6px;
  background: #f8fafc;
  color: #4d5665;
  font-size: 0.82rem;
}

.badb-lock-banner.visible {
  display: inline-block;
}
```

Use plain text. Avoid icon dependency in legacy pages unless the page already uses icons.

## Typography

Vue already uses:

```css
'Rosatom', 'Graphik Condensed', system-ui, -apple-system, sans-serif
```

Legacy pages currently use `system-ui`. The safest migration is:

1. Add the same `@font-face` declarations to `public/css/styles.css` if they are available from `/fonts`.
2. Change legacy body font stack to match Vue.
3. Keep print pages on Arial/sans-serif unless print typography is addressed separately.

Recommendation: do this, but as its own visually verified step. Typography changes are simple in code and surprisingly large in perceived UI.

## Safe Rollout Strategy

The first implementation should be intentionally conservative.

Scope for the first pass:

- vanilla pages only;
- shared CSS first;
- no Vue changes;
- no print-page changes;
- no backend changes;
- no save/autosave logic changes;
- no ID or selector renames used by JavaScript.

Recommended first target:

- unify the vanilla workflow/reference pages enough that dirty flags, status messages, disabled fields, and small banners feel related;
- avoid trying to make vanilla match Vue perfectly in the first pass.

Rollback strategy:

- keep the first pass mostly in `public/css/styles.css`;
- avoid restructuring markup;
- keep any markup edits small and obvious;
- review the diff before moving to JS changes;
- if the visual result feels wrong, revert the CSS patch and the pages should behave as before.

This means the first pass is a trial skin, not a deep refactor.

## Implementation Order

1. Add legacy design tokens to `public/css/styles.css`.
2. Add shared styles for dirty flags, status messages, disabled/readonly fields, and lock banners.
3. Update tapes dirty spans to use the shared dirty class instead of inline styling.
4. Update electrodes dirty flags if needed, keeping existing JS selectors intact.
5. Update battery dirty flags by removing page-local duplicate CSS only after verifying no behavior changes.
6. Normalize message classes in JS one page at a time:
   - tapes;
   - electrodes;
   - batteries;
   - reference pages.
7. Only after legacy pages are stable, consider extracting any Vue save/status styling into reusable tokens or a shared component variant.

Do not include print pages in this implementation order. They have already received a dedicated print-sheet treatment.

## Guardrails

- Do not change save logic while changing styling.
- Do not rename IDs used by JS.
- Prefer adding classes over restructuring markup.
- Keep changes page-scoped when behavior is risky, shared when visual only.
- Avoid broad refactors while battery calculation work is in progress.
- Verify each page visually after each phase.

## Questions Before Implementation

Resolved / recommended:

1. Legacy pages should probably use Rosatom too, but verify visually after a CSS-only pass.
2. Dirty flags should be amber (`Не сохранено`) everywhere.
3. Saved messages should be transient in vanilla pages.
4. Disabled fields should use plain grey for now.
5. Print pages stay separate from this interactive app consistency pass.

Remaining open:

- Should locked/finalized workflow fields get a separate style later, or should they look exactly like ordinary disabled fields?
- Should Vue receive a follow-up task / crumb document after vanilla styling lands?

## Recommended First Styling Pass

Start with `public/css/styles.css` only:

- add tokens;
- add shared dirty/status/disabled styles;
- add backwards-compatible selectors for existing class names;
- avoid JS changes.

Then review tapes, electrodes, and batteries in the browser. If the shared selectors are enough, the second pass can remove inline styles and page-local duplicates.

For this first pass, do not touch Vue and do not touch print pages.
