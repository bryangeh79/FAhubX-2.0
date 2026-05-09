import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Typography,
  Alert,
  Space,
  Tag,
  Row,
  Col,
  Progress,
  Steps,
  Descriptions,
  List,
  Collapse,
  Statistic,
  Modal,
  Form,
  InputNumber,
  Switch,
  message,
} from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  ReloadOutlined,
  SaveOutlined,
  SafetyOutlined,
  RocketOutlined,
} from '@ant-design/icons';

import { ExtendedFacebookAccount, LoginTestResult } from '../../../types/facebook-login';
import { facebookLoginService } from '../../../services/facebook-login';

const { Title, Text } = Typography;
const { Panel } = Collapse;
const { Step } = Steps;

interface Step4LoginTestProps {
  formData: Partial<ExtendedFacebookAccount>;
  onChange: (data: Partial<ExtendedFacebookAccount>) => void;
  registerForm: (form: any) => void;
  accountId?: string;
}

const Step4LoginTest: React.FC<Step4LoginTestProps> = ({
  formData,
  onChange,
  registerForm,
  accountId,
}) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<LoginTestResult | null>(null);
  const [testHistory, setTestHistory] = useState<LoginTestResult[]>([]);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configForm] = Form.useForm();

  useEffect(() => {
    // 加载测试历史
    loadTestHistory();
  }, [accountId]);

  const loadTestHistory = async () => {
    try {
      // 这里应该调用实际的API，暂时使用模拟数据
      const mockHistory: LoginTestResult[] = [
        {
          success: true,
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          duration: 4520,
          ipAddress: '104.20.45.67',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          steps: [
            { name: '初始化浏览器', success: true, duration: 1200 },
            { name: '加载登录页面', success: true, duration: 1800 },
            { name: '输入账号密码', success: true, duration: 800 },
            { name: '提交登录表单', success: true, duration: 400 },
            { name: '验证登录成功', success: true, duration: 320 },
          ],
          cookiesCount: 12,
          sessionCreated: true,
          sessionId: 'session_123456',
          warnings: ['使用了默认的反检测配置'],
          errors: [],
        },
        {
          success: false,
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          duration: 3200,
          ipAddress: '185.212.96.45',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          steps: [
            { name: '初始化浏览器', success: true, duration: 1100 },
            { name: '加载登录页面', success: true, duration: 1500 },
            { name: '输入账号密码', success: true, duration: 300 },
            { name: '提交登录表单', success: false, duration: 200, error: '验证码要求' },
            { name: '验证登录成功', success: false, duration: 100 },
          ],
          cookiesCount: 8,
          sessionCreated: false,
          warnings: [],
          errors: ['需要验证码验证', 'IP可能被限制'],
        },
      ];
      setTestHistory(mockHistory);
    } catch (error) {
      console.error('加载测试历史失败:', error);
    }
  };

  const handleTestLogin = async () => {
    if (!accountId) {
      message.warning('请先保存账号信息再进行测试');
      return;
    }

    setTesting(true);
    try {
      const config = configForm.getFieldsValue();
      const response = await facebookLoginService.testLogin(accountId, {
        vpnId: formData.loginConfig?.vpnAssociationId,
        antiDetectionConfigId: formData.loginConfig?.antiDetectionConfigId,
        saveSession: config.saveSession || false,
        timeout: config.timeout || 60,
      });
      
      setTestResult(response.data);
      
      // 添加到历史记录
      setTestHistory(prev => [response.data, ...prev]);
      
      message.success('登录测试完成');
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || '登录测试失败';
      message.error(errorMsg);
      
      // 创建失败结果
      const failedResult: LoginTestResult = {
        success: false,
        timestamp: new Date().toISOString(),
        duration: 0,
        ipAddress: '未知',
        userAgent: '未知',
        steps: [
          { name: '测试初始化', success: false, duration: 0, error: errorMsg },
        ],
        cookiesCount: 0,
        sessionCreated: false,
        warnings: [],
        errors: [errorMsg],
      };
      setTestResult(failedResult);
      setTestHistory(prev => [failedResult, ...prev]);
    } finally {
      setTesting(false);
    }
  };

  const renderStepStatus = (step: LoginTestResult['steps'][0]) => {
    if (step.success) {
      return (
        <Space>
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
          <Text type="success">{step.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {step.duration}ms
          </Text>
        </Space>
      );
    } else {
      return (
        <Space>
          <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
          <Text type="danger">{step.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {step.duration}ms
          </Text>
          {step.error && (
            <Tag color="red" style={{ fontSize: 12 }}>
              {step.error}
            </Tag>
          )}
        </Space>
      );
    }
  };

  const getOverallStatus = () => {
    if (!testResult) return null;
    
    if (testResult.success) {
      return (
        <Alert
          message="登录测试成功"
          description="账号可以正常登录，所有步骤均通过验证。"
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
        />
      );
    } else {
      return (
        <Alert
          message="登录测试失败"
          description={
            <Space direction="vertical" size={4}>
              <Text>登录过程中出现问题：</Text>
              {testResult.errors.map((error, index) => (
                <Text key={index} type="danger">• {error}</Text>
              ))}
            </Space>
          }
          type="error"
          showIcon
          icon={<CloseCircleOutlined />}
        />
      );
    }
  };

  return (
    <div>
      <Title level={5} style={{ marginBottom: 24 }}>
        <PlayCircleOutlined /> 登录测试与验证
      </Title>
      
      <Alert
        message="登录测试说明"
        description="测试账号的登录功能，验证配置是否正确。测试过程会模拟真实用户登录行为，并记录详细日志。"
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Row gutter={24} style={{ marginBottom: 24 }}>
        <Col span={24}>
          <Card
            title={
              <Space>
                <RocketOutlined />
                <span>登录测试控制台</span>
                {testResult && (
                  <Tag color={testResult.success ? 'green' : 'red'}>
                    {testResult.success ? '测试成功' : '测试失败'}
                  </Tag>
                )}
              </Space>
            }
            extra={
              <Space>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={loadTestHistory}
                  disabled={testing}
                >
                  刷新历史
                </Button>
                <Button
                  type="primary"
                  icon={testing ? <StopOutlined /> : <PlayCircleOutlined />}
                  onClick={handleTestLogin}
                  loading={testing}
                  disabled={!accountId}
                >
                  {testing ? '测试中...' : '开始测试'}
                </Button>
                <Button
                  icon={<EyeOutlined />}
                  onClick={() => setShowConfigModal(true)}
                >
                  测试配置
                </Button>
              </Space>
            }
          >
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div>
                <Text strong>测试状态: </Text>
                {testing ? (
                  <Space>
                    <Progress percent={75} status="active" style={{ width: 200 }} />
                    <Text type="secondary">正在测试中...</Text>
                  </Space>
                ) : testResult ? (
                  getOverallStatus()
                ) : (
                  <Text type="secondary">尚未进行测试</Text>
                )}
              </div>

              {testResult && (
                <>
                  <Descriptions bordered column={3}>
                    <Descriptions.Item label="测试时间">
                      {new Date(testResult.timestamp).toLocaleString()}
                    </Descriptions.Item>
                    <Descriptions.Item label="总耗时">
                      {testResult.duration}ms
                    </Descriptions.Item>
                    <Descriptions.Item label="IP地址">
                      <Tag color="blue">{testResult.ipAddress}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Cookies数量">
                      {testResult.cookiesCount}
                    </Descriptions.Item>
                    <Descriptions.Item label="会话创建">
                      {testResult.sessionCreated ? (
                        <Tag color="green">已创建</Tag>
                      ) : (
                        <Tag color="red">未创建</Tag>
                      )}
                    </Descriptions.Item>
                    <Descriptions.Item label="测试结果">
                      {testResult.success ? (
                        <Tag color="green">成功</Tag>
                      ) : (
                        <Tag color="red">失败</Tag>
                      )}
                    </Descriptions.Item>
                  </Descriptions>

                  <Card title="测试步骤详情">
                    <Steps direction="vertical" current={testResult.steps.length}>
                      {testResult.steps.map((step, index) => (
                        <Step
                          key={index}
                          title={step.name}
                          description={
                            <Space direction="vertical" size={2}>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                耗时: {step.duration}ms
                              </Text>
                              {step.error && (
                                <Text type="danger" style={{ fontSize: 12 }}>
                                  错误: {step.error}
                                </Text>
                              )}
                            </Space>
                          }
                          status={step.success ? 'finish' : 'error'}
                        />
                      ))}
                    </Steps>
                  </Card>

                  {testResult.warnings.length > 0 && (
                    <Alert
                      message="警告信息"
                      description={
                        <List
                          size="small"
                          dataSource={testResult.warnings}
                          renderItem={(warning) => (
                            <List.Item>
                              <Space>
                                <WarningOutlined style={{ color: '#faad14' }} />
                                <Text>{warning}</Text>
                              </Space>
                            </List.Item>
                          )}
                        />
                      }
                      type="warning"
                      showIcon
                    />
                  )}

                  {testResult.errors.length > 0 && (
                    <Alert
                      message="错误信息"
                      description={
                        <List
                          size="small"
                          dataSource={testResult.errors}
                          renderItem={(error) => (
                            <List.Item>
                              <Space>
                                <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                                <Text type="danger">{error}</Text>
                              </Space>
                            </List.Item>
                          )}
                        />
                      }
                      type="error"
                      showIcon
                    />
                  )}
                </>
              )}

              {!testResult && !testing && (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <PlayCircleOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
                  <Text type="secondary">
                    点击"开始测试"按钮进行登录测试
                  </Text>
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      测试将使用当前配置的VPN和反检测设置
                    </Text>
                  </div>
                </div>
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={24}>
        <Col span={24}>
          <Card
            title={
              <Space>
                <ClockCircleOutlined />
                <span>测试历史记录</span>
                <Tag color="blue">{testHistory.length} 次测试</Tag>
              </Space>
            }
            size="small"
          >
            <List
              dataSource={testHistory}
              renderItem={(item) => (
                <List.Item>
                  <Card style={{ width: '100%' }}>
                    <Row justify="space-between" align="middle">
                      <Col>
                        <Space>
                          {item.success ? (
                            <CheckCircleOutlined style={{ color: '#52c41a' }} />
                          ) : (
                            <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                          )}
                          <Text strong>
                            {new Date(item.timestamp).toLocaleString()}
                          </Text>
                          <Tag color={item.success ? 'green' : 'red'}>
                            {item.success ? '成功' : '失败'}
                          </Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {item.duration}ms
                          </Text>
                        </Space>
                      </Col>
                      <Col>
                        <Space>
                          <Tag color="blue">{item.ipAddress}</Tag>
                          <Tag>{item.cookiesCount} cookies</Tag>
                          {item.sessionCreated && (
                            <Tag color="green">会话已保存</Tag>
                          )}
                        </Space>
                      </Col>
                    </Row>
                    
                    <div style={{ marginTop: 8 }}>
                      <Progress
                        percent={Math.round(
                          (item.steps.filter(s => s.success).length / item.steps.length) * 100
                        )}
                        size="small"
                        status={item.success ? 'success' : 'exception'}
                        showInfo={false}
                      />
                      <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                        步骤完成: {item.steps.filter(s => s.success).length}/{item.steps.length}
                      </Text>
                    </div>
                    
                    {item.errors.length > 0 && (
                      <Alert
                        message={item.errors[0]}
                        type="error"
                        showIcon
                        style={{ marginTop: 8, padding: '4px 12px' }}
                      />
                    )}
                  </Card>
                </List.Item>
              )}
              locale={{ emptyText: '暂无测试历史' }}
            />
          </Card>
        </Col>
      </Row>

      <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, padding: 16, marginTop: 24 }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text strong>
            <SafetyOutlined /> 测试建议
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            1. 在正式使用前务必进行登录测试，验证配置是否正确
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            2. 如果测试失败，检查VPN连接、账号密码和反检测配置
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            3. 测试成功后可选择保存会话，避免重复登录
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            4. 定期进行测试，确保账号状态正常
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            5. 如果遇到验证码，可能需要调整反检测配置或更换IP
          </Text>
        </Space>
      </div>

      {/* 测试配置模态框 */}
      <Modal
        title="测试配置"
        open={showConfigModal}
        onCancel={() => setShowConfigModal(false)}
        onOk={() => {
          configForm.validateFields().then(() => {
            setShowConfigModal(false);
            message.success('测试配置已更新');
          });
        }}
        width={500}
      >
        <Form
          form={configForm}
          layout="vertical"
          initialValues={{
            saveSession: true,
            timeout: 60,
          }}
        >
          <Form.Item
            name="timeout"
            label="测试超时时间(秒)"
            tooltip="测试过程的最大等待时间"
          >
            <InputNumber min={10} max={300} style={{ width: '100%' }} />
          </Form.Item>
          
          <Form.Item
            name="saveSession"
            label="保存会话"
            valuePropName="checked"
            tooltip="测试成功后是否保存登录会话"
          >
            <Switch />
          </Form.Item>
          
          <Form.Item
            name="screenshot"
            label="截图记录"
            valuePropName="checked"
            tooltip="是否在测试过程中截图记录关键步骤"
          >
            <Switch />
          </Form.Item>
          
          <Alert
            message="配置说明"
            description="超时时间设置过短可能导致测试失败，建议设置为60秒以上。保存会话可以避免重复登录，但会增加存储空间。"
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        </Form>
      </Modal>
    </div>
  );
};

export default Step4LoginTest;
