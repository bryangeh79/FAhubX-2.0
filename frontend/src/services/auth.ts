import api from './api';

export interface LoginResponse {
  data: {
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      email: string;
      username?: string;
      role?: string;
    };
  };
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>('/auth/login', { email, password });
    return response.data;
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } finally {
      localStorage.removeItem('fb_token');
      localStorage.removeItem('fb_user');
    }
  },

  async getProfile() {
    const response = await api.get('/auth/profile');
    return response.data;
  },
};
