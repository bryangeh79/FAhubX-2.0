// 简单的JSX语法验证
const fs = require('fs');
const path = require('path');

function validateJSX(filePath) {
  console.log(`\n🔍 验证: ${filePath}`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // 基本语法检查
    const issues = [];
    
    // 1. 检查JSX标签平衡（忽略自闭合标签）
    const openTags = [];
    const lines = content.split('\n');
    
    lines.forEach((line, lineNum) => {
      // 查找非自闭合的打开标签
      const openMatch = line.matchAll(/<([A-Z][A-Za-z0-9]*)(?![^>]*\/>)/g);
      for (const match of openMatch) {
        openTags.push({ tag: match[1], line: lineNum + 1 });
      }
      
      // 查找关闭标签
      const closeMatch = line.matchAll(/<\/([A-Z][A-Za-z0-9]*)>/g);
      for (const match of closeMatch) {
        const lastOpen = openTags.pop();
        if (!lastOpen || lastOpen.tag !== match[1]) {
          issues.push(`第${lineNum + 1}行: 标签不匹配或未正确闭合`);
        }
      }
      
      // 检查明显的语法错误
      if (line.includes('size="small"') && line.includes('<Tag')) {
        issues.push(`第${lineNum + 1}行: Tag组件不应使用size属性`);
      }
      
      // 检查未闭合的字符串或括号
      const quoteCount = (line.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        issues.push(`第${lineNum + 1}行: 引号可能未闭合`);
      }
      
      const braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (braceCount !== 0) {
        // issues.push(`第${lineNum + 1}行: 大括号不平衡 (差值: ${braceCount})`);
      }
    });
    
    // 检查是否有未闭合的标签
    if (openTags.length > 0) {
      openTags.forEach(tag => {
        issues.push(`第${tag.line}行: <${tag.tag}> 标签未闭合`);
      });
    }
    
    if (issues.length === 0) {
      console.log('✅ 语法检查通过');
      return true;
    } else {
      console.log('❌ 发现问题:');
      issues.forEach(issue => console.log(`  ⚠️ ${issue}`));
      return false;
    }
    
  } catch (error) {
    console.log(`❌ 读取文件失败: ${error.message}`);
    return false;
  }
}

// 验证关键文件
const files = [
  'src/App.tsx',
  'src/components/AppLayout.tsx',
  'src/pages/AccountsPage.tsx',
  'src/pages/VPNPage.tsx',
  'src/pages/AntiDetectionPage.tsx',
  'src/pages/LoginStatusPage.tsx'
];

console.log('📋 开始JSX语法验证...');
let allValid = true;

files.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    if (!validateJSX(fullPath)) {
      allValid = false;
    }
  } else {
    console.log(`❌ 文件不存在: ${file}`);
    allValid = false;
  }
});

console.log(`\n📊 验证完成: ${allValid ? '✅ 所有文件语法正确' : '❌ 发现语法问题'}`);
process.exit(allValid ? 0 : 1);