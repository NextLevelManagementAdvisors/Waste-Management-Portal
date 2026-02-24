import { type Express, type Request, type Response } from 'express';
import { requireAdmin, requirePermission } from './adminRoutes';
import { billingRepo } from './repositories/BillingRepository';
import { expenseRepo, EXPENSE_CATEGORIES } from './repositories/ExpenseRepository';
import { storage } from './storage';

function getAdminId(req: Request) {
  return req.session.originalAdminUserId || req.session.userId!;
}

async function audit(req: Request, action: string, entityType?: string, entityId?: string, details?: any) {
  try { await storage.createAuditLog(getAdminId(req), action, entityType, entityId, details); } catch (e) { console.error('Audit log error:', e); }
}

export function registerAccountingRoutes(app: Express) {

  // ========================================================================
  // GET /api/admin/accounting/overview — Financial KPI summary
  // ========================================================================
  app.get('/api/admin/accounting/overview', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const now = new Date();
      const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
      const d90 = new Date(now); d90.setDate(d90.getDate() - 90);
      const start30 = d30.toISOString();
      const start90 = d90.toISOString();
      const end = now.toISOString();

      const [
        revenue30d,
        revenue90d,
        expenses30d,
        expenses90d,
        driverPay30d,
        driverPay90d,
        outstandingAR,
        subStats,
      ] = await Promise.all([
        billingRepo.getRevenueForPeriod(start30, end),
        billingRepo.getRevenueForPeriod(start90, end),
        expenseRepo.getTotals({ startDate: d30.toISOString().split('T')[0], endDate: now.toISOString().split('T')[0] }),
        expenseRepo.getTotals({ startDate: d90.toISOString().split('T')[0], endDate: now.toISOString().split('T')[0] }),
        expenseRepo.getDriverPayTotals({ startDate: d30.toISOString().split('T')[0], endDate: now.toISOString().split('T')[0] }),
        expenseRepo.getDriverPayTotals({ startDate: d90.toISOString().split('T')[0], endDate: now.toISOString().split('T')[0] }),
        billingRepo.getOutstandingAR(),
        billingRepo.getActiveSubscriptionStats(),
      ]);

      res.json({
        revenue30d,
        revenue90d,
        expenses30d: expenses30d + driverPay30d,
        expenses90d: expenses90d + driverPay90d,
        driverPay30d,
        netIncome30d: revenue30d - expenses30d - driverPay30d,
        outstandingAR,
        activeSubscriptions: subStats.count,
        monthlyRecurring: subStats.mrr,
      });
    } catch (error) {
      console.error('Accounting overview error:', error);
      res.status(500).json({ error: 'Failed to fetch accounting overview' });
    }
  });

  // ========================================================================
  // GET /api/admin/accounting/revenue-vs-expenses — Chart data
  // ========================================================================
  app.get('/api/admin/accounting/revenue-vs-expenses', requireAdmin, async (req: Request, res: Response) => {
    try {
      const months = parseInt(req.query.months as string) || 6;

      const [revenueSummary, expenseSummary] = await Promise.all([
        billingRepo.getRevenueSummary(months),
        expenseRepo.getMonthlyExpenseSummary(months),
      ]);

      // Merge by month
      const result = revenueSummary.map(r => {
        const exp = expenseSummary.find(e => e.month === r.month);
        const expenses = exp ? exp.expenses : 0;
        const driverPay = exp ? exp.driverPay : 0;
        return {
          month: r.month,
          revenue: r.revenue,
          expenses,
          driverPay,
          netIncome: r.revenue - expenses - driverPay,
        };
      });

      res.json(result);
    } catch (error) {
      console.error('Revenue vs expenses error:', error);
      res.status(500).json({ error: 'Failed to fetch revenue vs expenses' });
    }
  });

  // ========================================================================
  // GET /api/admin/accounting/income — Paginated paid invoices (income)
  // ========================================================================
  app.get('/api/admin/accounting/income', requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const page = parseInt(req.query.page as string) || 1;
      const offset = (page - 1) * limit;
      const startDate = (req.query.startDate as string) || undefined;
      const endDate = (req.query.endDate as string) || undefined;

      const [items, total, totalAmount] = await Promise.all([
        billingRepo.listAllPaidInvoices({ startDate, endDate, limit, offset }),
        billingRepo.countAllPaidInvoices({ startDate, endDate }),
        billingRepo.getPaidInvoicesTotalAmount({ startDate, endDate }),
      ]);

      res.json({
        items: items.map(i => ({
          id: i.id,
          number: i.number,
          amount: parseFloat(i.amount_paid) / 100,
          status: i.status,
          customerName: i.customer_name,
          customerEmail: i.customer_email,
          created: i.created ? new Date(i.created * 1000).toISOString() : null,
          hostedInvoiceUrl: i.hosted_invoice_url,
        })),
        total,
        page,
        limit,
        totalAmount,
      });
    } catch (error) {
      console.error('Income list error:', error);
      res.status(500).json({ error: 'Failed to fetch income data' });
    }
  });

  // ========================================================================
  // GET /api/admin/accounting/invoices — All invoices across customers
  // ========================================================================
  app.get('/api/admin/accounting/invoices', requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const page = parseInt(req.query.page as string) || 1;
      const offset = (page - 1) * limit;
      const status = (req.query.status as string) || undefined;
      const startDate = (req.query.startDate as string) || undefined;
      const endDate = (req.query.endDate as string) || undefined;

      const [items, total] = await Promise.all([
        billingRepo.listAllInvoices({ status, startDate, endDate, limit, offset }),
        billingRepo.countAllInvoices({ status, startDate, endDate }),
      ]);

      res.json({
        items: items.map(i => ({
          id: i.id,
          number: i.number,
          amount: parseFloat(i.amount_due) / 100,
          amountPaid: parseFloat(i.amount_paid) / 100,
          amountRemaining: parseFloat(i.amount_remaining) / 100,
          status: i.status,
          customerName: i.customer_name,
          customerEmail: i.customer_email,
          dueDate: i.due_date ? new Date(i.due_date * 1000).toISOString() : null,
          created: i.created ? new Date(i.created * 1000).toISOString() : null,
          hostedInvoiceUrl: i.hosted_invoice_url,
        })),
        total,
        page,
        limit,
      });
    } catch (error) {
      console.error('Invoices list error:', error);
      res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  });

  // ========================================================================
  // GET /api/admin/accounting/expenses — Paginated expenses
  // ========================================================================
  app.get('/api/admin/accounting/expenses', requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const page = parseInt(req.query.page as string) || 1;
      const offset = (page - 1) * limit;
      const category = (req.query.category as string) || undefined;
      const startDate = (req.query.startDate as string) || undefined;
      const endDate = (req.query.endDate as string) || undefined;

      const [items, total, totalAmount] = await Promise.all([
        expenseRepo.list({ category, startDate, endDate, limit, offset }),
        expenseRepo.count({ category, startDate, endDate }),
        expenseRepo.getTotals({ startDate, endDate }),
      ]);

      res.json({
        items: items.map(e => ({
          id: e.id,
          category: e.category,
          description: e.description,
          amount: parseFloat(e.amount),
          expenseDate: e.expense_date,
          vendor: e.vendor,
          paymentMethod: e.payment_method,
          referenceId: e.reference_id,
          referenceType: e.reference_type,
          isDriverPay: e.reference_type === 'route_job',
          notes: e.notes,
          createdAt: e.created_at,
        })),
        total,
        page,
        limit,
        totalAmount,
      });
    } catch (error) {
      console.error('Expenses list error:', error);
      res.status(500).json({ error: 'Failed to fetch expenses' });
    }
  });

  // ========================================================================
  // POST /api/admin/accounting/expenses — Create manual expense
  // ========================================================================
  app.post('/api/admin/accounting/expenses', requireAdmin, requirePermission('billing'), async (req: Request, res: Response) => {
    try {
      const { category, description, amount, expenseDate, vendor, paymentMethod, notes } = req.body;

      if (!category || !amount || amount <= 0) {
        return res.status(400).json({ error: 'category and a positive amount are required' });
      }
      if (!EXPENSE_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: `Invalid category. Must be one of: ${EXPENSE_CATEGORIES.join(', ')}` });
      }

      const expense = await expenseRepo.create({
        category,
        description,
        amount: parseFloat(amount),
        expenseDate: expenseDate || new Date().toISOString().split('T')[0],
        vendor,
        paymentMethod,
        notes,
        createdBy: getAdminId(req),
      });

      await audit(req, 'create_expense', 'expense', expense.id, { category, amount, description });

      res.json({ success: true, expense });
    } catch (error) {
      console.error('Create expense error:', error);
      res.status(500).json({ error: 'Failed to create expense' });
    }
  });

  // ========================================================================
  // PUT /api/admin/accounting/expenses/:id — Update manual expense
  // ========================================================================
  app.put('/api/admin/accounting/expenses/:id', requireAdmin, requirePermission('billing'), async (req: Request, res: Response) => {
    try {
      const existing = await expenseRepo.getById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'Expense not found' });
      }
      if (existing.reference_type === 'route_job') {
        return res.status(403).json({ error: 'Cannot edit auto-synced driver pay expenses' });
      }

      const { category, description, amount, expenseDate, vendor, paymentMethod, notes } = req.body;
      if (category && !EXPENSE_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: `Invalid category` });
      }

      const updated = await expenseRepo.update(req.params.id, {
        category, description, amount: amount ? parseFloat(amount) : undefined,
        expenseDate, vendor, paymentMethod, notes,
      });

      await audit(req, 'update_expense', 'expense', req.params.id, req.body);

      res.json({ success: true, expense: updated });
    } catch (error) {
      console.error('Update expense error:', error);
      res.status(500).json({ error: 'Failed to update expense' });
    }
  });

  // ========================================================================
  // DELETE /api/admin/accounting/expenses/:id — Delete manual expense
  // ========================================================================
  app.delete('/api/admin/accounting/expenses/:id', requireAdmin, requirePermission('billing'), async (req: Request, res: Response) => {
    try {
      const existing = await expenseRepo.getById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'Expense not found' });
      }
      if (existing.reference_type === 'route_job') {
        return res.status(403).json({ error: 'Cannot delete auto-synced driver pay expenses' });
      }

      const deleted = await expenseRepo.delete(req.params.id);
      if (!deleted) {
        return res.status(500).json({ error: 'Failed to delete expense' });
      }

      await audit(req, 'delete_expense', 'expense', req.params.id, { category: existing.category, amount: existing.amount });

      res.json({ success: true });
    } catch (error) {
      console.error('Delete expense error:', error);
      res.status(500).json({ error: 'Failed to delete expense' });
    }
  });

  // ========================================================================
  // GET /api/admin/accounting/categories — Expense categories list
  // ========================================================================
  app.get('/api/admin/accounting/categories', requireAdmin, (_req: Request, res: Response) => {
    res.json(EXPENSE_CATEGORIES);
  });
}
