/**
 * Privy provider configuration — headless mode (no Privy UI).
 *
 * Headless mode means: Privy SDK manages the wallet + auth, but every visual
 * surface (login buttons, modal, balance display) stays inside BitLink's own
 * components. We never render Privy's branded modal.
 *
 * Required env (set in ui/.env or runtime):
 *   VITE_PRIVY_APP_ID  — from https://dashboard.privy.io
 *   VITE_BASE_RPC_URL  — e.g. https://base-mainnet.g.alchemy.com/v2/<key>
 *
 * Privy dashboard config required:
 *   - Allowed origins: http://localhost:3003, https://bitlink.app, capacitor://localhost, https://localhost
 *   - Login methods: Email, Google, Apple, Wallet (existing wallet connect)
 *   - Embedded wallets: enabled, EVM, create on first login
 *   - Delegated actions: enabled (Tier 1 chains only — Base)
 */

import type { PrivyClientConfig } from '@privy-io/react-auth';
import { base } from 'viem/chains';

export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;
export const BASE_RPC_URL =
  (import.meta.env.VITE_BASE_RPC_URL as string | undefined) ||
  'https://mainnet.base.org';

export const privyConfig: PrivyClientConfig = {
  // Headless: do not render Privy's branded modal. We build our own login UI.
  appearance: {
    theme: 'dark',
    accentColor: '#F97316', // BitLink orange — only used if a Privy modal slips through
    showWalletLoginFirst: false,
    walletList: [],
  },
  // Login methods exposed in headless flows. Apple is required for iOS submission later.
  loginMethods: ['email', 'google', 'apple', 'wallet'],
  // Always create an embedded EVM wallet on first login. No prompt.
  embeddedWallets: {
    ethereum: {
      createOnLogin: 'all-users',
    },
    showWalletUIs: false,
  },
  // Delegated actions: pre-authorize the app to send tips without per-tap signing.
  // Tier 1 chains only; Base is Tier 1.
  defaultChain: base,
  supportedChains: [base],
};

/**
 * Whether Privy is configured (App ID present). Used to gate dev quick-login fallback.
 */
export function isPrivyConfigured(): boolean {
  return Boolean(PRIVY_APP_ID && PRIVY_APP_ID.length > 0);
}

/* ──────────────── Logout coordination ────────────────
 * The Zustand userStore can't call Privy hooks directly (Privy lives in React).
 * `PrivyTokenSync` (mounted inside <PrivyProvider>) registers a logout function
 * on mount; userStore.logout calls `runPrivyLogout()` which awaits Privy's
 * sign-out before continuing. Without this, the LoginPage would immediately
 * re-link the still-authenticated Privy session and you'd be re-logged-in. */

let _privyLogoutFn: (() => Promise<void>) | null = null;

export function registerPrivyLogout(fn: (() => Promise<void>) | null): void {
  _privyLogoutFn = fn;
}

export async function runPrivyLogout(): Promise<void> {
  if (!_privyLogoutFn) return;
  try {
    await _privyLogoutFn();
  } catch (e) {
    console.error('[BitLink] Privy logout failed', e);
  }
}
