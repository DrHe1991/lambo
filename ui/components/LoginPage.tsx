/**
 * LoginPage — non-custodial entry point.
 *
 * Auth flow:
 *   1. User picks a login method (Apple/Google/Email/Wallet).
 *   2. Privy creates an embedded wallet on first login (configured in lib/privy.ts).
 *   3. We POST /api/wallet/link with the embedded wallet address + Privy JWT
 *      so the BitLink backend can mint or look up the user record.
 *   4. App proceeds to feed; first-time users will see the DelegatedActionsConsent
 *      modal so tipping doesn't pop a signature dialog every tap.
 *
 * Quick Login section is dev-only (gated by VITE_DEV_QUICK_LOGIN).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Zap, Mail, Plus, Wallet } from 'lucide-react';
import {
  useLoginWithOAuth,
  useLoginWithEmail,
  useWallets,
  usePrivy,
  useCreateWallet,
  useOAuthTokens,
} from '@privy-io/react-auth';
import { useUserStore } from '../stores';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Spinner } from './ui/Spinner';
import { ErrorMessage } from './ui/ErrorMessage';
import { isPrivyConfigured } from '../lib/privy';
import { fixUrl } from '../utils/urlFixer';

interface LoginPageProps {
  onLogin: () => void;
  isLoading?: boolean;
}

const IS_NATIVE = Capacitor.isNativePlatform();
const QUICK_LOGIN_ENABLED =
  (import.meta.env.VITE_DEV_QUICK_LOGIN as string | undefined) === 'true' &&
  import.meta.env.DEV;

const getAvatarUrl = (avatar: string | null | undefined, name: string): string => {
  if (avatar) return fixUrl(avatar);
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(name)}`;
};

export const LoginPage: React.FC<LoginPageProps> = () => {
  const { availableUsers, isLoading, linkPrivyWallet } = useUserStore();
  const { ready, authenticated, user: privyUser, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const walletCreationStarted = useRef(false);

  const [error, setError] = useState('');
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const [emailMode, setEmailMode] = useState<'idle' | 'sending' | 'awaiting-code'>('idle');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const linkAttempted = useRef(false);
  // If LoginPage mounted because the user just logged out, don't auto-link
  // until they actively choose a login method again — otherwise a still-warm
  // Privy session would silently re-create the BitLink session.
  // Initialize true if this page load looks like an OAuth callback (URL has
  // privy_oauth_state) or if the user recently explicitly initiated login
  // (sessionStorage flag set just before OAuth redirect).
  const sawExplicitLoginAction = useRef(
    (typeof window !== 'undefined' &&
      (window.location.search.includes('privy_oauth_') ||
        sessionStorage.getItem('bitlink_explicit_login') === '1')),
  );

  // OAuth (handles Google/Apple via Privy redirect/popup).
  const { initOAuth } = useLoginWithOAuth({
    onComplete: (params) => {
      console.log('[BitLink/oauth] onComplete', {
        loginMethod: params.loginMethod,
        isNewUser: params.isNewUser,
        wasAlreadyAuthenticated: params.wasAlreadyAuthenticated,
        loginAccountType: params.loginAccount?.type,
      });
    },
    onError: (err) => {
      console.error('[BitLink/oauth] onError', err);
      setPendingProvider(null);
      setError(typeof err === 'string' ? err : 'Sign-in failed.');
    },
  });

  // Capture OAuth tokens from Privy. `onOAuthTokenGrant` lives in the
  // `oAuthAuthorization` events namespace, not the `login` namespace — so it
  // must be wired through useOAuthTokens, not useLoginWithOAuth.
  // Privy dashboard requirement: Login methods → Google → Return OAuth tokens
  // must be enabled and saved.
  useOAuthTokens({
    onOAuthTokenGrant: ({ oAuthTokens }) => {
      console.log('[BitLink/oauth] onOAuthTokenGrant fired', {
        provider: oAuthTokens.provider,
        hasAccessToken: !!oAuthTokens.accessToken,
        accessTokenLen: oAuthTokens.accessToken?.length,
      });
      if (oAuthTokens.provider === 'google' && oAuthTokens.accessToken) {
        try {
          sessionStorage.setItem(
            'bitlink_google_access_token',
            oAuthTokens.accessToken,
          );
          console.log('[BitLink/oauth] cached Google access token');
        } catch {
          /* ignore */
        }
      }
    },
  });

  // Email + OTP
  const {
    sendCode,
    loginWithCode,
    state: emailState,
  } = useLoginWithEmail({
    onError: (err) => {
      setEmailMode('idle');
      setError(typeof err === 'string' ? err : 'Email sign-in failed.');
    },
  });

  // Manually trigger embedded-wallet creation after headless OAuth/email login.
  // Privy's `createOnLogin: 'all-users'` config only fires for the Privy-hosted
  // modal. When using `useLoginWithOAuth` / `useLoginWithEmail` directly, we
  // have to call `createWallet()` ourselves once the user is authenticated.
  useEffect(() => {
    if (!ready || !authenticated) return;
    if (!sawExplicitLoginAction.current) return;
    const hasEmbedded = wallets.some((w) => w.walletClientType === 'privy');
    if (hasEmbedded || walletCreationStarted.current) return;
    walletCreationStarted.current = true;
    console.log('[BitLink/login] no embedded wallet — creating one');
    void createWallet()
      .then((w) => console.log('[BitLink/login] wallet created', w?.address))
      .catch((e) => {
        walletCreationStarted.current = false;
        const msg = e instanceof Error ? e.message : String(e);
        // Returning users already have a wallet — Privy throws on duplicate
        // creation, which is the expected path; just note it.
        if (/already/i.test(msg)) {
          console.log('[BitLink/login] wallet already exists (returning user)');
          return;
        }
        console.error('[BitLink/login] createWallet failed', e);
        setError(msg || 'Failed to create your wallet.');
      });
  }, [ready, authenticated, wallets, createWallet]);

  // After Privy authenticates and creates the embedded wallet, link it to BitLink.
  // Critical: we MUST stash the Privy access token in localStorage before any
  // BitLink API call — apiRequest() reads `bitlink_access_token` from there
  // and uses it as the Bearer token. The backend (auth/dependencies.py) then
  // verifies it as a Privy JWT.
  useEffect(() => {
    console.log('[BitLink/login] link-effect fired', {
      ready,
      authenticated,
      walletCount: wallets.length,
      walletAddrs: wallets.map((w) => `${w.walletClientType}:${w.address?.slice(0, 8)}`),
      hasPrivyUser: !!privyUser,
      attempted: linkAttempted.current,
    });
    if (!ready || !authenticated) return;
    if (!sawExplicitLoginAction.current) {
      console.log('[BitLink/login] skipping auto-link: no explicit login action this session');
      return;
    }
    const wallet = wallets.find((w) => w.walletClientType === 'privy') ?? wallets[0];
    if (!wallet?.address) {
      console.log('[BitLink/login] waiting for embedded wallet to be created…');
      return;
    }
    if (linkAttempted.current) return;

    linkAttempted.current = true;
    const email = privyUser?.email?.address;
    const name = privyUser?.google?.name ?? privyUser?.apple?.email ?? email ?? undefined;

    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          throw new Error('Privy did not return an access token.');
        }
        localStorage.setItem('bitlink_access_token', token);

        // If we captured a Google OAuth token during login, pull the real
        // profile picture from Google's userinfo endpoint and pass it to
        // the backend as `avatar`. Best-effort: failures are non-fatal.
        let avatar: string | undefined;
        try {
          const googleToken = sessionStorage.getItem('bitlink_google_access_token');
          if (googleToken) {
            const res = await fetch(
              'https://openidconnect.googleapis.com/v1/userinfo',
              { headers: { Authorization: `Bearer ${googleToken}` } },
            );
            if (res.ok) {
              const info = (await res.json()) as { picture?: string };
              if (info.picture) avatar = info.picture;
            }
            sessionStorage.removeItem('bitlink_google_access_token');
          }
        } catch (e) {
          console.warn('[BitLink/login] failed to fetch Google picture', e);
        }

        console.log('[BitLink/login] calling /api/wallet/link', {
          wallet: wallet.address,
          hasAvatar: !!avatar,
        });
        await linkPrivyWallet({
          embedded_wallet_address: wallet.address,
          email,
          name,
          avatar,
        });
        try {
          sessionStorage.removeItem('bitlink_explicit_login');
        } catch {
          /* ignore */
        }
        console.log('[BitLink/login] linked successfully');
      } catch (e) {
        console.error('[BitLink/login] link failed', e);
        linkAttempted.current = false;
        setError(e instanceof Error ? e.message : 'Could not link wallet to BitLink.');
      }
    })();
  }, [ready, authenticated, wallets, privyUser, linkPrivyWallet, getAccessToken]);

  const markExplicitLogin = () => {
    sawExplicitLoginAction.current = true;
    try {
      sessionStorage.setItem('bitlink_explicit_login', '1');
    } catch {
      /* ignore */
    }
  };

  const startOAuth = async (provider: 'google' | 'apple') => {
    setError('');
    setPendingProvider(provider);
    markExplicitLogin();
    try {
      await initOAuth({ provider });
    } catch (err) {
      setPendingProvider(null);
      setError((err as Error).message || 'Sign-in failed.');
    }
  };

  const handleSendCode = async () => {
    setError('');
    if (!email.trim()) {
      setError('Enter your email.');
      return;
    }
    setEmailMode('sending');
    markExplicitLogin();
    try {
      await sendCode({ email: email.trim() });
      setEmailMode('awaiting-code');
    } catch (err) {
      setEmailMode('idle');
      setError((err as Error).message || 'Could not send code.');
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    if (!code.trim()) {
      setError('Enter the code we sent you.');
      return;
    }
    markExplicitLogin();
    try {
      await loginWithCode({ code: code.trim() });
    } catch (err) {
      setError((err as Error).message || 'Invalid code.');
    }
  };

  const handleQuickLogin = async (userId: number) => {
    // Dev-only path: hit a debug endpoint to mint a session for an existing
    // seeded user. Used by E2E tests + local development.
    setError('');
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8003'}/api/auth/dev-login?user_id=${userId}`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error('Dev login disabled. Set DEV_QUICK_LOGIN=1 on the API.');
      const data = await res.json();
      localStorage.setItem('bitlink_access_token', data.access_token);
      localStorage.setItem('bitlink_refresh_token', data.refresh_token);
      window.location.reload();
    } catch (err) {
      setError((err as Error).message || 'Quick login failed.');
    }
  };

  const privyReady = isPrivyConfigured() && ready;
  const oauthLoading = pendingProvider !== null;
  const emailLoading = emailMode === 'sending' || emailState.status === 'submitting-code';

  return (
    <div className="min-h-screen bg-black flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-orange-900/10 via-black to-amber-900/5" />

      <div className="relative z-10 flex-1 flex flex-col items-center px-6 py-12 overflow-y-auto">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl mb-4">
            <Zap className="w-7 h-7 text-white fill-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1.5 font-display">
            <span className="text-orange-500">Bit</span>Link
          </h1>
          <p className="text-stone-500 text-sm">Tip creators in stablecoins.</p>
        </div>

        <div className="w-full max-w-xs space-y-5">
          {!isPrivyConfigured() && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-amber-300 text-xs">
              Wallet sign-in is disabled in this build. Set{' '}
              <span className="font-mono">VITE_PRIVY_APP_ID</span> to enable.
            </div>
          )}

          {/* Apple */}
          <button
            onClick={() => startOAuth('apple')}
            disabled={!privyReady || oauthLoading || isLoading}
            className="w-full flex items-center justify-center gap-3 bg-white text-black font-semibold py-3.5 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {pendingProvider === 'apple' ? (
              <Spinner size="sm" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
            )}
            Sign in with Apple
          </button>

          {/* Google */}
          <button
            onClick={() => startOAuth('google')}
            disabled={!privyReady || oauthLoading || isLoading}
            className="w-full flex items-center justify-center gap-3 bg-stone-900 border border-stone-700 text-stone-100 font-semibold py-3.5 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {pendingProvider === 'google' ? (
              <Spinner size="sm" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            Sign in with Google
          </button>

          {/* Email + OTP */}
          {emailMode === 'awaiting-code' ? (
            <div className="space-y-3 border border-stone-700 rounded-xl p-4 bg-stone-900">
              <p className="text-stone-300 text-sm">
                We sent a code to <span className="font-mono text-white">{email}</span>.
              </p>
              <Input
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoFocus
              />
              <Button fullWidth loading={emailLoading} onClick={handleVerifyCode}>
                Continue
              </Button>
              <button
                onClick={() => {
                  setEmailMode('idle');
                  setCode('');
                }}
                className="w-full text-stone-400 text-sm py-1"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <div className="space-y-3 border border-stone-700 rounded-xl p-4 bg-stone-900">
              <Input
                placeholder="you@email.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim())}
                disabled={emailMode === 'sending'}
              />
              <Button
                fullWidth
                loading={emailMode === 'sending'}
                disabled={!privyReady || !email}
                onClick={handleSendCode}
              >
                <Mail size={16} /> Continue with email
              </Button>
            </div>
          )}

          {/* External wallet — defer to Privy modal if user wants it */}
          {!IS_NATIVE && (
            <button
              onClick={() => startOAuth('discord' as 'google')}
              disabled
              className="hidden"
              aria-hidden
            >
              <Wallet size={18} />
            </button>
          )}

          {error && <ErrorMessage message={error} />}

          {/* Dev quick login (gated) */}
          {QUICK_LOGIN_ENABLED && availableUsers.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-stone-800">
              <p className="text-stone-400 text-[11px] font-semibold uppercase tracking-wider px-1">
                Dev Quick Login
              </p>
              {availableUsers.slice(0, 5).map((user) => (
                <button
                  key={user.id}
                  data-testid={`login-user-${user.handle}`}
                  onClick={() => handleQuickLogin(user.id)}
                  disabled={isLoading}
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl p-3 flex items-center gap-3 active:scale-[0.98] transition-all disabled:opacity-50 text-left"
                >
                  <img
                    src={getAvatarUrl(user.avatar, user.name)}
                    alt={user.name}
                    className="w-9 h-9 rounded-full object-cover shrink-0 border border-stone-700"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.onerror = null;
                      img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=ea580c&color=fff&size=150`;
                    }}
                  />
                  <div className="min-w-0">
                    <span className="text-white text-sm font-medium block">{user.name}</span>
                    <span className="text-stone-500 text-xs">@{user.handle}</span>
                  </div>
                </button>
              ))}
              <p className="text-[10px] text-stone-600 px-1 flex items-center gap-1">
                <Plus size={10} /> Dev only — set VITE_DEV_QUICK_LOGIN=true
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
