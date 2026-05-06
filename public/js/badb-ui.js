(function () {
  const statusTimers = new WeakMap();

  function resolveElement(target) {
    if (!target) return null;
    if (typeof target === 'string') return document.querySelector(target);
    return target;
  }

  function setDirtyFlag(target, isDirty, text = 'Не сохранено') {
    const el = resolveElement(target);
    if (!el) return;

    el.textContent = text;
    el.classList.toggle('visible', Boolean(isDirty));
  }

  function setStickyHeader({
    header,
    titleEl,
    metaEl,
    dirtyEl,
    title,
    meta,
    isDirty = false,
    hidden = false
  }) {
    const headerNode = resolveElement(header);
    if (!headerNode) return;

    headerNode.hidden = Boolean(hidden);

    const titleNode = resolveElement(titleEl);
    if (titleNode) {
      titleNode.textContent = title || 'Новая запись';
    }

    const metaNode = resolveElement(metaEl);
    if (metaNode) {
      metaNode.textContent = meta || '—';
    }

    setDirtyFlag(dirtyEl, isDirty);
  }

  function createIconButton({
    icon,
    title,
    ariaLabel,
    className = '',
    onClick,
    hidden = false,
    disabled = false
  }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = icon || '';
    button.title = title || ariaLabel || '';
    button.hidden = Boolean(hidden);
    button.disabled = Boolean(disabled);

    if (className) {
      button.className = className;
    }

    if (ariaLabel || title) {
      button.setAttribute('aria-label', ariaLabel || title);
    }

    if (typeof onClick === 'function') {
      button.addEventListener('click', onClick);
    }

    return button;
  }

  function appendChildren(parent, children) {
    children.forEach((child) => {
      if (child === null || child === undefined || child === '') return;
      if (child instanceof Node) {
        parent.appendChild(child);
      } else {
        parent.append(String(child));
      }
    });
  }

  function createRecordOpenButton({
    ariaLabel,
    className = '',
    children = [],
    text,
    onClick
  }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = ['record-open-button', className].filter(Boolean).join(' ');

    if (ariaLabel) {
      button.setAttribute('aria-label', ariaLabel);
    }

    if (text !== undefined) {
      button.textContent = text;
    } else {
      appendChildren(button, children);
    }

    if (typeof onClick === 'function') {
      button.addEventListener('click', onClick);
    }

    return button;
  }

  function showStatus(target, message, options = {}) {
    const el = resolveElement(target);
    if (!el) return;

    const {
      isError = false,
      state,
      clearAfterMs = 4500
    } = options;

    const previousTimer = statusTimers.get(el);
    if (previousTimer) {
      clearTimeout(previousTimer);
      statusTimers.delete(el);
    }

    el.textContent = message || '';
    el.classList.remove('is-error', 'is-success', 'is-saved', 'is-saving');

    if (message) {
      if (state) {
        el.classList.add(state);
      } else {
        el.classList.add(isError ? 'is-error' : 'is-success');
      }
    }

    if (message && clearAfterMs > 0) {
      const timer = setTimeout(() => {
        el.textContent = '';
        el.classList.remove('is-error', 'is-success', 'is-saved', 'is-saving');
        statusTimers.delete(el);
      }, clearAfterMs);

      statusTimers.set(el, timer);
    }
  }

  function scrollToElement(target, options = {}) {
    const el = resolveElement(target);
    if (!el) return;

    const {
      block = 'start',
      behavior = 'smooth'
    } = options;

    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior, block });
    });
  }

  window.BADB_UI = {
    createIconButton,
    createRecordOpenButton,
    setDirtyFlag,
    setStickyHeader,
    showStatus,
    scrollToElement
  };
})();
