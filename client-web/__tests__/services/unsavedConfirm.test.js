import { describe, it, expect, beforeEach } from 'vitest';
import { askToContinue, resolveDialog, isVisible, message } from '@/services/unsavedConfirm';

beforeEach(() => {
  // Reset module-level state between tests.
  if (isVisible.value) resolveDialog(false);
});

describe('unsavedConfirm service', () => {
  it('askToContinue flips isVisible to true and stores the prompt', () => {
    askToContinue('test prompt');
    expect(isVisible.value).toBe(true);
    expect(message.value).toBe('test prompt');
  });

  it('uses default prompt when no argument is passed', () => {
    askToContinue();
    expect(message.value).toMatch(/несохранённые/i);
  });

  it('resolveDialog(true) resolves the pending promise with true and hides', async () => {
    const p = askToContinue('q');
    resolveDialog(true);
    await expect(p).resolves.toBe(true);
    expect(isVisible.value).toBe(false);
  });

  it('resolveDialog(false) resolves the pending promise with false and hides', async () => {
    const p = askToContinue('q');
    resolveDialog(false);
    await expect(p).resolves.toBe(false);
    expect(isVisible.value).toBe(false);
  });

  it('a second askToContinue cancels the prior pending promise', async () => {
    const first = askToContinue('first');
    const second = askToContinue('second');
    // First should resolve to false (cancelled by the second).
    await expect(first).resolves.toBe(false);
    expect(message.value).toBe('second');
    expect(isVisible.value).toBe(true);
    // Clean up second
    resolveDialog(true);
    await expect(second).resolves.toBe(true);
  });

  it('resolveDialog without a pending promise is a no-op (does not throw)', () => {
    expect(() => resolveDialog(true)).not.toThrow();
    expect(isVisible.value).toBe(false);
  });

  it('coerces truthy/falsy answers to boolean', async () => {
    const p1 = askToContinue('q');
    resolveDialog(1);
    await expect(p1).resolves.toBe(true);

    const p2 = askToContinue('q');
    resolveDialog(0);
    await expect(p2).resolves.toBe(false);

    const p3 = askToContinue('q');
    resolveDialog(null);
    await expect(p3).resolves.toBe(false);
  });
});
