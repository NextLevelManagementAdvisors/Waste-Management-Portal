import React, { useState, useEffect } from 'react';
import { Card } from '../../components/Card';

type Period = 'month' | 'quarter' | 'year' | 'custom';

interface Summary {
  total_revenue: number;
  routes_completed: number;
  avg_revenue_per_route: number;
  pending_payment: number;
}

interface Payment {
  route_id: string;
  route_name: string;
  zone_name?: string;
  scheduled_date: string;
  stop_count: number;
  per_stop_rate: number;
  total: number;
  payment_status: string;
}

interface BreakdownItem {
  id: string;
  name: string;
  revenue: number;
  routes: number;
  stops: number;
}

function getPeriodDates(period: Period, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (period === 'custom') return { from: customFrom, to: customTo };
  if (period === 'month') {
    return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) };
  }
  if (period === 'quarter') {
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    return { from: fmt(qStart), to: fmt(now) };
  }
  // year
  return { from: fmt(new Date(now.getFullYear(), 0, 1)), to: fmt(now) };
}

const ProviderAccountingView: React.FC = () => {
  const [period, setPeriod] = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [breakdownTab, setBreakdownTab] = useState<'drivers' | 'vehicles'>('drivers');

  const [summary, setSummary] = useState<Summary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [breakdown, setBreakdown] = useState<BreakdownItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { from, to } = getPeriodDates(period, customFrom, customTo);
    if (!from || !to) return;
    setLoading(true);
    try {
      const [summaryRes, paymentsRes, breakdownRes] = await Promise.all([
        fetch(`/api/team/my-provider/accounting/summary?from=${from}&to=${to}`, { credentials: 'include' }),
        fetch(`/api/team/my-provider/accounting/payments?from=${from}&to=${to}&limit=50`, { credentials: 'include' }),
        fetch(`/api/team/my-provider/accounting/breakdown/${breakdownTab}?from=${from}&to=${to}`, { credentials: 'include' }),
      ]);
      if (summaryRes.ok) setSummary((await summaryRes.json()).summary);
      if (paymentsRes.ok) setPayments((await paymentsRes.json()).payments || []);
      if (breakdownRes.ok) setBreakdown((await breakdownRes.json()).breakdown || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [period, customFrom, customTo, breakdownTab]);

  const fmt = (n?: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const paymentBadge = (status: string) => {
    const cls = status === 'paid' ? 'bg-green-100 text-green-800' : status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600';
    return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{status}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex flex-wrap items-center gap-3">
        {(['month', 'quarter', 'year', 'custom'] as Period[]).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${period === p ? 'bg-teal-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            {p === 'month' ? 'This Month' : p === 'quarter' ? 'This Quarter' : p === 'year' ? 'This Year' : 'Custom'}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400 text-sm">Loading accounting data...</div>
      ) : (
        <>
          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Revenue', value: fmt(summary.total_revenue), highlight: true },
                { label: 'Routes Completed', value: summary.routes_completed },
                { label: 'Avg / Route', value: fmt(summary.avg_revenue_per_route) },
                { label: 'Pending Payment', value: fmt(summary.pending_payment) },
              ].map(s => (
                <Card key={s.label} className={`p-5 ${s.highlight ? 'border-teal-200' : ''}`}>
                  <p className="text-xs text-gray-500 font-medium">{s.label}</p>
                  <p className={`text-2xl font-black mt-1 ${s.highlight ? 'text-teal-700' : 'text-gray-900'}`}>{s.value}</p>
                </Card>
              ))}
            </div>
          )}

          {/* Breakdown */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Earnings Breakdown</h3>
              <div className="flex gap-1">
                {(['drivers', 'vehicles'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setBreakdownTab(tab)}
                    className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors ${breakdownTab === tab ? 'bg-teal-100 text-teal-800' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    By {tab === 'drivers' ? 'Driver' : 'Vehicle'}
                  </button>
                ))}
              </div>
            </div>

            {breakdown.length === 0 ? (
              <div className="py-6 text-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
                No data for this period
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 pr-4 font-medium text-gray-600">{breakdownTab === 'drivers' ? 'Driver' : 'Vehicle'}</th>
                      <th className="text-right py-2 pr-4 font-medium text-gray-600">Routes</th>
                      <th className="text-right py-2 pr-4 font-medium text-gray-600">Stops</th>
                      <th className="text-right py-2 font-medium text-gray-600">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {breakdown.map(b => (
                      <tr key={b.id}>
                        <td className="py-3 pr-4 font-medium text-gray-900">{b.name}</td>
                        <td className="py-3 pr-4 text-right text-gray-700">{b.routes}</td>
                        <td className="py-3 pr-4 text-right text-gray-700">{b.stops}</td>
                        <td className="py-3 text-right font-semibold text-gray-900">{fmt(b.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Payment History */}
          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Payment History</h3>
            {payments.length === 0 ? (
              <div className="py-6 text-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
                No payments in this period
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 pr-4 font-medium text-gray-600">Route</th>
                      <th className="text-left py-2 pr-4 font-medium text-gray-600">Date</th>
                      <th className="text-right py-2 pr-4 font-medium text-gray-600">Stops</th>
                      <th className="text-right py-2 pr-4 font-medium text-gray-600">Rate</th>
                      <th className="text-right py-2 pr-4 font-medium text-gray-600">Total</th>
                      <th className="text-right py-2 font-medium text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payments.map(p => (
                      <tr key={p.route_id}>
                        <td className="py-3 pr-4">
                          <p className="font-medium text-gray-900">{p.route_name || 'Route'}</p>
                          {p.zone_name && <p className="text-xs text-gray-500">{p.zone_name}</p>}
                        </td>
                        <td className="py-3 pr-4 text-gray-600">
                          {new Date(p.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                        <td className="py-3 pr-4 text-right text-gray-700">{p.stop_count}</td>
                        <td className="py-3 pr-4 text-right text-gray-700">${p.per_stop_rate}/stop</td>
                        <td className="py-3 pr-4 text-right font-semibold text-gray-900">{fmt(p.total)}</td>
                        <td className="py-3 text-right">{paymentBadge(p.payment_status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

export default ProviderAccountingView;
