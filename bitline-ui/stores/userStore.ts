import { create } from 'zustand';
import { api, ApiUser, ApiLedgerEntry } from '../api/client';

interface UserState {
  currentUser: ApiUser | null;
  availableUsers: ApiUser[];
  isLoggedIn: boolean;
  isLoading: boolean;
  availableBalance: number;
  change24h: number;
  ledgerEntries: ApiLedgerEntry[];

  // Actions
  setCurrentUser: (user: ApiUser | null) => void;
  fetchUsers: () => Promise<void>;
  selectUser: (userId: number) => Promise<void>;
  createUser: (name: string, handle: string) => Promise<void>;
  logout: () => void;
  fetchBalance: (userId: number) => Promise<void>;
  fetchLedger: (userId: number) => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
  currentUser: null,
  availableUsers: [],
  isLoggedIn: false,
  isLoading: false,
  availableBalance: 0,
  change24h: 0,
  ledgerEntries: [],

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
      const [user, bal] = await Promise.all([
        api.getUser(userId),
        api.getBalance(userId),
      ]);
      localStorage.setItem('bitline_user_id', String(user.id));
      localStorage.setItem('bitline_logged_in', 'true');
      set({
        currentUser: user,
        isLoggedIn: true,
        availableBalance: bal.available_balance,
        change24h: bal.change_24h,
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
      const fullUser = await api.getUser(user.id);
      set({
        currentUser: fullUser,
        isLoggedIn: true,
        availableBalance: fullUser.available_balance ?? 0,
        change24h: 0,
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
      change24h: 0,
      ledgerEntries: [],
    });
  },

  fetchBalance: async (userId: number) => {
    try {
      const [user, bal] = await Promise.all([
        api.getUser(userId),
        api.getBalance(userId),
      ]);
      set({
        currentUser: user,
        availableBalance: bal.available_balance,
        change24h: bal.change_24h,
      });
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    }
  },

  fetchLedger: async (userId: number) => {
    try {
      const entries = await api.getLedger(userId);
      set({ ledgerEntries: entries });
    } catch (error) {
      console.error('Failed to fetch ledger:', error);
    }
  },

  loadFromStorage: async () => {
    const userId = localStorage.getItem('bitline_user_id');
    const loggedIn = localStorage.getItem('bitline_logged_in');

    get().fetchUsers();

    if (userId && loggedIn === 'true') {
      set({ isLoading: true });
      try {
        const id = parseInt(userId);
        const [user, bal] = await Promise.all([
          api.getUser(id),
          api.getBalance(id),
        ]);
        set({
          currentUser: user,
          isLoggedIn: true,
          availableBalance: bal.available_balance,
          change24h: bal.change_24h,
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
