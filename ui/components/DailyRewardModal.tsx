import React, { useEffect, useState } from 'react';
import { X, Gift, Zap, Calendar, TrendingUp } from 'lucide-react';

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
      
      // Delay before showing amount
      const timer1 = setTimeout(() => setShowAmount(true), 300);
      
      // Count up animation
      const timer2 = setTimeout(() => {
        let current = 0;
        const step = Math.ceil(rewardAmount / 20);
        const interval = setInterval(() => {
          current += step;
          if (current >= rewardAmount) {
            setCounted(rewardAmount);
            clearInterval(interval);
          } else {
            setCounted(current);
          }
        }, 30);
      }, 500);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [isOpen, rewardAmount]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm animate-in zoom-in-95 fade-in duration-300 shadow-2xl">
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-zinc-300"
        >
          <X size={20} />
        </button>

        {/* Gift icon with glow */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="absolute inset-0 bg-orange-500/30 rounded-full blur-xl animate-pulse" />
            <div className="relative w-20 h-20 bg-gradient-to-br from-orange-500 to-amber-600 rounded-full flex items-center justify-center">
              <Gift className="w-10 h-10 text-white" />
            </div>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-black italic tracking-tighter text-center text-white mb-2">
          Daily Reward
        </h2>
        <p className="text-zinc-500 text-sm text-center mb-6">
          Welcome back! Your reward is ready.
        </p>

        {/* Reward amount */}
        <div className={`bg-black/50 border border-orange-500/30 rounded-2xl p-6 mb-6 transition-all duration-500 ${showAmount ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Zap className="w-6 h-6 text-orange-500 fill-orange-500" />
            <span className="text-4xl font-black text-orange-500">
              +{counted.toLocaleString()}
            </span>
            <span className="text-lg font-bold text-orange-400">sat</span>
          </div>
          <p className="text-center text-zinc-500 text-xs">
            Added to your balance
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-amber-500" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Streak</span>
            </div>
            <span className="text-xl font-black text-white">{streak} <span className="text-sm text-zinc-500">days</span></span>
          </div>
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Balance</span>
            </div>
            <span className="text-xl font-black text-white">{totalBalance.toLocaleString()} <span className="text-sm text-zinc-500">sat</span></span>
          </div>
        </div>

        {/* Streak bonus hint */}
        {streak >= 7 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-6">
            <p className="text-amber-400 text-xs text-center font-medium">
              🔥 {streak} day streak! Bonus +{Math.min(streak * 10, 100)}%
            </p>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={onClose}
          className="w-full bg-white text-black font-black py-4 rounded-2xl text-sm uppercase tracking-tighter active:scale-[0.98] transition-transform"
        >
          Start Exploring
        </button>
      </div>
    </div>
  );
};
