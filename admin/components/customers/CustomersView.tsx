import React, { useState } from 'react';
import { LoadingSpinner } from '../ui/index.ts';
import type { CustomerDetail, NavFilter } from '../../../shared/types/index.ts';
import CustomerList from './CustomerList.tsx';
import CustomerDetailPanel from './CustomerDetail.tsx';

const CustomersView: React.FC<{ navFilter?: NavFilter | null; onFilterConsumed?: () => void }> = ({ navFilter, onFilterConsumed }) => {
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadCustomerDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/customers/${id}`, { credentials: 'include' });
      if (res.ok) setSelectedCustomer(await res.json());
    } catch (e) {
      console.error('Failed to load customer detail:', e);
    } finally {
      setDetailLoading(false);
    }
  };

  if (detailLoading) return <LoadingSpinner />;

  if (selectedCustomer) {
    return (
      <CustomerDetailPanel
        customer={selectedCustomer}
        onBack={() => setSelectedCustomer(null)}
        onCustomerUpdated={(updated) => setSelectedCustomer(updated)}
      />
    );
  }

  return (
    <CustomerList
      navFilter={navFilter}
      onFilterConsumed={onFilterConsumed}
      onSelectCustomer={loadCustomerDetail}
    />
  );
};

export default CustomersView;
