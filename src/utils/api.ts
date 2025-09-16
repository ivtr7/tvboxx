import axios from 'axios';

// Configuração base da API
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor para adicionar token de autenticação
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para tratar respostas e erros de autenticação
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Token inválido ou expirado
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_data');
      // Redirecionar para login se necessário
      if (window.location.pathname.includes('/admin')) {
        window.location.href = '/admin/login';
      }
    }
    return Promise.reject(error);
  }
);

// Tipos de dados
export interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'user';
  tenant_id?: string;
}

export interface Device {
  id: string;
  name: string;
  location?: string;
  status: 'online' | 'offline' | 'maintenance';
  last_seen?: string;
  ip_address?: string;
  mac_address?: string;
  device_info?: any;
}

export interface Content {
  id: number;
  title: string;
  description?: string;
  type: 'video' | 'image' | 'audio' | 'text';
  file_path?: string;
  file_size?: number;
  duration?: number;
  active: boolean;
}





// Funções de dispositivos
export const devicesAPI = {
  getAll: async (): Promise<Device[]> => {
    const response = await api.get('/devices');
    return response.data;
  },
  
  getById: async (id: string): Promise<Device> => {
    const response = await api.get(`/devices/${id}`);
    return response.data;
  },
  
  create: async (device: Partial<Device>): Promise<Device> => {
    const response = await api.post('/devices', device);
    return response.data;
  },
  
  update: async (id: string, device: Partial<Device>): Promise<Device> => {
    const response = await api.put(`/devices/${id}`, device);
    return response.data;
  },
  
  delete: async (id: string): Promise<void> => {
    await api.delete(`/devices/${id}`);
  },
  
  sendCommand: async (deviceId: string, command: any) => {
    const response = await api.post(`/devices/${deviceId}/command`, command);
    return response.data;
  },
};

// Funções de conteúdo
export const contentAPI = {
  getAll: async (): Promise<Content[]> => {
    const response = await api.get('/content');
    return response.data;
  },
  
  getById: async (id: number): Promise<Content> => {
    const response = await api.get(`/content/${id}`);
    return response.data;
  },
  
  upload: async (file: File, metadata: Partial<Content>): Promise<Content> => {
    const formData = new FormData();
    formData.append('file', file);
    Object.entries(metadata).forEach(([key, value]) => {
      if (value !== undefined) {
        formData.append(key, String(value));
      }
    });
    
    const response = await api.post('/content/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  
  update: async (id: number, content: Partial<Content>): Promise<Content> => {
    const response = await api.put(`/content/${id}`, content);
    return response.data;
  },
  
  delete: async (id: number): Promise<void> => {
    await api.delete(`/content/${id}`);
  },
};

// Funções de autenticação
export const authAPI = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    if (response.data.token) {
      localStorage.setItem('auth_token', response.data.token);
      localStorage.setItem('user_data', JSON.stringify(response.data.user));
    }
    return response.data;
  },
  
  logout: async () => {
    await api.post('/auth/logout');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
  },
  
  verify: async () => {
    const response = await api.get('/auth/verify');
    return response.data;
  },
  
  getCurrentUser: () => {
    const userData = localStorage.getItem('user_data');
    return userData ? JSON.parse(userData) : null;
  },
  
  isAuthenticated: () => {
    return !!localStorage.getItem('auth_token');
  }
};

// Funções do sistema
export const systemAPI = {
  getStatus: async () => {
    const response = await api.get('/system/status');
    return response.data;
  },
  
  getLogs: async (limit = 100) => {
    const response = await api.get(`/system/logs?limit=${limit}`);
    return response.data;
  },
};

export default api;