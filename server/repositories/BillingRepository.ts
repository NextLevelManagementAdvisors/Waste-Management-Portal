import { BaseRepository } from '../db';

export class BillingRepository extends BaseRepository {
  async getProduct(productId: string) {
    const result = await this.query('SELECT * FROM stripe.products WHERE id = $1', [productId]);
    return result.rows[0] || null;
  }

  async listProducts(active = true) {
    const result = await this.query(
      'SELECT * FROM stripe.products WHERE active = $1 ORDER BY created DESC',
      [active]
    );
    return result.rows;
  }

  async listProductsWithPrices(active = true) {
    const result = await this.query(
      `SELECT
        p.id as product_id,
        p.name as product_name,
        p.description as product_description,
        p.active as product_active,
        p.metadata as product_metadata,
        pr.id as price_id,
        pr.unit_amount,
        pr.currency,
        pr.recurring,
        pr.active as price_active,
        pr.metadata as price_metadata
       FROM stripe.products p
       LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
       WHERE p.active = $1
       ORDER BY p.name, pr.unit_amount`,
      [active]
    );
    return result.rows;
  }

  async getPrice(priceId: string) {
    const result = await this.query('SELECT * FROM stripe.prices WHERE id = $1', [priceId]);
    return result.rows[0] || null;
  }

  async listPrices(active = true) {
    const result = await this.query('SELECT * FROM stripe.prices WHERE active = $1', [active]);
    return result.rows;
  }

  async getPricesForProduct(productId: string) {
    const result = await this.query(
      'SELECT * FROM stripe.prices WHERE product = $1 AND active = true',
      [productId]
    );
    return result.rows;
  }

  async getSubscription(subscriptionId: string) {
    const result = await this.query('SELECT * FROM stripe.subscriptions WHERE id = $1', [subscriptionId]);
    return result.rows[0] || null;
  }

  async listSubscriptions(customerId: string) {
    const result = await this.query(
      'SELECT * FROM stripe.subscriptions WHERE customer = $1 ORDER BY created DESC',
      [customerId]
    );
    return result.rows;
  }

  async getCustomer(customerId: string) {
    const result = await this.query('SELECT * FROM stripe.customers WHERE id = $1', [customerId]);
    return result.rows[0] || null;
  }

  async listInvoices(customerId: string) {
    const result = await this.query(
      'SELECT * FROM stripe.invoices WHERE customer = $1 ORDER BY created DESC',
      [customerId]
    );
    return result.rows;
  }

  async getInvoice(invoiceId: string) {
    const result = await this.query('SELECT * FROM stripe.invoices WHERE id = $1', [invoiceId]);
    return result.rows[0] || null;
  }

  async listPaymentMethods(customerId: string) {
    const result = await this.query(
      `SELECT pm.* FROM stripe.payment_methods pm
       WHERE pm.customer = $1
       ORDER BY pm.created DESC`,
      [customerId]
    );
    return result.rows;
  }

  // ========================================================================
  // Cross-customer queries for Accounting
  // ========================================================================

