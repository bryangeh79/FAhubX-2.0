import React from 'react';
import { Alert, Progress, Space, Typography, Timeline, Tag, Row, Col } from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined,
  ClockCircleOutlined, SafetyOutlined, GlobalOutlined,
} from '@ant-design/icons';
import { LoginTestResult } from '../../types/facebook-login';

const { Text, Title } = Typography;

interface TestResultPanelProps {
  result: LoginTestResult;
  title?: string;
  showDetails?: boolean;
}

const TestResultPanel: React.FC<TestResultPanelProps> = ({
  result,
  title = '测试结果',
  showDetails = true,
}) => {
  const successRate = result.steps.filter(step => step.success).length / result.steps.length * 100;

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        <SafetyOutlined /> {title}
      </Title>
      
      {/* 总体结果 */}
      <Alert
        message={result.success ? '测试成功' : '测试失败'}
        type={result.success ? 'success' : 'error'}
        showIcon
        description={
          <Space direction="vertical" style={{ marginTop: 8 }}>
            <Text>测试耗时: {result.duration}ms</Text>
            <Text>IP地址: {result.ipAddress}</Text>
            <Text>Cookies数量: {result.cookiesCount}</Text>
            {result.sessionId && (
              <Text>会话ID: {result.sessionId.substring(0, 16)}...</Text>
            )}
          </Space>
        }
        style={{ marginBottom: 16 }}
      />
      
      {/* 成功率 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>步骤成功率</Text>
            <Progress
              percent={Math.round(successRate)}
              status={successRate >= 80 ? 'success' : successRate >= 60 ? 'normal' : 'exception'}
              strokeColor={successRate >= 80 ? '#52c41a' : successRate >= 60 ? '#1890ff' : '#ff4d4f'}
            />
          </Space>
        </Col>
      </Row>
      
      {/* 测试步骤时间线 */}
      {showDetails && (
        <>
          <Title level={5} style={{ marginBottom: 12 }}>
            <ClockCircleOutlined /> 测试步骤
          </Title>
          <Timeline>
            {result.steps.map((step, index) => (
              <Timeline.Item
                key={index}
                color={step.success ? 'green' : 'red'}
                dot={step.success ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
              >
                <Space direction="vertical" size="small">
                  <Text strong>{step.name}</Text>
                  <Space>
                    <Tag color={step.success ? 'success' : 'error'} style={{ fontSize: 12 }}>
                      {step.success ? '成功' : '失败'}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      耗时: {step.duration}ms
                    </Text>
                  </Space>
                  {step.error && (
                    <Alert
                      message={step.error}
                      type="error"
                      showIcon
                      style={{ marginTop: 4 }}

                    />
                  )}
                </Space>
              </Timeline.Item>
            ))}
          </Timeline>
        </>
      )}
      
      {/* 警告和错误 */}
      {(result.warnings.length > 0 || result.errors.length > 0) && showDetails && (
        <>
          <Title level={5} style={{ marginTop: 24, marginBottom: 12 }}>
            <ExclamationCircleOutlined /> 问题详情
          </Title>
          
          {result.warnings.length > 0 && (
            <Alert
              message="警告"
              description={
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {result.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              }
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
            />
          )}
          
          {result.errors.length > 0 && (
            <Alert
              message="错误"
              description={
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {result.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              }
              type="error"
              showIcon
            />
          )}
        </>
      )}
      
      {/* 浏览器信息 */}
      {showDetails && (
        <>
          <Title level={5} style={{ marginTop: 24, marginBottom: 12 }}>
            <GlobalOutlined /> 浏览器环境
          </Title>
          <Row gutter={16}>
            <Col span={12}>
              <Space direction="vertical" size="small">
                <Text type="secondary">User Agent</Text>
                <Text code style={{ fontSize: 12, wordBreak: 'break-all' }}>
                  {result.userAgent}
                </Text>
              </Space>
            </Col>
            <Col span={12}>
              <Space direction="vertical" size="small">
                <Text type="secondary">会话状态</Text>
                <Tag color={result.sessionCreated ? 'success' : 'error'}>
                  {result.sessionCreated ? '会话已创建' : '会话创建失败'}
                </Tag>
              </Space>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
};

export default TestResultPanel;