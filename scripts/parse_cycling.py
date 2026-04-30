#!/usr/bin/env python3
"""
parse_cycling.py — Parse battery cycling data files into structured JSON.

Usage:
    python3 scripts/parse_cycling.py --file /path/to/file.csv --format generic --session-id 42

Output: JSON to stdout with { datapoints, summary, meta }

Supported formats:
    generic  — CSV with columns: cycle, step, step_type, time_s, voltage_v, current_a, capacity_ah, energy_wh, temperature_c
    elitech  — ELITECH P-20X8 TXT export (EN headers "Cycle/Step" OR RU headers "Цикл/Шаг", UTF-8 or cp1251)
    neware   — Neware BTS export CSV
    arbin    — Arbin MITS Pro export CSV
    biologic — EC-Lab .mpt/.txt export
"""

import argparse
import csv
import json
import re
import sys
import os
from datetime import datetime


def parse_generic_csv(filepath):
    """Parse generic CSV with standardized column names."""
    datapoints = []

    # Try to detect delimiter
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        sample = f.read(4096)

    if '\t' in sample:
        delimiter = '\t'
    elif ';' in sample:
        delimiter = ';'
    else:
        delimiter = ','

    # Column name mappings (lowercase, stripped)
    COL_MAP = {
        'cycle': 'cycle_number', 'cycle_number': 'cycle_number', 'cycle number': 'cycle_number',
        'cycle_index': 'cycle_number', 'cycle index': 'cycle_number',
        'step': 'step_number', 'step_number': 'step_number', 'step number': 'step_number',
        'step_index': 'step_number', 'step index': 'step_number',
        'step_type': 'step_type', 'step type': 'step_type', 'type': 'step_type',
        'status': 'step_type', 'state': 'step_type',
        'time': 'time_s', 'time_s': 'time_s', 'time(s)': 'time_s',
        'test_time': 'time_s', 'test_time(s)': 'time_s', 'test time(s)': 'time_s',
        'total time': 'time_s', 'total_time': 'time_s',
        'voltage': 'voltage_v', 'voltage_v': 'voltage_v', 'voltage(v)': 'voltage_v',
        'vol(v)': 'voltage_v', 'ecell/v': 'voltage_v',
        'current': 'current_a', 'current_a': 'current_a', 'current(a)': 'current_a',
        'cur(a)': 'current_a', 'i/ma': 'current_ma',
        'capacity': 'capacity_ah', 'capacity_ah': 'capacity_ah', 'capacity(ah)': 'capacity_ah',
        'cap(ah)': 'capacity_ah', 'q charge/discharge/mA.h': 'capacity_mah',
        'energy': 'energy_wh', 'energy_wh': 'energy_wh', 'energy(wh)': 'energy_wh',
        'temperature': 'temperature_c', 'temperature_c': 'temperature_c', 'temp': 'temperature_c',
        'aux_temperature_1': 'temperature_c',
    }

    STEP_TYPE_MAP = {
        'cc_chg': 'charge', 'cc chg': 'charge', 'charge': 'charge', 'c': 'charge',
        'cccv_chg': 'cccv', 'cccv chg': 'cccv', 'cccv': 'cccv',
        'cc_dchg': 'discharge', 'cc dchg': 'discharge', 'discharge': 'discharge', 'd': 'discharge',
        'rest': 'rest', 'r': 'rest', 'pause': 'rest',
    }

    with open(filepath, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f, delimiter=delimiter)

        # Map header columns
        col_mapping = {}
        for raw_col in reader.fieldnames or []:
            normalized = raw_col.strip().lower()
            if normalized in COL_MAP:
                col_mapping[raw_col] = COL_MAP[normalized]

        if 'voltage_v' not in col_mapping.values():
            raise ValueError(f"Cannot find voltage column. Headers: {reader.fieldnames}")

        for row in reader:
            dp = {}
            for raw_col, mapped in col_mapping.items():
                val = row.get(raw_col, '').strip()
                if not val:
                    continue
                if mapped == 'step_type':
                    dp[mapped] = STEP_TYPE_MAP.get(val.lower(), val.lower())
                elif mapped == 'current_ma':
                    dp['current_a'] = safe_float(val) / 1000.0 if safe_float(val) is not None else None
                elif mapped == 'capacity_mah':
                    dp['capacity_ah'] = safe_float(val) / 1000.0 if safe_float(val) is not None else None
                elif mapped in ('cycle_number', 'step_number'):
                    dp[mapped] = safe_int(val)
                else:
                    dp[mapped] = safe_float(val)

            if dp.get('voltage_v') is not None:
                datapoints.append(dp)

    return datapoints


