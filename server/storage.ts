import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export class Storage {
  async query(text: string, params?: any[]) {
    const result = await pool.query(text, params);
    return result;
  }

  async getProduct(productId: string) {
    const result = await this.query(
      'SELECT * FROM stripe.products WHERE id = $1',
      [productId]
    );
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
    const result = await this.query(
      'SELECT * FROM stripe.prices WHERE id = $1',
      [priceId]
    );
    return result.rows[0] || null;
  }

  async listPrices(active = true) {
    const result = await this.query(
      'SELECT * FROM stripe.prices WHERE active = $1',
      [active]
    );
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
    const result = await this.query(
      'SELECT * FROM stripe.subscriptions WHERE id = $1',
      [subscriptionId]
    );
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
    const result = await this.query(
      'SELECT * FROM stripe.customers WHERE id = $1',
      [customerId]
    );
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
    const result = await this.query(
      'SELECT * FROM stripe.invoices WHERE id = $1',
      [invoiceId]
    );
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
}

export const storage = new Storage();
