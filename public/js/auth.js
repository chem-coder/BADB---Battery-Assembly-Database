// Shared vanilla auth layer: keeps login/current-user behavior consistent across legacy pages.
(function () {
  const TOKEN_KEY = 'badb_auth_token';
  const PUBLIC_AUTH_PATHS = new Set([
    '/api/auth/login',
    '/api/auth/change-password-public'
  ]);

  const rawFetch = window.fetch.bind(window);
  let currentUser = null;
  let bypassMode = false;
  let authReady = null;
  let resolveAuthReady = null;
  let authUi = null;
  let userSelectSyncScheduled = false;
  let pageLogoutGuard = null;

  function resetAuthGate() {
    authReady = new Promise((resolve) => {
      resolveAuthReady = resolve;
    });
  }

  function clearBrowserSessionStorage() {
    try {
      localStorage.clear();
    } catch {}
    try {
      sessionStorage.clear();
    } catch {}
  }

  function getToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
    try {
      return sessionStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  }

  function setToken(token) {
    if (!token) {
      clearBrowserSessionStorage();
      return;
    }

    try {
      localStorage.clear();
    } catch {}
    try {
      sessionStorage.clear();
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {}
  }

  function openAuthenticatedWindow(url, target = '_blank') {
    const token = getToken();
    let nextUrl = url;

    try {
      nextUrl = new URL(url, window.location.origin).href;
    } catch {}

    const opened = window.open('about:blank', target);
    if (!opened) {
      window.location.href = nextUrl;
      return null;
    }

    try {
      opened.localStorage.clear();
    } catch {}
    try {
      opened.sessionStorage.clear();
      if (token) opened.sessionStorage.setItem(TOKEN_KEY, token);
    } catch {}
    try {
      opened.opener = null;
    } catch {}
    try {
      opened.location.replace(nextUrl);
    } catch {
      opened.location.href = nextUrl;
    }
    try {
      opened.focus();
    } catch {}

    return opened;
  }

  function normalizeUser(user) {
    if (!user) return null;
    return {
      userId: user.userId ?? user.user_id,
      name: user.name || user.login || '',
      login: user.login || '',
      role: user.role || ''
    };
  }

  function requestPath(resource) {
    const value = resource instanceof Request ? resource.url : String(resource);
    try {
      return new URL(value, window.location.origin).pathname;
    } catch {
      return '';
    }
  }

  function isProtectedApiRequest(resource) {
    const value = resource instanceof Request ? resource.url : String(resource);
    let url;
    try {
      url = new URL(value, window.location.origin);
    } catch {
      return false;
    }

    return url.origin === window.location.origin
      && url.pathname.startsWith('/api/')
      && !PUBLIC_AUTH_PATHS.has(url.pathname);
  }

  function withAuthHeader(resource, options) {
    const token = getToken();
    const baseHeaders = options?.headers || (resource instanceof Request ? resource.headers : undefined);
    const headers = new Headers(baseHeaders || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);

    if (resource instanceof Request) {
      return [new Request(resource, { ...(options || {}), headers }), undefined];
    }

    return [resource, { ...(options || {}), headers }];
  }

  function ensureAuthUi() {
    if (authUi) return authUi;

    const badge = document.createElement('div');
    badge.id = 'badb-auth-badge';
    badge.setAttribute('aria-live', 'polite');
    badge.innerHTML = `
      <span id="badb-auth-user">Пользователь: —</span>
      <button type="button" id="badb-auth-logout" title="Выйти из аккаунта">Выйти из аккаунта</button>
    `;

    const overlay = document.createElement('div');
    overlay.id = 'badb-auth-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <form id="badb-auth-form" autocomplete="on">
        <h2>Вход</h2>
        <label>
          Логин
          <input id="badb-auth-login" name="login" autocomplete="username" required>
        </label>
        <label>
          Пароль
          <input id="badb-auth-password" name="password" type="password" autocomplete="current-password" required>
        </label>
        <button type="submit" title="Войти">Войти</button>
        <div id="badb-auth-error" role="alert"></div>
      </form>
    `;

    const pageHeader = document.querySelector('header.page-header');
    if (pageHeader) {
      badge.classList.add('badb-auth-badge-in-header');
      pageHeader.appendChild(badge);
    } else {
      document.body.appendChild(badge);
    }
    document.body.appendChild(overlay);

    authUi = {
      badge,
      user: badge.querySelector('#badb-auth-user'),
      logout: badge.querySelector('#badb-auth-logout'),
      overlay,
      form: overlay.querySelector('#badb-auth-form'),
      login: overlay.querySelector('#badb-auth-login'),
      password: overlay.querySelector('#badb-auth-password'),
      error: overlay.querySelector('#badb-auth-error')
    };

    authUi.form.addEventListener('submit', handleLoginSubmit);
    authUi.logout.addEventListener('click', handleLogout);
    return authUi;
  }

  function renderAuthUi() {
    const ui = ensureAuthUi();
    const label = getCurrentUserLabel() || '—';

    ui.user.textContent = `Пользователь: ${label}`;
    ui.logout.hidden = bypassMode || !currentUser;
    scheduleCurrentUserButtonSync();
  }

  function getCurrentUserLabel() {
    if (!currentUser) return '';
    return currentUser.name || currentUser.login || `#${currentUser.userId}`;
  }

  function getAuditUserPlaceholder() {
    return getCurrentUserLabel() || '— автоматически —';
  }

  function showLogin(message = '') {
    const ui = ensureAuthUi();
    ui.overlay.hidden = false;
    ui.error.textContent = message;
    setTimeout(() => ui.login.focus(), 0);
  }

  function hideLogin() {
    const ui = ensureAuthUi();
    ui.overlay.hidden = true;
    ui.error.textContent = '';
    ui.password.value = '';
  }

  function registerLogoutGuard(guard) {
    pageLogoutGuard = guard && typeof guard === 'object' ? guard : null;
    return () => {
      if (pageLogoutGuard === guard) pageLogoutGuard = null;
    };
  }

  function getLogoutGuard() {
    return pageLogoutGuard || window.BADB_PAGE_LOGOUT_GUARD || null;
  }

  function confirmPageLogout() {
    const guard = getLogoutGuard();
    if (!guard) return true;

    try {
      if (typeof guard.confirmLogout === 'function') {
        return guard.confirmLogout() !== false;
      }

      if (typeof guard.hasUnsavedChanges === 'function' && guard.hasUnsavedChanges()) {
        return window.confirm(guard.message || 'Есть несохранённые изменения. Выйти без сохранения?');
      }
    } catch (err) {
      console.error(err);
      return window.confirm('Не удалось проверить несохранённые изменения. Выйти?');
    }

    return true;
  }

  function discardPageChangesForLogout() {
    const guard = getLogoutGuard();

    try {
      guard?.discardUnsavedChanges?.();
    } catch (err) {
      console.error(err);
    }

    window.dispatchEvent(new CustomEvent('badb:logout-confirmed'));
  }

  function notifyLogin() {
    window.dispatchEvent(new CustomEvent('badb:login', {
      detail: { user: currentUser }
    }));
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    const ui = ensureAuthUi();
    ui.error.textContent = '';

    try {
      const res = await rawFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: ui.login.value.trim(),
          password: ui.password.value
        })
      });

      if (!res.ok) {
        ui.error.textContent = 'Неверный логин или пароль';
        return;
      }

      const data = await res.json();
      setToken(data.token);
      currentUser = normalizeUser(data.user);
      bypassMode = false;
      hideLogin();
      renderAuthUi();
      resolveAuthReady?.(currentUser);
      notifyLogin();
    } catch {
      ui.error.textContent = 'Не удалось выполнить вход';
    }
  }

  function handleLogout() {
    if (!confirmPageLogout()) return;

    discardPageChangesForLogout();
    setToken('');
    currentUser = null;
    bypassMode = false;
    resetAuthGate();
    window.location.reload();
  }

  async function loadSession() {
    ensureAuthUi();
    const token = getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const res = await rawFetch('/api/auth/me', { headers });
      if (!res.ok) {
        setToken('');
        currentUser = null;
        bypassMode = false;
        renderAuthUi();
        showLogin();
        return;
      }

      currentUser = normalizeUser(await res.json());
      bypassMode = !token;
      hideLogin();
      renderAuthUi();
      resolveAuthReady?.(currentUser);
    } catch {
      showLogin('Не удалось проверить сессию');
    }
  }

  async function badbAuthFetch(resource, options) {
    if (!isProtectedApiRequest(resource)) {
      return rawFetch(resource, options);
    }

    await authReady;
    const [nextResource, nextOptions] = withAuthHeader(resource, options);
    const res = await rawFetch(nextResource, nextOptions);

    if (res.status === 401 || res.status === 403) {
      setToken('');
      currentUser = null;
      bypassMode = false;
      resetAuthGate();
      renderAuthUi();
      showLogin(res.status === 403 ? 'Недостаточно прав' : 'Сессия истекла');
    }

    return res;
  }

  function isEditableUserSelect(select) {
    if (!(select instanceof HTMLSelectElement) || select.multiple) return false;

    const id = (select.id || '').toLowerCase();
    const name = (select.name || '').toLowerCase();
    const label = select.labels?.[0]?.textContent?.toLowerCase() || '';
    const marker = `${id} ${name} ${label}`;

    if (select.disabled) {
      return Boolean(select.dataset.currentUserEnhanced);
    }

    return marker.includes('operator')
      || marker.includes('performed_by')
      || marker.includes('lead_id')
      || marker.includes('пользователь')
      || marker.includes('оператор')
      || marker.includes('руководитель');
  }

  function ensureCurrentUserOption(select) {
    if (!currentUser?.userId) return false;
    const value = String(currentUser.userId);
    const exists = Array.from(select.options).some((option) => option.value === value);

    if (!exists) {
      select.add(new Option(currentUser.name || currentUser.login || `#${value}`, value));
    }

    select.value = value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function enhanceUserSelect(select) {
    if (!isEditableUserSelect(select)) return;

    let button = select.nextElementSibling;
    if (!button || !button.classList?.contains('badb-current-user-button')) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'badb-current-user-button';
      button.textContent = 'Текущий пользователь';
      button.title = 'Выбрать текущего пользователя';
      button.addEventListener('click', () => {
        if (!select.disabled) ensureCurrentUserOption(select);
      });
      select.insertAdjacentElement('afterend', button);
    }

    select.dataset.currentUserEnhanced = 'true';
    const shouldHide = select.disabled;
    const shouldDisable = select.disabled || !currentUser?.userId;

    if (button.hidden !== shouldHide) button.hidden = shouldHide;
    if (button.disabled !== shouldDisable) button.disabled = shouldDisable;
  }

  function syncCurrentUserButtons() {
    userSelectSyncScheduled = false;
    document.querySelectorAll('select').forEach(enhanceUserSelect);
  }

  function scheduleCurrentUserButtonSync() {
    if (userSelectSyncScheduled) return;
    userSelectSyncScheduled = true;
    window.requestAnimationFrame(syncCurrentUserButtons);
  }

  function observeUserSelects() {
    scheduleCurrentUserButtonSync();
    const observer = new MutationObserver(scheduleCurrentUserButtonSync);
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  resetAuthGate();
  window.fetch = badbAuthFetch;
  window.BADB_AUTH = {
    getCurrentUser: () => currentUser,
    getCurrentUserLabel,
    getAuditUserPlaceholder,
    openAuthenticatedWindow,
    registerLogoutGuard,
    isReady: () => authReady
  };

  document.addEventListener('DOMContentLoaded', () => {
    ensureAuthUi();
    observeUserSelects();
    loadSession();
  });
})();
