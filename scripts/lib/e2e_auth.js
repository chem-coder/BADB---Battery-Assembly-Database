/**
 * E2E auth helper — logs in through the normal /api/auth/login flow.
 * Credentials come from E2E_TEST_USERNAME and E2E_TEST_PASSWORD only.
 */
const fs = require('fs');
const path = require('path');
const { ROOT, loadE2eEnv } = require('./load_e2e_env');

const SESSION_FILE = path.join(ROOT, '.e2e-session.json');

function getE2eBaseUrl() {
  return (process.env.E2E_BASE_URL || 'http://localhost:3003').replace(/\/$/, '');
}

function getE2eCredentials() {
  loadE2eEnv({ required: ['E2E_TEST_USERNAME', 'E2E_TEST_PASSWORD'] });
  return {
    login: process.env.E2E_TEST_USERNAME,
    password: process.env.E2E_TEST_PASSWORD
  };
}

async function e2eLogin(baseUrl = getE2eBaseUrl()) {
  const { login, password } = getE2eCredentials();

  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`E2E login failed: HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`);
  }

  const data = await res.json();
  if (!data?.token) {
    throw new Error('E2E login response missing token');
  }

  return {
    baseUrl,
    token: data.token,
    user: data.user || null
  };
}

async function e2eMe(session) {
  const res = await fetch(`${session.baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${session.token}` }
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`E2E /api/auth/me failed: HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`);
  }

  return res.json();
}

function authHeaders(session) {
  return {
    Authorization: `Bearer ${session.token}`,
    'Content-Type': 'application/json'
  };
}

async function e2eFetch(session, endpoint, options = {}) {
  const headers = {
    ...authHeaders(session),
    ...(options.headers || {})
  };

  const res = await fetch(`${session.baseUrl}${endpoint}`, {
    ...options,
    headers
  });

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { res, body, text };
}

function saveE2eSession(session) {
  const payload = {
    baseUrl: session.baseUrl,
    token: session.token,
    user: session.user,
    savedAt: new Date().toISOString()
  };
  fs.writeFileSync(SESSION_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return SESSION_FILE;
}

function loadE2eSession() {
  if (!fs.existsSync(SESSION_FILE)) return null;
  return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
}

module.exports = {
  SESSION_FILE,
  getE2eBaseUrl,
  getE2eCredentials,
  e2eLogin,
  e2eMe,
  authHeaders,
  e2eFetch,
  saveE2eSession,
  loadE2eSession
};
