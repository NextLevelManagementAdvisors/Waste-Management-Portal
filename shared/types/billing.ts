export interface PaymentHistory {
  id: string;
  amount: number;
  status: string;
  description: string | null;
  created: string;
  receiptUrl: string | null;
  paymentMethod: string | null;
}

export interface Subscription {
  id: string;
  status: string;
  currentPeriodEnd: string;
  items: { productName: string; amount: number; interval: string }[];
}

export interface CustomerBillingDetail {
  id: string;
  name: string;
  email: string;
  stripe: { subscriptions: Subscription[] } | null;
}
