-- Migration 003: Create tasks and task_execution_logs tables
-- 对应 modules/task-scheduler/entities/{task,task-execution-log}.entity.ts
-- 列名全部 camelCase（entity 未显式 name:）

-- Enum types
DO $$ BEGIN
  CREATE TYPE task_type_enum AS ENUM ('immediate', 'scheduled', 'recurring', 'cron');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status_enum AS ENUM ('pending', 'queued', 'running', 'completed', 'failed', 'cancelled', 'paused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE log_status_enum AS ENUM ('started', 'progress', 'completed', 'failed', 'retry', 'cancelled', 'warning', 'info');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tasks 表
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type task_type_enum NOT NULL DEFAULT 'immediate',
  "scheduleConfig" JSONB,
  priority INT NOT NULL DEFAULT 3,
  status task_status_enum NOT NULL DEFAULT 'pending',
  "userId" UUID,
  "taskAction" VARCHAR(50),
  "accountId" UUID,
  account_id UUID REFERENCES facebook_accounts(id) ON DELETE SET NULL,
  "executionData" JSONB NOT NULL DEFAULT '{}',
  "retryCount" INT NOT NULL DEFAULT 0,
  "maxRetries" INT NOT NULL DEFAULT 3,
  "timeoutMinutes" INT NOT NULL DEFAULT 30,
  "scheduledAt" TIMESTAMP,
  "startedAt" TIMESTAMP,
  "completedAt" TIMESTAMP,
  result JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks("userId");
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_at ON tasks("scheduledAt") WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks("createdAt" DESC);

-- task_execution_logs 表
CREATE TABLE IF NOT EXISTS task_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "taskId" UUID NOT NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  "accountId" UUID,
  account_id UUID REFERENCES facebook_accounts(id) ON DELETE SET NULL,
  status log_status_enum NOT NULL,
  message TEXT,
  details JSONB,
  progress INT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_execution_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_logs_created_at ON task_execution_logs("createdAt" DESC);

DO $$ BEGIN RAISE NOTICE 'Migration 003: tasks and task_execution_logs tables created.'; END $$;
