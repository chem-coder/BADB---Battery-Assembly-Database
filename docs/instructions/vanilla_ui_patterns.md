# Vanilla UI Patterns

Created: 2026-05-07
Edited: 2026-05-08
Status: instruction

Use this when implementing recurring vanilla-page behavior in `public/`.

Source paths:

- `public/js/3-batteries.js`
- `public/workflow/3-batteries.html`
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

## Button Language And Tooltips

The vanilla app UI is Russian. Do not introduce English visible labels such as
`Save`, `Print`, `Exit`, `Log out`, or mixed/transliterated labels such as
`Nazad`.

Use exactly this visible vocabulary on opened-record pages:

- `Сохранить` means save the opened record.
- `Печать` means open the print report.
- `Выйти` means close the opened record and return to the list view. It does
  not mean account logout.
- `Удалить` means delete the opened record.
- `Выйти из аккаунта` means end the user session.

Do not use `Назад` for closing an opened record on vanilla reference/workflow
pages. Use `Выйти` with a tooltip instead.

Every button must have a hover description via `title`. Icon-only buttons must
also have `aria-label`. For list-level icon buttons, use the exact same phrase
for `title` and `aria-label`.

Required common tooltips:

- `Сохранить`: `Сохранить изменения`
- `Печать`: `Печать отчёта`
- `Выйти`: `Вернуться к списку, не выходя из аккаунта`
- `Удалить`: `Удалить запись`
- `Выйти из аккаунта`: `Выйти из аккаунта`
- list print icon: title + `aria-label` `Печать отчёта`
- list duplicate icon: title + `aria-label` `Дублировать запись`
- list open/edit icon, if present: title + `aria-label` `Открыть запись`
- filter reset button: `Сбросить фильтры`

Standard placement:

- `Печать`: both list-level icon and opened-record sticky/header button when a
  report exists.
- `Дублировать`: list-level icon only unless Dalia explicitly approves another
  placement.
- `Удалить`: opened-record sticky/header button only.
- `Выйти`: opened-record sticky/header button only.

## Access Terminology

For project access/confidentiality UI, do not use `Видимость` as the visible
field/filter label and do not use `публичный` as the visible value.

The database/API value names may remain `public`, `department`, and
`confidential`. These are internal values, not Russian UI labels.

Use this visible vocabulary:

- field/filter label: `Доступ`
- all-filter option: `Все уровни доступа`
- `public`: `для всех`
- `department`: `для отдела`
- `confidential`: `выборочный доступ`

For list metadata, prefer phrases such as `доступ: для всех`,
`доступ: для отдела`, or `доступ: выборочный доступ`.

## Filter Layout

For vanilla list filters, keep the result count below the filter controls, not
inside the same row as selects/buttons.

Use this structure:

1. filter controls;
2. reset/clear button with the filter controls;
3. count line below all filter controls, for example `Всего: 6`.

Do not let count text compete with controls in a crowded row. On pages with
multi-row filters, the count still belongs below the full filter block.

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

## Verification

For a small vanilla UI behavior change, run at least:

```bash
node --check public/js/<changed-page>.js
git diff --check
```

For behavior that depends on rendering, also do a browser check from the state
where the bug was observed. For page-top scroll, that means scroll down first,
click the real action button, and confirm that the new top panel is visible.
