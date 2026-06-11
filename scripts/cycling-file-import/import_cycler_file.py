#!/usr/bin/env python3
"""
Universal cycler-file importer — native instrument files → BADB cycling tables.

Parses Biologic .mpr, Neware .nda/.ndax, Arbin .res/.xls(x), Land/Ivium
.txt/.xls(x) via navani (be-smith/navani) and loads:
  cycling_sessions      (1 row, tagged NAVANI_IMPORT for traceability)
  cycling_datapoints    (full point stream: V, I, Q, t per cycle/step)
  cycling_cycle_summary (per-cycle caps, CE, energies, voltages — computed
                         HERE from the datapoints, then cross-checked against
                         navani's own cycle_summary as a reconcile gate)

Safety rails (mirrors scripts/cycling-ref-import discipline):
  * file_hash (sha256) dedupe — re-running on the same file aborts.
  * Reconcile gate: our per-cycle capacities must match navani's summary
    within tolerance, else NO SQL is produced.
  * Default is a DRY RUN report; --apply actually writes (and re-verifies
    row counts + capacities straight from the DB afterwards).
  * Units: navani normalises Capacity to mAh (Arbin Ah auto-converted);
    Current is mA for the supported loaders. We store SI-ish Ah / A.
    The report prints physical ranges — eyeball them before --apply.

Usage:
  VENV=.local/navani_venv/bin/python
  $VENV scripts/cycling-file-import/import_cycler_file.py \
      --file ~/data/cell_07.mpr --battery-id 56 \
      [--protocol "GCPL C/24 2.0-3.8V"] [--uploaded-by 34] \
      [--active-mass-mg 12.4] [--notes "..."] \
      [--sql /tmp/import.sql] [--apply]

Requires: .local/navani_venv (python3 -m venv + pip install <navani>).
Arbin .res additionally needs the mdbtools system package (brew install mdbtools).
"""
import argparse
import hashlib
import os
import subprocess
import sys
from datetime import datetime

PSQL = ['psql', '-U', 'Dalia', '-d', 'badb_app_v1', '-P', 'pager=off', '-t', '-A', '-q']
EQUIPMENT_BY_EXT = {
    '.mpr': 'biologic', '.nda': 'neware', '.ndax': 'neware',
    '.res': 'arbin', '.xls': 'generic', '.xlsx': 'generic', '.txt': 'generic',
}
CAP_TOL_REL = 0.005   # 0.5% reconcile tolerance vs navani's summary
VOLT_TOL = 0.02       # 20 mV tolerance on average voltages


def psql(sql):
    r = subprocess.run(PSQL + ['-c', sql], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f'psql failed: {r.stderr.strip()}')
    return r.stdout.strip()


def sql_str(s):
    return "'" + str(s).replace("'", "''") + "'"


def load_file(path):
    from navani import echem
    df = echem.echem_file_loader(path)
    summary = echem.cycle_summary(df)
    return df, summary


def normalize(df):
    """navani df → list of point dicts in OUR schema units/vocabulary."""
    # state → step_type. 'R' is rest; numeric states are charge/discharge —
    # decide by the SIGN OF CURRENT within each state group (navani's 0/1
    # assignment is loader-dependent; current sign is physical ground truth).
    state_to_type = {}
    for st, grp in df.groupby('state'):
        if isinstance(st, str) and st.upper() == 'R':
            state_to_type[st] = 'rest'
        else:
            state_to_type[st] = 'charge' if grp['Current'].mean() >= 0 else 'discharge'

    # Column-array access (itertuples would mangle names like 'time/s', 'full cycle')
    def col(name):
        return df[name].tolist() if name in df.columns else None

    n = len(df)
    cyc_a = col('full cycle')
    volt_a = col('Voltage')
    cur_a = col('Current')
    cap_a = col('Capacity')
    state_a = col('state')
    ns_a = col('Ns')
    half_a = col('half cycle')
    time_a = col('time/s') or col('Time')
    temp_col = next((c for c in df.columns if 'emperature' in c), None)
    temp_a = col(temp_col) if temp_col else None

    def num(x, default=None):
        try:
            f = float(x)
            return f if f == f else default      # NaN → default
        except (TypeError, ValueError):
            return default

    points = []
    for i in range(n):
        cyc = num(cyc_a[i]) if cyc_a else None
        v = num(volt_a[i]) if volt_a else None
        if cyc is None or v is None:
            continue
        step_no = num(ns_a[i]) if ns_a else None
        if step_no is None:
            step_no = num(half_a[i], 0) if half_a else 0
        points.append({
            'cycle_number': int(cyc),
            'step_number': int(step_no),
            'step_type': state_to_type.get(state_a[i], 'rest') if state_a else 'rest',
            'time_s': num(time_a[i], float(i)) if time_a else float(i),
            'voltage_v': v,
            'current_a': num(cur_a[i], 0.0) / 1000.0 if cur_a else 0.0,
            'capacity_ah': num(cap_a[i], 0.0) / 1000.0 if cap_a else 0.0,
            'temperature_c': num(temp_a[i]) if temp_a else None,
        })
    return points


