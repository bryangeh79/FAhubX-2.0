import React from 'react';
import { Card, Tag, Space, Typography, Tooltip, Badge } from 'antd';
import {
  DesktopOutlined, MobileOutlined, TabletOutlined,
  WindowsOutlined, AppleOutlined, LinuxOutlined, AndroidOutlined,
  ChromeOutlined, FireOutlined, CompassOutlined, GlobalOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { AntiDetectionConfig, DeviceSimulation } from '../../types/facebook-login';

const { Text } = Typography;

interface ConfigCardProps {
  config: AntiDetectionConfig;
  onClick?: () => void;
  actions?: React.ReactNode[];
  selected?: boolean;
}

const ConfigCard: React.FC<ConfigCardProps> = ({
  config,
  onClick,
  actions,
  selected = false,
}) => {
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
    firefox: <FireOutlined />,
    safari: <CompassOutlined />,
    edge: <GlobalOutlined />,
  };

  const getDeviceInfo = (deviceSimulation: DeviceSimulation) => {
    return {
      deviceIcon: deviceIconMap[deviceSimulation.deviceType],
      osIcon: osIconMap[deviceSimulation.os],
      browserIcon: browserIconMap[deviceSimulation.browser],
      displayName: `${deviceSimulation.deviceType === 'desktop' ? '桌面' : 
                   deviceSimulation.deviceType === 'mobile' ? '移动' : '平板'} - 
                   ${deviceSimulation.os} ${deviceSimulation.osVersion} - 
                   ${deviceSimulation.browser}`,
    };
  };

  const deviceInfo = getDeviceInfo(config.deviceSimulation);

  return (
    <Card
      hoverable
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        border: selected ? '2px solid #1890ff' : undefined,
        height: '100%',
      }}
      actions={actions}
    >
      <Card.Meta
        avatar={
          <Space direction="vertical" align="center">
            {deviceInfo.deviceIcon}
            <Badge
              status={config.enabled ? 'success' : 'default'}
              text={config.enabled ? '启用' : '禁用'}
              style={{ fontSize: 12 }}
            />
          </Space>
        }
        title={
          <Space>
            <Text strong>{config.name}</Text>
            {config.enabled ? (
              <Tag icon={<CheckCircleOutlined />} color="success">
                启用
              </Tag>
            ) : (
              <Tag icon={<ExclamationCircleOutlined />} color="default">
                禁用
              </Tag>
            )}
          </Space>
        }
        description={
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space>
              <Tooltip title="设备类型">{deviceInfo.deviceIcon}</Tooltip>
              <Tooltip title="操作系统">{deviceInfo.osIcon}</Tooltip>
              <Tooltip title="浏览器">{deviceInfo.browserIcon}</Tooltip>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {deviceInfo.displayName}
              </Text>
            </Space>
            
            <Text type="secondary" ellipsis style={{ fontSize: 12, display: 'block' }}>
              {config.browserFingerprint.userAgent}
            </Text>
            
            <Space>
              <Tag color="blue" style={{ fontSize: 12 }}>
                {config.accounts.length} 个账号
              </Tag>
              {config.trafficPatternId && (
                <Tag color="purple" style={{ fontSize: 12 }}>
                  流量模式
                </Tag>
              )}
            </Space>
          </Space>
        }
      />
    </Card>
  );
};

export default ConfigCard;