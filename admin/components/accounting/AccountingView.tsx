import React, { useState, useEffect } from 'react';
import type { NavFilter } from '../../../shared/types/index.ts';
import OverviewTab from './OverviewTab.tsx';
import IncomeTab from './IncomeTab.tsx';
import ExpensesTab from './ExpensesTab.tsx';
import InvoicesTab from './InvoicesTab.tsx';
import CustomerBillingTab from './CustomerBillingTab.tsx';

export type AccountingTabType = 'overview' | 'income' | 'expenses' | 'invoices' | 'customer-billing';

interface AccountingViewProps {
  navFilter?: NavFilter | null;
  onFilterConsumed?: () => void;
  activeTab?: AccountingTabType;
  onTabChange?: (tab: AccountingTabType) => void;
}

const AccountingView: React.FC<AccountingViewProps> = ({ navFilter, onFilterConsumed, activeTab: controlledTab, onTabChange }) => {
  const [internalTab, setInternalTab] = useState<AccountingTabType>('overview');
  const activeTab = controlledTab ?? internalTab;

  const setActiveTab = (tab: AccountingTabType) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  useEffect(() => {
    if (navFilter?.tab) {
      const validTabs: AccountingTabType[] = ['overview', 'income', 'expenses', 'invoices', 'customer-billing'];
      if (validTabs.includes(navFilter.tab as AccountingTabType)) {
        setActiveTab(navFilter.tab as AccountingTabType);
      }
      // Don't consume yet — child tabs may also need the filter
    }
  }, [navFilter]);

  const tabs: { key: AccountingTabType; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'income', label: 'Income' },
    { key: 'expenses', label: 'Expenses' },
    { key: 'invoices', label: 'Invoices' },
    { key: 'customer-billing', label: 'Customer Billing' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 sm:px-5 py-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'income' && <IncomeTab />}
      {activeTab === 'expenses' && <ExpensesTab />}
      {activeTab === 'invoices' && <InvoicesTab navFilter={navFilter} onFilterConsumed={onFilterConsumed} />}
      {activeTab === 'customer-billing' && <CustomerBillingTab navFilter={navFilter} onFilterConsumed={onFilterConsumed} />}
    </div>
  );
};

export default AccountingView;