def _read_text_autoencoding(filepath):
    """Read a text file, auto-detecting encoding.

    ELITECH exports UTF-8 (English locale) or cp1251 (Russian locale). We try
    UTF-8 first with strict decoding — if that fails on a non-ASCII byte, we
    fall back to cp1251. BOM is handled by 'utf-8-sig'.
    """
    with open(filepath, 'rb') as f:
        raw = f.read()
    # Try utf-8-sig (handles BOM)
    try:
        return raw.decode('utf-8-sig'), 'utf-8'
    except UnicodeDecodeError:
        pass
    # Fall back to Windows-1251 (Russian). This never raises — cp1251 maps
    # every byte, so if UTF-8 was wrong, we trust cp1251.
    return raw.decode('cp1251'), 'cp1251'


# Regexes for ELITECH block headers. EN (three separate lines) vs RU (one line).
_RE_EN_CYCLE = re.compile(r'^\s*Cycle\s+(\d+)\s*$', re.IGNORECASE)
_RE_EN_STEP = re.compile(r'^\s*Step\s+(\d+)\s*$', re.IGNORECASE)
_RE_RU_CYCLE_STEP = re.compile(r'^\s*Цикл\s+(\d+)\s*,\s*Шаг\s+(\d+)\s*$')

# Data-table header lines (mark start of numeric rows inside a block).
_RE_EN_DATA_HDR = re.compile(r'^\s*Time\s*\(', re.IGNORECASE)
_RE_RU_DATA_HDR = re.compile(r'^\s*Время\s*,')

# "Тип работы" (work mode) — drives step_type when present. RU-only; EN files
# don't embed the mode, so we fall back to current-sign heuristics.
_RE_RU_WORK_MODE = re.compile(r'^\s*Тип\s+работы\s*:\s*(.+?)\s*$')

# Metadata lines (RU only; EN files don't have a metadata header block).
_RE_RU_META = {
    'sample_name': re.compile(r'^\s*Название\s+блока\s+данных\s*:\s*(.+?)\s*$'),
    'date':        re.compile(r'^\s*Дата\s+регистрации\s+данных\s*:\s*(.+?)\s*$'),
    'time':        re.compile(r'^\s*Время\s+регистрации\s+данных\s*:\s*(.+?)\s*$'),
    'user_comment':re.compile(r'^\s*Комментарий\s+пользователя\s*:\s*(.+?)\s*$'),
    'instrument':  re.compile(r'^\s*Прибор\s*:\s*(.+?)\s*$'),
    'channel':     re.compile(r'^\s*Номер\s+канала\s*:\s*(.+?)\s*$'),
}

# Data row: 3 whitespace-separated numbers (time, voltage, current). We allow
# trailing whitespace but reject lines that contain any alphabetic character —
# that protects us from eating the next block's header by mistake.
_RE_DATA_ROW = re.compile(r'^\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s+'
                          r'(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s+'
                          r'(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*$')


