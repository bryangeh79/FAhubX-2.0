-- Migration 007: chat_scripts 表加 language 列（支持按需下载英文/越南语剧本包）
--   zh = 中文（默认，已有记录也是）
--   en = 英文
--   vi = 越南语

ALTER TABLE chat_scripts
  ADD COLUMN IF NOT EXISTS language VARCHAR(10) NOT NULL DEFAULT 'zh';

-- 索引：按语言筛选是常见查询（前端语言 tab、任务执行时按语言选剧本）
CREATE INDEX IF NOT EXISTS idx_chat_scripts_user_language
  ON chat_scripts ("userId", language);

DO $$ BEGIN RAISE NOTICE 'Migration 007: chat_scripts.language column added'; END $$;
