import { pool } from '../server/db.js';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint, polygon as turfPolygon } from '@turf/helpers';
import distance from '@turf/distance';
import { geocodeAddress } from '../server/routeSuggestionService.js';
export class ZoneService {
    /**
     * Finds all active custom zones that contain a given geographic location.
     *
     * @param latitude - The latitude of the location to check.
     * @param longitude - The longitude of the location to check.
     * @returns A promise that resolves to an array of DriverCustomZone objects.
     */
    async findZonesForLocation(latitude, longitude) {
        const client = await pool.connect();
        try {
            const geoResult = await geocodeAddress(`${latitude},${longitude}`);
            const locationPostalCode = geoResult?.postalCode;
            const result = await client.query(`SELECT id, driver_id, name, zone_type, polygon_coords, center_lat, center_lng, radius_miles, zip_codes, status, pickup_day
         FROM driver_custom_zones
         WHERE status = 'active'`);
            const zones = result.rows;
            const zonesContainingPoint = [];
            const locationPoint = turfPoint([longitude, latitude]);
            for (const zone of zones) {
                let isMatch = false;
                switch (zone.zone_type) {
                    case 'polygon':
                        if (zone.polygon_coords?.coordinates) {
                            const zonePolygon = turfPolygon(zone.polygon_coords.coordinates);
                            isMatch = booleanPointInPolygon(locationPoint, zonePolygon);
                        }
                        break;
                    case 'circle':
                        if (zone.center_lat && zone.center_lng && zone.radius_miles) {
                            const centerPoint = turfPoint([parseFloat(zone.center_lng), parseFloat(zone.center_lat)]);
                            const dist = distance(locationPoint, centerPoint, { units: 'miles' });
                            isMatch = dist <= parseFloat(zone.radius_miles);
                        }
                        break;
                    case 'zip':
                        if (locationPostalCode && zone.zip_codes?.includes(locationPostalCode)) {
                            isMatch = true;
                        }
                        break;
                }
                if (isMatch) {
                    zonesContainingPoint.push(zone);
                }
            }
            return zonesContainingPoint;
        }
        catch (error) {
            console.error('Error finding zones for location:', error);
            throw error;
        }
        finally {
            client.release();
        }
    }
}
export const zoneService = new ZoneService();
