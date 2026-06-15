/**
 * Auth constants — single source of truth for the auth-related storage key.
 *
 * The Vue auth store, the ProfilePage password-change flow, and the
 * authenticatedWindow utility all need to read/write the same key the
 * vanilla v1 layer reads (`public/js/auth.js` line 3:
 *   `const TOKEN_KEY = 'badb_auth_token';`
 * ).
 *
 * Keep this in sync with vanilla. If it ever changes, update both sides
 * in the same release.
 */
export const TOKEN_KEY = 'badb_auth_token'
