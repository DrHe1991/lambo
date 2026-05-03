/**
 * LikeConfirmModal — the tip flow.
 *
 * Pressing the like button opens this modal. It:
 *   1. Fetches a quote from the backend (POST /api/tips/quote) for the post's
 *      creator wallet + canonical chain params.
 *   2. If user has enough USDC, builds a transfer via lib/chain.ts.
 *   3. Signs and broadcasts via Privy `useSendTransaction` (delegated actions
 *      enabled means no per-tap popup).
 *   4. Posts the resulting tx_hash to /api/tips/confirm.
 *   5. On insufficient balance, dismisses and asks the parent to navigate to
 *      the Deposit page (full-screen QR + address).
 *
 * Comment likes are still free social toggles; this modal only handles posts.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Heart, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { useSendTransaction, useWallets } from '@privy-io/react-auth';
import type { Address, Hex } from 'viem';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { api, type TipQuote } from '../api/client';
import {
  buildUsdcTransfer,
  DEFAULT_TIP_MICRO,
  formatUsdc,
  getUsdcBalance,
  parseUsdc,
} from '../lib/chain';
import { useWalletStore } from '../stores/walletStore';

interface LikeConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTipped: (txHash: string) => void;
  // Called when the user has insufficient USDC and taps "Add funds".
  // Parent should close any modals and navigate to the Deposit screen.
  onAddFunds?: () => void;
  postId: number;
  // Pre-selected tip amount in micro-USDC; defaults to DEFAULT_TIP_MICRO.
  amountMicro?: bigint;
}

const PRESETS_MICRO: bigint[] = [10_000n, 100_000n, 1_000_000n, 5_000_000n];

export const LikeConfirmModal: React.FC<LikeConfirmModalProps> = ({
  isOpen,
  onClose,
  onTipped,
  onAddFunds,
  postId,
  amountMicro: initialAmount,
}) => {
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const refreshBalance = useWalletStore((s) => s.refreshBalance);
  const storeBalance = useWalletStore((s) => s.usdcBalanceMicro);

  const [selectedMicro, setSelectedMicro] = useState<bigint>(initialAmount ?? DEFAULT_TIP_MICRO);
  const [customInput, setCustomInput] = useState<string>('');
  const [quote, setQuote] = useState<TipQuote | null>(null);
  const [walletBalance, setWalletBalance] = useState<bigint>(storeBalance);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wallet = wallets[0];
  const senderAddress = wallet?.address as Address | undefined;

  const fetchQuote = useCallback(async () => {
    if (!isOpen) return;
    const amount = selectedMicro;
    if (amount <= 0n) return;

    setLoading(true);
    setError(null);
    try {
      const q = await api.tipQuote(postId, Number(amount));
      setQuote(q);

      if (senderAddress) {
        const bal = await getUsdcBalance(senderAddress);
        setWalletBalance(bal);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tip quote');
    } finally {
      setLoading(false);
    }
  }, [isOpen, postId, selectedMicro, senderAddress]);

  useEffect(() => {
    if (isOpen) {
      void fetchQuote();
    } else {
      setQuote(null);
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen, fetchQuote]);

  const onPreset = (micro: bigint) => {
    setCustomInput('');
    setSelectedMicro(micro);
  };

  const onCustom = (raw: string) => {
    setCustomInput(raw);
    const parsed = parseUsdc(raw);
    if (parsed > 0n) setSelectedMicro(parsed);
  };

  const insufficient = walletBalance < selectedMicro;
  const tooSmall = quote && selectedMicro < BigInt(quote.min_tip_micro);
  const tooLarge = quote && selectedMicro > BigInt(quote.max_tip_micro);
  const alreadyTipped = quote?.already_tipped ?? false;

  const goToDeposit = () => {
    onClose();
    onAddFunds?.();
  };

  const handleConfirm = async () => {
    if (!quote || !senderAddress || submitting) return;
    if (insufficient) {
      goToDeposit();
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const call = buildUsdcTransfer(quote.creator_wallet as Address, selectedMicro);
      const tx = await sendTransaction({
        to: call.to,
        data: call.data,
        value: call.value.toString() as unknown as bigint,
        chainId: call.chainId,
      });
      const txHash = (tx as { hash?: Hex } | Hex | string) as Hex;
      const finalHash =
        typeof txHash === 'string'
          ? (txHash as Hex)
          : ((txHash as { hash: Hex }).hash);

      await api.tipConfirm(postId, finalHash);
      onTipped(finalHash);
      void refreshBalance();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tip failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const tipUsdLabel = `$${formatUsdc(selectedMicro)}`;
  const balanceUsdLabel = `$${formatUsdc(walletBalance)}`;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="sm">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 bg-orange-500/10 border border-orange-500/30 rounded-full flex items-center justify-center">
            <Heart className="w-7 h-7 text-orange-500" />
          </div>
        </div>

        <h3 className="text-lg font-bold text-center text-white mb-1">
          Tip {quote ? `@${quote.creator_handle}` : 'creator'}
        </h3>
        <p className="text-stone-500 text-sm text-center mb-5">
          Send USDC on Base directly to the creator&rsquo;s wallet.
        </p>

        {/* Preset amounts */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {PRESETS_MICRO.map((micro) => {
            const active = selectedMicro === micro && customInput === '';
            return (
              <button
                key={micro.toString()}
                onClick={() => onPreset(micro)}
                className={`py-2 rounded-xl text-sm font-bold tabular-nums transition-colors ${
                  active
                    ? 'bg-orange-500 text-black'
                    : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                }`}
              >
                ${formatUsdc(micro)}
              </button>
            );
          })}
        </div>

        {/* Custom amount */}
        <div className="mb-4">
          <label className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1.5 block">
            Custom amount (USDC)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 font-semibold">$</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              value={customInput}
              onChange={(e) => onCustom(e.target.value)}
              placeholder="0.10"
              className="w-full bg-stone-800 border border-stone-700 rounded-xl pl-7 pr-3 py-2.5 text-white text-sm font-medium focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        {/* Wallet balance */}
        <div className="bg-stone-800/40 rounded-xl px-4 py-3 mb-4 flex items-center justify-between text-sm">
          <span className="text-stone-500">Wallet balance</span>
          <span className="text-stone-200 font-semibold tabular-nums">{balanceUsdLabel}</span>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-3 flex items-start gap-2 text-red-400 text-sm">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {tooSmall && (
          <p className="text-amber-400 text-xs mb-3">
            Minimum tip is ${formatUsdc(BigInt(quote!.min_tip_micro))}.
          </p>
        )}
        {tooLarge && (
          <p className="text-amber-400 text-xs mb-3">
            Maximum tip is ${formatUsdc(BigInt(quote!.max_tip_micro))}.
          </p>
        )}
        {alreadyTipped && (
          <p className="text-amber-400 text-xs mb-3">
            You&rsquo;ve already tipped this post — sending another tip will add on top.
          </p>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" size="lg" fullWidth onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          {insufficient ? (
            <Button
              size="lg"
              fullWidth
              onClick={goToDeposit}
              className="bg-orange-500 hover:bg-orange-600 text-black"
            >
              Add funds
            </Button>
          ) : (
            <Button
              size="lg"
              fullWidth
              disabled={loading || submitting || !quote || !senderAddress || !!tooSmall || !!tooLarge}
              onClick={handleConfirm}
              className="bg-orange-500 hover:bg-orange-600 text-black"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : submitting ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Heart size={16} className="fill-current" />
              )}
              {submitting ? 'Sending…' : `Tip ${tipUsdLabel}`}
            </Button>
          )}
        </div>
      </Modal>
    </>
  );
};
