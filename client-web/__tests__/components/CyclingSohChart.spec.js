// Component test for src/components/CyclingSohChart.vue
//
// The SOH / capacity protocol-comparison chart. We can't render the real
// Chart.js canvas in jsdom, so we stub vue-chartjs's <Line> as a passthrough
// that captures the `data` / `options` props. That lets us assert the whole
// data pipeline (grouping, datasets, EOL line, metric switch) + the template
// wiring (legend chips, per-protocol readout) without a GPU.

import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

// Replace vue-chartjs's <Line> with a passthrough that captures data/options
// (no canvas in jsdom). vi.mock is hoisted, so the stub is defined inline.
vi.mock('vue-chartjs', () => ({
  Line: { name: 'Line', props: ['data', 'options'], template: '<div class="line-stub"></div>' },
}));

import CyclingSohChart from '@/components/CyclingSohChart.vue';

const sessions = [
  { session_id: 1, protocol: 'NCA-C', file_name: 'NCA-C A1 [0.5C-1C]',
    summary: [{ cycle_number: 1, discharge_capacity_ah: 1.5 },
              { cycle_number: 2, discharge_capacity_ah: 1.4 },
              { cycle_number: 3, discharge_capacity_ah: 1.2 }] },
  { session_id: 2, protocol: 'NCA-C', file_name: 'NCA-C A2 [0.5C-1C]',
    summary: [{ cycle_number: 1, discharge_capacity_ah: 1.6 },
              { cycle_number: 2, discharge_capacity_ah: 1.5 },
              { cycle_number: 3, discharge_capacity_ah: 1.3 }] },
  { session_id: 3, protocol: 'NMC-C', file_name: 'NMC-C D1 [0.5C-1C]',
    summary: [{ cycle_number: 1, discharge_capacity_ah: 2.6 },
              { cycle_number: 2, discharge_capacity_ah: 2.5 },
              { cycle_number: 3, discharge_capacity_ah: 2.0 }] },
];

function mountChart() {
  return mount(CyclingSohChart, { props: { sessions } });
}

describe('CyclingSohChart', () => {
  it('renders the card and a legend chip per protocol', () => {
    const w = mountChart();
    expect(w.find('.soh-chart-card').exists()).toBe(true);
    const legend = w.findAll('.soh-legend-item').map(n => n.text());
    expect(legend).toContain('NCA-C');
    expect(legend).toContain('NMC-C');
    expect(legend.length).toBe(2);
  });

  it('builds one SOH line per cell + an EOL line by default', () => {
    const w = mountChart();
    const data = w.findComponent('.line-stub').props('data');
    const labels = data.datasets.map(d => d.label);
    // 3 cells → 3 lines, plus the 80% EOL reference line (SOH mode default)
    expect(labels.some(l => /NCA-C · NCA-C A1/.test(l))).toBe(true);
    expect(labels.some(l => /EOL/.test(l))).toBe(true);
    expect(data.datasets.length).toBe(4);
  });

  it('normalises SOH to 100% at the first cycle', () => {
    const w = mountChart();
    const data = w.findComponent('.line-stub').props('data');
    const a1 = data.datasets.find(d => /A1/.test(d.label));
    expect(a1.data[0]).toEqual({ x: 1, y: 100 });
    expect(a1.data[2].y).toBeCloseTo((1.2 / 1.5) * 100, 6); // 80%
  });

  it('renders a readout row per protocol with cycles-to-EOL info', () => {
    const w = mountChart();
    const rows = w.findAll('.soh-readout-row');
    expect(rows.length).toBe(2);
  });

  it('switches the Y metric to absolute capacity (Ah)', async () => {
    const w = mountChart();
    const capBtn = w.findAll('.soh-seg-btn').find(b => /Ёмкость, Ah/.test(b.text()));
    await capBtn.trigger('click');
    const opts = w.findComponent('.line-stub').props('options');
    expect(opts.scales.y.title.text).toBe('DCh ёмкость, Ah');
    // in Ah mode the first NCA-C A1 point is the raw 1.5 Ah, not 100 %
    const data = w.findComponent('.line-stub').props('data');
    const a1 = data.datasets.find(d => /A1/.test(d.label));
    expect(a1.data[0].y).toBe(1.5);
  });

  it('hides a protocol when its legend chip is clicked', async () => {
    const w = mountChart();
    const ncaChip = w.findAll('.soh-legend-item').find(n => n.text() === 'NMC-C');
    await ncaChip.trigger('click');
    const data = w.findComponent('.line-stub').props('data');
    expect(data.datasets.some(d => /NMC-C/.test(d.label))).toBe(false);
    expect(data.datasets.some(d => /NCA-C/.test(d.label))).toBe(true);
  });
});
