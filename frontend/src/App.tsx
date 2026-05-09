import React, { Suspense, lazy, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Spin } from 'antd';

import { AuthProvider } from './store/authStore';
import ProtectedRoute from './components/ProtectedRoute';
import api from './services/api';
import { I18nProvider } from './i18n';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AccountsPage = lazy(() => import('./pages/AccountsPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const ChatScriptsPage = lazy(() => import('./pages/ChatScriptsPage'));
const VPNPage = lazy(() => import('./pages/VPNPage'));
const LoginStatusPage = lazy(() => import('./pages/LoginStatusPage'));
const AntiDetectionPage = lazy(() => import('./pages/AntiDetectionPage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const AdminLicensesPage = lazy(() => import('./pages/AdminLicensesPage'));
const ActivationPage = lazy(() => import('./pages/ActivationPage'));

const Loading = () => (
  <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh' }}>
    <Spin size="large" />
  </div>
);

const App: React.FC = () => {
  const [licenseChecked, setLicenseChecked] = useState(false);
  const [needsActivation, setNeedsActivation] = useState(false);

  // Check license status on app load (Local mode only)
  useEffect(() => {
    api.get('/license/status').then((res) => {
      const data = res.data?.data || res.data;
      if (data.isLocal && !data.activated) {
        setNeedsActivation(true);
      }
      setLicenseChecked(true);
    }).catch(() => {
      // If license endpoint not available (cloud mode), just continue
      setLicenseChecked(true);
    });
  }, []);

  if (!licenseChecked) return <Loading />;

  // License activation (Local mode, not yet activated)
  // 激活成功后 backend 会自动从 License Server 同步用户到本地 users 表，
  // 租户可直接用 Admin 给的邮箱密码登录 — 无需本地注册
  if (needsActivation) {
    return (
      <I18nProvider>
        <Suspense fallback={<Loading />}>
          <ActivationPage onActivated={() => setNeedsActivation(false)} />
        </Suspense>
      </I18nProvider>
    );
  }

  return (
    <I18nProvider>
      <AuthProvider>
        <Router>
          <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounts"
              element={
                <ProtectedRoute>
                  <AccountsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tasks"
              element={
                <ProtectedRoute>
                  <TasksPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat-scripts"
              element={
                <ProtectedRoute>
                  <ChatScriptsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vpn"
              element={
                <ProtectedRoute>
                  <VPNPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/login-status"
              element={
                <ProtectedRoute>
                  <LoginStatusPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/anti-detection"
              element={
                <ProtectedRoute>
                  <AntiDetectionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute>
                  <AdminUsersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/licenses"
              element={
                <ProtectedRoute>
                  <AdminLicensesPage />
                </ProtectedRoute>
              }
            />
          </Routes>
          </Suspense>
        </Router>
      </AuthProvider>
    </I18nProvider>
  );
};

export default App;
