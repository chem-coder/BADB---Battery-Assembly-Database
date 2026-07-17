// Milling-ball suggestion for planetary centrifugal mixers (d048).
//
// Lab rule: total ball volume ~ 1/3 of the slurry volume. The coefficient is
// a lab convention, not a physical constant — keep it visible here and refine
// it later from recorded tape_step_mixing_balls data or literature.
//
// The same math is duplicated in vanilla public/js/1-tapes.js (the two
// frontends share no modules by design) — keep both copies in sync.

export const BALL_VOLUME_FRACTION_OF_SLURRY = 1 / 3;

// Agate ball diameters available in the lab, cm (confirmed by Dalia
// 2026-07-17: four sizes).
export const BALL_DIAMETERS_CM = [0.25, 0.5, 0.75, 1.0];

export function ballVolumeMl(diameterCm) {
  return (Math.PI * Math.pow(diameterCm, 3)) / 6;
}

/**
 * Suggest how many balls of each diameter to use for a given slurry volume.
 * Greedy largest-first fill toward the target volume; the smallest diameter
 * rounds (instead of flooring) to land closest to the target. Always suggests
 * at least one smallest ball for any positive slurry volume.
 *
 * @param {number} slurryVolumeMl
 * @param {object} [opts]
 * @param {number} [opts.fraction] target ball volume as a fraction of slurry volume
 * @param {number[]} [opts.diametersCm] available diameters
 * @param {number|null} [opts.maxWorkingVolumeMl] container working limit (slurry + balls)
 * @returns {null | {
 *   targetVolumeMl: number,
 *   items: Array<{diameter_cm: number, ball_count: number, volume_ml: number}>,
 *   totalBallVolumeMl: number,
 *   overfill: boolean,
 *   totalWithSlurryMl: number
 * }}
 */
export function suggestBalls(slurryVolumeMl, opts = {}) {
  const volume = Number(slurryVolumeMl);
  if (!Number.isFinite(volume) || volume <= 0) return null;

  const fraction = Number.isFinite(opts.fraction) && opts.fraction > 0
    ? opts.fraction
    : BALL_VOLUME_FRACTION_OF_SLURRY;
  const diameters = (Array.isArray(opts.diametersCm) && opts.diametersCm.length
    ? opts.diametersCm.slice()
    : BALL_DIAMETERS_CM.slice()
  ).sort((a, b) => b - a);

  const targetVolumeMl = volume * fraction;
  const items = [];
  let remaining = targetVolumeMl;

  diameters.forEach((diameterCm, index) => {
    const oneBall = ballVolumeMl(diameterCm);
    const isSmallest = index === diameters.length - 1;
    const count = isSmallest
      ? Math.round(remaining / oneBall)
      : Math.floor(remaining / oneBall);

    if (count > 0) {
      items.push({
        diameter_cm: diameterCm,
        ball_count: count,
        volume_ml: count * oneBall
      });
      remaining -= count * oneBall;
    }
  });

  if (!items.length) {
    const smallest = diameters[diameters.length - 1];
    items.push({
      diameter_cm: smallest,
      ball_count: 1,
      volume_ml: ballVolumeMl(smallest)
    });
  }

  const totalBallVolumeMl = items.reduce((sum, item) => sum + item.volume_ml, 0);
  const totalWithSlurryMl = volume + totalBallVolumeMl;
  const maxWorking = Number(opts.maxWorkingVolumeMl);
  const overfill = Number.isFinite(maxWorking) && maxWorking > 0
    ? totalWithSlurryMl > maxWorking
    : false;

  return { targetVolumeMl, items, totalBallVolumeMl, overfill, totalWithSlurryMl };
}

function formatMl(value) {
  return (Math.round(value * 10) / 10).toLocaleString('ru-RU');
}

function formatDiameter(value) {
  return value.toLocaleString('ru-RU');
}

/**
 * Human-readable one-line suggestion with the short explanation, e.g.:
 * "Рекомендация: ≈6,7 мл шаров (⅓ объёма пасты 20 мл) — 12×1,0 см + 2×0,5 см (итого ≈6,4 мл)"
 */
export function formatBallSuggestion(suggestion, slurryVolumeMl) {
  if (!suggestion) return '';

  const combo = suggestion.items
    .map((item) => `${item.ball_count}×${formatDiameter(item.diameter_cm)} см`)
    .join(' + ');

  return `Рекомендация: ≈${formatMl(suggestion.targetVolumeMl)} мл шаров ` +
    `(⅓ объёма пасты ${formatMl(Number(slurryVolumeMl))} мл) — ${combo} ` +
    `(итого ≈${formatMl(suggestion.totalBallVolumeMl)} мл)`;
}

/**
 * Overfill warning, or '' when everything fits (or no limit is known).
 */
export function formatOverfillWarning(suggestion, maxWorkingVolumeMl) {
  if (!suggestion || !suggestion.overfill) return '';

  return `Внимание: паста + шары ≈${formatMl(suggestion.totalWithSlurryMl)} мл — ` +
    `больше рабочего объёма стакана (${formatMl(Number(maxWorkingVolumeMl))} мл)`;
}
