/**
 * DelegatedActionsConsent — one-time modal asking the user to authorize
 * BitLink to send tips on their behalf without signing each tap.
 *
 * Without delegated actions, every tip would pop a Privy signature prompt —
 * fatal UX for a one-tap social product. With delegated actions, BitLink can
 * call sendTransaction() silently inside the user's session.
 *
 * Privy's `useDelegatedActions().delegateWallet({chain})` is the underlying call.
 * We persist consent server-side (api.linkWallet with delegated_actions_enabled)
 * and locally so we don't show the modal again.
 */
import React, { useState } from 'react';
import { Zap, ShieldCheck, AlertTriangle, X } from 'lucide-react';
import { useWallets } from '@privy-io/react-auth';
import { base } from 'viem/chains';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useUserStore } from '../stores/userStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCompleted: () => void;
}

const STORAGE_KEY = 'bitlink_delegated_consent_v1';

export function hasDelegatedConsent(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export const DelegatedActionsConsent: React.FC<Props> = ({ isOpen, onClose, onCompleted: _onCompleted }) => {
  const { wallets } = useWallets();
  const _linkPrivyWallet = useUserStore((s) => s.linkPrivyWallet);

  const [submitting, _setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wallet = wallets[0];

  // One-tap tipping is temporarily disabled — Privy v3 embedded wallets run in
  // TEE execution, which requires server-side session signers instead of the
  // legacy on-device delegateWallet flow. Tracked as P1 work.
  const handleEnable = async () => {
    setError(
      'One-tap tipping is coming soon. For now, each tip needs a quick confirm.',
    );
  };

  const handleSkip = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      /* ignore */
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <div className="relative">
        <button
          onClick={onClose}
          className="absolute -top-1 -right-1 p-1 text-stone-500 hover:text-stone-300"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 bg-orange-500/10 border border-orange-500/30 rounded-full flex items-center justify-center">
            <Zap className="w-7 h-7 text-orange-500" />
          </div>
        </div>

        <h3 className="text-lg font-bold text-center text-white mb-1">
          Enable one-tap tipping
        </h3>
        <p className="text-stone-500 text-sm text-center mb-5">
          Allow BitLink to send tips on your behalf without signing each one. You stay in control —
          you can revoke this any time in Settings.
        </p>

        <div className="bg-stone-800/40 rounded-xl px-4 py-3 mb-3 flex items-start gap-3">
          <ShieldCheck size={18} className="text-emerald-500 shrink-0 mt-0.5" />
          <div className="text-xs text-stone-400">
            <p className="text-stone-200 font-semibold mb-0.5">Non-custodial</p>
            We never see your private key. Privy holds an encrypted key share in a TEE; the other
            share lives on your device.
          </div>
        </div>

        <div className="bg-stone-800/40 rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-stone-400">
            <p className="text-stone-200 font-semibold mb-0.5">Scope: tipping only</p>
            Delegation is limited to {base.name} ({base.id}) and the USDC contract. We can&rsquo;t
            move other tokens or interact with arbitrary contracts.
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 mb-3 text-red-400 text-xs">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" size="lg" fullWidth onClick={handleSkip} disabled={submitting}>
            Maybe later
          </Button>
          <Button
            size="lg"
            fullWidth
            disabled={submitting || !wallet}
            onClick={handleEnable}
            className="bg-orange-500 hover:bg-orange-600 text-black opacity-60"
          >
            Coming soon
          </Button>
        </div>
      </div>
    </Modal>
  );
};
