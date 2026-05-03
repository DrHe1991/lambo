/**
 * walletStore — non-custodial USDC on Base.
 *
 * Single source of truth for the user's wallet state inside the app:
 *   - address: from Privy embedded wallet (set on link)
 *   - usdcBalanceMicro: live read from the chain via viem
 *   - tipHistory: read from /tip/history (server-mirrored chain events)
 *
 * No deposits, withdrawals, exchanges, claims, or SAT — those concepts are gone.
 */
import { create } from 'zustand';
import type { Address } from 'viem';
import { api, type TipHistoryItem } from '../api/client';
import { getUsdcBalance } from '../lib/chain';

interface WalletState {
  address: Address | null;
  usdcBalanceMicro: bigint;
  delegatedActionsEnabled: boolean;

  isRefreshingBalance: boolean;
  isLoadingHistory: boolean;
  error: string | null;

  tipHistory: TipHistoryItem[];

  setAddress: (addr: Address | null, delegated?: boolean) => void;
  refreshBalance: () => Promise<void>;
  fetchTipHistory: () => Promise<void>;
  reset: () => void;

  // --- Deprecated compat shims (kept so legacy App.tsx compiles during cleanup) ---
  // Read these from `usdcBalanceMicro` instead. They will return 0/empty.
  cryptoBalances: never[];
  stableBalance: number;
  satBalance: number;
  unclaimedSat: number;
  isFirstExchangeEligible: boolean;
  fetchCryptoBalance: (userId?: number) => Promise<void>;
  fetchUserBalances: (userId?: number) => Promise<void>;
  claimSat: (userId?: number) => Promise<{ claimed: number; message: string }>;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  address: null,
  usdcBalanceMicro: 0n,
  delegatedActionsEnabled: false,

  isRefreshingBalance: false,
  isLoadingHistory: false,
  error: null,

  tipHistory: [],

  setAddress: (addr, delegated = false) => {
    set({
      address: addr,
      delegatedActionsEnabled: delegated,
      usdcBalanceMicro: 0n,
    });
    if (addr) {
      void get().refreshBalance();
    }
  },

  refreshBalance: async () => {
    const addr = get().address;
    if (!addr) return;
    set({ isRefreshingBalance: true, error: null });
    try {
      const balance = await getUsdcBalance(addr);
      set({ usdcBalanceMicro: balance, isRefreshingBalance: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to read balance';
      set({ error: message, isRefreshingBalance: false });
    }
  },

  fetchTipHistory: async () => {
    set({ isLoadingHistory: true, error: null });
    try {
      const history = await api.getTipHistory();
      set({ tipHistory: history, isLoadingHistory: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load tip history';
      set({ error: message, isLoadingHistory: false });
    }
  },

  reset: () =>
    set({
      address: null,
      usdcBalanceMicro: 0n,
      delegatedActionsEnabled: false,
      isRefreshingBalance: false,
      isLoadingHistory: false,
      error: null,
      tipHistory: [],
    }),

  // --- Deprecated compat shims ---
  cryptoBalances: [] as never[],
  stableBalance: 0,
  satBalance: 0,
  unclaimedSat: 0,
  isFirstExchangeEligible: false,
  fetchCryptoBalance: async () => {},
  fetchUserBalances: async () => {},
  claimSat: async () => ({ claimed: 0, message: 'SAT economy removed in compliance pivot' }),
}));
