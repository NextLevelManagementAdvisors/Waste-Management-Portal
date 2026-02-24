import React, { useState, useEffect } from 'react';
import { Card } from '../../../components/Card.tsx';
import { StatCard, LoadingSpinner } from '../ui/index.ts';
import { CurrencyDollarIcon, ArrowRightIcon } from '../../../components/Icons.tsx';
import type { AccountingOverview, RevenueVsExpense } from './types.ts';
import { formatCurrency } from './types.ts';

const OverviewTab: React.FC = () => {
  const [overview, setOverview] = useState<AccountingOverview | null>(null);
  const [chartData, setChartData] = useState<RevenueVsExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [overviewRes, chartRes] = await Promise.all([
          fetch('/api/admin/accounting/overview', { credentials: 'include' }),
          fetch('/api/admin/accounting/revenue-vs-expenses?months=6', { credentials: 'include' }),
        ]);
        if (!overviewRes.ok) throw new Error('Failed to fetch overview');
        if (!chartRes.ok) throw new Error('Failed to fetch chart data');
        setOverview(await overviewRes.json());
        setChartData(await chartRes.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading overview');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <LoadingSpinner />;

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-red-600 text-sm">{error}</div>
      </Card>
    );
  }

  if (!overview) return null;

  const maxVal = Math.max(...chartData.map(d => Math.max(d.revenue, d.expenses + d.driverPay)), 1);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="30-Day Revenue"
          value={formatCurrency(overview.revenue30d)}
          icon={<CurrencyDollarIcon className="w-8 h-8" />}
          accent="text-green-700"
        />
        <StatCard
          label="30-Day Expenses"
          value={formatCurrency(overview.expenses30d)}
          icon={<ArrowRightIcon className="w-8 h-8 rotate-90" />}
          accent="text-red-600"
        />
        <StatCard
          label="Net Income (30d)"
          value={formatCurrency(overview.netIncome30d)}
          icon={<CurrencyDollarIcon className="w-8 h-8" />}
          accent={overview.netIncome30d >= 0 ? 'text-green-700' : 'text-red-600'}
        />
        <StatCard
          label="Outstanding A/R"
          value={formatCurrency(overview.outstandingAR)}
          icon={<CurrencyDollarIcon className="w-8 h-8" />}
          accent="text-amber-600"
        />
        <StatCard
          label="Active Subscriptions"
          value={overview.activeSubscriptions}
          icon={<ArrowRightIcon className="w-8 h-8" />}
          accent="text-teal-700"
        />
        <StatCard
          label="Monthly Recurring"
          value={formatCurrency(overview.monthlyRecurring)}
          icon={<CurrencyDollarIcon className="w-8 h-8" />}
          accent="text-teal-700"
        />
      </div>

      {/* Revenue vs Expenses Chart */}
      {chartData.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-black text-gray-900 mb-2">Revenue vs. Expenses</h3>
          <p className="text-xs text-gray-500 mb-6">Last 6 months</p>

          <div className="flex items-end justify-between h-64 gap-3 px-2">
            {chartData.map((item, idx) => {
              const revHeight = maxVal === 0 ? 0 : (item.revenue / maxVal) * 100;
              const expHeight = maxVal === 0 ? 0 : ((item.expenses + item.driverPay) / maxVal) * 100;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="text-xs font-semibold text-gray-500 mb-1">
                    {item.revenue > 0 ? `$${(item.revenue / 1000).toFixed(1)}k` : '$0'}
                  </div>
                  <div className="w-full flex gap-1 items-end" style={{ height: '100%' }}>
                    <div
                      className="flex-1 bg-green-500 hover:bg-green-600 rounded-t transition-all"
                      style={{ height: `${Math.max(revHeight, 2)}%`, minHeight: '2px' }}
                      title={`Revenue: ${formatCurrency(item.revenue)}`}
                    />
                    <div
                      className="flex-1 bg-red-400 hover:bg-red-500 rounded-t transition-all"
                      style={{ height: `${Math.max(expHeight, 2)}%`, minHeight: '2px' }}
                      title={`Expenses: ${formatCurrency(item.expenses + item.driverPay)}`}
                    />
                  </div>
                  <div className="text-xs text-gray-600 text-center mt-1">{item.month}</div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span className="text-xs font-semibold text-gray-600">Revenue</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-400" />
              <span className="text-xs font-semibold text-gray-600">Expenses</span>
            </div>
          </div>
        </Card>
      )}

      {/* 90-Day Summary */}
      <Card className="p-6">
        <h3 className="text-lg font-black text-gray-900 mb-4">90-Day Summary</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-xs font-bold uppercase text-green-600 mb-1">Revenue</p>
            <p className="text-xl font-black text-green-800">{formatCurrency(overview.revenue90d)}</p>
          </div>
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <p className="text-xs font-bold uppercase text-red-600 mb-1">Expenses</p>
            <p className="text-xl font-black text-red-800">{formatCurrency(overview.expenses90d)}</p>
          </div>
          <div className={`p-4 rounded-lg border ${overview.revenue90d - overview.expenses90d >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <p className="text-xs font-bold uppercase text-gray-600 mb-1">Net Income</p>
            <p className={`text-xl font-black ${overview.revenue90d - overview.expenses90d >= 0 ? 'text-green-800' : 'text-red-800'}`}>
              {formatCurrency(overview.revenue90d - overview.expenses90d)}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default OverviewTab;