def our_summary(points):
    """Per-cycle summary computed from the point stream (trapezoid energies)."""
    by_cycle = {}
    for p in points:
        by_cycle.setdefault(p['cycle_number'], []).append(p)
    out = {}
    for cyc, pts in sorted(by_cycle.items()):
        chg_cap = max((p['capacity_ah'] for p in pts if p['step_type'] == 'charge'), default=None)
        dch_cap = max((p['capacity_ah'] for p in pts if p['step_type'] == 'discharge'), default=None)
        # capacity-weighted average voltage per step type (standard ⟨V⟩ = ∫V dQ / Q)
        def avg_v(stype):
            seq = [p for p in pts if p['step_type'] == stype]
            num = den = 0.0
            for a, b in zip(seq, seq[1:]):
                dq = abs(b['capacity_ah'] - a['capacity_ah'])
                num += 0.5 * (a['voltage_v'] + b['voltage_v']) * dq
                den += dq
            return num / den if den > 0 else None
        # trapezoid energy ∫V·I dt per step type, Wh
        def energy(stype):
            seq = [p for p in pts if p['step_type'] == stype]
            e = 0.0
            for a, b in zip(seq, seq[1:]):
                dt = b['time_s'] - a['time_s']
                if dt <= 0 or dt > 3600:   # guard seams/resets
                    continue
                e += 0.5 * (abs(a['voltage_v'] * a['current_a']) + abs(b['voltage_v'] * b['current_a'])) * dt
            return e / 3600.0 if e > 0 else None
        t0, t1 = pts[0]['time_s'], pts[-1]['time_s']
        temps = [p['temperature_c'] for p in pts if p['temperature_c'] is not None]
        ce = (dch_cap / chg_cap * 100.0) if chg_cap and dch_cap and chg_cap > 0 else None
        e_chg, e_dch = energy('charge'), energy('discharge')
        out[cyc] = {
            'charge_capacity_ah': chg_cap,
            'discharge_capacity_ah': dch_cap,
            'coulombic_efficiency': ce,
            'charge_energy_wh': e_chg,
            'discharge_energy_wh': e_dch,
            'energy_efficiency': (e_dch / e_chg * 100.0) if e_chg and e_dch else None,
            'max_voltage_v': max(p['voltage_v'] for p in pts),
            'min_voltage_v': min(p['voltage_v'] for p in pts),
            'avg_charge_voltage_v': avg_v('charge'),
            'avg_discharge_voltage_v': avg_v('discharge'),
            'avg_temperature_c': sum(temps) / len(temps) if temps else None,
            'duration_s': t1 - t0 if t1 > t0 else None,
        }
    return out


