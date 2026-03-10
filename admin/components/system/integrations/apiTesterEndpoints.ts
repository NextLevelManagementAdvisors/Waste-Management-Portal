export interface ApiTesterField {
  name: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'json';
  required: boolean;
  placeholder?: string;
  defaultValue?: string;
}

export interface ProxyRequest {
  endpoint: string;
  method: 'GET' | 'POST';
  params?: Record<string, string>;
  body?: any;
}

export interface ApiTesterEndpoint {
  id: string;
  category: 'orders' | 'planning' | 'drivers' | 'tracking';
  label: string;
  method: 'GET' | 'POST';
  optimoEndpoint: string;
  description: string;
  fields: ApiTesterField[];
  destructive?: boolean;
  createsTestData?: boolean;
  buildRequest: (values: Record<string, string>) => ProxyRequest;
}

const today = () => new Date().toISOString().split('T')[0];
export const TEST_PREFIX = '_TEST_';
export const testOrderNo = () => `${TEST_PREFIX}${Date.now()}`;

export const CATEGORIES = [
  { id: 'orders' as const, label: 'Orders' },
  { id: 'planning' as const, label: 'Planning' },
  { id: 'drivers' as const, label: 'Drivers' },
  { id: 'tracking' as const, label: 'Tracking' },
];

