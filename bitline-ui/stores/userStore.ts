import { create } from 'zustand';
import { api, ApiUser } from '../api/client';

interface UserState {
  currentUser: ApiUser | null;
  availableUsers: ApiUser[];
  isLoggedIn: boolean;
  isLoading: boolean;
  availableBalance: number;
  lockedBalance: number;
  loginStreak: number;

  // Actions
  setCurrentUser: (user: ApiUser | null) => void;
  fetchUsers: () => Promise<void>;
  selectUser: (userId: number) => Promise<void>;
  createUser: (name: string, handle: string) => Promise<void>;
  logout: () => void;
  updateBalance: (available: number, locked: number) => void;
  loadFromStorage: () => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
  currentUser: null,
  availableUsers: [],
  isLoggedIn: false,
  isLoading: false,
  availableBalance: 1000,
  lockedBalance: 0,
  loginStreak: 1,

  setCurrentUser: (user) => set({ currentUser: user, isLoggedIn: !!user }),

  fetchUsers: async () => {
    set({ isLoading: true });
    try {
      const users = await api.listUsers();
      set({ availableUsers: users, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch users:', error);
      set({ isLoading: false });
    }
  },

  selectUser: async (userId: number) => {
    set({ isLoading: true });
    try {
      const user = await api.getUser(userId);
      localStorage.setItem('bitline_user_id', String(user.id));
      localStorage.setItem('bitline_logged_in', 'true');
      set({
        currentUser: user,
        isLoggedIn: true,
        availableBalance: 1000,
        lockedBalance: 0,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to select user:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  createUser: async (name, handle) => {
    set({ isLoading: true });
    try {
      const user = await api.createUser({ name, handle });
      localStorage.setItem('bitline_user_id', String(user.id));
      localStorage.setItem('bitline_logged_in', 'true');
      set({
        currentUser: user,
        isLoggedIn: true,
        availableBalance: 1000,
        lockedBalance: 0,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to create user:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('bitline_user_id');
    localStorage.removeItem('bitline_logged_in');
    set({
      currentUser: null,
      isLoggedIn: false,
      availableBalance: 0,
      lockedBalance: 0,
    });
  },

  updateBalance: (available, locked) => set({ availableBalance: available, lockedBalance: locked }),

  loadFromStorage: async () => {
    const userId = localStorage.getItem('bitline_user_id');
    const loggedIn = localStorage.getItem('bitline_logged_in');

    // Always fetch available users for the picker
    get().fetchUsers();

    if (userId && loggedIn === 'true') {
      set({ isLoading: true });
      try {
        const user = await api.getUser(parseInt(userId));
        set({
          currentUser: user,
          isLoggedIn: true,
          availableBalance: 1000,
          lockedBalance: 0,
          isLoading: false,
        });
      } catch (error) {
        console.error('Failed to load user:', error);
        localStorage.removeItem('bitline_user_id');
        localStorage.removeItem('bitline_logged_in');
        set({ isLoading: false });
      }
    }
  },
}));
