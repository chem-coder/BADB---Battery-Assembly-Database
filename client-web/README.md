# BADB Vue Frontend

`client-web/` is the Vue 3 + PrimeVue 4 + Vite SPA for assigned frontend work.
It is not the current vanilla source of truth. Current implemented web
workflow behavior lives in `public/` and the matching maintained docs.

## Source Of Truth

For Vue parity work, use this order:

1. current vanilla v1 behavior in `public/`;
2. matching docs in `docs/current/`, `docs/rules/`, and `docs/instructions/`;
3. implemented backend/API behavior;
4. `docs/instructions/frontend_parity_handoff.md` as the Vue task list.

If Vue and vanilla differ on a parity surface, treat Vue as stale unless Dalia
explicitly says otherwise. Do not add new product behavior from the Vue side
when the assignment is parity.

## Local Development

- From the repo root, `npm run dev` starts Express on `:3003` and Vite on
  `:5173`.
- From this folder, `npm run dev` starts only Vite.
- Vue API calls must use relative `/api/*` URLs through the Vite proxy in
  `vite.config.js`.
- Do not hardcode localhost API ports in Vue source.
- Build output goes to `public-vue/`; do not treat it as the vanilla source.

## Working Rules

- Keep Vue route labels and page behavior aligned with vanilla where assigned.
- Use `client-web/src/config/navigation.js` for SPA navigation labels/routes.
- Check `docs/instructions/vanilla_ui_patterns.md` before copying vanilla page
  behavior into Vue.
- Keep `public/` changes separate from Vue parity changes unless the task
  explicitly asks for both.

## Verification

Use checks sized to the change:

- `npm run test --prefix client-web`
- `npm run build --prefix client-web`
- `git diff --check`
