-- Migration 008: 账号 checkpoint 冷却机制
-- 当 FB 检测到 checkpoint 时，把账号置 suspicious + 冷却 24h，避免继续硬刚导致永封

ALTER TABLE facebook_accounts ADD COLUMN IF NOT EXISTS "cooldownUntil" TIMESTAMPTZ;
ALTER TABLE facebook_accounts ADD COLUMN IF NOT EXISTS "lastCheckpointAt" TIMESTAMPTZ;
ALTER TABLE facebook_accounts ADD COLUMN IF NOT EXISTS "checkpointReason" TEXT;

-- Index 给查询冷却结束账号用
CREATE INDEX IF NOT EXISTS idx_facebook_accounts_cooldown_until
  ON facebook_accounts ("cooldownUntil")
  WHERE "cooldownUntil" IS NOT NULL;

DO $$ BEGIN RAISE NOTICE 'Migration 008: added cooldown columns to facebook_accounts'; END $$;
