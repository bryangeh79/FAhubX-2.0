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
  Table,
  Tooltip,
  Progress,
  Badge,
  Modal,
  InputNumber,
  Switch,
} from 'antd';
import {
  GlobalOutlined,
  WifiOutlined,
  SafetyOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';

import { ExtendedFacebookAccount, VPNConfig, IPRotationPolicy } from '../../../types/facebook-login';
import { facebookLoginService } from '../../../services/facebook-login';

const { Title, Text } = Typography;
const { Option } = Select;

interface Step2VPNConfigProps {
  formData: Partial<ExtendedFacebookAccount>;
  onChange: (data: Partial<ExtendedFacebookAccount>) => void;
  registerForm: (form: any) => void;
  accountId?: string;
}

const Step2VPNConfig: React.FC<Step2VPNConfigProps> = ({
  formData,
  onChange,
  registerForm,
  accountId,
}) => {
  const [form] = Form.useForm();
  const [vpns, setVPNs] = useState<VPNConfig[]>([]);
  const [policies, setPolicies] = useState<IPRotationPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingVPN, setTestingVPN] = useState<string | null>(null);
  const [showPolicyModal, setShowPolicyModal] = useState(false);

  useEffect(() => {
    registerForm(form);
    loadVPNs();
    loadPolicies();
  }, [form, registerForm]);

  const loadVPNs = async () => {
    try {
      // 这里应该调用实际的API，暂时使用模拟数据
      const mockVPNs: VPNConfig[] = [
        {
          id: '1',
          name: '美国节点-01',
          type: 'OpenVPN',
          status: 'connected',
          ipAddress: '104.20.45.67',
          serverAddress: 'us-west.vpnserver.com',
          port: 1194,
          country: '美国',
          city: '洛杉矶',
          latency: 120,
          bandwidth: 100,
          lastConnectedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '2',
          name: '英国节点-01',
          type: 'WireGuard',
          status: 'connected',
          ipAddress: '185.212.96.45',
          serverAddress: 'uk.vpnserver.com',
          port: 51820,
          country: '英国',
          city: '伦敦',
          latency: 80,
          bandwidth: 150,
          lastConnectedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '3',
          name: '日本节点-01',
          type: 'Shadowsocks',
          status: 'disconnected',
          ipAddress: '45.76.123.89',
          serverAddress: 'jp.vpnserver.com',
          port: 8388,
          country: '日本',
          city: '东京',
          latency: 60,
          bandwidth: 200,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      setVPNs(mockVPNs);
    } catch (error) {
      console.error('加载VPN配置失败:', error);
    }
  };

  const loadPolicies = async () => {
    try {
      // 这里应该调用实际的API，暂时使用模拟数据
      const mockPolicies: IPRotationPolicy[] = [
        {
          id: '1',
          name: '每30分钟轮换',
          type: 'time_based',
          intervalMinutes: 30,
          enabled: true,
          accounts: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '2',
          name: '每100请求轮换',
          type: 'request_based',
          maxRequestsPerIP: 100,
          enabled: true,
          accounts: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '3',
          name: '动态智能轮换',
          type: 'dynamic',
          enabled: true,
          accounts: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      setPolicies(mockPolicies);
    } catch (error) {
      console.error('加载IP轮换策略失败:', error);
    }
  };

  const handleValuesChange = (changedValues: any, allValues: any) => {
    onChange({
      loginConfig: {
        ...formData.loginConfig,
        ...allValues,
      },
    });
  };

  const testVPNConnection = async (vpnId: string) => {
    setTestingVPN(vpnId);
    try {
      // 这里应该调用实际的API
      await new Promise(resolve => setTimeout(resolve, 2000));
      // 模拟测试结果
      const updatedVPNs = vpns.map(vpn => {
        if (vpn.id === vpnId) {
          return {
            ...vpn,
            status: 'connected' as const,
            latency: Math.floor(Math.random() * 200) + 50,
            bandwidth: Math.floor(Math.random() * 150) + 50,
            lastConnectedAt: new Date().toISOString(),
          };
        }
        return vpn;
      });
      setVPNs(updatedVPNs);
    } catch (error) {
      console.error('测试VPN连接失败:', error);
    } finally {
      setTestingVPN(null);
    }
  };

  const getStatusBadge = (status: VPNConfig['status']) => {
    const config = {
      connected: { color: 'green', text: '已连接' },
      connecting: { color: 'blue', text: '连接中' },
      disconnecting: { color: 'orange', text: '断开中' },
      disconnected: { color: 'default', text: '已断开' },
      error: { color: 'red', text: '错误' },
    };
    const cfg = config[status];
    return <Badge status={cfg.color as any} text={cfg.text} />;
  };

  const vpnColumns = [
    {
      title: 'VPN名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: VPNConfig) => (
        <Space direction="vertical" size={2}>
          <Text strong>{text}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.country} · {record.city}
          </Text>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => (
        <Tag color={type === 'WireGuard' ? 'geekblue' : type === 'OpenVPN' ? 'volcano' : 'purple'}>
          {type}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: VPNConfig['status']) => getStatusBadge(status),
    },
    {
      title: 'IP地址',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      render: (ip: string) => <Text code>{ip}</Text>,
    },
    {
      title: '性能',
      key: 'performance',
      render: (_: any, record: VPNConfig) => (
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text type="secondary" style={{ fontSize: 12, width: 60 }}>延迟:</Text>
            <Progress
              percent={Math.min(100, (record.latency || 300) / 3)}
              size="small"
              status={record.latency && record.latency < 150 ? 'success' : record.latency && record.latency < 250 ? 'normal' : 'exception'}
              showInfo={false}
              style={{ flex: 1 }}
            />
            <Text style={{ fontSize: 12, width: 40 }}>{record.latency}ms</Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text type="secondary" style={{ fontSize: 12, width: 60 }}>带宽:</Text>
            <Progress
              percent={Math.min(100, (record.bandwidth || 0) / 2)}
              size="small"
              status={record.bandwidth && record.bandwidth > 100 ? 'success' : record.bandwidth && record.bandwidth > 50 ? 'normal' : 'exception'}
              showInfo={false}
              style={{ flex: 1 }}
            />
            <Text style={{ fontSize: 12, width: 40 }}>{record.bandwidth}Mbps</Text>
          </div>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: VPNConfig) => (
        <Space size="small">
          <Tooltip title="测试连接">
            <Button
              type="text"
              icon={<SyncOutlined spin={testingVPN === record.id} />}
              onClick={() => testVPNConnection(record.id)}
              loading={testingVPN === record.id}
            />
          </Tooltip>
          <Tooltip title="选择此VPN">
            <Button
              type="text"
              icon={<CheckCircleOutlined />}
              onClick={() => {
                form.setFieldsValue({ vpnId: record.id });
                handleValuesChange({ vpnId: record.id }, { ...form.getFieldsValue(), vpnId: record.id });
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={5} style={{ marginBottom: 24 }}>
        <GlobalOutlined /> VPN配置与IP分配
      </Title>
      
      <Alert
        message="VPN配置说明"
        description="为Facebook账号分配独立的VPN和IP地址，可以有效避免账号关联和封禁风险。建议为每个账号分配不同的IP。"
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={formData.loginConfig || {}}
        onValuesChange={handleValuesChange}
      >
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item
              name="vpnId"
              label="选择VPN节点"
              tooltip="为此账号分配一个VPN节点，系统将使用该节点的IP进行登录"
            >
              <Select
                placeholder="选择VPN节点"
                size="large"
                dropdownRender={(menu) => (
                  <>
                    {menu}
                    <div style={{ padding: '8px 12px', borderTop: '1px solid #f0f0f0' }}>
                      <Button type="link" icon={<PlusOutlined />} onClick={() => {/* 跳转到VPN管理 */}}>
                        添加新的VPN节点
                      </Button>
                    </div>
                  </>
                )}
              >
                {vpns.map(vpn => (
                  <Option key={vpn.id} value={vpn.id}>
                    <Space>
                      <WifiOutlined />
                      <span>{vpn.name}</span>
                      <Tag color={vpn.status === 'connected' ? 'green' : 'default'}>

                        {vpn.status === 'connected' ? '已连接' : '未连接'}
                      </Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {vpn.ipAddress}
                      </Text>
                    </Space>
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="connectionStrategy"
              label="连接策略"
              tooltip="选择VPN连接的使用策略"
            >
              <Select placeholder="选择连接策略" size="large">
                <Option value="sticky">
                  <Space>
                    <SafetyOutlined />
                    <span>固定连接</span>
                    <Tag color="blue">稳定</Tag>
                  </Space>
                </Option>
                <Option value="round_robin">
                  <Space>
                    <SyncOutlined />
                    <span>轮询连接</span>
                    <Tag color="green">均衡</Tag>
                  </Space>
                </Option>
                <Option value="latency_based">
                  <Space>
                    <ThunderboltOutlined />
                    <span>延迟优先</span>
                    <Tag color="gold">快速</Tag>
                  </Space>
                </Option>
                <Option value="manual">
                  <Space>
                    <EditOutlined />
                    <span>手动选择</span>
                  </Space>
                </Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={24}>
          <Col span={12}>
            <Form.Item
              name="ipRotationPolicyId"
              label="IP轮换策略"
              tooltip="配置IP地址的自动轮换策略"
            >
              <Select
                placeholder="选择IP轮换策略"
                size="large"
                dropdownRender={(menu) => (
                  <>
                    {menu}
                    <div style={{ padding: '8px 12px', borderTop: '1px solid #f0f0f0' }}>
                      <Button type="link" icon={<PlusOutlined />} onClick={() => setShowPolicyModal(true)}>
                        创建新的轮换策略
                      </Button>
                    </div>
                  </>
                )}
              >
                {policies.map(policy => (
                  <Option key={policy.id} value={policy.id}>
                    <Space>
                      <span>{policy.name}</span>
                      <Switch checked={policy.enabled} disabled />
                      <Tag color={policy.enabled ? 'green' : 'default'}>
                        {policy.enabled ? '启用' : '禁用'}
                      </Tag>
                    </Space>
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="failoverEnabled"
              label="故障切换"
              valuePropName="checked"
              tooltip="启用故障切换，当主VPN连接失败时自动切换到备用VPN"
            >
              <Switch
                checkedChildren="启用"
                unCheckedChildren="禁用"
              />
            </Form.Item>
          </Col>
        </Row>

        {form.getFieldValue('failoverEnabled') && (
          <Form.Item
            name="failoverVPNIds"
            label="备用VPN节点"
            tooltip="选择备用VPN节点，当主节点故障时按顺序切换"
          >
            <Select
              mode="multiple"
              placeholder="选择备用VPN节点"
              size="large"
            >
              {vpns.map(vpn => (
                <Option key={vpn.id} value={vpn.id} disabled={vpn.id === form.getFieldValue('vpnId')}>
                  <Space>
                    <WifiOutlined />
                    <span>{vpn.name}</span>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {vpn.ipAddress}
                    </Text>
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>
        )}
      </Form>

      <Card
        title={
          <Space>
            <WifiOutlined />
            <span>可用VPN节点</span>
            <Tag color="blue">{vpns.length} 个节点</Tag>
          </Space>
        }
        size="small"
        style={{ marginTop: 24 }}
        extra={
          <Button type="link" icon={<SyncOutlined />} onClick={loadVPNs}>
            刷新
          </Button>
        }
      >
        <Table
          columns={vpnColumns}
          dataSource={vpns}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 800 }}
        />
      </Card>

      <div style={{ background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: 6, padding: 16, marginTop: 24 }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text strong>
            <SafetyOutlined /> 最佳实践建议
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            1. 为每个Facebook账号分配独立的IP地址，避免账号关联
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            2. 选择延迟低、稳定性好的VPN节点，提高登录成功率
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            3. 启用IP轮换策略，定期更换IP地址
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            4. 配置故障切换，确保服务高可用性
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            5. 避免使用被Facebook标记为可疑的IP段
          </Text>
        </Space>
      </div>

      {/* IP轮换策略创建模态框 */}
      <Modal
        title="创建IP轮换策略"
        open={showPolicyModal}
        onCancel={() => setShowPolicyModal(false)}
        onOk={() => setShowPolicyModal(false)}
        width={600}
      >
        <Form layout="vertical">
          <Form.Item
            name="name"
            label="策略名称"
            rules={[{ required: true, message: '请输入策略名称' }]}
          >
            <Input placeholder="例如：每30分钟轮换" />
          </Form.Item>
          
          <Form.Item
            name="type"
            label="策略类型"
            rules={[{ required: true, message: '请选择策略类型' }]}
          >
            <Select placeholder="选择策略类型">
              <Option value="time_based">时间轮换（按固定时间间隔）</Option>
              <Option value="request_based">请求轮换（按请求次数）</Option>
              <Option value="dynamic">动态智能轮换</Option>
              <Option value="manual">手动轮换</Option>
            </Select>
          </Form.Item>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="intervalMinutes"
                label="轮换间隔（分钟）"
                rules={[{ required: true, message: '请输入轮换间隔' }]}
              >
                <InputNumber min={1} max={1440} style={{ width: '100%' }} placeholder="例如：30" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="maxRequestsPerIP"
                label="最大请求数"
              >
                <InputNumber min={1} max={10000} style={{ width: '100%' }} placeholder="例如：100" />
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item
            name="enabled"
            label="启用策略"
            valuePropName="checked"
          >
            <Switch checkedChildren="启用" unCheckedChildren="禁用" defaultChecked />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Step2VPNConfig;
