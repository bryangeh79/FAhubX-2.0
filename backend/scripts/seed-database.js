const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcrypt');

async function seedDatabase() {
  console.log('开始数据库种子数据初始化...');

  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'fbautobot',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
  };

  const client = new Client(config);

  try {
    await client.connect();
    console.log('数据库连接成功');

    // 1. 创建管理员用户
    console.log('创建管理员用户...');
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
    const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
    
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@fbautobot.com';
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';

    const adminCheck = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [adminEmail]
    );

    if (adminCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO users (email, username, password_hash, full_name, email_verified, preferences)
        VALUES ($1, $2, $3, $4, true, $5)
      `, [
        adminEmail,
        adminUsername,
        adminPasswordHash,
        '系统管理员',
        JSON.stringify({
          notifications: {
            failures: true,
            warnings: true,
            successes: false,
          },
          ui: {
            theme: 'light',
            density: 'comfortable',
          },
          privacy: {
            dataRetention: '7days',
          },
        }),
      ]);
      console.log('✓ 管理员用户创建成功');
      console.log(`  邮箱: ${adminEmail}`);
      console.log(`  密码: ${adminPassword}`);
    } else {
      console.log('✓ 管理员用户已存在');
    }

    // 2. 创建测试用户
    console.log('创建测试用户...');
    const testPasswordHash = await bcrypt.hash('Test123!', 10);
    
    const testCheck = await client.query(
      'SELECT id FROM users WHERE email = $1',
      ['test@fbautobot.com']
    );

    if (testCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO users (email, username, password_hash, full_name, email_verified, preferences)
        VALUES ($1, $2, $3, $4, true, $5)
      `, [
        'test@fbautobot.com',
        'testuser',
        testPasswordHash,
        '测试用户',
        JSON.stringify({
          notifications: {
            failures: true,
            warnings: false,
            successes: false,
          },
          ui: {
            theme: 'dark',
            density: 'compact',
          },
          privacy: {
            dataRetention: '30days',
          },
        }),
      ]);
      console.log('✓ 测试用户创建成功');
      console.log(`  邮箱: test@fbautobot.com`);
      console.log(`  密码: Test123!`);
    } else {
      console.log('✓ 测试用户已存在');
    }

    // 3. 插入对话剧本（如果表为空）
    console.log('检查对话剧本...');
    const scriptCheck = await client.query('SELECT COUNT(*) as count FROM conversation_scripts');
    
    if (parseInt(scriptCheck.rows[0].count) === 0) {
      console.log('插入对话剧本数据...');
      
      // 读取生成的剧本数据
      const scriptsPath = path.join(__dirname, '../src/conversation-scripts/all-scripts.json');
      if (fs.existsSync(scriptsPath)) {
        const scriptsData = JSON.parse(fs.readFileSync(scriptsPath, 'utf-8'));
        
        for (const script of scriptsData.slice(0, 10)) { // 只插入前10个作为示例
          await client.query(`
            INSERT INTO conversation_scripts (
              id, name, description, category, relationship, time_of_day,
              estimated_duration, difficulty, tags, flow, version, is_active,
              usage_count, success_rate, average_rating, total_ratings
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          `, [
            script.id,
            script.name,
            script.description,
            script.category,
            script.relationship,
            script.time_of_day,
            script.estimated_duration,
            script.difficulty,
            script.tags,
            JSON.stringify(script.flow),
            script.version || '1.0.0',
            script.is_active !== false,
            script.usage_count || 0,
            script.success_rate || 0,
            script.average_rating || 0,
            script.total_ratings || 0,
          ]);
        }
        console.log(`✓ 已插入 ${Math.min(10, scriptsData.length)} 个对话剧本`);
      } else {
        console.log('⚠ 对话剧本数据文件不存在，跳过剧本插入');
      }
    } else {
      console.log(`✓ 已有 ${scriptCheck.rows[0].count} 个对话剧本`);
    }

    // 4. 插入系统配置（如果不存在）
    console.log('检查系统配置...');
    const configCheck = await client.query('SELECT COUNT(*) as count FROM system_configs');
    
    if (parseInt(configCheck.rows[0].count) === 0) {
      console.log('插入系统配置...');
      
      const systemConfigs = [
        ['system.version', '"1.0.0"', '系统版本号', 'global'],
        ['system.maintenance', 'false', '系统维护模式', 'global'],
        ['task.max_concurrent', '10', '最大并发任务数', 'global'],
        ['account.max_per_user', '10', '每个用户最大账号数', 'global'],
        ['retry.max_attempts', '3', '最大重试次数', 'global'],
        ['retry.delay_seconds', '300', '重试延迟秒数', 'global'],
        ['notification.retention_days', '7', '通知保留天数', 'global'],
        ['failure.retention_days', '7', '失败记录保留天数', 'global'],
        ['rate.limit.window', '900000', '限流窗口（毫秒）', 'global'],
        ['rate.limit.max', '100', '每个窗口最大请求数', 'global'],
      ];

      for (const [key, value, description, scope] of systemConfigs) {
        await client.query(`
          INSERT INTO system_configs (key, value, description, scope)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (key) DO NOTHING
        `, [key, value, description, scope]);
      }
      console.log(`✓ 已插入 ${systemConfigs.length} 个系统配置`);
    } else {
      console.log(`✓ 已有 ${configCheck.rows[0].count} 个系统配置`);
    }

    // 5. 创建测试Facebook账号（关联测试用户）
    console.log('创建测试Facebook账号...');
    const testUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      ['test@fbautobot.com']
    );

    if (testUser.rows.length > 0) {
      const accountCheck = await client.query(
        'SELECT COUNT(*) as count FROM facebook_accounts WHERE user_id = $1',
        [testUser.rows[0].id]
      );

      if (parseInt(accountCheck.rows[0].count) === 0) {
        // 创建3个测试账号
        const testAccounts = [
          {
            username: 'test_account_1',
            displayName: '测试账号1',
            email: 'test1@example.com',
            tags: ['测试', '个人'],
            vpnConfig: { provider: 'openvpn', location: 'us' },
          },
          {
            username: 'test_account_2',
            displayName: '测试账号2',
            email: 'test2@example.com',
            tags: ['测试', '商业'],
            vpnConfig: { provider: 'wireguard', location: 'uk' },
          },
          {
            username: 'test_account_3',
            displayName: '测试账号3',
            email: 'test3@example.com',
            tags: ['测试', '备用'],
            vpnConfig: { provider: 'nordvpn', location: 'jp' },
          },
        ];

        for (const account of testAccounts) {
          await client.query(`
            INSERT INTO facebook_accounts (
              user_id, username, display_name, email, tags, vpn_config, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            testUser.rows[0].id,
            account.username,
            account.displayName,
            account.email,
            account.tags,
            JSON.stringify(account.vpnConfig),
            'active',
          ]);
        }
        console.log(`✓ 已创建 ${testAccounts.length} 个测试Facebook账号`);
      } else {
        console.log(`✓ 测试用户已有 ${accountCheck.rows[0].count} 个Facebook账号`);
      }
    }

    console.log('\n✅ 数据库种子数据初始化完成！');
    console.log('\n登录信息:');
    console.log('管理员:');
    console.log(`  邮箱: ${adminEmail || 'admin@fbautobot.com'}`);
    console.log(`  密码: ${adminPassword || 'Admin123!'}`);
    console.log('\n测试用户:');
    console.log('  邮箱: test@fbautobot.com');
    console.log('  密码: Test123!');
    console.log('\n访问地址:');
    console.log('  前端: http://localhost:8080');
    console.log('  API: http://localhost:3000');
    console.log('  API文档: http://localhost:3000/api-docs');

  } catch (error) {
    console.error('数据库种子数据初始化失败:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// 执行种子初始化
if (require.main === module) {
  seedDatabase().catch(error => {
    console.error('种子脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = { seedDatabase };