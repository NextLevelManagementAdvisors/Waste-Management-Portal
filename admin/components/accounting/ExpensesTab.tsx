import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../../components/Card.tsx';
import { Button } from '../../../components/Button.tsx';
import { LoadingSpinner, Pagination, EmptyState, ConfirmDialog } from '../ui/index.ts';
import { PlusIcon } from '../../../components/Icons.tsx';
import ExpenseFormModal from './ExpenseFormModal.tsx';
import type { ExpenseItem } from './types.ts';
import { formatCurrency, formatDate, getCategoryLabel, EXPENSE_CATEGORIES } from './types.ts';

type DateRange = '30d' | '90d' | 'year' | 'all';

const getDateRange = (range: DateRange): { startDate?: string; endDate?: string } => {
  if (range === 'all') return {};
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  const start = new Date(now);
  if (range === '30d') start.setDate(start.getDate() - 30);
  else if (range === '90d') start.setDate(start.getDate() - 90);
  else if (range === 'year') start.setMonth(0, 1);
  return { startDate: start.toISOString().split('T')[0], endDate: end };
};

const ExpensesTab: React.FC = () => {
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [dateRange, setDateRange] = useState<DateRange>('90d');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ExpenseItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const limit = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { startDate, endDate } = getDateRange(dateRange);
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('page', String(Math.floor(offset / limit) + 1));
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (categoryFilter) params.set('category', categoryFilter);

      const res = await fetch(`/api/admin/accounting/expenses?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch expenses');
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setTotalAmount(data.totalAmount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading expenses');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [offset, dateRange, categoryFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/accounting/expenses/${deleteConfirm.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }
      setDeleteConfirm(null);
      fetchData();
    } catch (err) {
      console.error('Delete expense error:', err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleFormSave = () => {
    setShowForm(false);
    setEditingExpense(null);
    fetchData();
  };

  const dateRanges: { key: DateRange; label: string }[] = [
    { key: '30d', label: '30 Days' },
    { key: '90d', label: '90 Days' },
    { key: 'year', label: 'This Year' },
    { key: 'all', label: 'All Time' },
  ];

  return (
    <div className="space-y-4">
      {/* Actions + Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase mr-1">Period:</span>
            {dateRanges.map(r => (
              <button
                key={r.key}
                onClick={() => { setDateRange(r.key); setOffset(0); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  dateRange === r.key
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => { setEditingExpense(null); setShowForm(true); }}>
            <span className="flex items-center gap-1"><PlusIcon className="w-4 h-4" /> Add Expense</span>
          </Button>
        </div>
      </Card>

      {/* Category Filter */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => { setCategoryFilter(''); setOffset(0); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            !categoryFilter ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All
        </button>
        {EXPENSE_CATEGORIES.map(c => (
          <button
            key={c.value}
            onClick={() => { setCategoryFilter(c.value); setOffset(0); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              categoryFilter === c.value
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Summary */}
      {!loading && !error && (
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <p className="text-xs font-bold text-gray-400 uppercase">Total Entries</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{total}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-bold text-gray-400 uppercase">Total Expenses</p>
            <p className="text-2xl font-black text-red-600 mt-1">{formatCurrency(totalAmount)}</p>
          </Card>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <Card className="p-6"><div className="text-red-600 text-sm">{error}</div></Card>
      ) : items.length === 0 ? (
        <EmptyState message="No expenses found for this period." />
      ) : (
        <>
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600 hidden sm:table-cell">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600 hidden md:table-cell">Vendor</th>
                    <th className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600 hidden md:table-cell">Payment</th>
                    <th className="px-4 py-3 text-right text-xs font-black uppercase text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-700">{formatDate(item.expenseDate)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                          item.isDriverPay
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {item.isDriverPay && <span title="Auto-synced from job">&#128274;</span>}
                          {getCategoryLabel(item.category)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">{item.description || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{item.vendor || '-'}</td>
                      <td className="px-4 py-3 text-sm font-bold text-red-600 text-right">{formatCurrency(item.amount)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell capitalize">{item.paymentMethod || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        {!item.isDriverPay ? (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => { setEditingExpense(item); setShowForm(true); }}
                              className="px-2 py-1 text-xs font-bold text-teal-600 hover:bg-teal-50 rounded transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(item)}
                              className="px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50 rounded transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Auto</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {total > limit && (
            <Pagination total={total} limit={limit} offset={offset} onChange={setOffset} />
          )}
        </>
      )}

      {/* Modals */}
      <ExpenseFormModal
        isOpen={showForm}
        expense={editingExpense}
        onSave={handleFormSave}
        onClose={() => { setShowForm(false); setEditingExpense(null); }}
      />

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        title="Delete Expense"
        message={deleteConfirm ? `Delete "${deleteConfirm.description || getCategoryLabel(deleteConfirm.category)}" expense of ${formatCurrency(deleteConfirm.amount)}?` : ''}
        confirmLabel="Delete"
        isDangerous
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
        isLoading={deleteLoading}
      />
    </div>
  );
};

export default ExpensesTab;
