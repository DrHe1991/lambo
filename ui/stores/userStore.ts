import { create } from 'zustand';
import { api, type ApiUser, type ApiLedgerEntry, type LinkWalletPayload } from '../api/client';
import { runPrivyLogout } from '../lib/privy';

interface UserState {
  currentUser: ApiUser | null;
  availableUsers: ApiUser[];
  isLoggedIn: boolean;
  isLoading: boolean;
  ledgerEntries: ApiLedgerEntry[];
  needsOnboarding: boolean;

  setCurrentUser: (user: ApiUser | null) => void;
  fetchUsers: () => Promise<void>;
  logout: () => void;
  fetchLedger: (userId?: number) => Promise<void>;
  loadFromStorage: () => Promise<void>;

  // Privy first-time link (called after Privy login completes)
  linkPrivyWallet: (payload: LinkWalletPayload) => Promise<ApiUser>;

  // Legacy local-JWT login (kept for dev quick-login + dev Google flow)
  loginWithGoogle: (idToken: string) => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;

  // --- Deprecated compat shims (the SAT balance is gone; on-chain USDC is the new truth) ---
  availableBalance: number;
  change24h: number;
  fetchBalance: (userId?: number) => Promise<void>;
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

  logout: () => {
    // Drop Privy's session FIRST. Without this, the still-authenticated Privy
    // session would re-link the wallet on the next LoginPage render and you'd
    // be re-logged-in immediately. We don't await this — clearing local state
    // is what flips the UI to the login screen, and runPrivyLogout resolves
    // shortly after.
    void runPrivyLogout();

    const refreshToken = localStorage.getItem('bitlink_refresh_token');
    if (refreshToken) api.authLogout(refreshToken).catch(() => {});

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
      ledgerEntries: [],
      needsOnboarding: false,
    });
  },

  fetchLedger: async () => {
    try {
      const entries = await api.getMyLedger();
      set({ ledgerEntries: entries });
    } catch (error) {
      console.error('Failed to fetch ledger:', error);
    }
  },

  loadFromStorage: async () => {
    void get().fetchUsers();

    const accessToken = localStorage.getItem('bitlink_access_token');
    const refreshToken = localStorage.getItem('bitlink_refresh_token');
    if (!accessToken && !refreshToken) return;

    set({ isLoading: true });
    try {
      const user = await api.getMe();
      localStorage.setItem('bitlink_user_id', String(user.id));
      localStorage.setItem('bitlink_logged_in', 'true');
      set({ currentUser: user, isLoggedIn: true, isLoading: false });
    } catch {
      clearTokens();
      set({ isLoading: false });
    }
  },

  linkPrivyWallet: async (payload) => {
    set({ isLoading: true });
    try {
      const result = await api.linkWallet(payload);
      const user = await api.getMe().catch(() =>
        api.getUser(result.user_id).catch(() => null),
      );
      const finalUser: ApiUser =
        user ?? {
          id: result.user_id,
          name: payload.name ?? result.handle,
          handle: result.handle,
          avatar: payload.avatar ?? null,
          embedded_wallet_address: result.embedded_wallet_address,
        };
      localStorage.setItem('bitlink_user_id', String(finalUser.id));
      localStorage.setItem('bitlink_logged_in', 'true');
      set({
        currentUser: finalUser,
        isLoggedIn: true,
        needsOnboarding: result.is_new && !payload.handle,
        isLoading: false,
      });
      return finalUser;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  loginWithGoogle: async (idToken) => {
    set({ isLoading: true });
    try {
      const result = await api.googleLogin(idToken);
      storeTokens(result.access_token, result.refresh_token);
      const user = await api.getMe();
      localStorage.setItem('bitlink_user_id', String(user.id));
      localStorage.setItem('bitlink_logged_in', 'true');
      set({
        currentUser: user,
        isLoggedIn: true,
        needsOnboarding: result.needs_onboarding,
        isLoading: false,
      });
    } catch (error) {
      console.error('Google login failed:', error);
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

  // --- Deprecated compat shims ---
  availableBalance: 0,
  change24h: 0,
  fetchBalance: async () => {},
}));
