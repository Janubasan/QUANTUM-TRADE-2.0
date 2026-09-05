/**
 * tokenRegistry.ts — Resolução de símbolo → endereço de contrato por rede.
 *
 * Por que um registro explícito
 * -----------------------------
 * O adapter antigo chutava um único endereço de USDC da Polygon
 * (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`) para TODAS as redes. Um swap
 * "ETH/USDC" na Ethereum mainnet tentaria usar um contrato da Polygon — que,
 * na mainnet, é outro contrato (ou nenhum). Isso é exatamente o tipo de erro
 * silencioso que custa dinheiro.
 *
 * Aqui: cada símbolo só existe se houver endereço registrado para AQUELA rede.
 * Sem registro, o sistema lança erro e não envia nada.
 *
 * Extensão via .env:
 *   TOKEN_<REDE>_<SIMBOLO>=0x....
 * Exemplo: TOKEN_ETHEREUM_USDC=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
 */

import { ethers } from 'ethers';
import { CHAIN_KEYS } from './chainRegistry.js';

type Table = Record<string, Record<string, string>>;

function addr(value: string, label: string): string {
  try {
    return ethers.getAddress(value);
  } catch {
    throw new Error(`[${label}] endereço inválido: ${value}`);
  }
}

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const WMATIC = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270';
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const WAVAX = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7';

const BASE_TABLE: Table = {
  ethereum: {
    WETH: addr(WETH, 'ethereum.WETH'),
    USDC: addr('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ethereum.USDC'),
    USDT: addr('0xdAC17F958D2ee523a2206206994597C13D831ec7', 'ethereum.USDT'),
    DAI: addr('0x6B175474E89094C44Da98b954EedeAC495271d0F', 'ethereum.DAI'),
    WBTC: addr('0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', 'ethereum.WBTC'),
    LINK: addr('0x514910771AF9Ca656af840dff83E8264EcF986CA', 'ethereum.LINK'),
    UNI: addr('0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', 'ethereum.UNI'),
  },
  polygon: {
    WMATIC: addr(WMATIC, 'polygon.WMATIC'),
    WPOL: addr(WMATIC, 'polygon.WPOL'),
    USDC: addr('0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', 'polygon.USDC'),
    'USDC.E': addr('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', 'polygon.USDC.E'),
    USDT: addr('0xc2132D05D31c914a87C6611C10748AEb04B58e8F', 'polygon.USDT'),
    WETH: addr('0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', 'polygon.WETH'),
    WBTC: addr('0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', 'polygon.WBTC'),
  },
  bsc: {
    WBNB: addr(WBNB, 'bsc.WBNB'),
    USDT: addr('0x55d398326f99059fF775485246999027B3197955', 'bsc.USDT'),
    BUSD: addr('0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', 'bsc.BUSD'),
    USDC: addr('0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', 'bsc.USDC'),
    ETH: addr('0x2170Ed0880ac9A755fd29B2688956BD959F933F8', 'bsc.ETH'),
    CAKE: addr('0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', 'bsc.CAKE'),
  },
  arbitrum: {
    WETH: addr('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', 'arbitrum.WETH'),
    USDC: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 'arbitrum.USDC'),
    'USDC.E': addr('0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', 'arbitrum.USDC.E'),
    USDT: addr('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', 'arbitrum.USDT'),
    ARB: addr('0x912CE59144191C1204E64559FE8253a0e49E6548', 'arbitrum.ARB'),
  },
  base: {
    WETH: addr('0x4200000000000000000000000000000000000006', 'base.WETH'),
    USDC: addr('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'base.USDC'),
    DAI: addr('0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', 'base.DAI'),
    CBETH: addr('0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', 'base.CBETH'),
  },
  avalanche: {
    WAVAX: addr(WAVAX, 'avalanche.WAVAX'),
    USDC: addr('0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', 'avalanche.USDC'),
    USDT: addr('0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', 'avalanche.USDT'),
    WETH: addr('0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB', 'avalanche.WETH'),
    JOE: addr('0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd', 'avalanche.JOE'),
  },
  optimism: {
    WETH: addr('0x4200000000000000000000000000000000000006', 'optimism.WETH'),
    USDC: addr('0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', 'optimism.USDC'),
    OP: addr('0x4200000000000000000000000000000000000042', 'optimism.OP'),
  },
  sepolia: {
    WETH: addr('0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', 'sepolia.WETH'),
    // USDC de teste do Circle na Sepolia.
    USDC: addr('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', 'sepolia.USDC'),
    LINK: addr('0x779877A7B0D9E8603169DdbD7836e478b4624789', 'sepolia.LINK'),
  },
  base_sepolia: {
    WETH: addr('0x4200000000000000000000000000000000000006', 'base_sepolia.WETH'),
  },
  arbitrum_sepolia: {
    WETH: addr('0x980B62Da83eFf3D4576C647993b0c1D7faf17c73', 'arbitrum_sepolia.WETH'),
  },
  bsc_testnet: {
    WBNB: addr('0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd', 'bsc_testnet.WBNB'),
  },
};

