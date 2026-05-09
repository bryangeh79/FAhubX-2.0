import React, { useState, useEffect } from 'react';
import {
  Card, Form, InputNumber, Switch, Select, Button, Space,
  Typography, Alert, Row, Col, Tag, message, Divider, List,
  Descriptions, Tooltip, Popconfirm
} from 'antd';
import {
  SettingOutlined, SaveOutlined, ReloadOutlined,
  QuestionCircleOutlined, ClockCircleOutlined,
  WarningOutlined, CheckCircleOutlined, CloseCircleOutlined
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

interface ReconnectRule {
  id: string;
  name: string;
  condition: {
    status: string[];
    failureCount: number;
    healthScore: number;
    timeSinceLastLogin: number; // 分钟
  };
  action: {
    type: 'immediate' | 'delayed' | 'scheduled';
    delayMinutes?: number;
    scheduleTime?: string;
    maxAttempts: number;
    attemptInterval: number; // 分钟
  };
  enabled: boolean;
  accounts: string[];
  lastTriggered?: string;
  triggerCount: number;
  successCount: number;
}

interface AutoReconnectConfigProps {
  accountId?: string; // 单个账号配置
  onSave?: (config: any) => void;
}

const AutoReconnectConfig: React.FC<AutoReconnectConfigProps> = ({ accountId, onSave }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState<ReconnectRule[]>([]);
  const [globalEnabled, setGlobalEnabled] = useState(true);

  // 初始化表单
  useEffect(() => {
    // 模拟加载配置
    const mockRules: ReconnectRule[] = [
      {
        id: 'rule1',
        name: '快速失败重连',
        condition: {
          status: ['failed', 'offline'],
          failureCount: 1,
          healthScore: 60,
          timeSinceLastLogin: 5,
        },
        action: {
          type: 'immediate',
          maxAttempts: 3,
          attemptInterval: 2,
        },
        enabled: true,
        accounts: accountId ? [accountId] : ['all'],
        lastTriggered: '2024-04-13T10:30:00Z',
        triggerCount: 24,
        successCount: 18,
      },
      {
        id: 'rule2',
        name: '定期会话刷新',
        condition: {
          status: ['online'],
          failureCount: 0,
          healthScore: 70,
          timeSinceLastLogin: 120,
        },
        action: {
          type: 'delayed',
          delayMinutes: 30,
          maxAttempts: 1,
          attemptInterval: 0,
        },
        enabled: true,
        accounts: accountId ? [accountId] : ['all'],
        lastTriggered: '2024-04-13T09:15:00Z',
        triggerCount: 56,
        successCount: 56,
      },
      {
        id: 'rule3',
        name: '低健康度恢复',
        condition: {
          status: ['online', 'offline', 'failed'],
          failureCount: 0,
          healthScore: 50,
          timeSinceLastLogin: 0,
        },
        action: {
          type: 'immediate',
          maxAttempts: 5,
          attemptInterval: 5,
        },
        enabled: false,
        accounts: accountId ? [accountId] : ['all'],
        triggerCount: 12,
        successCount: 8,
      },
    ];
    
    setRules(mockRules);
    
    // 设置表单初始值
    form.setFieldsValue({
      globalEnabled: true,
      defaultMaxAttempts: 3,
      defaultAttemptInterval: 5,
      failureThreshold: 3,
      healthThreshold: 60,
      notificationEnabled: true,
      strategy: 'smart',
    });
  }, [accountId, form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      // 模拟保存
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (onSave) {
        onSave(values);
      }
      
      message.success('配置已保存');
    } catch (error) {
      console.error('保存配置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRule = (ruleId: string, enabled: boolean) => {
    setRules(rules.map(rule => 
      rule.id === ruleId ? { ...rule, enabled } : rule
    ));
    message.success(`规则 ${enabled ? '启用' : '禁用'}成功`);
  };

  const handleDeleteRule = (ruleId: string) => {
    setRules(rules.filter(rule => rule.id !== ruleId));
    message.success('规则删除成功');
  };

  const getSuccessRate = (rule: ReconnectRule) => {
    if (rule.triggerCount === 0) return 0;
    return Math.round((rule.successCount / rule.triggerCount) * 100);
  };

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 90) return 'green';
    if (rate >= 70) return 'orange';
    return 'red';
  };

  return (
    <div>
      <Card
        title={
          <Space>
            <SettingOutlined />
            <span>自动重连配置</span>
            {accountId && (
              <Tag color="blue">账号专属配置</Tag>
            )}
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={loading}
          >
            保存配置
          </Button>
        }
      >
        <Alert
          type="info"
          message="自动重连功能说明"
          description="系统会根据配置的规则自动检测账号状态，并在满足条件时尝试重新登录。建议根据账号的重要性和稳定性需求配置不同的重连策略。"
          style={{ marginBottom: 24 }}
          showIcon
        />

        <Form
          form={form}
          layout="vertical"
        >
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item
                name="globalEnabled"
                label="全局自动重连"
                valuePropName="checked"
              >
                <Switch
                  checkedChildren="开启"
                  unCheckedChildren="关闭"
                  onChange={setGlobalEnabled}
                />
              </Form.Item>
              
              <Form.Item
                name="strategy"
                label="重连策略"
                tooltip="选择适合的重连策略模式"
              >
                <Select>
                  <Option value="smart">智能模式（推荐）</Option>
                  <Option value="aggressive">积极模式</Option>
                  <Option value="conservative">保守模式</Option>
                  <Option value="custom">自定义模式</Option>
                </Select>
              </Form.Item>
              
              <Form.Item
                name="defaultMaxAttempts"
                label="默认最大重试次数"
                tooltip="单次触发最多重试登录的次数"
              >
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            
            <Col span={12}>
              <Form.Item
                name="defaultAttemptInterval"
                label="重试间隔（分钟）"
                tooltip="每次重试之间的等待时间"
              >
                <InputNumber min={1} max={60} style={{ width: '100%' }} />
              </Form.Item>
              
              <Form.Item
                name="failureThreshold"
                label="失败阈值"
                tooltip="连续失败多少次后暂停自动重连"
              >
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
              
              <Form.Item
                name="healthThreshold"
                label="健康度阈值"
                tooltip="健康度低于此值时触发重连"
              >
                <InputNumber min={0} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item
            name="notificationEnabled"
            label="通知设置"
            valuePropName="checked"
          >
            <Switch
              checkedChildren="开启通知"
              unCheckedChildren="关闭通知"
            />
          </Form.Item>
        </Form>

        <Divider orientation="left">重连规则</Divider>
        
        <List
          dataSource={rules}
          renderItem={(rule) => {
            const successRate = getSuccessRate(rule);
            const successRateColor = getSuccessRateColor(successRate);
            
            return (
              <List.Item
                actions={[
                  <Switch
                    key="enable"
                    checked={rule.enabled}
                    onChange={(checked) => handleToggleRule(rule.id, checked)}
                    style={{ fontSize: "12px" }}
                  />,
                  <Popconfirm
                    key="delete"
                    title="确定要删除这个规则吗？"
                    onConfirm={() => handleDeleteRule(rule.id)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Button type="text" danger style={{ fontSize: "12px" }}>
                      删除
                    </Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Text strong>{rule.name}</Text>
                      {rule.enabled ? (
                        <Tag icon={<CheckCircleOutlined />} color="green">
                          已启用
                        </Tag>
                      ) : (
                        <Tag icon={<CloseCircleOutlined />} color="default">
                          已禁用
                        </Tag>
                      )}
                    </Space>
                  }
                  description={
                    <div>
                      <Descriptions style={{ fontSize: "12px" }} column={2}>
                        <Descriptions.Item label="触发条件">
                          <Space size={[2, 0]} wrap>
                            {rule.condition.status.map(s => (
                              <Tag key={s} style={{ fontSize: "12px" }}>{s}</Tag>
                            ))}
                            {rule.condition.failureCount > 0 && (
                              <Tag style={{ fontSize: "12px" }}>失败{rule.condition.failureCount}次</Tag>
                            )}
                            {rule.condition.healthScore > 0 && (
                              <Tag style={{ fontSize: "12px" }}>健康度&lt;{rule.condition.healthScore}</Tag>
                            )}
                          </Space>
                        </Descriptions.Item>
                        <Descriptions.Item label="执行动作">
                          <Space size={[2, 0]} wrap>
                            <Tag style={{ fontSize: "12px" }}>{rule.action.type}</Tag>
                            {rule.action.maxAttempts > 0 && (
                              <Tag style={{ fontSize: "12px" }}>最多{rule.action.maxAttempts}次</Tag>
                            )}
                            {rule.action.attemptInterval > 0 && (
                              <Tag style={{ fontSize: "12px" }}>间隔{rule.action.attemptInterval}分</Tag>
                            )}
                          </Space>
                        </Descriptions.Item>
                      </Descriptions>
                      
                      <div style={{ marginTop: 8 }}>
                        <Space>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            <ClockCircleOutlined /> 触发: {rule.triggerCount}次
                          </Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            成功: {rule.successCount}次
                          </Text>
                          <Text style={{ fontSize: 12, color: successRateColor }}>
                            成功率: {successRate}%
                          </Text>
                          {rule.lastTriggered && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              最后触发: {new Date(rule.lastTriggered).toLocaleString()}
                            </Text>
                          )}
                        </Space>
                      </div>
                    </div>
                  }
                />
              </List.Item>
            );
          }}
        />
        
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Button type="dashed" icon={<ReloadOutlined />}>
            添加新规则
          </Button>
        </div>

        <Divider orientation="left">配置建议</Divider>
        
        <Alert
          type="warning"
          message="配置建议"
          description={
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              <li>重要账号建议使用积极模式，确保高可用性</li>
              <li>普通账号建议使用智能模式，平衡成功率和资源消耗</li>
              <li>测试账号建议使用保守模式，避免频繁触发风控</li>
              <li>根据账号的实际稳定性调整重试次数和间隔</li>
              <li>监控成功率，及时调整不合理的规则</li>
            </ul>
          }
          showIcon
        />
      </Card>
    </div>
  );
};

export default AutoReconnectConfig;