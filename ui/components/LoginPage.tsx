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
import { connectWallet, signMessage, disconnectWallet } from '../utils/walletConnect';

const getAvatarUrl = (avatar: string | null | undefined, name: string): string => {
  if (avatar) return fixUrl(avatar);
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(name)}`;
};

interface LoginPageProps {
  onLogin: () => void;
  isLoading?: boolean;
}

interface GoogleCredentialResponse {
  credential: string;
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const IS_NATIVE = Capacitor.isNativePlatform();

export const LoginPage: React.FC<LoginPageProps> = () => {
  const { availableUsers, fetchUsers, selectUser, createUser, loginWithGoogle, loginWithWallet, isLoading } = useUserStore();
  const [showCreate, setShowCreate] = useState(false);
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [error, setError] = useState('');
  const [walletLoading, setWalletLoading] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const handleGoogleCredential = useCallback(async (response: GoogleCredentialResponse) => {
    try {
      setError('');
      setGoogleLoading(true);
      await loginWithGoogle(response.credential);
    } catch (err) {
      setError((err as Error).message || 'Google sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  }, [loginWithGoogle]);

  useEffect(() => {
    fetchUsers();

    if (IS_NATIVE || !GOOGLE_CLIENT_ID) return;

    // Web: load Google Identity Services
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
      });
      if (googleButtonRef.current) {
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        window.google?.accounts.id.renderButton(googleButtonRef.current, {
          type: 'standard',
          shape: 'rectangular',
          theme: isDark ? 'filled_black' : 'outline',
          size: 'large',
          width: 320,
          text: 'signin_with',
          logo_alignment: 'left',
        });
      }
    };
    document.head.appendChild(script);
    return () => { script.remove(); };
  }, [handleGoogleCredential]);

  const handleNativeGoogleLogin = async () => {
    setGoogleLoading(true);
    setError('');
    try {
      const { GoogleSignIn } = await import('@capawesome/capacitor-google-sign-in');
      await GoogleSignIn.initialize();
      const result = await GoogleSignIn.signIn();
      if (result.idToken) {
        await loginWithGoogle(result.idToken);
      } else {
        throw new Error('No ID token received from Google');
      }
    } catch (err) {
      const msg = (err as Error).message || 'Google sign-in failed';
      if (!msg.includes('canceled') && !msg.includes('cancelled')) {
        setError(msg);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleWalletLogin = async (walletType: 'metamask' | 'binance' | 'phantom') => {
    setWalletLoading(walletType);
    setError('');
    try {
      if (IS_NATIVE) {
        await handleNativeWalletLogin(walletType);
      } else if (walletType === 'phantom') {
        await handlePhantomBrowserLogin();
      } else {
        await handleEvmBrowserLogin(walletType);
      }
    } catch (err) {
      console.error(`${walletType} login error:`, err);
      setError((err as Error).message || `${walletType} connection failed`);
    } finally {
      setWalletLoading(null);
    }
  };

  const handleNativeWalletLogin = async (walletType: 'metamask' | 'binance' | 'phantom') => {
    const { address, chain } = await connectWallet(walletType);
    const { nonce, message } = await api.getWeb3Nonce(address, chain);
    const signature = await signMessage(message, address);
    await loginWithWallet(address, chain, signature, nonce);
    await disconnectWallet();
  };

  const handleEvmBrowserLogin = async (walletType: 'metamask' | 'binance') => {
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

  const handlePhantomBrowserLogin = async () => {
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
          {IS_NATIVE ? (
            <button
              onClick={handleNativeGoogleLogin}
              disabled={isLoading || googleLoading}
              className="w-full flex items-center justify-center gap-3 bg-white text-stone-800 font-semibold py-3.5 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {googleLoading ? (
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
          ) : GOOGLE_CLIENT_ID ? (
            <div className="flex justify-center">
              <div ref={googleButtonRef} />
            </div>
          ) : null}

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
                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #534BB1, #551BF9)' }}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#fff">
                    <path d="M12 2C7.58 2 4 5.58 4 10v8.5c0 .83.67 1.5 1.5 1.5S7 19.33 7 18.5V17a1 1 0 0 1 2 0v1.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V17a1 1 0 0 1 2 0v1.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V17a1 1 0 0 1 2 0v1.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V10c0-4.42-3.58-8-8-8zm-2.5 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
                  </svg>
                </div>
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
