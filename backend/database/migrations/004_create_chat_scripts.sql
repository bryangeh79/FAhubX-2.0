-- Migration 004: Create chat_scripts table
-- 对应 modules/chat-scripts/entities/chat-script.entity.ts
-- 列名全部 camelCase

CREATE TABLE IF NOT EXISTS chat_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "scriptNumber" INT NOT NULL,
  title VARCHAR(100) NOT NULL,
  goal TEXT,
  "systemPrompt" TEXT,
  phases JSONB DEFAULT '[]',
  category VARCHAR(20) DEFAULT '推广',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_scripts_user_id ON chat_scripts("userId");
CREATE INDEX IF NOT EXISTS idx_chat_scripts_user_script ON chat_scripts("userId", "scriptNumber");

-- Trigger for updatedAt
CREATE TRIGGER update_chat_scripts_updated_at BEFORE UPDATE ON chat_scripts
  FOR EACH ROW EXECUTE FUNCTION update_camelcase_updated_at_column();

DO $$ BEGIN RAISE NOTICE 'Migration 004: chat_scripts table created.'; END $$;
