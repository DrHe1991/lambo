import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { useWalletStore, useUserStore } from '../stores';
import { CryptoBalance } from '../api/client';

interface WithdrawViewProps {
  onBack: () => void;
}

type TokenType = 'TRX' | 'USDT';

export const WithdrawView: React.FC<WithdrawViewProps> = ({ onBack }) => {
  const { currentUser } = useUserStore();
  const {
    cryptoBalances,
    withdrawals,
    isLoadingBalance,
    isLoadingWithdrawals,
    isSubmitting,
    error,
    fetchCryptoBalance,
    fetchWithdrawals,
    requestWithdrawal,
    clearError,
  } = useWalletStore();

  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState<TokenType>('TRX');
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    if (currentUser?.id) {
      fetchCryptoBalance(currentUser.id).catch(() => {});
      fetchWithdrawals(currentUser.id).catch(() => {});
    }
  }, [currentUser?.id]);
  
  // Auto-dismiss success message
  useEffect(() => {
    if (submitSuccess) {
      const timer = setTimeout(() => setSubmitSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [submitSuccess]);
  
  const isLoading = isLoadingBalance || isLoadingWithdrawals;

  const getBalance = (symbol: string): CryptoBalance | undefined => {
    return cryptoBalances.find((b) => b.token_symbol === symbol);
  };

  const selectedBalance = getBalance(selectedToken);

  const formatBalance = (balance?: CryptoBalance) => {
    if (!balance) return '0';
    return balance.balance_formatted;
  };

  const parseAmount = (value: string): number => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) return 0;
    // Both TRX and USDT use 6 decimal places (sun/micro units)
    return Math.floor(num * 1_000_000);
  };

  const validateAddress = (address: string): boolean => {
    return address.startsWith('T') && address.length === 34;
  };

  const handleSubmit = async () => {
    setSubmitError('');
    setSubmitSuccess(false);
    clearError();

    if (!currentUser?.id) {
      setSubmitError('User not logged in');
      return;
    }

    if (!toAddress.trim()) {
      setSubmitError('Please enter a destination address');
      return;
    }

    if (!validateAddress(toAddress.trim())) {
      setSubmitError('Invalid TRON address. Must start with T and be 34 characters.');
      return;
    }

    const amountInSun = parseAmount(amount);
    if (amountInSun <= 0) {
      setSubmitError('Please enter a valid amount');
      return;
    }

    if (selectedBalance && amountInSun > selectedBalance.balance) {
      setSubmitError('Insufficient balance');
      return;
    }

    try {
      await requestWithdrawal(currentUser.id, {
        to_address: toAddress.trim(),
        amount: amountInSun,
        chain: 'tron',
        token_symbol: selectedToken,
      });
      setSubmitSuccess(true);
      setToAddress('');
      setAmount('');
      fetchCryptoBalance(currentUser.id).catch(() => {});
    } catch (err) {
      setSubmitError((err as Error).message || 'Withdrawal failed');
    }
  };

  const handleRefresh = () => {
    if (currentUser?.id) {
      fetchCryptoBalance(currentUser.id).catch(() => {});
      fetchWithdrawals(currentUser.id).catch(() => {});
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'pending':
      case 'processing':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-zinc-500" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/95 backdrop-blur-xl border-b border-zinc-800">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={onBack} className="p-2 -ml-2 text-zinc-400 hover:text-white">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold text-white">Withdraw</h1>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 -mr-2 text-zinc-400 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* Withdrawal Form */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          {/* Token Selection */}
          <div>
            <label className="text-zinc-500 text-sm mb-2 block">Token</label>
            <div className="flex gap-2">
              {(['TRX', 'USDT'] as TokenType[]).map((token) => {
                const balance = getBalance(token);
                return (
                  <button
                    key={token}
                    onClick={() => setSelectedToken(token)}
                    className={`flex-1 p-3 rounded-xl border transition-colors ${
                      selectedToken === token
                        ? 'bg-orange-500/10 border-orange-500 text-orange-500'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    <div className="font-bold">{token}</div>
                    <div className="text-xs opacity-70">
                      {balance ? balance.balance_formatted : '0'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Address Input */}
          <div>
            <label className="text-zinc-500 text-sm mb-2 block">To Address</label>
            <input
              type="text"
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              placeholder="TRON address (starts with T)"
              className="w-full bg-zinc-800 border border-zinc-700 text-white py-3 px-4 rounded-xl font-mono text-sm focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* Amount Input */}
          <div>
            <label className="text-zinc-500 text-sm mb-2 block">Amount</label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                step="0.000001"
                min="0"
                className="w-full bg-zinc-800 border border-zinc-700 text-white py-3 px-4 pr-20 rounded-xl text-lg focus:border-orange-500 focus:outline-none"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 font-medium">
                {selectedToken}
              </div>
            </div>
            <div className="flex justify-between mt-2 text-xs">
              <span className="text-zinc-500">
                Available: {formatBalance(selectedBalance)}
              </span>
              {selectedBalance && selectedBalance.balance > 0 && (
                <button
                  onClick={() => {
                    const maxAmount = selectedBalance.balance / 1_000_000;
                    setAmount(maxAmount.toString());
                  }}
                  className="text-orange-500 hover:text-orange-400"
                >
                  MAX
                </button>
              )}
            </div>
          </div>

          {/* Error Display */}
          {(submitError || error) && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-red-400 text-sm">{submitError || error}</p>
            </div>
          )}

          {/* Success Display */}
          {submitSuccess && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
              <p className="text-green-400 text-sm">Withdrawal request submitted!</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !toAddress || !amount}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Send className="w-5 h-5" />
                <span>Withdraw</span>
              </>
            )}
          </button>

          {/* Fee Notice */}
          <p className="text-zinc-600 text-xs text-center">
            Network fees will be deducted from the withdrawal amount
          </p>
        </div>

        {/* Recent Withdrawals */}
        <div>
          <h2 className="text-white font-bold mb-3">Recent Withdrawals</h2>

          {withdrawals.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
              <Send className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
              <p className="text-zinc-500 text-sm">No withdrawals yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {withdrawals.map((withdrawal) => (
                <div
                  key={withdrawal.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(withdrawal.status)}
                      <span className="text-white font-medium">
                        -{withdrawal.amount_formatted}
                      </span>
                    </div>
                    <span className="text-zinc-500 text-xs">
                      {formatDate(withdrawal.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 text-xs font-mono">
                      To: {withdrawal.to_address.slice(0, 8)}...{withdrawal.to_address.slice(-6)}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        withdrawal.status === 'completed'
                          ? 'bg-green-500/10 text-green-500'
                          : withdrawal.status === 'failed'
                          ? 'bg-red-500/10 text-red-500'
                          : 'bg-yellow-500/10 text-yellow-500'
                      }`}
                    >
                      {withdrawal.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
