import React, { useEffect } from 'react';
import {
  Form,
  Input,
  Select,
  Row,
  Col,
  Typography,
  Alert,
  Space,
  Tag,
} from 'antd';
import {
  UserOutlined,
  MailOutlined,
  LockOutlined,
  InfoCircleOutlined,
  SafetyOutlined,
} from '@ant-design/icons';

import { ExtendedFacebookAccount } from '../../../types/facebook-login';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

interface Step1BasicInfoProps {
  formData: Partial<ExtendedFacebookAccount>;
  onChange: (data: Partial<ExtendedFacebookAccount>) => void;
  registerForm: (form: any) => void;
  editing?: boolean;
}

const Step1BasicInfo: React.FC<Step1BasicInfoProps> = ({
  formData,
  onChange,
  registerForm,
  editing = false,
}) => {
  const [form] = Form.useForm();

  useEffect(() => {
    registerForm(form);
  }, [form, registerForm]);

  const handleValuesChange = (changedValues: any, allValues: any) => {
    onChange(allValues);
  };

  return (
    <div>
      <Title level={5} style={{ marginBottom: 24 }}>
        <UserOutlined /> 账号基本信息
      </Title>
      
      <Alert
        message="重要提示"
        description="请确保提供的Facebook账号信息准确无误。密码将使用AES-256-GCM加密存储，系统通过浏览器自动化模拟真实登录。"
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        style={{ marginBottom: 24 }}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={formData}
        onValuesChange={handleValuesChange}
      >
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item
              name="name"
              label="账号显示名称"
              rules={[{ required: true, message: '请输入显示名称' }]}
              tooltip="用于在系统中标识此账号的名称"
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="例如：营销账号1、主号等"
                size="large"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="accountType"
              label="账号类型"
              rules={[{ required: true, message: '请选择账号类型' }]}
            >
              <Select placeholder="选择账号类型" size="large">
                <Option value="user">
                  <Space>
                    <UserOutlined />
                    <span>个人账号</span>
                    <Tag color="blue">推荐</Tag>
                  </Space>
                </Option>
                <Option value="page">
                  <Space>
                    <UserOutlined />
                    <span>主页账号</span>
                  </Space>
                </Option>
                <Option value="business">
                  <Space>
                    <UserOutlined />
                    <span>商业账号</span>
                    <Tag color="gold">高级</Tag>
                  </Space>
                </Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={24}>
          <Col span={12}>
            <Form.Item
              name="email"
              label="Facebook登录邮箱/手机号"
              rules={[
                { required: true, message: '请输入登录邮箱或手机号' },
                { type: 'email', message: '请输入有效的邮箱地址' },
              ]}
              tooltip="用于登录Facebook的邮箱地址或手机号码"
            >
              <Input
                prefix={<MailOutlined />}
                placeholder="example@email.com 或 +8613800138000"
                size="large"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="facebookPassword"
              label={editing ? 'Facebook密码（留空不修改）' : 'Facebook密码'}
              rules={editing ? [] : [{ required: true, message: '请输入Facebook密码' }]}
              tooltip="Facebook登录密码，编辑时留空表示不修改"
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="输入Facebook登录密码"
                size="large"
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="facebookId"
          label="Facebook ID（可选）"
          tooltip="Facebook用户ID，如果不知道可以留空，系统会自动获取"
        >
          <Input
            placeholder="例如：100012345678901"
            size="large"
          />
        </Form.Item>

        <Form.Item
          name="messengerPin"
          label="Messenger 聊天室 PIN（可选）"
          tooltip="如果你的 Messenger 设置了聊天室 PIN 锁，请填写此处。系统在打开 Messenger 时会自动输入 PIN，避免任务中断。新账号若 Facebook 要求创建 PIN，也会自动使用此值完成创建。"
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="4–6 位数字 PIN（没有可留空）"
            size="large"
            maxLength={6}
          />
        </Form.Item>

        <Form.Item
          name="remarks"
          label="备注说明"
          tooltip="添加关于此账号的备注信息"
        >
          <TextArea
            placeholder="例如：此账号用于营销活动、账号来源、特殊注意事项等"
            rows={3}
            showCount
            maxLength={500}
          />
        </Form.Item>

        <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, padding: 16, marginTop: 16 }}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Text strong>
              <SafetyOutlined /> 安全说明
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              1. 所有密码均使用AES-256-GCM加密存储，确保数据安全
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              2. 系统通过无头浏览器自动化登录，模拟真实用户行为
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              3. 建议定期更新密码，并启用两步验证以提高安全性
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              4. 系统不会在日志中记录明文密码
            </Text>
          </Space>
        </div>

        {formData.accountType === 'business' && (
          <Alert
            message="商业账号提示"
            description="商业账号需要额外的权限配置，请确保已获得相应的广告管理权限。"
            type="warning"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
      </Form>
    </div>
  );
};

export default Step1BasicInfo;