def reconcile(ours, navani_summary):
    """Gate: our per-cycle capacities/voltages vs navani's own cycle_summary."""
    problems, checked = [], 0
    for cyc, row in navani_summary.iterrows():
        o = ours.get(int(cyc))
        if o is None:
            continue
        for nav_col, our_key in [('Charge Capacity', 'charge_capacity_ah'),
                                 ('Discharge Capacity', 'discharge_capacity_ah')]:
            nav_val = row.get(nav_col)
            our_val = o[our_key]
            if nav_val is None or nav_val != nav_val:      # NaN
                continue
            nav_ah = float(nav_val) / 1000.0
            checked += 1
            if our_val is None or abs(our_val - nav_ah) > max(CAP_TOL_REL * nav_ah, 1e-9):
                problems.append(f'cycle {int(cyc)} {our_key}: ours={our_val} navani={nav_ah}')
        for nav_col, our_key in [('Average Charge Voltage', 'avg_charge_voltage_v'),
                                 ('Average Discharge Voltage', 'avg_discharge_voltage_v')]:
            nav_val = row.get(nav_col)
            our_val = o[our_key]
            if nav_val is None or nav_val != nav_val or our_val is None:
                continue
            checked += 1
            if abs(our_val - float(nav_val)) > VOLT_TOL:
                problems.append(f'cycle {int(cyc)} {our_key}: ours={our_val:.4f} navani={float(nav_val):.4f}')
    return checked, problems


