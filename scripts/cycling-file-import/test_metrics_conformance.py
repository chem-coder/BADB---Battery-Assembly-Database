#!/usr/bin/env python3
"""
Conformance: Python-реализации метрик против golden-векторов контракта
(contracts/metrics-golden.v1.json). Прогоняет ОДИН и тот же поток точек через:

  1. scripts/parse_cycling.py :: compute_summary  — канон (серверная загрузка)
  2. import_cycler_file.py    :: our_summary      — navani-импортёр

и сверяет все 8 величин цикла с эталоном. Те же векторы проверяют клиентский
metricsEngine (vitest) — дрейф любой реализации = красный тест.

Запуск (stdlib-only, без pytest):
    python3 scripts/cycling-file-import/test_metrics_conformance.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, 'scripts'))

import parse_cycling                      # noqa: E402  (scripts/parse_cycling.py)
from import_cycler_file import our_summary  # noqa: E402

GOLDEN = json.load(open(os.path.join(ROOT, 'contracts', 'metrics-golden.v1.json')))

FIELDS = [
    'charge_capacity_ah', 'discharge_capacity_ah',
    'charge_energy_wh', 'discharge_energy_wh',
    'coulombic_efficiency', 'energy_efficiency',
    'avg_charge_voltage_v', 'avg_discharge_voltage_v',
]

failures = []


def check(impl_name, got_row, expect):
    for key in FIELDS:
        exp = expect[key]['value']
        tol = expect[key].get('tol', 1e-9)
        got = got_row.get(key)
        if got is None or abs(got - exp) > tol:
            failures.append(f'{impl_name}.{key}: got {got}, expect {exp} ±{tol}')


def main():
    stream = GOLDEN['stream_cycle_basic']
    points = stream['points']
    expect = stream['expect']

    # 1. канон: серверный парсер
    rows = parse_cycling.compute_summary(points)
    assert len(rows) == 1, f'parse_cycling: ожидался 1 цикл, получено {len(rows)}'
    check('parse_cycling.compute_summary', rows[0], expect)

    # 2. navani-импортёр (our_summary ждёт key time_s/voltage_v/current_a/...)
    summaries = our_summary(points)
    assert 1 in summaries, 'our_summary: цикл 1 не найден'
    check('import_cycler_file.our_summary', summaries[1], expect)

    # 3. скалярные guard-кейсы (CE: chg=0 → None) — против канона CE-логики
    for case in GOLDEN['scalar_cases']['coulombic_efficiency']:
        chg = case['inputs']['charge_capacity_ah']
        dch = case['inputs']['discharge_capacity_ah']
        ce = (dch / chg) * 100 if (chg is not None and chg > 0 and dch is not None) else None
        exp = case['expect']
        if exp is None:
            if ce is not None:
                failures.append(f'scalar ce guard: got {ce}, expect None ({case})')
        elif ce is None or abs(ce - exp) > case.get('tol', 1e-9):
            failures.append(f'scalar ce: got {ce}, expect {exp}')

    if failures:
        print('CONFORMANCE FAIL:')
        for f in failures:
            print('  ✗', f)
        sys.exit(1)
    print(f'CONFORMANCE OK: parse_cycling + import_cycler_file соответствуют '
          f'контракту v{GOLDEN["version"]} ({len(FIELDS)} величин × 2 реализации + guards)')


if __name__ == '__main__':
    main()
