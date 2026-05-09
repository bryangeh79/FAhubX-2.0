const fs = require('fs');
const path = require('path');

// 对话剧本模板
const scriptTemplates = [
  {
    name: "早安问候",
    description: "简单的早安问候对话",
    category: "casual",
    relationship: "friends",
    time_of_day: "morning",
    estimated_duration: 5,
    difficulty: "easy",
    tags: ["问候", "日常", "简单"]
  },
  {
    name: "周末计划讨论",
    description: "讨论周末计划的对话",
    category: "casual",
    relationship: "friends",
    time_of_day: "afternoon",
    estimated_duration: 8,
    difficulty: "easy",
    tags: ["周末", "计划", "休闲"]
  },
  {
    name: "工作项目讨论",
    description: "同事之间讨论工作项目的对话",
    category: "business",
    relationship: "colleagues",
    time_of_day: "any",
    estimated_duration: 10,
    difficulty: "medium",
    tags: ["工作", "项目", "讨论"]
  },
  {
    name: "兴趣爱好分享",
    description: "分享兴趣爱好的对话",
    category: "hobby",
    relationship: "acquaintances",
    time_of_day: "evening",
    estimated_duration: 12,
    difficulty: "easy",
    tags: ["兴趣", "爱好", "分享"]
  },
  {
    name: "健身话题讨论",
    description: "讨论健身和健康的对话",
    category: "hobby",
    relationship: "friends",
    time_of_day: "any",
    estimated_duration: 10,
    difficulty: "medium",
    tags: ["健身", "健康", "运动"]
  },
  {
    name: "美食推荐",
    description: "推荐美食和餐厅的对话",
    category: "casual",
    relationship: "friends",
    time_of_day: "any",
    estimated_duration: 9,
    difficulty: "easy",
    tags: ["美食", "餐厅", "推荐"]
  },
  {
    name: "旅行计划",
    description: "讨论旅行计划的对话",
    category: "hobby",
    relationship: "friends",
    time_of_day: "any",
    estimated_duration: 12,
    difficulty: "medium",
    tags: ["旅行", "计划", "假期"]
  },
  {
    name: "电影讨论",
    description: "讨论电影和影评的对话",
    category: "hobby",
    relationship: "acquaintances",
    time_of_day: "evening",
    estimated_duration: 11,
    difficulty: "easy",
    tags: ["电影", "娱乐", "讨论"]
  },
  {
    name: "技术问题讨论",
    description: "讨论技术问题和解决方案的对话",
    category: "business",
    relationship: "colleagues",
    time_of_day: "any",
    estimated_duration: 15,
    difficulty: "hard",
    tags: ["技术", "问题", "解决方案"]
  },
  {
    name: "天气话题",
    description: "讨论天气和季节变化的对话",
    category: "casual",
    relationship: "acquaintances",
    time_of_day: "any",
    estimated_duration: 6,
    difficulty: "easy",
    tags: ["天气", "季节", "日常"]
  }
];

// 消息模板
const messageTemplates = {
  greeting: [
    "你好！最近怎么样？",
    "嗨！最近好吗？",
    "你好啊！最近如何？",
    "嗨，最近怎么样？"
  ],
  response: [
    "我很好，谢谢！你呢？",
    "还不错，你呢？",
    "挺好的，谢谢关心。你呢？",
    "还可以，你呢？"
  ],
  casual: [
    "今天天气不错",
    "最近工作忙吗？",
    "周末有什么计划？",
    "最近看了什么好电影？"
  ],
  business: [
    "关于那个项目，你有什么想法？",
    "我们需要讨论一下进度",
    "会议安排在明天可以吗？",
    "这个任务什么时候能完成？"
  ],
  hobby: [
    "你平时有什么兴趣爱好？",
    "最近在玩什么游戏？",
    "有什么好书推荐吗？",
    "你喜欢什么类型的音乐？"
  ],
  closing: [
    "好的，下次再聊",
    "很高兴和你聊天",
    "保持联系！",
    "再见，祝你愉快"
  ]
};

// 生成对话流程
function generateFlow(template) {
  const flow = [];
  const steps = 4 + Math.floor(Math.random() * 4); // 4-7步
  
  for (let i = 0; i < steps; i++) {
    const role = i % 2 === 0 ? 'initiator' : 'responder';
    let messageType;
    
    if (i === 0) {
      messageType = 'greeting';
    } else if (i === steps - 1) {
      messageType = 'closing';
    } else {
      // 根据分类选择消息类型
      if (template.category === 'business') {
        messageType = 'business';
      } else if (template.category === 'hobby') {
        messageType = 'hobby';
      } else {
        messageType = 'casual';
      }
    }
    
    const messages = messageTemplates[messageType];
    const message = messages[Math.floor(Math.random() * messages.length)];
    
    flow.push({
      role,
      message,
      delay_seconds: 2 + Math.floor(Math.random() * 4), // 2-5秒延迟
      variations: generateVariations(message)
    });
  }
  
  return flow;
}

