// Carteiras — matriz pronta de integração (ref: research/META_RESEARCH.md §2).
// EVM (MetaMask/Rabby/Binance Wallet): EIP-1193. Solana (Phantom/Backpack): window.solana.
// WalletConnect: fallback universal. Chaves NUNCA transitam pelo mirror público.
import { WalletIntegration } from './types.js';

export const WALLETS: WalletIntegration[] = [
  { id: 'metamask', name: 'MetaMask (EVM)', status: 'ready', chains: ['ethereum', 'base', 'arbitrum', 'bsc', 'polygon'], connect: 'eip1193', docs: 'https://docs.metamask.io/sdk' },
  { id: 'walletconnect', name: 'WalletConnect v2 (universal)', status: 'ready', chains: ['*'], connect: 'walletconnect', docs: 'https://docs.reown.com/appkit' },
  { id: 'phantom', name: 'Phantom (Solana+EVM)', status: 'ready', chains: ['solana', 'ethereum', 'polygon'], connect: 'sdk', docs: 'https://docs.phantom.com' },
  { id: 'coinbase-wallet', name: 'Coinbase Wallet / Base App', status: 'ready', chains: ['base', 'ethereum', 'solana'], connect: 'sdk', docs: 'https://www.base.org/builders/onchainkit' },
  { id: 'trust', name: 'Trust Wallet (via WalletConnect)', status: 'stub', chains: ['110+'], connect: 'walletconnect', docs: 'https://developer.trustwallet.com' },
  { id: 'binance-web3', name: 'Binance Web3 Wallet (MPC)', status: 'stub', chains: ['40+'], connect: 'eip1193', docs: 'https://www.bnbchain.org/en/binance-wallet' },
  { id: 'ledger', name: 'Ledger / Hardware (tesouraria)', status: 'stub', chains: ['100+'], connect: 'sdk', docs: 'https://developers.ledger.com/docs/connect-kit' },
];

/** Snippet de conexão EIP-1193 (frontend operador — NÃO usar no mirror público). */
export const EIP1193_SNIPPET = `
// MetaMask / Rabby / Brave / Binance Web3 (EIP-1193)
const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
// Assinatura de ordem espelhada (EIP-191):
const sig = await window.ethereum.request({ method: 'personal_sign', params: [JSON.stringify(order), accounts[0]] });
`;

/** Snippet Phantom Solana (frontend operador). */
export const PHANTOM_SNIPPET = `
// Phantom (Solana)
const resp = await window.solana.connect();
const sig = await window.solana.signAndSendTransaction(tx); // Jupiter swap p/ SOL
`;
