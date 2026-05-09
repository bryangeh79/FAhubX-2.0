import React, { useState } from 'react';
import { Card, Input, Button, Typography, Space, Alert, message } from 'antd';
import { KeyOutlined, CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import api from '../services/api';
import { useT } from '../i18n';
import LanguageSwitcher from '../components/LanguageSwitcher';

const { Title, Text, Paragraph } = Typography;

const ActivationPage: React.FC<{ onActivated: () => void }> = ({ onActivated }) => {
  const t = useT();
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      setError(t('activation.emptyError'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.post('/license/activate', { licenseKey: licenseKey.trim() });
      const data = res.data?.data || res.data;
      if (data.success) {
        message.success(t('activation.successMessage', {
          plan: (data.license?.plan || 'basic').toUpperCase(),
          max: data.license?.maxAccounts || 10,
        }));
        onActivated();
      } else {
        setError(data.error || t('activation.failedMessage'));
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || t('activation.networkError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      position: 'relative',
    }}>
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <LanguageSwitcher />
      </div>
      <Card style={{ width: 460, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
        <Space direction="vertical" size="large" style={{ width: '100%', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔑</div>
            <Title level={3} style={{ margin: 0 }}>{t('activation.title')}</Title>
            <Paragraph type="secondary">{t('activation.subtitle')}</Paragraph>
          </div>

          {error && (
            <Alert type="error" message={error} showIcon closable onClose={() => setError(null)} />
          )}

          <Input
            size="large"
            prefix={<KeyOutlined style={{ color: '#1677ff' }} />}
            placeholder={t('activation.placeholder')}
            value={licenseKey}
            onChange={e => setLicenseKey(e.target.value.toUpperCase())}
            onPressEnter={handleActivate}
            maxLength={19}
            style={{ fontFamily: 'monospace', fontSize: 16, letterSpacing: 1 }}
          />

          <Button
            type="primary"
            size="large"
            block
            loading={loading}
            onClick={handleActivate}
            icon={loading ? <LoadingOutlined /> : <CheckCircleOutlined />}
          >
            {loading ? t('activation.verifying') : t('activation.activateButton')}
          </Button>

          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('activation.helpText')}
          </Text>
        </Space>
      </Card>
    </div>
  );
};

export default ActivationPage;
