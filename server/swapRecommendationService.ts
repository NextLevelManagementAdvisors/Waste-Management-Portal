import { storage } from './storage';
import { analyzeTerritoryOverlaps } from './territoryAnalysisService';

const VALUE_TOLERANCE = 5.00; // Allow swaps where monthly value differs by up to $5.00

interface GenerateSummary {
    generated: number;
    skippedNoCounterpart: number;
    skippedMissingValue: number;
    skippedOutsideTolerance: number;
}

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
export async function generateSwapRecommendations(): Promise<{ recommendations: any[]; summary: GenerateSummary }> {
    const inefficientCustomers = await analyzeTerritoryOverlaps();
    const customerGroups = groupCrossoverCustomers(inefficientCustomers);

    const processedProviders = new Set<string>();
    const createdRecommendations: any[] = [];
    const summary: GenerateSummary = {
        generated: 0,
        skippedNoCounterpart: 0,
        skippedMissingValue: 0,
        skippedOutsideTolerance: 0,
    };

    for (const [key, groupAtoB] of customerGroups.entries()) {
        const [providerA, providerB] = key.split(':');
        const reverseKey = `${providerB}:${providerA}`;

        // Ensure we only process each pair of providers once
        if (processedProviders.has(key) || processedProviders.has(reverseKey)) {
            continue;
        }

        const groupBtoA = customerGroups.get(reverseKey) || [];
        if (groupBtoA.length === 0) {
            summary.skippedNoCounterpart += groupAtoB.length;
            continue;
        }

        // Add deterministic monthly value to each customer object.
        for (const cust of groupAtoB) {
            cust.value = await storage.getLocationMonthlyValue(cust.locationId);
        }
        for (const cust of groupBtoA) {
            cust.value = await storage.getLocationMonthlyValue(cust.locationId);
        }

        const validAtoB = groupAtoB.filter(c => Number(c.value || 0) > 0);
        const validBtoA = groupBtoA.filter(c => Number(c.value || 0) > 0);
        summary.skippedMissingValue += (groupAtoB.length - validAtoB.length) + (groupBtoA.length - validBtoA.length);
        if (validAtoB.length === 0 || validBtoA.length === 0) {
            summary.skippedNoCounterpart += validAtoB.length + validBtoA.length;
            processedProviders.add(key);
            continue;
        }

        const unprocessedBtoA = new Set(validBtoA);

        // For each customer in A->B, find the best match in B->A
        for (const custA of validAtoB) {
            let bestMatch: any | null = null;
            let smallestDiff = Infinity;

            for (const custB of unprocessedBtoA) {
                const diff = Math.abs(custA.value - custB.value);
                if (diff < smallestDiff) {
                    smallestDiff = diff;
                    bestMatch = custB;
                }
            }

            if (!bestMatch) {
                summary.skippedNoCounterpart++;
                continue;
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
                summary.generated++;

                // Remove the matched customer from the pool
                unprocessedBtoA.delete(bestMatch);
            } else {
                summary.skippedOutsideTolerance++;
            }
        }

        processedProviders.add(key);
    }

    console.log(`[SwapEngine] Generated ${createdRecommendations.length} new swap recommendations.`);
    return { recommendations: createdRecommendations, summary };
}

/**
 * Finds and executes swaps that are safe to be automatically accepted.
 */
export async function executeAutomaticSwaps() {
    const CONFIDENCE_THRESHOLD = 1.00; // Auto-accept if net value change is less than $1.00
    const pendingSwaps = await storage.getPendingSwaps();

    let acceptedCount = 0;
    let skippedMissingValue = 0;
    let skippedLowConfidence = 0;

    for (const swap of pendingSwaps) {
        if (Number(swap.value_a_to_b_monthly || 0) <= 0 || Number(swap.value_b_to_a_monthly || 0) <= 0) {
            skippedMissingValue++;
            continue;
        }

        if (Math.abs(Number(swap.net_value_change_a || 0)) <= CONFIDENCE_THRESHOLD) {
            const updatedSwap = await storage.updateSwapStatus(swap.id, 'accepted', null); // null reviewer for automated
            if (updatedSwap) {
                await storage.applySwapProviderReassignment({
                    locationAId: updatedSwap.location_a_to_b_id,
                    newProviderForLocationA: updatedSwap.provider_b_id,
                    locationBId: updatedSwap.location_b_to_a_id,
                    newProviderForLocationB: updatedSwap.provider_a_id,
                });
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
        } else {
            skippedLowConfidence++;
        }
    }

    if (acceptedCount > 0) {
        console.log(`[SwapEngine] Automatically accepted ${acceptedCount} swaps.`);
    }

    return { acceptedCount, skippedMissingValue, skippedLowConfidence };
}
