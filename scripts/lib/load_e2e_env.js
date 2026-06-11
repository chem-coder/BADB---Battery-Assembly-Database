/**
 * Load optional E2E variables from .env.local (repo root) without adding a dependency.
 * Never logs credential values.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ENV_LOCAL = path.join(ROOT, '.env.local');

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const eq = trimmed.indexOf('=');
  if (eq <= 0) return null;

  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function loadE2eEnv({ required = [] } = {}) {
  if (fs.existsSync(ENV_LOCAL)) {
    const text = fs.readFileSync(ENV_LOCAL, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      if (process.env[parsed.key] === undefined) {
        process.env[parsed.key] = parsed.value;
      }
    }
  }

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(
      `Missing required E2E env var(s): ${missing.join(', ')}. `
      + 'Set them in .env.local (not committed) or export them in the shell.'
    );
  }

  return process.env;
}

module.exports = {
  ROOT,
  ENV_LOCAL,
  loadE2eEnv
};
