import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePickupDates } from '../optimoSyncService';
import { detectPickupDayFromHistory } from '../pickupDayDetector';

// ---------------------------------------------------------------------------
// generatePickupDates
// ---------------------------------------------------------------------------
describe('generatePickupDates', () => {
  // Use a fixed "today" so tests are deterministic
  beforeEach(() => {
    // Pin to Wednesday 2026-02-25
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-25T10:00:00'));
  });

  it('returns empty array for invalid day name', () => {
    expect(generatePickupDates('invalidday', 'weekly')).toEqual([]);
  });

  it('generates ~4 weekly dates in a 28-day window', () => {
    // Next Thursday after Feb 25 (Wed) is Feb 26
    const dates = generatePickupDates('thursday', 'weekly', 28);
    expect(dates.length).toBe(4);
    expect(dates[0]).toBe('2026-02-26');
    expect(dates[1]).toBe('2026-03-05');
    expect(dates[2]).toBe('2026-03-12');
    expect(dates[3]).toBe('2026-03-19');
  });

  it('generates ~2 bi-weekly dates in a 28-day window', () => {
    const dates = generatePickupDates('thursday', 'bi-weekly', 28);
    expect(dates.length).toBe(2);
    // First is next Thursday (Feb 26), second 14 days later (Mar 12)
    expect(dates[0]).toBe('2026-02-26');
    expect(dates[1]).toBe('2026-03-12');
  });

  it('generates 1 monthly date in a 28-day window', () => {
    const dates = generatePickupDates('thursday', 'monthly', 28);
    expect(dates.length).toBe(1);
    expect(dates[0]).toBe('2026-02-26');
  });

  it('generates more dates with a larger window', () => {
    const dates = generatePickupDates('monday', 'weekly', 56);
    // Next Monday after Feb 25 is Mar 2, then Mar 9, 16, 23, 30, Apr 6, 13, 20
    expect(dates.length).toBe(8);
    expect(dates[0]).toBe('2026-03-02');
  });

  it('skips today even if today matches the pickup day', () => {
    // Today is Wednesday — pickup day is wednesday
    const dates = generatePickupDates('wednesday', 'weekly', 28);
    // Should start from next Wednesday (Mar 4), not today
    expect(dates[0]).toBe('2026-03-04');
  });

  it('handles case-insensitive day names', () => {
    const upper = generatePickupDates('FRIDAY', 'weekly', 28);
    const lower = generatePickupDates('friday', 'weekly', 28);
    const mixed = generatePickupDates('Friday', 'weekly', 28);
    expect(upper).toEqual(lower);
    expect(upper).toEqual(mixed);
  });

  it('defaults to weekly if unknown frequency is passed', () => {
    const dates = generatePickupDates('thursday', 'unknown-freq', 28);
    // Should behave like weekly (interval=7)
    expect(dates.length).toBe(4);
  });

  it('aligns bi-weekly dates to anchor date when provided', () => {
    // Anchor on Feb 12 (a Thursday) — next aligned bi-weekly from Feb 26 should be Feb 26 (14 days later)
    const dates = generatePickupDates('thursday', 'bi-weekly', 28, '2026-02-12');
    expect(dates[0]).toBe('2026-02-26');
    expect(dates[1]).toBe('2026-03-12');
  });

  it('shifts bi-weekly dates when anchor causes off-week', () => {
    // Anchor on Feb 19 (a Thursday) — Feb 26 is only 7 days later (off-week), so should shift to Mar 5
    const dates = generatePickupDates('thursday', 'bi-weekly', 28, '2026-02-19');
    expect(dates[0]).toBe('2026-03-05');
    expect(dates[1]).toBe('2026-03-19');
  });

  it('returns all dates as YYYY-MM-DD strings', () => {
    const dates = generatePickupDates('friday', 'weekly', 28);
    for (const d of dates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('includes sunday as a valid pickup day', () => {
    const dates = generatePickupDates('sunday', 'weekly', 14);
    // Next Sunday after Feb 25 (Wed) is Mar 1
    expect(dates[0]).toBe('2026-03-01');
    expect(dates.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// detectPickupDayFromHistory
// ---------------------------------------------------------------------------
describe('detectPickupDayFromHistory', () => {
  it('returns null when fewer than 3 completed pickups', () => {
    const history = [
      { date: '2026-02-05', status: 'completed' }, // Thursday
      { date: '2026-02-12', status: 'completed' }, // Thursday
    ];
    expect(detectPickupDayFromHistory(history)).toBeNull();
  });

  it('returns null when all entries are non-completed', () => {
    const history = [
      { date: '2026-02-05', status: 'scheduled' },
      { date: '2026-02-12', status: 'scheduled' },
      { date: '2026-02-19', status: 'missed' },
      { date: '2026-02-26', status: 'cancelled' },
    ];
    expect(detectPickupDayFromHistory(history)).toBeNull();
  });

  it('detects thursday when all pickups are on thursdays', () => {
    const history = [
      { date: '2026-01-08', status: 'completed' }, // Thursday
      { date: '2026-01-15', status: 'completed' }, // Thursday
      { date: '2026-01-22', status: 'completed' }, // Thursday
      { date: '2026-01-29', status: 'completed' }, // Thursday
    ];
    const result = detectPickupDayFromHistory(history);
    expect(result).not.toBeNull();
    expect(result!.day).toBe('thursday');
    expect(result!.confidence).toBe(1.0);
  });

  it('detects monday with majority confidence', () => {
    const history = [
      { date: '2026-02-02', status: 'completed' }, // Monday
      { date: '2026-02-09', status: 'completed' }, // Monday
      { date: '2026-02-16', status: 'completed' }, // Monday
      { date: '2026-02-18', status: 'completed' }, // Wednesday (outlier)
    ];
    const result = detectPickupDayFromHistory(history);
    expect(result).not.toBeNull();
    expect(result!.day).toBe('monday');
    expect(result!.confidence).toBe(0.75);
  });

  it('returns null when no clear majority (confidence < 0.5)', () => {
    // 2 Mondays, 2 Tuesdays, 1 Wednesday — no day reaches 50%
    const history = [
      { date: '2026-02-02', status: 'completed' }, // Monday
      { date: '2026-02-03', status: 'completed' }, // Tuesday
      { date: '2026-02-09', status: 'completed' }, // Monday
      { date: '2026-02-10', status: 'completed' }, // Tuesday
      { date: '2026-02-04', status: 'completed' }, // Wednesday
    ];
    const result = detectPickupDayFromHistory(history);
    // Monday and Tuesday each have 2/5 = 0.4 < 0.5
    expect(result).toBeNull();
  });

  it('ignores non-completed statuses in day counting', () => {
    const history = [
      { date: '2026-02-06', status: 'completed' }, // Friday
      { date: '2026-02-13', status: 'completed' }, // Friday
      { date: '2026-02-20', status: 'completed' }, // Friday
      { date: '2026-02-09', status: 'scheduled' }, // Monday — not counted
      { date: '2026-02-10', status: 'missed' },    // Tuesday — not counted
    ];
    const result = detectPickupDayFromHistory(history);
    expect(result).not.toBeNull();
    expect(result!.day).toBe('friday');
    expect(result!.confidence).toBe(1.0);
  });

  it('returns exactly 50% confidence at the threshold', () => {
    // 3 Wednesdays + 3 Thursdays = 50% each, should pick the first one found
    // Actually 3/6 = 0.5 which equals MIN_CONFIDENCE, so it should pass
    const history = [
      { date: '2026-02-04', status: 'completed' }, // Wednesday
      { date: '2026-02-05', status: 'completed' }, // Thursday
      { date: '2026-02-11', status: 'completed' }, // Wednesday
      { date: '2026-02-12', status: 'completed' }, // Thursday
      { date: '2026-02-18', status: 'completed' }, // Wednesday
      { date: '2026-02-19', status: 'completed' }, // Thursday
    ];
    const result = detectPickupDayFromHistory(history);
    // Both have 0.5 confidence — whichever is iterated first wins
    // The function iterates Object.entries so either wednesday or thursday is valid
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.5);
    expect(['wednesday', 'thursday']).toContain(result!.day);
  });

  it('handles empty history array', () => {
    expect(detectPickupDayFromHistory([])).toBeNull();
  });

  it('handles single-day history', () => {
    const history = [{ date: '2026-02-06', status: 'completed' }];
    expect(detectPickupDayFromHistory(history)).toBeNull();
  });

  it('correctly identifies saturday pickups', () => {
    const history = [
      { date: '2026-02-07', status: 'completed' }, // Saturday
      { date: '2026-02-14', status: 'completed' }, // Saturday
      { date: '2026-02-21', status: 'completed' }, // Saturday
    ];
    const result = detectPickupDayFromHistory(history);
    expect(result).not.toBeNull();
    expect(result!.day).toBe('saturday');
  });
});
