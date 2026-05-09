const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

class DatabaseMigrator {
  constructor() {
    this.migrationsDir = path.join(__dirname, 'migrations');
    this.migrationsTable = 'schema_migrations';
    this.client = null;
  }

  async connect() {
    const config = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'fbautobot',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password'
    };

    console.log('连接数据库...', { ...config, password: '***' });
    
    this.client = new Client(config);
    await this.client.connect();
    
    console.log('数据库连接成功！');
  }

  async disconnect() {
    if (this.client) {
      await this.client.end();
      console.log('数据库连接已关闭');
    }
  }

  async ensureMigrationsTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
        id SERIAL PRIMARY KEY,
        version VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    
    await this.client.query(query);
    console.log('迁移表已确保存在');
  }

  async getAppliedMigrations() {
    const query = `SELECT version FROM ${this.migrationsTable} ORDER BY version`;
    const result = await this.client.query(query);
    return result.rows.map(row => row.version);
  }

  async getMigrationFiles() {
    const files = fs.readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    return files.map(file => {
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) {
        throw new Error(`无效的迁移文件名: ${file}`);
      }
      return {
        version: match[1],
        name: match[2].replace(/_/g, ' '),
        file: file,
        path: path.join(this.migrationsDir, file)
      };
    });
  }

  async runMigration(migration) {
    console.log(`\n运行迁移: ${migration.version} - ${migration.name}`);
    
    const sql = fs.readFileSync(migration.path, 'utf-8');
    
    // 开始事务
    await this.client.query('BEGIN');
    
    try {
      // 执行迁移SQL
      await this.client.query(sql);
      
      // 记录迁移
      const insertQuery = `
        INSERT INTO ${this.migrationsTable} (version, name)
        VALUES ($1, $2)
      `;
      await this.client.query(insertQuery, [migration.version, migration.name]);
      
      // 提交事务
      await this.client.query('COMMIT');
      
      console.log(`✓ 迁移 ${migration.version} 完成`);
      return true;
    } catch (error) {
      // 回滚事务
      await this.client.query('ROLLBACK');
      console.error(`✗ 迁移 ${migration.version} 失败:`, error.message);
      throw error;
    }
  }

  async migrate() {
    try {
      await this.connect();
      await this.ensureMigrationsTable();
      
      const applied = await this.getAppliedMigrations();
      const migrations = await this.getMigrationFiles();
      
      console.log(`\n已应用的迁移: ${applied.length}`);
      console.log(`待处理的迁移: ${migrations.length - applied.length}`);
      
      let appliedCount = 0;
      
      for (const migration of migrations) {
        if (applied.includes(migration.version)) {
          console.log(`✓ 迁移 ${migration.version} 已应用`);
          continue;
        }
        
        await this.runMigration(migration);
        appliedCount++;
      }
      
      if (appliedCount === 0) {
        console.log('\n所有迁移都已是最新状态！');
      } else {
        console.log(`\n成功应用了 ${appliedCount} 个迁移`);
      }
      
    } catch (error) {
      console.error('迁移失败:', error);
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }

  async status() {
    try {
      await this.connect();
      await this.ensureMigrationsTable();
      
      const applied = await this.getAppliedMigrations();
      const migrations = await this.getMigrationFiles();
      
      console.log('\n=== 数据库迁移状态 ===\n');
      
      console.log('迁移文件:');
      migrations.forEach(migration => {
        const status = applied.includes(migration.version) ? '✓ 已应用' : '○ 待处理';
        console.log(`  ${migration.version.padStart(3)} | ${status} | ${migration.name}`);
      });
      
      console.log(`\n总计: ${migrations.length} 个迁移文件，${applied.length} 个已应用`);
      
    } catch (error) {
      console.error('获取状态失败:', error);
    } finally {
      await this.disconnect();
    }
  }

  async create(name) {
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const version = String(parseInt(timestamp)).padStart(3, '0');
    const fileName = `${version}_${name.replace(/[^a-zA-Z0-9]/g, '_')}.sql`;
    const filePath = path.join(this.migrationsDir, fileName);
    
    const template = `-- 迁移: ${name}
-- 版本: ${version}
-- 创建时间: ${new Date().toISOString()}

-- 向上迁移
-- TODO: 实现向上迁移逻辑

-- 向下迁移
-- TODO: 实现向下迁移逻辑（回滚）
`;

    fs.writeFileSync(filePath, template, 'utf-8');
    console.log(`创建迁移文件: ${filePath}`);
  }
}

// 命令行接口
async function main() {
  const migrator = new DatabaseMigrator();
  const command = process.argv[2];
  
  switch (command) {
    case 'migrate':
      await migrator.migrate();
      break;
      
    case 'status':
      await migrator.status();
      break;
      
    case 'create':
      const name = process.argv[3];
      if (!name) {
        console.error('请提供迁移名称，例如: node migrate.js create add_users_table');
        process.exit(1);
      }
      await migrator.create(name);
      break;
      
    case 'rollback':
      console.log('回滚功能待实现');
      break;
      
    default:
      console.log(`
Facebook Auto Bot 数据库迁移工具

用法:
  node migrate.js <command> [options]

命令:
  migrate     运行所有待处理的迁移
  status      查看迁移状态
  create <name> 创建新的迁移文件
  rollback    回滚最后一个迁移（待实现）

示例:
  node migrate.js migrate
  node migrate.js status
  node migrate.js create add_new_feature
      `);
      break;
  }
}

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('错误:', error);
    process.exit(1);
  });
}

module.exports = DatabaseMigrator;