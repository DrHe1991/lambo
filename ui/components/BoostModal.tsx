import React, { useState } from 'react';
import { X, Zap, TrendingUp, Clock } from 'lucide-react';
import { Post } from '../types';
import { api } from '../api/client';

interface BoostModalProps {
  post: Post;
  userId: number;
  userBalance: number;
  onClose: () => void;
  onSuccess: (newBalance: number) => void;
}

const BOOST_PRESETS = [
  { amount: 1000, label: '1K', description: 'Small boost' },
  { amount: 5000, label: '5K', description: 'Medium boost' },
  { amount: 10000, label: '10K', description: 'Large boost' },
  { amount: 50000, label: '50K', description: 'Maximum boost' },
];

export const BoostModal: React.FC<BoostModalProps> = ({
  post,
  userId,
  userBalance,
  onClose,
  onSuccess,
}) => {
  const [selectedAmount, setSelectedAmount] = useState(1000);
  const [customAmount, setCustomAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveAmount = customAmount ? parseInt(customAmount) || 0 : selectedAmount;
  const boostPoints = effectiveAmount / 100;
  const newMultiplier = Math.min(5.0, 1.0 + boostPoints + (post.boostRemaining ?? 0));
  const estimatedDays = Math.ceil(Math.log(0.1 / (boostPoints + (post.boostRemaining ?? 0))) / Math.log(0.7));

  const canAfford = effectiveAmount <= userBalance;
  const isValidAmount = effectiveAmount >= 1000;

  const handleBoost = async () => {
    if (!canAfford || !isValidAmount) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.boostPost(Number(post.id), userId, effectiveAmount);
      onSuccess(userBalance - result.amount_paid);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Boost failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl w-full max-w-sm border border-zinc-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Zap className="text-orange-400" size={20} />
            <span className="font-bold text-white">Boost Post</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X size={20} className="text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Post preview */}
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <p className="text-zinc-300 text-sm line-clamp-2">{post.content}</p>
          </div>

          {/* Amount selection */}
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Select amount (min 1000 sat)</label>
            <div className="grid grid-cols-4 gap-2">
              {BOOST_PRESETS.map((preset) => (
                <button
                  key={preset.amount}
                  onClick={() => {
                    setSelectedAmount(preset.amount);
                    setCustomAmount('');
                  }}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    selectedAmount === preset.amount && !customAmount
                      ? 'bg-orange-500 text-white'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom amount */}
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Or enter custom amount</label>
            <input
              type="number"
              min="1000"
              step="100"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder="1000"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Boost preview */}
          <div className="bg-gradient-to-r from-orange-500/10 to-zinc-900 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400 flex items-center gap-1">
                <TrendingUp size={14} /> Multiplier
              </span>
              <span className="text-orange-400 font-bold">{newMultiplier.toFixed(1)}x</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400 flex items-center gap-1">
                <Clock size={14} /> Duration
              </span>
              <span className="text-zinc-300">~{Math.max(1, estimatedDays)} days</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Boost points</span>
              <span className="text-zinc-300">+{boostPoints.toFixed(0)}</span>
            </div>
          </div>

          {/* Balance info */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">Your balance</span>
            <span className={canAfford ? 'text-green-400' : 'text-red-400'}>
              {userBalance.toLocaleString()} sat
            </span>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800">
          <button
            onClick={handleBoost}
            disabled={isSubmitting || !canAfford || !isValidAmount}
            className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors ${
              canAfford && isValidAmount
                ? 'bg-orange-500 hover:bg-orange-600 text-white'
                : 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
            }`}
          >
            <Zap size={18} />
            {isSubmitting ? 'Boosting...' : `Boost for ${effectiveAmount.toLocaleString()} sat`}
          </button>
          {!isValidAmount && (
            <p className="text-center text-red-400 text-xs mt-2">Minimum boost is 1000 sat</p>
          )}
          {isValidAmount && !canAfford && (
            <p className="text-center text-red-400 text-xs mt-2">Insufficient balance</p>
          )}
        </div>
      </div>
    </div>
  );
};
