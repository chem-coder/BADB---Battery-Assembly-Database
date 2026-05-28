import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub PrimeVue Toast service before importing the composable.
const toastAdd = vi.fn();
vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: toastAdd }),
}));

// Stub the project's axios-aware error classifier so we can verify it
// is preferred over raw err.message when an Error object is passed.
vi.mock('@/utils/errorClassifier', () => ({
  errorMessageRu: (err) => err?.classified || err?.message || 'classified',
}));

import { useNotify } from '@/composables/useNotify';

beforeEach(() => {
  toastAdd.mockReset();
});

describe('useNotify', () => {
  it('success() fires a success toast with default lifetime', () => {
    useNotify().success('Сохранено');
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'success',
      summary: 'Сохранено',
      life: 3000,
    }));
  });

  it('error() with a string detail passes detail through verbatim', () => {
    useNotify().error('Ошибка', 'Сервер недоступен');
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'error',
      summary: 'Ошибка',
      detail: 'Сервер недоступен',
      life: 7000,
    }));
  });

  it('error() with an Error object routes through errorMessageRu', () => {
    const err = { classified: 'Сервер вернул 409' };
    useNotify().error('Ошибка сохранения', err);
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      detail: 'Сервер вернул 409',
    }));
  });

  it('warn() uses warn severity and longer lifetime', () => {
    useNotify().warn('Внимание', 'Долгая загрузка');
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'warn',
      life: 5000,
    }));
  });

  it('info() uses info severity', () => {
    useNotify().info('Подсказка');
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'info',
    }));
  });

  it('options.inline routes to the setStatus callback as well', () => {
    const setStatus = vi.fn();
    useNotify().error('Ошибка', 'детали', { inline: setStatus });
    expect(setStatus).toHaveBeenCalledWith('Ошибка: детали', 'error');
    expect(toastAdd).toHaveBeenCalled(); // toast still fires by default
  });

  it('options.inlineOnly skips the toast', () => {
    const setStatus = vi.fn();
    useNotify().success('Сохранено', null, { inline: setStatus, inlineOnly: true });
    expect(setStatus).toHaveBeenCalledWith('Сохранено', 'ok');
    expect(toastAdd).not.toHaveBeenCalled();
  });

  it('custom life overrides the default', () => {
    useNotify().success('Сохранено', null, { life: 10000 });
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ life: 10000 }));
  });
});
