
const API_KEY = '873c7f72f1c3a0635020aaf42a9919fd4MC9LwleDuU';
const API_URL = 'https://api.optimoroute.com/v1/orders';

export interface PickupInfo {
    date: string; // YYYY-MM-DD
    eta?: string; // e.g., "11:45 AM"
    timeWindow?: {
        start: string; // e.g., "9:00 AM"
        end: string;   // e.g., "1:00 PM"
    };
}

export type TaskType = 'DELIVERY' | 'PICKUP';

export interface Task {
    orderNo: string;
    date: string; // YYYY-MM-DD
    type: TaskType;
    location: {
        address: string;
    };
    notes: string;
}

// Store for created tasks
const MOCK_OPTIMO_TASKS: Task[] = [];

// --- Dynamic Mock Data Generation ---

const getISODateString = (date: Date): string => date.toISOString().split('T')[0];

const today = new Date();
const tomorrow = new Date();
tomorrow.setDate(today.getDate() + 1);
const dayAfter = new Date();
dayAfter.setDate(today.getDate() + 2);

// Function to get next day's date string
const getNextBusinessDay = (): string => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    // Simple version: just add a day. A real one would skip weekends/holidays.
    return date.toISOString().split('T')[0];
};


// Mock data to simulate API responses for different addresses.
// In a real scenario, this data would come from the OptimoRoute API.
const MOCK_OPTIMO_ROUTES: Record<string, PickupInfo> = {
    '121 Elsia Dr': { 
        date: getISODateString(today),
        eta: '11:45 AM', // On pickup day, we have an ETA
    },
    '7258 Baldwin Ridge Rd': { 
        date: getISODateString(tomorrow),
        timeWindow: { start: '9:00 AM', end: '1:00 PM' }
    },
    '804 W 13th St': { 
        date: getISODateString(dayAfter),
        timeWindow: { start: '10:00 AM', end: '2:00 PM' }
    },
};

/**
 * Simulates fetching the next pickup schedule for a given property address from OptimoRoute.
 * @param address The property address to search for.
 * @returns A promise that resolves to an object containing pickup date, and optionally ETA or time window.
 */
export const getNextPickupInfo = async (address: string): Promise<PickupInfo | null> => {
    // In a real application, you would make a network request to the OptimoRoute API.
    // For this simulation, we'll return mock data with a delay to mimic a real API call.
    console.log(`[OptimoRoute MOCK] Fetching schedule for: ${address}`);
    return new Promise(resolve => {
        setTimeout(() => {
            const schedule = MOCK_OPTIMO_ROUTES[address];
            resolve(schedule || null); // Return null if no specific schedule is mocked for the address
        }, 700); // Simulate network latency
    });
};

/**
 * Simulates creating a delivery task in OptimoRoute.
 */
export const createDeliveryTask = async (address: string, serviceName: string, quantity: number): Promise<{ success: boolean; task: Task }> => {
    const task: Task = {
        orderNo: `DEL-${Date.now()}`,
        date: getNextBusinessDay(),
        type: 'DELIVERY',
        location: { address },
        notes: `Deliver ${quantity}x "${serviceName}" to customer.`
    };

    // In a real app, this would be a POST request to API_URL
    MOCK_OPTIMO_TASKS.push(task);
    console.log(`[OptimoRoute MOCK] Created DELIVERY task: ${task.orderNo} for ${address}. Notes: ${task.notes}`);
    
    return new Promise(resolve => {
        setTimeout(() => resolve({ success: true, task }), 250); // Simulate API latency
    });
};

/**
 * Simulates creating a pickup/retrieval task in OptimoRoute.
 */
export const createPickupTask = async (address: string, serviceName: string, quantity: number): Promise<{ success: boolean; task: Task }> => {
    const task: Task = {
        orderNo: `PCK-${Date.now()}`,
        date: getNextBusinessDay(),
        type: 'PICKUP',
        location: { address },
        notes: `Pick up ${quantity}x "${serviceName}" from customer location.`
    };

    MOCK_OPTIMO_TASKS.push(task);
    console.log(`[OptimoRoute MOCK] Created PICKUP task: ${task.orderNo} for ${address}. Notes: ${task.notes}`);

    return new Promise(resolve => {
        setTimeout(() => resolve({ success: true, task }), 250);
    });
};