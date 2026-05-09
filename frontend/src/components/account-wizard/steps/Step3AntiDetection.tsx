import React, { useState, useEffect } from 'react';
import {
  Form,
  Select,
  Row,
  Col,
  Typography,
  Alert,
  Space,
  Tag,
  Card,
  Button,
  Input,
  InputNumber,
  Slider,
  Switch,
  Collapse,
  Tabs,
  Divider,
  Tooltip,
} from 'antd';
import {
  SafetyOutlined,
  UserOutlined,
  DesktopOutlined,
  MobileOutlined,
  TabletOutlined,
  ChromeOutlined,
  FireOutlined,
  CompassOutlined,
  WindowsOutlined,
  AppleOutlined,
  AndroidOutlined,
  LinuxOutlined,
  EyeOutlined,
  CodeOutlined,
  RadarChartOutlined,
  SettingOutlined,
} from '@ant-design/icons';

import { ExtendedFacebookAccount, AntiDetectionConfig, DeviceSimulation, HumanBehaviorParams, BrowserFingerprint } from '../../../types/facebook-login';
import { facebookLoginService } from '../../../services/facebook-login';

const { Title, Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;
const { TabPane } = Tabs;

interface Step3AntiDetectionProps {
  formData: Partial<ExtendedFacebookAccount>;
  onChange: (data: Partial<ExtendedFacebookAccount>) => void;
  registerForm: (form: any) => void;
}

const Step3AntiDetection: React.FC<Step3AntiDetectionProps> = ({
  formData,
  onChange,
  registerForm,
}) => {
  const [form] = Form.useForm();
  const [configs, setConfigs] = useState<AntiDetectionConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('browser');

  useEffect(() => {
    registerForm(form);
    loadConfigs();
  }, [form, registerForm]);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      // 这里应该调用实际的API，暂时使用模拟数据
      const mockConfigs: AntiDetectionConfig[] = [
        {
          id: '1',
          name: 'Chrome桌面标准配置',
          browserFingerprint: getDefaultBrowserFingerprint('desktop', 'chrome'),
          humanBehavior: getDefaultHumanBehavior(),
          deviceSimulation: getDefaultDeviceSimulation('desktop', 'chrome'),
          enabled: true,
          accounts: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '2',
          name: 'Safari移动端配置',
          browserFingerprint: getDefaultBrowserFingerprint('mobile', 'safari'),
          humanBehavior: getDefaultHumanBehavior(),
          deviceSimulation: getDefaultDeviceSimulation('mobile', 'safari'),
          enabled: true,
          accounts: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      setConfigs(mockConfigs);
    } catch (error) {
      console.error('加载反检测配置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDefaultBrowserFingerprint = (deviceType: string, browser: string): BrowserFingerprint => {
    const base = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      screenWidth: 1920,
      screenHeight: 1080,
      colorDepth: 24,
      timezone: 'Asia/Shanghai',
      language: 'zh-CN',
      platform: 'Win32',
      hardwareConcurrency: 8,
      deviceMemory: 8,
      webglVendor: 'Google Inc. (NVIDIA)',
      webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)',
      canvasFingerprint: 'canvas_fingerprint_hash',
      audioFingerprint: 'audio_fingerprint_hash',
      fonts: ['Arial', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia'],
      plugins: ['Chrome PDF Viewer', 'Chrome PDF Plugin', 'Native Client'],
    };

    if (deviceType === 'mobile' && browser === 'safari') {
      return {
        ...base,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
        screenWidth: 390,
        screenHeight: 844,
        platform: 'iPhone',
        language: 'zh-CN',
        timezone: 'Asia/Shanghai',
      };
    }

    return base;
  };

  const getDefaultHumanBehavior = (): HumanBehaviorParams => ({
    mouseMovement: {
      enabled: true,
      speedVariation: 0.3,
      pauseProbability: 0.1,
      curveProbability: 0.7,
    },
    keyboardInput: {
      enabled: true,
      typingSpeed: 250,
      errorRate: 0.02,
      backspaceProbability: 0.05,
    },
    scrolling: {
      enabled: true,
      speedVariation: 0.4,
      pauseProbability: 0.15,
      scrollDirectionChanges: true,
    },
    pageInteraction: {
      enabled: true,
      clickRandomness: 0.3,
      hoverProbability: 0.2,
      tabSwitchProbability: 0.1,
    },
  });

  const getDefaultDeviceSimulation = (deviceType: string, browser: string): DeviceSimulation => {
    if (deviceType === 'mobile' && browser === 'safari') {
      return {
        deviceType: 'mobile',
        os: 'ios',
        osVersion: '15.0',
        browser: 'safari',
        browserVersion: '15.0',
        viewportWidth: 390,
        viewportHeight: 844,
        pixelRatio: 3,
        touchSupport: true,
      };
    }

    return {
      deviceType: 'desktop',
      os: 'windows',
      osVersion: '10.0',
      browser: 'chrome',
      browserVersion: '96.0.4664.110',
      viewportWidth: 1920,
      viewportHeight: 1080,
      pixelRatio: 1,
      touchSupport: false,
    };
  };

  const handleValuesChange = (changedValues: any, allValues: any) => {
    onChange({
      loginConfig: {
        ...formData.loginConfig,
        antiDetectionConfig: allValues,
      },
    });
  };

  const handleConfigSelect = (configId: string) => {
    const selectedConfig = configs.find(c => c.id === configId);
    if (selectedConfig) {
      form.setFieldsValue({
        browserFingerprint: selectedConfig.browserFingerprint,
        humanBehavior: selectedConfig.humanBehavior,
        deviceSimulation: selectedConfig.deviceSimulation,
      });
      handleValuesChange({}, form.getFieldsValue());
    }
  };

  const renderDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'desktop': return <DesktopOutlined />;
      case 'mobile': return <MobileOutlined />;
      case 'tablet': return <TabletOutlined />;
      default: return <DesktopOutlined />;
    }
  };

  const renderBrowserIcon = (browser: string) => {
    switch (browser) {
      case 'chrome': return <ChromeOutlined />;
      case 'firefox': return <FireOutlined />;
      case 'safari': return <CompassOutlined />;
      default: return <ChromeOutlined />;
    }
  };

  const renderOSIcon = (os: string) => {
    switch (os) {
      case 'windows': return <WindowsOutlined />;
      case 'macos': return <AppleOutlined />;
      case 'linux': return <LinuxOutlined />;
      case 'android': return <AndroidOutlined />;
      case 'ios': return <AppleOutlined />;
      default: return <WindowsOutlined />;
    }
  };

  return (
    <div>
      <Title level={5} style={{ marginBottom: 24 }}>
        <SafetyOutlined /> 反检测配置
      </Title>
      
      <Alert
        message="反检测配置说明"
        description="配置浏览器指纹、人类行为模拟和设备信息，使自动化登录行为更像真实用户，避免被Facebook检测。"
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Row gutter={24} style={{ marginBottom: 24 }}>
        <Col span={24}>
          <Card size="small">
            <Form
              form={form}
              layout="vertical"
              initialValues={formData.loginConfig?.antiDetectionConfig || {}}
              onValuesChange={handleValuesChange}
            >
              <Tabs activeKey={activeTab} onChange={setActiveTab}>
                <TabPane
                  tab={
                    <span>
                      <EyeOutlined />
                      预设配置
                    </span>
                  }
                  key="presets"
                >
                  <Form.Item
                    name="configId"
                    label="选择预设配置"
                    tooltip="选择已有的反检测配置模板"
                  >
                    <Select
                      placeholder="选择预设配置"
                      size="large"
                      onChange={handleConfigSelect}
                      dropdownRender={(menu) => (
                        <>
                          {menu}
                          <Divider style={{ margin: '8px 0' }} />
                          <div style={{ padding: '8px 12px' }}>
                            <Button type="link" icon={<PlusOutlined />} onClick={() => {/* 创建新配置 */}}>
                              创建新配置
                            </Button>
                          </div>
                        </>
                      )}
                    >
                      {configs.map(config => (
                        <Option key={config.id} value={config.id}>
                          <Space>
                            {renderDeviceIcon(config.deviceSimulation.deviceType)}
                            {renderBrowserIcon(config.deviceSimulation.browser)}
                            <span>{config.name}</span>
                            <Tag color={config.enabled ? 'green' : 'default'} style={{ fontSize: 12 }}>
                              {config.enabled ? '启用' : '禁用'}
                            </Tag>
                          </Space>
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                  
                  <div style={{ background: '#f6ffed', padding: 16, borderRadius: 6, marginTop: 16 }}>
                    <Text strong>预设配置说明：</Text>
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                      <li>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Chrome桌面标准配置：模拟Windows 10上的Chrome浏览器，适合大多数场景
                        </Text>
                      </li>
                      <li>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Safari移动端配置：模拟iPhone上的Safari浏览器，适合移动端操作
                        </Text>
                      </li>
                      <li>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          选择配置后，下方各选项卡会自动填充相应参数
                        </Text>
                      </li>
                    </ul>
                  </div>
                </TabPane>
                
                <TabPane
                  tab={
                    <span>
                      <CodeOutlined />
                      浏览器指纹
                    </span>
                  }
                  key="browser"
                >
                  <Collapse defaultActiveKey={['basic']}>
                    <Panel header="基本指纹信息" key="basic">
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item
                            name={['browserFingerprint', 'userAgent']}
                            label="User-Agent"
                            tooltip="浏览器用户代理字符串"
                          >
                            <Input.TextArea
                              rows={3}
                              placeholder="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                            />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name={['browserFingerprint', 'timezone']}
                            label="时区"
                            tooltip="浏览器时区设置"
                          >
                            <Input placeholder="Asia/Shanghai" />
                          </Form.Item>
                          
                          <Form.Item
                            name={['browserFingerprint', 'language']}
                            label="语言"
                            tooltip="浏览器语言设置"
                          >
                            <Input placeholder="zh-CN" />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Panel>
                    
                    <Panel header="屏幕与硬件信息" key="screen">
                      <Row gutter={16}>
                        <Col span={8}>
                          <Form.Item
                            name={['browserFingerprint', 'screenWidth']}
                            label="屏幕宽度"
                            tooltip="屏幕分辨率宽度"
                          >
                            <InputNumber min={320} max={7680} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item
                            name={['browserFingerprint', 'screenHeight']}
                            label="屏幕高度"
                            tooltip="屏幕分辨率高度"
                          >
                            <InputNumber min={240} max={4320} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item
                            name={['browserFingerprint', 'colorDepth']}
                            label="颜色深度"
                            tooltip="屏幕颜色深度"
                          >
                            <InputNumber min={8} max={32} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                      </Row>
                      
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item
                            name={['browserFingerprint', 'hardwareConcurrency']}
                            label="CPU核心数"
                            tooltip="逻辑处理器核心数量"
                          >
                            <InputNumber min={1} max={64} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name={['browserFingerprint', 'deviceMemory']}
                            label="设备内存(GB)"
                            tooltip="设备内存大小"
                          >
                            <InputNumber min={1} max={128} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Panel>
                    
                    <Panel header="WebGL与Canvas指纹" key="webgl">
                      <Form.Item
                        name={['browserFingerprint', 'webglVendor']}
                        label="WebGL厂商"
                        tooltip="WebGL渲染器厂商信息"
                      >
                        <Input placeholder="Google Inc. (NVIDIA)" />
                      </Form.Item>
                      
                      <Form.Item
                        name={['browserFingerprint', 'webglRenderer']}
                        label="WebGL渲染器"
                        tooltip="WebGL渲染器详细信息"
                      >
                        <Input.TextArea
                          rows={2}
                          placeholder="ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)"
                        />
                      </Form.Item>
                      
                      <Form.Item
                        name={['browserFingerprint', 'canvasFingerprint']}
                        label="Canvas指纹"
                        tooltip="Canvas渲染指纹哈希"
                      >
                        <Input placeholder="canvas_fingerprint_hash" />
                      </Form.Item>
                      
                      <Form.Item
                        name={['browserFingerprint', 'audioFingerprint']}
                        label="音频指纹"
                        tooltip="音频上下文指纹哈希"
                      >
                        <Input placeholder="audio_fingerprint_hash" />
                      </Form.Item>
                    </Panel>
                    
                    <Panel header="字体与插件" key="fonts">
                      <Form.Item
                        name={['browserFingerprint', 'fonts']}
                        label="字体列表"
                        tooltip="系统安装的字体列表"
                      >
                        <Select
                          mode="tags"
                          placeholder="输入字体名称后按回车添加"
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                      
                      <Form.Item
                        name={['browserFingerprint', 'plugins']}
                        label="浏览器插件"
                        tooltip="浏览器安装的插件列表"
                      >
                        <Select
                          mode="tags"
                          placeholder="输入插件名称后按回车添加"
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    </Panel>
                  </Collapse>
                </TabPane>
                
                <TabPane
                  tab={
                    <span>
                      <UserOutlined />
                      人类行为
                    </span>
                  }
                  key="behavior"
                >
                  <Collapse defaultActiveKey={['mouse', 'keyboard']}>
                    <Panel header="鼠标移动模拟" key="mouse">
                      <Form.Item
                        name={['humanBehavior', 'mouseMovement', 'enabled']}
                        label="启用鼠标移动模拟"
                        valuePropName="checked"
                      >
                        <Switch />
                      </Form.Item>
                      
                      <Form.Item
                        name={['humanBehavior', 'mouseMovement', 'speedVariation']}
                        label="速度变化率"
                        tooltip="鼠标移动速度的随机变化程度"
                      >
                        <Slider
                          min={0}
                          max={1}
                          step={0.1}
                          marks={{
                            0: '稳定',
                            0.5: '适中',
                            1: '随机',
                          }}
                        />
                      </Form.Item>
                      
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item
                            name={['humanBehavior', 'mouseMovement', 'pauseProbability']}
                            label="暂停概率"
                            tooltip="鼠标移动过程中暂停的概率"
                          >
                            <Slider
                              min={0}
                              max={1}
                              step={0.05}
                              marks={{
                                0: '无暂停',
                                0.5: '中等',
                                1: '频繁',
                              }}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name={['humanBehavior', 'mouseMovement', 'curveProbability']}
                            label="曲线移动概率"
                            tooltip="鼠标曲线移动（非直线）的概率"
                          >
                            <Slider
                              min={0}
                              max={1}
                              step={0.05}
                              marks={{
                                0: '直线',
                                0.5: '适中',
                                1: '曲线',
                              }}
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Panel>
                    
                    <Panel header="键盘输入模拟" key="keyboard">
                      <Form.Item
                        name={['humanBehavior', 'keyboardInput', 'enabled']}
                        label="启用键盘输入模拟"
                        valuePropName="checked"
                      >
                        <Switch />
                      </Form.Item>
                      
                      <Form.Item
                        name={['humanBehavior', 'keyboardInput', 'typingSpeed']}
                        label="打字速度(字符/分钟)"
                        tooltip="模拟的打字速度"
                      >
                        <Slider
                          min={50}
                          max={500}
                          step={10}
                          marks={{
                            50: '慢',
                            250: '正常',
                            500: '快',
                          }}
                        />
                      </Form.Item>
                      
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item
                            name={['humanBehavior', 'keyboardInput', 'errorRate']}
                            label="错误率"
                            tooltip="打字错误的概率"
                          >
                            <Slider
                              min={0}
                              max={0.1}
                              step={0.01}
                              marks={{
                                0: '无错误',
                                0.05: '正常',
                                0.1: '较高',
                              }}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name={['humanBehavior', 'keyboardInput', 'backspaceProbability']}
                            label="退格概率"
                            tooltip="按退格键纠正错误的概率"
                          >
                            <Slider
                              min={0}
                              max={0.2}
                              step={0.01}
                              marks={{
                                0: '无退格',
                                0.1: '正常',
                                0.2: '频繁',
                              }}
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Panel>
                    
                    <Panel header="页面滚动模拟" key="scrolling">
                      <Form.Item
                        name={['humanBehavior', 'scrolling', 'enabled']}
                        label="启用页面滚动模拟"
                        valuePropName="checked"
                      >
                        <Switch />
                      </Form.Item>
                      
                      <Form.Item
                        name={['humanBehavior', 'scrolling', 'speedVariation']}
                        label="滚动速度变化"
                        tooltip="滚动速度的随机变化程度"
                      >
                        <Slider
                          min={0}
                          max={1}
                          step={0.1}
                          marks={{
                            0: '匀速',
                            0.5: '适中',
                            1: '随机',
                          }}
                        />
                      </Form.Item>
                      
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item
                            name={['humanBehavior', 'scrolling', 'pauseProbability']}
                            label="暂停概率"
                            tooltip="滚动过程中暂停的概率"
                          >
                            <Slider
                              min={0}
                              max={1}
                              step={0.05}
                              marks={{
                                0: '无暂停',
                                0.5: '中等',
                                1: '频繁',
                              }}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name={['humanBehavior', 'scrolling', 'scrollDirectionChanges']}
                            label="方向变化"
                            valuePropName="checked"
                            tooltip="是否允许滚动方向变化"
                          >
                            <Switch />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Panel>
                    
                    <Panel header="页面交互模拟" key="interaction">
                      <Form.Item
                        name={['humanBehavior', 'pageInteraction', 'enabled']}
                        label="启用页面交互模拟"
                        valuePropName="checked"
                      >
                        <Switch />
                      </Form.Item>
                      
                      <Form.Item
                        name={['humanBehavior', 'pageInteraction', 'clickRandomness']}
                        label="点击随机性"
                        tooltip="点击位置的随机偏移程度"
                      >
                        <Slider
                          min={0}
                          max={1}
                          step={0.1}
                          marks={{
                            0: '精确',
                            0.5: '适中',
                            1: '随机',
                          }}
                        />
                      </Form.Item>
                      
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item
                            name={['humanBehavior', 'pageInteraction', 'hoverProbability']}
                            label="悬停概率"
                            tooltip="鼠标悬停在元素上的概率"
                          >
                            <Slider
                              min={0}
                              max={1}
                              step={0.05}
                              marks={{
                                0: '无悬停',
                                0.5: '中等',
                                1: '频繁',
                              }}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name={['humanBehavior', 'pageInteraction', 'tabSwitchProbability']}
                            label="标签切换概率"
                            tooltip="切换浏览器标签页的概率"
                          >
                            <Slider
                              min={0}
                              max={1}
                              step={0.05}
                              marks={{
                                0: '不切换',
                                0.5: '偶尔',
                                1: '频繁',
                              }}
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Panel>
                  </Collapse>
                </TabPane>
                
                <TabPane
                  tab={
                    <span>
                      <DesktopOutlined />
                      设备模拟
                    </span>
                  }
                  key="device"
                >
                  <Row gutter={24}>
                    <Col span={12}>
                      <Form.Item
                        name={['deviceSimulation', 'deviceType']}
                        label="设备类型"
                        rules={[{ required: true, message: '请选择设备类型' }]}
                      >
                        <Select placeholder="选择设备类型">
                          <Option value="desktop">
                            <Space>
                              <DesktopOutlined />
                              <span>桌面设备</span>
                            </Space>
                          </Option>
                          <Option value="mobile">
                            <Space>
                              <MobileOutlined />
                              <span>移动设备</span>
                            </Space>
                          </Option>
                          <Option value="tablet">
                            <Space>
                              <TabletOutlined />
                              <span>平板设备</span>
                            </Space>
                          </Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name={['deviceSimulation', 'os']}
                        label="操作系统"
                        rules={[{ required: true, message: '请选择操作系统' }]}
                      >
                        <Select placeholder="选择操作系统">
                          <Option value="windows">
                            <Space>
                              <WindowsOutlined />
                              <span>Windows</span>
                            </Space>
                          </Option>
                          <Option value="macos">
                            <Space>
                              <AppleOutlined />
                              <span>macOS</span>
                            </Space>
                          </Option>
                          <Option value="linux">
                            <Space>
                              <LinuxOutlined />
                              <span>Linux</span>
                            </Space>
                          </Option>
                          <Option value="android">
                            <Space>
                              <AndroidOutlined />
                              <span>Android</span>
                            </Space>
                          </Option>
                          <Option value="ios">
                            <Space>
                              <AppleOutlined />
                              <span>iOS</span>
                            </Space>
                          </Option>
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>
                  
                  <Row gutter={24}>
                    <Col span={12}>
                      <Form.Item
                        name={['deviceSimulation', 'browser']}
                        label="浏览器"
                        rules={[{ required: true, message: '请选择浏览器' }]}
                      >
                        <Select placeholder="选择浏览器">
                          <Option value="chrome">
                            <Space>
                              <ChromeOutlined />
                              <span>Chrome</span>
                            </Space>
                          </Option>
                          <Option value="firefox">
                            <Space>
                              <FireOutlined />
                              <span>Firefox</span>
                            </Space>
                          </Option>
                          <Option value="safari">
                            <Space>
                              <CompassOutlined />
                              <span>Safari</span>
                            </Space>
                          </Option>
                          <Option value="edge">
                            <Space>
                              <ChromeOutlined />
                              <span>Edge</span>
                            </Space>
                          </Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name={['deviceSimulation', 'browserVersion']}
                        label="浏览器版本"
                        rules={[{ required: true, message: '请输入浏览器版本' }]}
                      >
                        <Input placeholder="例如：96.0.4664.110" />
                      </Form.Item>
                    </Col>
                  </Row>
                  
                  <Row gutter={24}>
                    <Col span={12}>
                      <Form.Item
                        name={['deviceSimulation', 'osVersion']}
                        label="系统版本"
                        rules={[{ required: true, message: '请输入系统版本' }]}
                      >
                        <Input placeholder="例如：10.0 或 15.0" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name={['deviceSimulation', 'pixelRatio']}
                        label="像素比"
                        rules={[{ required: true, message: '请输入像素比' }]}
                      >
                        <InputNumber min={1} max={4} step={0.5} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>
                  
                  <Row gutter={24}>
                    <Col span={12}>
                      <Form.Item
                        name={['deviceSimulation', 'viewportWidth']}
                        label="视口宽度"
                        rules={[{ required: true, message: '请输入视口宽度' }]}
                      >
                        <InputNumber min={320} max={7680} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name={['deviceSimulation', 'viewportHeight']}
                        label="视口高度"
                        rules={[{ required: true, message: '请输入视口高度' }]}
                      >
                        <InputNumber min={240} max={4320} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>
                  
                  <Form.Item
                    name={['deviceSimulation', 'touchSupport']}
                    label="触摸支持"
                    valuePropName="checked"
                    tooltip="是否支持触摸操作"
                  >
                    <Switch />
                  </Form.Item>
                </TabPane>
                
                <TabPane
                  tab={
                    <span>
                      <RadarChartOutlined />
                      高级设置
                    </span>
                  }
                  key="advanced"
                >
                  <Form.Item
                    name="trafficPatternId"
                    label="流量模式"
                    tooltip="选择流量模式配置"
                  >
                    <Select placeholder="选择流量模式" allowClear>
                      <Option value="normal">正常浏览模式</Option>
                      <Option value="active">活跃浏览模式</Option>
                      <Option value="passive">被动浏览模式</Option>
                    </Select>
                  </Form.Item>
                  
                  <Form.Item
                    name="enabled"
                    label="启用反检测"
                    valuePropName="checked"
                    tooltip="是否启用反检测配置"
                  >
                    <Switch defaultChecked />
                  </Form.Item>
                  
                  <Alert
                    message="高级设置说明"
                    description="流量模式控制浏览行为的节奏和模式，合理配置可以更好地模拟真实用户行为。"
                    type="warning"
                    showIcon
                    style={{ marginTop: 16 }}
                  />
                </TabPane>
              </Tabs>
            </Form>
          </Card>
        </Col>
      </Row>
      
      <div style={{ background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 6, padding: 16, marginTop: 16 }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text strong>
            <SettingOutlined /> 配置建议
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            1. 根据目标用户群体选择合适的设备类型和浏览器
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            2. 人类行为参数不宜设置得过于完美，适当的随机性更真实
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            3. 定期更新浏览器指纹信息，避免长期使用相同配置
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            4. 移动端配置需要启用触摸支持并设置合适的视口尺寸
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            5. 测试阶段可以先使用预设配置，稳定后再进行自定义调整
          </Text>
        </Space>
      </div>
    </div>
  );
};

export default Step3AntiDetection;