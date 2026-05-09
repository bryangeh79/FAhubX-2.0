-- Migration 005: Create vpn_configs table
-- 对应 modules/vpn-integration/entities/vpn-config.entity.ts + modules/vpn/vpn.service.ts 的原生 SQL

CREATE TABLE IF NOT EXISTS vpn_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  protocol VARCHAR(20) NOT NULL,

  -- vpn.service.ts 原生 SQL 用的额外字段
  "type" VARCHAR(20) NOT NULL DEFAULT 'openvpn',
  config JSONB DEFAULT '{}',
  "healthScore" INT DEFAULT 100,
  "totalConnections" INT DEFAULT 0,
  "totalDuration" VARCHAR(50) DEFAULT '0',
  "averageLatency" VARCHAR(50) DEFAULT '0',

  server VARCHAR(255) NOT NULL,
  port INT NOT NULL,
  username VARCHAR(100) NOT NULL,
  password TEXT NOT NULL,
  "configFile" TEXT,
  "caCert" TEXT,
  "clientCert" TEXT,
  "clientKey" TEXT,
  "publicKey" TEXT,
  "privateKey" TEXT,
  endpoint VARCHAR(100),
  "allowedIps" TEXT,
  dns VARCHAR(100),
  "ipAddress" VARCHAR(50),
  country VARCHAR(50) NOT NULL,
  city VARCHAR(100),
  provider VARCHAR(50),
  status VARCHAR(20) DEFAULT 'inactive',
  enabled BOOLEAN DEFAULT true,
  "isDefault" BOOLEAN DEFAULT false,
  "qualityScore" INT,
  "lastConnectedAt" TIMESTAMPTZ,
  "lastTestedAt" TIMESTAMPTZ,
  "avgConnectTime" INT,
  "successRate" VARCHAR(50) DEFAULT '0',
  "bandwidthLimit" INT,
  "concurrentLimit" INT,
  parameters JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vpn_configs_user_id ON vpn_configs("userId");
CREATE INDEX IF NOT EXISTS idx_vpn_configs_protocol ON vpn_configs(protocol);
CREATE INDEX IF NOT EXISTS idx_vpn_configs_status ON vpn_configs(status);
CREATE INDEX IF NOT EXISTS idx_vpn_configs_created_at ON vpn_configs("createdAt");

CREATE TRIGGER update_vpn_configs_updated_at BEFORE UPDATE ON vpn_configs
  FOR EACH ROW EXECUTE FUNCTION update_camelcase_updated_at_column();

DO $$ BEGIN RAISE NOTICE 'Migration 005: vpn_configs table created.'; END $$;
