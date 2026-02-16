import { PaymentMethod, Subscription, Invoice, Service } from '../types.ts';

const API_BASE = '/api';

async function apiRequest(method: string, path: string, body?: any) {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, options);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Server error (${res.status})`); }
  if (!res.ok) {
    throw new Error(json.error || `API error: ${res.status}`);
  }
  return json;
}

let _customerId: string | null = null;

export function setCustomerId(id: string) {
  _customerId = id;
}

export function getCustomerId(): string | null {
  return _customerId;
}

export const listProducts = async () => {
  const res = await apiRequest('GET', '/products');
  return res.data;
};

export const listPaymentMethods = async (): Promise<PaymentMethod[]> => {
  if (!_customerId) return [];
  const res = await apiRequest('GET', `/customers/${_customerId}/payment-methods`);
  return (res.data || []).map((pm: any) => ({
    id: pm.id,
    type: pm.type === 'card' ? 'Card' : 'Bank Account',
    last4: pm.card?.last4 || pm.us_bank_account?.last4 || '****',
    brand: pm.card?.brand ? (pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1)) as PaymentMethod['brand'] : undefined,
    expiryMonth: pm.card?.exp_month,
    expiryYear: pm.card?.exp_year,
    isPrimary: false,
  }));
};

export const attachPaymentMethod = async (paymentMethodId: string) => {
  if (!_customerId) throw new Error('No customer ID set');
  const res = await apiRequest('POST', `/customers/${_customerId}/payment-methods`, {
    paymentMethodId,
  });
  return res.data;
};

export const detachPaymentMethod = async (id: string) => {
  const res = await apiRequest('DELETE', `/payment-methods/${id}`);
  return res.data;
};

export const updateCustomerDefaultPaymentMethod = async (id: string) => {
  if (!_customerId) throw new Error('No customer ID set');
  const res = await apiRequest('POST', `/customers/${_customerId}/default-payment-method`, {
    paymentMethodId: id,
  });
  return res.data;
};

export const createSubscription = async (service: Service, propertyId: string, paymentMethodId: string, quantity: number, _useSticker: boolean) => {
  if (!_customerId) throw new Error('No customer ID set');

  const products = await listProducts();
  const product = products.find((p: any) => p.id === service.id || p.name === service.name);
  if (!product || !product.default_price) throw new Error(`Product "${service.name}" not found in Stripe`);

  const res = await apiRequest('POST', '/subscriptions', {
    customerId: _customerId,
    priceId: product.default_price.id,
    quantity,
    paymentMethodId,
    metadata: {
      propertyId,
      equipmentType: _useSticker ? 'own_can' : 'rental',
    },
  });

  const sub = res.data;
  return mapStripeSubscription(sub, product);
};

export const setSubscriptionQuantity = async (subscriptionId: string, newQuantity: number) => {
  if (newQuantity <= 0) return cancelSubscription(subscriptionId);
  const res = await apiRequest('PATCH', `/subscriptions/${subscriptionId}`, {
    quantity: newQuantity,
  });
  return res.data;
};

export const changeSubscriptionQuantity = async (subscriptionId: string, newQuantity: number) => {
  return setSubscriptionQuantity(subscriptionId, newQuantity);
};

export const cancelSubscription = async (subscriptionId: string) => {
  const res = await apiRequest('POST', `/subscriptions/${subscriptionId}/cancel`);
  return res.data;
};

export const cancelAllSubscriptionsForProperty = async (propertyId: string) => {
  if (!_customerId) throw new Error('No customer ID set');
  const subs = await listSubscriptions();
  const active = subs.filter((s: Subscription) =>
    s.propertyId === propertyId && (s.status === 'active' || s.status === 'paused')
  );
  for (const sub of active) {
    await cancelSubscription(sub.id);
  }
  return { success: true };
};

export const listSubscriptions = async (): Promise<Subscription[]> => {
  if (!_customerId) return [];
  const res = await apiRequest('GET', `/customers/${_customerId}/subscriptions`);
  return (res.data || []).map((sub: any) => mapStripeSubscription(sub));
};

export const updateSubscriptionPaymentMethod = async (subscriptionId: string, paymentMethodId: string) => {
  const res = await apiRequest('PATCH', `/subscriptions/${subscriptionId}`, {
    paymentMethodId,
  });
  return res.data;
};

export const listInvoices = async (): Promise<Invoice[]> => {
  if (!_customerId) return [];
  const res = await apiRequest('GET', `/customers/${_customerId}/invoices`);
  return (res.data || []).map((inv: any) => mapStripeInvoice(inv));
};

export const payInvoice = async (invoiceId: string, paymentMethodId: string) => {
  const res = await apiRequest('POST', `/invoices/${invoiceId}/pay`, {
    paymentMethodId,
  });
  return mapStripeInvoice(res.data);
};

export const payOutstandingBalance = async (paymentMethodId: string, propertyId?: string): Promise<{ success: boolean }> => {
  const invoices = await listInvoices();
  const unpaid = invoices.filter(inv => {
    const isDue = inv.status === 'Due' || inv.status === 'Overdue';
    const matchesProperty = !propertyId || inv.propertyId === propertyId;
    return isDue && matchesProperty;
  });

  for (const inv of unpaid) {
    await payInvoice(inv.id, paymentMethodId);
  }
  return { success: true };
};

export const createInvoice = async (propertyId: string, amount: number, description: string) => {
  console.log(`[Stripe] Would create invoice: ${description} for $${amount} on property ${propertyId}`);
  return { id: `pending_${Date.now()}`, propertyId, amount, description };
};

export const restartAllSubscriptionsForProperty = async (_propertyId: string) => {
  console.log(`[Stripe] Restart subscriptions not yet implemented for real Stripe`);
  return { success: true };
};

export const pauseSubscriptionsForProperty = async (propertyId: string, _until: string) => {
  if (!_customerId) throw new Error('No customer ID set');
  const subs = await listSubscriptions();
  const active = subs.filter((s: Subscription) =>
    s.propertyId === propertyId && s.status === 'active'
  );
  for (const sub of active) {
    await apiRequest('POST', `/subscriptions/${sub.id}/pause`);
  }
  return { success: true };
};

export const resumeSubscriptionsForProperty = async (propertyId: string) => {
  if (!_customerId) throw new Error('No customer ID set');
  const subs = await listSubscriptions();
  const paused = subs.filter((s: Subscription) =>
    s.propertyId === propertyId && s.status === 'paused'
  );
  for (const sub of paused) {
    await apiRequest('POST', `/subscriptions/${sub.id}/resume`);
  }
  return { success: true };
};

function mapStripeSubscription(sub: any, product?: any): Subscription {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  const prod = price?.product || product;

  const metadata = sub.metadata || {};
  const prodName = typeof prod === 'object' ? prod.name : (product?.name || 'Unknown Service');
  const prodId = typeof prod === 'object' ? prod.id : (price?.product || product?.id || '');
  const unitAmount = price?.unit_amount || product?.default_price?.unit_amount || 0;
  const quantity = item?.quantity || 1;

  let status: 'active' | 'paused' | 'canceled' = 'active';
  if (sub.status === 'canceled' || sub.status === 'incomplete_expired') {
    status = 'canceled';
  } else if (sub.pause_collection) {
    status = 'paused';
  }

  return {
    id: sub.id,
    propertyId: metadata.propertyId || '',
    serviceId: prodId,
    serviceName: prodName,
    startDate: sub.start_date ? new Date(sub.start_date * 1000).toISOString().split('T')[0] : '',
    status,
    nextBillingDate: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString().split('T')[0] : '',
    price: unitAmount / 100,
    totalPrice: (unitAmount / 100) * quantity,
    paymentMethodId: sub.default_payment_method || '',
    quantity,
    equipmentType: metadata.equipmentType as Subscription['equipmentType'],
    equipmentStatus: metadata.equipmentStatus as Subscription['equipmentStatus'],
    pausedUntil: sub.pause_collection?.resumes_at
      ? new Date(sub.pause_collection.resumes_at * 1000).toISOString().split('T')[0]
      : undefined,
  };
}

function mapStripeInvoice(inv: any): Invoice {
  let status: Invoice['status'] = 'Due';
  if (inv.status === 'paid') {
    status = 'Paid';
  } else if (inv.status === 'open' && inv.due_date && inv.due_date * 1000 < Date.now()) {
    status = 'Overdue';
  } else if (inv.status === 'open' || inv.status === 'draft') {
    status = 'Due';
  }

  const metadata = inv.metadata || {};

  return {
    id: inv.id,
    propertyId: metadata.propertyId || inv.subscription_details?.metadata?.propertyId || '',
    amount: (inv.amount_due || inv.total || 0) / 100,
    date: inv.created ? new Date(inv.created * 1000).toISOString().split('T')[0] : '',
    status,
    paymentDate: inv.status_transitions?.paid_at
      ? new Date(inv.status_transitions.paid_at * 1000).toISOString().split('T')[0]
      : undefined,
    description: inv.description || `Invoice ${inv.number || inv.id}`,
  };
}
