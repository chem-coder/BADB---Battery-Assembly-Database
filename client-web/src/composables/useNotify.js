/**
 * useNotify — unified notification API for the project.
 *
 * Replaces the three pre-existing patterns (window.alert, useToast.add,
 * and the ad-hoc setStatus refs scattered across pages) with one call
 * shape. All four methods accept the same arguments so callers don't
 * have to remember per-channel quirks.
 *
 * Design tokens (src/pages/DesignSystemPage.vue) the consumers honour:
 *   - badge-3 (хвойный)  → success
 *   - badge-8 (red)      → error
 *   - badge-2 (охра)     → warn
 *   - badge-5 (blue)     → info
 *   - Rosatom font on toast title
 *
 * Usage:
 *   const notify = useNotify()
 *   notify.success('Сохранено')
 *   notify.error('Ошибка сохранения', err)   // axios error → server message
 *   notify.warn('Внимание', 'Загрузка идёт долго')
 *   notify.info('Подсказка', 'Нажмите Enter для добавления')
 *
 * To route a notification through an opened-record header instead of (or
 * in addition to) the toast tray, pass `{ inline }`:
 *   notify.error('Ошибка сохранения', err, { inline: setStatus })
 *
 * The composable does not own any state itself — it forwards to PrimeVue's
 * Toast service. Inline status remains owned by useRowOpenForm.
 */
import { useToast } from 'primevue/usetoast';
import { errorMessageRu } from '@/utils/errorClassifier';

const DEFAULT_LIFE = {
  success: 3000,
  info: 3000,
  warn: 5000,
  error: 7000,
};

const ICONS = {
  success: 'pi-check-circle',
  error: 'pi-times-circle',
  warn: 'pi-exclamation-triangle',
  info: 'pi-info-circle',
};

function resolveErrorMessage(err) {
  if (!err) return null;
  if (typeof err === 'string') return err;
  // Re-use the project's axios-aware classifier when present.
  try {
    return errorMessageRu(err);
  } catch {
    return err?.response?.data?.error || err?.message || String(err);
  }
}

export function useNotify() {
  const toast = useToast();

  function show(severity, summary, detailOrError, options = {}) {
    const detail =
      severity === 'error' && detailOrError && typeof detailOrError !== 'string'
        ? resolveErrorMessage(detailOrError)
        : detailOrError || null;

    if (options.inline && typeof options.inline === 'function') {
      // Route to the inline-status setter from useRowOpenForm.
      const tone =
        severity === 'error' ? 'error' :
        severity === 'success' ? 'ok' : 'info';
      const inlineMsg = detail ? `${summary}: ${detail}` : summary;
      options.inline(inlineMsg, tone);
      if (options.inlineOnly) return;
    }

    toast.add({
      severity,
      summary,
      detail,
      life: options.life ?? DEFAULT_LIFE[severity] ?? 4000,
      // Pass through the brand icon hint via group so PT can pick it up.
      group: ICONS[severity],
    });
  }

  return {
    success(summary, detail, options) { show('success', summary, detail, options); },
    error(summary, errOrDetail, options) { show('error', summary, errOrDetail, options); },
    warn(summary, detail, options) { show('warn', summary, detail, options); },
    info(summary, detail, options) { show('info', summary, detail, options); },
  };
}
