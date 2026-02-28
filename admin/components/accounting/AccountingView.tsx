import React, { useState, useEffect } from 'react';
import type { NavFilter } from '../../../shared/types/index.ts';
import OverviewTab from './OverviewTab.tsx';
import IncomeTab from './IncomeTab.tsx';
import InvoicesTab from './InvoicesTab.tsx';
import CustomerBillingTab from './CustomerBillingTab.tsx';
import SubscriptionsTab from './SubscriptionsTab.tsx';
import ExpensesTab from './ExpensesTab.tsx';
import DriverPayTab from './DriverPayTab.tsx';

export type AccountingTabType = 'overview' | 'income' | 'expenses';

type IncomeSubTab = 'revenue' | 'subscriptions' | 'invoices' | 'customer-billing';
type ExpensesSubTab = 'operational' | 'driver-pay';

interface AccountingViewProps {
  navFilter?: NavFilter | null;
  onFilterConsumed?: () => void;
  activeTab?: AccountingTabType;
  onTabChange?: (tab: AccountingTabType) => void;
}

const AccountingView: React.FC<AccountingViewProps> = ({ navFilter, onFilterConsumed, activeTab: controlledTab, onTabChange }) => {
  const [internalTab, setInternalTab] = useState<AccountingTabType>('overview');
  const activeTab = controlledTab ?? internalTab;

  const [incomeSubTab, setIncomeSubTab] = useState<IncomeSubTab>('revenue');
  const [expensesSubTab, setExpensesSubTab] = useState<ExpensesSubTab>('operational');

  const setActiveTab = (tab: AccountingTabType) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  useEffect(() => {
    if (navFilter?.tab) {
      const validTabs: AccountingTabType[] = ['overview', 'income', 'expenses'];
      if (validTabs.includes(navFilter.tab as AccountingTabType)) {
        setActiveTab(navFilter.tab as AccountingTabType);
      }
      // Legacy tab mapping: redirect old tab names to new structure
      if (navFilter.tab === 'invoices') {
        setActiveTab('income');
        setIncomeSubTab('invoices');
      } else if (navFilter.tab === 'customer-billing') {
        setActiveTab('income');
        setIncomeSubTab('customer-billing');
      } else if (navFilter.tab === 'subscriptions') {
        setActiveTab('income');
        setIncomeSubTab('subscriptions');
      } else if (navFilter.tab === 'driver-pay') {
        setActiveTab('expenses');
        setExpensesSubTab('driver-pay');
      }
    }
  }, [navFilter]);

  const tabs: { key: AccountingTabType; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'income', label: 'Income' },
    { key: 'expenses', label: 'Expenses' },
  ];

  const incomeSubTabs: { key: IncomeSubTab; label: string }[] = [
    { key: 'revenue', label: 'Revenue' },
    { key: 'subscriptions', label: 'Subscriptions' },
    { key: 'invoices', label: 'Invoices' },
    { key: 'customer-billing', label: 'Customer Billing' },
  ];

  const expensesSubTabs: { key: ExpensesSubTab; label: string }[] = [
    { key: 'operational', label: 'Operational' },
    { key: 'driver-pay', label: 'Driver Pay' },
  ];

  return (
    <div className="space-y-6">
      {/* Top-level tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
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

      {/* Overview */}
      {activeTab === 'overview' && <OverviewTab />}

      {/* Income section with sub-tabs */}
      {activeTab === 'income' && (
        <div className="space-y-4">
          <div className="flex gap-1.5 flex-wrap">
            {incomeSubTabs.map(st => (
              <button
                key={st.key}
                onClick={() => setIncomeSubTab(st.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  incomeSubTab === st.key
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
          {incomeSubTab === 'revenue' && <IncomeTab />}
          {incomeSubTab === 'subscriptions' && <SubscriptionsTab />}
          {incomeSubTab === 'invoices' && <InvoicesTab navFilter={navFilter} onFilterConsumed={onFilterConsumed} />}
          {incomeSubTab === 'customer-billing' && <CustomerBillingTab navFilter={navFilter} onFilterConsumed={onFilterConsumed} />}
        </div>
      )}

      {/* Expenses section with sub-tabs */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex gap-1.5 flex-wrap">
            {expensesSubTabs.map(st => (
              <button
                key={st.key}
                onClick={() => setExpensesSubTab(st.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  expensesSubTab === st.key
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
          {expensesSubTab === 'operational' && <ExpensesTab />}
          {expensesSubTab === 'driver-pay' && <DriverPayTab />}
        </div>
      )}
    </div>
  );
};

export default AccountingView;
