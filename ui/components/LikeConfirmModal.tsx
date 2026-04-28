import React, { useEffect, useState, useCallback } from 'react';
import { Heart, Clock, TrendingUp, RefreshCw, AlertCircle } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { LikeQuote, api } from '../api/client';

interface LikeConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (quoteId: string) => Promise<void>;
  postId: number;
  userId: number;
  isComment?: boolean;
  commentId?: number;
  onEnableQuickMode?: () => void;
}

export const LikeConfirmModal: React.FC<LikeConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  postId,
  userId,
  isComment = false,
  commentId,
  onEnableQuickMode,
}) => {
  const [quote, setQuote] = useState<LikeQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [expired, setExpired] = useState(false);
  const [showQuickModeOffer, setShowQuickModeOffer] = useState(false);

  const fetchQuote = useCallback(async () => {
    if (!isOpen) return;
    
    setLoading(true);
    setError(null);
    setExpired(false);
    
    try {
      const newQuote = isComment && commentId
        ? await api.createCommentLikeQuote(postId, commentId, userId)
        : await api.createLikeQuote(postId, userId);
      
      setQuote(newQuote);
      setSecondsLeft(newQuote.expires_in_seconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get quote');
    } finally {
      setLoading(false);
    }
  }, [isOpen, postId, userId, isComment, commentId]);

  useEffect(() => {
    if (isOpen) {
      setShowQuickModeOffer(false);
      fetchQuote();
    } else {
      setQuote(null);
      setSecondsLeft(0);
      setExpired(false);
      setError(null);
      setShowQuickModeOffer(false);
    }
  }, [isOpen, fetchQuote]);

  useEffect(() => {
    if (!quote || secondsLeft <= 0) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [quote]);

  const handleConfirm = async () => {
    if (!quote || expired || confirming) return;
    
    setConfirming(true);
    setError(null);
    
    try {
      await onConfirm(quote.quote_id);
      // Show quick mode offer after successful like (if callback provided)
      if (onEnableQuickMode) {
        setShowQuickModeOffer(true);
      } else {
        onClose();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to like';
      if (message.includes('expired')) {
        setExpired(true);
      } else {
        setError(message);
      }
    } finally {
      setConfirming(false);
    }
  };

  const hasEnoughBalance = quote?.has_balance ?? false;

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
        Confirm Like
      </h3>
      <p className="text-stone-500 text-sm text-center mb-6">
        Likes are permanent. Price locked for {quote?.expires_in_seconds || 20}s.
      </p>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 text-stone-500 animate-spin" />
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Quick mode offer after successful like */}
      {showQuickModeOffer && (
        <>
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center">
              <Heart className="w-7 h-7 text-emerald-500 fill-current" />
            </div>
          </div>
          <h3 className="text-lg font-bold text-center text-white mb-2">Liked!</h3>
          <p className="text-stone-400 text-sm text-center mb-6">
            Enable Quick Like Mode to skip this confirmation next time?
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" size="lg" fullWidth onClick={onClose}>
              No thanks
            </Button>
            <Button
              size="lg"
              fullWidth
              onClick={() => {
                onEnableQuickMode?.();
                onClose();
              }}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              Enable
            </Button>
          </div>
        </>
      )}

      {quote && !loading && !showQuickModeOffer && (
        <>
          {/* Price and position info */}
          <div className="bg-stone-800/50 border border-stone-700 rounded-xl p-4 mb-4 space-y-3">
            {/* Cost */}
            <div className="flex items-center justify-between">
              <span className="text-stone-400 text-sm">Cost</span>
              <span className="text-lg font-bold text-orange-500 tabular-nums">
                {quote.cost} sat
              </span>
            </div>

            {/* Position */}
            <div className="flex items-center justify-between">
              <span className="text-stone-400 text-sm">Your Position</span>
              <span className="text-white font-medium tabular-nums">
                #{quote.your_position}
              </span>
            </div>

            {/* Break-even */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-stone-400 text-sm">
                <TrendingUp size={14} />
                <span>Break even at</span>
              </div>
              <span className="text-emerald-400 font-medium tabular-nums">
                {quote.break_even_at} likes
                <span className="text-stone-500 text-xs ml-1">
                  (+{quote.likes_needed} more)
                </span>
              </span>
            </div>

            {/* Countdown */}
            <div className="flex items-center justify-between pt-2 border-t border-stone-700">
              <div className="flex items-center gap-1.5 text-stone-400 text-sm">
                <Clock size={14} />
                <span>Price expires in</span>
              </div>
              <span className={`font-bold tabular-nums ${
                expired ? 'text-red-400' : secondsLeft <= 5 ? 'text-amber-400' : 'text-white'
              }`}>
                {expired ? 'Expired' : `${secondsLeft}s`}
              </span>
            </div>
          </div>

          {/* Balance warning */}
          {!hasEnoughBalance && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle size={16} />
                <span>
                  Insufficient balance ({quote.available_balance} sat)
                </span>
              </div>
            </div>
          )}

          {/* Expired state */}
          {expired && (
            <div className="mb-4">
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                onClick={fetchQuote}
                disabled={loading}
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                Refresh Quote
              </Button>
            </div>
          )}

          {/* Action buttons */}
          {!expired && (
            <div className="flex gap-3">
              <Button variant="secondary" size="lg" fullWidth onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="lg"
                fullWidth
                disabled={!hasEnoughBalance || confirming}
                onClick={handleConfirm}
                className="bg-pink-500 hover:bg-pink-600"
              >
                {confirming ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Heart size={16} className="fill-current" />
                )}
                {confirming ? 'Confirming...' : 'Confirm'}
              </Button>
            </div>
          )}

          {expired && (
            <Button variant="secondary" size="lg" fullWidth onClick={onClose}>
              Close
            </Button>
          )}
        </>
      )}
    </Modal>
  );
};
