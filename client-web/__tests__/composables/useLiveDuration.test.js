// Tests for src/composables/useLiveDuration.js
//
// The composable returns { ms, label } reactive refs that track the
// elapsed time since a given ISO timestamp, ticking every 60 seconds.
// Architecture doc §3 calls out format-edge tests as non-trivial logic
// worth covering before LiveDelayBadge.vue (third Phase A primitive)
// consumes it.
//
// We test:
//   1. _format — the standalone Russian formatter exported for testing
//   2. ms / label react when the source value or "now" changes
//   3. timer cleans up on unmount

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useLiveDuration, _format } from '@/composables/useLiveDuration.js';

describe('_format()', () => {
  it('returns "—" for null / undefined / negative', () => {
    expect(_format(null)).toBe('—');
    expect(_format(undefined)).toBe('—');
    expect(_format(-1)).toBe('—');
  });

  it('returns "только что" for under 60 seconds', () => {
    expect(_format(0)).toBe('только что');
    expect(_format(30_000)).toBe('только что');
    expect(_format(59_999)).toBe('только что');
  });

  it('returns "N мин" between 1 and 59 minutes', () => {
    expect(_format(60_000)).toBe('1 мин');
    expect(_format(15 * 60_000)).toBe('15 мин');
    expect(_format(59 * 60_000)).toBe('59 мин');
  });

  it('returns "H ч M мин" between 1 and 23 hours', () => {
    expect(_format(60 * 60_000)).toBe('1 ч 0 мин');
    expect(_format(2 * 60 * 60_000 + 15 * 60_000)).toBe('2 ч 15 мин');
    expect(_format(23 * 60 * 60_000 + 45 * 60_000)).toBe('23 ч 45 мин');
  });

  it('returns "D дн H ч" when hours > 0 in remainder', () => {
    expect(_format(24 * 60 * 60_000 + 5 * 60 * 60_000)).toBe('1 дн 5 ч');
    expect(_format(2 * 24 * 60 * 60_000 + 12 * 60 * 60_000)).toBe('2 дн 12 ч');
  });

  it('returns "D дн" when hours remainder is 0', () => {
    expect(_format(24 * 60 * 60_000)).toBe('1 дн');
    expect(_format(7 * 24 * 60 * 60_000)).toBe('7 дн');
  });
});

describe('useLiveDuration()', () => {
  let nowSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    // Anchor "now" to a known instant for deterministic ms calculations.
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(
      new Date('2026-05-27T12:00:00Z').getTime()
    );
  });

  afterEach(() => {
    nowSpy.mockRestore();
    vi.useRealTimers();
  });

  function mountWith(sourceRef) {
    let captured;
    const Comp = defineComponent({
      setup() {
        captured = useLiveDuration(() => sourceRef.value);
        return () => h('div', captured.label.value);
      },
    });
    const wrapper = mount(Comp);
    return { wrapper, captured };
  }

  it('returns null ms + "—" label when source is empty', () => {
    const src = ref(null);
    const { captured } = mountWith(src);
    expect(captured.ms.value).toBeNull();
    expect(captured.label.value).toBe('—');
  });

  it('returns correct elapsed for a 30-min-old source', () => {
    const src = ref('2026-05-27T11:30:00Z'); // 30 min ago
    const { captured } = mountWith(src);
    expect(captured.ms.value).toBe(30 * 60_000);
    expect(captured.label.value).toBe('30 мин');
  });

  it('reacts to source value change', async () => {
    const src = ref('2026-05-27T11:30:00Z');
    const { wrapper, captured } = mountWith(src);
    expect(captured.label.value).toBe('30 мин');

    src.value = '2026-05-27T10:00:00Z'; // 2 hours ago
    await wrapper.vm.$nextTick();
    expect(captured.label.value).toBe('2 ч 0 мин');
  });

  it('reacts to time passing (60s tick)', async () => {
    const src = ref('2026-05-27T11:30:00Z'); // 30 min ago at start
    const { wrapper, captured } = mountWith(src);
    expect(captured.label.value).toBe('30 мин');

    // Move "now" forward 15 minutes and fire the next tick.
    nowSpy.mockReturnValue(new Date('2026-05-27T12:15:00Z').getTime());
    vi.advanceTimersByTime(60_000); // one tick crosses the threshold
    await wrapper.vm.$nextTick();

    expect(captured.label.value).toBe('45 мин');
  });

  it('clears its timer on unmount', () => {
    const src = ref('2026-05-27T11:30:00Z');
    const { wrapper } = mountWith(src);

    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    wrapper.unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('handles a Date instance as source', () => {
    const src = ref(new Date('2026-05-27T11:00:00Z')); // 1 hour ago
    const { captured } = mountWith(src);
    expect(captured.ms.value).toBe(60 * 60_000);
    expect(captured.label.value).toBe('1 ч 0 мин');
  });

  it('returns null for an unparseable source', () => {
    const src = ref('not a date');
    const { captured } = mountWith(src);
    expect(captured.ms.value).toBeNull();
    expect(captured.label.value).toBe('—');
  });
});
