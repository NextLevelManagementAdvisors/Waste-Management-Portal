import { storage } from './storage';
import { analyzeTerritoryOverlaps } from './territoryAnalysisService';

const VALUE_TOLERANCE = 5.00; // Allow swaps where monthly value differs by up to $5.00

/**
 * Groups inefficient customers by the direction of potential transfer.
 * @returns A map where keys are "providerA_id:providerB_id" and values are lists of customers.
 */
function groupCrossoverCustomers(inefficientCustomers: any[]) {
    const groups = new Map<string, any[]>();
    for (const cust of inefficientCustomers) {
        const key = `${cust.currentProviderId}:${cust.potentialProviderId}`;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(cust);
    }
    return groups;
}

/**
 * Generates 1-to-1 swap recommendations for providers with overlapping territories.
 * This is a "greedy" algorithm that finds the first acceptable match.
 */
export async function generateSwapRecommendations() {
    const inefficientCustomers = await analyzeTerritoryOverlaps();
    const customerGroups = groupCrossoverCustomers(inefficientCustomers);

    const processedProviders = new Set<string>();
    const createdRecommendations: any[] = [];

    for (const [key, groupAtoB] of customerGroups.entries()) {
        const [providerA, providerB] = key.split(':');
        const reverseKey = `${providerB}:${providerA}`;

        // Ensure we only process each pair of providers once
        if (processedProviders.has(key) || processedProviders.has(reverseKey)) {
            continue;
        }

        const groupBtoA = customerGroups.get(reverseKey) || [];
        if (groupBtoA.length === 0) {
            continue;
        }

        // Add value to each customer object
        for (const cust of groupAtoB) {
            cust.value = await storage.getLocationValue(cust.locationId);
        }
        for (const cust of groupBtoA) {
            cust.value = await storage.getLocationValue(cust.locationId);
        }

        const unprocessedBtoA = new Set(groupBtoA);

        // For each customer in A->B, find the best match in B->A
        for (const custA of groupAtoB) {
            let bestMatch: any | null = null;
            let smallestDiff = Infinity;

            for (const custB of unprocessedBtoA) {
                const diff = Math.abs(custA.value - custB.value);
                if (diff < smallestDiff) {
                    smallestDiff = diff;
                    bestMatch = custB;
                }
            }

            // If a suitable match is found within the tolerance, create a recommendation
            if (bestMatch && smallestDiff <= VALUE_TOLERANCE) {
                const recommendation = await storage.createSwapRecommendation({
                    providerAId: providerA,
                    providerBId: providerB,
                    locationAtoBId: custA.locationId,
                    locationBtoAId: bestMatch.locationId,
                    valueAtoB: custA.value,
                    valueBtoA: bestMatch.value,
                });
                createdRecommendations.push(recommendation);

                // Remove the matched customer from the pool
                unprocessedBtoA.delete(bestMatch);
            }
        }

        processedProviders.add(key);
    }

    console.log(`[SwapEngine] Generated ${createdRecommendations.length} new swap recommendations.`);
    return createdRecommendations;
}

/**
 * Finds and executes swaps that are safe to be automatically accepted.
 */
export async function executeAutomaticSwaps() {
    const CONFIDENCE_THRESHOLD = 1.00; // Auto-accept if net value change is less than $1.00
    const pendingSwaps = await storage.getPendingSwaps();

    let acceptedCount = 0;

    for (const swap of pendingSwaps) {
        if (Math.abs(swap.net_value_change_a) <= CONFIDENCE_THRESHOLD) {
            const updatedSwap = await storage.updateSwapStatus(swap.id, 'accepted', null); // null reviewer for automated
            if (updatedSwap) {
                await storage.updateLocation(updatedSwap.location_a_to_b_id, { provider_id: updatedSwap.provider_b_id });
                await storage.updateLocation(updatedSwap.location_b_to_a_id, { provider_id: updatedSwap.provider_a_id });
                acceptedCount++;
                console.log(`[SwapEngine] Automatically accepted swap ${swap.id}.`);

                // Notify customers
                try {
                    const { sendProviderChangeNotification } = await import('./notificationService');
                    const locA = await storage.getLocationById(updatedSwap.location_a_to_b_id);
                    const locB = await storage.getLocationById(updatedSwap.location_b_to_a_id);
                    const providerA = await storage.getProviderById(updatedSwap.provider_a_id);
                    const providerB = await storage.getProviderById(updatedSwap.provider_b_id);

                    if (locA && providerA && providerB) {
                        sendProviderChangeNotification(locA.user_id, locA.address, providerA.name, providerB.name, locA.collection_day || 'their usual day');
                    }
                    if (locB && providerA && providerB) {
                        sendProviderChangeNotification(locB.user_id, locB.address, providerB.name, providerA.name, locB.collection_day || 'their usual day');
                    }
                } catch (notifyErr) {
                    console.error('[Swap] Failed to send customer notifications for auto-swap:', notifyErr);
                }
            }
        }
    }

    if (acceptedCount > 0) {
        console.log(`[SwapEngine] Automatically accepted ${acceptedCount} swaps.`);
    }

    return { acceptedCount };
}
