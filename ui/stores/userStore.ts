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
  needsOnboarding: boolean;

  // Actions
  setCurrentUser: (user: ApiUser | null) => void;
  fetchUsers: () => Promise<void>;
  selectUser: (userId: number) => Promise<void>;
  createUser: (name: string, handle: string) => Promise<void>;
  logout: () => void;
  fetchBalance: (userId: number) => Promise<void>;
  fetchLedger: (userId: number) => Promise<void>;
  loadFromStorage: () => Promise<void>;

  // Auth actions
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginWithWallet: (address: string, chain: string, signature: string, nonce: string) => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
}

function storeTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('bitlink_access_token', accessToken);
  localStorage.setItem('bitlink_refresh_token', refreshToken);
}

function clearTokens() {
  localStorage.removeItem('bitlink_access_token');
  localStorage.removeItem('bitlink_refresh_token');
  localStorage.removeItem('bitlink_user_id');
  localStorage.removeItem('bitlink_logged_in');
}

export const useUserStore = create<UserState>((set, get) => ({
  currentUser: null,
  availableUsers: [],
  isLoggedIn: false,
  isLoading: false,
  availableBalance: 0,
  change24h: 0,
  ledgerEntries: [],
  needsOnboarding: false,

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
      localStorage.setItem('bitlink_user_id', String(user.id));
      localStorage.setItem('bitlink_logged_in', 'true');
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
      localStorage.setItem('bitlink_user_id', String(user.id));
      localStorage.setItem('bitlink_logged_in', 'true');
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
    const refreshToken = localStorage.getItem('bitlink_refresh_token');
    if (refreshToken) {
      api.authLogout(refreshToken).catch(() => {});
    }
    import('@capacitor/core')
      .then(({ Capacitor }) => {
        if (!Capacitor.isNativePlatform()) return;
        return import('@capawesome/capacitor-google-sign-in')
          .then(({ GoogleSignIn }) => GoogleSignIn.signOut())
          .catch(() => {});
      })
      .catch(() => {});
    clearTokens();
    set({
      currentUser: null,
      isLoggedIn: false,
      availableBalance: 0,
      change24h: 0,
      ledgerEntries: [],
      needsOnboarding: false,
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
    get().fetchUsers();

    // Try JWT-based auth first
    const accessToken = localStorage.getItem('bitlink_access_token');
    const refreshToken = localStorage.getItem('bitlink_refresh_token');

    if (accessToken || refreshToken) {
      set({ isLoading: true });
      try {
        // If access token exists, try /me. If it fails, the client auto-refreshes.
        const user = await api.getMe();
        const bal = await api.getBalance(user.id);
        localStorage.setItem('bitlink_user_id', String(user.id));
        localStorage.setItem('bitlink_logged_in', 'true');
        set({
          currentUser: user,
          isLoggedIn: true,
          availableBalance: bal.available_balance,
          change24h: bal.change_24h,
          isLoading: false,
        });
        return;
      } catch {
        // Token invalid and refresh failed — clear and fall through
        clearTokens();
        set({ isLoading: false });
      }
    }

    // Legacy: load from user_id in localStorage (dev mode)
    const userId = localStorage.getItem('bitlink_user_id');
    const loggedIn = localStorage.getItem('bitlink_logged_in');

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
        clearTokens();
        set({ isLoading: false });
      }
    }
  },

  // Auth actions
  loginWithGoogle: async (idToken: string) => {
    set({ isLoading: true });
    try {
      const result = await api.googleLogin(idToken);
      storeTokens(result.access_token, result.refresh_token);

      const user = await api.getMe();
      const bal = await api.getBalance(user.id);
      localStorage.setItem('bitlink_user_id', String(user.id));
      localStorage.setItem('bitlink_logged_in', 'true');

      set({
        currentUser: user,
        isLoggedIn: true,
        availableBalance: bal.available_balance,
        change24h: bal.change_24h,
        needsOnboarding: result.needs_onboarding,
        isLoading: false,
      });
    } catch (error) {
      console.error('Google login failed:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  loginWithWallet: async (address: string, chain: string, signature: string, nonce: string) => {
    set({ isLoading: true });
    try {
      const result = await api.web3Login({ address, chain, signature, nonce });
      storeTokens(result.access_token, result.refresh_token);

      const user = await api.getMe();
      const bal = await api.getBalance(user.id);
      localStorage.setItem('bitlink_user_id', String(user.id));
      localStorage.setItem('bitlink_logged_in', 'true');

      set({
        currentUser: user,
        isLoggedIn: true,
        availableBalance: bal.available_balance,
        change24h: bal.change_24h,
        needsOnboarding: result.needs_onboarding,
        isLoading: false,
      });
    } catch (error) {
      console.error('Wallet login failed:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  refreshAccessToken: async () => {
    const refreshToken = localStorage.getItem('bitlink_refresh_token');
    if (!refreshToken) return false;

    try {
      const result = await api.refreshTokens(refreshToken);
      storeTokens(result.access_token, result.refresh_token);
      return true;
    } catch {
      clearTokens();
      set({ currentUser: null, isLoggedIn: false });
      return false;
    }
  },
}));
