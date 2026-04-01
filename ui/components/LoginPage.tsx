import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Zap, Plus, Wallet, ChevronDown } from 'lucide-react';
import { useUserStore } from '../stores';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Spinner } from './ui/Spinner';
import { ErrorMessage } from './ui/ErrorMessage';
import { api } from '../api/client';
import { fixUrl } from '../utils/urlFixer';

const getAvatarUrl = (avatar: string | null | undefined, name: string): string => {
  if (avatar) return fixUrl(avatar);
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(name)}`;
};

interface LoginPageProps {
  onLogin: () => void;
  isLoading?: boolean;
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GOOGLE_CONFIGURED = !!GOOGLE_CLIENT_ID;
const IS_NATIVE = Capacitor.isNativePlatform();

export const LoginPage: React.FC<LoginPageProps> = () => {
  const { availableUsers, fetchUsers, selectUser, createUser, loginWithGoogle, loginWithWallet, isLoading } = useUserStore();
  const [showCreate, setShowCreate] = useState(false);
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [error, setError] = useState('');
  const [walletLoading, setWalletLoading] = useState<string | null>(null);
  const [nativeGoogleReady, setNativeGoogleReady] = useState(false);
  const googleInitialized = useRef(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const handleGoogleCredential = useCallback(async (response: GoogleCredentialResponse) => {
    try {
      setError('');
      await loginWithGoogle(response.credential);
    } catch (err) {
      console.error('Google login error:', err);
      setError((err as Error).message || 'Google sign-in failed');
    }
  }, [loginWithGoogle]);

  useEffect(() => {
    fetchUsers();

    if (!GOOGLE_CONFIGURED || googleInitialized.current) return;

    if (IS_NATIVE) {
      let cancelled = false;

      const initNativeGoogle = async () => {
        try {
          const { GoogleSignIn } = await import('@capawesome/capacitor-google-sign-in');
          await GoogleSignIn.initialize({
            clientId: GOOGLE_CLIENT_ID!,
          });
          if (!cancelled) {
            googleInitialized.current = true;
            setNativeGoogleReady(true);
          }
        } catch (err) {
          console.error('Native Google initialization failed:', err);
          if (!cancelled) {
            setNativeGoogleReady(false);
          }
        }
      };

      void initNativeGoogle();

      return () => {
        cancelled = true;
      };
    }

    const initGis = () => {
      if (!window.google?.accounts?.id) return false;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID!,
        callback: handleGoogleCredential,
        auto_select: false,
        itp_support: true,
      });
      if (googleButtonRef.current) {
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          text: 'continue_with',
          width: 320,
        });
      }
      googleInitialized.current = true;
      return true;
    };

    if (!initGis()) {
      const interval = setInterval(() => {
        if (initGis()) clearInterval(interval);
      }, 200);
      setTimeout(() => clearInterval(interval), 5000);
      return () => clearInterval(interval);
    }
  }, [handleGoogleCredential]);

  const handleGoogleClick = async () => {
    if (IS_NATIVE) {
      if (!nativeGoogleReady) {
        setError('Google sign-in is still loading. Please try again.');
        return;
      }

      try {
        setError('');
        const { GoogleSignIn } = await import('@capawesome/capacitor-google-sign-in');
        const result = await GoogleSignIn.signIn();
        if (!result.idToken) {
          throw new Error('No ID token received');
        }
        await loginWithGoogle(result.idToken);
      } catch (err) {
        console.error('Native Google login error:', err);
        setError((err as Error).message || 'Google sign-in failed');
      }
      return;
    }

    const gisButton = googleButtonRef.current?.querySelector<HTMLElement>('div[role="button"]');
    if (gisButton) {
      gisButton.click();
    } else if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      setError('Google sign-in is not available on this device');
    }
  };

  const handleWalletLogin = async (walletType: 'metamask' | 'binance' | 'phantom') => {
    setWalletLoading(walletType);
    setError('');
    try {
      if (walletType === 'phantom') {
        await handlePhantomLogin();
      } else {
        await handleEvmWalletLogin(walletType);
      }
    } catch (err) {
      console.error(`${walletType} login error:`, err);
      setError((err as Error).message || `${walletType} connection failed`);
    } finally {
      setWalletLoading(null);
    }
  };

  const handleEvmWalletLogin = async (walletType: 'metamask' | 'binance') => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      throw new Error(`${walletType === 'metamask' ? 'MetaMask' : 'Binance Wallet'} not detected. Please install the extension.`);
    }
    const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts.length) throw new Error('No accounts found');
    const address = accounts[0];
    const chainId: string = await ethereum.request({ method: 'eth_chainId' });
    const chain = chainId === '0x38' || chainId === '0x61' ? 'bnb' : 'ethereum';
    const { nonce, message } = await api.getWeb3Nonce(address, chain);
    const signature: string = await ethereum.request({
      method: 'personal_sign',
      params: [message, address],
    });
    await loginWithWallet(address, chain, signature, nonce);
  };

  const handlePhantomLogin = async () => {
    const phantom = (window as any).solana;
    if (!phantom?.isPhantom) {
      throw new Error('Phantom wallet not detected. Please install the extension.');
    }
    const resp = await phantom.connect();
    const address = resp.publicKey.toString();
    const { nonce, message } = await api.getWeb3Nonce(address, 'solana');
    const encodedMessage = new TextEncoder().encode(message);
    const signedMessage = await phantom.signMessage(encodedMessage, 'utf8');
    const bs58 = await import('bs58');
    const signature = bs58.default.encode(signedMessage.signature);
    await loginWithWallet(address, 'solana', signature, nonce);
  };

  const handleSelectUser = async (userId: number) => {
    try {
      await selectUser(userId);
    } catch {
      setError('Failed to select user');
    }
  };

  const handleCreateUser = async () => {
    if (!name.trim() || !handle.trim()) {
      setError('Name and handle are required');
      return;
    }
    try {
      setError('');
      await createUser(name.trim(), handle.trim());
    } catch (err) {
      setError((err as Error).message || 'Failed to create user');
    }
  };

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
          <p className="text-stone-500 text-sm">Like. Invest. Earn.</p>
        </div>

        <div className="w-full max-w-xs space-y-5">
          {/* Test Accounts */}
          {availableUsers.length > 0 && (
            <div className="space-y-2">
              <p className="text-stone-400 text-[11px] font-semibold uppercase tracking-wider px-1">Quick Login</p>
              {availableUsers.map((user) => (
                <button
                  key={user.id}
                  data-testid={`login-user-${user.handle}`}
                  onClick={() => handleSelectUser(user.id)}
                  disabled={isLoading}
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl p-3 flex items-center gap-3 active:scale-[0.98] transition-all disabled:opacity-50 text-left"
                >
                  <img
                    src={getAvatarUrl(user.avatar, user.name)}
                    alt={user.name}
                    className="w-9 h-9 rounded-full object-cover shrink-0 border border-stone-700"
                    onError={(e) => { (e.target as HTMLImageElement).onerror = null; (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=ea580c&color=fff&size=150`; }}
                  />
                  <div className="min-w-0">
                    <span className="text-white text-sm font-medium block">{user.name}</span>
                    <span className="text-stone-500 text-xs">@{user.handle}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {isLoading && !availableUsers.length && (
            <div className="flex justify-center py-4"><Spinner size="sm" /></div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-stone-700" />
            <span className="text-stone-500 text-xs">or</span>
            <div className="flex-1 h-px bg-stone-700" />
          </div>

          {/* Google Sign-In */}
          {GOOGLE_CONFIGURED && (
            <>
              <div ref={googleButtonRef} className="hidden" />
              <button
                onClick={handleGoogleClick}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 font-semibold py-3.5 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
                style={{ backgroundColor: '#ffffff', color: '#1c1917' }}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
            </>
          )}

          {/* Wallet picker */}
          <button
            onClick={() => setShowWalletPicker(!showWalletPicker)}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2.5 bg-stone-900 border border-stone-700 text-stone-200 font-semibold py-3.5 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Wallet size={18} className="text-orange-500" />
            Connect Wallet
            <ChevronDown size={16} className={`text-stone-400 transition-transform ${showWalletPicker ? 'rotate-180' : ''}`} />
          </button>

          {showWalletPicker && (
            <div className="space-y-2">
              <button
                onClick={() => handleWalletLogin('metamask')}
                disabled={!!walletLoading}
                className="w-full flex items-center gap-3 bg-stone-900 border border-stone-700 text-stone-200 py-3 px-4 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" className="w-6 h-6" />
                <span className="flex-1 text-left text-sm font-medium">MetaMask</span>
                {walletLoading === 'metamask' && <Spinner size="sm" />}
              </button>

              <button
                onClick={() => handleWalletLogin('binance')}
                disabled={!!walletLoading}
                className="w-full flex items-center gap-3 bg-stone-900 border border-stone-700 text-stone-200 py-3 px-4 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <svg className="w-6 h-6" viewBox="0 0 126.61 126.61" fill="#F3BA2F">
                  <path d="m38.73 53.2 24.59-24.58 24.6 24.6 14.3-14.31L63.32 0 24.42 38.9zM0 63.31l14.3-14.31 14.31 14.31-14.31 14.3zm38.73 10.11 24.59 24.59 24.6-24.6 14.31 14.29-38.91 38.91-38.9-38.9zM98 63.31l14.3-14.31 14.31 14.31-14.31 14.3z"/>
                  <path d="M77.83 63.3 63.32 48.78 52.59 59.51l-1.24 1.23-2.54 2.54 14.51 14.52L77.83 63.3z"/>
                </svg>
                <span className="flex-1 text-left text-sm font-medium">Binance Wallet</span>
                {walletLoading === 'binance' && <Spinner size="sm" />}
              </button>

              <button
                onClick={() => handleWalletLogin('phantom')}
                disabled={!!walletLoading}
                className="w-full flex items-center gap-3 bg-stone-900 border border-stone-700 text-stone-200 py-3 px-4 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <svg className="w-6 h-6" viewBox="0 0 128 128" fill="none">
                  <rect width="128" height="128" rx="26" fill="url(#phantom-grad)"/>
                  <path d="M110.584 64.914H99.142c0-24.283-19.683-43.965-43.965-43.965-23.838 0-43.236 18.984-43.928 42.666-.722 24.703 19.67 45.264 44.373 45.264h2.669c22.237 0 42.46-13.532 50.848-34.182a4.358 4.358 0 0 0-4.043-5.958c-1.783 0-3.378 1.09-4.037 2.753-6.636 16.327-22.555 27.013-40.093 27.013h-2.669c-18.778 0-34.593-15.6-33.973-34.374.588-17.8 15.569-32.157 33.379-32.157 18.43 0 33.38 14.95 33.38 33.38v3.826c0 2.635-2.136 4.771-4.771 4.771-2.636 0-4.771-2.136-4.771-4.771V53.33c0-1.685-.963-3.222-2.481-3.955a4.341 4.341 0 0 0-4.676.551 23.544 23.544 0 0 0-7.093-1.084c-13.14 0-23.783 10.643-23.783 23.783s10.643 23.783 23.783 23.783c7.586 0 14.35-3.554 18.708-9.084a14.283 14.283 0 0 0 11.327 5.541c7.88 0 14.275-6.395 14.275-14.275v-3.826c.001-5.503-1.048-10.765-2.95-15.601a4.352 4.352 0 0 0-4.037-2.753 4.355 4.355 0 0 0-4.051 5.964 33.63 33.63 0 0 1 2.534 12.39v3.826c0 2.635-2.135 4.77-4.771 4.77-2.635 0-4.771-2.135-4.771-4.77V64.914zm-43.927 14.74c-8.137 0-14.74-6.602-14.74-14.74 0-8.137 6.603-14.74 14.74-14.74 8.138 0 14.74 6.603 14.74 14.74 0 8.138-6.602 14.74-14.74 14.74z" fill="#fff"/>
                  <defs><linearGradient id="phantom-grad" x1="0" y1="0" x2="128" y2="128"><stop stopColor="#534BB1"/><stop offset="1" stopColor="#551BF9"/></linearGradient></defs>
                </svg>
                <span className="flex-1 text-left text-sm font-medium">Phantom</span>
                {walletLoading === 'phantom' && <Spinner size="sm" />}
              </button>
            </div>
          )}

          {error && <ErrorMessage message={error} />}

          {/* New User */}
          {showCreate ? (
            <div className="space-y-3 border border-stone-700 rounded-xl p-4 bg-stone-900">
              <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="Handle" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} />
              <Button fullWidth loading={isLoading} onClick={handleCreateUser}>
                <Plus size={16} /> Create
              </Button>
              <button onClick={() => setShowCreate(false)} className="w-full text-stone-400 text-sm py-1">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full border border-dashed border-stone-600 rounded-xl p-2.5 text-stone-400 text-xs flex items-center justify-center gap-1"
            >
              <Plus size={14} /> New Test Account
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
