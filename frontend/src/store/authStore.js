import { create } from 'zustand';

const storedToken = window.localStorage.getItem('sop_token');
const storedUser = window.localStorage.getItem('sop_user');

export const useAuthStore = create((set) => ({
  token: storedToken || null,
  user: storedUser ? JSON.parse(storedUser) : null,
  setAuth: (token, user) => {
    window.localStorage.setItem('sop_token', token || '');
    window.localStorage.setItem('sop_user', user ? JSON.stringify(user) : '');
    set({ token, user });
  },
  logout: () => {
    window.localStorage.removeItem('sop_token');
    window.localStorage.removeItem('sop_user');
    set({ token: null, user: null });
  },
}));


