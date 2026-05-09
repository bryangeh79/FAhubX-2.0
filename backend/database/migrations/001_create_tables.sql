-- Facebook Auto Bot 数据库迁移
-- 版本: 1.0.0
-- 列名约定：TypeORM entity 默认 camelCase，显式 name: 的字段用 snake_case
-- 所有 camelCase 字段必须用双引号包裹

-- 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. users 表（对应 modules/users/entities/user.entity.ts）
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(100) UNIQUE NOT NULL,
  "passwordHash" VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'tenant',
  plan VARCHAR(20) DEFAULT 'basic',
  max_accounts INT DEFAULT 10,
  subscription_expiry TIMESTAMPTZ,
  max_tasks INT DEFAULT 50,
  max_scripts INT DEFAULT 10,
  status VARCHAR(20) DEFAULT 'active',
  "emailVerified" BOOLEAN DEFAULT false,
  "twoFactorEnabled" BOOLEAN DEFAULT false,
  "fullName" VARCHAR(200),
  "avatarUrl" TEXT,
  timezone VARCHAR(50) DEFAULT 'UTC',
  language VARCHAR(10) DEFAULT 'en',
  preferences JSONB DEFAULT '{}',
  "totalLogins" INT DEFAULT 0,
  "lastLoginAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created_at ON users("createdAt");

-- ============================================================
-- 2. user_sessions 表（对应 modules/auth/entities/user-session.entity.ts）
-- ============================================================
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "deviceInfo" JSONB,
  "userAgent" TEXT,
  "ipAddress" VARCHAR(45),
  revoked BOOLEAN DEFAULT false,
  "revokedAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_user_sessions_user_id ON user_sessions("userId");
CREATE INDEX idx_user_sessions_access_token ON user_sessions("accessToken");
CREATE INDEX idx_user_sessions_refresh_token ON user_sessions("refreshToken");
CREATE INDEX idx_user_sessions_expires_at ON user_sessions("expiresAt");
CREATE INDEX idx_user_sessions_created_at ON user_sessions("createdAt");

-- ============================================================
-- 3. facebook_accounts 表（对应 modules/facebook-accounts/entities/facebook-account.entity.ts）
-- ============================================================
CREATE TABLE facebook_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "facebookId" VARCHAR(100) UNIQUE,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255),
  "facebookPassword" TEXT,
  "accessToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshToken" TEXT,
  remarks TEXT,
  "accountType" VARCHAR(20) DEFAULT 'user',
  status VARCHAR(20) DEFAULT 'active',
  verified BOOLEAN DEFAULT false,
  "profilePicture" TEXT,
  "coverPhoto" TEXT,
  "followersCount" INT,
  "followingCount" INT,
  "lastSyncedAt" TIMESTAMPTZ,
  "syncStatus" VARCHAR(20),
  "syncError" TEXT,
  "batchOperationId" VARCHAR(100),
  "batchOperationStatus" VARCHAR(20),
  "healthScore" INT,
  "lastHealthCheckAt" TIMESTAMPTZ,
  "loginStatus" BOOLEAN,
  "sessionExpiresAt" TIMESTAMPTZ,
  "taskSuccessRate" FLOAT,
  "avgResponseTime" INT,
  "resourceUsage" JSONB,
  "groupId" VARCHAR(100),
  "groupName" VARCHAR(100),
  messenger_pin VARCHAR(10),
  "vpnConfigId" VARCHAR(100),
  "userDataDir" VARCHAR(500),
  "currentIp" VARCHAR(50),
  "ipPoolId" VARCHAR(100),
  "networkQuality" INT,
  "recoveryAttempts" INT DEFAULT 0,
  "lastRecoveryAt" TIMESTAMPTZ,
  "recoveryStrategy" VARCHAR(50),
  config JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);
CREATE INDEX idx_facebook_accounts_user_id ON facebook_accounts("userId");
CREATE INDEX idx_facebook_accounts_facebook_id ON facebook_accounts("facebookId");
CREATE INDEX idx_facebook_accounts_status ON facebook_accounts(status);
CREATE INDEX idx_facebook_accounts_batch_operation_id ON facebook_accounts("batchOperationId");
CREATE INDEX idx_facebook_accounts_group_id ON facebook_accounts("groupId");
CREATE INDEX idx_facebook_accounts_created_at ON facebook_accounts("createdAt");

-- ============================================================
-- 触发器函数（updatedAt 自动更新）
-- ============================================================
CREATE OR REPLACE FUNCTION update_camelcase_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_camelcase_updated_at_column();

CREATE TRIGGER update_user_sessions_updated_at BEFORE UPDATE ON user_sessions
  FOR EACH ROW EXECUTE FUNCTION update_camelcase_updated_at_column();

CREATE TRIGGER update_facebook_accounts_updated_at BEFORE UPDATE ON facebook_accounts
  FOR EACH ROW EXECUTE FUNCTION update_camelcase_updated_at_column();

DO $$ BEGIN
  RAISE NOTICE 'Migration 001 complete: users, user_sessions, facebook_accounts tables created.';
END $$;
