import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountManagementTables20260413000000 implements MigrationInterface {
  name = 'AddAccountManagementTables20260413000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建批量操作表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS batch_operations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        type VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        target_account_ids JSONB NOT NULL,
        success_account_ids JSONB,
        failed_account_ids JSONB,
        skipped_account_ids JSONB,
        total_accounts INTEGER NOT NULL,
        success_count INTEGER,
        failed_count INTEGER,
        skipped_count INTEGER,
        progress INTEGER NOT NULL DEFAULT 0,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        error_message TEXT,
        detailed_results JSONB,
        parameters JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_batch_operations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 创建索引
    await queryRunner.query(`
      CREATE INDEX idx_batch_operations_user_id ON batch_operations(user_id);
      CREATE INDEX idx_batch_operations_type ON batch_operations(type);
      CREATE INDEX idx_batch_operations_status ON batch_operations(status);
      CREATE INDEX idx_batch_operations_created_at ON batch_operations(created_at);
    `);

    // 创建健康检查日志表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS health_check_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        account_id UUID NOT NULL,
        check_type VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL,
        score INTEGER NOT NULL,
        details JSONB NOT NULL,
        error_message TEXT,
        response_time INTEGER NOT NULL,
        checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_health_check_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_health_check_logs_account FOREIGN KEY (account_id) REFERENCES facebook_accounts(id) ON DELETE CASCADE
      );
    `);

    // 创建索引
    await queryRunner.query(`
      CREATE INDEX idx_health_check_logs_user_id ON health_check_logs(user_id);
      CREATE INDEX idx_health_check_logs_account_id ON health_check_logs(account_id);
      CREATE INDEX idx_health_check_logs_type ON health_check_logs(check_type);
      CREATE INDEX idx_health_check_logs_status ON health_check_logs(status);
      CREATE INDEX idx_health_check_logs_checked_at ON health_check_logs(checked_at);
    `);

    // 创建健康告警表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS health_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        account_id UUID,
        type VARCHAR(20) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        title VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        details JSONB NOT NULL,
        trigger_condition TEXT NOT NULL,
        suggested_action TEXT NOT NULL,
        notified BOOLEAN NOT NULL DEFAULT FALSE,
        notified_at TIMESTAMPTZ,
        acknowledged_by UUID,
        acknowledged_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,
        resolution_description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_health_alerts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_health_alerts_account FOREIGN KEY (account_id) REFERENCES facebook_accounts(id) ON DELETE CASCADE
      );
    `);

    // 创建索引
    await queryRunner.query(`
      CREATE INDEX idx_health_alerts_user_id ON health_alerts(user_id);
      CREATE INDEX idx_health_alerts_account_id ON health_alerts(account_id);
      CREATE INDEX idx_health_alerts_type ON health_alerts(type);
      CREATE INDEX idx_health_alerts_severity ON health_alerts(severity);
      CREATE INDEX idx_health_alerts_status ON health_alerts(status);
      CREATE INDEX idx_health_alerts_created_at ON health_alerts(created_at);
    `);

    // 创建恢复日志表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS recovery_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        account_id UUID NOT NULL,
        recovery_type VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        failure_type VARCHAR(30) NOT NULL,
        failure_description TEXT NOT NULL,
        recovery_details JSONB NOT NULL,
        error_message TEXT,
        started_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ,
        duration INTEGER,
        recovery_strategy VARCHAR(50) NOT NULL,
        fallback_account_id UUID,
        auto_recovery BOOLEAN NOT NULL DEFAULT TRUE,
        attempt_count INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_recovery_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_recovery_logs_account FOREIGN KEY (account_id) REFERENCES facebook_accounts(id) ON DELETE CASCADE
      );
    `);

    // 创建索引
    await queryRunner.query(`
      CREATE INDEX idx_recovery_logs_user_id ON recovery_logs(user_id);
      CREATE INDEX idx_recovery_logs_account_id ON recovery_logs(account_id);
      CREATE INDEX idx_recovery_logs_type ON recovery_logs(recovery_type);
      CREATE INDEX idx_recovery_logs_status ON recovery_logs(status);
      CREATE INDEX idx_recovery_logs_failure_type ON recovery_logs(failure_type);
      CREATE INDEX idx_recovery_logs_created_at ON recovery_logs(created_at);
    `);

    // 创建VPN配置表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS vpn_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        name VARCHAR(100) NOT NULL,
        protocol VARCHAR(20) NOT NULL,
        server VARCHAR(255) NOT NULL,
        port INTEGER NOT NULL,
        username VARCHAR(100) NOT NULL,
        password TEXT NOT NULL,
        config_file TEXT,
        ca_cert TEXT,
        client_cert TEXT,
        client_key TEXT,
        public_key TEXT,
        private_key TEXT,
        endpoint VARCHAR(100),
        allowed_ips TEXT,
        dns VARCHAR(100),
        country VARCHAR(10) NOT NULL,
        city VARCHAR(50),
        provider VARCHAR(50),
        status VARCHAR(20) NOT NULL DEFAULT 'inactive',
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        quality_score INTEGER,
        last_connected_at TIMESTAMPTZ,
        last_tested_at TIMESTAMPTZ,
        avg_connect_time INTEGER,
        success_rate FLOAT,
        bandwidth_limit INTEGER,
        concurrent_limit INTEGER,
        parameters JSONB NOT NULL DEFAULT '{}',
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT fk_vpn_configs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // 创建索引
    await queryRunner.query(`
      CREATE INDEX idx_vpn_configs_user_id ON vpn_configs(user_id);
      CREATE INDEX idx_vpn_configs_protocol ON vpn_configs(protocol);
      CREATE INDEX idx_vpn_configs_status ON vpn_configs(status);
      CREATE INDEX idx_vpn_configs_created_at ON vpn_configs(created_at);
    `);

    // 创建IP地址池表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ip_pools (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        name VARCHAR(100) NOT NULL,
        ip_type VARCHAR(20) NOT NULL,
        ip_range VARCHAR(50) NOT NULL,
        available_ips JSONB NOT NULL,
        allocated_ips JSONB NOT NULL DEFAULT '{}',
        blacklisted_ips JSONB,
        total_ips INTEGER NOT NULL,
        available_count INTEGER NOT NULL,
        allocated_count INTEGER NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        country VARCHAR(10) NOT NULL,
        city VARCHAR(50),
        isp VARCHAR(50),
        rotation_interval INTEGER,
        last_rotated_at TIMESTAMPTZ,
        avg_quality_score INTEGER,
        usage_stats JSONB NOT NULL DEFAULT '{}',
        parameters JSONB NOT NULL DEFAULT '{}',
        vpn_config_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT fk_ip_pools_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_ip_pools_vpn_config FOREIGN KEY (vpn_config_id) REFERENCES vpn_configs(id) ON DELETE SET NULL
      );
    `);

    // 创建索引
    await queryRunner.query(`
      CREATE INDEX idx_ip_pools_user_id ON ip_pools(user_id);
      CREATE INDEX idx_ip_pools_type ON ip_pools(ip_type);
      CREATE INDEX idx_ip_pools_status ON ip_pools(status);
      CREATE INDEX idx_ip_pools_vpn_config_id ON ip_pools(vpn_config_id);
      CREATE INDEX idx_ip_pools_created_at ON ip_pools(created_at);
    `);

    // 更新Facebook账号表，添加新字段
    await queryRunner.query(`
      ALTER TABLE facebook_accounts
      ADD COLUMN IF NOT EXISTS batch_operation_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS batch_operation_status VARCHAR(20),
      ADD COLUMN IF NOT EXISTS health_score INTEGER,
      ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS login_status BOOLEAN,
      ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS task_success_rate FLOAT,
      ADD COLUMN IF NOT EXISTS avg_response_time INTEGER,
      ADD COLUMN IF NOT EXISTS resource_usage JSONB,
      ADD COLUMN IF NOT EXISTS group_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS group_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS vpn_config_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS current_ip VARCHAR(50),
      ADD COLUMN IF NOT EXISTS ip_pool_id VARCHAR(100),
      ADD COLUMN IF NOT EXISTS network_quality INTEGER,
      ADD COLUMN IF NOT EXISTS recovery_attempts INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_recovery_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS recovery_strategy VARCHAR(50);
    `);

    // 更新索引
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_facebook_accounts_batch_operation_id ON facebook_accounts(batch_operation_id);
      CREATE INDEX IF NOT EXISTS idx_facebook_accounts_group_id ON facebook_accounts(group_id);
      CREATE INDEX IF NOT EXISTS idx_facebook_accounts_health_score ON facebook_accounts(health_score);
    `);

    // 更新账号状态枚举值
    await queryRunner.query(`
      ALTER TABLE facebook_accounts 
      DROP CONSTRAINT IF EXISTS facebook_accounts_status_check;
      
      ALTER TABLE facebook_accounts 
      ADD CONSTRAINT facebook_accounts_status_check 
      CHECK (status IN ('active', 'idle', 'error', 'disabled', 'banned'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除新添加的列
    await queryRunner.query(`
      ALTER TABLE facebook_accounts
      DROP COLUMN IF EXISTS batch_operation_id,
      DROP COLUMN IF EXISTS batch_operation_status,
      DROP COLUMN IF EXISTS health_score,
      DROP COLUMN IF EXISTS last_health_check_at,
      DROP COLUMN IF EXISTS login_status,
      DROP COLUMN IF EXISTS session_expires_at,
      DROP COLUMN IF EXISTS task_success_rate,
      DROP COLUMN IF EXISTS avg_response_time,
      DROP COLUMN IF EXISTS resource_usage,
      DROP COLUMN IF EXISTS group_id,
      DROP COLUMN IF EXISTS group_name,
      DROP COLUMN IF EXISTS vpn_config_id,
      DROP COLUMN IF EXISTS current_ip,
      DROP COLUMN IF EXISTS ip_pool_id,
      DROP COLUMN IF EXISTS network_quality,
      DROP COLUMN IF EXISTS recovery_attempts,
      DROP COLUMN IF EXISTS last_recovery_at,
      DROP COLUMN IF EXISTS recovery_strategy;
    `);

    // 删除索引
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_facebook_accounts_batch_operation_id;
      DROP INDEX IF EXISTS idx_facebook_accounts_group_id;
      DROP INDEX IF EXISTS idx_facebook_accounts_health_score;
    `);

    // 恢复账号状态枚举值
    await queryRunner.query(`
      ALTER TABLE facebook_accounts 
      DROP CONSTRAINT IF EXISTS facebook_accounts_status_check;
      
      ALTER TABLE facebook_accounts 
      ADD CONSTRAINT facebook_accounts_status_check 
      CHECK (status IN ('active', 'expired', 'revoked', 'error'));
    `);

    // 删除表
    await queryRunner.query(`DROP TABLE IF EXISTS ip_pools;`);
    await queryRunner.query(`DROP TABLE IF EXISTS vpn_configs;`);
    await queryRunner.query(`DROP TABLE IF EXISTS recovery_logs;`);
    await queryRunner.query(`DROP TABLE IF EXISTS health_alerts;`);
    await queryRunner.query(`DROP TABLE IF EXISTS health_check_logs;`);
    await queryRunner.query(`DROP TABLE IF EXISTS batch_operations;`);
  }
}