/** Aplica overrides vindos do .env: TOKEN_<REDE>_<SIMBOLO>=0x... */
function applyEnvOverrides(table: Table): Table {
  const result: Table = JSON.parse(JSON.stringify(table));
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('TOKEN_') || !value) continue;
    const rest = key.slice('TOKEN_'.length);
    const sep = rest.indexOf('_');
    if (sep < 0) continue;
    const chainPart = rest.slice(0, sep).toLowerCase();
    const symbol = rest.slice(sep + 1).toUpperCase();
    const chainKey = CHAIN_KEYS.find((k) => k.toLowerCase() === chainPart);
    if (!chainKey) continue;
    try {
      result[chainKey] = result[chainKey] || {};
      result[chainKey][symbol] = ethers.getAddress(value);
    } catch {
      console.warn(`[tokenRegistry] ${key} ignorado: "${value}" não é um endereço EVM válido.`);
    }
  }
  return result;
}

export const TOKEN_REGISTRY: Table = applyEnvOverrides(BASE_TABLE);

/**
 * Resolve um símbolo em endereço de contrato para a rede informada.
 * Lança erro se o símbolo não estiver registrado NAQUELA rede.
 */
export function resolveToken(chainKey: string, symbol: string): string {
  const sym = symbol.trim().toUpperCase();
  const table = TOKEN_REGISTRY[chainKey];
  if (!table) throw new Error(`Nenhum token registrado para a rede "${chainKey}".`);
  const found = table[sym];
  if (!found) {
    throw new Error(
      `Símbolo "${sym}" não registrado na rede ${chainKey}. Registrados: ${Object.keys(table).join(', ')}. ` +
        `Adicione TOKEN_${chainKey.toUpperCase()}_${sym}=0x... no .env.`
    );
  }
  return found;
}

export function hasToken(chainKey: string, symbol: string): boolean {
  return Boolean(TOKEN_REGISTRY[chainKey]?.[symbol.trim().toUpperCase()]);
}

/**
 * Interpreta pares no formato BASE/QUOTE ("ETH/USDC", "BTC/USDT").
 * Devolve os dois símbolos normalizados.
 */
export function parsePair(symbol: string): { base: string; quote: string } {
  const clean = symbol.trim().toUpperCase();
  if (clean.includes('/')) {
    const [base, quote] = clean.split('/');
    if (!base || !quote) throw new Error(`Par inválido: "${symbol}" (esperado BASE/QUOTE).`);
    return { base: base.trim(), quote: quote.trim() };
  }
  // Sem barra: assume sufixo de stablecoin.
  for (const q of ['USDC', 'USDT', 'BUSD', 'DAI']) {
    if (clean.endsWith(q) && clean.length > q.length) {
      return { base: clean.slice(0, -q.length), quote: q };
    }
  }
  throw new Error(`Não foi possível interpretar o par "${symbol}". Use o formato BASE/QUOTE.`);
}
