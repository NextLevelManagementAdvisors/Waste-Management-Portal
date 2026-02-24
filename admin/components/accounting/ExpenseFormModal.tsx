import React, { useState, useEffect } from 'react';
import { Button } from '../../../components/Button.tsx';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from './types.ts';
import type { ExpenseItem } from './types.ts';

interface ExpenseFormModalProps {
  isOpen: boolean;
  expense: ExpenseItem | null; // null = create, non-null = edit
  onSave: () => void;
  onClose: () => void;
}

const ExpenseFormModal: React.FC<ExpenseFormModalProps> = ({ isOpen, expense, onSave, onClose }) => {
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (expense) {
        setCategory(expense.category);
        setAmount(String(expense.amount));
        setExpenseDate(expense.expenseDate);
        setDescription(expense.description || '');
        setVendor(expense.vendor || '');
        setPaymentMethod(expense.paymentMethod || '');
        setNotes(expense.notes || '');
      } else {
        setCategory('');
        setAmount('');
        setExpenseDate(new Date().toISOString().split('T')[0]);
        setDescription('');
        setVendor('');
        setPaymentMethod('');
        setNotes('');
      }
      setError('');
    }
  }, [isOpen, expense]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !amount || parseFloat(amount) <= 0) {
      setError('Category and a positive amount are required');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const url = expense
        ? `/api/admin/accounting/expenses/${expense.id}`
        : '/api/admin/accounting/expenses';
      const method = expense ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          category,
          amount: parseFloat(amount),
          expenseDate: expenseDate || new Date().toISOString().split('T')[0],
          description: description || undefined,
          vendor: vendor || undefined,
          paymentMethod: paymentMethod || undefined,
          notes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save expense');
      }

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving expense');
    } finally {
      setLoading(false);
    }
  };

  const nonDriverCategories = EXPENSE_CATEGORIES.filter(c => c.value !== 'driver_pay');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-black text-gray-900">
            {expense ? 'Edit Expense' : 'Add Expense'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-sm text-red-600 p-3 bg-red-50 rounded-lg">{error}</div>}

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Category *</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              disabled={loading}
            >
              <option value="">Select category...</option>
              {nonDriverCategories.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Amount (USD) *</label>
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
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Date *</label>
              <input
                type="date"
                value={expenseDate}
                onChange={e => setExpenseDate(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What was this expense for?"
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Vendor</label>
              <input
                type="text"
                value={vendor}
                onChange={e => setVendor(e.target.value)}
                placeholder="e.g. Shell, AutoZone..."
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                disabled={loading}
              >
                <option value="">Select...</option>
                {PAYMENT_METHODS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional notes..."
              disabled={loading}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 disabled:opacity-50"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Saving...' : expense ? 'Update Expense' : 'Add Expense'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExpenseFormModal;
