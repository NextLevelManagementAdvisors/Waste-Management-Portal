
// services/stripeService.ts

// This service simulates a backend client for the Stripe API.
// Updated to fix unsafe serialization and ensure reliable mock responses.

import { PaymentMethod, Subscription, Invoice, Service } from '../types.ts';

// --- MOCK STRIPE DATABASE ---

let STRIPE_CUSTOMER = {
    id: 'cus_MOCK12345',
    default_payment_method: 'pm_1',
    email: 'jane.doe@example.com',
    name: 'Jane Doe',
};

const STRIPE_PRODUCTS = [
  { 
    id: 'prod_TOvYnQt1VYbKie', 
    name: 'Curbside Trash Service', 
    description: 'Weekly curbside trash collection service with one can included. Standalone Monthly Service.', 
    metadata: { category: 'base_service', icon_name: 'TruckIcon' },
    default_price: { id: 'price_1SS7he03whKXLoReQdFTq8MB', unit_amount: 3500, recurring: { interval: 'month' } }
  },
  { 
    id: 'prod_TOww4pJkfauHUV', 
    name: 'Small Trash Can (32G)', 
    description: 'Weekly curbside trash collection service with one 32-gallon can. Ideal for single residents or small households.', 
    metadata: { category: 'base_service', icon_name: 'TrashIcon', setup_fee: 4500, sticker_fee: 0 },
    default_price: { id: 'price_1SS92r03whKXLoReKh3DjLtC', unit_amount: 2000, recurring: { interval: 'month' } }
  },
  { 
    id: 'prod_TOwxmi5PUD5seZ', 
    name: 'Medium Trash Can (64G)', 
    description: 'Weekly curbside trash collection service with one 64-gallon can. Our most popular size, perfect for growing families.', 
    metadata: { category: 'base_service', icon_name: 'TrashIcon', setup_fee: 6500, sticker_fee: 0 },
    default_price: { id: 'price_1SS93r03whKXLoReR4M6Ggc1', unit_amount: 2500, recurring: { interval: 'month' } }
  },
  { 
    id: 'prod_TOwy8go7cLjLpV', 
    name: 'Large Trash Can (96G)', 
    description: 'Weekly curbside trash collection service with one 96-gallon can. Best value for large households.', 
    metadata: { category: 'base_service', icon_name: 'TrashIcon', setup_fee: 8500, sticker_fee: 0 },
    default_price: { id: 'price_1SS94F03whKXLoRekbbdFAy4', unit_amount: 3000, recurring: { interval: 'month' } }
  },
  { 
    id: 'prod_TOwzfWmoiIn8Ij', 
    name: 'Recycling Service', 
    description: 'OPTIONAL ADD-ON: Weekly curbside recycling service for all approved materials. (One 32G recycling can included).', 
    metadata: { category: 'base_service', icon_name: 'ArrowPathIcon', setup_fee: 2500, sticker_fee: 0 },
    default_price: { id: 'price_1SSBtZ03whKXLoReZMmsoV5F', unit_amount: 1200, recurring: { interval: 'month' } }
  },
  { 
    id: 'prod_TOvyKnOx4KLBc2', 
    name: 'At House (Backdoor) Service', 
    description: 'PREMIUM ADD-ON: We\'ll retrieve your can(s) directly from your house (e.g., garage, porch) and return them.', 
    metadata: { category: 'upgrade', icon_name: 'BuildingOffice2Icon' },
    default_price: { id: 'price_1SS86i03whKXLoRehFn7sIhZ', unit_amount: 2000, recurring: { interval: 'month' } }
  },
  { 
    id: 'prod_TOx5lSdv97AAGb', 
    name: 'Trash Can Liner Service', 
    description: 'Our crew installs a fresh, heavy-duty liner in your can after every weekly collection.', 
    metadata: { category: 'upgrade', icon_name: 'SunIcon' },
    default_price: { id: 'price_1SS9BL03whKXLoReS4hCzQtz', unit_amount: 1000, recurring: { interval: 'month' } }
  },
  { 
    id: 'prod_TlgxOhg8l2q1eZ', 
    name: 'Handyman Services', 
    description: 'On-demand handyman services for your residential property.', 
    metadata: { category: 'standalone', icon_name: 'WrenchScrewdriverIcon' },
    default_price: { id: 'price_1So9Zc03whKXLoRemojBg7TA', unit_amount: 22500, recurring: null }
  }
];

let STRIPE_PAYMENT_METHODS: PaymentMethod[] = [
    { id: 'pm_1', type: 'Card', brand: 'Visa', last4: '4242', expiryMonth: 12, expiryYear: 2026, isPrimary: true },
    { id: 'pm_2', type: 'Card', brand: 'Mastercard', last4: '5555', expiryMonth: 8, expiryYear: 2023, isPrimary: false },
    { id: 'pm_3', type: 'Bank Account', last4: '6789', isPrimary: false },
];

