// @vitest-environment node
/**
 * Live-интеграция «Перепроверить»: реальные точки из dev-БД через API →
 * computeStreamSummary → сравнение с хранимым cycling_cycle_summary.
 * Требует поднятый dev-сервер (3003) — поэтому запускается ТОЛЬКО явно:
 *     LIVE=1 npx vitest run __tests__/integration/liveProvenance.test.js
 * В обычном прогоне (CI) — скипается.
 */
import { describe, it, expect } from 'vitest'
import { computeStreamSummary } from '@/utils/metricsEngine'

const LIVE = !!process.env.LIVE
const H = { Authorization: 'Bearer bypass' }
const BASE = 'http://localhost:3003'

describe.skipIf(!LIVE)('live: пересчёт против реальной БД (session 1, cycle 2)', () => {
  it('ёмкости/CE/V̄ сходятся с хранимым summary; отсутствие energy_wh → null', async () => {
    // ТОТ ЖЕ эндпоинт, что у cycleDataMap фронта (полные точки, без прореживания)
    const points = await (await fetch(`${BASE}/api/cycling/sessions/1/cycles/2`, { headers: H })).json()
    expect(points.length).toBeGreaterThan(100)
    expect(points.some(p => p.step_number != null)).toBe(true)

    const cyclesResp = await (await fetch(`${BASE}/api/cycling/sessions/1/summary`, { headers: H })).json()
    const rows = Array.isArray(cyclesResp) ? cyclesResp : (cyclesResp.cycles || cyclesResp.summary || [])
    const stored = rows.find(r => r.cycle_number === 2)
    expect(stored, 'хранимый summary цикла 2').toBeTruthy()

    const re = computeStreamSummary(points)
    const tol = (r) => Math.max(0.011, 0.005 * Math.abs(r))
    for (const k of ['charge_capacity_ah', 'discharge_capacity_ah', 'coulombic_efficiency',
                     'avg_charge_voltage_v', 'avg_discharge_voltage_v']) {
      const r = re[k]; const s = stored[k] == null ? null : Number(stored[k])
      if (s == null) continue
      expect(r, `${k}: пересчёт дал null при хранимом ${s}`).not.toBeNull()
      expect(Math.abs(r - s), `${k}: пересчёт=${r} БД=${s}`).toBeLessThanOrEqual(tol(r))
    }
    // у ранних загрузок (sessions 1–2) energy_wh в точках отсутствует —
    // движок обязан вернуть null (поповер покажет «нет данных», не ложное ✗)
    if (!points.some(p => p.energy_wh != null)) {
      expect(re.charge_energy_wh).toBeNull()
    }
  })
})
