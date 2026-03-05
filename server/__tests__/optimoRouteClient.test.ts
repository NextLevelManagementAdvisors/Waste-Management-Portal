import { describe, it, expect, vi } from 'vitest';
import * as optimo from '../optimoRouteClient';

// Mock the fetch function
global.fetch = vi.fn();

function createFetchResponse(data: any) {
  return { json: () => new Promise((resolve) => resolve(data)), ok: true };
}

describe('optimoRouteClient', () => {
    it('should send the correct payload for updateDriverParamsBulk', async () => {
        const drivers = [
            { driver: { externalId: '001' }, date: '2022-02-15' },
            { driver: { serial: 'S002' }, date: '2022-02-16' },
        ];

        const fetchMock = createFetchResponse({ success: true, updates: [] });
        vi.mocked(global.fetch).mockResolvedValue(fetchMock as any);


        await optimo.updateDriverParamsBulk(drivers);

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/v1/update_drivers_parameters'),
            expect.objectContaining({
                body: JSON.stringify({ updates: drivers }),
            })
        );
    });
});
