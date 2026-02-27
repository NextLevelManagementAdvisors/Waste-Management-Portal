import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../../components/Card.tsx';
import { LoadingSpinner, EmptyState, ConfirmDialog } from '../ui/index.ts';
import { formatCurrency, formatDate } from './types.ts';

interface DriverPayJob {
  id: string;
  title: string;
  scheduledDate: string;
  basePay: number | null;
  actualPay: number | null;
  paymentStatus: string;
  driverId: string;
  driverName: string;
  driverStripeId: string | null;
}

interface PaymentSummary {
  unpaidCount: number;
  paidCount: number;
  unpaidTotal: number;
  paidTotal: number;
}

type StatusFilter = '' | 'unpaid' | 'paid' | 'processing';

const statusBadge = (status: string) => {
  switch (status) {
    case 'paid':
      return 'bg-green-100 text-green-700';
    case 'processing':
      return 'bg-yellow-100 text-yellow-700';
    default:
      return 'bg-red-100 text-red-700';
  }
};

const DriverPayTab: React.FC = () => {
  const [jobs, setJobs] = useState<DriverPayJob[]>([]);
  const [summary, setSummary] = useState<PaymentSummary>({ unpaidCount: 0, paidCount: 0, unpaidTotal: 0, paidTotal: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [markPaidJob, setMarkPaidJob] = useState<DriverPayJob | null>(null);
  const [markLoading, setMarkLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('payment_status', statusFilter);
      const res = await fetch(`/api/admin/driver-payments?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch driver payments');
      const data = await res.json();
      setJobs(data.jobs);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading driver payments');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleMarkPaid = async () => {
    if (!markPaidJob) return;
    setMarkLoading(true);
    try {
      const res = await fetch(`/api/admin/routes/${markPaidJob.id}/payment-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ payment_status: 'paid' }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setMarkPaidJob(null);
      fetchData();
    } catch (err) {
      console.error('Mark paid error:', err);
    } finally {
      setMarkLoading(false);
    }
  };

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: '', label: 'All' },
    { key: 'unpaid', label: 'Unpaid' },
    { key: 'processing', label: 'Processing' },
    { key: 'paid', label: 'Paid' },
  ];

  // Group by driver for summary
  const driverSummary = jobs.reduce<Record<string, { name: string; total: number; count: number }>>((acc, j) => {
    if (!acc[j.driverId]) acc[j.driverId] = { name: j.driverName, total: 0, count: 0 };
    acc[j.driverId].total += j.actualPay ?? j.basePay ?? 0;
    acc[j.driverId].count++;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {!loading && !error && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-xs font-bold text-gray-400 uppercase">Unpaid Jobs</p>
            <p className="text-2xl font-black text-red-600 mt-1">{summary.unpaidCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-bold text-gray-400 uppercase">Unpaid Amount</p>
            <p className="text-2xl font-black text-red-600 mt-1">{formatCurrency(summary.unpaidTotal)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-bold text-gray-400 uppercase">Paid Jobs</p>
            <p className="text-2xl font-black text-green-600 mt-1">{summary.paidCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-bold text-gray-400 uppercase">Paid Amount</p>
            <p className="text-2xl font-black text-green-600 mt-1">{formatCurrency(summary.paidTotal)}</p>
          </Card>
        </div>
      )}

      {/* Status Filter */}
      <div className="flex gap-1.5 flex-wrap">
        {statusFilters.map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              statusFilter === f.key
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Per-Driver Summary (when showing all) */}
      {!loading && !error && !statusFilter && Object.keys(driverSummary).length > 1 && (
        <Card className="p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-2">By Driver</h3>
          <div className="flex flex-wrap gap-3">
            {(Object.entries(driverSummary) as [string, { name: string; total: number; count: number }][]).map(([id, d]) => (
              <div key={id} className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
                <span className="font-bold text-gray-800">{d.name}</span>
                <span className="text-gray-500 ml-2">{d.count} jobs</span>
                <span className="font-bold text-gray-900 ml-2">{formatCurrency(d.total)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Jobs Table */}
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <Card className="p-6"><div className="text-red-600 text-sm">{error}</div></Card>
      ) : jobs.length === 0 ? (
        <EmptyState message="No completed jobs with assigned drivers found." />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Job</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Driver</th>
                  <th className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600">Base Pay</th>
                  <th className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600">Actual Pay</th>
                  <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => (
                  <tr key={j.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-700">{formatDate(j.scheduledDate)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{j.title}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{j.driverName || 'Unknown'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">{j.basePay != null ? formatCurrency(j.basePay) : '-'}</td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{j.actualPay != null ? formatCurrency(j.actualPay) : '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${statusBadge(j.paymentStatus)}`}>
                        {j.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {j.paymentStatus !== 'paid' && (
                        <button
                          onClick={() => setMarkPaidJob(j)}
                          className="px-2 py-1 text-xs font-bold text-green-600 hover:bg-green-50 rounded transition-colors"
                        >
                          Mark Paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmDialog
        isOpen={markPaidJob !== null}
        title="Mark as Paid"
        message={markPaidJob ? `Mark "${markPaidJob.title}" (${markPaidJob.driverName}) as paid for ${formatCurrency(markPaidJob.actualPay ?? markPaidJob.basePay ?? 0)}?` : ''}
        confirmLabel="Mark Paid"
        onConfirm={handleMarkPaid}
        onCancel={() => setMarkPaidJob(null)}
        isLoading={markLoading}
      />
    </div>
  );
};

export default DriverPayTab;
