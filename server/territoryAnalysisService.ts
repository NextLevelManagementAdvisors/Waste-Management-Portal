import { storage } from './storage';
// Swap generation imports this file dynamically at runtime, so these Turf modules
// must stay in production dependencies instead of relying on transitive installs.
import intersect from '@turf/intersect';
import area from '@turf/area';
import { polygon as turfPolygon, multiPolygon, point } from '@turf/helpers';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

interface Territory {
    id: string;
    provider_id: string;
    name: string;
    polygon_coords: any;
    geoJson?: any;
}

interface InefficientCustomer {
    locationId: string;
    address: string;
    currentProviderId: string;
    currentTerritoryId: string;
    potentialProviderId: string;
    potentialTerritoryId: string;
    inefficiencyScore: number; // For now, this can be a simple metric, e.g., 1 for being in an overlap
}

/**
 * Converts database polygon coordinates to a GeoJSON Polygon or MultiPolygon feature.
 */
function getGeoJson(territory: Territory) {
    if (territory.geoJson) return territory.geoJson;
    if (!territory.polygon_coords) return null;

    try {
        const ring = territory.polygon_coords.map((c: [number, number]) => [c[1], c[0]]);
        ring.push(ring[0]);
        territory.geoJson = turfPolygon([ring]);
        return territory.geoJson;
    } catch (e) {
        console.error(`Error creating polygon for territory ${territory.id}`, e);
        return null;
    }
}

/**
 * Finds all pairs of territories from different providers that overlap.
 */
async function findTerritoryOverlaps(territories: Territory[]): Promise<Map<string, any>> {
    const overlapMap = new Map<string, any>(); // Key: "provider1_id:provider2_id"

    for (let i = 0; i < territories.length; i++) {
        for (let j = i + 1; j < territories.length; j++) {
            const t1 = territories[i];
            const t2 = territories[j];

            if (t1.provider_id === t2.provider_id) continue;

            const poly1 = getGeoJson(t1);
            const poly2 = getGeoJson(t2);

            if (!poly1 || !poly2) continue;

            try {
                const intersection = intersect(poly1, poly2);
                if (intersection && area(intersection) > 0) {
                    const providerPairKey = [t1.provider_id, t2.provider_id].sort().join(':');
                    if (!overlapMap.has(providerPairKey)) {
                        overlapMap.set(providerPairKey, {
                            provider1: t1.provider_id,
                            provider2: t2.provider_id,
                            intersections: [],
                        });
                    }
                    overlapMap.get(providerPairKey)!.intersections.push({
                        territory1Id: t1.id,
                        territory2Id: t2.id,
                        intersectionArea: area(intersection),
                        intersectionGeoJson: intersection,
                    });
                }
            } catch (e) {
                // Turf.js can throw errors on complex/invalid geometries
                console.warn(`Could not calculate intersection between ${t1.id} and ${t2.id}`, e);
            }
        }
    }

    return overlapMap;
}

/**
 * Finds customers of a given provider that are located within a specific overlap area.
 */
async function findCustomersInOverlap(providerId: string, overlapGeoJson: any): Promise<any[]> {
    const locations = await storage.query(
        `SELECT id, address, provider_id, provider_territory_id, latitude, longitude
         FROM locations
         WHERE provider_id = $1 AND latitude IS NOT NULL AND longitude IS NOT NULL`,
        [providerId]
    );

    return locations.rows.filter(loc => {
        const pt = point([Number(loc.longitude), Number(loc.latitude)]);
        return booleanPointInPolygon(pt, overlapGeoJson);
    });
}

/**
 * Analyzes all provider territories to find inefficiently placed customers.
 * @returns A list of customers who could potentially be served more efficiently by another provider.
 */
export async function analyzeTerritoryOverlaps(): Promise<InefficientCustomer[]> {
    const territories: Territory[] = await storage.query(`SELECT id, provider_id, name, polygon_coords FROM provider_territories WHERE status='active' AND polygon_coords IS NOT NULL`).then(res => res.rows);
    const overlapMap = await findTerritoryOverlaps(territories);

    const inefficientCustomers: InefficientCustomer[] = [];

    for (const overlap of overlapMap.values()) {
        for (const intersection of overlap.intersections) {
            // Find Provider 1's customers in the overlap area
            const provider1Customers = await findCustomersInOverlap(overlap.provider1, intersection.intersectionGeoJson);
            for (const cust of provider1Customers) {
                inefficientCustomers.push({
                    locationId: cust.id,
                    address: cust.address,
                    currentProviderId: cust.provider_id,
                    currentTerritoryId: cust.provider_territory_id,
                    potentialProviderId: overlap.provider2,
                    potentialTerritoryId: intersection.territory2Id,
                    inefficiencyScore: 1, // Simple score for now
                });
            }

            // Find Provider 2's customers in the overlap area
            const provider2Customers = await findCustomersInOverlap(overlap.provider2, intersection.intersectionGeoJson);
            for (const cust of provider2Customers) {
                inefficientCustomers.push({
                    locationId: cust.id,
                    address: cust.address,
                    currentProviderId: cust.provider_id,
                    currentTerritoryId: cust.provider_territory_id,
                    potentialProviderId: overlap.provider1,
                    potentialTerritoryId: intersection.territory1Id,
                    inefficiencyScore: 1, // Simple score for now
                });
            }
        }
    }

    return inefficientCustomers;
}
