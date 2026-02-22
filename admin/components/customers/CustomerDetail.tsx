import React, { useState } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { StatusBadge } from '../ui/index.ts';
import type { CustomerDetail as CustomerDetailType } from '../../../shared/types/index.ts';
import EditCustomerModal from './EditCustomerModal.tsx';
import CustomerNotes from './CustomerNotes.tsx';
import CustomerActivityTab from './CustomerActivityTab.tsx';
import CustomerCommunicationsTab from './CustomerCommunicationsTab.tsx';

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const CustomerDetailPanel: React.FC<{
  customer: CustomerDetailType;
  onBack: () => void;
  onCustomerUpdated: (updated: CustomerDetailType) => void;
}> = ({ customer, onBack, onCustomerUpdated }) => {
  const [impersonating, setImpersonating] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'properties' | 'billing' | 'activity' | 'communications'>('overview');

  const handleImpersonate = async () => {
    setImpersonating(true);
    try {
      const res = await fetch(`/api/admin/impersonate/${customer.id}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        window.location.href = '/';
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to impersonate');
      }
    } catch {
      alert('Failed to impersonate customer');
    } finally {
      setImpersonating(false);
    }
  };

  const tabs: { key: typeof activeTab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'properties', label: 'Properties', count: customer.properties.length },
    { key: 'billing', label: 'Billing' },
    { key: 'activity', label: 'Activity' },
    { key: 'communications', label: 'Messages' },
  ];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-sm">
        ← Back to customer list
      </Button>

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-black text-white">{customer.firstName?.[0]}{customer.lastName?.[0]}</span>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black text-gray-900">{customer.name}</h2>
                {customer.isAdmin && (
                  <span className="text-[9px] font-black uppercase tracking-widest text-teal-700 bg-teal-100 px-2 py-1 rounded-full">Admin</span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{customer.email}</p>
              <p className="text-xs text-gray-400">{customer.phone || 'No phone'} · Member since {formatDate(customer.memberSince || customer.createdAt)}</p>
              {customer.stripeCustomerId && (
                <p className="text-xs text-gray-400 mt-1">Stripe: <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{customer.stripeCustomerId}</span></p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 flex-shrink-0">
            <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>
              Edit
            </Button>
            <Button onClick={handleImpersonate} disabled={impersonating} size="sm" className="bg-indigo-600 hover:bg-indigo-700">
              {impersonating ? 'Switching...' : 'Sign In as Customer'}
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
              activeTab === tab.key ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ''}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Contact Information</h3>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-sm text-gray-500">Full Name</span>
                <span className="text-sm font-bold text-gray-900">{customer.firstName} {customer.lastName}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-sm text-gray-500">Email</span>
                <span className="text-sm font-bold text-gray-900">{customer.email}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-sm text-gray-500">Phone</span>
                <span className="text-sm font-bold text-gray-900">{customer.phone || '—'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-sm text-gray-500">Properties</span>
                <span className="text-sm font-bold text-gray-900">{customer.properties.length}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-500">Admin</span>
                <span className={`text-sm font-bold ${customer.isAdmin ? 'text-teal-600' : 'text-gray-400'}`}>{customer.isAdmin ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Notes & Tags</h3>
            <CustomerNotes customerId={customer.id} />
          </Card>
        </div>
      )}

      {activeTab === 'properties' && (
        <Card className="p-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Properties ({customer.properties.length})</h3>
          {customer.properties.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {customer.properties.map(p => (
                <div key={p.id} className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                  <p className="text-sm font-bold text-gray-900">{p.address}</p>
                  <div className="flex gap-2 mt-2">
                    <span className="text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{p.serviceType}</span>
                    {p.transferStatus && <span className="text-[9px] font-black uppercase tracking-widest bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">Transfer: {p.transferStatus}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No properties linked to this customer</p>
          )}
        </Card>
      )}

      {activeTab === 'billing' && (
        <div className="space-y-6">
          {customer.stripe ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Balance</p>
                  <p className={`text-2xl font-black ${customer.stripe.balance < 0 ? 'text-green-600' : customer.stripe.balance > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    ${Math.abs(Number(customer.stripe.balance)).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400">{customer.stripe.balance < 0 ? 'credit' : customer.stripe.balance > 0 ? 'owed' : 'zero balance'}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Subscriptions</p>
                  <p className="text-2xl font-black text-gray-900">{customer.stripe.subscriptions.length}</p>
                  <p className="text-xs text-gray-400">{customer.stripe.subscriptions.filter(s => s.status === 'active').length} active</p>
                </Card>
                <Card className="p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Payment Methods</p>
                  <p className="text-2xl font-black text-gray-900">{customer.stripe.paymentMethods.length}</p>
                  <p className="text-xs text-gray-400">on file</p>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="p-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Subscriptions</h3>
                  {customer.stripe.subscriptions.length > 0 ? (
                    <div className="space-y-3">
                      {customer.stripe.subscriptions.map(sub => (
                        <div key={sub.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                          <div className="flex justify-between items-center">
                            <StatusBadge status={sub.status} />
                            <span className="text-xs text-gray-400">until {formatDate(sub.currentPeriodEnd)}</span>
                          </div>
                          {sub.items.map((item, i) => (
                            <p key={i} className="text-sm text-gray-700 mt-2">{item.productName} — <span className="font-bold">${item.amount}/{item.interval}</span></p>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-4">No subscriptions</p>
                  )}

                  <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mt-6 mb-4">Payment Methods</h3>
                  {customer.stripe.paymentMethods.length > 0 ? (
                    <div className="space-y-2">
                      {customer.stripe.paymentMethods.map(pm => (
                        <div key={pm.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                          <div className="w-10 h-7 bg-gray-200 rounded flex items-center justify-center text-[9px] font-black uppercase text-gray-500">{pm.brand}</div>
                          <span className="text-sm text-gray-700 font-mono">···· {pm.last4}</span>
                          <span className="text-xs text-gray-400 ml-auto">{pm.expMonth}/{pm.expYear}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-4">No payment methods on file</p>
                  )}
                </Card>

                <Card className="p-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Recent Invoices ({customer.stripe.invoices.length})</h3>
                  {customer.stripe.invoices.length > 0 ? (
                    <div className="space-y-2">
                      {customer.stripe.invoices.map(inv => (
                        <div key={inv.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                          <div>
                            <p className="text-sm font-bold text-gray-900">{inv.number || inv.id}</p>
                            <p className="text-xs text-gray-400">{formatDate(inv.created)}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-black text-gray-900">${Number(inv.amount).toFixed(2)}</span>
                            <StatusBadge status={inv.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-4">No invoices</p>
                  )}
                </Card>
              </div>
            </>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-gray-400 text-sm">No Stripe account linked to this customer</p>
              {customer.stripeCustomerId && <p className="text-xs text-gray-300 mt-1">ID: {customer.stripeCustomerId}</p>}
            </Card>
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <Card className="p-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Activity History</h3>
          <CustomerActivityTab customerId={customer.id} />
        </Card>
      )}

      {activeTab === 'communications' && (
        <CustomerCommunicationsTab customerId={customer.id} customerName={customer.name} />
      )}

      {showEdit && (
        <EditCustomerModal
          customer={customer}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            setShowEdit(false);
            onCustomerUpdated(updated);
          }}
        />
      )}
    </div>
  );
};

export default CustomerDetailPanel;
