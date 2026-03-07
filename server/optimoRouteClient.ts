const API_KEY = process.env.OPTIMOROUTE_API_KEY || '';
const BASE_URL = 'https://api.optimoroute.com/v1';

// ── Data interfaces ──

export interface OptimoOrder {
  id?: string;
  orderNo: string;
  date: string;
  type?: string; // D=Delivery, P=Pickup, T=Task
  location?: {
    locationNo?: string;
    address?: string;
    locationName?: string;
    latitude?: number;
    longitude?: number;
    valid?: boolean;
    notes?: string;
  };
  timeWindows?: { twFrom: string; twTo: string }[];
  assignedTo?: { externalId?: string; serial?: string };
  notes?: string;
  duration?: number;
  priority?: string; // L, M, H, C
  load1?: number;
  load2?: number;
  load3?: number;
  load4?: number;
  email?: string;
  phone?: string;
  customField1?: string;
  customField2?: string;
  customField3?: string;
  customField4?: string;
  customField5?: string;
  customFields?: Record<string, any>;
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

export interface OptimoTimeObject {
  unixTimestamp: number;
  utcTime: string;
  localTime: string;
}

export interface CompletionForm {
  note?: string;
  signature?: { type: string; url: string };
  images?: { type: string; url: string }[];
  barcode?: { barcode: string; scanInfo?: { status: string; scanned?: string; type?: string } }[];
  barcode_collections?: any[];
}

export interface CompletionDetail {
  orderNo: string;
  id?: string;
  success?: boolean;
  code?: string;
  message?: string;
  data?: {
    status?: string; // unscheduled | scheduled | on_route | servicing | success | failed | rejected | cancelled
    startTime?: OptimoTimeObject;
    endTime?: OptimoTimeObject;
    form?: CompletionForm;
    tracking_url?: string;
  };
  // Legacy flat fields (from our existing helper functions)
  status?: string;
  completionTime?: string;
  completionTimeDt?: string;
  driverName?: string;
  notes?: string;
}

export interface RouteStop {
  stopNumber?: number;
  orderNo: string;
  id?: string;
  locationNo?: string;
  locationName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  scheduledAt?: string;
  scheduledAtDt?: string;
  arrivalTimeDt?: string;
  travelTime?: number; // seconds from previous stop
  distance?: number; // meters from previous stop
  type?: string; // 'break' | 'depot'
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
  vehicleRegistration?: string;
  vehicleLabel?: string;
  duration?: number; // total route time in minutes
  distance?: number; // total distance in km
  load1?: number;
  load2?: number;
  load3?: number;
  load4?: number;
  stops?: RouteStop[];
  routePolyline?: string;
  [key: string]: any;
}

// ── Planning interfaces ──

export interface SelectedDriver {
  driverExternalId?: string;
  driverSerial?: string;
}

export interface PlanningOptions {
  date?: string;
  dateRange?: { from: string; to: string };
  balancing?: 'OFF' | 'ON' | 'ON_FORCE';
  balanceBy?: 'WT' | 'NUM';
  balancingFactor?: number;
  startWith?: 'EMPTY' | 'CURRENT';
  lockType?: 'NONE' | 'ROUTES' | 'RESOURCES';
  depotTrips?: boolean;
  depotVisitDuration?: number;
  clustering?: boolean;
  useDrivers?: SelectedDriver[];
  useOrders?: string[];
  includeScheduledOrders?: boolean;
}

export interface PlanningResult {
  success: boolean;
  code?: string;
  planningId?: number;
  missingOrders?: string[];
  missingDrivers?: SelectedDriver[];
  ordersWithInvalidLocation?: string[];
}

export interface PlanningStatus {
  success: boolean;
  code?: string;
  status?: 'N' | 'R' | 'C' | 'F' | 'E'; // New, Running, Cancelled, Finished, Error
  percentageComplete?: number;
}

// ── Event interfaces ──

export interface DriverEvent {
  event: 'on_duty' | 'off_duty' | 'start_service' | 'success' | 'failed' | 'rejected' | 'start_route' | 'end_route' | 'start_time_changed';
  unixTimestamp: number;
  utcTime: string;
  localTime: string;
  driverName?: string;
  driverSerial?: string;
  driverExternalId?: string;
  orderNo?: string;
  orderId?: string;
  plannedStartTime?: OptimoTimeObject;
}

export interface EventsResult {
  success: boolean;
  events: DriverEvent[];
  tag: string;
  remainingEvents: number;
}

// ── Route query options ──

export interface GetRoutesOptions {
  date: string;
  includeRoutePolyline?: boolean;
  includeRouteStartEnd?: boolean;
  driverSerial?: string;
  driverExternalId?: string;
  vehicleRegistration?: string;
}

// ── Order creation input (all fields) ──

export interface CreateOrderInput {
  orderNo: string;
  type: 'D' | 'P' | 'T';
  date: string;
  address: string;
  locationName?: string;
  locationNo?: string;
  latitude?: number;
  longitude?: number;
  duration?: number;
  notes?: string;
  assignedTo?: { externalId?: string; serial?: string };
  priority?: 'L' | 'M' | 'H' | 'C';
  timeWindows?: { twFrom: string; twTo: string }[];
  load1?: number;
  load2?: number;
  load3?: number;
  load4?: number;
  skills?: string[];
  email?: string;
  phone?: string;
  notificationPreference?: string;
  customField1?: string;
  customField2?: string;
  customField3?: string;
  customField4?: string;
  customField5?: string;
  customFields?: Record<string, any>;
}

// ── Bulk order input (for create_or_update_orders) ──

export interface BulkOrderInput {
  orderNo: string;
  type?: 'D' | 'P' | 'T';
  date: string;
  location: {
    address: string;
    locationName?: string;
    locationNo?: string;
    latitude?: number;
    longitude?: number;
    notes?: string;
  };
  duration?: number;
  notes?: string;
  assignedTo?: { externalId?: string; serial?: string };
  priority?: 'L' | 'M' | 'H' | 'C';
  timeWindows?: { twFrom: string; twTo: string }[];
  load1?: number;
  load2?: number;
  load3?: number;
  load4?: number;
  skills?: string[];
  email?: string;
  phone?: string;
  notificationPreference?: string;
  customField1?: string;
  customField2?: string;
  customField3?: string;
  customField4?: string;
  customField5?: string;
  customFields?: Record<string, any>;
}

// ── Driver position interface ──

export interface DriverPosition {
  driverSerial?: string;
  driverExternalId?: string;
  latitude: number;
  longitude: number;
  timestamp?: number;
}

// ── Driver parameter interfaces ──

export interface DriverParameters {
  externalId?: string;
  serial?: string;
  date: string;
  enabled?: boolean;
  workTimeFrom?: string;
  workTimeTo?: string;
  assignedVehicle?: string;
  vehicleCapacity1?: number;
  vehicleCapacity2?: number;
  vehicleCapacity3?: number;
  vehicleCapacity4?: number;
  startLatitude?: number;
  startLongitude?: number;
  endLatitude?: number;
  endLongitude?: number;
}

// ── Completion update interfaces ──

export interface CompletionUpdate {
  orderNo?: string;
  id?: string;
  data: {
    status: string;
    startTime?: { unixTimestamp?: number; utcTime?: string; localTime?: string };
    endTime?: { unixTimestamp?: number; utcTime?: string; localTime?: string };
  };
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

export async function getRoutes(dateOrOptions: string | GetRoutesOptions): Promise<{ routes: Route[] }> {
  const opts = typeof dateOrOptions === 'string' ? { date: dateOrOptions } : dateOrOptions;
  const params: Record<string, string> = { date: opts.date };
  if (opts.includeRoutePolyline) params.includeRoutePolyline = 'true';
  if (opts.includeRouteStartEnd) params.includeRouteStartEnd = 'true';
  if (opts.driverSerial) params.driverSerial = opts.driverSerial;
  if (opts.driverExternalId) params.driverExternalId = opts.driverExternalId;
  if (opts.vehicleRegistration) params.vehicleRegistration = opts.vehicleRegistration;
  return apiGet('get_routes', params);
}

export async function getSchedulingInfo(orderNo: string): Promise<{ success: boolean; orderScheduled: boolean; scheduleInformation?: ScheduleInfo }> {
  return apiGet('get_scheduling_info', { orderNo });
}

export async function getCompletionDetails(orderNos: string[]): Promise<any> {
  return apiPost('get_completion_details', {
    orders: orderNos.map(orderNo => ({ orderNo })),
  });
}

export async function createOrder(data: CreateOrderInput): Promise<any> {
  const body: any = {
    operation: 'CREATE',
    orderNo: data.orderNo,
    type: data.type,
    date: data.date,
    location: {
      address: data.address,
      locationName: data.locationName || '',
      ...(data.locationNo && { locationNo: data.locationNo }),
      ...(data.latitude != null && { latitude: data.latitude }),
      ...(data.longitude != null && { longitude: data.longitude }),
    },
    duration: data.duration || 15,
    notes: data.notes || '',
  };
  if (data.assignedTo) body.assignedTo = data.assignedTo;
  if (data.priority) body.priority = data.priority;
  if (data.timeWindows?.length) body.timeWindows = data.timeWindows;
  if (data.load1 != null) body.load1 = data.load1;
  if (data.load2 != null) body.load2 = data.load2;
  if (data.load3 != null) body.load3 = data.load3;
  if (data.load4 != null) body.load4 = data.load4;
  if (data.skills?.length) body.skills = data.skills;
  if (data.email) body.email = data.email;
  if (data.phone) body.phone = data.phone;
  if (data.notificationPreference) body.notificationPreference = data.notificationPreference;
  if (data.customField1) body.customField1 = data.customField1;
  if (data.customField2) body.customField2 = data.customField2;
  if (data.customField3) body.customField3 = data.customField3;
  if (data.customField4) body.customField4 = data.customField4;
  if (data.customField5) body.customField5 = data.customField5;
  if (data.customFields) body.customFields = data.customFields;
  return apiPost('create_order', body);
}

// ── New API functions ──

export async function getOrders(identifiers: string[], byId = false): Promise<any> {
  return apiPost('get_orders', {
    orders: identifiers.map(val => byId ? { id: val } : { orderNo: val }),
  });
}

export async function deleteOrder(orderNo: string, forceDelete = false): Promise<{ success: boolean; code?: string; message?: string }> {
  return apiPost('delete_order', { orderNo, forceDelete });
}

export async function updateOrder(orderNo: string, data: Partial<Omit<CreateOrderInput, 'orderNo' | 'type'>>): Promise<any> {
  const body: any = { operation: 'MERGE', orderNo };
  if (data.date) body.date = data.date;
  if (data.notes) body.notes = data.notes;
  if (data.address) body.location = { address: data.address, ...(data.locationName && { locationName: data.locationName }) };
  if (data.duration != null) body.duration = data.duration;
  if (data.assignedTo) body.assignedTo = data.assignedTo;
  if (data.priority) body.priority = data.priority;
  if (data.timeWindows?.length) body.timeWindows = data.timeWindows;
  if (data.load1 != null) body.load1 = data.load1;
  if (data.load2 != null) body.load2 = data.load2;
  if (data.load3 != null) body.load3 = data.load3;
  if (data.load4 != null) body.load4 = data.load4;
  if (data.skills?.length) body.skills = data.skills;
  if (data.email) body.email = data.email;
  if (data.phone) body.phone = data.phone;
  if (data.notificationPreference) body.notificationPreference = data.notificationPreference;
  if (data.customField1) body.customField1 = data.customField1;
  if (data.customField2) body.customField2 = data.customField2;
  if (data.customField3) body.customField3 = data.customField3;
  if (data.customField4) body.customField4 = data.customField4;
  if (data.customField5) body.customField5 = data.customField5;
  if (data.customFields) body.customFields = data.customFields;
  return apiPost('create_order', body);
}

export async function startPlanning(opts: PlanningOptions): Promise<PlanningResult> {
  return apiPost('start_planning', opts);
}

export async function stopPlanning(planningId: number): Promise<{ success: boolean; code?: string }> {
  return apiPost('stop_planning', { planningId });
}

export async function getPlanningStatus(planningId: number): Promise<PlanningStatus> {
  return apiGet('get_planning_status', { planningId: String(planningId) });
}

export async function getEvents(afterTag?: string): Promise<EventsResult> {
  const params: Record<string, string> = {};
  if (afterTag !== undefined) params.after_tag = afterTag;
  return apiGet('get_events', params);
}

export async function getCompletionDetailsFull(identifiers: string[], byId = false): Promise<any> {
  return apiPost('get_completion_details', {
    orders: identifiers.map(val => byId ? { id: val } : { orderNo: val }),
  });
}

export async function updateCompletionDetails(updates: CompletionUpdate[]): Promise<any> {
  return apiPost('update_completion_details', { updates });
}

export async function updateDriverParams(params: DriverParameters): Promise<{ success: boolean; code?: string }> {
  return apiPost('update_driver_parameters', params);
}

export async function updateDriverParamsBulk(drivers: any[]): Promise<any> {
  return apiPost('update_drivers_parameters', { updates: drivers });
}

// ── Bulk order operations ──

export async function createOrUpdateOrders(orders: BulkOrderInput[]): Promise<any[]> {
  const CHUNK_SIZE = 500;
  const results: any[] = [];
  for (let i = 0; i < orders.length; i += CHUNK_SIZE) {
    const chunk = orders.slice(i, i + CHUNK_SIZE);
    const result = await apiPost('create_or_update_orders', { orders: chunk });
    results.push(result);
  }
  return results;
}

export async function deleteOrders(orderNos: string[], forceDelete = false): Promise<any[]> {
  const CHUNK_SIZE = 500;
  const results: any[] = [];
  for (let i = 0; i < orderNos.length; i += CHUNK_SIZE) {
    const chunk = orderNos.slice(i, i + CHUNK_SIZE);
    const result = await apiPost('delete_orders', {
      orders: chunk.map(orderNo => ({ orderNo })),
      deleteMultiple: true,
      forceDelete,
    });
    results.push(result);
  }
  return results;
}

export async function deleteAllOrders(date?: string): Promise<{ success: boolean }> {
  const body: any = {};
  if (date) body.date = date;
  return apiPost('delete_all_orders', body);
}

// ── Driver GPS positions ──

export async function updateDriverPositions(positions: DriverPosition[]): Promise<{ success: boolean }> {
  return apiPost('update_drivers_positions', { drivers: positions });
}

// ── Existing helper functions ──

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
      const cStatus = completion?.data?.status;
      let status = 'scheduled';
      if (cStatus === 'success') {
        status = 'completed';
      } else if (cStatus === 'failed' || cStatus === 'rejected') {
        status = 'missed';
      } else if (new Date(order.date) < today) {
        status = cStatus || 'completed';
      }

      return {
        orderNo: order.orderNo,
        date: order.date,
        status,
        driverName: completion?.driverName,
        completionTime: completion?.data?.endTime?.localTime || completion?.data?.endTime?.utcTime,
        notes: completion?.notes,
      };
    }).sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error('[OptimoRoute] Error getting completion history:', error);
    return [];
  }
}