  async listAllInvoices(opts: {
    status?: string;
    startDate?: string;
    endDate?: string;
    limit: number;
    offset: number;
  }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (opts.status && opts.status !== 'all') {
      conditions.push(`i.status = $${idx++}`);
      params.push(opts.status);
    }
    if (opts.startDate) {
      conditions.push(`to_timestamp(i.created) >= $${idx++}::timestamp`);
      params.push(opts.startDate);
    }
    if (opts.endDate) {
      conditions.push(`to_timestamp(i.created) <= $${idx++}::timestamp`);
      params.push(opts.endDate);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(opts.limit, opts.offset);

    const result = await this.query(
      `SELECT
        i.id, i.number, i.status, i.amount_due, i.amount_paid, i.amount_remaining,
        i.total, i.currency, i.due_date, i.created, i.hosted_invoice_url, i.invoice_pdf,
        i.customer as stripe_customer_id,
        COALESCE(u.first_name || ' ' || u.last_name, c.name, c.email) as customer_name,
        COALESCE(u.email, c.email) as customer_email
       FROM stripe.invoices i
       LEFT JOIN stripe.customers c ON c.id = i.customer
       LEFT JOIN users u ON u.stripe_customer_id = i.customer
       ${where}
       ORDER BY i.created DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      params
    );
    return result.rows;
  }

  async countAllInvoices(opts: { status?: string; startDate?: string; endDate?: string }): Promise<number> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (opts.status && opts.status !== 'all') {
      conditions.push(`status = $${idx++}`);
      params.push(opts.status);
    }
    if (opts.startDate) {
      conditions.push(`to_timestamp(created) >= $${idx++}::timestamp`);
      params.push(opts.startDate);
    }
    if (opts.endDate) {
      conditions.push(`to_timestamp(created) <= $${idx++}::timestamp`);
      params.push(opts.endDate);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.query(
      `SELECT COUNT(*)::int as count FROM stripe.invoices ${where}`,
      params
    );
    return result.rows[0].count;
  }

  async listAllPaidInvoices(opts: {
    startDate?: string;
    endDate?: string;
    limit: number;
    offset: number;
  }) {
    const conditions: string[] = ["i.status = 'paid'"];
    const params: any[] = [];
    let idx = 1;

    if (opts.startDate) {
      conditions.push(`to_timestamp(i.created) >= $${idx++}::timestamp`);
      params.push(opts.startDate);
    }
    if (opts.endDate) {
      conditions.push(`to_timestamp(i.created) <= $${idx++}::timestamp`);
      params.push(opts.endDate);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(opts.limit, opts.offset);

    const result = await this.query(
      `SELECT
        i.id, i.number, i.status, i.amount_paid, i.total, i.currency,
        i.created, i.hosted_invoice_url,
        i.customer as stripe_customer_id,
        COALESCE(u.first_name || ' ' || u.last_name, c.name, c.email) as customer_name,
        COALESCE(u.email, c.email) as customer_email
       FROM stripe.invoices i
       LEFT JOIN stripe.customers c ON c.id = i.customer
       LEFT JOIN users u ON u.stripe_customer_id = i.customer
       ${where}
       ORDER BY i.created DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      params
    );
    return result.rows;
  }

  async countAllPaidInvoices(opts: { startDate?: string; endDate?: string }): Promise<number> {
    const conditions: string[] = ["status = 'paid'"];
    const params: any[] = [];
    let idx = 1;

    if (opts.startDate) {
      conditions.push(`to_timestamp(created) >= $${idx++}::timestamp`);
      params.push(opts.startDate);
    }
    if (opts.endDate) {
      conditions.push(`to_timestamp(created) <= $${idx++}::timestamp`);
      params.push(opts.endDate);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const result = await this.query(
      `SELECT COUNT(*)::int as count FROM stripe.invoices ${where}`,
      params
    );
    return result.rows[0].count;
  }

  async getActiveSubscriptionStats(): Promise<{ count: number; mrr: number }> {
    const result = await this.query(
      `SELECT
        COUNT(*)::int as count,
        COALESCE(SUM(
          CASE
            WHEN items IS NOT NULL THEN (
              SELECT COALESCE(SUM((item->>'amount')::numeric), 0)
              FROM jsonb_array_elements(
                CASE jsonb_typeof(items)
                  WHEN 'array' THEN items
                  ELSE '[]'::jsonb
                END
              ) AS item
            )
            ELSE 0
          END
        ), 0)::numeric as mrr
       FROM stripe.subscriptions
       WHERE status = 'active'`
    );
    return {
      count: result.rows[0].count,
      mrr: parseFloat(result.rows[0].mrr) / 100, // cents to dollars
    };
  }

  async getOutstandingAR(): Promise<number> {
    const result = await this.query(
      `SELECT COALESCE(SUM(amount_remaining), 0)::numeric as total
       FROM stripe.invoices
       WHERE status = 'open'`
    );
    return parseFloat(result.rows[0].total) / 100; // cents to dollars
  }

  async getRevenueSummary(months: number): Promise<{ month: string; revenue: number }[]> {
    const result = await this.query(
      `WITH months AS (
        SELECT generate_series(
          date_trunc('month', NOW()) - ($1 - 1) * interval '1 month',
          date_trunc('month', NOW()),
          '1 month'
        )::date as month_start
      ),
      rev AS (
        SELECT
          date_trunc('month', to_timestamp(created))::date as m,
          COALESCE(SUM(amount_paid), 0) as total
        FROM stripe.invoices
        WHERE status = 'paid'
          AND to_timestamp(created) >= date_trunc('month', NOW()) - $1 * interval '1 month'
        GROUP BY m
      )
      SELECT
        to_char(months.month_start, 'Mon YYYY') as month,
        COALESCE(rev.total, 0)::numeric as revenue
      FROM months
      LEFT JOIN rev ON rev.m = months.month_start
      ORDER BY months.month_start`,
      [months]
    );
    return result.rows.map(r => ({
      month: r.month,
      revenue: parseFloat(r.revenue) / 100, // cents to dollars
    }));
  }

  async getRevenueForPeriod(startDate: string, endDate: string): Promise<number> {
    const result = await this.query(
      `SELECT COALESCE(SUM(amount_paid), 0)::numeric as total
       FROM stripe.invoices
       WHERE status = 'paid'
         AND to_timestamp(created) >= $1::timestamp
         AND to_timestamp(created) <= $2::timestamp`,
      [startDate, endDate]
    );
    return parseFloat(result.rows[0].total) / 100;
  }

  async getPaidInvoicesTotalAmount(opts: { startDate?: string; endDate?: string }): Promise<number> {
    const conditions: string[] = ["status = 'paid'"];
    const params: any[] = [];
    let idx = 1;

    if (opts.startDate) {
      conditions.push(`to_timestamp(created) >= $${idx++}::timestamp`);
      params.push(opts.startDate);
    }
    if (opts.endDate) {
      conditions.push(`to_timestamp(created) <= $${idx++}::timestamp`);
      params.push(opts.endDate);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const result = await this.query(
      `SELECT COALESCE(SUM(amount_paid), 0)::numeric as total FROM stripe.invoices ${where}`,
      params
    );
    return parseFloat(result.rows[0].total) / 100;
  }
}

export const billingRepo = new BillingRepository();
