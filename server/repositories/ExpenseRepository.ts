import { BaseRepository } from '../db';

export interface CreateExpenseInput {
  category: string;
  description?: string;
  amount: number;
  expenseDate: string;
  vendor?: string;
  referenceId?: string;
  referenceType?: string;
  paymentMethod?: string;
  notes?: string;
  createdBy: string;
}

export interface ExpenseRow {
  id: string;
  category: string;
  description: string | null;
  amount: string; // numeric comes as string from pg
  expense_date: string;
  vendor: string | null;
  reference_id: string | null;
  reference_type: string | null;
  payment_method: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const EXPENSE_CATEGORIES = [
  'driver_pay',
  'fuel',
  'vehicle_maintenance',
  'insurance',
  'equipment',
  'office_admin',
  'disposal_fees',
  'permits_licensing',
  'marketing',
  'utilities',
  'rent_lease',
  'professional_services',
  'other',
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export class ExpenseRepository extends BaseRepository {
  async create(data: CreateExpenseInput): Promise<ExpenseRow> {
    const result = await this.query(
      `INSERT INTO expenses (category, description, amount, expense_date, vendor, reference_id, reference_type, payment_method, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.category,
        data.description || null,
        data.amount,
        data.expenseDate,
        data.vendor || null,
        data.referenceId || null,
        data.referenceType || null,
        data.paymentMethod || null,
        data.notes || null,
        data.createdBy,
      ]
    );
    return result.rows[0];
  }

  async update(id: string, data: Partial<Omit<CreateExpenseInput, 'createdBy'>>): Promise<ExpenseRow | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.category !== undefined) { fields.push(`category = $${idx++}`); values.push(data.category); }
    if (data.description !== undefined) { fields.push(`description = $${idx++}`); values.push(data.description); }
    if (data.amount !== undefined) { fields.push(`amount = $${idx++}`); values.push(data.amount); }
    if (data.expenseDate !== undefined) { fields.push(`expense_date = $${idx++}`); values.push(data.expenseDate); }
    if (data.vendor !== undefined) { fields.push(`vendor = $${idx++}`); values.push(data.vendor); }
    if (data.paymentMethod !== undefined) { fields.push(`payment_method = $${idx++}`); values.push(data.paymentMethod); }
    if (data.notes !== undefined) { fields.push(`notes = $${idx++}`); values.push(data.notes); }

    if (fields.length === 0) return this.getById(id);

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await this.query(
      `UPDATE expenses SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.query(
      `DELETE FROM expenses WHERE id = $1 AND (reference_type IS NULL OR reference_type = '')`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getById(id: string): Promise<ExpenseRow | null> {
    const result = await this.query('SELECT * FROM expenses WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async list(opts: {
    category?: string;
    startDate?: string;
    endDate?: string;
    limit: number;
    offset: number;
  }): Promise<ExpenseRow[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (opts.category) {
      conditions.push(`category = $${idx++}`);
      params.push(opts.category);
    }
    if (opts.startDate) {
      conditions.push(`expense_date >= $${idx++}`);
      params.push(opts.startDate);
    }
    if (opts.endDate) {
      conditions.push(`expense_date <= $${idx++}`);
      params.push(opts.endDate);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(opts.limit, opts.offset);

    const result = await this.query(
      `SELECT * FROM expenses ${where} ORDER BY expense_date DESC, created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      params
    );
    return result.rows;
  }

  async count(opts: { category?: string; startDate?: string; endDate?: string }): Promise<number> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (opts.category) {
      conditions.push(`category = $${idx++}`);
      params.push(opts.category);
    }
    if (opts.startDate) {
      conditions.push(`expense_date >= $${idx++}`);
      params.push(opts.startDate);
    }
    if (opts.endDate) {
      conditions.push(`expense_date <= $${idx++}`);
      params.push(opts.endDate);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.query(`SELECT COUNT(*)::int as count FROM expenses ${where}`, params);
    return result.rows[0].count;
  }

  async getTotals(opts: { startDate?: string; endDate?: string }): Promise<number> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (opts.startDate) {
      conditions.push(`expense_date >= $${idx++}`);
      params.push(opts.startDate);
    }
    if (opts.endDate) {
      conditions.push(`expense_date <= $${idx++}`);
      params.push(opts.endDate);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric as total FROM expenses ${where}`,
      params
    );
    return parseFloat(result.rows[0].total);
  }

  async getDriverPayTotals(opts: { startDate?: string; endDate?: string }): Promise<number> {
    const conditions: string[] = ["status = 'completed'", 'base_pay IS NOT NULL'];
    const params: any[] = [];
    let idx = 1;

    if (opts.startDate) {
      conditions.push(`scheduled_date >= $${idx++}`);
      params.push(opts.startDate);
    }
    if (opts.endDate) {
      conditions.push(`scheduled_date <= $${idx++}`);
      params.push(opts.endDate);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const result = await this.query(
      `SELECT COALESCE(SUM(base_pay), 0)::numeric as total FROM route_jobs ${where}`,
      params
    );
    return parseFloat(result.rows[0].total);
  }

  async getMonthlyExpenseSummary(months: number): Promise<{ month: string; expenses: number; driverPay: number }[]> {
    const result = await this.query(
      `WITH months AS (
        SELECT generate_series(
          date_trunc('month', NOW()) - ($1 - 1) * interval '1 month',
          date_trunc('month', NOW()),
          '1 month'
        )::date as month_start
      ),
      exp AS (
        SELECT date_trunc('month', expense_date)::date as m, COALESCE(SUM(amount), 0) as total
        FROM expenses
        WHERE expense_date >= date_trunc('month', NOW()) - $1 * interval '1 month'
        GROUP BY m
      ),
      dp AS (
        SELECT date_trunc('month', scheduled_date)::date as m, COALESCE(SUM(base_pay), 0) as total
        FROM route_jobs
        WHERE status = 'completed' AND base_pay IS NOT NULL
          AND scheduled_date >= date_trunc('month', NOW()) - $1 * interval '1 month'
        GROUP BY m
      )
      SELECT
        to_char(months.month_start, 'Mon YYYY') as month,
        COALESCE(exp.total, 0)::numeric as expenses,
        COALESCE(dp.total, 0)::numeric as driver_pay
      FROM months
      LEFT JOIN exp ON exp.m = months.month_start
      LEFT JOIN dp ON dp.m = months.month_start
      ORDER BY months.month_start`,
      [months]
    );
    return result.rows.map(r => ({
      month: r.month,
      expenses: parseFloat(r.expenses),
      driverPay: parseFloat(r.driver_pay),
    }));
  }
}

export const expenseRepo = new ExpenseRepository();
