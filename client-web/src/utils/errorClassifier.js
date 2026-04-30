// ─── Error classification for API calls via axios ────────────────────
// Two concerns, kept separate:
//   classifyAxiosError — maps an axios rejection to a small enum based
//     on the HTTP response + transport errors. Pure; no ui strings.
//   errorMessageRu — maps that enum (plus the orthogonal 'empty' state
//     produced by useBackendCache.isEmpty) to a user-facing Russian
//     message. Context-aware so 'empty' can say "Нет файлов" in one
//     place and "Нет данных для расчёта" in another with the same code.

/**
 * Map an axios error to one of:
 *   - 'auth'    — 401 / 403 (not logged in or no permission)
 *   - 'missing' — 404 (entity not found)
 *   - 'server'  — 500+ (backend broke)
 *   - 'network' — no response (offline, timeout, CORS, DNS)
 *
 * Notes:
 * - 'empty' is NOT returned here. That's a separate verdict from
 *   useBackendCache when a 2xx response was received but isEmpty()
 *   returned true.
 * - ECONNABORTED (axios timeout) explicitly collapses to 'network'.
 */
export function classifyAxiosError(err) {
  if (err?.code === 'ECONNABORTED') return 'network'
  const status = err?.response?.status
  if (status === 401 || status === 403) return 'auth'
  if (status === 404) return 'missing'
  if (Number.isFinite(status) && status >= 500) return 'server'
  return 'network'
}

// Non-contextual messages — apply regardless of what the user was doing.
const MESSAGES = {
  auth:    'Требуется вход — авторизуйтесь заново.',
  missing: 'Не найдено.',
  server:  'Ошибка сервера. Попробуйте позже.',
  network: 'Нет подключения. Проверьте сеть.',
}

// "Empty" messages are contextual — the same code means different
// things depending on what the user is looking at. Extend this map as
// more pages migrate and need their own wording. 'default' is the
// catch-all.
const EMPTY_MESSAGES = {
  capacity: 'Нет данных для расчёта — заполните массы в рецептах лент и удельную ёмкость в карточке материала.',
  report:   'Нет данных для отчёта.',
  files:    'Файлы не прикреплены.',
  default:  'Данных пока нет.',
}

/**
 * Translate an error code to a user-facing Russian message.
 *
 * @param {'auth'|'missing'|'server'|'network'|'empty'|null|undefined} code
 * @param {string} [context] — domain keyword for 'empty' code disambiguation
 *                            (e.g. 'capacity', 'report', 'files')
 * @returns {string} — empty string if code is null/undefined (no error)
 */
export function errorMessageRu(code, context) {
  if (!code) return ''
  if (code === 'empty') return EMPTY_MESSAGES[context] || EMPTY_MESSAGES.default
  return MESSAGES[code] || 'Произошла ошибка.'
}

/**
 * Canonical toast-on-API-error helper. Wraps the common pattern:
 *
 *   catch (err) {
 *     toast.add({ severity: 'error', summary: 'Ошибка',
 *       detail: err.response?.data?.error || 'fallback', life: 3000 })
 *   }
 *
 * into a single call that:
 * 1. Shows the backend-provided error message when present (most specific),
 * 2. Falls back to the classifier's Russian message (auth / network /
 *    server / missing — actionable),
 * 3. Uses the caller-supplied summary as the action context so the user
 *    sees WHAT failed, not just a bare «Ошибка».
 *
 * Prefer this over hand-rolled toast.add for any axios error. See
 * CLAUDE.md "Vue frontend conventions → Error surfacing" for rationale.
 *
 * @param {object} toast — the useToast() instance from PrimeVue
 * @param {any} err — the caught exception (axios error or other)
 * @param {string} summary — action context shown as toast title,
 *                           e.g. "Не удалось загрузить ленты"
 * @param {object} [opts]
 * @param {number} [opts.life=3500] — auto-dismiss after ms
 */
export function toastApiError(toast, err, summary = 'Ошибка', opts = {}) {
  const life = Number.isFinite(opts.life) ? opts.life : 3500
  const detail = err?.response?.data?.error
              || errorMessageRu(classifyAxiosError(err))
  toast.add({ severity: 'error', summary, detail, life })
}
