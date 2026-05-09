-- FAhubX License Server Database Schema
-- Cloudflare D1 (SQLite-compatible)
-- v2: Added tenant account sync fields

CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  license_key TEXT UNIQUE NOT NULL,
  tenant_name TEXT NOT NULL,

  -- v2: Tenant account sync fields (for auto-creating local user after activation)
  tenant_email TEXT,
  tenant_username TEXT,
  password_hash TEXT,        -- bcrypt hash, never plain text
  max_scripts INTEGER DEFAULT 10,
  subscription_expiry TEXT,

  plan TEXT NOT NULL DEFAULT 'basic',
  max_accounts INTEGER NOT NULL DEFAULT 10,
  max_tasks INTEGER NOT NULL DEFAULT 50,
  machine_id TEXT,
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  last_heartbeat TEXT,
  last_ip TEXT,
  current_accounts INTEGER DEFAULT 0,
  current_tasks INTEGER DEFAULT 0,
  app_version TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_license_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_active ON licenses(active);
CREATE INDEX IF NOT EXISTS idx_tenant_email ON licenses(tenant_email);
CREATE INDEX IF NOT EXISTS idx_tenant_username ON licenses(tenant_username);
