import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Post } from '../types';

type ChallengeStep = 'confirm' | 'processing' | 'result';
type ChallengeResult = 'violation' | 'no_violation';

interface ChallengeModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: Post | null;
  userBalance: number;
  onChallengeComplete: (result: ChallengeResult, reward: number) => void;
}

const CHALLENGE_STAKE = 100; // sat required to challenge

export const ChallengeModal: React.FC<ChallengeModalProps> = ({
  isOpen,
  onClose,
  post,
  userBalance,
  onChallengeComplete,
}) => {
  const [step, setStep] = useState<ChallengeStep>('confirm');
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [result, setResult] = useState<ChallengeResult | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);

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
      setResult(null);
      setProcessingProgress(0);
    }
  }, [isOpen]);

  const handleSubmitChallenge = () => {
    if (!selectedReason) return;
    
    setStep('processing');
    
    // Simulate AI processing
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        
        // Simulate AI decision (70% chance of violation for demo)
        const isViolation = Math.random() > 0.3;
        setResult(isViolation ? 'violation' : 'no_violation');
        setStep('result');
      }
      setProcessingProgress(Math.min(progress, 100));
    }, 200);
  };

  const handleAcceptResult = () => {
    if (result === 'violation') {
      // User wins: get stake back + reward from violator
      onChallengeComplete('violation', CHALLENGE_STAKE + 200);
    } else {
      // User loses: lose stake
      onChallengeComplete('no_violation', -CHALLENGE_STAKE);
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
      <div className="relative bg-zinc-900 border-t border-zinc-800 rounded-t-3xl w-full max-w-lg animate-in slide-in-from-bottom duration-300 max-h-[85vh] overflow-y-auto">
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
                  <img src={post.author.avatar} className="w-6 h-6 rounded-full" />
                  <span className="text-xs font-bold text-zinc-400">{post.author.handle}</span>
                </div>
                <p className="text-sm text-zinc-300 line-clamp-3">{post.content}</p>
              </div>

              {/* Reason selection */}
              <div className="mb-6">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-3">
                  Select Reason
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {reasons.map(reason => (
                    <button
                      key={reason.id}
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

              {/* Stake info */}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-amber-400 text-sm font-bold">Report Stake</span>
                    <p className="text-[10px] text-amber-400/70">Lost if report is rejected</p>
                  </div>
                  <span className="text-xl font-black text-amber-400">{CHALLENGE_STAKE} sat</span>
                </div>
              </div>

              {/* Balance check */}
              {userBalance < CHALLENGE_STAKE && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
                  <p className="text-red-400 text-sm text-center">
                    Insufficient balance. Need {CHALLENGE_STAKE} sat
                  </p>
                </div>
              )}

              {/* Submit button */}
              <button
                onClick={handleSubmitChallenge}
                disabled={!selectedReason || userBalance < CHALLENGE_STAKE}
                className="w-full bg-red-600 text-white font-black py-4 rounded-2xl text-sm uppercase tracking-tighter active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit Report (Stake {CHALLENGE_STAKE} sat)
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
              <p className="text-zinc-500 text-sm mb-6">Analyzing content for violations</p>
              
              {/* Progress bar */}
              <div className="bg-zinc-800 rounded-full h-2 overflow-hidden max-w-xs mx-auto">
                <div 
                  className="bg-orange-500 h-full transition-all duration-200"
                  style={{ width: `${processingProgress}%` }}
                />
              </div>
              <p className="text-zinc-600 text-xs mt-2">{Math.round(processingProgress)}%</p>
            </div>
          )}

          {step === 'result' && (
            <div className="py-6 text-center">
              {result === 'violation' ? (
                <>
                  <div className="w-20 h-20 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="w-10 h-10 text-green-500" />
                  </div>
                  <h2 className="text-2xl font-black text-green-500 mb-2">Report Upheld</h2>
                  <p className="text-zinc-400 text-sm mb-6">AI found this content violates rules</p>
                  
                  <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 mb-6">
                    <span className="text-zinc-500 text-xs block mb-1">You receive</span>
                    <span className="text-3xl font-black text-green-500">+{CHALLENGE_STAKE + 200} sat</span>
                    <p className="text-[10px] text-green-400/70 mt-1">Stake refund + violator penalty</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
                    <XCircle className="w-10 h-10 text-red-500" />
                  </div>
                  <h2 className="text-2xl font-black text-red-500 mb-2">Report Rejected</h2>
                  <p className="text-zinc-400 text-sm mb-6">AI found no rule violations</p>
                  
                  <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-6">
                    <span className="text-zinc-500 text-xs block mb-1">You lose</span>
                    <span className="text-3xl font-black text-red-500">-{CHALLENGE_STAKE} sat</span>
                    <p className="text-[10px] text-red-400/70 mt-1">Stake forfeited</p>
                  </div>
                </>
              )}

              {/* Phase 2 hint */}
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-3 mb-6">
                <div className="flex items-center justify-center gap-2 text-zinc-500 text-xs">
                  <AlertTriangle size={14} />
                  <span>Disagree? Human appeal coming soon</span>
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
