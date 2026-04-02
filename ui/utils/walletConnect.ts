import EthereumProvider from '@walletconnect/ethereum-provider';
import { Capacitor } from '@capacitor/core';

const WC_PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID as string | undefined;

export type WalletType = 'metamask' | 'binance' | 'phantom';

const WALLET_CONFIG: Record<WalletType, {
  chains: number[];
  optionalChains: number[];
  connectLink: (uri: string) => string;
  appLink: string;
}> = {
  metamask: {
    chains: [1],
    optionalChains: [56],
    connectLink: (uri) => `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
    appLink: 'https://metamask.app.link/',
  },
  binance: {
    chains: [56],
    optionalChains: [1],
    connectLink: (uri) => `bnc://app.binance.com/cedefi/wc?uri=${encodeURIComponent(uri)}`,
    appLink: 'bnc://app.binance.com/cedefi',
  },
  phantom: {
    chains: [1],
    optionalChains: [56],
    connectLink: (uri) => `https://phantom.app/ul/wc?uri=${encodeURIComponent(uri)}`,
    appLink: 'https://phantom.app/ul/',
  },
};

let provider: InstanceType<typeof EthereumProvider> | null = null;
let activeWallet: WalletType | null = null;

function openNativeLink(url: string) {
  if (!Capacitor.isNativePlatform()) return;
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function connectWallet(wallet: WalletType): Promise<{ address: string; chain: string }> {
  if (!WC_PROJECT_ID) {
    throw new Error('WalletConnect not configured');
  }

  const config = WALLET_CONFIG[wallet];
  activeWallet = wallet;

  provider = await EthereumProvider.init({
    projectId: WC_PROJECT_ID,
    chains: config.chains,
    optionalChains: config.optionalChains,
    showQrModal: !Capacitor.isNativePlatform(),
    metadata: {
      name: 'BitLink',
      description: 'Like. Invest. Earn.',
      url: 'https://bit-link.app',
      icons: ['https://bit-link.app/icon.png'],
    },
  });

  provider.on('display_uri', (uri: string) => {
    if (Capacitor.isNativePlatform()) {
      openNativeLink(config.connectLink(uri));
    }
  });

  await provider.connect();

  const accounts = provider.accounts;
  if (!accounts.length) throw new Error('No accounts returned');

  const chain = provider.chainId === 56 || provider.chainId === 97 ? 'bnb' : 'ethereum';

  return { address: accounts[0], chain };
}

export async function signMessage(message: string, address: string): Promise<string> {
  if (!provider || !activeWallet) throw new Error('Wallet not connected');

  const signPromise = provider.request({
    method: 'personal_sign',
    params: [message, address],
  });

  // Re-open wallet app so user can approve the signature
  const config = WALLET_CONFIG[activeWallet];
  setTimeout(() => openNativeLink(config.appLink), 600);

  return await signPromise as string;
}

export async function disconnectWallet(): Promise<void> {
  if (provider) {
    await provider.disconnect();
    provider = null;
  }
  activeWallet = null;
}
