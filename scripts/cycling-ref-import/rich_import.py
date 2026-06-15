#!/usr/bin/env python3
"""
Rich reference import — full metrics from the per-cell sheets.

Pipeline (all traceable):
  1. extract_cell() → blocks per per-cell sheet (Chg/DChg/Energy/Volt/SOH + CE)
  2. reconcile each cell's DChg against the verified summary sheet (the
     colleague's own aggregation) — proof the extraction reads the right cols
  3. emit idempotent SQL: one session per (cell × rate-step), full columns

Usage:
  python3 rich_import.py            # extract + reconcile + dry-run plan
  python3 rich_import.py --sql OUT  # also write SQL
"""
import os
import re
import sys
import openpyxl
from percell_extract import extract_cell
import import_ref_cycling as S   # summary parser (parse_blocks) + sql_escape

XLSX = os.environ.get('REF_XLSX') or os.path.expanduser('~/Desktop/файлы коллег/LFP NMC NCA.xlsm')
SUMMARY_NAMES = ['LFP-C', 'LFP-LTO', 'LFP 3.0', 'LFP 4.0', 'NMC 3.0', 'NMC-C', 'NCA-C']
INDEX = {'Лист1', 'Лист3', 'Список_листов', 'PQ_meta'}
BATTERY_ID = 1
TAG = 'REF_IMPORT: коллеги LFP NMC NCA (rich)'

# Map a per-cell sheet name → (canonical protocol, cell label)
PROTO_PREFIXES = ['LFP-C', 'LFP-LTO', 'LFP 3.0', 'LFP 4.0', 'NMC 3.0', 'NMC-C', 'NCA-C']

def split_sheet(name):
    cell = name.split()[-1].strip()
    for p in PROTO_PREFIXES:
        if name.startswith(p):
            return p, cell
    return name, cell

def short_rate(rate):
    r = re.sub(r'\(.*?\)', '', rate)          # drop parentheticals
    r = re.sub(r'\s+', ' ', r).strip()
    return (r[:30] or 'block')


def main():
    out_sql = sys.argv[sys.argv.index('--sql') + 1] if '--sql' in sys.argv else None
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True, keep_links=False)
    percell = [s for s in wb.sheetnames if s not in SUMMARY_NAMES and s not in INDEX]

    # ---- summary DChg per (protocol, cell) for reconciliation ----
    summary_dchg = {}   # (proto, cell) -> sorted list of dch values
    for sn in SUMMARY_NAMES:
        for rate, cells in S.parse_blocks(wb[sn]):
            for cell, series in cells.items():
                key = (sn, cell)
                summary_dchg.setdefault(key, []).extend(v for _, v in series)

    # ---- extract per-cell blocks ----
    plan = []  # dict per (cell, block)
    percell_dchg = {}  # (proto, cell) -> list of dch values (all blocks)
    for sheet in percell:
        proto, cell = split_sheet(sheet)
        for b in extract_cell(wb[sheet]):
            ser = b['series']
            plan.append({'proto': proto, 'cell': cell, 'rate': short_rate(b['rate']), 'series': ser})
            percell_dchg.setdefault((proto, cell), []).extend(p['dch_cap'] for p in ser)
    wb.close()

    # ---- reconciliation: every summary DChg value must appear in per-cell ----
    print('=== RECONCILIATION: summary DChg ⊆ per-cell DChg (tol 1e-3) ===')
    TOL = 1e-3
    total_unmatched = 0
    for sn in SUMMARY_NAMES:
        # gather cells of this protocol
        cells = sorted({c for (p, c) in summary_dchg if p == sn})
        proto_unmatched = 0
        proto_checked = 0
        for c in cells:
            svals = sorted(summary_dchg[(sn, c)])
            pvals = sorted(percell_dchg.get((sn, c), []))
            proto_checked += len(svals)
            # greedy subset match
            i = 0
            for sv in svals:
                # find sv within pvals[i:]
                found = False
                for k in range(len(pvals)):
                    if abs(pvals[k] - sv) <= TOL:
                        found = True
                        break
                if not found:
                    proto_unmatched += 1
        total_unmatched += proto_unmatched
        status = '✓' if proto_unmatched == 0 else f'⚠ {proto_unmatched} unmatched'
        print(f'  {sn:9s}: {len(cells)} cells, {proto_checked} summary pts  {status}')
    print(f'  ──── total unmatched summary points: {total_unmatched}'
          + ('   ✓ per-cell fully covers summary' if total_unmatched == 0 else '   ⚠ review'))

    # ---- plan report ----
    print('\n=== RICH IMPORT PLAN ===')
    by_proto = {}
    for it in plan:
        by_proto.setdefault(it['proto'], []).append(it)
    tot_sessions = tot_rows = 0
    for proto, items in by_proto.items():
        rows = sum(len(i['series']) for i in items)
        ce = sum(1 for i in items for p in i['series'] if p['ce'] is not None)
        print(f'  {proto:9s}: {len(items)} sessions (cell×step), {rows} rows, {ce} with CE')
        tot_sessions += len(items); tot_rows += rows
    print(f'  ──── TOTAL: {tot_sessions} sessions, {tot_rows} cycle rows')

    if not out_sql:
        print('\n(dry-run; pass --sql FILE to write SQL)')
        return

    # ---- SQL ----
    def num(v):
        return 'NULL' if v is None else f'{v:.6f}'

    def ce_qc(ce):
        # CE > 100% is unphysical; values blow up on block-boundary cycles
        # (partial charge) and the rare bad cycle dips low. Keep a generous
        # noise band [50, 105] and null the rest — same QC applied in the DB.
        return ce if (ce is not None and 50 <= ce <= 105) else None

    lines = ['BEGIN;',
             "DELETE FROM cycling_sessions WHERE notes LIKE 'REF_IMPORT:%';", '']
    for it in plan:
        fname = f"{it['proto']} {it['cell']} [{it['rate']}]"
        total = len(it['series'])
        vals = ','.join(
            f"({p['cycle']},{num(p['chg_cap'])},{num(p['dch_cap'])},{num(p['dch_energy'])},"
            f"{num(p['med_volt'])},{num(ce_qc(p['ce']))})"
            for p in it['series'])
        lines.append(
            "WITH s AS (\n"
            "  INSERT INTO cycling_sessions (battery_id, equipment_type, file_name, protocol, total_cycles, status, notes)\n"
            f"  VALUES ({BATTERY_ID}, 'generic', '{S.sql_escape(fname)}', '{S.sql_escape(it['proto'])}', {total}, 'ready', '{S.sql_escape(TAG)} | {S.sql_escape(fname)}')\n"
            "  RETURNING session_id\n)\n"
            "INSERT INTO cycling_cycle_summary\n"
            "  (session_id, cycle_number, charge_capacity_ah, discharge_capacity_ah, discharge_energy_wh, avg_discharge_voltage_v, coulombic_efficiency)\n"
            f"SELECT session_id, v.cyc, v.chg::float8, v.dch::float8, v.en::float8, v.volt::float8, v.ce::float8\n"
            f"FROM s, (VALUES {vals}) AS v(cyc, chg, dch, en, volt, ce);")
    lines += ['', 'COMMIT;']
    with open(out_sql, 'w') as f:
        f.write('\n'.join(lines))
    print(f'\nSQL → {out_sql}  ({len(plan)} sessions)')


if __name__ == '__main__':
    main()
