import React, { useState } from 'react';
import { Card, Space, Button, Typography, Alert } from 'antd';
import {
  SafetyOutlined,
  PlayCircleOutlined,
  ExportOutlined,
  ImportOutlined,
} from '@ant-design/icons';
import ConfigCard from './ConfigCard';
import TestResultPanel from './TestResultPanel';
import BatchOperationPanel from './BatchOperationPanel';
import TemplateSelector from './TemplateSelector';
import ImportExportPanel from './ImportExportPanel';
import { AntiDetectionConfig, LoginTestResult, ExtendedFacebookAccount } from '../../types/facebook-login';

const { Title, Text } = Typography;

// 示例数据
const exampleConfig: AntiDetectionConfig = {
  id: 'config-001',
  name: 'Windows Chrome 桌面配置',
  browserFingerprint: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    screenWidth: 1920,
    screenHeight: 1080,
    colorDepth: 24,
    timezone: 'Asia/Shanghai',
    language: 'zh-CN',
    platform: 'Win32',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    webglVendor: 'Google Inc.',
    webglRenderer: 'ANGLE (Intel(R) HD Graphics 630 Direct3D11 vs_5_0 ps_5_0)',
    canvasFingerprint: 'canvas-fingerprint-001',
    audioFingerprint: 'audio-fingerprint-001',
    fonts: ['Arial', 'Microsoft YaHei', 'SimSun', 'Tahoma', 'Verdana'],
    plugins: ['Chrome PDF Plugin', 'Chrome PDF Viewer', 'Native Client'],
  },
  humanBehavior: {
    mouseMovement: {
      enabled: true,
      speedVariation: 0.3,
      pauseProbability: 0.1,
      curveProbability: 0.4,
    },
    keyboardInput: {
      enabled: true,
      typingSpeed: 300,
      errorRate: 0.02,
      backspaceProbability: 0.05,
    },
    scrolling: {
      enabled: true,
      speedVariation: 0.2,
      pauseProbability: 0.15,
      scrollDirectionChanges: true,
    },
    pageInteraction: {
      enabled: true,
      clickRandomness: 0.3,
      hoverProbability: 0.2,
      tabSwitchProbability: 0.1,
    },
  },
  deviceSimulation: {
    deviceType: 'desktop',
    os: 'windows',
    osVersion: '10',
    browser: 'chrome',
    browserVersion: '120.0.0.0',
    viewportWidth: 1920,
    viewportHeight: 1080,
    pixelRatio: 1,
    touchSupport: false,
  },
  enabled: true,
  accounts: ['account-001', 'account-002'],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const exampleTestResult: LoginTestResult = {
  success: true,
  timestamp: '2024-01-01T12:00:00Z',
  duration: 1850,
  ipAddress: '192.168.1.100',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  steps: [
    { name: '浏览器初始化', success: true, duration: 300 },
    { name: '指纹设置', success: true, duration: 200 },
    { name: '行为模拟', success: true, duration: 400 },
    { name: '网络请求', success: true, duration: 600 },
    { name: '会话创建', success: true, duration: 350 },
  ],
  cookiesCount: 15,
  sessionCreated: true,
  sessionId: 'session-1234567890',
  warnings: ['检测到轻微异常'],
  errors: [],
};

const exampleAccounts: ExtendedFacebookAccount[] = [
  {
    id: 'account-001',
    name: '用户账号1',
    email: 'user1@example.com',
    accountType: 'user',
    verified: true,
    loginStatus: true,
    status: 'active',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'account-002',
    name: '用户账号2',
    email: 'user2@example.com',
    accountType: 'user',
    verified: true,
    loginStatus: false,
    status: 'active',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'account-003',
    name: '企业页面',
    accountType: 'page',
    verified: true,
    loginStatus: true,
    status: 'active',
    createdAt: '2024-01-01T00:00:00Z',
  },
];

