import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Post } from '../types';
import { api, ApiChallenge } from '../api/client';

type ChallengeStep = 'confirm' | 'processing' | 'result';

interface ChallengeModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: Post | null;
  userBalance: number;
  userId: number;
  challengeFee: number;
  onChallengeComplete: (result: 'violation' | 'no_violation', challenge: ApiChallenge) => void;
}

export const ChallengeModal: React.FC<ChallengeModalProps> = ({
  isOpen,
  onClose,
  post,
  userBalance,
  userId,
  challengeFee,
  onChallengeComplete,
}) => {
  const [step, setStep] = useState<ChallengeStep>('confirm');
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<ApiChallenge | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reasons = [
    { id: 'spam', label: 'Spam', icon: '📢' },
    { id: 'scam', label: 'Scam / Phishing', icon: '🎣' },
    { id: 'inappropriate', label: 'Inappropriate', icon: '🚫' },
    { id: 'misinformation', label: 'Misinformation', icon: '❌' },
    { id: 'harassment', label: 'Harassment', icon: '💢' },
  ];

  useEffect(() => {
    if (isOpen) {
      setStep('confirm');
      setSelectedReason(null);
      setChallenge(null);
      setError(null);
    }
  }, [isOpen]);

  const handleSubmitChallenge = async () => {
    if (!selectedReason || !post) return;

    setStep('processing');
    setError(null);

    try {
      const result = await api.createChallenge(userId, {
        content_type: 'post',
        content_id: Number(post.id),
        reason: selectedReason,
      });

      setChallenge(result);
      setStep('result');
    } catch (err: any) {
      setError(err.message || 'Challenge failed');
      setStep('confirm');
    }
  };

  const handleAcceptResult = () => {
    if (!challenge) return;

    if (challenge.status === 'guilty') {
      onChallengeComplete('violation', challenge);
    } else {
      onChallengeComplete('no_violation', challenge);
    }
    onClose();
  };

  if (!isOpen || !post) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div data-testid="challenge-modal" className="relative bg-zinc-900 border-t border-zinc-800 rounded-t-3xl w-full max-w-lg animate-in slide-in-from-bottom duration-300 max-h-[85vh] overflow-y-auto">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-zinc-700 rounded-full" />
        </div>

        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-zinc-300"
        >
          <X size={20} />
        </button>

        <div className="p-6">
          {step === 'confirm' && (
            <>
              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <ShieldAlert className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-white">Report Content</h2>
                  <p className="text-zinc-500 text-sm">AI will review this content</p>
                </div>
              </div>

              {/* Content preview */}
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <img src={post.author.avatar || undefined} className="w-6 h-6 rounded-full" />
                  <span className="text-xs font-bold text-zinc-400">{post.author.handle}</span>
                </div>
                <p className="text-sm text-zinc-300 line-clamp-3">{post.content}</p>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
                  <p className="text-red-400 text-sm text-center">{error}</p>
                </div>
              )}

              {/* Reason selection */}
              <div className="mb-6">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-3">
                  Select Reason
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {reasons.map(reason => (
                    <button
                      key={reason.id}
                      data-testid={`reason-${reason.id}`}
                      onClick={() => setSelectedReason(reason.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        selectedReason === reason.id
                          ? 'bg-orange-500/10 border-orange-500/50 text-orange-400'
                          : 'bg-zinc-800/50 border-zinc-700 text-zinc-400'
                      }`}
                    >
                      <span className="text-lg mr-2">{reason.icon}</span>
                      <span className="text-sm font-bold">{reason.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fee info */}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-amber-400 text-sm font-bold">Report Fee</span>
                    <p className="text-[10px] text-amber-400/70">Lost if report is rejected</p>
                  </div>
                  <span className="text-xl font-black text-amber-400">{challengeFee} sat</span>
                </div>
              </div>

              {/* Balance check */}
              {userBalance < challengeFee && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
                  <p className="text-red-400 text-sm text-center">
                    Insufficient balance. Need {challengeFee} sat
                  </p>
                </div>
              )}

              {/* Submit button */}
              <button
                data-testid="submit-report-button"
                onClick={handleSubmitChallenge}
                disabled={!selectedReason || userBalance < challengeFee}
                className="w-full bg-red-600 text-white font-black py-4 rounded-2xl text-sm uppercase tracking-tighter active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit Report ({challengeFee} sat)
              </button>
            </>
          )}

          {step === 'processing' && (
            <div className="py-12 text-center">
              <div className="relative w-24 h-24 mx-auto mb-6">
                <div className="absolute inset-0 bg-orange-500/20 rounded-full blur-xl animate-pulse" />
                <div className="relative w-full h-full flex items-center justify-center">
                  <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
                </div>
              </div>
              
              <h2 className="text-xl font-black text-white mb-2">AI Reviewing...</h2>
              <p className="text-zinc-500 text-sm mb-6">
                Analyzing content, author profile & history
              </p>
            </div>
          )}

          {step === 'result' && challenge && (
            <div className="py-6 text-center">
              {challenge.status === 'guilty' ? (
                <>
                  <div className="w-20 h-20 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="w-10 h-10 text-green-500" />
                  </div>
                  <h2 className="text-2xl font-black text-green-500 mb-2">Report Upheld</h2>
                  <p className="text-zinc-400 text-sm mb-4">AI found this content violates rules</p>
                  
                  {/* AI reasoning */}
                  <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-3 mb-4 text-left">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">
                      AI Reasoning
                    </span>
                    <p className="text-sm text-zinc-300">{challenge.ai_reason}</p>
                    {challenge.ai_confidence && (
                      <span className="text-[10px] text-zinc-600 mt-1 block">
                        Confidence: {Math.round(challenge.ai_confidence * 100)}%
                      </span>
                    )}
                  </div>

                  <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 mb-6">
                    <span className="text-zinc-500 text-xs block mb-1">You receive</span>
                    <span className="text-3xl font-black text-green-500">
                      +{challenge.fee_paid + Math.round(challenge.fine_amount * 0.35)} sat
                    </span>
                    <p className="text-[10px] text-green-400/70 mt-1">
                      Fee refund ({challenge.fee_paid}) + violation reward ({Math.round(challenge.fine_amount * 0.35)})
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
                    <XCircle className="w-10 h-10 text-red-500" />
                  </div>
                  <h2 className="text-2xl font-black text-red-500 mb-2">Report Rejected</h2>
                  <p className="text-zinc-400 text-sm mb-4">AI found no rule violations</p>

                  {/* AI reasoning */}
                  <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-3 mb-4 text-left">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">
                      AI Reasoning
                    </span>
                    <p className="text-sm text-zinc-300">{challenge.ai_reason}</p>
                    {challenge.ai_confidence && (
                      <span className="text-[10px] text-zinc-600 mt-1 block">
                        Confidence: {Math.round(challenge.ai_confidence * 100)}%
                      </span>
                    )}
                  </div>
                  
                  <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-6">
                    <span className="text-zinc-500 text-xs block mb-1">You lose</span>
                    <span className="text-3xl font-black text-red-500">-{challenge.fee_paid} sat</span>
                    <p className="text-[10px] text-red-400/70 mt-1">Fee forfeited</p>
                  </div>
                </>
              )}

              {/* Phase 2 hint */}
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-3 mb-6">
                <div className="flex items-center justify-center gap-2 text-zinc-500 text-xs">
                  <AlertTriangle size={14} />
                  <span>Disagree? Community jury appeal coming soon</span>
                </div>
              </div>

              <button
                onClick={handleAcceptResult}
                className="w-full bg-white text-black font-black py-4 rounded-2xl text-sm uppercase tracking-tighter active:scale-[0.98] transition-transform"
              >
                Confirm
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
