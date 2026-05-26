/**
 * authenticatedWindow — open a same-origin page in a new window with the
 * current auth token shared via sessionStorage.
 *
 * Use this instead of `window.open(url, '_blank', 'noopener')` for any URL
 * that loads vanilla v1 pages (e.g. print reports under `/workflow/*`).
 *
 * Why
 * ---
 * Daly's vanilla auth.js (May 2026, commit 2473339 "Share auth session with
 * print windows") moved token storage from localStorage to sessionStorage
 * and added `BADB_AUTH.openAuthenticatedWindow` for cross-tab session
 * sharing. The vanilla helper exists only inside vanilla pages (loaded via
 * `<script src="/js/auth.js">`); Vue does not load it. This is the
 * Vue-side equivalent.
 *
 * Storage contract: see `client-web/src/constants/auth.js` (`TOKEN_KEY`),
 * which mirrors vanilla `public/js/auth.js`.
 *
 * Flow
 * ----
 *   1. Read current token from Vue's sessionStorage.
 *   2. Open `about:blank` with the same origin as the opener — this gives
 *      us same-origin access to the new window's storage.
 *   3. Copy the token into the new window's sessionStorage under the same
 *      key.
 *   4. Detach the opener (`opened.opener = null`) — standard security
 *      hygiene.
 *   5. Navigate the new window to the target URL via `location.replace`.
 *
 * If the popup is blocked, fall back to in-place navigation via the
 * injected `navigateInPlace` callable. The token is already in this
 * window's sessionStorage, so the destination page will authenticate
 * normally.
 *
 * Same-origin only
 * ----------------
 * The destination URL must be same-origin as the opener (Vite serves Vue
 * at :5173 and proxies `/workflow/*` to Express at :3003; in prod, Express
 * serves both Vue and vanilla from the same origin). For cross-origin URLs,
 * the new window's sessionStorage will not survive the navigation.
 */
import { TOKEN_KEY } from '@/constants/auth'

/**
 * Default in-place navigation. Replaced by tests to verify the fallback
 * path without depending on jsdom's non-reconfigurable `window.location`.
 */
const defaultNavigateInPlace = (url) => {
  window.location.href = url
}

/**
 * Open `url` in a new window/tab with the current auth token injected into
 * its sessionStorage. Returns the opened window reference, or `null` if
 * the popup was blocked and the helper fell back to in-place navigation.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {string} [options.target]               window target (default `_blank`)
 * @param {(url: string) => void} [options.navigateInPlace] override for tests
 * @returns {Window | null}
 */
export function openAuthenticatedWindow(url, options = {}) {
  if (!url) {
    throw new Error('openAuthenticatedWindow: url is required')
  }

  const target = options.target || '_blank'
  const navigateInPlace = options.navigateInPlace || defaultNavigateInPlace

  let token = ''
  try {
    token = sessionStorage.getItem(TOKEN_KEY) || ''
  } catch {
    // sessionStorage may be unavailable in some embedded contexts; proceed
    // without injection — destination will redirect to /login if needed.
  }

  let resolvedUrl = url
  try {
    resolvedUrl = new URL(url, window.location.origin).href
  } catch {
    // url already absolute or pathological; pass through unchanged
  }

  // Synchronous window.open in click handler — popup-blocker compatible.
  const opened = window.open('about:blank', target)
  if (!opened) {
    // Popup blocked → fall back to navigating the current window. The
    // current sessionStorage already has the token, so the destination
    // page will pick it up via vanilla auth.js getToken().
    navigateInPlace(resolvedUrl)
    return null
  }

  try {
    if (token) {
      opened.sessionStorage.setItem(TOKEN_KEY, token)
    }
  } catch {
    // Different origin already, or storage quota — ignore; destination
    // will bounce to /login if the token can't be read.
  }

  try {
    opened.opener = null
  } catch {}

  try {
    opened.location.replace(resolvedUrl)
  } catch {
    opened.location.href = resolvedUrl
  }

  try {
    opened.focus()
  } catch {}

  return opened
}