def _classify_step_type(work_mode, current_a):
    """Return 'charge' / 'discharge' / 'rest' / 'cccv' / None.

    work_mode is the RU "Тип работы" string (e.g. "Гальваностат", "Вольтметр"),
    or None for EN files. current_a is a representative current value (e.g.
    the mean within the step).
    """
    if work_mode:
        wm = work_mode.lower()
        # "Вольтметр" = OCV / rest step (no current applied, just measurement)
        if 'вольтметр' in wm or 'ocv' in wm:
            return 'rest'
        # "Гальваностат" = constant current. Sign of current gives direction.
        if 'гальваностат' in wm or 'galvanostat' in wm:
            if current_a is None:
                return None
            if current_a > 1e-6:
                return 'charge'
            if current_a < -1e-6:
                return 'discharge'
            return 'rest'
        # "Потенциостат" = constant voltage (CV-type). Often used at end of CC
        # charge (CCCV protocol), so we tag it 'cccv' when current flows and
        # 'rest' when it doesn't.
        if 'потенциостат' in wm or 'potentiostat' in wm:
            if current_a is None or abs(current_a) < 1e-6:
                return 'rest'
            return 'cccv'
    # Fallback: current sign only (EN files, or unknown mode).
    if current_a is None or abs(current_a) < 1e-6:
        return 'rest'
    return 'charge' if current_a > 0 else 'discharge'


def parse_elitech_txt(filepath):
    """Parse an ELITECH P-20X8 TXT export (EN or RU locale).

    Returns (datapoints, meta_dict). The outer pipeline then computes
    per-cycle summary + integrates capacity from current*dt.
    """
    text, encoding = _read_text_autoencoding(filepath)
    lines = text.splitlines()

    meta = {'encoding': encoding, 'source_format': 'elitech'}

    # State machine: we walk the file line by line.
    #   cycle_number   — current cycle (from "Cycle N" / "Цикл N, Шаг M")
    #   step_number    — current step inside cycle
    #   work_mode      — last seen "Тип работы" (RU only)
    #   in_data        — True while we're consuming rows under a data-table header
    cycle_number = 0
    step_number = 0
    work_mode = None
    in_data = False

    # We append raw datapoints WITHOUT step_type; step_type is filled in per-step
    # after the block ends, so we can use the mean current of the step (more
    # robust than looking at the first point, which might be a relaxation).
    datapoints = []
    # Buffer of indices belonging to the current step — used to backfill step_type
    # and optionally integrate capacity per step.
    step_indices = []

    def finalize_step():
        """Assign step_type + integrate capacity for all points in step_indices."""
        if not step_indices:
            return
        currents = [datapoints[i].get('current_a') for i in step_indices]
        currents = [c for c in currents if c is not None]
        mean_i = sum(currents) / len(currents) if currents else 0.0
        step_type = _classify_step_type(work_mode, mean_i)

        # Integrate per-step:
        #   capacity_ah = ∫ |I| dt / 3600  (Ah)
        #   energy_wh   = ∫ |I|·V dt / 3600 (Wh, signed per direction absorbed
        #                                     into magnitude — EE compares
        #                                     charge vs discharge magnitudes)
        # ELITECH doesn't export energy_wh directly; without this integration
        # the Energy Efficiency (EE%) column in the per-cycle summary stays
        # empty. Both are reset to 0 at step start (per-step basis); the
        # total_energy() aggregator sums per-step maxes across steps of the
        # same type within a cycle (same pattern as total_capacity).
        running_ah = 0.0
        running_wh = 0.0
        prev_time = None
        prev_current = None
        prev_voltage = None
        is_faradic = step_type in ('charge', 'discharge', 'cccv')
        for i in step_indices:
            dp = datapoints[i]
            dp['step_type'] = step_type
            t = dp.get('time_s')
            c = dp.get('current_a')
            v = dp.get('voltage_v')
            if (t is not None and c is not None and
                prev_time is not None and prev_current is not None):
                dt = t - prev_time
                if dt > 0:
                    # |I| trapezoid → Ah
                    running_ah += (abs(c) + abs(prev_current)) * 0.5 * dt / 3600.0
                    # |I|·V trapezoid → Wh (energy always positive, direction
                    # inferred by step_type — mirrors how battery testers
                    # report charge/discharge energies as magnitudes)
                    if v is not None and prev_voltage is not None:
                        p_now = abs(c) * v
                        p_prev = abs(prev_current) * prev_voltage
                        running_wh += (p_now + p_prev) * 0.5 * dt / 3600.0
            dp['capacity_ah'] = round(running_ah, 9) if is_faradic else None
            dp['energy_wh']   = round(running_wh, 9) if is_faradic else None
            prev_time = t
            prev_current = c
            prev_voltage = v

    for raw in lines:
        line = raw.rstrip('\r\n')
        if not line.strip():
            # Blank line = end of current data table (if any)
            if in_data:
                finalize_step()
                step_indices = []
                in_data = False
            continue

        # --- Metadata (RU files only; harmless no-op on EN) ---
        if not in_data and step_number == 0:
            for key, rx in _RE_RU_META.items():
                m = rx.match(line)
                if m:
                    meta[key] = m.group(1).strip()
                    break

        # --- Cycle/Step header recognition ---
        m_ru = _RE_RU_CYCLE_STEP.match(line)
        if m_ru:
            if in_data:
                finalize_step()
                step_indices = []
                in_data = False
            cycle_number = int(m_ru.group(1))
            step_number = int(m_ru.group(2))
            work_mode = None  # reset until we see "Тип работы" for this step
            continue

        m_en_cycle = _RE_EN_CYCLE.match(line)
        if m_en_cycle:
            if in_data:
                finalize_step()
                step_indices = []
                in_data = False
            cycle_number = int(m_en_cycle.group(1))
            work_mode = None
            continue

        m_en_step = _RE_EN_STEP.match(line)
        if m_en_step:
            if in_data:
                finalize_step()
                step_indices = []
                in_data = False
            step_number = int(m_en_step.group(1))
            work_mode = None
            continue

        # --- Work mode (RU only) ---
        m_wm = _RE_RU_WORK_MODE.match(line)
        if m_wm:
            work_mode = m_wm.group(1).strip()
            continue

        # --- Data-table header ---
        if _RE_EN_DATA_HDR.match(line) or _RE_RU_DATA_HDR.match(line):
            in_data = True
            continue

        # --- Data rows (only when we're past a table header) ---
        if in_data:
            m_row = _RE_DATA_ROW.match(line)
            if not m_row:
                # Anything non-numeric in data mode ends the table.
                finalize_step()
                step_indices = []
                in_data = False
                continue
            t = safe_float(m_row.group(1))
            v = safe_float(m_row.group(2))
            i_a = safe_float(m_row.group(3))
            if v is None:
                continue
            dp = {
                'cycle_number': cycle_number,
                'step_number': step_number,
                'time_s': t,
                'voltage_v': v,
                'current_a': i_a,
            }
            datapoints.append(dp)
            step_indices.append(len(datapoints) - 1)

    # Flush any trailing step that didn't end with a blank line.
    if in_data:
        finalize_step()

    # Normalize channel to int when possible
    if 'channel' in meta:
        try:
            meta['channel'] = int(str(meta['channel']).strip())
        except (ValueError, TypeError):
            pass

    return datapoints, meta


