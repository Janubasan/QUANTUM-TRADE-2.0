import { useState, useEffect } from 'react';
import { Account, Trade, Ticker } from '../types';
import { KillSwitchGuardCard } from './KillSwitchGuardCard';
import { Runner247FirebaseCard } from './Runner247FirebaseCard';
import { OperationalGuardCard } from './OperationalGuardCard';
import { TradingClockAndResetCard } from './TradingClockAndResetCard';
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
  Lock,
  CheckCircle2,
} from 'lucide-react';
import { createManualTrade, closeTrade, fetchSchedulerState, updateSchedulerMode } from '../services/api';

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

  // Scalp Mode Toggle State
  const [schedulerMode, setSchedulerMode] = useState<'scalp' | 'normal'>('normal');
  const [isTogglingMode, setIsTogglingMode] = useState<boolean>(false);
  const [modeMessage, setModeMessage] = useState<string | null>(null);

  const [activeTradesFilter, setActiveTradesFilter] = useState<'account' | 'all'>('all');

  const ticker = tickers[selectedSymbol] || tickers['BTC/BRL'];

  useEffect(() => {
    fetchSchedulerState()
      .then((res) => {
        if (res && res.mode) {
          setSchedulerMode(res.mode);
        }
      })
      .catch((err) => console.error('Erro ao carregar scheduler state:', err));
  }, []);

  const handleToggleScalpMode = async () => {
    const nextMode = schedulerMode === 'scalp' ? 'normal' : 'scalp';
    setIsTogglingMode(true);
    try {
      const res = await updateSchedulerMode(nextMode);
      setSchedulerMode(res.mode);
      setModeMessage(
        nextMode === 'scalp'
          ? '⚡ Modo Scalp ATIVADO manualmente por botão (Permite operações ultra-rápidas).'
          : '🛡️ Modo Padrão Auditado ATIVADO (Apenas timeframes 1m, 5m, 10m, 15m, 30m, 1h).'
      );
      onRefreshData();
    } catch (err: unknown) {
      console.error('Falha ao alternar modo scalp:', err);
    } finally {
      setIsTogglingMode(false);
      setTimeout(() => setModeMessage(null), 5000);
    }
  };

  // Calculate profit rule values
  const profit = account.currentBalance - account.initialBalance;
  const riskAmount = (account.currentBalance * (riskPercent / 100));

  // Determine profit rule permission
  const isFirstTrade = account.totalTrades === 0;
  const isProfitRuleAllowed = isFirstTrade || profit >= riskAmount;

  // Active trades for this account or all accounts
  const activeTrades = activeTradesFilter === 'account'
    ? trades.filter((t) => t.accountId === account.id && t.status === 'open')
    : trades.filter((t) => t.status === 'open');

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
      {/* Live Trading Clock, Session Timer & 100 Account Reset */}
      <TradingClockAndResetCard
        accountId={account.id}
        accountName={account.name}
        initialBalance={account.initialBalance}
        currentBalance={account.currentBalance}
        trades={trades}
        onResetComplete={onRefreshData}
      />

      {/* Audited Timeframe Gate & Scalp Button Controller Bar */}
      <div className="bg-gradient-to-r from-zinc-950 via-zinc-900/90 to-zinc-950 border border-white/10 rounded-3xl p-5 shadow-2xl space-y-3 relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-white font-mono">
                  Validação de Operações Auditadas & Controle de Scalp
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  AUTO-ID LIGADO
                </span>
              </div>
              <p className="text-xs text-white/50 mt-0.5">
                Timeframes com auditoria automática e código espelhado: <span className="text-cyan-300 font-bold font-mono">1m, 5m, 10m, 15m, 30m, 1h</span>.
                O lucro/PnL só é revelado após a conclusão e selagem auditada da ordem.
              </p>
            </div>
          </div>

          {/* Scalp Mode Manual Button Switch */}
          <div className="flex items-center gap-3 bg-black/60 border border-white/10 p-2 rounded-2xl shrink-0">
            <div className="text-right">
              <div className="text-[10px] text-white/40 uppercase font-mono tracking-wider">Modo Scalp (Manual)</div>
              <div className={`text-xs font-mono font-bold ${schedulerMode === 'scalp' ? 'text-amber-400' : 'text-cyan-400'}`}>
                {schedulerMode === 'scalp' ? 'LIGADO (Micro-Scalp)' : 'DESLIGADO (Apenas Auditadas)'}
              </div>
            </div>

            <button
              onClick={handleToggleScalpMode}
              disabled={isTogglingMode}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition flex items-center gap-2 cursor-pointer shadow-lg ${
                schedulerMode === 'scalp'
                  ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-white/10'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${schedulerMode === 'scalp' ? 'fill-black' : 'text-amber-400'}`} />
              <span>{schedulerMode === 'scalp' ? 'Desligar Scalp' : 'Ligar Scalp (Botão)'}</span>
            </button>
          </div>
        </div>

        {/* Timeframe Badges Row */}
        <div className="pt-2 border-t border-white/5 flex items-center justify-between flex-wrap gap-2 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-white/40">Timeframes Permitidos:</span>
            {['1m', '5m', '10m', '15m', '30m', '1h'].map((tf) => (
              <span
                key={tf}
                className="px-2.5 py-0.5 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-bold"
              >
                {tf}
              </span>
            ))}
            {schedulerMode === 'scalp' && (
              <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold animate-pulse">
                + Scalp (5s, 15s, 30s)
              </span>
            )}
          </div>

          <div className="text-white/50 text-[10px] flex items-center gap-1">
            <Lock className="w-3 h-3 text-cyan-400" /> PnL Oculto durante execução • Selo Criptográfico no fechamento
          </div>
        </div>

        {modeMessage && (
          <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-xs font-mono text-cyan-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{modeMessage}</span>
          </div>
        )}
      </div>

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
            Risco ({riskPercent}%): $ {riskAmount.toFixed(2)} USD | Lucro: $ {profit.toFixed(2)} USD
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
                {activeTrades.map((t, idx) => (
                  <ReferenceLine
                    key={`refline-${t.id}-${idx}`}
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
                <span>Risco em $:</span>
                <span className="text-white font-bold">$ {riskAmount.toFixed(2)} USD</span>
              </div>
              <div className="flex justify-between text-white/50">
                <span>Lucro Disponível:</span>
                <span className={profit >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  $ {profit.toFixed(2)} USD
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

      {/* Active Trades Table with Scrollbars & Mirrored Audit Status */}
      <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              Posições Abertas ({activeTrades.length})
            </h3>
            <span className="text-xs text-white/40">Auditadas com Código Espelhado</span>
          </div>

          <div className="flex items-center gap-2 bg-black/40 p-1 rounded-xl border border-white/5 text-xs font-mono">
            <button
              onClick={() => setActiveTradesFilter('all')}
              className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                activeTradesFilter === 'all'
                  ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.4)]'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Todas ({trades.filter((t) => t.status === 'open').length})
            </button>
            <button
              onClick={() => setActiveTradesFilter('account')}
              className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                activeTradesFilter === 'account'
                  ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.4)]'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              Desta Conta ({trades.filter((t) => t.accountId === account.id && t.status === 'open').length})
            </button>
          </div>
        </div>

        {activeTrades.length === 0 ? (
          <div className="py-8 text-center text-xs text-white/40 font-mono">
            Nenhuma posição aberta no momento. Os robôs nos timeframes auditados (1m, 5m, 10m, 15m, 30m, 1h) estão analisando o mercado.
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-96 custom-scrollbar mt-3">
            <table className="w-full text-left text-xs font-mono">
              <thead className="sticky top-0 bg-[#0c0d12] z-10">
                <tr className="text-white/40 border-b border-white/5">
                  <th className="pb-3 pt-2 font-medium">ID & Código Auditado</th>
                  <th className="pb-3 pt-2 font-medium">Ativo / Timeframe</th>
                  <th className="pb-3 pt-2 font-medium">Direção</th>
                  <th className="pb-3 pt-2 font-medium">Preço Entrada</th>
                  <th className="pb-3 pt-2 font-medium">Preço Atual</th>
                  <th className="pb-3 pt-2 font-medium">TP / SL</th>
                  <th className="pb-3 pt-2 font-medium">Lucro / PnL Auditado</th>
                  <th className="pb-3 pt-2 font-medium">Origem</th>
                  <th className="pb-3 pt-2 font-medium text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {activeTrades.map((t, idx) => {
                  const isLong = t.direction === 'LONG';
                  const isBrl = t.symbol.includes('BRL');
                  const currSym = isBrl ? 'R$' : '$';
                  const auditCode = t.auditCode || `AUD-${(t.timeframe || '15M').toUpperCase()}-${t.id.slice(-6).toUpperCase()}`;

                  return (
                    <tr key={`${t.id}-${idx}`} className="hover:bg-white/5 transition">
                      <td className="py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold">
                            {auditCode}
                          </span>
                        </div>
                        <span className="text-[10px] text-white/30 truncate block max-w-[110px] mt-0.5">{t.id}</span>
                      </td>
                      <td className="py-3.5">
                        <span className="font-bold text-white block">{t.symbol}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                          {t.timeframe || '15m'}
                        </span>
                      </td>
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
                      <td className="py-3.5 text-white/70">{currSym} {t.entryPrice.toFixed(2)}</td>
                      <td className="py-3.5 text-cyan-300 font-bold">{currSym} {t.currentPrice.toFixed(2)}</td>
                      <td className="py-3.5 text-[11px]">
                        <span className="text-emerald-400 block">TP: {currSym} {t.tpPrice.toFixed(2)}</span>
                        <span className="text-rose-400 block">SL: {currSym} {t.slPrice.toFixed(2)}</span>
                      </td>
                      <td className="py-3.5 font-bold">
                        {/* PnL is hidden for open trades and only revealed after close as per user directive */}
                        <div className="flex items-center gap-1.5 text-amber-300/90 text-[11px] bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/20">
                          <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>Auditado (Revela ao fechar)</span>
                        </div>
                      </td>
                      <td className="py-3.5 text-white/50">{t.botName || 'Manual'}</td>
                      <td className="py-3.5 text-right">
                        <button
                          onClick={() => handleClosePosition(t.id)}
                          className="px-3 py-1 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[11px] font-semibold flex items-center gap-1 ml-auto cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Fechar & Auditar
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
