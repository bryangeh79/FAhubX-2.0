-- Migration 006: 补充 service 代码需要但 entity 没定义的列

-- facebook_accounts: cookies JSONB 和 lastLoginAt（service raw SQL 用到）
ALTER TABLE facebook_accounts ADD COLUMN IF NOT EXISTS cookies JSONB;
ALTER TABLE facebook_accounts ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMPTZ;

DO $$ BEGIN RAISE NOTICE 'Migration 006: added cookies and lastLoginAt to facebook_accounts'; END $$;
