import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, RefreshCw, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { useWalletStore, useUserStore } from '../stores';
import { Header } from './ui/Header';
import { Spinner } from './ui/Spinner';
import { Badge } from './ui/Badge';
import { EmptyState } from './ui/EmptyState';
import { ErrorMessage } from './ui/ErrorMessage';

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
    <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
      <Header
        title="Deposit"
        onBack={onBack}
        rightContent={
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 -mr-2 text-stone-400 hover:text-white disabled:opacity-50 transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      <div className="px-4 py-6 space-y-6">
        {/* Chain Selector */}
        {chainFees.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-stone-400">Select Network</h3>
            <div className="grid grid-cols-2 gap-2">
              {chainFees.map((chain) => (
                <button
                  key={chain.chain}
                  onClick={() => chain.enabled && handleChainSelect(chain.chain)}
                  disabled={!chain.enabled}
                  className={`p-3 rounded-xl border transition-colors ${
                    selectedChain === chain.chain
                      ? 'bg-orange-500/10 border-orange-500'
                      : chain.enabled
                        ? 'bg-stone-900 border-stone-800 hover:border-stone-700'
                        : 'bg-stone-900/50 border-stone-800 opacity-50 cursor-not-allowed'
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
                    <div className="text-xs text-stone-400">
                      Receive ${chain.receive_amount.toFixed(2)} (min ${chain.min_deposit})
                    </div>
                  ) : (
                    <div className="text-xs text-stone-500">Coming soon</div>
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
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
          <div className="text-center mb-4">
            <Badge variant="orange">
              {CHAIN_ICONS[selectedChain]} {selectedChain.toUpperCase()} Network
              {selectedChain === 'tron' && ' (Shasta Testnet)'}
            </Badge>
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
          <h2 className="text-white font-bold mb-3">Recent Deposits</h2>

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
