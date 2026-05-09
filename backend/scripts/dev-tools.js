#!/usr/bin/env node

/**
 * Facebook Auto Bot 开发工具
 * 提供各种开发辅助功能
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 颜色定义
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// 打印带颜色的消息
function print(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 打印标题
function printTitle(title) {
  console.log('\n' + '='.repeat(50));
  print('cyan', ` ${title}`);
  console.log('='.repeat(50) + '\n');
}

// 检查命令是否存在
function checkCommand(command) {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// 运行命令
function runCommand(command, options = {}) {
  const { cwd = process.cwd(), silent = false } = options;
  
  if (!silent) {
    print('yellow', `执行: ${command}`);
  }
  
  try {
    const output = execSync(command, { 
      cwd, 
      stdio: silent ? 'pipe' : 'inherit',
      encoding: 'utf-8'
    });
    return { success: true, output };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 数据库工具
class DatabaseTools {
  constructor() {
    this.migrationsDir = path.join(__dirname, '../database/migrations');
  }

  // 运行数据库迁移
  async migrate() {
    printTitle('运行数据库迁移');
    
    const result = runCommand('npm run db:migrate');
    if (result.success) {
      print('green', '✓ 数据库迁移完成');
    } else {
      print('red', '✗ 数据库迁移失败');
      console.error(result.error);
    }
  }

  // 查看迁移状态
  async status() {
    printTitle('数据库迁移状态');
    
    const result = runCommand('npm run db:status');
    if (!result.success) {
      print('red', '✗ 获取迁移状态失败');
      console.error(result.error);
    }
  }

  // 创建新的迁移文件
  async createMigration(name) {
    printTitle('创建迁移文件');
    
    if (!name) {
      print('red', '请提供迁移名称');
      return;
    }

    const result = runCommand(`npm run db:create ${name}`);
    if (result.success) {
      print('green', `✓ 迁移文件创建成功: ${name}`);
    } else {
      print('red', '✗ 迁移文件创建失败');
      console.error(result.error);
    }
  }

  // 运行数据种子
  async seed() {
    printTitle('运行数据种子');
    
    const result = runCommand('npm run db:seed');
    if (result.success) {
      print('green', '✓ 数据种子完成');
    } else {
      print('red', '✗ 数据种子失败');
      console.error(result.error);
    }
  }

  // 重置数据库（删除并重建）
  async reset() {
    printTitle('重置数据库');
    
    print('yellow', '警告：这将删除所有数据并重新创建数据库');
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('确定要继续吗？(y/N): ', (answer) => {
      rl.close();
      
      if (answer.toLowerCase() !== 'y') {
        print('yellow', '操作已取消');
        return;
      }

      // 这里需要根据实际数据库配置实现重置逻辑
      print('yellow', '数据库重置功能待实现');
    });
  }
}

// 测试工具
class TestTools {
  constructor() {
    this.testDir = path.join(__dirname, '../test');
  }

  // 运行所有测试
  async runAll() {
    printTitle('运行所有测试');
    
    const result = runCommand('npm test');
    if (result.success) {
      print('green', '✓ 所有测试通过');
    } else {
      print('red', '✗ 测试失败');
    }
  }

  // 运行特定测试
  async runSpecific(pattern) {
    printTitle(`运行测试: ${pattern}`);
    
    const result = runCommand(`npm test -- --testNamePattern="${pattern}"`);
    if (result.success) {
      print('green', `✓ 测试通过: ${pattern}`);
    } else {
      print('red', `✗ 测试失败: ${pattern}`);
    }
  }

  // 运行测试覆盖率
  async coverage() {
    printTitle('运行测试覆盖率');
    
    const result = runCommand('npm run test:cov');
    if (result.success) {
      print('green', '✓ 测试覆盖率报告生成完成');
      
      // 尝试打开覆盖率报告
      const coveragePath = path.join(__dirname, '../coverage/lcov-report/index.html');
      if (fs.existsSync(coveragePath)) {
        print('blue', `覆盖率报告: file://${coveragePath}`);
      }
    } else {
      print('red', '✗ 测试覆盖率生成失败');
    }
  }

  // 监视模式运行测试
  async watch() {
    printTitle('监视模式运行测试');
    print('yellow', '按 Ctrl+C 退出监视模式');
    
    const testProcess = spawn('npm', ['run', 'test:watch'], {
      stdio: 'inherit',
      shell: true
    });

    testProcess.on('close', (code) => {
      if (code === 0) {
        print('green', '测试监视模式已结束');
      } else {
        print('red', '测试监视模式异常结束');
      }
    });
  }
}

// 代码质量工具
class CodeQualityTools {
  // 运行代码检查
  async lint() {
    printTitle('运行代码检查');
    
    const result = runCommand('npm run lint');
    if (result.success) {
      print('green', '✓ 代码检查通过');
    } else {
      print('red', '✗ 代码检查失败');
    }
  }

  // 格式化代码
  async format() {
    printTitle('格式化代码');
    
    const result = runCommand('npm run format');
    if (result.success) {
      print('green', '✓ 代码格式化完成');
    } else {
      print('red', '✗ 代码格式化失败');
    }
  }

  // 类型检查
  async typeCheck() {
    printTitle('TypeScript 类型检查');
    
    const result = runCommand('npx tsc --noEmit');
    if (result.success) {
      print('green', '✓ 类型检查通过');
    } else {
      print('red', '✗ 类型检查失败');
    }
  }
}

// 开发服务器工具
class ServerTools {
  // 启动开发服务器
  async start() {
    printTitle('启动开发服务器');
    
    const serverProcess = spawn('npm', ['run', 'dev'], {
      stdio: 'inherit',
      shell: true
    });

    serverProcess.on('close', (code) => {
      if (code === 0) {
        print('green', '开发服务器已停止');
      } else {
        print('red', '开发服务器异常停止');
      }
    });
  }

  // 构建项目
  async build() {
    printTitle('构建项目');
    
    const result = runCommand('npm run build');
    if (result.success) {
      print('green', '✓ 项目构建完成');
    } else {
      print('red', '✗ 项目构建失败');
    }
  }
}

// 显示帮助信息
function showHelp() {
  printTitle('Facebook Auto Bot 开发工具');
  
  console.log(`
可用命令:

  ${colors.cyan}数据库相关:${colors.reset}
    db:migrate     运行数据库迁移
    db:status      查看迁移状态
    db:create <name> 创建新的迁移文件
    db:seed        运行数据种子
    db:reset       重置数据库（危险！）

  ${colors.cyan}测试相关:${colors.reset}
    test           运行所有测试
    test:watch     监视模式运行测试
    test:cov       运行测试覆盖率
    test:run <pattern> 运行特定测试

  ${colors.cyan}代码质量:${colors.reset}
    lint           运行代码检查
    format         格式化代码
    type-check     TypeScript类型检查

  ${colors.cyan}服务器相关:${colors.reset}
    start          启动开发服务器
    build          构建项目

  ${colors.cyan}其他:${colors.reset}
    help           显示此帮助信息
    version        显示版本信息

示例:
  node scripts/dev-tools.js db:migrate
  node scripts/dev-tools.js test:cov
  node scripts/dev-tools.js lint
  `);
}

// 显示版本信息
function showVersion() {
  const packageJson = require('../package.json');
  printTitle('版本信息');
  console.log(`应用名称: ${packageJson.name}`);
  console.log(`版本: ${packageJson.version}`);
  console.log(`描述: ${packageJson.description}`);
  console.log(`Node.js: ${process.version}`);
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const param = args[1];

  const dbTools = new DatabaseTools();
  const testTools = new TestTools();
  const codeTools = new CodeQualityTools();
  const serverTools = new ServerTools();

  switch (command) {
    // 数据库命令
    case 'db:migrate':
      await dbTools.migrate();
      break;
    case 'db:status':
      await dbTools.status();
      break;
    case 'db:create':
      await dbTools.createMigration(param);
      break;
    case 'db:seed':
      await dbTools.seed();
      break;
    case 'db:reset':
      await dbTools.reset();
      break;

    // 测试命令
    case 'test':
      await testTools.runAll();
      break;
    case 'test:watch':
      await testTools.watch();
      break;
    case 'test:cov':
      await testTools.coverage();
      break;
    case 'test:run':
      await testTools.runSpecific(param);
      break;

    // 代码质量命令
    case 'lint':
      await codeTools.lint();
      break;
    case 'format':
      await codeTools.format();
      break;
    case 'type-check':
      await codeTools.typeCheck();
      break;

    // 服务器命令
    case 'start':
      await serverTools.start();
      break;
    case 'build':
      await serverTools.build();
      break;

    // 其他命令
    case 'version':
      showVersion();
      break;
    case 'help':
    default:
      showHelp();
      break;
  }
}

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    print('red', '错误: ' + error.message);
    process.exit(1);
  });
}

module.exports = {
  DatabaseTools,
  TestTools,
  CodeQualityTools,
  ServerTools,
};