let STRIPE_SUBSCRIPTIONS: Subscription[] = [
    { id: 'sub_1', propertyId: 'P1', serviceId: 'prod_TOvYnQt1VYbKie', serviceName: 'Curbside Trash Service', startDate: '2023-01-14', status: 'active', nextBillingDate: '2025-08-01', price: 35.00, totalPrice: 35.00, paymentMethodId: 'pm_1', quantity: 1 },
    { id: 'sub_2', propertyId: 'P1', serviceId: 'prod_TOwxmi5PUD5seZ', serviceName: 'Medium Trash Can (64G)', startDate: '2023-01-15', status: 'active', nextBillingDate: '2025-08-01', price: 25.00, totalPrice: 25.00, paymentMethodId: 'pm_1', quantity: 1 },
    { id: 'sub_3', propertyId: 'P2', serviceId: 'prod_TOvYnQt1VYbKie', serviceName: 'Curbside Trash Service', startDate: '2022-11-09', status: 'active', nextBillingDate: '2025-08-10', price: 35.00, totalPrice: 35.00, paymentMethodId: 'pm_2', quantity: 1 },
    { id: 'sub_4', propertyId: 'P2', serviceId: 'prod_TOwy8go7cLjLpV', serviceName: 'Large Trash Can (96G)', startDate: '2022-11-10', status: 'active', nextBillingDate: '2025-08-10', price: 30.00, totalPrice: 60.00, paymentMethodId: 'pm_2', quantity: 2 },
];

let STRIPE_INVOICES: Invoice[] = [
  { id: 'in_P1_004', propertyId: 'P1', amount: 60.00, date: '2025-02-01', status: 'Due' },
  { id: 'in_P1_003', propertyId: 'P1', amount: 60.00, date: '2025-01-01', status: 'Paid', paymentDate: '2025-01-03' },
  { id: 'in_P1_002', propertyId: 'P1', amount: 60.00, date: '2024-12-01', status: 'Paid', paymentDate: '2024-12-02' },
  { id: 'in_P2_004', propertyId: 'P2', amount: 95.00, date: '2025-01-10', status: 'Overdue' },
  { id: 'in_P2_003', propertyId: 'P2', amount: 95.00, date: '2024-12-10', status: 'Paid', paymentDate: '2024-12-11' },
];

/**
 * Safer API simulation that avoids JSON serialization issues.
 */
function simulateApiCall<T>(data: T, delay = 200): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(data), delay));
}

// --- STRIPE API MOCKS ---

export const listProducts = async () => {
    return simulateApiCall(STRIPE_PRODUCTS);
};

export const listPaymentMethods = async () => {
    return simulateApiCall(STRIPE_PAYMENT_METHODS);
};

export const attachPaymentMethod = async (method: Omit<PaymentMethod, 'id' | 'isPrimary'>) => {
    const wasEmpty = STRIPE_PAYMENT_METHODS.length === 0;
    const isPrimary = wasEmpty ? true : !STRIPE_PAYMENT_METHODS.some(p => p.isPrimary);
    
    const newMethod: PaymentMethod = {
        ...method,
        id: `pm_${Date.now()}`,
        isPrimary: isPrimary,
    };
    
    STRIPE_PAYMENT_METHODS.push(newMethod);
    if (newMethod.isPrimary) {
        STRIPE_CUSTOMER.default_payment_method = newMethod.id;
    }
    return simulateApiCall(newMethod);
};

export const detachPaymentMethod = async (id: string) => {
    const isInUse = STRIPE_SUBSCRIPTIONS.some(sub => sub.paymentMethodId === id && sub.status === 'active');
    if (isInUse) {
        throw new Error("Cannot delete a payment method that is in use by an active subscription.");
    }

    const methodToDelete = STRIPE_PAYMENT_METHODS.find(p => p.id === id);
    if (!methodToDelete) {
        throw new Error("Payment method not found.");
    }

    STRIPE_PAYMENT_METHODS = STRIPE_PAYMENT_METHODS.filter(p => p.id !== id);
    
    if (methodToDelete.isPrimary && STRIPE_PAYMENT_METHODS.length > 0) {
        STRIPE_PAYMENT_METHODS[0].isPrimary = true;
        STRIPE_CUSTOMER.default_payment_method = STRIPE_PAYMENT_METHODS[0].id;
    }
    
    return simulateApiCall({ id, deleted: true });
};

