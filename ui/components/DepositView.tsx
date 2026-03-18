import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, RefreshCw, ArrowLeft, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { useWalletStore, useUserStore } from '../stores';

interface DepositViewProps {
  onBack: () => void;
}

const CHAIN_ICONS: Record<string, string> = {
  tron: '⚡',
  polygon: '🔷',
  bsc: '🔶',
  eth: '⬡',
};

export const DepositView: React.FC<DepositViewProps> = ({ onBack }) => {
  const { currentUser } = useUserStore();
  const {
    depositAddress,
    deposits,
    chainFees,
    isFirstExchangeEligible,
    isLoadingAddress,
    isLoadingDeposits,
    addressError,
    fetchDepositAddress,
    fetchDeposits,
    fetchChainFees,
  } = useWalletStore();

  const [copied, setCopied] = useState(false);
  const [selectedChain, setSelectedChain] = useState('tron');

  useEffect(() => {
    if (currentUser?.id) {
      fetchDepositAddress(currentUser.id, selectedChain).catch(() => {});
      fetchDeposits(currentUser.id).catch(() => {});
      fetchChainFees().catch(() => {});
    }
  }, [currentUser?.id]);

  const handleChainSelect = (chain: string) => {
    if (chain === selectedChain) return;
    setSelectedChain(chain);
    if (currentUser?.id) {
      fetchDepositAddress(currentUser.id, chain).catch(() => {});
    }
  };

  const handleCopy = async () => {
    if (depositAddress) {
      await navigator.clipboard.writeText(depositAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRefresh = () => {
    if (currentUser?.id) {
      fetchDepositAddress(currentUser.id, selectedChain).catch(() => {});
      fetchDeposits(currentUser.id).catch(() => {});
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
        return <AlertCircle className="w-4 h-4 text-zinc-500" />;
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
    <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/95 backdrop-blur-xl border-b border-zinc-800">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={onBack} className="p-2 -ml-2 text-zinc-400 hover:text-white">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold text-white">Deposit</h1>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 -mr-2 text-zinc-400 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* Chain Selector */}
        {chainFees.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-zinc-400">Select Network</h3>
            <div className="grid grid-cols-2 gap-2">
              {chainFees.map((chain) => (
                <button
                  key={chain.chain}
                  onClick={() => chain.enabled && handleChainSelect(chain.chain)}
                  disabled={!chain.enabled}
                  className={`p-3 rounded-xl border transition ${
                    selectedChain === chain.chain
                      ? 'bg-orange-500/10 border-orange-500'
                      : chain.enabled
                        ? 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                        : 'bg-zinc-900/50 border-zinc-800 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span>{CHAIN_ICONS[chain.chain] || '🔗'}</span>
                    <span className={`text-sm font-medium ${
                      selectedChain === chain.chain ? 'text-orange-500' : 'text-white'
                    }`}>
                      {chain.chain.toUpperCase()}
                    </span>
                  </div>
                  {chain.enabled ? (
                    <div className="text-xs text-zinc-400">
                      Receive ${chain.receive_amount.toFixed(2)} (min ${chain.min_deposit})
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500">Coming soon</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* First Exchange Bonus Banner */}
        {isFirstExchangeEligible && (
          <div className="bg-green-900/30 border border-green-500/50 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎁</span>
              <div>
                <div className="text-green-400 font-medium text-sm">First Exchange Bonus</div>
                <div className="text-green-300 text-xs">
                  Deposit USDT, then exchange to sat and get +10% bonus!
                </div>
              </div>
            </div>
          </div>
        )}

        {/* QR Code Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="text-center mb-4">
            <span className="inline-flex items-center gap-2 bg-orange-500/10 text-orange-500 text-sm font-medium px-3 py-1 rounded-full">
              {CHAIN_ICONS[selectedChain]} {selectedChain.toUpperCase()} Network
              {selectedChain === 'tron' && ' (Shasta Testnet)'}
            </span>
          </div>

          {isLoadingAddress && !depositAddress ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
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
                <p className="text-zinc-500 text-xs text-center">Deposit Address</p>
                <div className="bg-zinc-800 rounded-xl p-3 flex items-center gap-3">
                  <p className="flex-1 text-white text-sm font-mono break-all">
                    {depositAddress}
                  </p>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 p-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
                  >
                    {copied ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : (
                      <Copy className="w-5 h-5 text-zinc-400" />
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
          <h2 className="text-white font-bold mb-3">Recent Deposits</h2>
          
          {deposits.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
              <Clock className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
              <p className="text-zinc-500 text-sm">No deposits yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {deposits.map((deposit) => (
                <div
                  key={deposit.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(deposit.status)}
                      <span className="text-white font-medium">
                        +{deposit.amount_formatted}
                      </span>
                    </div>
                    <span className="text-zinc-500 text-xs">
                      {formatDate(deposit.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 text-xs font-mono">
                      {deposit.tx_hash.slice(0, 8)}...{deposit.tx_hash.slice(-8)}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      deposit.status === 'confirmed'
                        ? 'bg-green-500/10 text-green-500'
                        : 'bg-yellow-500/10 text-yellow-500'
                    }`}>
                      {deposit.confirmations} confirmations
                    </span>
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
