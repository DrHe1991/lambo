import React, { useState, useEffect, useCallback } from 'react';
import { useUserStore } from '../stores';
import { useWalletStore } from '../stores/walletStore';
import { Header } from './ui/Header';
import { Toggle } from './ui/Toggle';
import { Button } from './ui/Button';
import { ErrorMessage } from './ui/ErrorMessage';

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
      setTimeout(() => onBack(), 800);
    } catch (e) {
      // Error handled in store
    }
  }, [currentUser?.id, exchangePreview, confirmExchange, onBack]);

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
    <div className="fixed inset-0 z-[60] bg-black overflow-y-auto sub-view">
      <div className="min-h-screen">
        <Header title="Exchange" onBack={onBack} />

        <div className="px-4 py-6 space-y-6">
          {/* Direction Toggle */}
          <Toggle
            options={[
              { value: 'buy_sat', label: 'USDT → sat' },
              { value: 'sell_sat', label: 'sat → USDT' },
            ]}
            value={direction}
            onChange={(val) => { setDirection(val as 'buy_sat' | 'sell_sat'); clearExchangePreview(); setAmount(''); }}
          />

          {/* Balance Display */}
          <div className="bg-stone-900 rounded-xl p-4">
            <div className="text-sm text-stone-400 mb-1">
              {direction === 'buy_sat' ? 'USDT Balance' : 'Sat Balance'}
            </div>
            <div className="text-xl font-bold text-white tabular-nums">
              {direction === 'buy_sat'
                ? `$${formatUsd(stableBalance)} USDT`
                : `${formatSat(satBalance)} sat`
              }
            </div>
          </div>

          {/* Amount Input */}
          <div className="bg-stone-900 rounded-xl p-4">
            <label className="text-sm text-stone-400 block mb-2">
              Amount ({direction === 'buy_sat' ? 'USDT' : 'sat'})
            </label>
            <div className="flex items-center gap-2 w-full">
              <input
                type="number"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); clearExchangePreview(); }}
                placeholder={direction === 'buy_sat' ? '0.00' : '0'}
                className="min-w-0 flex-1 bg-stone-800 text-white rounded-xl px-4 py-3 text-lg outline-none transition-colors focus:border-orange-500 border border-stone-700"
              />
              <button
                onClick={handleMaxClick}
                className="shrink-0 px-4 py-3 bg-stone-800 text-orange-500 rounded-xl text-sm font-medium border border-stone-700 hover:bg-stone-700 transition-colors"
              >
                MAX
              </button>
            </div>
          </div>

          {/* BTC Price */}
          {btcPrice && (
            <div className="flex justify-between text-sm">
              <span className="text-stone-400">BTC Price</span>
              <span className="text-white tabular-nums">${btcPrice.toLocaleString()}</span>
            </div>
          )}

          {/* Preview Button */}
          {!exchangePreview && (
            <Button
              fullWidth
              size="lg"
              disabled={!amount || parseFloat(amount) <= 0}
              loading={isLoadingExchange}
              onClick={handleCreatePreview}
            >
              Get Quote
            </Button>
          )}

          {/* Preview Display */}
          {exchangePreview && (
            <div className="bg-stone-900 rounded-xl p-4 space-y-3 border border-orange-500/50">
              <div className="flex justify-between items-center">
                <span className="text-stone-400 text-sm">Quote expires in</span>
                <span className="text-orange-500 font-mono">{countdown}s</span>
              </div>

              <div className="border-t border-stone-800 pt-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-stone-400">You pay</span>
                  <span className="text-white tabular-nums">
                    {direction === 'buy_sat'
                      ? `$${formatUsd(exchangePreview.amount_in)} USDT`
                      : `${formatSat(exchangePreview.amount_in)} sat`
                    }
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-stone-400">Buffer fee (0.5%)</span>
                  <span className="text-stone-500">included</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-stone-400">You receive</span>
                  <span className="text-white font-bold tabular-nums">
                    {direction === 'buy_sat'
                      ? `${formatSat(exchangePreview.amount_out)} sat`
                      : `$${formatUsd(exchangePreview.amount_out)} USDT`
                    }
                  </span>
                </div>

                {exchangePreview.bonus_sat > 0 && (
                  <div className="flex justify-between text-green-400">
                    <span>First Exchange Bonus (+10%)</span>
                    <span className="tabular-nums">+{formatSat(exchangePreview.bonus_sat)} sat</span>
                  </div>
                )}

                {exchangePreview.bonus_sat > 0 && (
                  <div className="flex justify-between border-t border-stone-800 pt-2">
                    <span className="text-stone-400">Total</span>
                    <span className="text-white font-bold tabular-nums">
                      {formatSat(exchangePreview.total_out)} sat
                    </span>
                  </div>
                )}
              </div>

              <Button
                fullWidth
                size="lg"
                loading={isConfirmingExchange}
                disabled={countdown <= 0}
                onClick={handleConfirm}
              >
                Confirm Exchange
              </Button>

              <button
                onClick={clearExchangePreview}
                className="w-full text-stone-400 hover:text-stone-300 py-2 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* First Exchange Bonus Banner */}
          {isFirstExchangeEligible && direction === 'buy_sat' && !exchangePreview && (
            <div className="bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/40 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center">
                  <span className="text-2xl">🎁</span>
                </div>
                <div>
                  <div className="text-orange-500 font-bold text-sm">First Exchange Bonus</div>
                  <div className="text-orange-600 dark:text-orange-300 text-xs">Get +10% bonus on your first exchange (up to $5)</div>
                </div>
              </div>
            </div>
          )}

          {/* Quota Info */}
          {exchangeQuota && (
            <div className="bg-stone-900/50 rounded-xl p-3">
              <div className="text-xs text-stone-500">
                Platform quota: ${direction === 'buy_sat'
                  ? exchangeQuota.buy_sat.remaining_usd.toFixed(0)
                  : exchangeQuota.sell_sat.remaining_usd.toFixed(0)
                } available
              </div>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-900/30 border border-green-500/50 rounded-xl p-4 text-center">
              <div className="text-green-400 font-medium">Exchange successful!</div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <ErrorMessage message={error} onDismiss={clearError} />
          )}
        </div>
      </div>
    </div>
  );
};
