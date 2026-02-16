const API_KEY = process.env.OPTIMOROUTE_API_KEY || '';
const BASE_URL = 'https://api.optimoroute.com/v1';

export interface OptimoOrder {
  id?: string;
  orderNo: string;
  date: string;
  type?: string;
  location?: {
    locationNo?: string;
    address?: string;
    locationName?: string;
    latitude?: number;
    longitude?: number;
    notes?: string;
  };
  timeWindows?: { twFrom: string; twTo: string }[];
  assignedTo?: { externalId?: string; serial?: string };
  notes?: string;
  duration?: number;
  customField1?: string;
  customField2?: string;
  customField3?: string;
  customField4?: string;
  customField5?: string;
}

export interface ScheduleInfo {
  stopNumber: number;
  scheduledAt: string;
  scheduledAtDt: string;
  arrivalTimeDt?: string;
  driverSerial: string;
  driverExternalId?: string;
  driverName: string;
  vehicleLabel?: string;
  distance?: number;
  travelTime?: number;
}

export interface CompletionDetail {
  orderNo: string;
  id?: string;
  status?: string;
  completionTime?: string;
  completionTimeDt?: string;
  driverName?: string;
  notes?: string;
  data?: any;
}

export interface RouteStop {
  orderNo: string;
  id?: string;
  scheduledAt?: string;
  scheduledAtDt?: string;
  location?: {
    address?: string;
    locationName?: string;
    latitude?: number;
    longitude?: number;
  };
  [key: string]: any;
}

export interface Route {
  driverSerial?: string;
  driverName?: string;
  driverExternalId?: string;
  stops?: RouteStop[];
  [key: string]: any;
}

async function apiGet(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set('key', API_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OptimoRoute API error (${res.status}): ${text}`);
  }
  return res.json();
}

async function apiPost(endpoint: string, body: any): Promise<any> {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set('key', API_KEY);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OptimoRoute API error (${res.status}): ${text}`);
  }
  return res.json();
}

export async function searchOrders(from: string, to: string, includeOrderData = true): Promise<any> {
  return apiPost('search_orders', {
    dateRange: { from, to },
    includeOrderData,
  });
}

export async function getRoutes(date: string): Promise<{ routes: Route[] }> {
  return apiGet('get_routes', { date });
}

export async function getSchedulingInfo(orderNo: string): Promise<{ success: boolean; orderScheduled: boolean; scheduleInformation?: ScheduleInfo }> {
  return apiGet('get_scheduling_info', { orderNo });
}

export async function getCompletionDetails(orderNos: string[]): Promise<any> {
  return apiPost('get_completion_details', {
    orders: orderNos.map(orderNo => ({ orderNo })),
  });
}

export async function createOrder(data: {
  orderNo: string;
  type: 'D' | 'P' | 'T';
  date: string;
  address: string;
  locationName?: string;
  duration?: number;
  notes?: string;
}): Promise<any> {
  return apiPost('create_order', {
    operation: 'CREATE',
    orderNo: data.orderNo,
    type: data.type,
    date: data.date,
    location: {
      address: data.address,
      locationName: data.locationName || '',
    },
    duration: data.duration || 15,
    notes: data.notes || '',
  });
}

export async function findOrdersForAddress(address: string, fromDate: string, toDate: string): Promise<OptimoOrder[]> {
  try {
    const result = await searchOrders(fromDate, toDate, true);
    if (!result?.orders) return [];
    const normalizedAddress = address.toLowerCase().trim();
    return result.orders.filter((order: OptimoOrder) => {
      const orderAddr = order.location?.address?.toLowerCase().trim() || '';
      return orderAddr.includes(normalizedAddress) || normalizedAddress.includes(orderAddr);
    });
  } catch (error) {
    console.error('[OptimoRoute] Error searching orders:', error);
    return [];
  }
}

export async function getNextPickupForAddress(address: string): Promise<{
  date: string;
  scheduledAt?: string;
  driverName?: string;
  timeWindow?: { start: string; end: string };
  status?: string;
} | null> {
  try {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 14);
    const fromStr = today.toISOString().split('T')[0];
    const toStr = futureDate.toISOString().split('T')[0];

    const orders = await findOrdersForAddress(address, fromStr, toStr);
    if (orders.length === 0) return null;

    orders.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const nextOrder = orders[0];

    let schedInfo: ScheduleInfo | undefined;
    try {
      const schedResult = await getSchedulingInfo(nextOrder.orderNo);
      if (schedResult.success && schedResult.orderScheduled) {
        schedInfo = schedResult.scheduleInformation;
      }
    } catch {}

    let timeWindow: { start: string; end: string } | undefined;
    if (nextOrder.timeWindows && nextOrder.timeWindows.length > 0) {
      timeWindow = {
        start: nextOrder.timeWindows[0].twFrom,
        end: nextOrder.timeWindows[0].twTo,
      };
    }

    return {
      date: nextOrder.date,
      scheduledAt: schedInfo?.scheduledAt,
      driverName: schedInfo?.driverName,
      timeWindow,
      status: 'scheduled',
    };
  } catch (error) {
    console.error('[OptimoRoute] Error getting next pickup:', error);
    return null;
  }
}

export async function getCompletionHistoryForAddress(address: string, weeks = 12): Promise<Array<{
  orderNo: string;
  date: string;
  status: string;
  driverName?: string;
  completionTime?: string;
  notes?: string;
}>> {
  try {
    const today = new Date();
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - (weeks * 7));
    const fromStr = pastDate.toISOString().split('T')[0];
    const toStr = today.toISOString().split('T')[0];

    const orders = await findOrdersForAddress(address, fromStr, toStr);
    if (orders.length === 0) return [];

    const orderNos = orders.map(o => o.orderNo);

    let completionData: any = { orders: [] };
    try {
      completionData = await getCompletionDetails(orderNos);
    } catch {}

    const completionMap = new Map<string, any>();
    if (completionData?.orders) {
      for (const c of completionData.orders) {
        completionMap.set(c.orderNo, c);
      }
    }

    return orders.map(order => {
      const completion = completionMap.get(order.orderNo);
      let status = 'scheduled';
      if (completion?.status === 'completed' || completion?.status === 'success') {
        status = 'completed';
      } else if (completion?.status === 'failed' || completion?.status === 'rejected') {
        status = 'missed';
      } else if (new Date(order.date) < today) {
        status = completion ? (completion.status || 'completed') : 'completed';
      }

      return {
        orderNo: order.orderNo,
        date: order.date,
        status,
        driverName: completion?.driverName,
        completionTime: completion?.completionTime || completion?.completionTimeDt,
        notes: completion?.notes,
      };
    }).sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error('[OptimoRoute] Error getting completion history:', error);
    return [];
  }
}
