import { pool } from '../db.ts';

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category VARCHAR(100) NOT NULL,
      description TEXT,
      amount NUMERIC(10,2) NOT NULL,
      expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
      vendor VARCHAR(255),
      reference_id VARCHAR(255),
      reference_type VARCHAR(50),
      payment_method VARCHAR(100),
      notes TEXT,
      created_by UUID REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)');

  const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'expenses'");
  process.stdout.write(`Expenses table exists: ${res.rows.length > 0}\n`);
  await pool.end();
}

migrate().catch(e => {
  process.stderr.write(`Migration error: ${e.message}\n`);
  pool.end();
  process.exit(1);
});