export const updateCustomerDefaultPaymentMethod = async (id: string) => {
    STRIPE_PAYMENT_METHODS.forEach(p => {
        p.isPrimary = p.id === id;
    });
    const newPrimary = STRIPE_PAYMENT_METHODS.find(p => p.id === id);
    if (newPrimary) {
        STRIPE_CUSTOMER.default_payment_method = newPrimary.id;
        return simulateApiCall(newPrimary);
    }
    throw new Error("Payment method not found");
};

export const createSubscription = async (service: Service, propertyId: string, paymentMethodId: string, quantity: number) => {
    const product = STRIPE_PRODUCTS.find(p => p.id === service.id);
    if (!product) throw new Error("Product not found in Stripe catalog.");

    const newSub: Subscription = {
        id: `sub_${Date.now()}`,
        propertyId: propertyId,
        serviceId: service.id,
        serviceName: service.name,
        startDate: new Date().toISOString(),
        status: 'active',
        nextBillingDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
        price: service.price,
        totalPrice: service.price * quantity,
        paymentMethodId: paymentMethodId,
        quantity: quantity,
    };
    STRIPE_SUBSCRIPTIONS.push(newSub);
    return simulateApiCall(newSub);
};

export const changeSubscriptionQuantity = async (subscriptionId: string, newQuantity: number) => {
    const sub = STRIPE_SUBSCRIPTIONS.find(s => s.id === subscriptionId);
    if (!sub) {
        throw new Error("Stripe subscription not found.");
    }
    if (newQuantity < 0) {
        throw new Error("Quantity cannot be negative.");
    }
    if (newQuantity === 0) {
        return cancelSubscription(subscriptionId);
    }

    const product = STRIPE_PRODUCTS.find(p => p.id === sub.serviceId);
    if (!product) {
        throw new Error("Associated product not found.");
    }
    
    sub.quantity = newQuantity;
    sub.totalPrice = (product.default_price.unit_amount / 100) * newQuantity;

    return simulateApiCall(sub);
};


export const cancelSubscription = async (subscriptionId: string) => {
    const sub = STRIPE_SUBSCRIPTIONS.find(s => s.id === subscriptionId);
    if (sub) {
        sub.status = 'canceled';
        sub.quantity = 0;
        sub.totalPrice = 0;
        return simulateApiCall(sub);
    }
    throw new Error("Stripe subscription not found.");
};

export const listSubscriptions = async () => {
    return simulateApiCall(STRIPE_SUBSCRIPTIONS);
};

export const updateSubscriptionPaymentMethod = async (subscriptionId: string, paymentMethodId: string) => {
    const sub = STRIPE_SUBSCRIPTIONS.find(s => s.id === subscriptionId);
    if (sub) {
        sub.paymentMethodId = paymentMethodId;
        return simulateApiCall(sub);
    }
    throw new Error("Subscription not found");
};

export const listInvoices = async () => {
    return simulateApiCall(STRIPE_INVOICES);
};

export const payInvoice = async (invoiceId: string, paymentMethodId: string) => {
    const invoice = STRIPE_INVOICES.find(inv => inv.id === invoiceId);
    if (invoice) {
        if (invoice.status === 'Paid') {
            throw new Error("Invoice has already been paid.");
        }
        invoice.status = 'Paid';
        invoice.paymentDate = new Date().toISOString().split('T')[0];
        console.log(`(Stripe) Paid invoice ${invoiceId} with method ${paymentMethodId}`);
        return simulateApiCall(invoice);
    }
    throw new Error("Invoice not found.");
};

export const createInvoice = async(propertyId: string, amount: number, description: string) => {
     const newInvoice: Invoice = {
        id: `in_sp_${Date.now()}`,
        propertyId,
        amount: amount,
        date: new Date().toISOString().split('T')[0],
        status: 'Due'
    };
    STRIPE_INVOICES.unshift(newInvoice);
    console.log(`(Stripe) Created invoice for ${description}`);
    return simulateApiCall(newInvoice);
};

export const restartAllSubscriptionsForProperty = async (propertyId: string) => {
    const today = new Date();
    // Setting day to 1st of next month for billing cycle consistency
    const nextBillingDate = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().split('T')[0];
    const newStartDate = new Date().toISOString().split('T')[0];

    let restarted = false;
    STRIPE_SUBSCRIPTIONS.forEach(s => {
        if (s.propertyId === propertyId && s.status === 'canceled') {
            s.status = 'active';
            s.startDate = newStartDate;
            s.nextBillingDate = nextBillingDate;
            delete s.pausedUntil;
            restarted = true;
        }
    });

    if (restarted) {
        console.log(`(Stripe) Restarted services for property ${propertyId}`);
    }
    return simulateApiCall({ success: true });
};
