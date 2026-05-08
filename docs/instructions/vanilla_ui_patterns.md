# Vanilla UI Patterns

Created: 2026-05-07
Edited: 2026-05-08
Status: instruction

Use this when implementing recurring vanilla-page behavior in `public/`.

Source paths:

- `public/js/3-batteries.js`
- `public/workflow/3-batteries.html`
- `public/reference/users.html`
- `public/css/styles.css`
- `docs/future/vanilla_reference_page_upgrade.md`

## Top-Of-Page Scroll

When an action reveals an important panel at the top of a vanilla page, such as
a guided delete flow under a sticky record header, scroll the document itself to
the top after the panel has been rendered or unhidden.

Use the shared UI helper:

```js
window.BADB_UI.scrollToTop();
```

For ordinary record opening, smooth page-top scrolling is acceptable:

```js
window.BADB_UI.scrollToTop({ behavior: 'smooth' });
```

`BADB_UI.scrollToTop()` owns the document-scroller implementation:
`document.scrollingElement` / `document.documentElement` / `document.body`, plus
`window.scrollTo(0, 0)` fallback behavior. Do not copy that block into each page.

Do not use `stickyHeader.scrollIntoView()` or
`BADB_UI.scrollToElement(stickyHeader)` for this job. A sticky header can be
visible because it is stuck to the viewport while the document is still scrolled
far down, so element scrolling may do nothing.

`window.BADB_UI.scrollToElement()` is still acceptable for ordinary "bring this
non-sticky element into view" behavior. It is not the right helper when the
requirement is "return the page to the top" or "show the top guided panel now".

For destructive or guided flows, prefer immediate scrolling. Smooth scrolling
can leave the user looking at the wrong section during the important moment.

If a future page uses a real inner scroll container instead of the document,
the page must name that container explicitly and set that container's
`scrollTop = 0`; do not guess by targeting a sticky child.

Implementation order:

1. render or unhide the target top panel;
2. call `window.BADB_UI.scrollToTop()`;
3. browser-test from a mid-page position by clicking the actual button.

## Sticky Header Delete Flows

For pages with sticky opened-record headers:

- keep the destructive button inside the opened-record header or form area;
- run backend preflight before showing typed confirmation;
- render the guided delete panel directly under the sticky header;
- scroll the document to the top after every delete-button outcome that shows
  a guided delete panel or blocker message;
- keep inline action feedback next to the action button.

The scroll target is the page top, not the button and not the sticky header.

## Derived Status Controls

When a field displays a system-derived state, do not wire it as ordinary dirty
form input.

Required pattern:

- render derived values explicitly;
- disable the control while the value is not user-selectable;
- omit derived options from the enabled selectable option list;
- attach a dedicated `change` handler for user-selectable values;
- exclude that field from generic form `input`/`change` dirty handlers;
- after saving, update frontend state from the backend response before
  re-rendering the control.

The Batteries page uses this pattern for `battery_status`: derived `Открыт` is
shown while assembly is incomplete, but only `assembled`, `testing`,
`completed`, and `failed` are selectable after assembly is complete.

## Users Filter Layout

The Users page has a fixed two-row filter layout, not a free-wrapping flex row.

Required desktop layout:

- top row: text search, then the role filter with any injected
  `Текущий пользователь` button beside the role select;
- second row: department filter, active/inactive status filter, and reset
  button;
- third row: the result count, for example `Всего: 37`, below all filter
  controls.

Do not let the role label/select rise above the search baseline, and do not let
the `Текущий пользователь` button wrap under the role select on desktop. The
global auth enhancer can insert that button directly after select elements, so
Users page CSS must keep the role select and injected button on the same filter
row.

## Verification

For a small vanilla UI behavior change, run at least:

```bash
node --check public/js/<changed-page>.js
git diff --check
```

For behavior that depends on rendering, also do a browser check from the state
where the bug was observed. For page-top scroll, that means scroll down first,
click the real action button, and confirm that the new top panel is visible.
