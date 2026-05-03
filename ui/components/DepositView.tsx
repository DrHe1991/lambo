/**
 * DepositView — full-screen receive page for USDC on Base.
 *
 * Single-chain, single-token by design — BitLink only supports USDC on Base.
 * Layout mirrors the previous in-app deposit screen: one cohesive card holding
 * the network chip, QR, address row, and an amber network warning, with a
 * BaseScan link below for power users.
 */
import React, { useState } from 'react';
import { ArrowLeft, Copy, Share2, ExternalLink, AlertCircle, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from './Toast';

interface DepositViewProps {
  walletAddress: string | null;
  onBack: () => void;
}

function midTruncate(addr: string, head = 6, tail = 6): string {
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export const DepositView: React.FC<DepositViewProps> = ({ walletAddress, onBack }) => {
  const [showFull, setShowFull] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      toast.success('Address copied');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy address');
    }
  };

  const handleShare = async () => {
    if (!walletAddress) return;
    const shareData = {
      title: 'My BitLink wallet',
      text: `Send USDC on Base to ${walletAddress}`,
    };
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // User cancelled or share API failed — fall through to copy.
    }
    void handleCopy();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black overflow-y-auto sub-view">
      <div className="sticky top-0 z-10 bg-stone-950/95 backdrop-blur-xl px-5 py-1.5 flex items-center gap-3 top-nav">
        <button
          onClick={onBack}
          className="p-2.5 -ml-2.5 rounded-full hover:bg-stone-800/60 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="text-[19px] text-white select-none font-display font-bold tracking-tight">
          Deposit
        </span>
      </div>

      <div className="px-4 py-6 space-y-4 max-w-md mx-auto">
        {/* Main card: chip + QR + address + warning */}
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
          {/* Network chip */}
          <div className="flex justify-center mb-5">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/30 rounded-full">
              <div className="w-4 h-4 rounded-full bg-[#0052FF] shrink-0" />
              <span className="text-orange-500 text-sm font-semibold">
                USDC · Base Network
              </span>
            </div>
          </div>

          {/* QR */}
          <div className="flex justify-center mb-6">
            <div className="bg-white p-4 rounded-2xl">
              {walletAddress ? (
                <QRCodeSVG
                  value={walletAddress}
                  size={196}
                  level="H"
                  includeMargin={false}
                  fgColor="#0a0a0a"
                />
              ) : (
                <div className="w-[196px] h-[196px] flex items-center justify-center text-stone-500 text-sm text-center">
                  No wallet linked yet.
                </div>
              )}
            </div>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <p className="text-stone-500 text-xs text-center">Your address</p>
            <div className="bg-stone-800 rounded-xl p-3 flex items-center gap-3">
              <button
                onClick={() => setShowFull((v) => !v)}
                disabled={!walletAddress}
                className="flex-1 text-left font-mono text-white text-sm break-all leading-snug active:opacity-60 disabled:opacity-50"
                aria-label={showFull ? 'Hide full address' : 'Show full address'}
              >
                {walletAddress
                  ? showFull
                    ? walletAddress
                    : midTruncate(walletAddress, 10, 8)
                  : 'Wallet not yet linked'}
              </button>
              <button
                onClick={handleCopy}
                disabled={!walletAddress}
                className="shrink-0 p-2 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 rounded-lg transition-colors"
                aria-label={copied ? 'Copied' : 'Copy address'}
              >
                {copied ? (
                  <Check size={18} className="text-emerald-400" />
                ) : (
                  <Copy size={18} className="text-stone-300" />
                )}
              </button>
              <button
                onClick={handleShare}
                disabled={!walletAddress}
                className="shrink-0 p-2 bg-stone-700 hover:bg-stone-600 disabled:opacity-50 rounded-lg transition-colors"
                aria-label="Share address"
              >
                <Share2 size={18} className="text-stone-300" />
              </button>
            </div>
          </div>

          {/* Network warning */}
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-amber-500 text-xs leading-relaxed">
              <span className="font-semibold">Only send USDC on Base.</span> Sending other tokens
              or USDC on a different network (Ethereum, Polygon, etc.) will result in permanent
              loss of funds.
            </p>
          </div>
        </div>

        {/* BaseScan link */}
        {walletAddress && (
          <div className="flex justify-center">
            <a
              href={`https://basescan.org/address/${walletAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-stone-500 hover:text-stone-300 text-xs transition-colors py-2"
            >
              View on BaseScan
              <ExternalLink size={12} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
