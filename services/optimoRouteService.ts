export interface PickupInfo {
    date: string;
    eta?: string;
    timeWindow?: {
        start: string;
        end: string;
    };
    driver?: string;
}

export type TaskType = 'DELIVERY' | 'PICKUP';

export interface Task {
    orderNo: string;
    date: string;
    type: TaskType;
    location: {
        address: string;
    };
    notes: string;
}

export interface CollectionHistoryLog {
    date: string;
    event: string;
    status: 'completed' | 'skipped' | 'missed';
    driver: string;
}

const safeJson = async (res: Response) => {
    const text = await res.text();
    try { return JSON.parse(text); } catch { return null; }
};

function formatTime(time24: string): string {
    if (!time24) return '';
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export const getNextPickupInfo = async (address: string): Promise<PickupInfo | null> => {
    try {
        const res = await fetch(`/api/optimoroute/next-pickup?address=${encodeURIComponent(address)}`);
        const json = await safeJson(res);
        if (res.ok && json.data) {
            const d = json.data;
            return {
                date: d.date,
                eta: d.scheduledAt ? formatTime(d.scheduledAt) : undefined,
                timeWindow: d.timeWindow ? {
                    start: formatTime(d.timeWindow.start),
                    end: formatTime(d.timeWindow.end),
                } : undefined,
                driver: d.driverName || undefined,
            };
        }
    } catch (err) {
        console.error('[OptimoRoute] Error fetching next pickup:', err);
    }
    return null;
};

export const getPastPickups = async (address: string): Promise<CollectionHistoryLog[]> => {
    try {
        const res = await fetch(`/api/optimoroute/history?address=${encodeURIComponent(address)}`);
        const json = await safeJson(res);
        if (res.ok && json.data && json.data.length > 0) {
            return json.data.map((item: any) => ({
                date: item.date,
                event: item.status === 'completed' ? 'Waste Collected'
                     : item.status === 'missed' ? 'Missed Pickup'
                     : 'Skipped',
                status: item.status as 'completed' | 'skipped' | 'missed',
                driver: item.driverName || 'N/A',
            }));
        }
    } catch (err) {
        console.error('[OptimoRoute] Error fetching history:', err);
    }
    return [];
};

const getNextBusinessDay = (): string => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
};

export const createDeliveryTask = async (address: string, serviceName: string, quantity: number): Promise<{ success: boolean; task: Task }> => {
    const orderNo = `DEL-${Date.now()}`;
    const date = getNextBusinessDay();
    const notes = `Deliver ${quantity}x "${serviceName}" to customer.`;
    try {
        const res = await fetch('/api/optimoroute/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderNo, type: 'D', date, address, notes, duration: 15 }),
        });
        const json = await safeJson(res);
        if (res.ok && json.data?.success) {
            return {
                success: true,
                task: { orderNo, date, type: 'DELIVERY', location: { address }, notes },
            };
        }
    } catch (err) {
        console.error('[OptimoRoute] Error creating delivery task:', err);
    }
    return {
        success: false,
        task: { orderNo, date, type: 'DELIVERY', location: { address }, notes },
    };
};

export const createPickupTask = async (address: string, serviceName: string, quantity: number): Promise<{ success: boolean; task: Task }> => {
    const orderNo = `PCK-${Date.now()}`;
    const date = getNextBusinessDay();
    const notes = `Pick up ${quantity}x "${serviceName}" from customer location.`;
    try {
        const res = await fetch('/api/optimoroute/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderNo, type: 'P', date, address, notes, duration: 15 }),
        });
        const json = await safeJson(res);
        if (res.ok && json.data?.success) {
            return {
                success: true,
                task: { orderNo, date, type: 'PICKUP', location: { address }, notes },
            };
        }
    } catch (err) {
        console.error('[OptimoRoute] Error creating pickup task:', err);
    }
    return {
        success: false,
        task: { orderNo, date, type: 'PICKUP', location: { address }, notes },
    };
};
