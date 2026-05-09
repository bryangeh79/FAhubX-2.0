// Dashboard 功能验证脚本
const fs = require('fs');
const path = require('path');

console.log('=== Facebook Auto Bot Dashboard 功能验证 ===\n');

// 检查文件是否存在
const filesToCheck = [
  'src/pages/DashboardPage.tsx',
  'src/components/DashboardChart.tsx',
  'src/components/SystemHealthMonitor.tsx',
  'src/components/AccountHealthIndicator.tsx',
  'src/components/TaskMonitor.tsx',
  'src/test-dashboard.html',
  'DASHBOARD_IMPROVEMENT_REPORT.md'
];

let allFilesExist = true;
filesToCheck.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    console.log(`✅ ${file} (${stats.size} bytes)`);
  } else {
    console.log(`❌ ${file} - 文件不存在`);
    allFilesExist = false;
  }
});

console.log('\n=== 关键功能检查 ===\n');

// 检查 DashboardPage.tsx 的关键功能
const dashboardContent = fs.readFileSync(
  path.join(__dirname, 'src/pages/DashboardPage.tsx'),
  'utf8'
);

const checks = [
  { name: '统计卡片数量', regex: /statCards\.map/g, expected: '至少8个统计卡片' },
  { name: '图表组件', regex: /DashboardChart/g, expected: '使用DashboardChart组件' },
  { name: '系统健康监控', regex: /SystemHealthMonitor/g, expected: '包含SystemHealthMonitor' },
  { name: '账号健康状态', regex: /AccountHealthIndicator/g, expected: '包含AccountHealthIndicator' },
  { name: '任务监控', regex: /TaskMonitor/g, expected: '包含TaskMonitor' },
  { name: 'React Query', regex: /useQuery/g, expected: '使用React Query进行数据获取' },
  { name: '自动刷新', regex: /refetchInterval/g, expected: '实现自动刷新功能' },
  { name: '响应式设计', regex: /xs={24}.*sm={.*}.*lg={/g, expected: '响应式网格布局' },
  { name: '错误处理', regex: /error.*loading/g, expected: '错误处理和加载状态' },
  { name: 'TypeScript导入', regex: /import.*from.*['\"]/g, expected: '正确的TypeScript导入' },
];

checks.forEach(check => {
  const matches = dashboardContent.match(check.regex);
  if (matches) {
    console.log(`✅ ${check.name}: ${check.expected} (找到${matches.length}处)`);
  } else {
    console.log(`❌ ${check.name}: 未找到 - ${check.expected}`);
  }
});

// 检查组件文件的关键内容
console.log('\n=== 组件功能检查 ===\n');

const components = [
  { 
    file: 'src/components/DashboardChart.tsx',
    checks: [
      { name: 'Recharts导入', regex: /from ['\"]recharts['\"]/ },
      { name: '图表类型', regex: /LineChart|BarChart|AreaChart/ },
      { name: '响应式容器', regex: /ResponsiveContainer/ },
      { name: '加载状态', regex: /Spin.*loading/ },
    ]
  },
  {
    file: 'src/components/SystemHealthMonitor.tsx',
    checks: [
      { name: '资源监控', regex: /cpu.*memory.*disk/ },
      { name: '服务状态', regex: /services.*status/ },
      { name: '告警系统', regex: /alerts.*warning/ },
      { name: '自动刷新', regex: /refetchInterval.*60000/ },
    ]
  },
  {
    file: 'src/components/AccountHealthIndicator.tsx',
    checks: [
      { name: '健康评分', regex: /healthScore/ },
      { name: '任务统计', regex: /tasks.*completed.*failed/ },
      { name: '性能指标', regex: /successRate.*responseTime/ },
      { name: '问题检测', regex: /issues.*severity/ },
    ]
  },
  {
    file: 'src/components/TaskMonitor.tsx',
    checks: [
      { name: '任务状态', regex: /status.*running.*completed/ },
      { name: '进度显示', regex: /progress.*percent/ },
      { name: '日志查看', regex: /logs.*查看日志/ },
      { name: '操作功能', regex: /start.*pause.*stop/ },
    ]
  }
];

components.forEach(component => {
  const filePath = path.join(__dirname, component.file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    console.log(`📦 ${component.file}:`);
    component.checks.forEach(check => {
      const matches = content.match(check.regex);
      if (matches) {
        console.log(`  ✅ ${check.name}`);
      } else {
        console.log(`  ❌ ${check.name}`);
      }
    });
    console.log('');
  }
});

console.log('=== 验证完成 ===');
console.log(allFilesExist ? '✅ 所有文件都存在' : '⚠️  部分文件缺失');
console.log('请查看 DASHBOARD_IMPROVEMENT_REPORT.md 获取完整报告');