def safe_float(val):
    try:
        return float(val.replace(',', '.'))
    except (ValueError, AttributeError):
        return None


def safe_int(val):
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return 0


def compute_summary(datapoints):
    """Compute per-cycle summary metrics from raw datapoints.

    Scientific convention (Li-ion cycling):
      - charge_capacity_ah: total charge accepted during the charging
        portion of a cycle, including both CC and CV sub-steps if present.
      - discharge_capacity_ah: total charge delivered during discharge.
      - coulombic_efficiency (CE): Q_discharge / Q_charge * 100% — the
        single most common degradation metric besides capacity fade.
      - charge_energy_wh / discharge_energy_wh: ∫V·I·dt integrated per half-cycle.
      - avg_charge_voltage / avg_discharge_voltage: mean V across the
        respective step — captures polarisation growth (overpotential).
    """
    cycles = {}
    for dp in datapoints:
        cn = dp.get('cycle_number', 0)
        if cn not in cycles:
            cycles[cn] = {'charge': [], 'discharge': [], 'all': []}
        step = dp.get('step_type', '')
        if step in ('charge', 'cccv'):
            cycles[cn]['charge'].append(dp)
        elif step == 'discharge':
            cycles[cn]['discharge'].append(dp)
        cycles[cn]['all'].append(dp)

    summary = []
    for cn in sorted(cycles.keys()):
        c = cycles[cn]
        charge_cap = total_capacity(c['charge'])
        discharge_cap = total_capacity(c['discharge'])
        charge_energy = total_energy(c['charge'])
        discharge_energy = total_energy(c['discharge'])

        voltages = [dp.get('voltage_v') for dp in c['all'] if dp.get('voltage_v') is not None]
        temps = [dp.get('temperature_c') for dp in c['all'] if dp.get('temperature_c') is not None]
        times = [dp.get('time_s') for dp in c['all'] if dp.get('time_s') is not None]

        # Per-half-cycle average voltage — input signal to polarisation /
        # average-voltage-vs-cycle plots. Only voltage (not weighted by
        # current) — standard publication convention.
        chg_volts = [dp.get('voltage_v') for dp in c['charge'] if dp.get('voltage_v') is not None]
        dch_volts = [dp.get('voltage_v') for dp in c['discharge'] if dp.get('voltage_v') is not None]
        avg_charge_v = sum(chg_volts) / len(chg_volts) if chg_volts else None
        avg_discharge_v = sum(dch_volts) / len(dch_volts) if dch_volts else None

        # CE = Q_discharge / Q_charge × 100. Guard: charge_cap must be >0
        # (Li-ion never has discharge-first cycles outside of discharge
        # priming). If discharge_cap is a valid 0 (dead cell), keep it —
        # plotting 0% CE is a signal, not a blank.
        ce = None
        if charge_cap is not None and charge_cap > 0 and discharge_cap is not None:
            ce = (discharge_cap / charge_cap) * 100

        # Energy efficiency: E_discharge / E_charge × 100. Complementary
        # to CE — CE is about Coulombs, EE about round-trip Wh (includes
        # voltage hysteresis). Papers often show both.
        ee = None
        if charge_energy is not None and charge_energy > 0 and discharge_energy is not None:
            ee = (discharge_energy / charge_energy) * 100

        summary.append({
            'cycle_number': cn,
            'charge_capacity_ah': charge_cap,
            'discharge_capacity_ah': discharge_cap,
            'coulombic_efficiency': round(ce, 2) if ce is not None else None,
            'energy_efficiency': round(ee, 2) if ee is not None else None,
            'charge_energy_wh': charge_energy,
            'discharge_energy_wh': discharge_energy,
            'avg_charge_voltage_v': round(avg_charge_v, 4) if avg_charge_v is not None else None,
            'avg_discharge_voltage_v': round(avg_discharge_v, 4) if avg_discharge_v is not None else None,
            'max_voltage_v': max(voltages) if voltages else None,
            'min_voltage_v': min(voltages) if voltages else None,
            'avg_temperature_c': round(sum(temps) / len(temps), 1) if temps else None,
            'duration_s': (max(times) - min(times)) if len(times) >= 2 else None,
        })

    return summary


