import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Select,
  Space,
  Tag,
  Typography,
  message,
  Popconfirm,
  Tooltip,
  Badge,
  Card,
  Row,
  Col,
  Input,
  Switch,
  Progress,
  Divider,
} from 'antd';
import {
  UserOutlined,
  LinkOutlined,

  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SyncOutlined,
  EyeOutlined,
  FilterOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WifiOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { VPNConfig, ExtendedFacebookAccount, AccountVPNAssociation } from '../types/facebook-login';

const { Title, Text } = Typography;
const { Option } = Select;

interface VPNAccountAssociationProps {
  vpnId?: string;
  onClose?: () => void;
  onAssociationChange?: () => void;
}

const VPNAccountAssociation: React.FC<VPNAccountAssociationProps> = ({
  vpnId,
  onClose,
  onAssociationChange,
}) => {
  const [form] = Form.useForm();
  const [accounts, setAccounts] = useState<ExtendedFacebookAccount[]>([]);
  const [vpns, setVPNs] = useState<VPNConfig[]>([]);
  const [associations, setAssociations] = useState<AccountVPNAssociation[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingAssociation, setEditingAssociation] = useState<AccountVPNAssociation | null>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [batchAssignModalVisible, setBatchAssignModalVisible] = useState(false);

  // 加载数据
  useEffect(() => {
    loadData();
  }, [vpnId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 模拟加载账号数据
      const mockAccounts: ExtendedFacebookAccount[] = [
        {
          id: '1',
          name: '张三的账号',
          email: 'zhangsan@example.com',
          accountType: 'user',
          verified: true,
          loginStatus: true,
          status: 'active',
          createdAt: new Date().toISOString(),
          stats: {
            totalLogins: 45,
            successfulLogins: 42,
            averageLoginTime: 3200,
            lastLoginDate: new Date().toISOString(),
            consecutiveFailures: 0,
          },
        },
        {
          id: '2',
          name: '李四的账号',
          email: 'lisi@example.com',
          accountType: 'user',
          verified: true,
          loginStatus: false,
          status: 'active',
          createdAt: new Date().toISOString(),
          stats: {
            totalLogins: 28,
            successfulLogins: 25,
            averageLoginTime: 2800,
            lastLoginDate: new Date(Date.now() - 86400000).toISOString(),
            consecutiveFailures: 1,
          },
        },
        {
          id: '3',
          name: '企业页面',
          email: 'business@example.com',
          accountType: 'page',
          verified: true,
          loginStatus: true,
          status: 'active',
          createdAt: new Date().toISOString(),
          stats: {
            totalLogins: 120,
            successfulLogins: 118,
            averageLoginTime: 4100,
            lastLoginDate: new Date().toISOString(),
            consecutiveFailures: 0,
          },
        },
        {
          id: '4',
          name: '测试账号',
          email: 'test@example.com',
          accountType: 'user',
          verified: false,
          loginStatus: false,
          status: 'inactive',
          createdAt: new Date().toISOString(),
          stats: {
            totalLogins: 5,
            successfulLogins: 3,
            averageLoginTime: 5200,
            lastLoginDate: new Date(Date.now() - 172800000).toISOString(),
            consecutiveFailures: 2,
          },
        },
      ];

      // 模拟加载VPN数据
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

      // 模拟加载关联数据
      const mockAssociations: AccountVPNAssociation[] = [
        {
          id: '1',
          accountId: '1',
          vpnId: '1',
          vpnConfig: mockVPNs[0],
          priority: 1,
          failoverEnabled: true,
          failoverVPNIds: ['2'],
          connectionStrategy: 'sticky',
          lastUsedAt: new Date().toISOString(),
          successRate: 0.95,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '2',
          accountId: '2',
          vpnId: '2',
          vpnConfig: mockVPNs[1],
          priority: 1,
          failoverEnabled: false,
          failoverVPNIds: [],
          connectionStrategy: 'round_robin',
          lastUsedAt: new Date(Date.now() - 86400000).toISOString(),
          successRate: 0.85,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '3',
          accountId: '3',
          vpnId: '1',
          vpnConfig: mockVPNs[0],
          priority: 2,
          failoverEnabled: true,
          failoverVPNIds: ['3'],
          connectionStrategy: 'latency_based',
          lastUsedAt: new Date().toISOString(),
          successRate: 0.98,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      setAccounts(mockAccounts);
      setVPNs(mockVPNs);
      
      // 如果指定了VPN ID，只显示该VPN的关联
      if (vpnId) {
        const filteredAssociations = mockAssociations.filter(assoc => assoc.vpnId === vpnId);
        setAssociations(filteredAssociations);
      } else {
        setAssociations(mockAssociations);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取账号名称
  const getAccountName = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    return account ? account.name : '未知账号';
  };

  // 获取账号邮箱
  const getAccountEmail = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    return account ? account.email : '';
  };

  // 获取VPN名称
  const getVPNName = (vpnId: string) => {
    const vpn = vpns.find(v => v.id === vpnId);
    return vpn ? vpn.name : '未知VPN';
  };

  // 获取VPN IP
  const getVPNIP = (vpnId: string) => {
    const vpn = vpns.find(v => v.id === vpnId);
    return vpn ? vpn.ipAddress : '';
  };

  // 获取VPN状态标签
  const getVPNStatusTag = (vpnId: string) => {
    const vpn = vpns.find(v => v.id === vpnId);
    if (!vpn) return <Tag color="default">未知</Tag>;
    
    const statusConfig = {
      connected: { color: 'green', text: '已连接' },
      connecting: { color: 'blue', text: '连接中' },
      disconnecting: { color: 'orange', text: '断开中' },
      disconnected: { color: 'default', text: '已断开' },
      error: { color: 'red', text: '错误' },
    };
    
    const config = statusConfig[vpn.status];
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 处理添加关联
  const handleAddAssociation = () => {
    form.resetFields();
    setEditingAssociation(null);
    setIsModalVisible(true);
  };

  // 处理编辑关联
  const handleEditAssociation = (association: AccountVPNAssociation) => {
    form.setFieldsValue({
      accountId: association.accountId,
      vpnId: association.vpnId,
      priority: association.priority,
      failoverEnabled: association.failoverEnabled,
      failoverVPNIds: association.failoverVPNIds,
      connectionStrategy: association.connectionStrategy,
    });
    setEditingAssociation(association);
    setIsModalVisible(true);
  };

  // 处理删除关联
  const handleDeleteAssociation = (id: string) => {
    setAssociations(prev => prev.filter(assoc => assoc.id !== id));
    message.success('关联已删除');
    if (onAssociationChange) onAssociationChange();
  };

  // 处理保存关联
  const handleSaveAssociation = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (editingAssociation) {
        // 更新现有关联
        setAssociations(prev => prev.map(assoc => 
          assoc.id === editingAssociation.id 
            ? { 
                ...assoc, 
                ...values,
                updatedAt: new Date().toISOString(),
              }
            : assoc
        ));
        message.success('关联已更新');
      } else {
        // 创建新关联
        const newAssociation: AccountVPNAssociation = {
          id: Date.now().toString(),
          accountId: values.accountId,
          vpnId: values.vpnId,
          priority: values.priority || 1,
          failoverEnabled: values.failoverEnabled || false,
          failoverVPNIds: values.failoverVPNIds || [],
          connectionStrategy: values.connectionStrategy || 'sticky',
          successRate: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setAssociations(prev => [newAssociation, ...prev]);
        message.success('关联已创建');
      }
      
      setIsModalVisible(false);
      form.resetFields();
      if (onAssociationChange) onAssociationChange();
    } catch (error) {
      console.error('保存关联失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 处理批量分配
  const handleBatchAssign = async () => {
    if (selectedAccountIds.length === 0) {
      message.warning('请先选择要分配的账号');
      return;
    }
    
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // 为每个选中的账号创建关联
      const newAssociations = selectedAccountIds.map(accountId => ({
        id: `${Date.now()}-${accountId}`,
        accountId,
        vpnId: values.vpnId,
        priority: values.priority || 1,
        failoverEnabled: values.failoverEnabled || false,
        failoverVPNIds: values.failoverVPNIds || [],
        connectionStrategy: values.connectionStrategy || 'sticky',
        successRate: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      
      setAssociations(prev => [...newAssociations, ...prev]);
      setSelectedAccountIds([]);
      setBatchAssignModalVisible(false);
      form.resetFields();
      message.success(`已为 ${selectedAccountIds.length} 个账号分配VPN`);
      
      if (onAssociationChange) onAssociationChange();
    } catch (error) {
      console.error('批量分配失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 过滤账号
  const filteredAccounts = accounts.filter(account => {
    if (!searchText) return true;
    return (
      account.name.toLowerCase().includes(searchText.toLowerCase()) ||
      (account.email && account.email.toLowerCase().includes(searchText.toLowerCase()))
    );
  });

  // 表格列定义
  const columns = [
    {
      title: '账号信息',
      key: 'account',
      render: (_: any, record: AccountVPNAssociation) => (
        <Space direction="vertical" size={2}>
          <Text strong>{getAccountName(record.accountId)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {getAccountEmail(record.accountId)}
          </Text>
        </Space>
      ),
    },
    {
      title: 'VPN信息',
      key: 'vpn',
      render: (_: any, record: AccountVPNAssociation) => (
        <Space direction="vertical" size={2}>
          <Space>
            <WifiOutlined />
            <Text strong>{getVPNName(record.vpnId)}</Text>
            {getVPNStatusTag(record.vpnId)}
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            IP: {getVPNIP(record.vpnId)}
          </Text>
        </Space>
      ),
    },
    {
      title: '连接策略',
      dataIndex: 'connectionStrategy',
      key: 'connectionStrategy',
      render: (strategy: string) => {
        const strategyConfig = {
          sticky: { color: 'blue', text: '固定连接' },
          round_robin: { color: 'green', text: '轮询连接' },
          latency_based: { color: 'gold', text: '延迟优先' },
          manual: { color: 'default', text: '手动选择' },
        };
        const config = strategyConfig[strategy as keyof typeof strategyConfig] || { color: 'default', text: strategy };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      render: (priority: number) => (
        <Badge
          count={priority}
          style={{ backgroundColor: priority === 1 ? '#52c41a' : priority === 2 ? '#faad14' : '#ff4d4f' }}
        />
      ),
    },
    {
      title: '成功率',
      key: 'successRate',
      render: (_: any, record: AccountVPNAssociation) => (
        <div style={{ width: 100 }}>
          <Progress
            percent={Math.round(record.successRate * 100)}
            size="small"
            status={record.successRate > 0.9 ? 'success' : record.successRate > 0.7 ? 'normal' : 'exception'}
          />
        </div>
      ),
    },
    {
      title: '故障切换',
      dataIndex: 'failoverEnabled',
      key: 'failoverEnabled',
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'default'}>
          {enabled ? '已启用' : '未启用'}
        </Tag>
      ),
    },
    {
      title: '最后使用',
      dataIndex: 'lastUsedAt',
      key: 'lastUsedAt',
      render: (date: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {date ? new Date(date).toLocaleString() : '从未使用'}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: AccountVPNAssociation) => (
        <Space size="small">
          <Tooltip title="编辑">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEditAssociation(record)}
            />
          </Tooltip>
          <Tooltip title="查看账号详情">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => {
                // 这里可以跳转到账号详情页面
                message.info('查看账号详情功能');
              }}
            />
          </Tooltip>
          <Popconfirm
            title="确定要删除这个关联吗？"
            onConfirm={() => handleDeleteAssociation(record.id)}
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

  // 账号选择列
  const accountSelectionColumns = [
    {
      title: '选择',
      key: 'selection',
      width: 60,
      render: (_: any, record: ExtendedFacebookAccount) => (
        <Switch
          size="small"
          checked={selectedAccountIds.includes(record.id)}
          onChange={(checked) => {
            if (checked) {
              setSelectedAccountIds(prev => [...prev, record.id]);
            } else {
              setSelectedAccountIds(prev => prev.filter(id => id !== record.id));
            }
          }}
        />
      ),
    },
    {
      title: '账号名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: ExtendedFacebookAccount) => (
        <Space direction="vertical" size={2}>
          <Text strong>{text}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.email}
          </Text>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'accountType',
      key: 'accountType',
      render: (type: string) => (
        <Tag color={type === 'page' ? 'purple' : type === 'business' ? 'cyan' : 'blue'}>
          {type === 'user' ? '个人账号' : type === 'page' ? '页面' : '企业账号'}
        </Tag>
      ),
    },
    {
      title: '状态',
      key: 'status',
      render: (_: any, record: ExtendedFacebookAccount) => (
        <Space>
          <Badge
            status={record.loginStatus ? 'success' : 'default'}
            text={record.loginStatus ? '已登录' : '未登录'}
          />
          <Tag color={record.verified ? 'green' : 'orange'}>
            {record.verified ? '已验证' : '未验证'}
          </Tag>
        </Space>
      ),
    },
    {
      title: '最后登录',
      key: 'lastLogin',
      render: (_: any, record: ExtendedFacebookAccount) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {record.stats?.lastLoginDate 
            ? new Date(record.stats.lastLoginDate).toLocaleDateString() 
            : '从未登录'}
        </Text>
      ),
    },
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <LinkOutlined />
            <span>账号-VPN关联管理</span>
            {vpnId && (
              <Tag color="blue">
                当前VPN: {vpns.find(v => v.id === vpnId)?.name || '未知'}
              </Tag>
            )}
          </Space>
        }
        extra={
          <Space>
            <Input
              placeholder="搜索账号..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 200 }}
            />
            <Button
              icon={<FilterOutlined />}
              onClick={() => setSearchText('')}
            >
              清除筛选
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddAssociation}
            >
              添加关联
            </Button>
            <Button
              type="dashed"
              icon={<GlobalOutlined />}
              onClick={() => setBatchAssignModalVisible(true)}
            >
              批量分配
            </Button>
            {onClose && (
              <Button onClick={onClose}>关闭</Button>
            )}
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={associations}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条关联记录` }}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* 关联编辑模态框 */}
      <Modal
        title={editingAssociation ? '编辑账号-VPN关联' : '添加账号-VPN关联'}
        open={isModalVisible}
        onOk={handleSaveAssociation}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
        }}
        confirmLoading={loading}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="accountId"
                label="选择账号"
                rules={[{ required: true, message: '请选择账号' }]}
              >
                <Select placeholder="选择账号" showSearch optionFilterProp="children">
                  {accounts.map(account => (
                    <Option key={account.id} value={account.id}>
                      <Space>
                        <UserOutlined />
                        <span>{account.name}</span>
                        <Tag color={account.verified ? 'green' : 'orange'}>
                          {account.verified ? '已验证' : '未验证'}
                        </Tag>
                      </Space>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="vpnId"
                label="选择VPN"
                rules={[{ required: true, message: '请选择VPN' }]}
              >
                <Select placeholder="选择VPN" showSearch optionFilterProp="children">
                  {vpns.map(vpn => (
                    <Option key={vpn.id} value={vpn.id}>
                      <Space>
                        <WifiOutlined />
                        <span>{vpn.name}</span>
                        <Tag color={vpn.status === 'connected' ? 'green' : 'default'}>
                          {vpn.status === 'connected' ? '已连接' : '未连接'}
                        </Tag>
                      </Space>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="priority"
                label="优先级"
                initialValue={1}
                rules={[{ required: true, message: '请输入优先级' }]}
              >
                <Select placeholder="选择优先级">
                  <Option value={1}>高 (主VPN)</Option>
                  <Option value={2}>中 (备用VPN)</Option>
                  <Option value={3}>低 (临时VPN)</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="connectionStrategy"
                label="连接策略"
                initialValue="sticky"
                rules={[{ required: true, message: '请选择连接策略' }]}
              >
                <Select placeholder="选择连接策略">
                  <Option value="sticky">固定连接</Option>
                  <Option value="round_robin">轮询连接</Option>
                  <Option value="latency_based">延迟优先</Option>
                  <Option value="manual">手动选择</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="failoverEnabled"
            label="故障切换"
            valuePropName="checked"
            initialValue={false}
          >
            <Switch
              checkedChildren="启用"
              unCheckedChildren="禁用"
            />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.failoverEnabled !== currentValues.failoverEnabled}
          >
            {({ getFieldValue }) =>
              getFieldValue('failoverEnabled') ? (
                <Form.Item
                  name="failoverVPNIds"
                  label="备用VPN节点"
                  rules={[{ required: true, message: '请选择备用VPN节点' }]}
                >
                  <Select
                    mode="multiple"
                    placeholder="选择备用VPN节点"
                    optionFilterProp="children"
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
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量分配模态框 */}
      <Modal
        title="批量分配VPN给账号"
        open={batchAssignModalVisible}
        onOk={handleBatchAssign}
        onCancel={() => {
          setBatchAssignModalVisible(false);
          form.resetFields();
          setSelectedAccountIds([]);
        }}
        confirmLoading={loading}
        width={800}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>已选择 {selectedAccountIds.length} 个账号</Text>
          {selectedAccountIds.length > 0 && (
            <Button
              type="link"
              size="small"
              onClick={() => setSelectedAccountIds([])}
              style={{ marginLeft: 8 }}
            >
              清除选择
            </Button>
          )}
        </div>

        <Card style={{ marginBottom: 16, maxHeight: 300, overflow: 'auto' }}>
          <Table
            columns={accountSelectionColumns}
            dataSource={filteredAccounts}
            rowKey="id"
            pagination={false}
            size="small"
          />
        </Card>

        <Divider>VPN配置</Divider>

        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="vpnId"
                label="选择VPN"
                rules={[{ required: true, message: '请选择VPN' }]}
              >
                <Select placeholder="选择VPN" showSearch optionFilterProp="children">
                  {vpns.map(vpn => (
                    <Option key={vpn.id} value={vpn.id}>
                      <Space>
                        <WifiOutlined />
                        <span>{vpn.name}</span>
                        <Tag color={vpn.status === 'connected' ? 'green' : 'default'}>
                          {vpn.status === 'connected' ? '已连接' : '未连接'}
                        </Tag>
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
                initialValue="sticky"
                rules={[{ required: true, message: '请选择连接策略' }]}
              >
                <Select placeholder="选择连接策略">
                  <Option value="sticky">固定连接</Option>
                  <Option value="round_robin">轮询连接</Option>
                  <Option value="latency_based">延迟优先</Option>
                  <Option value="manual">手动选择</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default VPNAccountAssociation;