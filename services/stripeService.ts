// services/stripeService.ts

// This service simulates a backend client for the Stripe API.
// In a real application, these functions would make authenticated API calls to your server,
// which would then interact with the Stripe API. Your Stripe secret keys should never be
// exposed on the frontend.

import { PaymentMethod, Subscription, Invoice, Service } from '../types';

// --- MOCK STRIPE DATABASE ---

// Simulate a Stripe Customer object
let STRIPE_CUSTOMER = {
    id: 'cus_MOCK12345',
    default_payment_method: 'pm_1',
    email: 'jane.doe@example.com',
    name: 'Jane Doe',
};

// Simulate Stripe's Product Catalog
const STRIPE_PRODUCTS = [
  // Base Fee
  { 
    id: 'prod_BASE_FEE', 
    name: 'Base Curbside Service', 
    description: 'Flat monthly fee for residential waste collection service.', 
    metadata: { category: 'base_fee', icon_name: 'TruckIcon' },
    default_price: { id: 'price_base_fee', unit_amount: 1500, recurring: { interval: 'month' } }
  },
  // Base Trash Services
  { 
    id: 'prod_TOww4pJkfauHUV', 
    name: 'Small Trash Can (32G)', 
    description: 'Weekly collection for a 32-gallon trash can.', 
    metadata: { category: 'base_service', icon_name: 'TrashIcon' },
    default_price: { id: 'price_small_trash', unit_amount: 2000, recurring: { interval: 'month' } }
  },
  { 
    id: 'prod_TOwxmi5PUD5seZ', 
    name: 'Medium Trash Can (64G)', 
    description: 'Weekly collection for a 64-gallon trash can.', 
    metadata: { category: 'base_service', icon_name: 'TrashIcon' },
    default_price: { id: 'price_medium_trash', unit_amount: 2500, recurring: { interval: 'month' } }
  },
  { 
    id: 'prod_TOwy8go7cLjLpV', 
    name: 'Large Trash Can (96G)', 
    description: 'Weekly collection for a 96-gallon trash can.', 
    metadata: { category: 'base_service', icon_name: 'TrashIcon' },
    default_price: { id: 'price_large_trash', unit_amount: 3000, recurring: { interval: 'month' } }
  },
  // Base Recycling Services
  { 
    id: 'prod_RECYCLE_SMALL', 
    name: 'Recycling Can (20G)', 
    description: 'Weekly collection for a 20-gallon recycling can.', 
    metadata: { category: 'base_service', icon_name: 'ArrowPathIcon' },
    default_price: { id: 'price_recycle_small', unit_amount: 1500, recurring: { interval: 'month' } }
  },
  // Upgrades
  { 
    id: 'prod_TOvyKnOx4KLBc2', 
    name: 'At House Collection', 
    description: 'Weekly service where we retrieve your can from your driveway.', 
    metadata: { category: 'upgrade', icon_name: 'TruckIcon' },
    default_price: { id: 'price_house_collection', unit_amount: 2000, recurring: { interval: 'month' } }
  },
  { 
    id: 'prod_TOx5lSdv97AAGb', 
    name: 'Liner Service', 
    description: 'We install a fresh liner in your can after every weekly collection.', 
    metadata: { category: 'upgrade', icon_name: 'SunIcon' },
    default_price: { id: 'price_liner', unit_amount: 1000, recurring: { interval: 'month' } }
  },
];


// Simulate Stripe's PaymentMethods attached to the customer
let STRIPE_PAYMENT_METHODS: PaymentMethod[] = [
    { id: 'pm_1', type: 'Card', brand: 'Visa', last4: '4242', expiryMonth: 12, expiryYear: 2026, isPrimary: true },
    { id: 'pm_2', type: 'Card', brand: 'Mastercard', last4: '5555', expiryMonth: 8, expiryYear: 2023, isPrimary: false },
    { id: 'pm_3', type: 'Bank Account', last4: '6789', isPrimary: false },
];

// Simulate Stripe Subscriptions
let STRIPE_SUBSCRIPTIONS: Subscription[] = [
    // P1: Base Fee + Medium Can
    { id: 'sub_base_1', propertyId: 'P1', serviceId: 'prod_BASE_FEE', serviceName: 'Base Curbside Service', startDate: '2023-01-14', status: 'active', nextBillingDate: '2024-08-01', price: 15.00, totalPrice: 15.00, paymentMethodId: 'pm_1', quantity: 1 },
    { id: 'sub_1', propertyId: 'P1', serviceId: 'prod_TOwxmi5PUD5seZ', serviceName: 'Medium Trash Can (64G)', startDate: '2023-01-15', status: 'active', nextBillingDate: '2024-08-01', price: 25.00, totalPrice: 25.00, paymentMethodId: 'pm_1', quantity: 1 },
    // P2: Base Fee + 2 Large Cans
    { id: 'sub_base_2', propertyId: 'P2', serviceId: 'prod_BASE_FEE', serviceName: 'Base Curbside Service', startDate: '2022-11-09', status: 'active', nextBillingDate: '2024-08-10', price: 15.00, totalPrice: 15.00, paymentMethodId: 'pm_2', quantity: 1 },
    { id: 'sub_3', propertyId: 'P2', serviceId: 'prod_TOwy8go7cLjLpV', serviceName: 'Large Trash Can (96G)', startDate: '2022-11-10', status: 'active', nextBillingDate: '2024-08-10', price: 30.00, totalPrice: 60.00, paymentMethodId: 'pm_2', quantity: 2 },
];

// Simulate Stripe Invoices
let STRIPE_INVOICES: Invoice[] = [
  { id: 'in_P1_004', propertyId: 'P1', amount: 40.00, date: '2024-08-01', status: 'Due' },
  { id: 'in_P1_003', propertyId: 'P1', amount: 35.00, date: '2024-07-01', status: 'Paid', paymentDate: '2024-07-03' },
  { id: 'in_P1_002', propertyId: 'P1', amount: 35.00, date: '2024-06-01', status: 'Paid', paymentDate: '2024-06-02' },
  { id: 'in_P2_004', propertyId: 'P2', amount: 75.00, date: '2024-07-10', status: 'Overdue' },
  { id: 'in_P2_003', propertyId: 'P2', amount: 65.00, date: '2024-06-10', status: 'Paid', paymentDate: '2024-06-11' },
  { id: 'in_P3_001', propertyId: 'P3', amount: 0.00, date: '2024-07-15', status: 'Paid', paymentDate: '2024-07-15' },
];

const simulateApiCall = <T,>(data: T, delay = 200): Promise<T> => 
  new Promise(resolve => setTimeout(() => resolve(JSON.parse(JSON.stringify(data))), delay));


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