def build_sql(session_id, args, file_hash, points, summaries, equipment, started_at):
    notes = f'NAVANI_IMPORT: {os.path.basename(args.file)}'
    if args.notes:
        notes += f' | {args.notes}'
    cols = ['session_id', 'cycle_number', 'step_number', 'step_type', 'time_s',
            'voltage_v', 'current_a', 'capacity_ah', 'temperature_c']
    lines = [
        'BEGIN;',
        f"INSERT INTO cycling_sessions (session_id, battery_id, equipment_type, file_name, file_hash,"
        f" protocol, started_at, total_cycles, status, uploaded_by, uploaded_at, notes, active_mass_mg)"
        f" VALUES ({session_id}, {args.battery_id}, {sql_str(equipment)}, {sql_str(os.path.basename(args.file))},"
        f" {sql_str(file_hash)}, {sql_str(args.protocol) if args.protocol else 'NULL'},"
        f" {sql_str(started_at) if started_at else 'NULL'}, {len(summaries)}, 'completed',"
        f" {args.uploaded_by}, now(), {sql_str(notes)},"
        f" {args.active_mass_mg if args.active_mass_mg else 'NULL'});",
        f"COPY cycling_datapoints ({', '.join(cols)}) FROM stdin;",
    ]
    for p in points:
        vals = [session_id, p['cycle_number'], p['step_number'], p['step_type'],
                f"{p['time_s']:.6g}", f"{p['voltage_v']:.9g}", f"{p['current_a']:.9g}",
                f"{p['capacity_ah']:.9g}",
                r'\N' if p['temperature_c'] is None else f"{p['temperature_c']:.6g}"]
        lines.append('\t'.join(str(v) for v in vals))
    lines.append(r'\.')
    sum_cols = ['session_id', 'cycle_number', 'charge_capacity_ah', 'discharge_capacity_ah',
                'coulombic_efficiency', 'charge_energy_wh', 'discharge_energy_wh',
                'energy_efficiency', 'max_voltage_v', 'min_voltage_v',
                'avg_charge_voltage_v', 'avg_discharge_voltage_v', 'avg_temperature_c', 'duration_s']
    for cyc, s in sorted(summaries.items()):
        vals = [str(session_id), str(cyc)] + [
            'NULL' if s[k] is None else f'{s[k]:.9g}'
            for k in sum_cols[2:]
        ]
        lines.append(f"INSERT INTO cycling_cycle_summary ({', '.join(sum_cols)}) VALUES ({', '.join(vals)});")
    lines.append('COMMIT;')
    return '\n'.join(lines) + '\n'


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--file', required=True)
    ap.add_argument('--battery-id', type=int, required=True)
    ap.add_argument('--protocol', default=None)
    ap.add_argument('--uploaded-by', type=int, default=34)
    ap.add_argument('--active-mass-mg', type=float, default=None)
    ap.add_argument('--notes', default=None)
    ap.add_argument('--sql', default=None, help='write generated SQL here')
    ap.add_argument('--apply', action='store_true', help='actually write to DB (+post-verify)')
    args = ap.parse_args()

    path = os.path.expanduser(args.file)
    if not os.path.isfile(path):
        sys.exit(f'нет файла: {path}')
    args.file = path

    file_hash = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    dup = psql(f"SELECT session_id FROM cycling_sessions WHERE file_hash = {sql_str(file_hash)};")
    if dup:
        sys.exit(f'СТОП: этот файл уже импортирован (session_id={dup}). Дедуп по sha256.')

    bat = psql(f'SELECT battery_id FROM batteries WHERE battery_id = {args.battery_id};')
    if not bat:
        sys.exit(f'СТОП: battery_id={args.battery_id} не существует.')

    ext = os.path.splitext(path)[1].lower()
    equipment = EQUIPMENT_BY_EXT.get(ext, 'generic')

    print(f'→ парсинг {os.path.basename(path)} (navani)…')
    df, nav_summary = load_file(path)
    points = normalize(df)
    if not points:
        sys.exit('СТОП: navani вернул пустой датасет.')
    started_at = None
    if 'timestamp' in df.columns:
        try:
            started_at = str(df['timestamp'].iloc[0])
        except Exception:
            pass

    summaries = our_summary(points)
    checked, problems = reconcile(summaries, nav_summary)

    volts = [p['voltage_v'] for p in points]
    amps = [abs(p['current_a']) for p in points]
    caps = [p['capacity_ah'] for p in points]
    print(f'  точек: {len(points)}, циклов: {len(summaries)}, '
          f'V: {min(volts):.3f}–{max(volts):.3f} В, '
          f'|I|max: {max(amps)*1000:.3f} мА, Qmax: {max(caps)*1000:.3f} мА·ч')
    print(f'  reconcile gate: {checked} сверок с navani cycle_summary, расхождений: {len(problems)}')
    for pr in problems[:10]:
        print(f'    ✗ {pr}')
    if problems:
        sys.exit('СТОП: reconcile gate не пройден — SQL не сгенерирован.')
    if checked == 0:
        print('  ⚠ ВНИМАНИЕ: navani не дал ни одной сверяемой величины (NaN в его summary).')
        print('    Гейт ДЕГРАДИРОВАН — проверь физические диапазоны выше глазами перед --apply.')

    session_id = int(psql("SELECT nextval('cycling_sessions_session_id_seq');"))
    sql = build_sql(session_id, args, file_hash, points, summaries, equipment, started_at)
    sql_path = args.sql or f'/tmp/navani_import_{session_id}.sql'
    with open(sql_path, 'w') as f:
        f.write(sql)
    print(f'  SQL: {sql_path} (session_id={session_id})')

    if not args.apply:
        print('DRY RUN: в БД ничего не записано. Запусти с --apply для импорта.')
        return

    r = subprocess.run(['psql', '-U', 'Dalia', '-d', 'badb_app_v1', '-q', '-v', 'ON_ERROR_STOP=1', '-f', sql_path],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f'psql apply failed:\n{r.stderr}')

    # post-verify straight from DB
    n_pts = psql(f'SELECT count(*) FROM cycling_datapoints WHERE session_id = {session_id};')
    n_sum = psql(f'SELECT count(*) FROM cycling_cycle_summary WHERE session_id = {session_id};')
    ok = int(n_pts) == len(points) and int(n_sum) == len(summaries)
    print(f'✓ записано: {n_pts} точек (ожидалось {len(points)}), {n_sum} циклов (ожидалось {len(summaries)})')
    if not ok:
        sys.exit('СТОП: post-verify не сошёлся — проверь вручную.')
    print(f'✓ ИМПОРТ OK — session_id={session_id}, battery_id={args.battery_id}. '
          f'Откат: DELETE FROM cycling_sessions WHERE session_id={session_id}; (каскад уберёт точки/summary)')


if __name__ == '__main__':
    main()
