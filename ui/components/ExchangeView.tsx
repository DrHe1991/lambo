import React, { useState, useEffect, useCallback } from 'react';
import { useUserStore } from '../stores';
import { useWalletStore } from '../stores/walletStore';

interface ExchangeViewProps {
  onBack: () => void;
}

export const ExchangeView: React.FC<ExchangeViewProps> = ({ onBack }) => {
  const { currentUser } = useUserStore();
  const {
    btcPrice,
    exchangeQuota,
    exchangePreview,
    stableBalance,
    satBalance,
    isFirstExchangeEligible,
    isLoadingExchange,
    isConfirmingExchange,
    error,
    fetchBtcPrice,
    fetchExchangeQuota,
    fetchUserBalances,
    createExchangePreview,
    confirmExchange,
    clearExchangePreview,
    clearError,
    fetchCryptoBalance,
  } = useWalletStore();

  const [direction, setDirection] = useState<'buy_sat' | 'sell_sat'>('buy_sat');
  const [amount, setAmount] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (currentUser?.id) {
      fetchBtcPrice();
      fetchExchangeQuota();
      fetchUserBalances(currentUser.id);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (exchangePreview && exchangePreview.expires_in_seconds > 0) {
      setCountdown(exchangePreview.expires_in_seconds);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            clearExchangePreview();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [exchangePreview]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const handleCreatePreview = useCallback(async () => {
    if (!currentUser?.id || !amount) return;

    clearError();
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    const amountInUnits = direction === 'buy_sat'
      ? Math.floor(parsedAmount * 1_000_000)
      : Math.floor(parsedAmount);

    try {
      await createExchangePreview(currentUser.id, amountInUnits, direction);
    } catch (e) {
      // Error handled in store
    }
  }, [currentUser?.id, amount, direction, createExchangePreview, clearError]);

  const handleConfirm = useCallback(async () => {
    if (!currentUser?.id || !exchangePreview) return;

    try {
      await confirmExchange(currentUser.id, exchangePreview.preview_id);
      setSuccess(true);
      setAmount('');
      fetchUserBalances(currentUser.id);
      fetchCryptoBalance(currentUser.id);
      fetchExchangeQuota();
    } catch (e) {
      // Error handled in store
    }
  }, [currentUser?.id, exchangePreview, confirmExchange, fetchUserBalances, fetchCryptoBalance, fetchExchangeQuota]);

  const handleMaxClick = () => {
    if (direction === 'buy_sat') {
      setAmount((stableBalance / 1_000_000).toFixed(2));
    } else {
      setAmount(satBalance.toString());
    }
  };

  const formatSat = (sat: number): string => {
    return sat.toLocaleString();
  };

  const formatUsd = (usdt6: number): string => {
    return (usdt6 / 1_000_000).toFixed(2);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
      <div className="min-h-screen">
        {/* Header */}
        <div className="sticky top-0 bg-black/95 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
          <button onClick={onBack} className="text-orange-500 font-medium">
            Back
          </button>
          <h1 className="text-white font-semibold">Exchange</h1>
          <div className="w-12" />
        </div>

        <div className="p-4 space-y-6">
          {/* Direction Toggle */}
          <div className="flex bg-zinc-900 rounded-lg p-1">
            <button
              onClick={() => { setDirection('buy_sat'); clearExchangePreview(); setAmount(''); }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
                direction === 'buy_sat'
                  ? 'bg-orange-500 text-white'
                  : 'text-zinc-400'
              }`}
            >
              USDT → sat
            </button>
            <button
              onClick={() => { setDirection('sell_sat'); clearExchangePreview(); setAmount(''); }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
                direction === 'sell_sat'
                  ? 'bg-orange-500 text-white'
                  : 'text-zinc-400'
              }`}
            >
              sat → USDT
            </button>
          </div>

          {/* Balance Display */}
          <div className="bg-zinc-900 rounded-lg p-4">
            <div className="text-sm text-zinc-400 mb-1">
              {direction === 'buy_sat' ? 'USDT Balance' : 'Sat Balance'}
            </div>
            <div className="text-xl font-semibold text-white">
              {direction === 'buy_sat'
                ? `$${formatUsd(stableBalance)} USDT`
                : `${formatSat(satBalance)} sat`
              }
            </div>
          </div>

          {/* Amount Input */}
          <div className="bg-zinc-900 rounded-lg p-4">
            <label className="text-sm text-zinc-400 block mb-2">
              Amount ({direction === 'buy_sat' ? 'USDT' : 'sat'})
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); clearExchangePreview(); }}
                placeholder={direction === 'buy_sat' ? '0.00' : '0'}
                className="flex-1 bg-zinc-800 text-white rounded-lg px-4 py-3 text-lg outline-none focus:ring-1 focus:ring-orange-500/50"
              />
              <button
                onClick={handleMaxClick}
                className="px-4 py-3 bg-zinc-800 text-orange-500 rounded-lg text-sm font-medium"
              >
                MAX
              </button>
            </div>
          </div>

          {/* BTC Price */}
          {btcPrice && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">BTC Price</span>
              <span className="text-white">${btcPrice.toLocaleString()}</span>
            </div>
          )}

          {/* Preview Button */}
          {!exchangePreview && (
            <button
              onClick={handleCreatePreview}
              disabled={!amount || parseFloat(amount) <= 0 || isLoadingExchange}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50 transition-colors"
            >
              {isLoadingExchange ? 'Loading...' : 'Get Quote'}
            </button>
          )}

          {/* Preview Display */}
          {exchangePreview && (
            <div className="bg-zinc-900 rounded-lg p-4 space-y-3 border border-orange-500/50">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400 text-sm">Quote expires in</span>
                <span className="text-orange-500 font-mono">{countdown}s</span>
              </div>

              <div className="border-t border-zinc-800 pt-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-zinc-400">You pay</span>
                  <span className="text-white">
                    {direction === 'buy_sat'
                      ? `$${formatUsd(exchangePreview.amount_in)} USDT`
                      : `${formatSat(exchangePreview.amount_in)} sat`
                    }
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-zinc-400">Buffer fee (0.5%)</span>
                  <span className="text-zinc-500">included</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-zinc-400">You receive</span>
                  <span className="text-white font-semibold">
                    {direction === 'buy_sat'
                      ? `${formatSat(exchangePreview.amount_out)} sat`
                      : `$${formatUsd(exchangePreview.amount_out)} USDT`
                    }
                  </span>
                </div>

                {exchangePreview.bonus_sat > 0 && (
                  <div className="flex justify-between text-green-400">
                    <span>First Exchange Bonus (+10%)</span>
                    <span>+{formatSat(exchangePreview.bonus_sat)} sat</span>
                  </div>
                )}

                {exchangePreview.bonus_sat > 0 && (
                  <div className="flex justify-between border-t border-zinc-800 pt-2">
                    <span className="text-zinc-400">Total</span>
                    <span className="text-white font-bold">
                      {formatSat(exchangePreview.total_out)} sat
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={handleConfirm}
                disabled={isConfirmingExchange || countdown <= 0}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50 transition-colors"
              >
                {isConfirmingExchange ? 'Processing...' : 'Confirm Exchange'}
              </button>

              <button
                onClick={clearExchangePreview}
                className="w-full text-zinc-400 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          )}

          {/* First Exchange Bonus Banner */}
          {isFirstExchangeEligible && direction === 'buy_sat' && !exchangePreview && (
            <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎁</span>
                <div>
                  <div className="text-orange-400 font-medium text-sm">First Exchange Bonus</div>
                  <div className="text-orange-300/70 text-xs">Get +10% bonus on your first exchange (up to $5)</div>
                </div>
              </div>
            </div>
          )}

          {/* Quota Info */}
          {exchangeQuota && (
            <div className="bg-zinc-900/50 rounded-lg p-3">
              <div className="text-xs text-zinc-500">
                Platform quota: ${direction === 'buy_sat'
                  ? exchangeQuota.buy_sat.remaining_usd.toFixed(0)
                  : exchangeQuota.sell_sat.remaining_usd.toFixed(0)
                } available
              </div>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-4 text-center">
              <div className="text-green-400 font-medium">Exchange successful!</div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 text-center">
              <div className="text-red-400 text-sm">{error}</div>
              <button onClick={clearError} className="text-red-300 text-xs mt-2 underline">
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
