import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  // 同时检查 localStorage，防止状态更新还没来得及传播的竞争问题
  const hasToken = isAuthenticated || !!localStorage.getItem('fb_token');

  if (!hasToken) {
    return React.createElement(Navigate, { to: '/login', replace: true });
  }

  return React.createElement(React.Fragment, null, children);
};

export default ProtectedRoute;