// 生成消息变体
function generateVariations(message) {
  const variations = [];
  const count = 2 + Math.floor(Math.random() * 2); // 2-3个变体
  
  for (let i = 0; i < count; i++) {
    // 简单替换一些词语生成变体
    let variation = message
      .replace('你好', ['嗨', '你好啊', '哈喽'][i % 3])
      .replace('最近', ['近来', '这些天', '这段时间'][i % 3])
      .replace('怎么样', ['如何', '好吗', '怎样'][i % 3]);
    
    variations.push(variation);
  }
  
  return variations;
}

// 生成50个对话剧本
function generateScripts() {
  const scripts = [];
  
  for (let i = 1; i <= 50; i++) {
    const templateIndex = (i - 1) % scriptTemplates.length;
    const template = scriptTemplates[templateIndex];
    
    const script = {
      id: `script_${String(i).padStart(3, '0')}`,
      name: `${template.name} ${Math.ceil(i / scriptTemplates.length)}`,
      description: template.description,
      category: template.category,
      relationship: template.relationship,
      time_of_day: template.time_of_day,
      estimated_duration: template.estimated_duration,
      difficulty: template.difficulty,
      tags: [...template.tags],
      flow: generateFlow(template),
      version: "1.0.0",
      is_active: true,
      usage_count: Math.floor(Math.random() * 100),
      success_rate: 70 + Math.floor(Math.random() * 30), // 70-99%
      average_rating: 3.5 + Math.random() * 1.5, // 3.5-5.0
      total_ratings: Math.floor(Math.random() * 50)
    };
    
    scripts.push(script);
  }
  
  return scripts;
}

// 主函数
function main() {
  console.log('开始生成50个对话剧本...');
  
  const scripts = generateScripts();
  
  // 确保目录存在
  const outputDir = path.join(__dirname, '../src/conversation-scripts');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 写入文件
  const outputPath = path.join(outputDir, 'all-scripts.json');
  fs.writeFileSync(
    outputPath,
    JSON.stringify(scripts, null, 2),
    'utf-8'
  );
  
  console.log(`已生成50个对话剧本，保存到: ${outputPath}`);
  console.log(`第一个剧本ID: ${scripts[0].id}`);
  console.log(`最后一个剧本ID: ${scripts[49].id}`);
  
  // 同时生成SQL插入脚本
  generateSQLScript(scripts);
}

// 生成SQL插入脚本
function generateSQLScript(scripts) {
  const sqlDir = path.join(__dirname, '../database/migrations');
  if (!fs.existsSync(sqlDir)) {
    fs.mkdirSync(sqlDir, { recursive: true });
  }
  
  const sqlPath = path.join(sqlDir, '002_insert_conversation_scripts.sql');
  
  let sql = `-- 插入50个对话剧本\n`;
  sql += `INSERT INTO conversation_scripts (id, name, description, category, relationship, time_of_day, estimated_duration, difficulty, tags, flow, version, is_active, usage_count, success_rate, average_rating, total_ratings, created_at, updated_at) VALUES\n`;
  
  const now = new Date().toISOString();
  
  const values = scripts.map(script => {
    return `  (
    '${script.id}',
    '${script.name.replace(/'/g, "''")}',
    '${script.description.replace(/'/g, "''")}',
    '${script.category}',
    '${script.relationship}',
    ${script.time_of_day ? `'${script.time_of_day}'` : 'NULL'},
    ${script.estimated_duration},
    '${script.difficulty}',
    ARRAY[${script.tags.map(tag => `'${tag}'`).join(', ')}],
    '${JSON.stringify(script.flow).replace(/'/g, "''")}',
    '${script.version}',
    ${script.is_active},
    ${script.usage_count},
    ${script.success_rate},
    ${script.average_rating},
    ${script.total_ratings},
    '${now}',
    '${now}'
  )`;
  }).join(',\n');
  
  sql += values + ';\n';
  
  fs.writeFileSync(sqlPath, sql, 'utf-8');
  console.log(`已生成SQL插入脚本: ${sqlPath}`);
}

// 执行
main();