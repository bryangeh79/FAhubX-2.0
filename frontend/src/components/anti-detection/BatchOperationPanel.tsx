import React, { useState } from 'react';
import {
  Card, Table, Button, Space, Typography, Tag, Progress,
  Alert, Row, Col, Statistic, Tooltip, Popconfirm,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, SyncOutlined,
  SafetyOutlined, UserOutlined, GlobalOutlined, ExportOutlined,
  PlayCircleOutlined, PauseCircleOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { ExtendedFacebookAccount } from '../../types/facebook-login';

const { Text, Title } = Typography;

interface BatchOperation {
  id: string;
  type: 'apply_config' | 'test_login' | 'assign_vpn' | 'export_data';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  total: number;
  success: number;
  failed: number;
  startTime: string;
  endTime?: string;
  configName?: string;
}

interface BatchOperationPanelProps {
  accounts: ExtendedFacebookAccount[];
  selectedAccountIds: string[];
  onOperationComplete?: (operation: BatchOperation) => void;
}

const BatchOperationPanel: React.FC<BatchOperationPanelProps> = ({
  accounts,
  selectedAccountIds,
  onOperationComplete,
}) => {
  const [operations, setOperations] = useState<BatchOperation[]>([]);
  const [runningOperation, setRunningOperation] = useState<BatchOperation | null>(null);

  // 模拟批量操作
  const simulateBatchOperation = async (
    type: BatchOperation['type'],
    configName?: string
  ): Promise<BatchOperation> => {
    const operationId = `op_${Date.now()}`;
    const total = selectedAccountIds.length;
    
    const newOperation: BatchOperation = {
      id: operationId,
      type,
      status: 'running',
      progress: 0,
      total,
      success: 0,
      failed: 0,
      startTime: new Date().toISOString(),
      configName,
    };
    
    setOperations(prev => [newOperation, ...prev]);
    setRunningOperation(newOperation);
    
    // 模拟操作进度
    for (let i = 0; i < total; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const success = Math.random() > 0.2;
      setOperations(prev => prev.map(op => {
        if (op.id === operationId) {
          const updatedOp = {
            ...op,
            progress: i + 1,
            success: op.success + (success ? 1 : 0),
            failed: op.failed + (success ? 0 : 1),
          };
          
          if (i === total - 1) {
            updatedOp.status = 'completed';
            updatedOp.endTime = new Date().toISOString();
            setRunningOperation(null);
            onOperationComplete?.(updatedOp);
          }
          
          return updatedOp;
        }
        return op;
      }));
    }
    
    return newOperation;
  };

  const handleApplyConfig = () => {
    simulateBatchOperation('apply_config', 'Windows Chrome 配置');
  };

  const handleTestLogin = () => {
    simulateBatchOperation('test_login');
  };

  const handleCancelOperation = (operationId: string) => {
    setOperations(prev => prev.map(op => 
      op.id === operationId ? { ...op, status: 'failed', endTime: new Date().toISOString() } : op
    ));
    setRunningOperation(null);
  };

  const getOperationTypeText = (type: BatchOperation['type']) => {
    switch (type) {
      case 'apply_config': return '应用配置';
      case 'test_login': return '登录测试';
      case 'assign_vpn': return '分配VPN';
      case 'export_data': return '导出数据';
      default: return type;
    }
  };

  const getOperationStatusColor = (status: BatchOperation['status']) => {
    switch (status) {
      case 'completed': return 'success';
      case 'running': return 'processing';
      case 'failed': return 'error';
      case 'pending': return 'default';
      default: return 'default';
    }
  };

  const getOperationStatusIcon = (status: BatchOperation['status']) => {
    switch (status) {
      case 'completed': return <CheckCircleOutlined />;
      case 'running': return <SyncOutlined spin />;
      case 'failed': return <CloseCircleOutlined />;
      case 'pending': return <SyncOutlined />;
      default: return null;
    }
  };

  const operationColumns = [
    {
      title: '操作类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: BatchOperation['type'], record: BatchOperation) => (
        <Space>
          {getOperationStatusIcon(record.status)}
          <Text>{getOperationTypeText(type)}</Text>
          {record.configName && (
            <Tag color="blue" style={{ fontSize: 12 }}>
              {record.configName}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: BatchOperation['status']) => (
        <Tag color={getOperationStatusColor(status)}>
          {status === 'completed' ? '完成' :
           status === 'running' ? '进行中' :
           status === 'failed' ? '失败' : '等待'}
        </Tag>
      ),
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      render: (progress: number, record: BatchOperation) => (
        <Progress
          percent={Math.round((progress / record.total) * 100)}
          size="small"
          status={record.status === 'running' ? 'active' : 
                 record.status === 'completed' ? 'success' : 'exception'}
        />
      ),
    },
    {
      title: '结果',
      key: 'result',
      render: (_: any, record: BatchOperation) => (
        <Space>
          <Tag color="success" style={{ fontSize: 12 }}>
            <CheckCircleOutlined /> {record.success}
          </Tag>
          <Tag color="error" style={{ fontSize: 12 }}>
            <CloseCircleOutlined /> {record.failed}
          </Tag>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: BatchOperation) => (
        record.status === 'running' ? (
          <Popconfirm
            title="确定要取消这个操作吗？"
            onConfirm={() => handleCancelOperation(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button danger>
              取消
            </Button>
          </Popconfirm>
        ) : null
      ),
    },
  ];

  return (
    <Card>
      <Title level={4} style={{ marginBottom: 16 }}>
        <SafetyOutlined /> 批量操作面板
      </Title>
      
      {/* 操作统计 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="选中账号"
              value={selectedAccountIds.length}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="进行中操作"
              value={operations.filter(op => op.status === 'running').length}
              prefix={<SyncOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="成功操作"
              value={operations.filter(op => op.status === 'completed').reduce((sum, op) => sum + op.success, 0)}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="失败操作"
              value={operations.filter(op => op.status === 'completed').reduce((sum, op) => sum + op.failed, 0)}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>
      
      {/* 操作按钮 */}
      <Space style={{ marginBottom: 16 }}>
        <Tooltip title="将当前配置应用到选中的账号">
          <Button
            type="primary"
            icon={<SafetyOutlined />}
            onClick={handleApplyConfig}
            disabled={selectedAccountIds.length === 0 || runningOperation !== null}
          >
            批量应用配置
          </Button>
        </Tooltip>
        
        <Tooltip title="对选中的账号进行登录测试">
          <Button
            icon={<PlayCircleOutlined />}
            onClick={handleTestLogin}
            disabled={selectedAccountIds.length === 0 || runningOperation !== null}
          >
            批量登录测试
          </Button>
        </Tooltip>
        
        <Tooltip title="导出选中账号的数据">
          <Button
            icon={<ExportOutlined />}
            disabled={selectedAccountIds.length === 0 || runningOperation !== null}
          >
            批量导出
          </Button>
        </Tooltip>
        
        {runningOperation && (
          <Popconfirm
            title="确定要取消当前操作吗？"
            onConfirm={() => handleCancelOperation(runningOperation.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button danger icon={<CloseCircleOutlined />}>
              取消当前操作
            </Button>
          </Popconfirm>
        )}
      </Space>
      
      {/* 操作状态提示 */}
      {runningOperation && (
        <Alert
          message="批量操作进行中"
          description={
            <Space direction="vertical" size="small">
              <Text>正在执行: {getOperationTypeText(runningOperation.type)}</Text>
              <Progress
                percent={Math.round((runningOperation.progress / runningOperation.total) * 100)}
                status="active"
              />
              <Space>
                <Tag color="success">
                  <CheckCircleOutlined /> 成功: {runningOperation.success}
                </Tag>
                <Tag color="error">
                  <CloseCircleOutlined /> 失败: {runningOperation.failed}
                </Tag>
              </Space>
            </Space>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      
      {/* 操作历史 */}
      <Title level={5} style={{ marginBottom: 12 }}>
        操作历史
      </Title>
      <Table
        columns={operationColumns}
        dataSource={operations}
        rowKey="id"
        pagination={{ pageSize: 5, hideOnSinglePage: true }}
        size="small"
      />
      
      {/* 选中账号预览 */}
      {selectedAccountIds.length > 0 && (
        <>
          <Title level={5} style={{ marginTop: 24, marginBottom: 12 }}>
            选中账号 ({selectedAccountIds.length} 个)
          </Title>
          <Alert
            message="选中的账号"
            description={
              <Space wrap>
                {selectedAccountIds.slice(0, 10).map(accountId => {
                  const account = accounts.find(a => a.id === accountId);
                  return account ? (
                    <Tag key={accountId} color="blue">
                      {account.name}
                    </Tag>
                  ) : null;
                })}
                {selectedAccountIds.length > 10 && (
                  <Tag>...等 {selectedAccountIds.length - 10} 个账号</Tag>
                )}
              </Space>
            }
            type="info"
            showIcon
          />
        </>
      )}
    </Card>
  );
};

export default BatchOperationPanel;