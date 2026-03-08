import { describe, expect, it } from 'vitest';

import { toSwapAmount } from '../../admin/components/providers/swapAmounts';

describe('toSwapAmount', () => {
  it('parses numeric strings returned by Postgres', () => {
    expect(toSwapAmount('12.50')).toBe(12.5);
  });

  it('preserves number inputs', () => {
    expect(toSwapAmount(-4.25)).toBe(-4.25);
  });

  it('falls back to zero for invalid values', () => {
    expect(toSwapAmount(undefined)).toBe(0);
    expect(toSwapAmount('not-a-number')).toBe(0);
  });
});
