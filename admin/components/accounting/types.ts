export interface AccountingOverview {
  revenue30d: number;
  revenue90d: number;
  expenses30d: number;
  expenses90d: number;
  driverPay30d: number;
  netIncome30d: number;
  outstandingAR: number;
  activeSubscriptions: number;
  monthlyRecurring: number;
}

export interface RevenueVsExpense {
  month: string;
  revenue: number;
  expenses: number;
  driverPay: number;
  netIncome: number;
}

export interface IncomeItem {
  id: string;
  number: string | null;
  amount: number;
  status: string;
  customerName: string;
  customerEmail: string;
  created: string | null;
  hostedInvoiceUrl: string | null;
}

export interface ExpenseItem {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  expenseDate: string;
  vendor: string | null;
  paymentMethod: string | null;
  referenceId: string | null;
  referenceType: string | null;
  isDriverPay: boolean;
  notes: string | null;
  createdAt: string;
}

export interface InvoiceItem {
  id: string;
  number: string | null;
  amount: number;
  amountPaid: number;
  amountRemaining: number;
  status: string;
  customerName: string;
  customerEmail: string;
  dueDate: string | null;
  created: string | null;
  hostedInvoiceUrl: string | null;
}

export const EXPENSE_CATEGORIES = [
  { value: 'driver_pay', label: 'Driver Pay' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'vehicle_maintenance', label: 'Vehicle Maintenance' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'office_admin', label: 'Office / Admin' },
  { value: 'disposal_fees', label: 'Disposal Fees' },
  { value: 'permits_licensing', label: 'Permits / Licensing' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'rent_lease', label: 'Rent / Lease' },
  { value: 'professional_services', label: 'Professional Services' },
  { value: 'other', label: 'Other' },
] as const;

export const PAYMENT_METHODS = [
  { value: 'check', label: 'Check' },
  { value: 'ach', label: 'ACH' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
] as const;

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

export const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

export const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
};

export const getCategoryLabel = (value: string) =>
  EXPENSE_CATEGORIES.find(c => c.value === value)?.label || value;
