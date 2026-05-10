/**
 * FAhubX 2.0 — Local Admin Bootstrap
 *
 * Creates a default admin account on fresh local installs.
 * Idempotent: skips creation if any admin user already exists.
 * Run after database migrations during installer init-db step.
 *
 * Default credentials (change after first login):
 *   Email:    admin@fahubx.local
 *   Password: ChangeMe123!
 */

const { Client } = require('pg');
const bcrypt = require('bcryptjs');

async function bootstrapLocalAdmin() {
  const client = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5450', 10),
    database: process.env.DB_NAME || 'fbautobot',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  });

  await client.connect();

  try {
    // Idempotency check: skip if any admin already exists
    const check = await client.query(
      `SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND "deletedAt" IS NULL`
    );
    const adminCount = parseInt(check.rows[0].count, 10);

    if (adminCount > 0) {
      console.log('[BOOTSTRAP] Admin user already exists — skipping.');
      return;
    }

    // Generate bcrypt hash (same method as AuthService / UsersService)
    const passwordHash = await bcrypt.hash('ChangeMe123!', 10);

    await client.query(
      `INSERT INTO users (
        id, email, username, "passwordHash",
        role, plan,
        max_accounts, max_tasks, max_scripts,
        status, "emailVerified",
        timezone, language, preferences,
        "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        'admin@fahubx.local', 'admin', $1,
        'admin', 'admin',
        9999, 9999, 9999,
        'active', true,
        'UTC', 'en', '{}',
        NOW(), NOW()
      )`,
      [passwordHash]
    );

    console.log('[BOOTSTRAP] Default admin created successfully.');
    console.log('[BOOTSTRAP]   Email:    admin@fahubx.local');
    console.log('[BOOTSTRAP]   Password: ChangeMe123!');
    console.log('[BOOTSTRAP] IMPORTANT: Change this password after your first login.');
  } finally {
    await client.end();
  }
}

bootstrapLocalAdmin().catch((err) => {
  console.error('[BOOTSTRAP] Admin bootstrap failed:', err.message);
  process.exit(1);
});
