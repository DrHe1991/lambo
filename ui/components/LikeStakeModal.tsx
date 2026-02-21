import React from 'react';
import { Heart, Clock, AlertCircle } from 'lucide-react';

interface LikeStakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  stakeAmount: number;
  userBalance: number;
}

export const LikeStakeModal: React.FC<LikeStakeModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  stakeAmount,
  userBalance,
}) => {
  if (!isOpen) return null;

  const hasEnoughBalance = userBalance >= stakeAmount;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-xs animate-in zoom-in-95 fade-in duration-200 shadow-2xl">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 bg-pink-500/10 border border-pink-500/30 rounded-full flex items-center justify-center">
            <Heart className="w-7 h-7 text-pink-500" />
          </div>
        </div>

        {/* Title */}
        <h3 className="text-lg font-black text-center text-white mb-2">
          Stake to Like
        </h3>
        <p className="text-zinc-500 text-sm text-center mb-6">
          Prevents vote manipulation. Refunded in 24h.
        </p>

        {/* Stake info */}
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-zinc-400 text-sm">Stake Amount</span>
            <span className="text-lg font-black text-orange-500">{stakeAmount} sat</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-500 text-xs">
            <Clock size={12} />
            <span>Auto-refunded after 24 hours</span>
          </div>
        </div>

        {/* Balance warning */}
        {!hasEnoughBalance && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4 flex items-center gap-2">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
            <span className="text-red-400 text-xs">
              Insufficient balance ({userBalance} sat)
            </span>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-zinc-800 text-zinc-300 font-bold py-3 rounded-xl text-sm active:scale-95 transition-transform"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            disabled={!hasEnoughBalance}
            className="flex-1 bg-pink-500 text-white font-black py-3 rounded-xl text-sm active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Heart size={16} className="fill-current" />
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
