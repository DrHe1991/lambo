import React, { useEffect, useState } from 'react';
import { X, Gift, Zap, Calendar, TrendingUp } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface DailyRewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  rewardAmount: number;
  streak: number;
  totalBalance: number;
}

export const DailyRewardModal: React.FC<DailyRewardModalProps> = ({
  isOpen,
  onClose,
  rewardAmount,
  streak,
  totalBalance,
}) => {
  const [showAmount, setShowAmount] = useState(false);
  const [counted, setCounted] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setShowAmount(false);
      setCounted(0);

      const timer1 = setTimeout(() => setShowAmount(true), 300);

      // Count-up with deceleration easing
      const timer2 = setTimeout(() => {
        const duration = 600;
        const startTime = performance.now();
        const tick = (now: number) => {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // Ease-out quart for natural deceleration
          const eased = 1 - Math.pow(1 - progress, 4);
          setCounted(Math.round(eased * rewardAmount));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, 500);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [isOpen, rewardAmount]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-stone-500 hover:text-stone-300 transition-colors"
        aria-label="Close"
      >
        <X size={20} />
      </button>

      {/* Gift icon */}
      <div className="flex justify-center mb-6">
        <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-amber-600 rounded-full flex items-center justify-center">
          <Gift className="w-10 h-10 text-white" />
        </div>
      </div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-center text-white mb-2 font-display">
        Daily Reward
      </h2>
      <p className="text-stone-500 text-sm text-center mb-6">
        Welcome back! Your reward is ready.
      </p>

      {/* Reward amount */}
      <div className={`bg-stone-900/80 border border-orange-500/30 rounded-2xl p-6 mb-6 transition-all duration-500 ${showAmount ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        <div className="flex items-center justify-center gap-2 mb-2">
          <Zap className="w-6 h-6 text-orange-500 fill-orange-500" />
          <span className="text-4xl font-bold text-orange-500 tabular-nums">
            +{counted.toLocaleString()}
          </span>
          <span className="text-lg font-bold text-orange-400">sat</span>
        </div>
        <p className="text-center text-stone-500 text-xs">
          Added to your balance
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-stone-800/50 border border-stone-700/50 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-bold text-stone-500 uppercase">Streak</span>
          </div>
          <span className="text-xl font-bold text-white">{streak} <span className="text-sm text-stone-500">days</span></span>
        </div>
        <div className="bg-stone-800/50 border border-stone-700/50 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-xs font-bold text-stone-500 uppercase">Balance</span>
          </div>
          <span className="text-xl font-bold text-white tabular-nums">{totalBalance.toLocaleString()} <span className="text-sm text-stone-500">sat</span></span>
        </div>
      </div>

      {/* Streak bonus hint */}
      {streak >= 7 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-6">
          <p className="text-amber-400 text-xs text-center font-medium">
            {streak} day streak! Bonus +{Math.min(streak * 10, 100)}%
          </p>
        </div>
      )}

      {/* CTA */}
      <Button
        fullWidth
        size="lg"
        onClick={onClose}
        className="bg-white hover:bg-stone-100 text-black uppercase tracking-tight"
      >
        Start Exploring
      </Button>
    </Modal>
  );
};
