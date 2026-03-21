import React from 'react';
import { Heart, Clock } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { ErrorMessage } from './ui/ErrorMessage';

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
  const hasEnoughBalance = userBalance >= stakeAmount;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      {/* Icon */}
      <div className="flex justify-center mb-4">
        <div className="w-14 h-14 bg-pink-500/10 border border-pink-500/30 rounded-full flex items-center justify-center">
          <Heart className="w-7 h-7 text-pink-500" />
        </div>
      </div>

      {/* Title */}
      <h3 className="text-lg font-bold text-center text-white mb-2">
        Stake to Like
      </h3>
      <p className="text-stone-500 text-sm text-center mb-6">
        1h lock period. 90% refund if cancelled.
      </p>

      {/* Stake info */}
      <div className="bg-stone-800/50 border border-stone-700 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-stone-400 text-sm">Stake Amount</span>
          <span className="text-lg font-bold text-orange-500 tabular-nums">{stakeAmount} sat</span>
        </div>
        <div className="flex items-center gap-2 text-stone-500 text-xs">
          <Clock size={12} />
          <span>Settled after 1 hour (cannot cancel)</span>
        </div>
      </div>

      {/* Balance warning */}
      {!hasEnoughBalance && (
        <div className="mb-4">
          <ErrorMessage message={`Insufficient balance (${userBalance} sat)`} />
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3">
        <Button variant="secondary" size="lg" fullWidth onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="lg"
          fullWidth
          disabled={!hasEnoughBalance}
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className="bg-pink-500 hover:bg-pink-600"
        >
          <Heart size={16} className="fill-current" />
          Confirm
        </Button>
      </div>
    </Modal>
  );
};
