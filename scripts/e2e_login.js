#!/usr/bin/env node

/**
 * Log in as the E2E test user through the normal app auth flow and persist the
 * session token for follow-up API/browser tests.
 *
 * Requires (in .env.local or shell):
 *   E2E_TEST_USERNAME
 *   E2E_TEST_PASSWORD
 *
 * Optional:
 *   E2E_BASE_URL  (default http://localhost:3003)
 *
 * Writes gitignored .e2e-session.json with { baseUrl, token, user, savedAt }.
 * Never prints credentials or the token.
 */

const {
  e2eLogin,
  e2eMe,
  saveE2eSession,
  SESSION_FILE
} = require('./lib/e2e_auth');

async function main() {
  const session = await e2eLogin();
  const me = await e2eMe(session);
  saveE2eSession({ ...session, user: me });

  const label = me.name || me.login || `user #${me.userId}`;
  console.log(`[e2e] Login OK as ${label}`);
  console.log(`[e2e] Session saved to ${SESSION_FILE}`);
  console.log('[e2e] Use npm run e2e:tape-duplicate or browser tools with this session.');
}

main().catch((err) => {
  console.error(`[e2e] ${err.message}`);
  process.exit(1);
});
