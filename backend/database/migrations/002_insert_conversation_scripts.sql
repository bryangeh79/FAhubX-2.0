-- Migration 002: Deprecated
-- 原本插入 conversation_scripts 表数据，但该表已从 001 移除（与 entity 不对应）
-- 保留此空 migration 用于 schema_migrations 版本号连续
-- 对话剧本数据已迁移到 chat_scripts 表（见 migration 004），用户在 UI 中自行创建

DO $$ BEGIN RAISE NOTICE 'Migration 002: skipped (deprecated conversation_scripts table)'; END $$;
