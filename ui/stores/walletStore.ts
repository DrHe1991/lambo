import { create } from 'zustand';
import {
  api,
  CryptoBalance,
  CryptoDeposit,
  CryptoWithdrawal,
  WithdrawalRequest,
  ExchangeQuota,
  ExchangePreview,
  ExchangeHistoryItem,
  ChainFee,
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

  // Exchange state
  btcPrice: number | null;
  exchangeQuota: ExchangeQuota | null;
  exchangePreview: ExchangePreview | null;
  exchangeHistory: ExchangeHistoryItem[];
  chainFees: ChainFee[];
  stableBalance: number;
  satBalance: number;
  isFirstExchangeEligible: boolean;
  isLoadingExchange: boolean;
  isConfirmingExchange: boolean;

  // Actions
  fetchDepositAddress: (userId: number, chain?: string) => Promise<void>;
  fetchCryptoBalance: (userId: number) => Promise<void>;
  fetchDeposits: (userId: number) => Promise<void>;
  fetchWithdrawals: (userId: number) => Promise<void>;
  requestWithdrawal: (userId: number, data: WithdrawalRequest) => Promise<CryptoWithdrawal>;
  
  // Exchange actions
  fetchBtcPrice: () => Promise<void>;
  fetchExchangeQuota: () => Promise<void>;
  fetchChainFees: () => Promise<void>;
  fetchUserBalances: (userId: number) => Promise<void>;
  createExchangePreview: (userId: number, amount: number, direction: string) => Promise<ExchangePreview>;
  confirmExchange: (userId: number, previewId: string) => Promise<void>;
  fetchExchangeHistory: (userId: number) => Promise<void>;
  clearExchangePreview: () => void;
  
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

  // Exchange state
  btcPrice: null,
  exchangeQuota: null,
  exchangePreview: null,
  exchangeHistory: [],
  chainFees: [],
  stableBalance: 0,
  satBalance: 0,
  isFirstExchangeEligible: false,
  isLoadingExchange: false,
  isConfirmingExchange: false,

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

  // Exchange actions
  fetchBtcPrice: async () => {
    try {
      const result = await api.getBtcPrice();
      set({ btcPrice: result.btc_price });
    } catch (error) {
      console.error('Failed to fetch BTC price:', error);
    }
  },

  fetchExchangeQuota: async () => {
    try {
      const result = await api.getExchangeQuota();
      set({ exchangeQuota: result });
    } catch (error) {
      console.error('Failed to fetch exchange quota:', error);
    }
  },

  fetchChainFees: async () => {
    try {
      const result = await api.getChainFees();
      set({ chainFees: result });
    } catch (error) {
      console.error('Failed to fetch chain fees:', error);
    }
  },

  fetchUserBalances: async (userId: number) => {
    try {
      const result = await api.getUserBalances(userId);
      set({
        stableBalance: result.stable_balance,
        satBalance: result.sat_balance,
        isFirstExchangeEligible: result.first_exchange_eligible,
      });
    } catch (error) {
      console.error('Failed to fetch user balances:', error);
    }
  },

  createExchangePreview: async (userId: number, amount: number, direction: string) => {
    set({ isLoadingExchange: true, error: null });
    try {
      const preview = await api.createExchangePreview(userId, amount, direction);
      set({ exchangePreview: preview, isLoadingExchange: false });
      return preview;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create preview';
      set({ error: message, isLoadingExchange: false });
      throw error;
    }
  },

  confirmExchange: async (userId: number, previewId: string) => {
    set({ isConfirmingExchange: true, error: null });
    try {
      await api.confirmExchange(userId, previewId);
      set({ exchangePreview: null, isConfirmingExchange: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to confirm exchange';
      set({ error: message, isConfirmingExchange: false });
      throw error;
    }
  },

  fetchExchangeHistory: async (userId: number) => {
    try {
      const result = await api.getExchangeHistory(userId);
      set({ exchangeHistory: result.exchanges });
    } catch (error) {
      console.error('Failed to fetch exchange history:', error);
    }
  },

  clearExchangePreview: () => set({ exchangePreview: null }),

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
      btcPrice: null,
      exchangeQuota: null,
      exchangePreview: null,
      exchangeHistory: [],
      chainFees: [],
      stableBalance: 0,
      satBalance: 0,
      isFirstExchangeEligible: false,
      isLoadingExchange: false,
      isConfirmingExchange: false,
    }),
}));
