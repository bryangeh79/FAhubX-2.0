import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, Form, Input, Select, DatePicker, Button, Space, Alert, Typography, Steps, Row, Col, message,
} from 'antd';
import {
  UserOutlined, MailOutlined, LockOutlined, GlobalOutlined,
  PlayCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { accountsService } from '../services/accounts';
import { useT } from '../i18n';

const { Text, Paragraph } = Typography;
const { Option } = Select;

interface VPNOption {
  id: string;
  name: string;
  country?: string;
  status: string;
  isDefault: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;  // refresh account list after registration succeeds
  vpnOptions: VPNOption[];
}

type Phase = 'form' | 'waiting' | 'success' | 'failed';

const POLL_INTERVAL_MS = 5000;

const RegistrationModal: React.FC<Props> = ({ open, onClose, onSuccess, vpnOptions }) => {
  const t = useT();
  const [form] = Form.useForm();
  const [phase, setPhase] = useState<Phase>('form');
  const [submitting, setSubmitting] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setPhase('form');
      setAccountId(null);
      setErrorMsg('');
      form.resetFields();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Clean up poll timer on unmount / close
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const startPolling = (id: string) => {
    const tick = async () => {
      try {
        const { status, error } = await accountsService.getRegistrationStatus(id);
        if (status === 'idle') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setPhase('success');
          onSuccess();
        } else if (status === 'registration_failed') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setErrorMsg(error || t('registration.failedTitle'));
          setPhase('failed');
        }
        // status='registering' → keep polling
      } catch (e: any) {
        // Network error — keep polling, don't fail the flow
        console.warn('Registration status poll failed:', e?.message);
      }
    };
    tick(); // immediate
    pollTimerRef.current = setInterval(tick, POLL_INTERVAL_MS);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload = {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
        facebookPassword: values.facebookPassword,
        vpnConfigId: values.vpnConfigId,
        name: values.name?.trim() || undefined,
        dateOfBirth: values.dateOfBirth ? dayjs(values.dateOfBirth).format('YYYY-MM-DD') : undefined,
        gender: values.gender || undefined,
        accountType: values.accountType || 'user',
        remarks: values.remarks || undefined,
      };
      const { accountId: newId } = await accountsService.startRegistration(payload);
      setAccountId(newId);
      setPhase('waiting');
      startPolling(newId);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || t('registration.startFailed');
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (phase === 'waiting' && accountId) {
      // User wants to abort in-progress registration
      Modal.confirm({
        title: t('registration.cancelConfirm'),
        content: t('registration.cancelConfirmDesc'),
        okText: t('registration.cancelConfirmOk'),
        cancelText: t('registration.cancelConfirmCancel'),
        onOk: async () => {
          try {
            await accountsService.cancelRegistration(accountId);
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            message.info(t('registration.cancelSuccess'));
            onClose();
          } catch (e: any) {
            message.error(e?.response?.data?.message || t('registration.cancelFailed'));
          }
        },
      });
    } else {
      // Form phase or already done — just close
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      onClose();
    }
  };

  const stepCurrent = phase === 'form' ? 0 : phase === 'waiting' ? 1 : 2;
  const stepStatus: 'wait' | 'process' | 'finish' | 'error' =
    phase === 'failed' ? 'error' : phase === 'success' ? 'finish' : 'process';

  return (
    <Modal
      title={
        <Space>
          <PlayCircleOutlined style={{ color: '#1890ff' }} />
          <span>{t('registration.modalTitle')}</span>
        </Space>
      }
      open={open}
      onCancel={handleCancel}
      maskClosable={false}
      width={680}
      footer={
        phase === 'form' ? (
          <Space>
            <Button onClick={handleCancel}>{t('common.cancel')}</Button>
            <Button type="primary" loading={submitting} onClick={handleSubmit} icon={<PlayCircleOutlined />}>
              {t('registration.startButton')}
            </Button>
          </Space>
        ) : phase === 'waiting' ? (
          <Button danger onClick={handleCancel}>{t('registration.cancelButton')}</Button>
        ) : (
          <Button type="primary" onClick={onClose}>{t('common.close')}</Button>
        )
      }
    >
      <Steps
        size="small"
        current={stepCurrent}
        status={stepStatus}
        style={{ marginBottom: 24 }}
        items={[
          { title: t('registration.step1'), icon: <UserOutlined /> },
          {
            title: t('registration.step2'),
            icon: phase === 'waiting' ? <LoadingOutlined /> : <GlobalOutlined />,
          },
          {
            title: phase === 'failed' ? t('registration.step3Failed') : t('registration.step3Success'),
            icon: phase === 'failed' ? <CloseCircleOutlined /> : <CheckCircleOutlined />,
          },
        ]}
      />

      {phase === 'form' && (
        <>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            description={t('registration.infoBanner')}
          />
          <Form form={form} layout="vertical">
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="firstName" label={t('registration.firstName')} rules={[{ required: true, message: t('registration.firstNameRequired') }]}>
                  <Input prefix={<UserOutlined />} placeholder={t('registration.firstNamePlaceholder')} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="lastName" label={t('registration.lastName')} rules={[{ required: true, message: t('registration.lastNameRequired') }]}>
                  <Input prefix={<UserOutlined />} placeholder={t('registration.lastNamePlaceholder')} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              name="email"
              label={t('registration.email')}
              rules={[{ required: true, message: t('registration.emailRequired') }]}
              extra={t('registration.emailExtra')}
            >
              <Input prefix={<MailOutlined />} placeholder={t('registration.emailPlaceholder')} />
            </Form.Item>
            <Form.Item
              name="facebookPassword"
              label={t('registration.password')}
              rules={[
                { required: true, message: t('registration.passwordRequired') },
                { min: 6, message: t('registration.passwordMin') },
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder={t('registration.passwordPlaceholder')} />
            </Form.Item>
            <Form.Item
              name="vpnConfigId"
              label={t('registration.vpn')}
              rules={[{ required: true, message: t('registration.vpnRequired') }]}
              extra={t('registration.vpnExtra')}
            >
              <Select placeholder={t('registration.vpnPlaceholder')} showSearch optionFilterProp="children">
                {vpnOptions.map(v => (
                  <Option key={v.id} value={v.id}>
                    <Space>
                      <GlobalOutlined />
                      <span>{v.name}</span>
                      {v.country && <Text type="secondary" style={{ fontSize: 12 }}>({v.country})</Text>}
                    </Space>
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="dateOfBirth" label={t('registration.dob')}>
                  <DatePicker style={{ width: '100%' }} placeholder="YYYY-MM-DD" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="gender" label={t('registration.gender')}>
                  <Select placeholder={t('registration.genderPlaceholder')} allowClear>
                    <Option value="male">{t('registration.gender_male')}</Option>
                    <Option value="female">{t('registration.gender_female')}</Option>
                    <Option value="custom">{t('registration.gender_custom')}</Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="accountType" label={t('registration.accountType')} initialValue="user">
                  <Select>
                    <Option value="user">{t('accounts.accountType_user')}</Option>
                    <Option value="page">{t('accounts.accountType_page')}</Option>
                    <Option value="business">{t('accounts.accountType_business')}</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="name" label={t('registration.internalName')} extra={t('registration.internalNameExtra')}>
                  <Input placeholder={t('registration.internalNamePlaceholder')} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="remarks" label={t('registration.remarks')}>
              <Input.TextArea rows={2} placeholder={t('registration.remarksPlaceholder')} />
            </Form.Item>
          </Form>
        </>
      )}

      {phase === 'waiting' && (
        <div style={{ padding: '20px 0' }}>
          <Alert
            type="info"
            showIcon
            icon={<LoadingOutlined />}
            message={t('registration.waitingTitle')}
            description={
              <div>
                <Paragraph style={{ marginTop: 8, marginBottom: 4 }}>
                  1. {t('registration.waitingStep1')}<br />
                  2. {t('registration.waitingStep2')}<br />
                  3. {t('registration.waitingStep3')}<br />
                  4. {t('registration.waitingStep4')}
                </Paragraph>
                <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                  {t('registration.waitingNote')}<br />
                  {t('registration.waitingTimeout')}
                </Paragraph>
              </div>
            }
          />
        </div>
      )}

      {phase === 'success' && (
        <div style={{ padding: '20px 0', textAlign: 'center' }}>
          <CheckCircleOutlined style={{ fontSize: 56, color: '#52c41a' }} />
          <Paragraph strong style={{ marginTop: 16, fontSize: 16 }}>
            {t('registration.successTitle')}
          </Paragraph>
          <Paragraph type="secondary">
            {t('registration.successDesc')}
          </Paragraph>
        </div>
      )}

      {phase === 'failed' && (
        <div style={{ padding: '20px 0' }}>
          <Alert
            type="error"
            showIcon
            message={t('registration.failedTitle')}
            description={errorMsg || t('registration.failedDesc')}
          />
        </div>
      )}
    </Modal>
  );
};

export default RegistrationModal;
