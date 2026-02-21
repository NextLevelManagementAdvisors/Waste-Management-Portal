export interface CustomerListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  memberSince: string;
  stripeCustomerId: string | null;
  isAdmin: boolean;
  createdAt: string;
  propertyCount: number;
}

export interface CustomerDetail {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  memberSince: string;
  stripeCustomerId: string | null;
  isAdmin: boolean;
  createdAt: string;
  properties: { id: string; address: string; serviceType: string; transferStatus: string | null }[];
  stripe: {
    balance: number;
    subscriptions: { id: string; status: string; currentPeriodEnd: string; items: { productName: string; amount: number; interval: string }[] }[];
    invoices: { id: string; number: string; amount: number; status: string; created: string }[];
    paymentMethods: { id: string; brand: string; last4: string; expMonth: number; expYear: number }[];
  } | null;
}

export interface CustomerNote {
  id: string;
  note: string;
  tags: string[];
  createdAt: string;
  adminName?: string;
}
