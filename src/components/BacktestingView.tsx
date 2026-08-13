import React, { useState } from 'react';
import { StrategyId, BacktestResult } from '../types';
import { runBacktest } from '../services/api';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  LineChart as LineChartIcon,
  Play,
  Activity,
  ShieldCheck,
  Award,
  AlertTriangle,
} from 'lucide-react';

export function BacktestingView() {
  const [strategy, setStrategy] = useState<StrategyId>('m1_pro');
  const [symbol, setSymbol] = useState('BTC/BRL');
  const [initialCapital, setInitialCapital] = useState<number>(100);
  const [riskPercent, setRiskPercent] = useState<number>(0.5);
  const [enforceProfitRule, setEnforceProfitRule] = useState(true);
  const [daysHistory, setDaysHistory] = useState<number>(30);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const handleRunBacktest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await runBacktest({
        strategy,
        symbol,
        timeframe: '15m',
        initialCapital,
        riskPercent,
        enforceProfitRule,
        daysHistory,
      });
      setResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
            <LineChartIcon className="w-5 h-5 text-cyan-400" />
            Backtesting com Inteligência Coletiva
          </h2>
          <p className="text-xs text-white/40 mt-1">
            Simule suas estratégias e valide o impacto da Regra do Lucro Stockraft contra históricos de mercado.
          </p>
        </div>
      </div>

      {/* Grid: Form + Results */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Backtest Configuration Form */}
        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl">
          <h3 className="font-bold text-white text-base mb-4 pb-3 border-b border-white/5">
            Parâmetros do Teste
          </h3>

          <form onSubmit={handleRunBacktest} className="space-y-4 text-xs font-mono">
            <div>
              <label className="text-white/50 block mb-1">Estratégia</label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as StrategyId)}
                className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
              >
                <option value="m1_pro" className="bg-zinc-900">M1 Pro Scalper Setup</option>
                <option value="kronos_grid" className="bg-zinc-900">Kronos Volatility Grid</option>
                <option value="quantum_entanglement" className="bg-zinc-900">Quantum Entanglement Arbitrage</option>
                <option value="macd_cross" className="bg-zinc-900">MACD Trend Follower</option>
              </select>
            </div>

            <div>
              <label className="text-white/50 block mb-1">Ativo Par</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
              >
                <option value="BTC/BRL" className="bg-zinc-900">BTC/BRL</option>
                <option value="ETH/BRL" className="bg-zinc-900">ETH/BRL</option>
                <option value="SOL/BRL" className="bg-zinc-900">SOL/BRL</option>
                <option value="BTC/USDT" className="bg-zinc-900">BTC/USDT</option>
                <option value="ETH/USDT" className="bg-zinc-900">ETH/USDT</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-white/50 block mb-1">Capital Inicial (R$)</label>
                <input
                  type="number"
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(parseFloat(e.target.value) || 100)}
                  className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
                />
              </div>

              <div>
                <label className="text-white/50 block mb-1">Risco (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(parseFloat(e.target.value) || 0.5)}
                  className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
                />
              </div>
            </div>

            <div>
              <label className="text-white/50 block mb-1">Histórico: {daysHistory} dias</label>
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={daysHistory}
                onChange={(e) => setDaysHistory(parseInt(e.target.value))}
                className="w-full accent-cyan-400 bg-black/50 h-2 rounded-full cursor-pointer"
              />
            </div>

            {/* Regra do Lucro Toggle */}
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-between">
              <div>
                <span className="text-white font-bold block">Regra do Lucro Stockraft</span>
                <span className="text-[10px] text-white/40">Protege o capital inicial</span>
              </div>
              <button
                type="button"
                onClick={() => setEnforceProfitRule(!enforceProfitRule)}
                className={`px-3 py-1.5 rounded-full font-bold text-xs font-mono transition cursor-pointer ${
                  enforceProfitRule
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}
              >
                {enforceProfitRule ? 'ATIVA ✅' : 'DESATIVADA ❌'}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.4)]"
            >
              {loading ? (
                <>
                  <Activity className="w-4 h-4 animate-spin" /> Processando...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" /> Executar Simulação
                </>
              )}
            </button>
          </form>
        </div>

        {/* Backtest Results Render */}
        <div className="lg:col-span-2 bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl flex flex-col justify-between">
          {!result ? (
            <div className="py-24 text-center font-mono text-xs text-white/40">
              Configure os parâmetros e clique em &quot;Executar Simulação&quot; para rodar o backtest coletivo.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-white/5">
                <div>
                  <h3 className="font-bold text-white text-lg tracking-tight">
                    Resultado da Simulação: {result.strategy.toUpperCase()}
                  </h3>
                  <p className="text-xs text-white/40 mt-1">
                    Ativo: {result.symbol} • Período: {daysHistory} dias
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-3.5 py-1.5 rounded-full text-xs font-mono font-bold ${
                      result.totalPnl >= 0
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    Retorno: {result.totalPnl >= 0 ? '+' : ''}
                    {result.totalPnlPercent}%
                  </span>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                  <span className="text-white/40 block text-[11px]">Saldo Final</span>
                  <span className="text-cyan-300 font-bold text-base mt-1 block">
                    R$ {result.finalBalance.toFixed(2)}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                  <span className="text-white/40 block text-[11px]">Win Rate %</span>
                  <span className="text-emerald-400 font-bold text-base mt-1 block">{result.winRate}%</span>
                </div>

                <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                  <span className="text-white/40 block text-[11px]">Max Drawdown</span>
                  <span className="text-rose-400 font-bold text-base mt-1 block">
                    {result.maxDrawdownPercent}%
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                  <span className="text-white/40 block text-[11px]">Bloqueios Regra Lucro</span>
                  <span className="text-amber-400 font-bold text-base mt-1 block">
                    {result.profitRuleBlockedCount} trades
                  </span>
                </div>
              </div>

              {/* Equity Curve Chart */}
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.equityCurve}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="timestamp" stroke="#71717a" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#71717a" tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#09090d',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderRadius: '16px',
                        fontSize: '11px',
                        color: '#ffffff',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', color: '#a1a1aa' }} />
                    <Line
                      type="monotone"
                      dataKey="balance"
                      name="Estratégia Quântica (R$)"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="buyAndHold"
                      name="Buy & Hold Benchmark"
                      stroke="#71717a"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Insights */}
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-300 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Análise de Risco:</strong> A Regra de Lucro evitou {result.profitRuleBlockedCount} operações
                  em fases de rebaixamento, preservando R$ {result.initialBalance.toFixed(2)} do capital inicial.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
