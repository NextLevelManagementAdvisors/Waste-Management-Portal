import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as optimo from '../optimoRouteClient';

// Mock the fetch function
global.fetch = vi.fn();

function createFetchResponse(data: any) {
  return { json: () => new Promise((resolve) => resolve(data)), ok: true };
}

describe('optimoRouteClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

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

    it('should adapt driver positions into updates grouped by driver', async () => {
        const positions: optimo.DriverPosition[] = [
            { driverSerial: 'DRV-1', latitude: 38.1, longitude: -78.2, timestamp: 1700000000, speed: 10 },
            { driverSerial: 'DRV-1', latitude: 38.2, longitude: -78.3, timestamp: 1700000300, accuracy: 5 },
            { driverExternalId: 'EXT-2', latitude: 39.1, longitude: -79.2, heading: 180 },
        ];

        const fetchMock = createFetchResponse({ success: true, updates: [] });
        vi.mocked(global.fetch).mockResolvedValue(fetchMock as any);

        await optimo.updateDriverPositions(positions);

        const call = vi.mocked(global.fetch).mock.calls.at(-1);
        expect(call).toBeTruthy();
        const [, init] = call!;
        const payload = JSON.parse(String((init as any).body));
        expect(payload.updates).toHaveLength(2);
        expect(payload.updates[0].driver).toEqual({ serial: 'DRV-1' });
        expect(payload.updates[0].positions).toHaveLength(2);
        expect(payload.updates[0].positions[0]).toMatchObject({
            latitude: 38.1,
            longitude: -78.2,
            timestamp: 1700000000,
            speed: 10,
        });
        expect(payload.updates[1].driver).toEqual({ externalId: 'EXT-2' });
        expect(payload.updates[1].positions[0]).toMatchObject({
            latitude: 39.1,
            longitude: -79.2,
            heading: 180,
        });
    });

    it('should reject position updates without driver identifiers', async () => {
        await expect(
            optimo.updateDriverPositions([{ latitude: 38.1, longitude: -78.2 } as any])
        ).rejects.toThrow(/requires driverExternalId or driverSerial/i);
    });
});
