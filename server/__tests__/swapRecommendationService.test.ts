import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSwapRecommendations, executeAutomaticSwaps } from '../swapRecommendationService';
import { storage } from '../storage';
import { analyzeTerritoryOverlaps } from '../territoryAnalysisService';
import { sendProviderChangeNotification } from '../notificationService';

vi.mock('../territoryAnalysisService', () => ({
  analyzeTerritoryOverlaps: vi.fn(),
}));

vi.mock('../notificationService', () => ({
  sendProviderChangeNotification: vi.fn(),
}));

vi.mock('../storage', () => ({
  storage: {
    getLocationMonthlyValue: vi.fn(),
    createSwapRecommendation: vi.fn(),
    getPendingSwaps: vi.fn(),
    updateSwapStatus: vi.fn(),
    applySwapProviderReassignment: vi.fn(),
    getLocationById: vi.fn(),
    getProviderById: vi.fn(),
  },
}));

describe('swapRecommendationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates deterministic recommendations with deterministic valuation summary', async () => {
    vi.mocked(analyzeTerritoryOverlaps).mockResolvedValue([
      { currentProviderId: 'prov-a', potentialProviderId: 'prov-b', locationId: 'loc-a1' },
      { currentProviderId: 'prov-a', potentialProviderId: 'prov-b', locationId: 'loc-a2' }, // missing value
      { currentProviderId: 'prov-b', potentialProviderId: 'prov-a', locationId: 'loc-b1' },
      { currentProviderId: 'prov-b', potentialProviderId: 'prov-a', locationId: 'loc-b2' },
    ] as any);

    vi.mocked(storage.getLocationMonthlyValue).mockImplementation(async (locationId: string) => {
      const byId: Record<string, number> = {
        'loc-a1': 25,
        'loc-a2': 0,
        'loc-b1': 27,
        'loc-b2': 40,
      };
      return byId[locationId] ?? 0;
    });

    vi.mocked(storage.createSwapRecommendation).mockImplementation(async (payload: any) => ({
      id: `swap-${payload.locationAtoBId}-${payload.locationBtoAId}`,
      ...payload,
    }));

    const first = await generateSwapRecommendations();
    const second = await generateSwapRecommendations();

    expect(first.summary).toEqual({
      generated: 1,
      skippedNoCounterpart: 0,
      skippedMissingValue: 1,
      skippedOutsideTolerance: 0,
    });
    expect(first.recommendations).toEqual(second.recommendations);
    expect(first.recommendations[0]).toMatchObject({
      locationAtoBId: 'loc-a1',
      locationBtoAId: 'loc-b1',
      valueAtoB: 25,
      valueBtoA: 27,
    });
  });

  it('auto-accepts only deterministic non-zero swaps and returns gating counts', async () => {
    vi.mocked(storage.getPendingSwaps).mockResolvedValue([
      {
        id: 'swap-zero',
        value_a_to_b_monthly: 0,
        value_b_to_a_monthly: 20,
        net_value_change_a: 0,
      },
      {
        id: 'swap-accept',
        value_a_to_b_monthly: 30,
        value_b_to_a_monthly: 31,
        net_value_change_a: 0.5,
      },
      {
        id: 'swap-manual',
        value_a_to_b_monthly: 30,
        value_b_to_a_monthly: 35,
        net_value_change_a: 2.5,
      },
    ] as any);

    vi.mocked(storage.updateSwapStatus).mockImplementation(async (id: string) => {
      if (id !== 'swap-accept') return null as any;
      return {
        id,
        location_a_to_b_id: 'loc-a',
        location_b_to_a_id: 'loc-b',
        provider_a_id: 'prov-a',
        provider_b_id: 'prov-b',
      } as any;
    });
    vi.mocked(storage.getLocationById).mockImplementation(async (id: string) => ({
      id,
      user_id: id === 'loc-a' ? 'user-a' : 'user-b',
      address: id === 'loc-a' ? '123 Main St' : '456 Oak St',
      collection_day: 'thursday',
    }) as any);
    vi.mocked(storage.getProviderById).mockImplementation(async (id: string) => ({
      id,
      name: id === 'prov-a' ? 'Provider A' : 'Provider B',
    }) as any);

    const result = await executeAutomaticSwaps();

    expect(result).toEqual({
      acceptedCount: 1,
      skippedMissingValue: 1,
      skippedLowConfidence: 1,
    });
    expect(storage.applySwapProviderReassignment).toHaveBeenCalledOnce();
    expect(storage.applySwapProviderReassignment).toHaveBeenCalledWith({
      locationAId: 'loc-a',
      newProviderForLocationA: 'prov-b',
      locationBId: 'loc-b',
      newProviderForLocationB: 'prov-a',
    });
    expect(sendProviderChangeNotification).toHaveBeenCalledTimes(2);
  });
});
