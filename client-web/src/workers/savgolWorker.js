/**
 * savgolWorker — SavGol-конвейер dQ/dV / dV/dQ вне главного потока.
 *
 * Главный поток шлёт { id, kind: 'dqdv'|'dvdq', pairs: [{v,q}], preset },
 * воркер возвращает { id, curve: [{x,y}] }. Пул воркеров (savgolAsync.js)
 * раскидывает кривые по ядрам — «параллельные вычисления» вместо
 * последовательных, и UI не блокируется даже на первом расчёте сотен кривых.
 *
 * Vite собирает это как module-worker (import внутри воркера поддержан).
 */
import { dqdvSavGol, dvdqSavGol } from '../utils/savitzkyGolay.js'

self.onmessage = (e) => {
  const { id, kind, pairs, preset } = e.data
  let curve
  if (kind === 'dvdq') {
    // отображение DVA: x в мА·ч, y в В/мА·ч (util работает в Ah)
    curve = dvdqSavGol(pairs, { preset }).map(p => ({ x: p.x * 1000, y: p.y / 1000 }))
  } else {
    curve = dqdvSavGol(pairs, { preset })
  }
  self.postMessage({ id, curve })
}
