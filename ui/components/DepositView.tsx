import React, { useEffect, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, RefreshCw, Clock, CheckCircle2, AlertCircle, ChevronDown } from 'lucide-react';
import { useWalletStore, useUserStore } from '../stores';
import { Header } from './ui/Header';
import { Spinner } from './ui/Spinner';
import { Badge } from './ui/Badge';
import { EmptyState } from './ui/EmptyState';

interface DepositViewProps {
  onBack: () => void;
}

const ChainIcon: React.FC<{ chain: string; className?: string }> = ({ chain, className = 'w-5 h-5' }) => {
  switch (chain) {
    case 'tron':
      return (
        <svg viewBox="0 0 32 32" className={className}>
          <circle cx="16" cy="16" r="16" fill="#EF0027"/>
          <path d="M21.932 9.913L7.5 7.257l7.595 19.112 10.583-12.894-3.746-3.562zm-.232 1.17l2.208 2.099-6.038 1.093 3.83-3.192zm-5.142 2.973l-6.364-5.278 10.402 1.896-4.038 3.382zm-.453.934l-1.038 8.58L9.472 9.487l6.633 5.503zm.306.503l5.78-1.042-7.234 8.817.454-7.775z" fill="#FFF"/>
        </svg>
      );
    case 'eth':
      return (
        <svg viewBox="0 0 32 32" className={className}>
          <circle cx="16" cy="16" r="16" fill="#627EEA"/>
          <path d="M16.498 4v8.87l7.497 3.35L16.498 4z" fill="#FFF" fillOpacity=".6"/>
          <path d="M16.498 4L9 16.22l7.498-3.35V4z" fill="#FFF"/>
          <path d="M16.498 21.968v6.027L24 17.616l-7.502 4.352z" fill="#FFF" fillOpacity=".6"/>
          <path d="M16.498 27.995v-6.028L9 17.616l7.498 10.379z" fill="#FFF"/>
          <path d="M16.498 20.573l7.497-4.353-7.497-3.348v7.701z" fill="#FFF" fillOpacity=".2"/>
          <path d="M9 16.22l7.498 4.353v-7.701L9 16.22z" fill="#FFF" fillOpacity=".6"/>
        </svg>
      );
    case 'bsc':
      return (
        <svg viewBox="0 0 32 32" className={className}>
          <circle cx="16" cy="16" r="16" fill="#F3BA2F"/>
          <path d="M12.116 14.404L16 10.52l3.886 3.886 2.26-2.26L16 6l-6.144 6.144 2.26 2.26zM6 16l2.26-2.26L10.52 16l-2.26 2.26L6 16zm6.116 1.596L16 21.48l3.886-3.886 2.26 2.259L16 26l-6.144-6.144-.003-.003 2.263-2.257zM21.48 16l2.26-2.26L26 16l-2.26 2.26L21.48 16zm-3.188-.002h.002L16 13.706l-1.89 1.89-.348.349-.534.533.002.003.88.88L16 18.294l2.293-2.293.001-.001-.002-.002z" fill="#FFF"/>
        </svg>
      );
    case 'polygon':
      return (
        <svg viewBox="0 0 32 32" className={className}>
          <circle cx="16" cy="16" r="16" fill="#8247E5"/>
          <path d="M21.092 12.693c-.369-.215-.848-.215-1.254 0l-2.879 1.654-1.955 1.078-2.879 1.653c-.369.216-.848.216-1.254 0l-2.288-1.294c-.369-.215-.627-.61-.627-1.042V12.19c0-.431.221-.826.627-1.042l2.25-1.258c.37-.216.85-.216 1.256 0l2.25 1.258c.37.216.628.611.628 1.042v1.654l1.955-1.115v-1.653a1.16 1.16 0 00-.627-1.042l-4.17-2.372c-.369-.216-.848-.216-1.254 0l-4.244 2.372A1.16 1.16 0 006 11.076v4.78c0 .432.221.827.627 1.043l4.244 2.372c.369.215.849.215 1.254 0l2.879-1.618 1.955-1.114 2.879-1.617c.369-.216.848-.216 1.254 0l2.251 1.258c.37.215.627.61.627 1.042v2.552c0 .431-.22.826-.627 1.042l-2.25 1.294c-.37.216-.85.216-1.255 0l-2.251-1.258c-.37-.216-.628-.611-.628-1.042v-1.654l-1.955 1.115v1.653c0 .431.221.827.627 1.042l4.244 2.372c.369.216.848.216 1.254 0l4.244-2.372c.369-.215.627-.61.627-1.042v-4.78a1.16 1.16 0 00-.627-1.042l-4.28-2.409z" fill="#FFF"/>
        </svg>
      );
    default:
      return (
        <div className={`${className} rounded-full bg-stone-700 flex items-center justify-center`}>
          <span className="text-xs text-stone-400">?</span>
        </div>
      );
  }
};

