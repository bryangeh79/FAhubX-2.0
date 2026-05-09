import React from 'react';
import { Card, Row, Col, Typography, Space, Tag, Divider, Tooltip } from 'antd';
import {
  DesktopOutlined, MobileOutlined, TabletOutlined,
  WindowsOutlined, AppleOutlined, LinuxOutlined, AndroidOutlined,
  ChromeOutlined, GlobalOutlined,
  CheckCircleOutlined, StarOutlined, ThunderboltOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;

interface Template {
  id: string;
  name: string;
  description: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  os: 'windows' | 'macos' | 'linux' | 'android' | 'ios';
  osVersion: string;
  browser: 'chrome' | 'firefox' | 'safari' | 'edge';
  browserVersion: string;
  popularity: number; // 1-5
  successRate: number; // 0-1
  recommended: boolean;
}

interface TemplateSelectorProps {
  onSelect: (template: Template) => void;
  selectedTemplateId?: string;
}

const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  onSelect,
  selectedTemplateId,
}) => {
  // 预设模板数据
  const templates: Template[] = [
    {
      id: 'desktop-chrome-windows',
      name: '桌面 Chrome (Windows)',
      description: '模拟Windows 10/11系统上的Chrome浏览器，适合大多数桌面用户',
      deviceType: 'desktop',
      os: 'windows',
      osVersion: '10/11',
      browser: 'chrome',
      browserVersion: '120+',
      popularity: 5,
      successRate: 0.95,
      recommended: true,
    },
    {
      id: 'mobile-chrome-android',
      name: '移动 Chrome (Android)',
      description: '模拟Android手机上的Chrome浏览器，适合移动端操作',
      deviceType: 'mobile',
      os: 'android',
      osVersion: '12+',
      browser: 'chrome',
      browserVersion: '120+',
      popularity: 4,
      successRate: 0.92,
      recommended: true,
    },
    {
      id: 'macos-safari',
      name: '桌面 Safari (macOS)',
      description: '模拟macOS系统上的Safari浏览器，苹果用户首选',
      deviceType: 'desktop',
      os: 'macos',
      osVersion: '14+',
      browser: 'safari',
      browserVersion: '17+',
      popularity: 3,
      successRate: 0.93,
      recommended: false,
    },
    {
      id: 'desktop-firefox-windows',
      name: '桌面 Firefox (Windows)',
      description: '模拟Windows系统上的Firefox浏览器，隐私保护更好',
      deviceType: 'desktop',
      os: 'windows',
      osVersion: '10/11',
      browser: 'firefox',
      browserVersion: '120+',
      popularity: 3,
      successRate: 0.91,
      recommended: false,
    },
    {
      id: 'ios-safari',
      name: '移动 Safari (iOS)',
      description: '模拟iPhone上的Safari浏览器，iOS设备专用',
      deviceType: 'mobile',
      os: 'ios',
      osVersion: '16+',
      browser: 'safari',
      browserVersion: '16+',
      popularity: 3,
      successRate: 0.94,
      recommended: false,
    },
    {
      id: 'desktop-edge-windows',
      name: '桌面 Edge (Windows)',
      description: '模拟Windows系统上的Edge浏览器，微软生态专用',
      deviceType: 'desktop',
      os: 'windows',
      osVersion: '10/11',
      browser: 'edge',
      browserVersion: '120+',
      popularity: 2,
      successRate: 0.90,
      recommended: false,
    },
    {
      id: 'tablet-android',
      name: '平板 Chrome (Android)',
      description: '模拟Android平板上的Chrome浏览器，大屏设备专用',
      deviceType: 'tablet',
      os: 'android',
      osVersion: '12+',
      browser: 'chrome',
      browserVersion: '120+',
      popularity: 2,
      successRate: 0.89,
      recommended: false,
    },
    {
      id: 'desktop-chrome-linux',
      name: '桌面 Chrome (Linux)',
      description: '模拟Linux系统上的Chrome浏览器，开发者常用',
      deviceType: 'desktop',
      os: 'linux',
      osVersion: 'Ubuntu 22.04',
      browser: 'chrome',
      browserVersion: '120+',
      popularity: 1,
      successRate: 0.88,
      recommended: false,
    },
  ];

  // 设备图标映射
  const deviceIconMap = {
    desktop: <DesktopOutlined />,
    mobile: <MobileOutlined />,
    tablet: <TabletOutlined />,
  };

  const osIconMap = {
    windows: <WindowsOutlined />,
    macos: <AppleOutlined />,
    linux: <LinuxOutlined />,
    android: <AndroidOutlined />,
    ios: <AppleOutlined />,
  };

  const browserIconMap = {
    chrome: <ChromeOutlined />,
    firefox: <GlobalOutlined />, // Firefox图标不可用，用Global代替
    safari: <GlobalOutlined />, // Safari图标不可用，用Global代替
    edge: <GlobalOutlined />,
  };

  // 渲染星级
  const renderStars = (count: number) => {
    return (
      <Space size={2}>
        {[...Array(5)].map((_, i) => (
          <StarOutlined
            key={i}
            style={{
              color: i < count ? '#faad14' : '#d9d9d9',
              fontSize: 12,
            }}
          />
        ))}
      </Space>
    );
  };

  // 渲染成功率
  const renderSuccessRate = (rate: number) => {
    const color = rate >= 0.95 ? '#52c41a' :
                  rate >= 0.9 ? '#1890ff' :
                  rate >= 0.85 ? '#faad14' : '#ff4d4f';
    
    return (
      <Space>
        <CheckCircleOutlined style={{ color, fontSize: 12 }} />
        <Text style={{ color, fontSize: 12 }}>
          {(rate * 100).toFixed(0)}%
        </Text>
      </Space>
    );
  };

  return (
    <div>
      <Title level={5} style={{ marginBottom: 16 }}>
        <ThunderboltOutlined /> 选择预设模板
      </Title>
      
      <Text type="secondary" style={{ marginBottom: 24, display: 'block' }}>
        选择预设模板可以快速创建反检测配置，模板基于真实用户数据优化
      </Text>
      
      <Row gutter={[16, 16]}>
        {templates.map(template => (
          <Col span={12} key={template.id}>
            <Card
              hoverable
              onClick={() => onSelect(template)}
              style={{
                cursor: 'pointer',
                border: selectedTemplateId === template.id ? '2px solid #1890ff' : undefined,
                height: '100%',
              }}
            >
              <Card.Meta
                avatar={
                  <Space direction="vertical" align="center">
                    {deviceIconMap[template.deviceType]}
                    {template.recommended && (
                      <Tag color="gold" style={{ fontSize: 10, padding: '0 4px' }}>
                        推荐
                      </Tag>
                    )}
                  </Space>
                }
                title={
                  <Space>
                    <Text strong>{template.name}</Text>
                    {template.recommended && (
                      <Tooltip title="推荐模板">
                        <StarOutlined style={{ color: '#faad14' }} />
                      </Tooltip>
                    )}
                  </Space>
                }
                description={
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {template.description}
                    </Text>
                    
                    <Divider style={{ margin: '8px 0' }} />
                    
                    <Space>
                      <Tooltip title="设备类型">
                        {deviceIconMap[template.deviceType]}
                      </Tooltip>
                      <Tooltip title="操作系统">
                        {osIconMap[template.os]}
                      </Tooltip>
                      <Tooltip title="浏览器">
                        {browserIconMap[template.browser]}
                      </Tooltip>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {template.os} {template.osVersion} · {template.browser} {template.browserVersion}
                      </Text>
                    </Space>
                    
                    <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                      <Space>
                        <Tooltip title="使用热度">
                          {renderStars(template.popularity)}
                        </Tooltip>
                      </Space>
                      
                      <Space>
                        <Tooltip title="成功率">
                          {renderSuccessRate(template.successRate)}
                        </Tooltip>
                      </Space>
                    </Space>
                    
                    {selectedTemplateId === template.id && (
                      <Tag color="blue" style={{ marginTop: 8 }}>
                        已选中
                      </Tag>
                    )}
                  </Space>
                }
              />
            </Card>
          </Col>
        ))}
      </Row>
      
      {/* 模板统计 */}
      <Row gutter={16} style={{ marginTop: 24 }}>
        <Col span={8}>
          <Card size="small">
            <Space direction="vertical" align="center" style={{ width: '100%' }}>
              <DesktopOutlined style={{ fontSize: 24, color: '#1890ff' }} />
              <Text strong>{templates.filter(t => t.deviceType === 'desktop').length}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>桌面模板</Text>
            </Space>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Space direction="vertical" align="center" style={{ width: '100%' }}>
              <MobileOutlined style={{ fontSize: 24, color: '#52c41a' }} />
              <Text strong>{templates.filter(t => t.deviceType === 'mobile').length}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>移动模板</Text>
            </Space>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Space direction="vertical" align="center" style={{ width: '100%' }}>
              <ChromeOutlined style={{ fontSize: 24, color: '#faad14' }} />
              <Text strong>{templates.filter(t => t.browser === 'chrome').length}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>Chrome模板</Text>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default TemplateSelector;