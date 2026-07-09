import { create } from 'zustand';
import api from '@/lib/api';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'student' | 'shop' | 'agent' | 'admin';
  avatar?: string;
  phone?: string;
  hostel?: string;
  room_number?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || 'null') : null,
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  loading: true,

  setAuth: (user, token) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    set({ user, token, loading: false });
  },

  logout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    set({ user: null, token: null, loading: false });
  },

  loadUser: async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        set({ loading: false });
        return;
      }
      const { data } = await api.get('/auth/me');
      localStorage.setItem('user', JSON.stringify(data.user));
      set({ user: data.user, loading: false });
    } catch (err: any) {
      console.warn('Failed to validate session:', err);
      // Only clear credentials if the API responds with an explicit 401 or 403 authorization error.
      // Other network or server-side issues (downtime, cold boot) should keep the local session active.
      if (err.response && (err.response.status === 401 || err.response.status === 403)) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        set({ user: null, token: null, loading: false });
      } else {
        set({ loading: false });
      }
    }
  },
}));