export const DepositView: React.FC<DepositViewProps> = ({ onBack }) => {
  const { currentUser } = useUserStore();
  const {
    depositAddress,
    deposits,
    chainFees,
    isLoadingAddress,
    isLoadingDeposits,
    addressError,
    fetchDepositAddress,
    fetchDeposits,
    fetchChainFees,
    fetchCryptoBalance,
  } = useWalletStore();

  const [copied, setCopied] = useState(false);
  const [selectedChain, setSelectedChain] = useState('tron');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    if (currentUser?.id) {
      fetchDepositAddress(currentUser.id, selectedChain).catch(() => {});
      fetchDeposits(currentUser.id).catch(() => {});
      fetchChainFees().catch(() => {});
    }
  }, [currentUser?.id]);

  const handleRefreshDeposits = useCallback(async () => {
    if (!currentUser?.id || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchDeposits(currentUser.id),
        fetchCryptoBalance(currentUser.id),
      ]);
    } catch {}
    setIsRefreshing(false);
  }, [currentUser?.id, isRefreshing]);

  const handleChainSelect = (chain: string) => {
    if (chain === selectedChain) return;
    setSelectedChain(chain);
    setIsDropdownOpen(false);
    if (currentUser?.id) {
      fetchDepositAddress(currentUser.id, chain).catch(() => {});
    }
  };

  const selectedChainData = chainFees.find(f => f.chain === selectedChain);

  const handleCopy = async () => {
    if (depositAddress) {
      await navigator.clipboard.writeText(depositAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isLoading = isLoadingAddress || isLoadingDeposits;
  const selectedChainFee = chainFees.find(f => f.chain === selectedChain);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-stone-500" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black overflow-y-auto sub-view">
      <Header title="Deposit" onBack={onBack} />

      <div className="px-4 py-6 space-y-6">
        {/* Network Dropdown */}
        {chainFees.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-stone-400">Select Network</h3>
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full p-4 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-between hover:border-stone-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <ChainIcon chain={selectedChain} className="w-6 h-6" />
                  <div className="text-left">
                    <div className="text-white font-medium">
                      {selectedChain.toUpperCase()}
                      {selectedChain === 'tron' && <span className="text-stone-500 text-xs ml-2">TRC-20</span>}
                    </div>
                    {selectedChainData?.enabled && (
                      <div className="text-xs text-stone-400">
                        Min ${selectedChainData.min_deposit} • Fee ${selectedChainData.network_fee.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
                <ChevronDown className={`w-5 h-5 text-stone-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />
                  <div className="absolute top-full left-0 right-0 mt-2 bg-stone-900 border border-stone-800 rounded-xl overflow-hidden z-20 shadow-xl">
                    {chainFees.map((chain) => (
                      <button
                        key={chain.chain}
                        onClick={() => chain.enabled && handleChainSelect(chain.chain)}
                        disabled={!chain.enabled}
                        className={`w-full p-4 flex items-center gap-3 transition-colors ${
                          selectedChain === chain.chain
                            ? 'bg-orange-500/10'
                            : chain.enabled
                              ? 'hover:bg-stone-800'
                              : 'opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <ChainIcon chain={chain.chain} className="w-6 h-6" />
                        <div className="text-left flex-1">
                          <div className={`font-medium ${selectedChain === chain.chain ? 'text-orange-500' : 'text-white'}`}>
                            {chain.chain.toUpperCase()}
                            {chain.chain === 'tron' && <span className="text-stone-500 text-xs ml-2">TRC-20</span>}
                          </div>
                          {chain.enabled ? (
                            <div className="text-xs text-stone-400">
                              Min ${chain.min_deposit} • Fee ${chain.network_fee.toFixed(2)}
                            </div>
                          ) : (
                            <div className="text-xs text-stone-500">Coming soon</div>
                          )}
                        </div>
                        {selectedChain === chain.chain && (
                          <Check className="w-5 h-5 text-orange-500" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* QR Code Card */}
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
          <div className="flex justify-center mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/30 rounded-full">
              <ChainIcon chain={selectedChain} className="w-4 h-4" />
              <span className="text-orange-500 text-sm font-medium">
                {selectedChain.toUpperCase()} Network
                {selectedChain === 'tron' && ' (Shasta Testnet)'}
              </span>
            </div>
          </div>

          {isLoadingAddress && !depositAddress ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : addressError ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
              <p className="text-red-400 text-sm">{addressError}</p>
            </div>
          ) : depositAddress ? (
            <>
              {/* QR Code */}
              <div className="flex justify-center mb-6">
                <div className="bg-white p-4 rounded-xl">
                  <QRCodeSVG
                    value={depositAddress}
                    size={180}
                    level="H"
                    includeMargin={false}
                  />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-2">
                <p className="text-stone-500 text-xs text-center">Deposit Address</p>
                <div className="bg-stone-800 rounded-xl p-3 flex items-center gap-3">
                  <p className="flex-1 text-white text-sm font-mono break-all">
                    {depositAddress}
                  </p>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 p-2 bg-stone-700 hover:bg-stone-600 rounded-lg transition-colors"
                    aria-label={copied ? "Copied" : "Copy address"}
                  >
                    {copied ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : (
                      <Copy className="w-5 h-5 text-stone-400" />
                    )}
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                <p className="text-amber-500 text-xs">
                  Send USDT ({selectedChain.toUpperCase()}) to this address. Min: ${selectedChainFee?.min_deposit || 5}.
                </p>
                {selectedChainFee && (
                  <p className="text-amber-400/70 text-xs">
                    Network fee: ${selectedChainFee.network_fee.toFixed(2)} (deducted from deposit)
                  </p>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Recent Deposits */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-bold">Recent Deposits</h2>
            <button
              onClick={handleRefreshDeposits}
              disabled={isLoading || isRefreshing}
              className="p-2 -mr-2 text-stone-400 hover:text-white disabled:opacity-50 transition-colors active:scale-95"
              aria-label="Refresh deposits"
            >
              <RefreshCw className={`w-4.5 h-4.5 ${isRefreshing ? 'animate-spin text-orange-500' : ''}`} />
            </button>
          </div>

          {deposits.length === 0 ? (
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-2">
              <EmptyState icon={Clock} message="No deposits yet" />
            </div>
          ) : (
            <div className="space-y-2">
              {deposits.map((deposit) => (
                <div
                  key={deposit.id}
                  className="bg-stone-900 border border-stone-800 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(deposit.status)}
                      <span className="text-white font-medium">
                        +{deposit.amount_formatted}
                      </span>
                    </div>
                    <span className="text-stone-500 text-xs">
                      {formatDate(deposit.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500 text-xs font-mono">
                      {deposit.tx_hash.slice(0, 8)}...{deposit.tx_hash.slice(-8)}
                    </span>
                    <Badge variant={deposit.status === 'confirmed' ? 'green' : 'yellow'}>
                      {deposit.confirmations} confirmation{deposit.confirmations !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
