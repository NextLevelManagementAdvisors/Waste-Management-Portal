import * as optimo from './optimoRouteClient';

export interface OptimoOrderSyncEntry<T = unknown> {
  bulkInput: optimo.BulkOrderInput;
  meta: T;
}

export interface OptimoOrderSyncSuccess<T = unknown> {
  entry: OptimoOrderSyncEntry<T>;
  orderNo: string;
  method: 'bulk' | 'single';
}

export interface OptimoOrderSyncFailure<T = unknown> {
  entry: OptimoOrderSyncEntry<T>;
  orderNo: string;
  method: 'bulk' | 'single';
  code?: string;
  message: string;
}

export function parseCoordinate(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function hasCoordinates(input: optimo.BulkOrderInput): boolean {
  return input.location.latitude != null && input.location.longitude != null;
}

function toCreateOrderInput(input: optimo.BulkOrderInput): optimo.CreateOrderInput {
  return {
    orderNo: input.orderNo,
    type: input.type || 'P',
    date: input.date,
    address: input.location.address,
    locationName: input.location.locationName,
    locationNo: input.location.locationNo,
    latitude: input.location.latitude,
    longitude: input.location.longitude,
    duration: input.duration,
    notes: input.notes,
    assignedTo: input.assignedTo,
    priority: input.priority,
    timeWindows: input.timeWindows,
    load1: input.load1,
    load2: input.load2,
    load3: input.load3,
    load4: input.load4,
    skills: input.skills,
    email: input.email,
    phone: input.phone,
    notificationPreference: input.notificationPreference,
    customField1: input.customField1,
    customField2: input.customField2,
    customField3: input.customField3,
    customField4: input.customField4,
    customField5: input.customField5,
    customFields: input.customFields,
  };
}

function normalizeBulkSyncResults(batchResults: any[] | any, inputs: Array<{ orderNo: string }>) {
  const batches = Array.isArray(batchResults) ? batchResults : [batchResults];
  const normalized: Array<{ success: boolean; orderNo: string; code?: string; message?: string }> = [];
  const chunkSize = 500;

  batches.forEach((batch, batchIndex) => {
    const chunkInputs = inputs.slice(batchIndex * chunkSize, (batchIndex + 1) * chunkSize);

    if (Array.isArray(batch?.orders) && batch.orders.length > 0) {
      const remainingOrderNos = chunkInputs.map(input => input.orderNo);

      for (const rawResult of batch.orders) {
        const fallbackOrderNo = remainingOrderNos.shift();
        const orderNo = rawResult?.orderNo || fallbackOrderNo || '';
        if (!orderNo) continue;

        const remainingIndex = remainingOrderNos.indexOf(orderNo);
        if (remainingIndex >= 0) remainingOrderNos.splice(remainingIndex, 1);

        normalized.push({
          success: rawResult?.success !== false,
          orderNo,
          code: rawResult?.code,
          message: rawResult?.message,
        });
      }

      for (const orderNo of remainingOrderNos) {
        normalized.push({
          success: batch?.success !== false,
          orderNo,
          code: batch?.code,
          message: batch?.message,
        });
      }
      return;
    }

    for (const input of chunkInputs) {
      normalized.push({
        success: batch?.success !== false,
        orderNo: input.orderNo,
        code: batch?.code,
        message: batch?.message,
      });
    }
  });

  return normalized;
}

function isLocationFailure(result: { code?: string; message?: string }): boolean {
  const haystack = `${result.code || ''} ${result.message || ''}`.toUpperCase();
  return /(LOC|GEO|ADDRESS|RESOLV|COORDINATE)/.test(haystack);
}

export async function syncOrdersWithFallback<T>(
  entries: Array<OptimoOrderSyncEntry<T>>
): Promise<{
  successes: Array<OptimoOrderSyncSuccess<T>>;
  failures: Array<OptimoOrderSyncFailure<T>>;
}> {
  const successes: Array<OptimoOrderSyncSuccess<T>> = [];
  const failures: Array<OptimoOrderSyncFailure<T>> = [];
  const singleQueue: Array<{ entry: OptimoOrderSyncEntry<T>; reason?: string }> = [];

  // Bulk sync is fastest when we already know the coordinates; create_order is the geocoding-safe fallback.
  const bulkEntries = entries.filter(entry => hasCoordinates(entry.bulkInput));
  const directSingleEntries = entries.filter(entry => !hasCoordinates(entry.bulkInput));
  singleQueue.push(...directSingleEntries.map(entry => ({ entry })));

  if (bulkEntries.length > 0) {
    try {
      const batchResults = await optimo.createOrUpdateOrders(bulkEntries.map(entry => entry.bulkInput));
      const resultByOrderNo = new Map(
        normalizeBulkSyncResults(batchResults, bulkEntries.map(entry => entry.bulkInput)).map(result => [result.orderNo, result])
      );

      for (const entry of bulkEntries) {
        const result = resultByOrderNo.get(entry.bulkInput.orderNo);
        if (!result) {
          singleQueue.push({
            entry,
            reason: 'OptimoRoute bulk sync returned no per-order result',
          });
          continue;
        }

        if (result.success !== false) {
          successes.push({
            entry,
            orderNo: entry.bulkInput.orderNo,
            method: 'bulk',
          });
          continue;
        }

        if (isLocationFailure(result)) {
          singleQueue.push({
            entry,
            reason: result.message || result.code || 'OptimoRoute rejected the bulk order',
          });
          continue;
        }

        failures.push({
          entry,
          orderNo: entry.bulkInput.orderNo,
          method: 'bulk',
          code: result.code,
          message: result.message || result.code || 'OptimoRoute rejected the order',
        });
      }
    } catch (error: any) {
      for (const entry of bulkEntries) {
        singleQueue.push({
          entry,
          reason: `Bulk create_or_update_orders failed: ${error?.message || 'Unknown error'}`,
        });
      }
    }
  }

  for (const queued of singleQueue) {
    try {
      await optimo.createOrder(toCreateOrderInput(queued.entry.bulkInput));
      successes.push({
        entry: queued.entry,
        orderNo: queued.entry.bulkInput.orderNo,
        method: 'single',
      });
    } catch (error: any) {
      failures.push({
        entry: queued.entry,
        orderNo: queued.entry.bulkInput.orderNo,
        method: 'single',
        message: queued.reason
          ? `${queued.reason}; fallback create_order failed: ${error?.message || 'Unknown error'}`
          : error?.message || 'Unknown error',
      });
    }
  }

  return { successes, failures };
}
