import React, { useState, useEffect } from 'react';
import { LoadingSpinner, StatCard } from '../ui/index.ts';
import { Card } from '../../../components/Card.tsx';
import {
  UsersIcon,
  BuildingOffice2Icon,
  ChartPieIcon,
  ClockIcon,
  ArrowRightIcon,
  MapPinIcon,
} from '../../../components/Icons.tsx';
import ActivityFeed from '../operations/ActivityFeed.tsx';
import type { NavFilter } from '../../../shared/types/index.ts';

interface AdminStats {
  totalUsers: number;
  totalProperties: number;
  recentUsers: number;
  activeTransfers: number;
  totalReferrals: number;
  pendingReferrals: number;
  pendingReviews: number;
  revenue: number;
  activeSubscriptions: number;
  openInvoices: number;
}

type TabType = 'signups' | 'revenue' | 'services' | 'activity';

interface SignupData {
  date: string;
  count: string;
}

interface RevenueData {
  month: string;
  revenue: number;
}

interface ServiceData {
  service_type: string;
  count: string;
}

const DashboardView: React.FC<{ onNavigate: (view: string, filter?: { tab?: string; filter?: string; sort?: string; search?: string }) => void; navFilter?: NavFilter | null; onFilterConsumed?: () => void }> = ({ onNavigate, navFilter, onFilterConsumed }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<TabType>('signups');
  const [signupDays, setSignupDays] = useState<30 | 60 | 90>(90);
  const [signupData, setSignupData] = useState<SignupData[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [serviceData, setServiceData] = useState<ServiceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/stats', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setStats(data); })
      .catch(console.error)
      .finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => {
    if (navFilter?.tab) {
      const validTabs: TabType[] = ['signups', 'revenue', 'services', 'activity'];
      if (validTabs.includes(navFilter.tab as TabType)) {
        handleTabChange(navFilter.tab as TabType);
      }
      onFilterConsumed?.();
    }
  }, [navFilter]);

  const fetchSignupTrends = async (days: 30 | 60 | 90) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics/signups?days=${days}`);
      if (!res.ok) throw new Error('Failed to fetch signup trends');
      const data = await res.json();
      setSignupData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching data');
      setSignupData([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchRevenueData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/analytics/revenue?months=6');
      if (!res.ok) throw new Error('Failed to fetch revenue data');
      const data = await res.json();
      setRevenueData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching data');
      setRevenueData([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchServiceBreakdown = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/analytics/services');
      if (!res.ok) throw new Error('Failed to fetch service data');
      const data = await res.json();
      setServiceData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching data');
      setServiceData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setError(null);
    if (tab === 'signups') {
      fetchSignupTrends(signupDays);
    } else if (tab === 'revenue') {
      fetchRevenueData();
    } else if (tab === 'services') {
      fetchServiceBreakdown();
    }
    // 'activity' — ActivityFeed fetches its own data
  };

  const handleSignupDaysChange = (days: 30 | 60 | 90) => {
    setSignupDays(days);
    fetchSignupTrends(days);
  };

  useEffect(() => {
    fetchSignupTrends(signupDays);
  }, []);

  const SignupTrendsChart = () => {
    if (loading) return <LoadingSpinner />;
    if (error) return <div className="text-red-600 p-4">{error}</div>;
    if (!signupData.length) return <div className="text-gray-500 p-4">No data available</div>;

    const maxCount = Math.max(...signupData.map(d => parseInt(d.count)));
    const displayData = signupData.slice(-30);

    return (
      <div className="space-y-6">
        <div className="flex gap-2">
          {[30, 60, 90].map(days => (
            <button
              key={days}
              onClick={() => handleSignupDaysChange(days as 30 | 60 | 90)}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                signupDays === days
                  ? 'bg-teal-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {days} Days
            </button>
          ))}
        </div>

        <Card className="p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Daily Signups</h3>
          <div className="flex items-end justify-between h-80 gap-1 px-2">
            {displayData.map((item, idx) => {
              const count = parseInt(item.count);
              const height = maxCount === 0 ? 0 : (count / maxCount) * 100;
              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col items-center gap-2 group"
                  title={`${item.date}: ${count} signups`}
                >
                  <div className="w-full flex flex-col items-center">
                    <div className="text-xs font-semibold text-gray-700 group-hover:text-teal-600 transition-colors mb-2">
                      {count > 0 ? count : ''}
                    </div>
                    <div
                      className={`w-full rounded-t transition-all ${
                        count > 0 ? 'bg-teal-500 hover:bg-teal-600' : 'bg-gray-200'
                      }`}
                      style={{ height: `${Math.max(height, 4)}%`, minHeight: count > 0 ? '4px' : '2px' }}
                    />
                  </div>
                  <div className="text-xs text-gray-600 text-center w-full">
                    {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="Total Signups"
            value={signupData.reduce((sum, d) => sum + parseInt(d.count), 0)}
            icon={<span className="text-2xl">👤</span>}
          />
          <StatCard
            label="Avg Daily"
            value={Math.round(signupData.reduce((sum, d) => sum + parseInt(d.count), 0) / signupData.length)}
            icon={<span className="text-2xl">📊</span>}
          />
          <StatCard
            label="Peak Daily"
            value={maxCount}
            icon={<span className="text-2xl">📈</span>}
          />
        </div>
      </div>
    );
  };

  const RevenueChart = () => {
    if (loading) return <LoadingSpinner />;
    if (error) return <div className="text-red-600 p-4">{error}</div>;
    if (!revenueData.length) return <div className="text-gray-500 p-4">No data available</div>;

    const maxRevenue = Math.max(...revenueData.map(d => d.revenue));
    const totalRevenue = revenueData.reduce((sum, d) => sum + d.revenue, 0);

    return (
      <div className="space-y-6">
        <Card className="p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Monthly Revenue</h3>
          <div className="flex items-end justify-between h-80 gap-2 px-2">
            {revenueData.map((item, idx) => {
              const height = maxRevenue === 0 ? 0 : (item.revenue / maxRevenue) * 100;
              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col items-center gap-2 group"
                  title={`${item.month}: $${item.revenue.toFixed(2)}`}
                >
                  <div className="w-full flex flex-col items-center">
                    <div className="text-xs font-semibold text-gray-700 group-hover:text-teal-600 transition-colors mb-2">
                      ${item.revenue > 0 ? item.revenue.toFixed(0) : '0'}
                    </div>
                    <div
                      className={`w-full rounded-t transition-all ${
                        item.revenue > 0 ? 'bg-teal-500 hover:bg-teal-600' : 'bg-gray-200'
                      }`}
                      style={{ height: `${Math.max(height, 4)}%`, minHeight: item.revenue > 0 ? '4px' : '2px' }}
                    />
                  </div>
                  <div className="text-xs text-gray-600 text-center w-full">
                    {item.month}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="Total Revenue"
            value={`$${totalRevenue.toFixed(2)}`}
            icon={<span className="text-2xl">💰</span>}
          />
          <StatCard
            label="Avg Monthly"
            value={`$${(totalRevenue / revenueData.length).toFixed(0)}`}
            icon={<span className="text-2xl">📊</span>}
          />
          <StatCard
            label="Peak Month"
            value={`$${maxRevenue.toFixed(0)}`}
            icon={<span className="text-2xl">📈</span>}
          />
        </div>
      </div>
    );
  };

  const ServiceBreakdownChart = () => {
    if (loading) return <LoadingSpinner />;
    if (error) return <div className="text-red-600 p-4">{error}</div>;
    if (!serviceData.length) return <div className="text-gray-500 p-4">No data available</div>;

    const maxCount = Math.max(...serviceData.map(d => parseInt(d.count)));
    const totalServices = serviceData.reduce((sum, d) => sum + parseInt(d.count), 0);

    return (
      <div className="space-y-6">
        <Card className="p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Service Breakdown</h3>
          <div className="space-y-4">
            {serviceData.map((item, idx) => {
              const count = parseInt(item.count);
              const percentage = totalServices === 0 ? 0 : (count / totalServices) * 100;
              const width = maxCount === 0 ? 0 : (count / maxCount) * 100;

              return (
                <div key={idx} className="space-y-2 group">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold text-gray-900 capitalize">
                      {item.service_type}
                    </label>
                    <span className="text-sm font-bold text-teal-700">
                      {count} ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-8 overflow-hidden">
                    <div
                      className="bg-teal-500 h-full rounded-full transition-all group-hover:bg-teal-600 flex items-center justify-end pr-2"
                      style={{ width: `${Math.max(width, 5)}%` }}
                    >
                      {width > 15 && (
                        <span className="text-xs font-bold text-white">
                          {count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Total Services"
            value={totalServices}
            icon={<span className="text-2xl">🏠</span>}
          />
          <StatCard
            label="Service Types"
            value={serviceData.length}
            icon={<span className="text-2xl">📋</span>}
          />
          <StatCard
            label="Most Popular"
            value={serviceData.reduce((max, d) => parseInt(d.count) > parseInt(max.count) ? d : max).service_type}
            icon={<span className="text-2xl">⭐</span>}
            accent="text-teal-600"
          />
        </div>
      </div>
    );
  };

  if (statsLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-8">
      {stats ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="Total Customers" value={stats.totalUsers} icon={<UsersIcon className="w-8 h-8" />} onClick={() => onNavigate('contacts')} />
            <StatCard label="Total Properties" value={stats.totalProperties} icon={<BuildingOffice2Icon className="w-8 h-8" />} onClick={() => onNavigate('contacts')} />
            <StatCard label="New (30 Days)" value={stats.recentUsers} icon={<UsersIcon className="w-8 h-8" />} accent="text-green-600" onClick={() => onNavigate('contacts', { sort: 'newest' })} />
            <StatCard label="30-Day Revenue" value={`$${stats.revenue.toFixed(2)}`} icon={<ChartPieIcon className="w-8 h-8" />} accent="text-green-600" onClick={() => onNavigate('accounting', { tab: 'income' })} />
            <StatCard label="Active Subscriptions" value={stats.activeSubscriptions} icon={<ChartPieIcon className="w-8 h-8" />} onClick={() => onNavigate('accounting', { tab: 'customer-billing' })} />
            <StatCard label="Open Invoices" value={stats.openInvoices} icon={<ChartPieIcon className="w-8 h-8" />} accent="text-orange-500" onClick={() => onNavigate('accounting', { tab: 'invoices', filter: 'open' })} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Pending Reviews" value={stats.pendingReviews} icon={<MapPinIcon className="w-8 h-8" />} accent={stats.pendingReviews > 0 ? 'text-orange-500' : undefined} onClick={() => onNavigate('operations', { tab: 'address-review' })} />
            <StatCard label="Total Referrals" value={stats.totalReferrals} icon={<UsersIcon className="w-8 h-8" />} onClick={() => onNavigate('dashboard', { tab: 'activity' })} />
            <StatCard label="Pending Referrals" value={stats.pendingReferrals} icon={<ClockIcon className="w-8 h-8" />} accent="text-yellow-600" onClick={() => onNavigate('dashboard', { tab: 'activity' })} />
            <StatCard label="Active Transfers" value={stats.activeTransfers} icon={<ArrowRightIcon className="w-8 h-8" />} accent="text-blue-600" onClick={() => onNavigate('dashboard', { tab: 'activity' })} />
          </div>
        </div>
      ) : (
        <p className="text-gray-400">Failed to load stats</p>
      )}

      <div className="space-y-6">
        <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
          {([
            { key: 'signups' as TabType, label: 'Signup Trends' },
            { key: 'revenue' as TabType, label: 'Revenue' },
            { key: 'services' as TabType, label: 'Service Breakdown' },
            { key: 'activity' as TabType, label: 'Recent Activity' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`px-3 sm:px-5 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'text-teal-700 border-teal-600'
                  : 'text-gray-400 border-transparent hover:text-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="pt-4">
          {activeTab === 'signups' && <SignupTrendsChart />}
          {activeTab === 'revenue' && <RevenueChart />}
          {activeTab === 'services' && <ServiceBreakdownChart />}
          {activeTab === 'activity' && <ActivityFeed />}
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
