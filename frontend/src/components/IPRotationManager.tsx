import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Space, Typography, Tag, Modal, Form,
  Input, Select, message, Popconfirm, Row, Col, Switch, InputNumber,
  Timeline, Badge, Alert, Tooltip,
} from 'antd';

const { Option } = Select;
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, HistoryOutlined,
  ClockCircleOutlined, SettingOutlined, PlayCircleOutlined,
  PauseCircleOutlined, StopOutlined, WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface IPRotationPolicy {
  id: string;
  name: string;
  type: 'time_based' | 'request_based' | 'manual' | 'dynamic';
  intervalMinutes?: number;
  maxRequestsPerIP?: number;
  enabled: boolean;
  accounts: string[];
  createdAt: string;
  updatedAt: string;
}

interface ExecutionHistory {
  id: string;
  policyId: string;
  policyName: string;
  action: 'rotate' | 'pause' | 'resume' | 'error';
  timestamp: string;
  ipAddress: string;
  accountId: string;
  accountName: string;
  success: boolean;
  error?: string;
}

const IPRotationManager: React.FC = () => {
  const [policies, setPolicies] = useState<IPRotationPolicy[]>([]);
  const [executionHistory, setExecutionHistory] = useState<ExecutionHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<IPRotationPolicy | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 模拟数据
      const mockPolicies: IPRotationPolicy[] = [
        {
          id: '1',
          name: '每30分钟轮换',
          type: 'time_based',
          intervalMinutes: 30,
          enabled: true,
          accounts: ['1', '2'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '2',
          name: '每100请求轮换',
          type: 'request_based',
          maxRequestsPerIP: 100,
          enabled: true,
          accounts: ['3'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '3',
          name: '动态智能轮换',
          type: 'dynamic',
          enabled: false,
          accounts: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const mockHistory: ExecutionHistory[] = [
        {
          id: '1',
          policyId: '1',
          policyName: '每30分钟轮换',
          action: 'rotate',
          timestamp: new Date().toISOString(),
          ipAddress: '104.20.45.67',
          accountId: '1',
          accountName: '营销账号1',
          success: true,
        },
        {
          id: '2',
          policyId: '1',
          policyName: '每30分钟轮换',
          action: 'rotate',
          timestamp: dayjs().subtract(35, 'minute').toISOString(),
          ipAddress: '185.212.96.45',
          accountId: '1',
          accountName: '营销账号1',
          success: true,
        },
        {
          id: '3',
          policyId: '2',
          policyName: '每100请求轮换',
          action: 'error',
          timestamp: dayjs().subtract(1, 'hour').toISOString(),
          ipAddress: '45.76.123.89',
          accountId: '3',
          accountName: '备用账号',
          success: false,
          error: 'VPN连接失败',
        },
      ];

      setPolicies(mockPolicies);
      setExecutionHistory(mockHistory);
    } catch (error) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPolicy = () => {
    setEditingPolicy(null);
    form.resetFields();
    form.setFieldsValue({ type: 'time_based', enabled: true });
    setIsModalVisible(true);
  };

  const handleEditPolicy = (policy: IPRotationPolicy) => {
    setEditingPolicy(policy);
    form.setFieldsValue(policy);
    setIsModalVisible(true);
  };

  const handleDeletePolicy = async (id: string) => {
    try {
      setPolicies(prev => prev.filter(policy => policy.id !== id));
      message.success('策略删除成功');
    } catch (error) {
      message.error('删除策略失败');
    }
  };

  const handleSavePolicy = async (values: any) => {
    try {
      if (editingPolicy) {
        // 更新策略
        const updatedPolicies = policies.map(policy =>
          policy.id === editingPolicy.id
            ? { ...policy, ...values, updatedAt: new Date().toISOString() }
            : policy
        );
        setPolicies(updatedPolicies);
        message.success('策略更新成功');
      } else {
        // 创建新策略
        const newPolicy: IPRotationPolicy = {
          id: Date.now().toString(),
          ...values,
          accounts: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setPolicies(prev => [...prev, newPolicy]);
        message.success('策略创建成功');
      }
      setIsModalVisible(false);
      setEditingPolicy(null);
      form.resetFields();
    } catch (error) {
      message.error('保存策略失败');
    }
  };

  const togglePolicyStatus = async (id: string, enabled: boolean) => {
    try {
      const updatedPolicies = policies.map(policy =>
        policy.id === id
          ? { ...policy, enabled: !enabled, updatedAt: new Date().toISOString() }
          : policy
      );
      setPolicies(updatedPolicies);
      message.success(`策略已${!enabled ? '启用' : '禁用'}`);
    } catch (error) {
      message.error('操作失败');
    }
  };

  const getPolicyTypeTag = (type: IPRotationPolicy['type']) => {
    const config = {
      time_based: { color: 'blue', text: '时间轮换' },
      request_based: { color: 'green', text: '请求轮换' },
      manual: { color: 'orange', text: '手动轮换' },
      dynamic: { color: 'purple', text: '动态轮换' },
    };
    const cfg = config[type];
    return <Tag color={cfg.color}>{cfg.text}</Tag>;
  };

  const getActionTag = (action: ExecutionHistory['action']) => {
    const config = {
      rotate: { color: 'blue', text: '轮换', icon: <SyncOutlined /> },
      pause: { color: 'orange', text: '暂停', icon: <PauseCircleOutlined /> },
      resume: { color: 'green', text: '恢复', icon: <PlayCircleOutlined /> },
      error: { color: 'red', text: '错误', icon: <ExclamationCircleOutlined /> },
    };
    const cfg = config[action];
    return (
      <Tag color={cfg.color} icon={cfg.icon}>
        {cfg.text}
      </Tag>
    );
  };

  const columns = [
    {
      title: '策略名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: IPRotationPolicy['type']) => getPolicyTypeTag(type),
    },
    {
      title: '配置',
      key: 'config',
      render: (_: any, record: IPRotationPolicy) => (
        <Space direction="vertical" size={2}>
          {record.type === 'time_based' && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              间隔: {record.intervalMinutes} 分钟
            </Text>
          )}
          {record.type === 'request_based' && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              最大请求: {record.maxRequestsPerIP} 次/IP
            </Text>
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>
            关联账号: {record.accounts.length} 个
          </Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled: boolean) => (
        <Switch
          checked={enabled}
          checkedChildren="启用"
          unCheckedChildren="禁用"
          onChange={(checked) => togglePolicyStatus('', enabled)}
        />
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (date: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(date).format('MM-DD HH:mm')}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: IPRotationPolicy) => (
        <Space size="small">
          <Tooltip title="编辑">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEditPolicy(record)}
            />
          </Tooltip>
          <Tooltip title="立即执行">
            <Button
              type="text"
              icon={<PlayCircleOutlined />}
              onClick={() => {
                // 立即执行策略
                message.info('立即执行功能');
              }}
            />
          </Tooltip>
          <Popconfirm
            title="确定要删除这个策略吗？"
            onConfirm={() => handleDeletePolicy(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const historyColumns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (date: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(date).format('HH:mm:ss')}
        </Text>
      ),
    },
    {
      title: '策略',
      dataIndex: 'policyName',
      key: 'policyName',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: '动作',
      dataIndex: 'action',
      key: 'action',
      render: (action: ExecutionHistory['action']) => getActionTag(action),
    },
    {
      title: '账号',
      dataIndex: 'accountName',
      key: 'accountName',
      render: (text: string) => <Text>{text}</Text>,
    },
    {
      title: 'IP地址',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      render: (ip: string) => <Text code>{ip}</Text>,
    },
    {
      title: '结果',
      key: 'success',
      render: (_: any, record: ExecutionHistory) => (
        record.success ? (
          <Tag color="green" icon={<CheckCircleOutlined />}>成功</Tag>
        ) : (
          <Tooltip title={record.error}>
            <Tag color="red" icon={<ExclamationCircleOutlined />}>失败</Tag>
          </Tooltip>
        )
      ),
    },
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <SyncOutlined />
            <span>IP轮换策略管理</span>
            <Tag color="blue">{policies.length} 个策略</Tag>
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddPolicy}
          >
            创建策略
          </Button>
        }
        style={{ marginBottom: 24 }}
      >
        <Table
          columns={columns}
          dataSource={policies}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条策略` }}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Card
        title={
          <Space>
            <HistoryOutlined />
            <span>执行历史</span>
            <Tag color="blue">{executionHistory.length} 条记录</Tag>
          </Space>
        }
        extra={
          <Button
            icon={<SyncOutlined />}
            onClick={loadData}
          >
            刷新
          </Button>
        }
      >
        <Table
          columns={historyColumns}
          dataSource={executionHistory}
          rowKey="id"
          pagination={{ pageSize: 5 }}
          size="small"
        />
      </Card>

      {/* 策略编辑模态框 */}
      <Modal
        title={editingPolicy ? '编辑IP轮换策略' : '创建IP轮换策略'}
        open={isModalVisible}
        onOk={() => form.submit()}
        onCancel={() => {
          setIsModalVisible(false);
          setEditingPolicy(null);
          form.resetFields();
        }}
        width={600}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSavePolicy}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="name"
            label="策略名称"
            rules={[{ required: true, message: '请输入策略名称' }]}
          >
            <Input placeholder="例如：每30分钟轮换、每100请求轮换" />
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

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.type !== currentValues.type}
          >
            {({ getFieldValue }) => {
              const type = getFieldValue('type');
              return (
                <>
                  {type === 'time_based' && (
                    <Form.Item
                      name="intervalMinutes"
                      label="轮换间隔（分钟）"
                      rules={[{ required: true, message: '请输入轮换间隔' }]}
                      initialValue={30}
                    >
                      <InputNumber min={1} max={1440} style={{ width: '100%' }} />
                    </Form.Item>
                  )}
                  {type === 'request_based' && (
                    <Form.Item
                      name="maxRequestsPerIP"
                      label="最大请求数"
                      rules={[{ required: true, message: '请输入最大请求数' }]}
                      initialValue={100}
                    >
                      <InputNumber min={1} max={10000} style={{ width: '100%' }} />
                    </Form.Item>
                  )}
                </>
              );
            }}
          </Form.Item>

          <Form.Item
            name="enabled"
            label="启用策略"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>

          <Alert
            message="策略说明"
            description="时间轮换：按固定时间间隔自动更换IP。请求轮换：每个IP处理指定数量的请求后自动更换。动态轮换：根据网络状况和风险等级智能调整。"
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        </Form>
      </Modal>
    </div>
  );
};

export default IPRotationManager;