// Tipos centrais do Quantum Mirror
export interface Candle {
  openTime: number;
  open: number; high: number; low: number; close: number; volume: number;
}

export type Direction = 'LONG' | 'SHORT' | 'FLAT';

export interface Signal {
  botId: string;
  symbol: string;
  timeframe: string;
  direction: Direction;
  confidence: number; // 0..1
  entryHint: number;
  stopHint: number;
  takeProfitHint: number;
  reasons: string[];
  vetoed: boolean;
  vetoReason?: string;
  meta: Record<string, number | string | boolean>;
}

export interface BotSpec {
  id: string;
  name: string;
  rank: number;
  symbol: string;
  timeframe: string;
  winRateAudited: number;
  sharpeAudited: number;
  tpRatio: number;
  slRatio: number;
  riskPercent: number;
  description: string;
}

export const BOTS: BotSpec[] = [
  {
    id: 'sol-breakout-30m', name: 'SOL Momentum Breakout', rank: 1,
    symbol: 'SOL/USDT', timeframe: '30m',
    winRateAudited: 76.5, sharpeAudited: 0.75, tpRatio: 2.5, slRatio: 1.0, riskPercent: 0.5,
    description: 'Quantum Momentum Breakout com Trailing ATR Institucional',
  },
  {
    id: 'eth-trendwave-10m', name: 'ETH Quantum Trend Wave', rank: 2,
    symbol: 'ETH/USDT', timeframe: '10m',
    winRateAudited: 73.4, sharpeAudited: 0.22, tpRatio: 2.2, slRatio: 1.0, riskPercent: 0.5,
    description: 'Ondas Quânticas de Tendência Multi-Médias + VWAP',
  },
  {
    id: 'regime-desk-5m', name: 'Multi-Agent Regime Desk', rank: 3,
    symbol: 'BTC/USDT', timeframe: '5m',
    winRateAudited: 63.1, sharpeAudited: 0.18, tpRatio: 2.0, slRatio: 1.0, riskPercent: 0.5,
    description: 'Desk Autônomo Multi-Agente com Veto Estrito de Risco (Red Team)',
  },
  {
    id: 'orb-mc-15m', name: 'Quant-Bot ORB & Monte Carlo', rank: 4,
    symbol: 'BTC/USDT', timeframe: '15m',
    winRateAudited: 58.9, sharpeAudited: 0.28, tpRatio: 2.5, slRatio: 1.0, riskPercent: 0.4,
    description: 'Opening Range Breakout com 500 Simulações de Monte Carlo',
  },
];