def total_capacity(points):
    """Sum of per-step max capacities within the same cycle+step_type.

    Previously we took max(all_points.capacity_ah), but ELITECH (and most
    potentiostat exports) reset capacity_ah at the start of each step:
    in a CCCV protocol the CC step integrates 0 → X_cc, then the CV step
    restarts 0 → X_cv. max() catches only X_cc. Real total is X_cc + X_cv.

    Computing per step_number, taking each step's max, then summing
    reproduces the true half-cycle capacity regardless of how many
    sub-steps the protocol uses.
    """
    per_step = {}
    for dp in points:
        sn = dp.get('step_number')
        cap = dp.get('capacity_ah')
        if cap is None or sn is None:
            continue
        if sn not in per_step or cap > per_step[sn]:
            per_step[sn] = cap
    if not per_step:
        return None
    return sum(per_step.values())


def total_energy(points):
    """Same logic as total_capacity but for energy (Wh).

    ELITECH typically doesn't export energy_wh directly (we integrate it
    on the client later), so this function is usually summing Nones in
    current exports. Kept structurally parallel for future formats that
    do emit energy per step.
    """
    per_step = {}
    for dp in points:
        sn = dp.get('step_number')
        e = dp.get('energy_wh')
        if e is None or sn is None:
            continue
        if sn not in per_step or e > per_step[sn]:
            per_step[sn] = e
    if not per_step:
        return None
    return sum(per_step.values())


