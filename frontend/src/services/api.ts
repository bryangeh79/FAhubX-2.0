import axios from 'axios';

// 使用同源相对路径：前端和后端部署在同一端口时自动工作（VPS Nginx 反向代理 / 本地 ServeStatic）
// 如果前后端分离部署，构建时传 VITE_API_URL 指定绝对地址
const BASE_URL = ((import.meta as any).env?.VITE_API_URL || '') + '/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('fb_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('fb_token');
      localStorage.removeItem('fb_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
