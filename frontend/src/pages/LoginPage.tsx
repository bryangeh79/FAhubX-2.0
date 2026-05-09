import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { authService } from '../services/auth';
import { useAuth } from '../store/authStore';
import { useT } from '../i18n';
import LanguageSwitcher from '../components/LanguageSwitcher';

const { Title } = Typography;

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const t = useT();

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      const response = await authService.login(values.email, values.password);
      const { accessToken, user } = response.data;

      login(accessToken, user);
      message.success(t('login.loginSuccess'));
      navigate('/');
    } catch (error: any) {
      const errMsg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        t('login.loginFailed');
      message.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        position: 'relative',
      }}
    >
      {/* 登录页也加语言切换（右上角） */}
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <LanguageSwitcher />
      </div>

      <Card style={{ width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', borderRadius: 12 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/logo.png"
            alt="FAhubX Logo"
            style={{ width: 72, height: 72, objectFit: 'contain', marginBottom: 8, borderRadius: 12 }}
          />
          <Title level={2} style={{ margin: 0, color: '#1a1a2e' }}>
            {t('login.title')}
          </Title>
          <p style={{ color: '#666', marginTop: 8, marginBottom: 0 }}>{t('login.subtitle')}</p>
        </div>

        <Form name="login" onFinish={onFinish} layout="vertical" size="large">
          <Form.Item
            name="email"
            rules={[{ required: true, message: t('login.emailRequired') }]}
          >
            <Input prefix={<UserOutlined />} placeholder={t('login.emailPlaceholder')} />
          </Form.Item>

          <Form.Item name="password" rules={[{ required: true, message: t('login.passwordRequired') }]}>
            <Input.Password prefix={<LockOutlined />} placeholder={t('login.passwordPlaceholder')} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 44 }}>
              {loading ? t('login.loggingIn') : t('login.loginButton')}
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', color: '#999', fontSize: 12, marginTop: 16 }}>
          <p style={{ margin: 0 }}>© 2026 FAhubX Platform</p>
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;
