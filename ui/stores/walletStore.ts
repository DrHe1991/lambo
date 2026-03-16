import { create } from 'zustand';
import {
  api,
  CryptoBalance,
  CryptoDeposit,
  CryptoWithdrawal,
  WithdrawalRequest,
} from '../api/client';

interface WalletState {
  depositAddress: string | null;
  depositChain: string;
  cryptoBalances: CryptoBalance[];
  deposits: CryptoDeposit[];
  withdrawals: CryptoWithdrawal[];
  isLoadingAddress: boolean;
  isLoadingBalance: boolean;
  isLoadingDeposits: boolean;
  isLoadingWithdrawals: boolean;
  isSubmitting: boolean;
  addressError: string | null;
  error: string | null;

  // Actions
  fetchDepositAddress: (userId: number, chain?: string) => Promise<void>;
  fetchCryptoBalance: (userId: number) => Promise<void>;
  fetchDeposits: (userId: number) => Promise<void>;
  fetchWithdrawals: (userId: number) => Promise<void>;
  requestWithdrawal: (userId: number, data: WithdrawalRequest) => Promise<CryptoWithdrawal>;
  clearError: () => void;
  reset: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  depositAddress: null,
  depositChain: 'tron',
  cryptoBalances: [],
  deposits: [],
  withdrawals: [],
  isLoadingAddress: false,
  isLoadingBalance: false,
  isLoadingDeposits: false,
  isLoadingWithdrawals: false,
  isSubmitting: false,
  addressError: null,
  error: null,

  fetchDepositAddress: async (userId: number, chain = 'tron') => {
    set({ isLoadingAddress: true, addressError: null });
    try {
      const result = await api.getDepositAddress(userId, chain);
      set({
        depositAddress: result.address,
        depositChain: result.chain,
        isLoadingAddress: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get deposit address';
      set({ addressError: message, isLoadingAddress: false });
      throw error;
    }
  },

  fetchCryptoBalance: async (userId: number) => {
    set({ isLoadingBalance: true });
    try {
      const result = await api.getCryptoBalance(userId);
      set({ cryptoBalances: result.balances, isLoadingBalance: false });
    } catch (error) {
      set({ isLoadingBalance: false });
      throw error;
    }
  },

  fetchDeposits: async (userId: number) => {
    set({ isLoadingDeposits: true });
    try {
      const result = await api.getCryptoDeposits(userId);
      set({ deposits: result.deposits, isLoadingDeposits: false });
    } catch (error) {
      set({ isLoadingDeposits: false });
      throw error;
    }
  },

  fetchWithdrawals: async (userId: number) => {
    set({ isLoadingWithdrawals: true });
    try {
      const result = await api.getCryptoWithdrawals(userId);
      set({ withdrawals: result.withdrawals, isLoadingWithdrawals: false });
    } catch (error) {
      set({ isLoadingWithdrawals: false });
      throw error;
    }
  },

  requestWithdrawal: async (userId: number, data: WithdrawalRequest) => {
    set({ isSubmitting: true, error: null });
    try {
      const withdrawal = await api.requestWithdrawal(userId, data);
      set((state) => ({
        withdrawals: [withdrawal, ...state.withdrawals],
        isSubmitting: false,
      }));
      return withdrawal;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create withdrawal';
      set({ error: message, isSubmitting: false });
      throw error;
    }
  },

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      depositAddress: null,
      depositChain: 'tron',
      cryptoBalances: [],
      deposits: [],
      withdrawals: [],
      isLoadingAddress: false,
      isLoadingBalance: false,
      isLoadingDeposits: false,
      isLoadingWithdrawals: false,
      isSubmitting: false,
      addressError: null,
      error: null,
    }),
}));
