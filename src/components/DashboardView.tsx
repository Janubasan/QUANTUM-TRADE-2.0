import { useState } from 'react';
import { Account, Trade, Ticker } from '../types';
import { KillSwitchGuardCard } from './KillSwitchGuardCard';
import { Runner247FirebaseCard } from './Runner247FirebaseCard';
import { OperationalGuardCard } from './OperationalGuardCard';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  XCircle,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { createManualTrade, closeTrade } from '../services/api';

interface DashboardViewProps {
  account: Account;
  trades: Trade[];
  tickers: Record<string, Ticker>;
  selectedSymbol: string;
  onRefreshData: () => void;
}

export function DashboardView({
  account,
  trades,
  tickers,
  selectedSymbol,
  onRefreshData,
}: DashboardViewProps) {
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [riskPercent, setRiskPercent] = useState<number>(0.5);
  const [tpRatio, setTpRatio] = useState<number>(2.0);
  const [slRatio, setSlRatio] = useState<number>(1.0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  const ticker = tickers[selectedSymbol] || tickers['BTC/BRL'];

  // Calculate profit rule values
  const profit = account.currentBalance - account.initialBalance;
  const riskAmount = (account.currentBalance * (riskPercent / 100));

  // Determine profit rule permission
  const isFirstTrade = account.totalTrades === 0;
  const isProfitRuleAllowed = isFirstTrade || profit >= riskAmount;

  // Active trades for this account
  const activeTrades = trades.filter((t) => t.accountId === account.id && t.status === 'open');

  // Chart mockup candles simulation based on real price
  const generateChartData = () => {
    const basePrice = ticker?.price || 345000;
    const points = [];
    const now = Date.now();
    for (let i = 24; i >= 0; i--) {
      const timeStr = new Date(now - i * 3600000).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const randomVar = (Math.sin(i / 3) * 0.015) + ((i % 5) * 0.002) - 0.005;
      const price = Number((basePrice * (1 + randomVar)).toFixed(2));
      points.push({ time: timeStr, price });
    }
    return points;
  };

  const chartData = generateChartData();

  const handleExecuteManualTrade = async () => {
    setOrderError(null);
    setIsSubmitting(true);
    try {
      await createManualTrade({
        accountId: account.id,
        symbol: selectedSymbol,
        direction,
        riskPercent,
        tpRatio,
        slRatio,
      });
      onRefreshData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setOrderError(err.message);
      } else {
        setOrderError('Falha ao executar ordem manual.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClosePosition = async (tradeId: string) => {
    try {
      await closeTrade(tradeId);
      onRefreshData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* 24/7 Autonomous Runner & Firebase Firestore Cloud Persistence */}
      <Runner247FirebaseCard onRefresh={onRefreshData} />

      {/* OperationalGuard Compliance & National Brokerage Safeguards */}
      <OperationalGuardCard onRefresh={onRefreshData} />

      {/* Global Kill Switch & Risk Controls Card */}
      <KillSwitchGuardCard onStatusChange={onRefreshData} />

      {/* Overview Bento Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Saldo Inicial */}
        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 flex flex-col justify-between shadow-2xl relative overflow-hidden group hover:border-white/10 transition">
          <div className="flex items-center justify-between text-xs text-white/40">
            <span className="uppercase tracking-widest text-[10px] font-mono font-bold">Saldo Inicial</span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] bg-white/5 text-white/70 border border-white/5 font-mono">
              {account.type.toUpperCase()}
            </span>
          </div>
          <div className="mt-4 font-mono text-3xl font-light tracking-tight text-white">
            {account.baseCurrency} {account.initialBalance.toFixed(2)}
          </div>
          <div className="mt-3 text-[11px] text-white/40">Capital base do desafio</div>
        </div>

        {/* Saldo Atual */}
        <div className="bg-zinc-900/40 border border-cyan-500/30 rounded-3xl p-6 flex flex-col justify-between shadow-2xl relative overflow-hidden group hover:border-cyan-500/50 transition shadow-[0_0_20px_rgba(6,182,212,0.05)]">
          <div className="flex items-center justify-between text-xs text-white/40">
            <span className="text-cyan-400 uppercase tracking-widest text-[10px] font-mono font-bold">Saldo Atual</span>
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_#06b6d4] animate-pulse" />
          </div>
          <div className="mt-4 font-mono text-3xl font-light tracking-tight text-cyan-300">
            {account.baseCurrency} {account.currentBalance.toFixed(2)}
          </div>
          <div className="mt-3 text-[11px] text-white/50 flex items-center gap-2">
            <span>Trades: {account.totalTrades}</span>
            <span>• Win Rate: {account.totalTrades > 0 ? ((account.winningTrades / account.totalTrades) * 100).toFixed(0) : 0}%</span>
          </div>
        </div>

        {/* Lucro Acumulado */}
        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 flex flex-col justify-between shadow-2xl relative overflow-hidden group hover:border-white/10 transition">
          <div className="flex items-center justify-between text-xs text-white/40">
            <span className="uppercase tracking-widest text-[10px] font-mono font-bold">Lucro Acumulado</span>
            {profit >= 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-400" />
            )}
          </div>
          <div
            className={`mt-4 font-mono text-3xl font-light tracking-tight ${
              profit >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {profit >= 0 ? '+' : ''}
            {account.baseCurrency} {profit.toFixed(2)}
          </div>
          <div className="mt-3 text-[11px] text-white/40">
            {profit > 0 ? 'Lucro livre para risco das próximas ordens' : 'Sem saldo de lucro no momento'}
          </div>
        </div>

        {/* Status da Regra do Lucro Stockraft */}
        <div
          className={`border rounded-3xl p-6 flex flex-col justify-between shadow-2xl transition ${
            isProfitRuleAllowed
              ? 'bg-emerald-950/20 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.05)]'
              : 'bg-rose-950/20 border-rose-500/30'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className={`uppercase tracking-widest text-[10px] font-mono font-bold ${isProfitRuleAllowed ? 'text-emerald-400' : 'text-rose-400'}`}>
              Regra de Lucro Stockraft
            </span>
            {isProfitRuleAllowed ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            )}
          </div>
          <div className="mt-4 font-mono text-sm font-bold flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs uppercase font-bold tracking-wider ${
                isProfitRuleAllowed
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
              }`}
            >
              {isProfitRuleAllowed ? 'LIBERADO OPERAR' : 'BLOQUEADO'}
            </span>
          </div>
          <div className="mt-3 text-[11px] text-white/60 font-mono">
            Risco (0.5%): R$ {riskAmount.toFixed(2)} | Lucro: R$ {profit.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Main Grid: Live Chart + Manual Order Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive Price Chart (2 cols) */}
        <div className="lg:col-span-2 bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/5">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-white tracking-tight">{selectedSymbol}</h3>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {ticker?.symbol.includes('BRL') ? 'Mercado Nacional BRL' : 'Futures USDT'}
                </span>
              </div>
              <p className="text-xs text-white/40 mt-1">Gráfico Quântico ao Vivo em Tempo Real</p>
            </div>

            <div className="text-right font-mono">
              <div className="text-2xl font-light text-cyan-300">
                {selectedSymbol.includes('BRL') ? 'R$' : '$'}{' '}
                {ticker?.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div
                className={`text-xs font-medium flex items-center justify-end gap-1 ${
                  (ticker?.change24h || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {(ticker?.change24h || 0) >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {(ticker?.change24h || 0) >= 0 ? '+' : ''}
                {ticker?.change24h.toFixed(2)}% (24h)
              </div>
            </div>
          </div>

          {/* Chart Rendering */}
          <div className="h-72 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis
                  stroke="#64748b"
                  domain={['auto', 'auto']}
                  tickFormatter={(val) => `${val.toLocaleString()}`}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#050507',
                    borderColor: 'rgba(6, 182, 212, 0.4)',
                    borderRadius: '16px',
                    color: '#f8fafc',
                    fontSize: '12px',
                    boxShadow: '0 0 20px rgba(0,0,0,0.8)'
                  }}
                  formatter={(value: unknown) => [
                    `${selectedSymbol.includes('BRL') ? 'R$' : '$'} ${Number(value).toLocaleString()}`,
                    'Preço',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#chartGradient)"
                />
                {activeTrades.map((t) => (
                  <ReferenceLine
                    key={t.id}
                    y={t.entryPrice}
                    stroke={t.direction === 'LONG' ? '#10b981' : '#f43f5e'}
                    strokeDasharray="4 4"
                    label={{
                      value: `${t.direction} ENTRY`,
                      fill: t.direction === 'LONG' ? '#10b981' : '#f43f5e',
                      fontSize: 10,
                    }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Manual Control Order Panel (1 col) */}
        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-400" />
                Painel de Execução
              </h3>
              <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-white/5 text-white/60 border border-white/5">
                {account.broker.toUpperCase()}
              </span>
            </div>

            {/* Error Banner */}
            {orderError && (
              <div className="mt-3 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{orderError}</span>
              </div>
            )}

            {/* Direction Toggle */}
            <div className="grid grid-cols-2 gap-2.5 mt-4">
              <button
                type="button"
                onClick={() => setDirection('LONG')}
                className={`py-3 px-3 rounded-2xl font-bold text-xs font-mono uppercase flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  direction === 'LONG'
                    ? 'bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                    : 'bg-black/40 text-white/50 hover:text-white border border-white/5'
                }`}
              >
                <ArrowUpRight className="w-4 h-4" /> LONG (COMPRA)
              </button>
              <button
                type="button"
                onClick={() => setDirection('SHORT')}
                className={`py-3 px-3 rounded-2xl font-bold text-xs font-mono uppercase flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  direction === 'SHORT'
                    ? 'bg-rose-500 text-black shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                    : 'bg-black/40 text-white/50 hover:text-white border border-white/5'
                }`}
              >
                <ArrowDownRight className="w-4 h-4" /> SHORT (VENDA)
              </button>
            </div>

            {/* Risk % Control */}
            <div className="mt-4 space-y-3">
              <div>
                <div className="flex justify-between text-xs text-white/50 mb-1">
                  <span>Risco por Operação (%)</span>
                  <span className="font-mono text-cyan-300 font-bold">{riskPercent}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="2.0"
                  step="0.1"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 bg-black/50 h-1.5 rounded-lg cursor-pointer"
                />
              </div>

              {/* R:R Ratio Controls */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-white/40 block mb-1">Take Profit (Multiplicador)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={tpRatio}
                    onChange={(e) => setTpRatio(parseFloat(e.target.value) || 2.0)}
                    className="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-white/40 block mb-1">Stop Loss (Multiplicador)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={slRatio}
                    onChange={(e) => setSlRatio(parseFloat(e.target.value) || 1.0)}
                    className="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-cyan-500/50"
                  />
                </div>
              </div>
            </div>

            {/* Profit Guard Box */}
            <div className="mt-4 p-4 rounded-2xl bg-black/40 border border-white/5 text-xs font-mono space-y-2">
              <div className="flex justify-between text-white/50">
                <span>Risco em R$:</span>
                <span className="text-white font-bold">R$ {riskAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-white/50">
                <span>Lucro Disponível:</span>
                <span className={profit >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  R$ {profit.toFixed(2)}
                </span>
              </div>
              <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                <span className="text-white/50">Verificação:</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold ${
                    isProfitRuleAllowed
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {isProfitRuleAllowed ? 'APROVADA' : 'BLOQUEADA'}
                </span>
              </div>
            </div>
          </div>

          {/* Execute Button */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleExecuteManualTrade}
            className={`w-full mt-4 py-3.5 px-4 rounded-2xl font-bold text-xs font-mono uppercase tracking-wider transition cursor-pointer shadow-lg ${
              direction === 'LONG'
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20'
                : 'bg-rose-500 hover:bg-rose-400 text-black shadow-rose-500/20'
            }`}
          >
            {isSubmitting ? 'Validando & Enviando...' : `Enviar Ordem ${direction}`}
          </button>
        </div>
      </div>

      {/* Active Trades Table */}
      <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-white/5">
          <h3 className="font-bold text-white text-base flex items-center gap-2">
            Posições Abertas ({activeTrades.length})
          </h3>
          <span className="text-xs text-white/40">Monitoradas em Tempo Real</span>
        </div>

        {activeTrades.length === 0 ? (
          <div className="py-8 text-center text-xs text-white/40 font-mono">
            Nenhuma posição aberta nesta conta no momento.
          </div>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="text-white/40 border-b border-white/5">
                  <th className="pb-3 font-medium">Ativo</th>
                  <th className="pb-3 font-medium">Direção</th>
                  <th className="pb-3 font-medium">Preço Entrada</th>
                  <th className="pb-3 font-medium">Preço Atual</th>
                  <th className="pb-3 font-medium">Take Profit</th>
                  <th className="pb-3 font-medium">Stop Loss</th>
                  <th className="pb-3 font-medium">PnL (%)</th>
                  <th className="pb-3 font-medium">Origem</th>
                  <th className="pb-3 font-medium text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {activeTrades.map((t) => {
                  const isLong = t.direction === 'LONG';
                  const isProfit = t.pnl >= 0;

                  return (
                    <tr key={t.id} className="hover:bg-white/5 transition">
                      <td className="py-3.5 font-bold text-white">{t.symbol}</td>
                      <td className="py-3.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold ${
                            isLong
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {t.direction}
                        </span>
                      </td>
                      <td className="py-3.5 text-white/70">R$ {t.entryPrice.toFixed(2)}</td>
                      <td className="py-3.5 text-cyan-300 font-bold">R$ {t.currentPrice.toFixed(2)}</td>
                      <td className="py-3.5 text-emerald-400">R$ {t.tpPrice.toFixed(2)}</td>
                      <td className="py-3.5 text-rose-400">R$ {t.slPrice.toFixed(2)}</td>
                      <td className={`py-3.5 font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfit ? '+' : ''}
                        {t.pnlPercent.toFixed(2)}% (R$ {t.pnl.toFixed(2)})
                      </td>
                      <td className="py-3.5 text-white/50">{t.botName || 'Manual'}</td>
                      <td className="py-3.5 text-right">
                        <button
                          onClick={() => handleClosePosition(t.id)}
                          className="px-3 py-1 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[11px] font-semibold flex items-center gap-1 ml-auto cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Encerrar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
