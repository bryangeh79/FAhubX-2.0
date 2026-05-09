import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVpnIpTables20250413000000 implements MigrationInterface {
  name = 'CreateVpnIpTables20250413000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建VPN配置表
    await queryRunner.query(`
      CREATE TABLE vpn_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL CHECK (type IN ('openvpn', 'wireguard', 'proxy')),
        config JSONB NOT NULL,
        status VARCHAR(20) DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
        health_score INTEGER DEFAULT 100,
        last_used_at TIMESTAMP,
        server_location VARCHAR(100),
        country_code VARCHAR(2),
        provider VARCHAR(255),
        total_connections INTEGER DEFAULT 0,
        total_duration INTERVAL DEFAULT '0 seconds',
        average_latency DECIMAL(5,2) DEFAULT 0,
        success_rate DECIMAL(5,2) DEFAULT 0,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 创建IP地址池表
    await queryRunner.query(`
      CREATE TABLE ip_pools (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vpn_config_id UUID REFERENCES vpn_configs(id) ON DELETE CASCADE,
        ip_address INET NOT NULL,
        port INTEGER,
        type VARCHAR(50) CHECK (type IN ('residential', 'datacenter', 'mobile', 'shared')),
        country_code VARCHAR(2),
        city VARCHAR(100),
        isp VARCHAR(255),
        status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'reserved', 'blocked')),
        assigned_to UUID,
        health_score INTEGER DEFAULT 100,
        last_health_check TIMESTAMP,
        total_connections INTEGER DEFAULT 0,
        total_duration INTERVAL DEFAULT '0 seconds',
        average_latency DECIMAL(10,2) DEFAULT 0,
        packet_loss DECIMAL(5,2) DEFAULT 0,
        bandwidth DECIMAL(10,2) DEFAULT 0,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ip_address, port)
      );
    `);

    // 创建账号IP映射表
    await queryRunner.query(`
      CREATE TABLE account_ip_mappings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID NOT NULL,
        ip_pool_id UUID REFERENCES ip_pools(id) ON DELETE SET NULL,
        vpn_config_id UUID REFERENCES vpn_configs(id) ON DELETE SET NULL,
        connection_type VARCHAR(50) CHECK (connection_type IN ('fixed', 'rotating', 'on_demand')),
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'error')),
        connection_stats JSONB,
        current_latency DECIMAL(10,2),
        current_packet_loss DECIMAL(5,2),
        current_bandwidth DECIMAL(10,2),
        data_transferred INTEGER DEFAULT 0,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 创建网络监控日志表
    await queryRunner.query(`
      CREATE TABLE network_monitor_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vpn_config_id UUID REFERENCES vpn_configs(id) ON DELETE SET NULL,
        ip_pool_id UUID REFERENCES ip_pools(id) ON DELETE SET NULL,
        account_id UUID,
        metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN ('latency', 'bandwidth', 'packet_loss', 'connection_status', 'health_score', 'error')),
        metric_value DECIMAL(10,2),
        unit VARCHAR(20),
        status VARCHAR(20) CHECK (status IN ('normal', 'warning', 'critical')),
        details JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 创建索引以提高查询性能
    await queryRunner.query(`
      CREATE INDEX idx_vpn_configs_status ON vpn_configs(status);
      CREATE INDEX idx_vpn_configs_type ON vpn_configs(type);
      CREATE INDEX idx_vpn_configs_health_score ON vpn_configs(health_score);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_ip_pools_status ON ip_pools(status);
      CREATE INDEX idx_ip_pools_type ON ip_pools(type);
      CREATE INDEX idx_ip_pools_country_code ON ip_pools(country_code);
      CREATE INDEX idx_ip_pools_health_score ON ip_pools(health_score);
      CREATE INDEX idx_ip_pools_vpn_config_id ON ip_pools(vpn_config_id);
      CREATE INDEX idx_ip_pools_assigned_to ON ip_pools(assigned_to);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_account_ip_mappings_account_id ON account_ip_mappings(account_id);
      CREATE INDEX idx_account_ip_mappings_status ON account_ip_mappings(status);
      CREATE INDEX idx_account_ip_mappings_ip_pool_id ON account_ip_mappings(ip_pool_id);
      CREATE INDEX idx_account_ip_mappings_vpn_config_id ON account_ip_mappings(vpn_config_id);
      CREATE INDEX idx_account_ip_mappings_start_time ON account_ip_mappings(start_time);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_network_monitor_logs_created_at ON network_monitor_logs(created_at);
      CREATE INDEX idx_network_monitor_logs_metric_type ON network_monitor_logs(metric_type);
      CREATE INDEX idx_network_monitor_logs_status ON network_monitor_logs(status);
      CREATE INDEX idx_network_monitor_logs_vpn_config_id ON network_monitor_logs(vpn_config_id);
      CREATE INDEX idx_network_monitor_logs_ip_pool_id ON network_monitor_logs(ip_pool_id);
    `);

    // 创建触发器自动更新updated_at字段
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await queryRunner.query(`
      CREATE TRIGGER update_vpn_configs_updated_at
      BEFORE UPDATE ON vpn_configs
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);

    await queryRunner.query(`
      CREATE TRIGGER update_ip_pools_updated_at
      BEFORE UPDATE ON ip_pools
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);

    await queryRunner.query(`
      CREATE TRIGGER update_account_ip_mappings_updated_at
      BEFORE UPDATE ON account_ip_mappings
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除触发器
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_account_ip_mappings_updated_at ON account_ip_mappings;`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_ip_pools_updated_at ON ip_pools;`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS update_vpn_configs_updated_at ON vpn_configs;`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_updated_at_column;`);

    // 删除索引
    await queryRunner.query(`DROP INDEX IF EXISTS idx_network_monitor_logs_ip_pool_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_network_monitor_logs_vpn_config_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_network_monitor_logs_status;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_network_monitor_logs_metric_type;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_network_monitor_logs_created_at;`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_account_ip_mappings_start_time;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_account_ip_mappings_vpn_config_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_account_ip_mappings_ip_pool_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_account_ip_mappings_status;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_account_ip_mappings_account_id;`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_ip_pools_assigned_to;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ip_pools_vpn_config_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ip_pools_health_score;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ip_pools_country_code;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ip_pools_type;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ip_pools_status;`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_vpn_configs_health_score;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_vpn_configs_type;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_vpn_configs_status;`);

    // 删除表
    await queryRunner.query(`DROP TABLE IF EXISTS network_monitor_logs;`);
    await queryRunner.query(`DROP TABLE IF EXISTS account_ip_mappings;`);
    await queryRunner.query(`DROP TABLE IF EXISTS ip_pools;`);
    await queryRunner.query(`DROP TABLE IF EXISTS vpn_configs;`);
  }
}