
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

// --- Dynamic Mock Data Generation ---

const getISODateString = (date: Date): string => date.toISOString().split('T')[0];

const today = new Date();
const tomorrow = new Date();
tomorrow.setDate(today.getDate() + 1);
const dayAfter = new Date();
dayAfter.setDate(today.getDate() + 2);


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
    // The code would look something like this:
    /*
    const today = new Date().toISOString().split('T')[0];
    const url = `${API_URL}?key=${API_KEY}&dateFrom=${today}&search=${encodeURIComponent(address)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error('Failed to fetch from OptimoRoute:', response.statusText);
            return null;
        }
        const data = await response.json();
        if (data.success && data.data.orders.length > 0) {
            const order = data.data.orders.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
            const pickupInfo: PickupInfo = {
                date: order.date,
                eta: order.eta ? new Date(order.eta).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : undefined,
                timeWindow: order.plannedTimeFrom && order.plannedTimeTo ? {
                    start: new Date(order.plannedTimeFrom).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                    end: new Date(order.plannedTimeTo).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                } : undefined
            };
            return pickupInfo;
        }
        return null;
    } catch (error) {
        console.error("OptimoRoute API error:", error);
        return null;
    }
    */

    // For this simulation, we'll return mock data with a delay to mimic a real API call.
    console.log(`Fetching OptimoRoute schedule for: ${address}`);
    return new Promise(resolve => {
        setTimeout(() => {
            const schedule = MOCK_OPTIMO_ROUTES[address];
            resolve(schedule || null); // Return null if no specific schedule is mocked for the address
        }, 700); // Simulate network latency
    });
};
