/**
 * On-chain helpers — Base mainnet, USDC.
 *
 * USDC on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (6 decimals).
 * All amounts in this module are in micro-USDC (1 USDC = 1_000_000 micro).
 *
 * Reads (balance, tx history) go through a public viem client.
 * Writes (transferUSDC) require a Privy-managed signer obtained via useWallets() —
 * see callers; this module only constructs the calldata + amounts.
 */

import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseAbi,
  formatUnits,
  isAddress,
  type Address,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';
import { BASE_RPC_URL } from './privy';

// --- Constants -----------------------------------------------------------

export const USDC_ADDRESS: Address =
  ((import.meta.env.VITE_USDC_ADDRESS as string | undefined) ||
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') as Address;

export const USDC_DECIMALS = 6;

export const DEFAULT_TIP_MICRO: bigint = BigInt(
  (import.meta.env.VITE_DEFAULT_TIP_MICRO as string | undefined) || '100000',
);

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

// --- Public client (read-only) ------------------------------------------

export const publicClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC_URL),
});

// --- Reads ---------------------------------------------------------------

/**
 * Fetch USDC balance for an address. Returns micro-USDC (BigInt).
 */
export async function getUsdcBalance(address: Address): Promise<bigint> {
  if (!isAddress(address)) return 0n;
  // viem's readContract overloads are picky about ABI generics; we know the
  // function returns uint256 so we cast unknown -> bigint at the boundary.
  const result = await (publicClient as unknown as {
    readContract: (args: {
      address: Address;
      abi: typeof ERC20_ABI;
      functionName: 'balanceOf';
      args: readonly [Address];
    }) => Promise<bigint>;
  }).readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
  });
  return result;
}

/**
 * Format micro-USDC as a display string with 2-6 decimal places.
 *   100000n        -> "0.10"
 *   1234567n       -> "1.234567"
 *   1000000000n    -> "1,000.00"
 */
export function formatUsdc(micro: bigint, opts?: { precision?: number }): string {
  const precision = opts?.precision ?? 2;
  const raw = formatUnits(micro, USDC_DECIMALS);
  const num = Number(raw);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: Math.max(precision, 6),
  });
}

/**
 * Parse a USD string ("0.10", "1.5") to micro-USDC. Negative or NaN returns 0.
 */
export function parseUsdc(input: string | number): bigint {
  const n = typeof input === 'string' ? Number(input) : input;
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.round(n * 10 ** USDC_DECIMALS));
}

// --- Writes (calldata only — signing happens in caller via Privy) -------

export interface TransferUsdcCall {
  to: Address;          // USDC contract
  data: Hex;            // ERC20.transfer(creator, amount) calldata
  value: bigint;        // 0
  chainId: number;      // base.id
}

/**
 * Build the transaction params for an ERC20 USDC transfer.
 * Caller (Privy useWallets() / useSendTransaction()) signs and broadcasts.
 */
export function buildUsdcTransfer(creator: Address, amountMicro: bigint): TransferUsdcCall {
  if (!isAddress(creator)) {
    throw new Error(`Invalid creator address: ${creator}`);
  }
  if (amountMicro <= 0n) {
    throw new Error('Tip amount must be positive');
  }
  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [creator, amountMicro],
  });
  return {
    to: USDC_ADDRESS,
    data,
    value: 0n,
    chainId: base.id,
  };
}

// --- Tip history (chain-derived) -----------------------------------------

export interface ChainTipEvent {
  txHash: Hex;
  blockNumber: bigint;
  from: Address;
  to: Address;
  amountMicro: bigint;
  direction: 'sent' | 'received';
}

/**
 * Fetch USDC Transfer events for a wallet within the last `lookbackBlocks`.
 * Used by walletStore for the Transactions view.
 *
 * Note: For production scale, replace with a backend-indexed query.
 * Pre-funding scale: fine to hit RPC directly.
 */
export async function getRecentTipEvents(
  wallet: Address,
  lookbackBlocks = 50_000n,
): Promise<ChainTipEvent[]> {
  const tip = await publicClient.getBlockNumber();
  const fromBlock = tip > lookbackBlocks ? tip - lookbackBlocks : 0n;

  const [outgoing, incoming] = await Promise.all([
    publicClient.getLogs({
      address: USDC_ADDRESS,
      event: ERC20_ABI[2],
      args: { from: wallet },
      fromBlock,
      toBlock: 'latest',
    }),
    publicClient.getLogs({
      address: USDC_ADDRESS,
      event: ERC20_ABI[2],
      args: { to: wallet },
      fromBlock,
      toBlock: 'latest',
    }),
  ]);

  const events: ChainTipEvent[] = [];
  for (const log of outgoing) {
    if (!log.args.from || !log.args.to || log.args.value === undefined) continue;
    events.push({
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      from: log.args.from as Address,
      to: log.args.to as Address,
      amountMicro: log.args.value,
      direction: 'sent',
    });
  }
  for (const log of incoming) {
    if (!log.args.from || !log.args.to || log.args.value === undefined) continue;
    // Skip self-transfers (already counted as outgoing)
    if (log.args.from?.toLowerCase() === wallet.toLowerCase()) continue;
    events.push({
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      from: log.args.from as Address,
      to: log.args.to as Address,
      amountMicro: log.args.value,
      direction: 'received',
    });
  }
  events.sort((a, b) => Number(b.blockNumber - a.blockNumber));
  return events;
}
