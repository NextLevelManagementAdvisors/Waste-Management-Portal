import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { MagnifyingGlassIcon } from '../../../components/Icons.tsx';
import { LoadingSpinner, StatusBadge, ConfirmDialog, EmptyState } from '../ui/index.ts';
import type { NavFilter } from '../../../shared/types/index.ts';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  stripeCustomerId: string | null;
  createdAt: string;
}

interface PaymentHistory {
  id: string;
  amount: number;
  status: string;
  description: string;
  created: string;
  receiptUrl: string | null;
  paymentMethod: string;
}

interface Subscription {
  id: string;
  status: string;
  currentPeriodEnd: string;
  items: { productName: string; amount: number; interval: string }[];
}

type TabType = 'payment-history' | 'actions';

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

// ============================================================================
// Customer Selector
// ============================================================================
const CustomerSelector: React.FC<{
  onSelect: (customer: Customer) => void;
  selectedCustomer: Customer | null;
}> = ({ onSelect, selectedCustomer }) => {
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const loadCustomers = useCallback(async (query: string = '') => {
    setLoading(true);
    try {
      const url = query
        ? `/api/admin/customers?search=${encodeURIComponent(query)}&limit=20`
        : '/api/admin/customers?limit=20';
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers || []);
      }
    } catch (error) {
      console.error('Failed to load customers:', error);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showDropdown && search.length > 0) {
      loadCustomers(search);
    } else if (showDropdown && search.length === 0) {
      loadCustomers();
    }
  }, [search, showDropdown, loadCustomers]);

  const handleSelect = (customer: Customer) => {
    onSelect(customer);
    setShowDropdown(false);
    setSearch('');
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs font-bold text-gray-500 uppercase">Select Customer</label>
      <div className="relative">
        <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-white">
          <MagnifyingGlassIcon className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={selectedCustomer && !showDropdown ? selectedCustomer.name : search}
            onChange={e => {
              setSearch(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder-gray-400"
          />
        </div>

        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
            {loading ? (
              <div className="p-3 text-sm text-gray-500 text-center">Loading...</div>
            ) : customers.length === 0 ? (
              <div className="p-3 text-sm text-gray-500 text-center">No customers found</div>
            ) : (
              <div className="max-h-60 overflow-y-auto">
                {customers.map(customer => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => handleSelect(customer)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="font-semibold text-gray-900">{customer.name}</div>
                    <div className="text-xs text-gray-500">{customer.email}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedCustomer && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm">
            <div className="font-semibold text-gray-900">{selectedCustomer.name}</div>
            <div className="text-xs text-gray-600">{selectedCustomer.email}</div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Payment History Tab
// ============================================================================
const PaymentHistoryTab: React.FC<{ customerId: string; initialStatusFilter?: string | null }> = ({ customerId, initialStatusFilter }) => {
  const [payments, setPayments] = useState<PaymentHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter || 'all');

  useEffect(() => {
    if (initialStatusFilter) setStatusFilter(initialStatusFilter);
    else setStatusFilter('all');
  }, [initialStatusFilter, customerId]);

  useEffect(() => {
    const loadPaymentHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/billing/payment-history/${customerId}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch payment history');
        const data = await res.json();
        setPayments(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading payment history');
        setPayments([]);
      } finally {
        setLoading(false);
      }
    };

    if (customerId) {
      loadPaymentHistory();
    }
  }, [customerId]);

  if (loading) return <LoadingSpinner />;

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-red-600 text-sm">{error}</div>
      </Card>
    );
  }

  const filteredPayments = statusFilter === 'all'
    ? payments
    : payments.filter(p => {
        if (statusFilter === 'open') return ['open', 'draft', 'uncollectible'].includes(p.status);
        if (statusFilter === 'active') return p.status === 'paid' || p.status === 'succeeded';
        return p.status === statusFilter;
      });

  if (payments.length === 0) {
    return <EmptyState message="No payment history found for this customer." />;
  }

  const statusOptions = ['all', 'open', 'active', 'paid', 'void'];

  return (
    <Card className="p-6">
      <div className="flex gap-2 mb-4 flex-wrap">
        {statusOptions.map(opt => (
          <button
            key={opt}
            onClick={() => setStatusFilter(opt)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              statusFilter === opt
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {opt === 'all' ? 'All' : opt.charAt(0).toUpperCase() + opt.slice(1)}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Date</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Status</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600 hidden sm:table-cell">Description</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600 hidden sm:table-cell">Payment Method</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.map(payment => (
              <tr key={payment.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-700">{formatDate(payment.created)}</td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-900">{formatCurrency(payment.amount)}</td>
                <td className="px-4 py-3 text-sm">
                  <StatusBadge status={payment.status} />
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">{payment.description || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">{payment.paymentMethod || '-'}</td>
                <td className="px-4 py-3 text-sm">
                  {payment.receiptUrl ? (
                    <a
                      href={payment.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal-600 hover:underline"
                    >
                      View
                    </a>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

// ============================================================================
// Create Invoice Form
// ============================================================================
const CreateInvoiceForm: React.FC<{
  customerId: string;
  onSuccess: () => void;
}> = ({ customerId, onSuccess }) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/billing/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ customerId, amount: parseFloat(amount), description }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to create invoice');
      }
      setAmount('');
      setDescription('');
      setShowConfirm(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating invoice');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = amount && parseFloat(amount) > 0;

  return (
    <Card className="p-6">
      <h3 className="text-lg font-black text-gray-900 mb-4">Create Invoice</h3>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-2">Amount (USD)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            disabled={loading}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-2">Description (Optional)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Invoice description..."
            disabled={loading}
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            disabled={!canSubmit || loading}
            onClick={() => setShowConfirm(true)}
            className="flex-1"
          >
            {loading ? 'Creating...' : 'Create Invoice'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showConfirm}
        title="Create Invoice"
        message={`Create an invoice for ${formatCurrency(parseFloat(amount) || 0)}${description ? ` with description "${description}"` : ''}?`}
        confirmLabel="Create"
        onConfirm={handleSubmit}
        onCancel={() => setShowConfirm(false)}
        isLoading={loading}
      />
    </Card>
  );
};

// ============================================================================
// Apply Credit Form
// ============================================================================
const ApplyCreditForm: React.FC<{
  customerId: string;
  onSuccess: () => void;
}> = ({ customerId, onSuccess }) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/billing/apply-credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ customerId, amount: parseFloat(amount), description }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to apply credit');
      }
      setAmount('');
      setDescription('');
      setShowConfirm(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error applying credit');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = amount && parseFloat(amount) > 0;

  return (
    <Card className="p-6">
      <h3 className="text-lg font-black text-gray-900 mb-4">Apply Credit</h3>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-2">Credit Amount (USD)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            disabled={loading}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-2">Reason (Optional)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Reason for credit..."
            disabled={loading}
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            disabled={!canSubmit || loading}
            onClick={() => setShowConfirm(true)}
            className="flex-1"
          >
            {loading ? 'Applying...' : 'Apply Credit'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showConfirm}
        title="Apply Credit"
        message={`Apply ${formatCurrency(parseFloat(amount) || 0)} credit to this customer${description ? ` for "${description}"` : ''}?`}
        confirmLabel="Apply"
        onConfirm={handleSubmit}
        onCancel={() => setShowConfirm(false)}
        isLoading={loading}
      />
    </Card>
  );
};

// ============================================================================
// Subscription Management
// ============================================================================
const SubscriptionManagement: React.FC<{
  customerId: string;
  onActionComplete: () => void;
}> = ({ customerId, onActionComplete }) => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'cancel' | 'pause' | 'resume';
    subscriptionId: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const loadSubscriptions = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/customers/${customerId}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch customer details');
        const data = await res.json();
        setSubscriptions(data.stripe?.subscriptions || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading subscriptions');
        setSubscriptions([]);
      } finally {
        setLoading(false);
      }
    };

    if (customerId) {
      loadSubscriptions();
    }
  }, [customerId]);

  const handleAction = async (type: 'cancel' | 'pause' | 'resume', subscriptionId: string) => {
    setActionLoading(true);
    const endpoint = `/api/admin/billing/${type}-subscription`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ customerId, subscriptionId }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || `Failed to ${type} subscription`);
      }
      setConfirmAction(null);
      onActionComplete();
    } catch (err) {
      console.error('Subscription action error:', err);
      setError(err instanceof Error ? err.message : `Error performing ${type} action`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-red-600 text-sm">{error}</div>
      </Card>
    );
  }

  if (subscriptions.length === 0) {
    return <EmptyState message="No active subscriptions for this customer." />;
  }

  return (
    <div className="space-y-4">
      {subscriptions.map(subscription => (
        <Card key={subscription.id} className="p-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-black text-gray-900">Subscription</h4>
                <p className="text-sm text-gray-600 mt-1">ID: {subscription.id}</p>
              </div>
              <StatusBadge status={subscription.status} />
            </div>

            <div className="space-y-2 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                <span className="font-semibold">Period End:</span> {formatDate(subscription.currentPeriodEnd)}
              </p>
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Items:</p>
                <div className="space-y-1 ml-2">
                  {subscription.items.map((item, idx) => (
                    <div key={idx} className="text-sm text-gray-600">
                      <span className="font-semibold">{item.productName}</span> - {formatCurrency(item.amount)} / {item.interval}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-gray-200">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmAction({ type: 'pause', subscriptionId: subscription.id })}
                disabled={actionLoading || subscription.status !== 'active'}
              >
                Pause
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmAction({ type: 'resume', subscriptionId: subscription.id })}
                disabled={actionLoading || subscription.status !== 'paused'}
              >
                Resume
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmAction({ type: 'cancel', subscriptionId: subscription.id })}
                disabled={actionLoading}
                className="!text-red-600 hover:!bg-red-50"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      ))}

      <ConfirmDialog
        isOpen={confirmAction !== null}
        title={confirmAction ? `${confirmAction.type.charAt(0).toUpperCase() + confirmAction.type.slice(1)} Subscription` : 'Confirm'}
        message={confirmAction ? `Are you sure you want to ${confirmAction.type} this subscription?` : ''}
        confirmLabel={confirmAction?.type === 'cancel' ? 'Cancel Subscription' : confirmAction?.type.charAt(0).toUpperCase() + (confirmAction?.type.slice(1) || '')}
        isDangerous={confirmAction?.type === 'cancel'}
        onConfirm={() => confirmAction && handleAction(confirmAction.type, confirmAction.subscriptionId)}
        onCancel={() => setConfirmAction(null)}
        isLoading={actionLoading}
      />
    </div>
  );
};

// ============================================================================
// Actions Tab
// ============================================================================
const ActionsTab: React.FC<{
  customerId: string;
  onActionComplete: () => void;
}> = ({ customerId, onActionComplete }) => {
  return (
    <div className="space-y-6">
      <CreateInvoiceForm customerId={customerId} onSuccess={onActionComplete} />
      <ApplyCreditForm customerId={customerId} onSuccess={onActionComplete} />
      <div>
        <h3 className="text-lg font-black text-gray-900 mb-4">Subscription Management</h3>
        <SubscriptionManagement customerId={customerId} onActionComplete={onActionComplete} />
      </div>
    </div>
  );
};

// ============================================================================
// Main BillingView Component
// ============================================================================
const BillingView: React.FC<{ navFilter?: NavFilter | null; onFilterConsumed?: () => void }> = ({ navFilter, onFilterConsumed }) => {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('payment-history');
  const [refreshKey, setRefreshKey] = useState(0);
  const [initialFilter, setInitialFilter] = useState<string | null>(null);

  useEffect(() => {
    if (navFilter) {
      if (navFilter.tab === 'actions') setActiveTab('actions');
      if (navFilter.filter) setInitialFilter(navFilter.filter);
      onFilterConsumed?.();
    }
  }, [navFilter, onFilterConsumed]);

  const handleActionComplete = () => {
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <CustomerSelector onSelect={setSelectedCustomer} selectedCustomer={selectedCustomer} />
      </Card>

      {selectedCustomer && (
        <>
          <Card className="p-6 border-t-4 border-t-teal-600">
            <div className="flex gap-4 border-b border-gray-200">
              <button
                onClick={() => setActiveTab('payment-history')}
                className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-colors ${
                  activeTab === 'payment-history'
                    ? 'border-teal-600 text-teal-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Payment History
              </button>
              <button
                onClick={() => setActiveTab('actions')}
                className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-colors ${
                  activeTab === 'actions'
                    ? 'border-teal-600 text-teal-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Actions
              </button>
            </div>
          </Card>

          <div key={refreshKey}>
            {activeTab === 'payment-history' && <PaymentHistoryTab customerId={selectedCustomer.id} initialStatusFilter={initialFilter} />}
            {activeTab === 'actions' && <ActionsTab customerId={selectedCustomer.id} onActionComplete={handleActionComplete} />}
          </div>
        </>
      )}
    </div>
  );
};

export default BillingView;
