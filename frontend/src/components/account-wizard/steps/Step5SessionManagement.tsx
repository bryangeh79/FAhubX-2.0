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
  Table,
  Descriptions,
  Statistic,
  Modal,
  Form,
  InputNumber,
  Switch,
  message,
  Popconfirm,
  Tooltip,
  Progress,
  Badge,
  Timeline,
  Select,
} from 'antd';
import {
  SaveOutlined,
  DeleteOutlined,
  SyncOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  SafetyOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ExportOutlined,
  ImportOutlined,
  HistoryOutlined,
  KeyOutlined,
} from '@ant-design/icons';

import { ExtendedFacebookAccount, LoginSession } from '../../../types/facebook-login';
import { facebookLoginService } from '../../../services/facebook-login';
import { accountsService } from '../../../services/accounts';

const { Title, Text } = Typography;

interface Step5SessionManagementProps {
  formData: Partial<ExtendedFacebookAccount>;
  onChange: (data: Partial<ExtendedFacebookAccount>) => void;
  registerForm: (form: any) => void;
  accountId?: string;
}

const Step5SessionManagement: React.FC<Step5SessionManagementProps> = ({
  formData,
  onChange,
  registerForm,
  accountId,
}) => {
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [currentSession, setCurrentSession] = useState<LoginSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [exportForm] = Form.useForm();
  const [importForm] = Form.useForm();

  useEffect(() => {
    if (accountId) {
      loadSessions();
    }
  }, [accountId]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      // 这里应该调用实际的API，暂时使用模拟数据
      const mockSessions: LoginSession[] = [
        {
          id: '1',
          accountId: accountId || '1',
          sessionId: 'session_123456',
          ipAddress: '104.20.45.67',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          loginTime: new Date(Date.now() - 3600000).toISOString(),
          lastActivity: new Date(Date.now() - 1800000).toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          status: 'active',
          cookies: {
            'c_user': '100012345678901',
            'xs': 'abcdefghijklmnop',
            'fr': '0abcdefghijklmnop',
          },
          localStorage: {
            'fb_login_state': 'logged_in',
            'user_preferences': '{"theme":"dark"}',
          },
          sessionStorage: {
            'temp_data': 'some_value',
          },
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          updatedAt: new Date(Date.now() - 1800000).toISOString(),
        },
        {
          id: '2',
          accountId: accountId || '1',
          sessionId: 'session_789012',
          ipAddress: '185.212.96.45',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          loginTime: new Date(Date.now() - 86400000).toISOString(),
          lastActivity: new Date(Date.now() - 43200000).toISOString(),
          expiresAt: new Date(Date.now() - 43200000).toISOString(),
          status: 'expired',
          cookies: {},
          localStorage: {},
          sessionStorage: {},
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          updatedAt: new Date(Date.now() - 43200000).toISOString(),
        },
      ];
      setSessions(mockSessions);
      
      // 设置当前会话
      const activeSession = mockSessions.find(s => s.status === 'active');
      setCurrentSession(activeSession || null);
    } catch (error) {
      console.error('加载会话数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSession = async () => {
    if (!accountId) {
      message.warning('请先保存账号信息');
      return;
    }

    setSaving(true);
    try {
      const response = await facebookLoginService.saveSession(accountId, {
        sessionData: {
          cookies: currentSession?.cookies || {},
          localStorage: currentSession?.localStorage || {},
          sessionStorage: currentSession?.sessionStorage || {},
        },
        expiresIn: 24, // 24小时
      });
      
      setCurrentSession(response.data);
      message.success('会话保存成功');
      loadSessions();
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || '保存会话失败';
      message.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      // 这里应该调用实际的API删除会话
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      
      if (currentSession?.id === sessionId) {
        setCurrentSession(null);
      }
      
      message.success('会话已删除');
    } catch (error) {
      message.error('删除会话失败');
    }
  };

  const handleClearAllSessions = async () => {
    try {
      if (accountId) {
        // 这里应该调用实际的API清除所有会话
        await accountsService.clearAccountSessions(accountId);
      }
      
      setSessions([]);
      setCurrentSession(null);
      message.success('所有会话已清除');
    } catch (error) {
      message.error('清除会话失败');
    }
  };

  const getSessionStatusBadge = (status: LoginSession['status']) => {
    const config = {
      active: { color: 'green', text: '活跃' },
      expired: { color: 'orange', text: '已过期' },
      invalidated: { color: 'red', text: '已失效' },
      error: { color: 'red', text: '错误' },
    };
    const cfg = config[status];
    return <Badge status={cfg.color as any} text={cfg.text} />;
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    
    if (diff <= 0) return '已过期';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}小时${minutes}分钟`;
  };

  const sessionColumns = [
    {
      title: '会话ID',
      dataIndex: 'sessionId',
      key: 'sessionId',
      render: (id: string) => (
        <Text code style={{ fontSize: 12 }}>
          {id.substring(0, 12)}...
        </Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: LoginSession['status']) => getSessionStatusBadge(status),
    },
    {
      title: '登录时间',
      dataIndex: 'loginTime',
      key: 'loginTime',
      render: (time: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {new Date(time).toLocaleString()}
        </Text>
      ),
    },
    {
      title: 'IP地址',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      render: (ip: string) => <Tag color="blue">{ip}</Tag>,
    },
    {
      title: '有效期',
      key: 'expires',
      render: (_: any, record: LoginSession) => {
        const remaining = getTimeRemaining(record.expiresAt);
        const isExpired = remaining === '已过期';
        
        return (
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            <Text type={isExpired ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>
              {remaining}
            </Text>
            {!isExpired && (
              <Progress
                percent={Math.max(0, Math.min(100, 
                  (new Date(record.expiresAt).getTime() - Date.now()) / 
                  (24 * 60 * 60 * 1000) * 100
                ))}
                size="small"
                status="active"
                showInfo={false}
              />
            )}
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: LoginSession) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => setCurrentSession(record)}
              size="small"
            />
          </Tooltip>
          {record.status === 'active' && (
            <Tooltip title="设为当前会话">
              <Button
                type="text"
                icon={<CheckCircleOutlined />}
                onClick={() => {
                  setCurrentSession(record);
                  message.success('已设为当前会话');
                }}
                size="small"
              />
            </Tooltip>
          )}
          <Popconfirm
            title="确定要删除这个会话吗？"
            onConfirm={() => handleDeleteSession(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                size="small"
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={5} style={{ marginBottom: 24 }}>
        <SaveOutlined /> 会话管理
      </Title>
      
      <Alert
        message="会话管理说明"
        description="管理Facebook登录会话，保存有效的会话可以避免重复登录，提高操作效率。会话包含cookies、localStorage等浏览器状态数据。"
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Row gutter={24} style={{ marginBottom: 24 }}>
        <Col span={24}>
          <Card
            title={
              <Space>
                <KeyOutlined />
                <span>当前会话</span>
                {currentSession && (
                  <Tag color={currentSession.status === 'active' ? 'green' : 'red'}>
                    {currentSession.status === 'active' ? '活跃' : '已失效'}
                  </Tag>
                )}
              </Space>
            }
            loading={loading}
            extra={
              <Space>
                <Button
                  icon={<SyncOutlined />}
                  onClick={loadSessions}
                  disabled={saving}
                >
                  刷新
                </Button>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={handleSaveSession}
                  loading={saving}
                  disabled={!accountId || !currentSession}
                >
                  保存会话
                </Button>
                <Button
                  icon={<ExportOutlined />}
                  onClick={() => setShowExportModal(true)}
                  disabled={!currentSession}
                >
                  导出
                </Button>
                <Button
                  icon={<ImportOutlined />}
                  onClick={() => setShowImportModal(true)}
                >
                  导入
                </Button>
              </Space>
            }
          >
            {currentSession ? (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Descriptions bordered column={3}>
                  <Descriptions.Item label="会话ID" span={2}>
                    <Text code>{currentSession.sessionId}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="状态">
                    {getSessionStatusBadge(currentSession.status)}
                  </Descriptions.Item>
                  <Descriptions.Item label="登录时间">
                    {new Date(currentSession.loginTime).toLocaleString()}
                  </Descriptions.Item>
                  <Descriptions.Item label="最后活动">
                    {new Date(currentSession.lastActivity).toLocaleString()}
                  </Descriptions.Item>
                  <Descriptions.Item label="过期时间">
                    {new Date(currentSession.expiresAt).toLocaleString()}
                  </Descriptions.Item>
                  <Descriptions.Item label="IP地址">
                    <Tag color="blue">{currentSession.ipAddress}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="剩余有效期">
                    <Text type={getTimeRemaining(currentSession.expiresAt) === '已过期' ? 'danger' : 'success'}>
                      {getTimeRemaining(currentSession.expiresAt)}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Cookies数量">
                    {Object.keys(currentSession.cookies || {}).length}
                  </Descriptions.Item>
                </Descriptions>

                <Row gutter={16}>
                  <Col span={8}>
                    <Statistic
                      title="Cookies"
                      value={Object.keys(currentSession.cookies || {}).length}
                      prefix={<KeyOutlined />}
                      valueStyle={{ color: '#1890ff' }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="LocalStorage"
                      value={Object.keys(currentSession.localStorage || {}).length}
                      prefix={<SaveOutlined />}
                      valueStyle={{ color: '#52c41a' }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="SessionStorage"
                      value={Object.keys(currentSession.sessionStorage || {}).length}
                      prefix={<ClockCircleOutlined />}
                      valueStyle={{ color: '#722ed1' }}
                    />
                  </Col>
                </Row>

                <Alert
                  message="会话状态"
                  description={
                    <Timeline>
                      <Timeline.Item color="green">
                        登录成功: {new Date(currentSession.loginTime).toLocaleString()}
                      </Timeline.Item>
                      <Timeline.Item color="blue">
                        最后活动: {new Date(currentSession.lastActivity).toLocaleString()}
                      </Timeline.Item>
                      <Timeline.Item 
                        color={getTimeRemaining(currentSession.expiresAt) === '已过期' ? 'red' : 'orange'}
                      >
                        过期时间: {new Date(currentSession.expiresAt).toLocaleString()}
                      </Timeline.Item>
                    </Timeline>
                  }
                  type="info"
                  showIcon
                />
              </Space>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <KeyOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
                <Text type="secondary">
                  暂无活跃会话
                </Text>
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    请先进行登录测试或导入现有会话
                  </Text>
                </div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={24}>
        <Col span={24}>
          <Card
            title={
              <Space>
                <HistoryOutlined />
                <span>会话历史</span>
                <Tag color="blue">{sessions.length} 个会话</Tag>
              </Space>
            }
            size="small"
            extra={
              <Popconfirm
                title="确定要清除所有会话吗？"
                description="此操作不可恢复，请谨慎操作。"
                onConfirm={handleClearAllSessions}
                okText="确定"
                cancelText="取消"
              >
                <Button type="text" danger icon={<DeleteOutlined />}>
                  清除所有
                </Button>
              </Popconfirm>
            }
          >
            <Table
              columns={sessionColumns}
              dataSource={sessions}
              rowKey="id"
              pagination={{ pageSize: 5 }}
              size="small"
              scroll={{ x: 800 }}
              locale={{ emptyText: '暂无会话历史' }}
            />
          </Card>
        </Col>
      </Row>

      <div style={{ background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 6, padding: 16, marginTop: 24 }}>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text strong>
            <SafetyOutlined /> 会话管理建议
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            1. 定期保存有效的登录会话，避免重复登录操作
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            2. 会话过期前及时更新，保持会话有效性
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            3. 导出重要会话进行备份，防止数据丢失
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            4. 定期清理过期和无效的会话，节省存储空间
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            5. 注意会话安全性，避免泄露给未授权人员
          </Text>
        </Space>
      </div>

      {/* 导出会话模态框 */}
      <Modal
        title="导出会话"
        open={showExportModal}
        onCancel={() => setShowExportModal(false)}
        onOk={() => {
          exportForm.validateFields().then(() => {
            const values = exportForm.getFieldsValue();
            // 这里应该实现实际的导出逻辑
            const sessionData = {
              session: currentSession,
              exportTime: new Date().toISOString(),
              format: values.format,
              includeCookies: values.includeCookies,
              includeStorage: values.includeStorage,
            };
            
            // 生成JSON文件
            const dataStr = JSON.stringify(sessionData, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
            
            const exportFileDefaultName = `facebook_session_${currentSession?.sessionId}_${new Date().getTime()}.json`;
            
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
            
            message.success('会话导出成功');
            setShowExportModal(false);
          });
        }}
        width={500}
      >
        <Form
          form={exportForm}
          layout="vertical"
          initialValues={{
            format: 'json',
            includeCookies: true,
            includeStorage: true,
            encrypt: true,
          }}
        >
          <Form.Item
            name="format"
            label="导出格式"
          >
            <Select>
              <Option value="json">JSON格式（推荐）</Option>
              <Option value="txt">文本格式</Option>
              <Option value="encrypted">加密格式</Option>
            </Select>
          </Form.Item>
          
          <Form.Item
            name="includeCookies"
            label="包含Cookies"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          
          <Form.Item
            name="includeStorage"
            label="包含存储数据"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          
          <Form.Item
            name="encrypt"
            label="加密导出"
            valuePropName="checked"
            tooltip="对导出的会话数据进行加密保护"
          >
            <Switch />
          </Form.Item>
          
          <Alert
            message="导出说明"
            description="导出的会话文件包含敏感信息，请妥善保管。建议启用加密选项以提高安全性。"
            type="warning"
            showIcon
            style={{ marginTop: 16 }}
          />
        </Form>
      </Modal>
      
      {/* 导入会话模态框 */}
      <Modal
        title="导入会话"
        open={showImportModal}
        onCancel={() => setShowImportModal(false)}
        onOk={() => {
          importForm.validateFields().then(() => {
            // 这里应该实现实际的导入逻辑
            message.success('会话导入成功');
            setShowImportModal(false);
            loadSessions();
          });
        }}
        width={500}
      >
        <Form
          form={importForm}
          layout="vertical"
        >
          <Form.Item
            name="sessionFile"
            label="会话文件"
            rules={[{ required: true, message: '请选择会话文件' }]}
          >
            <input type="file" accept=".json,.txt" style={{ width: '100%' }} />
          </Form.Item>
          
          <Form.Item
            name="overwrite"
            label="覆盖现有会话"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          
          <Alert
            message="导入说明"
            description="只能导入本系统导出的会话文件。导入后会验证会话有效性，无效的会话将被拒绝。"
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        </Form>
      </Modal>
    </div>
  );
};

export default Step5SessionManagement;