const ExampleUsage: React.FC = () => {
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(['account-001', 'account-002']);

  const handleTemplateSelect = (template: any) => {
    setSelectedTemplate(template);
    console.log('选择的模板:', template);
  };

  const handleConfigImport = (configs: AntiDetectionConfig[]) => {
    console.log('导入的配置:', configs);
  };

  const handleConfigExport = (configIds: string[]) => {
    console.log('导出的配置ID:', configIds);
  };

  const handleOperationComplete = (operation: any) => {
    console.log('操作完成:', operation);
  };

  return (
    <div style={{ padding: 24 }}>
      <Title level={2}>
        <SafetyOutlined /> 反检测配置组件使用示例
      </Title>
      
      <Alert
        message="组件示例"
        description="以下展示反检测配置管理相关组件的使用方式和效果"
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />
      
      {/* ConfigCard 示例 */}
      <Card title="配置卡片组件 (ConfigCard)" style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>展示单个反检测配置的基本信息，支持点击查看详情和操作。</Text>
          <ConfigCard
            config={exampleConfig}
            onClick={() => console.log('点击配置:', exampleConfig.name)}
            actions={[
              <Button key="edit" type="text" size="small">编辑</Button>,
              <Button key="test" type="text" size="small">测试</Button>,
            ]}
          />
        </Space>
      </Card>
      
      {/* TestResultPanel 示例 */}
      <Card title="测试结果面板 (TestResultPanel)" style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>展示配置测试的详细结果，包括步骤成功率、耗时、错误信息等。</Text>
          <TestResultPanel
            result={exampleTestResult}
            title="配置测试结果"
            showDetails={true}
          />
        </Space>
      </Card>
      
      {/* BatchOperationPanel 示例 */}
      <Card title="批量操作面板 (BatchOperationPanel)" style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>支持批量应用配置、批量测试等操作，实时显示操作进度和结果。</Text>
          <BatchOperationPanel
            accounts={exampleAccounts}
            selectedAccountIds={selectedAccountIds}
            onOperationComplete={handleOperationComplete}
          />
        </Space>
      </Card>
      
      {/* TemplateSelector 示例 */}
      <Card title="模板选择器 (TemplateSelector)" style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>提供预设的反检测配置模板，支持按设备类型、操作系统、浏览器筛选。</Text>
          <TemplateSelector
            onSelect={handleTemplateSelect}
            selectedTemplateId={selectedTemplate?.id}
          />
          {selectedTemplate && (
            <Alert
              message={`已选择模板: ${selectedTemplate.name}`}
              type="success"
              showIcon
            />
          )}
        </Space>
      </Card>
      
      {/* ImportExportPanel 示例 */}
      <Card title="导入导出面板 (ImportExportPanel)" style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>支持配置的导入和导出功能，包括批量操作和任务监控。</Text>
          <ImportExportPanel
            configs={[exampleConfig]}
            onImport={handleConfigImport}
            onExport={handleConfigExport}
          />
        </Space>
      </Card>
      
      {/* 使用场景示例 */}
      <Card title="典型使用场景" style={{ marginBottom: 24 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Title level={5}>场景一：创建新配置</Title>
            <Text>1. 点击"创建配置"按钮 → 2. 选择预设模板 → 3. 调整参数 → 4. 保存配置</Text>
          </div>
          
          <div>
            <Title level={5}>场景二：批量应用配置</Title>
            <Text>1. 选择配置 → 2. 点击"批量应用" → 3. 选择目标账号 → 4. 开始应用</Text>
          </div>
          
          <div>
            <Title level={5}>场景三：配置测试优化</Title>
            <Text>1. 测试配置 → 2. 分析结果 → 3. 调整参数 → 4. 重新测试 → 5. 保存优化</Text>
          </div>
          
          <div>
            <Title level={5}>场景四：配置迁移</Title>
            <Text>1. 导出现有配置 → 2. 导入到新环境 → 3. 验证配置 → 4. 批量应用</Text>
          </div>
        </Space>
      </Card>
      
      {/* 集成说明 */}
      <Card title="集成说明">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            message="API集成"
            description="所有组件通过 facebookLoginService 与后端API通信，确保数据一致性"
            type="info"
            showIcon
          />
          
          <div>
            <Title level={5}>状态管理</Title>
            <Text>组件使用React状态管理，支持响应式更新和实时数据同步。</Text>
          </div>
          
          <div>
            <Title level={5}>错误处理</Title>
            <Text>内置错误处理和用户提示，确保操作的可控性和用户体验。</Text>
          </div>
          
          <div>
            <Title level={5}>性能优化</Title>
            <Text>支持虚拟滚动、懒加载等优化技术，确保大数据量下的性能。</Text>
          </div>
        </Space>
      </Card>
    </div>
  );
};

export default ExampleUsage;