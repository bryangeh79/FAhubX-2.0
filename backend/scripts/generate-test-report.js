#!/usr/bin/env node

/**
 * 测试报告生成工具
 * 生成HTML格式的测试报告
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 颜色定义
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function print(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 生成HTML报告
function generateHTMLReport(testResults, coverageData) {
  const timestamp = new Date().toLocaleString('zh-CN');
  const totalTests = testResults.numTotalTests;
  const passedTests = testResults.numPassedTests;
  const failedTests = testResults.numFailedTests;
  const successRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(2) : 0;
  
  const coverage = coverageData || {
    statements: { pct: 0 },
    branches: { pct: 0 },
    functions: { pct: 0 },
    lines: { pct: 0 },
  };

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Facebook Auto Bot 测试报告</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        
        .header .timestamp {
            opacity: 0.9;
            font-size: 0.9rem;
        }
        
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #f8f9fa;
        }
        
        .summary-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            text-align: center;
        }
        
        .summary-card h3 {
            color: #666;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
        }
        
        .summary-card .value {
            font-size: 2.5rem;
            font-weight: bold;
            margin: 10px 0;
        }
        
        .summary-card.total .value { color: #1890ff; }
        .summary-card.passed .value { color: #52c41a; }
        .summary-card.failed .value { color: #f5222d; }
        .summary-card.rate .value { color: #faad14; }
        
        .coverage {
            padding: 30px;
        }
        
        .coverage h2 {
            color: #333;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #f0f0f0;
        }
        
        .coverage-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
        }
        
        .coverage-item {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            text-align: center;
        }
        
        .coverage-item h3 {
            color: #666;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
        }
        
        .coverage-item .coverage-value {
            font-size: 2rem;
            font-weight: bold;
            margin: 10px 0;
        }
        
        .coverage-item .coverage-bar {
            height: 8px;
            background: #f0f0f0;
            border-radius: 4px;
            overflow: hidden;
            margin: 15px 0;
        }
        
        .coverage-item .coverage-fill {
            height: 100%;
            border-radius: 4px;
            transition: width 0.3s ease;
        }
        
        .test-results {
            padding: 30px;
        }
        
        .test-results h2 {
            color: #333;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #f0f0f0;
        }
        
        .test-suite {
            margin-bottom: 30px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .test-suite-header {
            background: #f8f9fa;
            padding: 15px 20px;
            border-bottom: 1px solid #f0f0f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
        }
        
        .test-suite-header h3 {
            color: #333;
            font-size: 1.1rem;
        }
        
        .test-suite-header .status {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: bold;
            text-transform: uppercase;
        }
        
        .status.passed { background: #d9f7be; color: #389e0d; }
        .status.failed { background: #fff1f0; color: #cf1322; }
        
        .test-cases {
            padding: 0;
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease;
        }
        
        .test-suite.expanded .test-cases {
            max-height: 5000px;
            padding: 20px;
        }
        
        .test-case {
            padding: 15px;
            margin-bottom: 10px;
            background: #fafafa;
            border-radius: 6px;
            border-left: 4px solid #52c41a;
        }
        
        .test-case.failed {
            border-left-color: #f5222d;
            background: #fff1f0;
        }
        
        .test-case-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .test-case-name {
            font-weight: 500;
            color: #333;
        }
        
        .test-case-duration {
            color: #666;
            font-size: 0.9rem;
        }
        
        .test-case-error {
            background: white;
            padding: 15px;
            border-radius: 4px;
            border: 1px solid #ffccc7;
            margin-top: 10px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.9rem;
            white-space: pre-wrap;
            word-break: break-all;
        }
        
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 0.9rem;
            border-top: 1px solid #f0f0f0;
            background: #f8f9fa;
        }
        
        @media (max-width: 768px) {
            .header h1 {
                font-size: 2rem;
            }
            
            .summary {
                grid-template-columns: 1fr;
            }
            
            .coverage-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Facebook Auto Bot 测试报告</h1>
            <div class="timestamp">生成时间: ${timestamp}</div>
        </div>
        
        <div class="summary">
            <div class="summary-card total">
                <h3>总测试数</h3>
                <div class="value">${totalTests}</div>
                <div class="description">所有测试用例数量</div>
            </div>
            
            <div class="summary-card passed">
                <h3>通过测试</h3>
                <div class="value">${passedTests}</div>
                <div class="description">成功执行的测试</div>
            </div>
            
            <div class="summary-card failed">
                <h3>失败测试</h3>
                <div class="value">${failedTests}</div>
                <div class="description">执行失败的测试</div>
            </div>
            
            <div class="summary-card rate">
                <h3>成功率</h3>
                <div class="value">${successRate}%</div>
                <div class="description">测试通过率</div>
            </div>
        </div>
        
        <div class="coverage">
            <h2>代码覆盖率</h2>
            <div class="coverage-grid">
                <div class="coverage-item">
                    <h3>语句覆盖率</h3>
                    <div class="coverage-value">${coverage.statements.pct}%</div>
                    <div class="coverage-bar">
                        <div class="coverage-fill" style="width: ${coverage.statements.pct}%; background: ${getCoverageColor(coverage.statements.pct)};"></div>
                    </div>
                    <div class="description">${coverage.statements.covered}/${coverage.statements.total} 语句</div>
                </div>
                
                <div class="coverage-item">
                    <h3>分支覆盖率</h3>
                    <div class="coverage-value">${coverage.branches.pct}%</div>
                    <div class="coverage-bar">
                        <div class="coverage-fill" style="width: ${coverage.branches.pct}%; background: ${getCoverageColor(coverage.branches.pct)};"></div>
                    </div>
                    <div class="description">${coverage.branches.covered}/${coverage.branches.total} 分支</div>
                </div>
                
                <div class="coverage-item">
                    <h3>函数覆盖率</h3>
                    <div class="coverage-value">${coverage.functions.pct}%</div>
                    <div class="coverage-bar">
                        <div class="coverage-fill" style="width: ${coverage.functions.pct}%; background: ${getCoverageColor(coverage.functions.pct)};"></div>
                    </div>
                    <div class="description">${coverage.functions.covered}/${coverage.functions.total} 函数</div>
                </div>
                
                <div class="coverage-item">
                    <h3>行覆盖率</h3>
                    <div class="coverage-value">${coverage.lines.pct}%</div>
                    <div class="coverage-bar">
                        <div class="coverage-fill" style="width: ${coverage.lines.pct}%; background: ${getCoverageColor(coverage.lines.pct)};"></div>
                    </div>
                    <div class="description">${coverage.lines.covered}/${coverage.lines.total} 行</div>
                </div>
            </div>
        </div>
        
        <div class="test-results">
            <h2>测试详情</h2>
            ${generateTestSuitesHTML(testResults.testResults)}
        </div>
        
        <div class="footer">
            <p>Facebook Auto Bot - 自动化测试报告 | 版本: 1.0.0</p>
            <p>报告生成工具 | 最后更新: ${timestamp}</p>
        </div>
    </div>
    
    <script>
        // 展开/收起测试套件
        document.querySelectorAll('.test-suite-header').forEach(header => {
            header.addEventListener('click', () => {
                const suite = header.parentElement;
                suite.classList.toggle('expanded');
            });
        });
        
        // 根据覆盖率显示颜色
        function getCoverageColor(pct) {
            if (pct >= 80) return '#52c41a';
            if (pct >= 60) return '#faad14';
            return '#f5222d';
        }
    </script>
</body>
</html>
  `;
}

// 根据覆盖率获取颜色
function getCoverageColor(pct) {
  if (pct >= 80) return '#52c41a';
  if (pct >= 60) return '#faad14';
  return '#f5222d';
}

// 生成测试套件HTML
function generateTestSuitesHTML(testResults) {
  if (!testResults || testResults.length === 0) {
    return '<p>没有测试结果</p>';
  }
  
  return testResults.map(suite => {
    const hasFailures = suite.assertionResults.some(test => test.status === 'failed');
    const statusClass = hasFailures ? 'failed' : 'passed';
    const statusText = hasFailures ? '失败' : '通过';
    
    return `
      <div class="test-suite">
        <div class="test-suite-header">
          <h3>${suite.name}</h3>
          <span class="status ${statusClass}">${statusText}</span>
        </div>
        <div class="test-cases">
          ${suite.assertionResults.map(test => `
            <div class="test-case ${test.status}">
              <div class="test-case-header">
                <div class="test-case-name">${test.title}</div>
                <div class="test-case-duration">${test.duration || 0}ms</div>
              </div>
              ${test.failureMessages ? `
                <div class="test-case-error">
                  ${test.failureMessages.join('\\n')}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

// 运行测试并生成报告
async function generateReport() {
  print('blue', '开始生成测试报告...');
  
  const reportsDir = path.join(__dirname, '../reports');
  const coverageDir = path.join(__dirname, '../coverage');
  
  // 创建报告目录
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  try {
    // 运行测试并获取JSON输出
    print('yellow', '运行测试...');
    const testOutput = execSync('npm test -- --json', { 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const testResults = JSON.parse(testOutput);
    
    // 获取覆盖率数据
    let coverageData = null;
    if (fs.existsSync(path.join(coverageDir, 'coverage-summary.json'))) {
      const coverageSummary = JSON.parse(
        fs.readFileSync(path.join(coverageDir, 'coverage-summary.json'), 'utf-8')
      );
      coverageData = coverageSummary.total;
    }
    
    // 生成HTML报告
    const htmlReport = generateHTMLReport(testResults, coverageData);
    const reportPath = path.join(reportsDir, `test-report-${Date.now()}.html`);
    
    fs.writeFileSync(reportPath, htmlReport, 'utf-8');
    
    print('green', `✓ 测试报告已生成: ${reportPath}`);
    
    // 生成简化的JSON报告
    const jsonReport = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: testResults.numTotalTests,
        passedTests: testResults.numPassedTests,
        failedTests: testResults.numFailedTests,
        successRate: testResults.numTotalTests > 0 ? 
          ((testResults.numPassedTests / testResults.numTotalTests) * 100).toFixed(2) : 0,
      },
      coverage: coverageData,
      testSuites: testResults.testResults.map(suite => ({
        name: suite.name,
        status: suite.status,
        passed: suite.assertionResults.filter(t => t.status === 'passed').length,
        failed: suite.assertionResults.filter(t => t.status === 'failed').length,
        duration: suite.endTime - suite.startTime,
      })),
    };
    
    const jsonReportPath = path.join(reportsDir, 'test-summary.json');
    fs.writeFileSync(jsonReportPath, JSON.stringify(jsonReport, null, 2), 'utf-8');
    
    print('green', `✓ JSON报告已生成: ${jsonReportPath}`);
    
    // 显示摘要
    print('cyan', '\n=== 测试摘要 ===');
    print('cyan', `总测试数: ${testResults.numTotalTests}`);
    print('green', `通过测试: ${testResults.numPassedTests}`);
    if (testResults.numFailedTests > 0) {
      print('red', `失败测试: ${testResults.numFailedTests}`);
    } else {
      print('green', `失败测试: ${testResults.numFailedTests}`);
    }
    print('yellow', `成功率: ${jsonReport.summary.successRate}%`);
    
    if (coverageData) {
      print('cyan', '\n=== 代码覆盖率 ===');
      print('cyan', `语句: ${coverageData.statements.pct}%`);
      print('cyan', `分支: ${coverageData.branches.pct}%`);
      print('cyan', `函数: ${coverageData.functions.pct}%`);
      print('cyan', `行: ${coverageData.lines.pct}%`);
    }
    
    print('green', '\n✓ 测试报告生成完成！');
    
  } catch (error) {
    print('red', '生成测试报告时出错:');
    console.error(error);
    process.exit(1);
  }
}

// 主函数
if (require.main === module) {
  generateReport().catch(error => {
    print('red', '错误: ' + error.message);
    process.exit(1);
  });
}

module.exports = {
  generateHTMLReport,
  generateReport,
};