def extract_meta(datapoints, summary):
    """Extract session metadata from parsed data.

    total_cycles is the number of distinct cycle_numbers, computed as
    max-min+1. This works for both 1-based (ELITECH: Cycle 1..N) and
    0-based (generic CSV: 0..N-1) conventions — previously we wrote
    max+1 which off-by-oned ELITECH files (10 cycles → 11 in the DB).
    """
    times = [dp.get('time_s') for dp in datapoints if dp.get('time_s') is not None]
    cycles = [dp.get('cycle_number') for dp in datapoints if dp.get('cycle_number') is not None]

    total = 0
    if cycles:
        total = max(cycles) - min(cycles) + 1

    return {
        'total_cycles': total,
        'total_datapoints': len(datapoints),
        'started_at': None,  # Would need absolute timestamps from equipment
        'ended_at': None,
        'max_time_s': max(times) if times else 0,
    }


def _autodetect_format(filepath):
    """Peek at the first ~4KB and guess format.

    Strategy:
      - If we see 'Cycle N' + 'Step N' lines or 'Цикл N, Шаг M' → elitech
      - Otherwise → generic (tries CSV/TSV)
    Used when --format=auto (or when the caller wants fallback behavior).

    Note: _RE_EN_* regexes are line-anchored (^...$) — we can't run them on
    the whole sample (no re.MULTILINE). We split into lines first and test
    each one explicitly.
    """
    try:
        text, _ = _read_text_autoencoding(filepath)
    except Exception:
        return 'generic'
    sample = text[:8192]
    has_en_cycle = False
    has_en_step = False
    for line in sample.splitlines():
        if _RE_RU_CYCLE_STEP.match(line):
            return 'elitech'
        if _RE_EN_CYCLE.match(line):
            has_en_cycle = True
        if _RE_EN_STEP.match(line):
            has_en_step = True
        if has_en_cycle and has_en_step:
            return 'elitech'
    return 'generic'


def main():
    parser = argparse.ArgumentParser(description='Parse battery cycling data files')
    parser.add_argument('--file', required=True, help='Path to data file')
    parser.add_argument('--format', default='auto',
                        choices=['auto', 'generic', 'elitech', 'neware', 'arbin', 'biologic'],
                        help='Equipment/file format ("auto" = peek at content)')
    parser.add_argument('--session-id', type=int, default=0, help='Session ID (for logging)')
    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(json.dumps({'error': f'File not found: {args.file}'}), file=sys.stdout)
        sys.exit(1)

    try:
        fmt = args.format
        if fmt == 'auto':
            fmt = _autodetect_format(args.file)

        meta_from_parser = {}
        if fmt == 'elitech':
            datapoints, meta_from_parser = parse_elitech_txt(args.file)
        else:
            # generic/neware/arbin/biologic all go through CSV for now
            # (equipment-specific parsers to be added in Phase 3-4).
            datapoints = parse_generic_csv(args.file)

        if not datapoints:
            print(json.dumps({'error': 'No datapoints parsed from file'}), file=sys.stdout)
            sys.exit(1)

        summary = compute_summary(datapoints)
        meta = extract_meta(datapoints, summary)
        # Parser-supplied metadata (instrument, sample_name, etc.) wins over
        # the computed generic meta. Both keys coexist; UI can show either.
        meta.update(meta_from_parser)
        meta['detected_format'] = fmt

        result = {
            'datapoints': datapoints,
            'summary': summary,
            'meta': meta,
        }

        print(json.dumps(result), file=sys.stdout)

    except Exception as e:
        print(json.dumps({'error': str(e)}), file=sys.stdout)
        sys.exit(1)


if __name__ == '__main__':
    main()