export const ENDPOINTS: ApiTesterEndpoint[] = [
  // ── Orders ──
  {
    id: 'create_order',
    category: 'orders',
    label: 'Create Order',
    method: 'POST',
    optimoEndpoint: 'create_order',
    description: 'Create or update a single order',
    createsTestData: true,
    fields: [
      {
        name: 'body', label: 'Request Body', type: 'json', required: true,
        defaultValue: JSON.stringify({
          operation: 'CREATE',
          orderNo: testOrderNo(),
          type: 'D',
          date: today(),
          location: { address: '393 Hanover St, Boston, MA 02113, USA' },
          duration: 20,
          notes: 'Test order from API Tester',
        }, null, 2),
      },
    ],
    buildRequest: (v) => ({
      endpoint: 'create_order',
      method: 'POST',
      body: JSON.parse(v.body),
    }),
  },
  {
    id: 'create_or_update_orders',
    category: 'orders',
    label: 'Bulk Create/Update Orders',
    method: 'POST',
    optimoEndpoint: 'create_or_update_orders',
    description: 'Create or update multiple orders (bulk, no geocoding — use lat/lng)',
    createsTestData: true,
    fields: [
      {
        name: 'body', label: 'Request Body', type: 'json', required: true,
        defaultValue: JSON.stringify({
          orders: [{
            orderNo: testOrderNo(),
            date: today(),
            duration: 15,
            type: 'D',
            location: {
              locationNo: 'LOC001',
              address: '393 Hanover St, Boston, MA 02113, USA',
              latitude: 42.365142,
              longitude: -71.052882,
            },
          }],
        }, null, 2),
      },
    ],
    buildRequest: (v) => ({
      endpoint: 'create_or_update_orders',
      method: 'POST',
      body: JSON.parse(v.body),
    }),
  },
  {
    id: 'get_orders',
    category: 'orders',
    label: 'Get Orders',
    method: 'POST',
    optimoEndpoint: 'get_orders',
    description: 'Retrieve orders by orderNo or id (up to 500)',
    fields: [
      {
        name: 'body', label: 'Request Body', type: 'json', required: true,
        defaultValue: JSON.stringify({
          orders: [{ orderNo: 'ORD001' }],
        }, null, 2),
      },
    ],
    buildRequest: (v) => ({
      endpoint: 'get_orders',
      method: 'POST',
      body: JSON.parse(v.body),
    }),
  },
  {
    id: 'search_orders',
    category: 'orders',
    label: 'Search Orders',
    method: 'POST',
    optimoEndpoint: 'search_orders',
    description: 'Search orders by date range and optional status filter (up to 500 results)',
    fields: [
      {
        name: 'body', label: 'Request Body', type: 'json', required: true,
        defaultValue: JSON.stringify({
          dateRange: { from: today(), to: today() },
          includeOrderData: true,
        }, null, 2),
      },
    ],
    buildRequest: (v) => ({
      endpoint: 'search_orders',
      method: 'POST',
      body: JSON.parse(v.body),
    }),
  },
  {
    id: 'delete_order',
    category: 'orders',
    label: 'Delete Order',
    method: 'POST',
    optimoEndpoint: 'delete_order',
    description: 'Delete a single order by orderNo',
    destructive: true,
    fields: [
      {
        name: 'body', label: 'Request Body', type: 'json', required: true,
        defaultValue: JSON.stringify({ orderNo: 'ORD001' }, null, 2),
      },
    ],
    buildRequest: (v) => ({
      endpoint: 'delete_order',
      method: 'POST',
      body: JSON.parse(v.body),
    }),
  },
  {
    id: 'delete_orders',
    category: 'orders',
    label: 'Delete Orders (Bulk)',
    method: 'POST',
    optimoEndpoint: 'delete_orders',
    description: 'Delete multiple orders (up to 500)',
    destructive: true,
    fields: [
      {
        name: 'body', label: 'Request Body', type: 'json', required: true,
        defaultValue: JSON.stringify({
          orders: [{ orderNo: 'ORD001' }, { orderNo: 'ORD002' }],
        }, null, 2),
      },
    ],
    buildRequest: (v) => ({
      endpoint: 'delete_orders',
      method: 'POST',
      body: JSON.parse(v.body),
    }),
  },
  {
    id: 'delete_all_orders',
    category: 'orders',
    label: 'Delete All Orders',
    method: 'POST',
    optimoEndpoint: 'delete_all_orders',
    description: 'Delete ALL orders and routes (optionally for a specific date)',
    destructive: true,
    fields: [
      {
        name: 'body', label: 'Request Body', type: 'json', required: true,
        defaultValue: JSON.stringify({ date: today() }, null, 2),
      },
    ],
    buildRequest: (v) => ({
      endpoint: 'delete_all_orders',
      method: 'POST',
      body: JSON.parse(v.body),
    }),
  },

  // ── Planning ──
  {
    id: 'get_routes',
    category: 'planning',
    label: 'Get Routes',
    method: 'GET',
    optimoEndpoint: 'get_routes',
    description: 'Get routes for a specific date with optional driver/vehicle filters',
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true, defaultValue: today() },
      { name: 'driverSerial', label: 'Driver Serial', type: 'text', required: false, placeholder: 'Optional' },
      { name: 'driverExternalId', label: 'Driver External ID', type: 'text', required: false, placeholder: 'Optional' },
      { name: 'vehicleRegistration', label: 'Vehicle Registration', type: 'text', required: false, placeholder: 'Optional' },
    ],
    buildRequest: (v) => {
      const params: Record<string, string> = { date: v.date || today() };
      if (v.driverSerial) params.driverSerial = v.driverSerial;
      if (v.driverExternalId) params.driverExternalId = v.driverExternalId;
      if (v.vehicleRegistration) params.vehicleRegistration = v.vehicleRegistration;
      return { endpoint: 'get_routes', method: 'GET', params };
    },
  },
  {
    id: 'get_scheduling_info',
    category: 'planning',
    label: 'Get Scheduling Info',
    method: 'GET',
    optimoEndpoint: 'get_scheduling_info',
    description: 'Get scheduling information for a single order (orderNo or id)',
    fields: [
      { name: 'orderNo', label: 'Order Number', type: 'text', required: false, placeholder: 'e.g. ORD001' },
      { name: 'id', label: 'Order ID', type: 'text', required: false, placeholder: 'OptimoRoute assigned ID' },
    ],
    buildRequest: (v) => {
      const params: Record<string, string> = {};
      if (v.orderNo) params.orderNo = v.orderNo;
      if (v.id) params.id = v.id;
      return { endpoint: 'get_scheduling_info', method: 'GET', params };
    },
  },
  {
    id: 'start_planning',
    category: 'planning',
    label: 'Start Planning',
    method: 'POST',
    optimoEndpoint: 'start_planning',
    description: 'WARNING: Re-optimizes ALL orders for the date — will rearrange existing routes!',
    destructive: true,
    fields: [
      {
        name: 'body', label: 'Request Body', type: 'json', required: true,
        defaultValue: JSON.stringify({ date: today() }, null, 2),
      },
    ],
    buildRequest: (v) => ({
      endpoint: 'start_planning',
      method: 'POST',
      body: JSON.parse(v.body),
    }),
  },
  {
    id: 'stop_planning',
    category: 'planning',
    label: 'Stop Planning',
    method: 'POST',
    optimoEndpoint: 'stop_planning',
    description: 'Stop a planning process by planningId',
    fields: [
      {
        name: 'body', label: 'Request Body', type: 'json', required: true,
        defaultValue: JSON.stringify({ planningId: 0 }, null, 2),
      },
    ],
    buildRequest: (v) => ({
      endpoint: 'stop_planning',
      method: 'POST',
      body: JSON.parse(v.body),
    }),
  },
  {
    id: 'get_planning_status',
    category: 'planning',
    label: 'Get Planning Status',
    method: 'GET',
    optimoEndpoint: 'get_planning_status',
    description: 'Check progress of a planning operation (status: N/R/C/F/E)',
    fields: [
      { name: 'planningId', label: 'Planning ID', type: 'text', required: true, placeholder: 'From start_planning response' },
    ],
    buildRequest: (v) => ({
      endpoint: 'get_planning_status',
      method: 'GET',
      params: { planningId: v.planningId },
    }),
  },

  // ── Drivers ──
  {
    id: 'update_driver_parameters',
    category: 'drivers',
    label: 'Update Driver Parameters',
    method: 'POST',
    optimoEndpoint: 'update_driver_parameters',
    description: 'WARNING: Unschedules existing routes for this driver/date! Updates work time, capacity, or location.',
    destructive: true,
    fields: [
      {
        name: 'body', label: 'Request Body', type: 'json', required: true,
        defaultValue: JSON.stringify({
          externalId: 'DRV001',
          date: today(),
          workTimeFrom: '08:00',
          workTimeTo: '17:00',
        }, null, 2),
      },
    ],
    buildRequest: (v) => ({
      endpoint: 'update_driver_parameters',
      method: 'POST',
      body: JSON.parse(v.body),
    }),
  },
  {
    id: 'update_drivers_parameters',
    category: 'drivers',
    label: 'Bulk Update Driver Parameters',
    method: 'POST',
    optimoEndpoint: 'update_drivers_parameters',
    description: 'WARNING: Unschedules existing routes for these drivers/dates! Updates parameters for multiple drivers.',
    destructive: true,
    fields: [
      {
        name: 'body', label: 'Request Body', type: 'json', required: true,
        defaultValue: JSON.stringify({
          updates: [{
            driver: { externalId: 'DRV001' },
            date: today(),
            workTime: { from: '08:00', to: '17:00' },
          }],
        }, null, 2),
      },
    ],
    buildRequest: (v) => ({
      endpoint: 'update_drivers_parameters',
      method: 'POST',
      body: JSON.parse(v.body),
    }),
  },
  {
    id: 'update_drivers_positions',
    category: 'drivers',
    label: 'Update Driver Positions',
    method: 'POST',
    optimoEndpoint: 'update_drivers_positions',
    description: 'Push GPS positions for multiple drivers',
    fields: [
      {
        name: 'body', label: 'Request Body', type: 'json', required: true,
        defaultValue: JSON.stringify({
          updates: [{
            driver: { externalId: 'DRV001' },
            positions: [{
              timestamp: Math.floor(Date.now() / 1000),
              latitude: 42.365142,
              longitude: -71.052882,
              speed: 0,
              accuracy: 10,
            }],
          }],
        }, null, 2),
      },
    ],
    buildRequest: (v) => ({
      endpoint: 'update_drivers_positions',
      method: 'POST',
      body: JSON.parse(v.body),
    }),
  },

  // ── Tracking ──
  {
    id: 'get_events',
    category: 'tracking',
    label: 'Get Events',
    method: 'GET',
    optimoEndpoint: 'get_events',
    description: 'Fetch mobile driver events (up to 500 per call, use after_tag for pagination)',
    fields: [
      { name: 'after_tag', label: 'After Tag', type: 'text', required: false, placeholder: 'Cursor from previous response' },
    ],
    buildRequest: (v) => {
      const params: Record<string, string> = {};
      if (v.after_tag) params.after_tag = v.after_tag;
      return { endpoint: 'get_events', method: 'GET', params };
    },
  },
  {
    id: 'get_completion_details',
    category: 'tracking',
    label: 'Get Completion Details',
    method: 'POST',
    optimoEndpoint: 'get_completion_details',
    description: 'Get completion details for orders (up to 500)',
    fields: [
      {
        name: 'body', label: 'Request Body', type: 'json', required: true,
        defaultValue: JSON.stringify({
          orders: [{ orderNo: 'ORD001' }],
        }, null, 2),
      },
    ],
    buildRequest: (v) => ({
      endpoint: 'get_completion_details',
      method: 'POST',
      body: JSON.parse(v.body),
    }),
  },
  {
    id: 'update_completion_details',
    category: 'tracking',
    label: 'Update Order Completion',
    method: 'POST',
    optimoEndpoint: 'update_completion_details',
    description: 'WARNING: Changes completion status on real orders! Update completion status/form.',
    destructive: true,
    fields: [
      {
        name: 'body', label: 'Request Body', type: 'json', required: true,
        defaultValue: JSON.stringify({
          updates: [{
            orderNo: 'ORD001',
            data: { status: 'success' },
          }],
        }, null, 2),
      },
    ],
    buildRequest: (v) => ({
      endpoint: 'update_completion_details',
      method: 'POST',
      body: JSON.parse(v.body),
    }),
  },
];
