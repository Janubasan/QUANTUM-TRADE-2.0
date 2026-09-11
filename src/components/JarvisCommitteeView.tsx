import { useState, useEffect, useCallback, useRef } from 'react';
import {
  JarvisSnapshot,
  JarvisBacktestResult,
  JarvisAgentSnapshot,
  JarvisRegime,
} from '../types';
import {
  fetchJarvisCommittee,
  evaluateJarvisCommittee,
  toggleJarvisCommittee,
  configureJarvisCommittee,
  releaseJarvisRiskLock,
  setJarvisDeskMode,
  approveJarvisOperation,
  rejectJarvisOperation,
  runJarvisBacktest,
} from '../services/api';
import {
  Landmark,
  Activity,
  RefreshCw,
  Play,
  Pause,
  ShieldCheck,
  ShieldAlert,
  Lock,
  LockOpen,
  Gauge,
  Scale,
  Link2,
  FlaskConical,
  Waves,
  BrainCircuit,
  CandlestickChart,
  GitCommitHorizontal,
  Check,
  X,
  FileDiff,
} from 'lucide-react';

const CRYPTO_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BTC/BRL', 'ETH/BRL', 'SOL/BRL'];
const SYNTHETIC_SYMBOLS = ['VOL-75', 'BOOM-1000', 'CRASH-1000', 'STEP-100'];

function ScoreBar({ score, height = 8 }: { score: number; height?: number }) {
  const pct = Math.max(-1, Math.min(1, score)) * 50;
  return (
    <div
      className="relative w-full rounded-full bg-white/5 overflow-hidden"
      style={{ height }}
    >
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20" />
      {score >= 0 ? (
        <div
          className="absolute top-0 bottom-0 left-1/2 bg-emerald-400/80 rounded-r-full"
          style={{ width: `${pct}%` }}
        />
      ) : (
        <div
          className="absolute top-0 bottom-0 right-1/2 bg-rose-400/80 rounded-l-full"
          style={{ width: `${-pct}%` }}
        />
      )}
    </div>
  );
}

function sideColor(side: string): string {
  if (side === 'LONG') return 'text-emerald-400';
  if (side === 'SHORT') return 'text-rose-400';
  return 'text-slate-400';
}

function verdictColor(verdict: string): string {
  if (verdict === 'BUY') return 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300';
  if (verdict === 'SELL') return 'bg-rose-500/15 border-rose-500/40 text-rose-300';
  return 'bg-zinc-800/60 border-white/10 text-slate-300';
}

function regimeTone(regime: JarvisRegime): string {
  switch (regime) {
    case 'Bull Trend':
      return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300';
    case 'Bear Trend':
      return 'bg-rose-500/10 border-rose-500/30 text-rose-300';
    case 'High Volatility':
      return 'bg-amber-500/10 border-amber-500/30 text-amber-300';
    case 'Mean Reverting':
      return 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300';
    default:
      return 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300';
  }
}

function AgentCard({
  agent,
  isNew,
}: {
  agent: JarvisAgentSnapshot;
  isNew?: boolean;
  key?: string | number;
}) {
  return (
    <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono font-bold text-sm text-white truncate">{agent.name}</span>
          {isNew && (
            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30 font-mono shrink-0">
              novo
            </span>
          )}
        </div>
        <span className={`font-mono font-bold text-xs ${sideColor(agent.side)} shrink-0`}>
          {agent.side}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <ScoreBar score={agent.score} />
        <span className="font-mono text-xs text-white/70 w-14 text-right shrink-0">
          {agent.score >= 0 ? '+' : ''}
          {agent.score.toFixed(2)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
        <div className="bg-black/30 rounded-lg p-1.5 text-center">
          <div className="text-white/40">Confiança</div>
          <div className="text-white font-bold">{Math.round(agent.confidence * 100)}%</div>
        </div>
        <div className="bg-black/30 rounded-lg p-1.5 text-center">
          <div className="text-white/40">Peso efet.</div>
          <div className="text-white font-bold">{Math.round(agent.effectiveWeight * 100)}%</div>
        </div>
        <div className="bg-black/30 rounded-lg p-1.5 text-center">
          <div className="text-white/40">Peso base</div>
          <div className="text-white/70">{Math.round(agent.baseWeight * 100)}%</div>
        </div>
      </div>

      <p className="text-[11px] text-white/50 leading-relaxed">{agent.reason}</p>
    </div>
  );
}

export function JarvisCommitteeView() {
  const [snapshot, setSnapshot] = useState<JarvisSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [backtest, setBacktest] = useState<JarvisBacktestResult | null>(null);
  const [backtesting, setBacktesting] = useState(false);
  const [btDays, setBtDays] = useState(14);
  const [actionBusy, setActionBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchJarvisCommittee();
      setSnapshot(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 3000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load]);

  const doAction = async (fn: () => Promise<unknown>) => {
    setActionBusy(true);
    try {
      await fn();
      await load();
    } finally {
      setActionBusy(false);
    }
  };

  const runBacktest = async () => {
    setBacktesting(true);
    try {
      const res = await runJarvisBacktest(btDays);
      setBacktest(res);
    } catch (err) {
      console.error(err);
    } finally {
      setBacktesting(false);
    }
  };

  if (loading || !snapshot) {
    return (
      <div className="py-20 text-center font-mono text-xs text-slate-400 flex items-center justify-center gap-2">
        <Activity className="w-5 h-5 text-cyan-400 animate-spin" />
        <span>Convocando o comitê deliberativo JARVIS...</span>
      </div>
    );
  }

  const { consensus, risk, debate } = snapshot;

  return (
    <div className="space-y-6">
      {/* Header + Controles */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
            <Landmark className="w-5 h-5 text-cyan-400" />
            Comitê JARVIS — Arquitetura Multi-Agente
          </h2>
          <p className="text-xs text-white/40 mt-1">
            4 especialistas + 2 agentes de pesquisa deliberam sobre {snapshot.symbol} a cada tick,
            com consenso ponderado, gerenciador de risco e trilha SHA-256.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={snapshot.symbol}
            onChange={(e) => doAction(() => configureJarvisCommittee({ symbol: e.target.value }))}
            className="bg-zinc-900/60 border border-white/10 rounded-full px-3 py-2 text-xs font-mono text-slate-200 outline-none cursor-pointer"
          >
            <optgroup label="Cripto / Mercados">
              {CRYPTO_SYMBOLS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </optgroup>
            <optgroup label="Índices Sintéticos (Deriv-style)">
              {SYNTHETIC_SYMBOLS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </optgroup>
          </select>

          <button
            onClick={() => doAction(() => toggleJarvisCommittee())}
            disabled={actionBusy}
            className="px-4 py-2 rounded-full bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 font-mono text-xs flex items-center gap-2 cursor-pointer transition"
          >
            {snapshot.isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {snapshot.isRunning ? 'Pausar' : 'Iniciar'}
          </button>

          <button
            onClick={() => doAction(() => evaluateJarvisCommittee())}
            disabled={actionBusy}
            className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-white/80 font-mono text-xs flex items-center gap-2 cursor-pointer transition border border-white/5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${actionBusy ? 'animate-spin' : ''}`} /> Avaliar agora
          </button>
        </div>
      </div>

      {/* Sumário de mercado + veredito */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40 font-mono">MERCADO</span>
            <span
              className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-mono border ${
                snapshot.dataSource === 'live'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : snapshot.dataSource === 'mixed'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-zinc-800/60 border-white/10 text-slate-400'
              }`}
            >
              {snapshot.dataSource}
            </span>
          </div>
          <div className="font-mono text-3xl font-light text-white">
            $ {snapshot.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`text-[10px] px-2 py-1 rounded-full border font-mono ${regimeTone(snapshot.regime)}`}>
              {snapshot.regime}
            </span>
            <span className="text-[10px] px-2 py-1 rounded-full border border-white/10 text-slate-400 font-mono">
              {snapshot.candlesCount} velas 1m
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-white/50">
            <div>RSI-14: <span className="text-white">{snapshot.indicators.rsi14.toFixed(1)}</span></div>
            <div>ATR-14: <span className="text-white">{snapshot.indicators.atr14.toFixed(2)}</span></div>
            <div>SMA10/30: <span className="text-white">{snapshot.indicators.sma10.toFixed(1)} / {snapshot.indicators.sma30.toFixed(1)}</span></div>
            <div>Δ janela: <span className={snapshot.indicators.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{snapshot.indicators.changePct.toFixed(2)}%</span></div>
          </div>
        </div>

        <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 space-y-3 flex flex-col justify-center">
          <div className="flex items-center gap-2 text-xs text-white/40 font-mono">
            <Scale className="w-4 h-4 text-cyan-400" /> CONSENSO PONDERADO
          </div>
          <div className="flex items-center justify-between">
            <span
              className={`px-4 py-2 rounded-2xl border font-mono font-bold text-2xl ${verdictColor(consensus.verdict)}`}
            >
              {consensus.verdict}
            </span>
            <div className="text-right">
              <div className="text-[11px] text-white/40 font-mono">Score</div>
              <div className={`font-mono text-xl font-bold ${consensus.score >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {consensus.score >= 0 ? '+' : ''}
                {consensus.score.toFixed(2)}
              </div>
            </div>
          </div>
          <ScoreBar score={consensus.score} height={10} />
          <div className="flex items-center justify-between text-[11px] font-mono text-white/50">
            <span>Confiança <span className="text-white font-bold">{Math.round(consensus.confidence * 100)}%</span></span>
            <span>Acordo <span className="text-white font-bold">{Math.round(consensus.agreement * 100)}%</span></span>
            <span>Bull/Bear <span className="text-white font-bold">{Math.round(consensus.bullPressure * 100)}/{Math.round(consensus.bearPressure * 100)}</span></span>
          </div>
          {consensus.dispute && (
            <div className="text-[11px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-1.5">
              ⚠️ Disputa Bull-Bear ativa — convicção reduzida.
            </div>
          )}
        </div>

        <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 space-y-3">
          <div className="flex items-center gap-2 text-xs text-white/40 font-mono">
            <ShieldCheck className="w-4 h-4 text-emerald-400" /> RISK MANAGER — Banca $100
          </div>
          <div className="font-mono text-3xl font-light text-white">
            $ {risk.currentBalance.toFixed(2)}
            <span className={`ml-2 text-sm ${risk.currentBalance >= 100 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {risk.currentBalance >= 100 ? '+' : ''}
              {(risk.currentBalance - risk.initialBalance).toFixed(2)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-white/50">
            <div>Risco/trade: <span className="text-white">{risk.riskPercent}% (${risk.riskPerTrade.toFixed(2)})</span></div>
            <div>Caixa livre: <span className="text-white">${risk.availableCash.toFixed(2)}</span></div>
            <div>Perdas consec.: <span className={risk.consecutiveLosses >= risk.maxConsecutiveLosses ? 'text-rose-400 font-bold' : 'text-white'}>{risk.consecutiveLosses}/{risk.maxConsecutiveLosses}</span></div>
            <div>Drawdown dia: <span className={risk.dailyDrawdownPercent >= risk.dailyDrawdownLimitPct ? 'text-rose-400' : 'text-white'}>{risk.dailyDrawdownPercent.toFixed(2)}%</span></div>
          </div>
          <div className="flex items-center justify-between gap-2">
            {risk.lockActive ? (
              <span className="text-[11px] font-mono text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-1.5 flex items-center gap-1.5 flex-1">
                <Lock className="w-3.5 h-3.5" /> TRAVA: {risk.lockReason}
              </span>
            ) : (
              <span className="text-[11px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-1.5 flex items-center gap-1.5 flex-1">
                <LockOpen className="w-3.5 h-3.5" /> Salvaguardas ativas
              </span>
            )}
            {risk.lockActive && (
              <button
                onClick={() => doAction(() => releaseJarvisRiskLock())}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-[11px] font-mono cursor-pointer border border-white/10 shrink-0"
              >
                Liberar
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-white/50">
            <button
              onClick={() => doAction(() => configureJarvisCommittee({ scalperMode: !risk.scalperMode }))}
              className={`px-3 py-1.5 rounded-lg cursor-pointer border transition ${
                risk.scalperMode
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                  : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
              }`}
            >
              Modo Scalper (2FA): {risk.scalperMode ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => doAction(() => configureJarvisCommittee({ autoTrade: !snapshot.autoTradeEnabled }))}
              className={`px-3 py-1.5 rounded-lg cursor-pointer border transition ${
                snapshot.autoTradeEnabled
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
              }`}
            >
              Auto-trade (papel): {snapshot.autoTradeEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </div>

      {/* Agentes votantes */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BrainCircuit className="w-4 h-4 text-cyan-400" />
          <h3 className="font-bold text-white text-sm">Agentes Votantes (deliberação em tempo real)</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {snapshot.agents.map((agent) => (
            <AgentCard key={agent.agentId} agent={agent} />
          ))}
        </div>
      </div>

      {/* Agentes novos + indicadores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900/30 border border-violet-500/20 rounded-3xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-violet-400" />
            <h3 className="font-bold text-white text-sm">Agentes Descobertos na Meta-Pesquisa</h3>
            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30 font-mono">
              extensões
            </span>
          </div>

          <div className="bg-black/30 border border-white/5 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-sm text-white">REGIME-GUARD</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${regimeTone(snapshot.regime)}`}>
                {snapshot.regime} · {Math.round(snapshot.regimeConfidence * 100)}%
              </span>
            </div>
            <p className="text-[11px] text-white/50 leading-relaxed">
              Classifica o regime e re-pondera os agentes (em alta volatilidade, sinais de tendência
              perdem peso e a liquidez manda). Vol realizada: {snapshot.indicators.realizedVolatility.toFixed(1)}% a.a.
            </p>
          </div>

          <div className="bg-black/30 border border-white/5 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-sm text-white">BULL-BEAR DEBATE</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${debate.dispute ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'}`}>
                {debate.dispute ? 'IMPASSE' : 'CONSENSO'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="text-[10px] font-mono text-emerald-400 mb-1">Bull {Math.round(debate.bullPressure * 100)}%</div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full bg-emerald-400/80" style={{ width: `${debate.bullPressure * 100}%` }} />
                </div>
              </div>
              <div className="flex-1">
                <div className="text-[10px] font-mono text-rose-400 mb-1">Bear {Math.round(debate.bearPressure * 100)}%</div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full bg-rose-400/80" style={{ width: `${debate.bearPressure * 100}%` }} />
                </div>
              </div>
            </div>
            <p className="text-[11px] text-white/50 leading-relaxed">{debate.reason}</p>
          </div>
        </div>

        {/* Indicadores + posições */}
        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CandlestickChart className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-white text-sm">Indicadores Calculados & Posições (papel)</h3>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-mono">
            {[
              ['RSI-14', snapshot.indicators.rsi14.toFixed(1)],
              ['MACD hist', snapshot.indicators.macdHist.toFixed(2)],
              ['EMA 12/26', `${snapshot.indicators.ema12.toFixed(1)}/${snapshot.indicators.ema26.toFixed(1)}`],
              ['Vol real', `${snapshot.indicators.realizedVolatility.toFixed(1)}%`],
              ['Range pos', `${(snapshot.indicators.rangePosition * 100).toFixed(0)}%`],
              ['Vol ratio', `${snapshot.indicators.volumeRatio.toFixed(2)}x`],
            ].map(([label, value]) => (
              <div key={label} className="bg-black/30 rounded-xl p-2.5">
                <div className="text-white/40">{label}</div>
                <div className="text-white font-bold">{value}</div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="text-[11px] text-white/40 font-mono">Posições abertas ({risk.openPositions.length})</div>
            {risk.openPositions.length === 0 ? (
              <div className="text-[11px] font-mono text-white/30 bg-black/20 rounded-xl p-3">
                Nenhuma posição aberta no momento.
              </div>
            ) : (
              risk.openPositions.map((p) => (
                <div key={p.id} className="bg-black/30 border border-white/5 rounded-xl p-3 text-[11px] font-mono">
                  <div className="flex items-center justify-between">
                    <span className={p.side === 'LONG' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                      {p.side} {p.symbol}
                    </span>
                    <span className={p.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {p.pnl >= 0 ? '+' : ''}${p.pnl.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-white/50 mt-1">
                    Entrada ${p.entryPrice.toFixed(2)} · TP ${p.tpPrice.toFixed(2)} · SL ${p.slPrice.toFixed(2)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* RAG Gate + Conformidade + Mesa ALICE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* RAG Anti-alucinação */}
        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              <h3 className="font-bold text-white text-sm">RAG Gate Anti-Alucinação</h3>
            </div>
            <span
              className={`text-[11px] font-mono px-3 py-1 rounded-full border ${
                snapshot.validation.grounded
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {snapshot.validation.grounded ? 'FUNDAMENTADO' : 'VETADO'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[10px] font-mono text-white/40 mb-1">Score de alucinação</div>
              <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full ${snapshot.validation.hallucinationScore < 0.5 ? 'bg-emerald-400/80' : 'bg-rose-400/80'}`}
                  style={{ width: `${(1 - snapshot.validation.hallucinationScore) * 100}%` }}
                />
              </div>
            </div>
            <span className="font-mono text-xl font-bold text-white">
              {Math.round((1 - snapshot.validation.hallucinationScore) * 100)}%
            </span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
            {snapshot.validation.checks.map((c) => (
              <div key={c.name} className="flex items-center gap-1.5 text-[10px] font-mono">
                <span className={c.passed ? 'text-emerald-400' : 'text-rose-400'}>{c.passed ? '✓' : '✗'}</span>
                <span className="text-white/50">{c.detail}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] font-mono text-white/30 break-all">
            citações: {snapshot.validation.citations.join(', ') || '—'}
          </div>
        </div>

        {/* Conformidade de corretora */}
        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-white text-sm">Conformidade de Corretora</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="bg-black/30 rounded-xl p-2.5">
              <div className="text-white/40">Exchange</div>
              <div className="text-white font-bold">{snapshot.compliance.exchange}</div>
            </div>
            <div className="bg-black/30 rounded-xl p-2.5">
              <div className="text-white/40">Timeframe</div>
              <div className="text-white font-bold">{snapshot.compliance.timeframe}</div>
            </div>
          </div>
          <div className="text-[11px] font-mono text-white/50">
            Timeframes aceitos (auditados):{' '}
            <span className="text-cyan-300">{snapshot.compliance.acceptedTimeframes.join(', ')}</span>
          </div>
          <div
            className={`text-[11px] font-mono px-3 py-2 rounded-lg border ${
              snapshot.compliance.lastVetoReason
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            {snapshot.compliance.lastVetoReason
              ? `⏳ ${snapshot.compliance.lastVetoReason}`
              : '✅ Janela de execução livre (fechamento de candle 1m).'}
          </div>
        </div>

        {/* Mesa ALICE (Trading-as-Git) */}
        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileDiff className="w-4 h-4 text-violet-400" />
              <h3 className="font-bold text-white text-sm">Mesa ALICE (Trading-as-Git)</h3>
            </div>
            <button
              onClick={() => doAction(() => setJarvisDeskMode(!snapshot.deskMode))}
              className={`px-3 py-1.5 rounded-lg cursor-pointer border transition text-[11px] font-mono ${
                snapshot.deskMode
                  ? 'bg-violet-500/15 border-violet-500/40 text-violet-300'
                  : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
              }`}
            >
              Aprovação: {snapshot.deskMode ? 'ON' : 'OFF'}
            </button>
          </div>
          <p className="text-[11px] text-white/50 leading-relaxed">
            Operações "staged" como commits de Git — aprovação humana antes de tocar o broker
            (padrão OpenAlice).
          </p>
          <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar">
            {snapshot.risk.stagedOperations.length === 0 ? (
              <div className="text-[11px] font-mono text-white/30 bg-black/20 rounded-xl p-3">
                Nenhuma operação staged no momento.
              </div>
            ) : (
              snapshot.risk.stagedOperations.map((op) => (
                <div key={op.id} className="bg-black/30 border border-violet-500/20 rounded-xl p-2.5 text-[10px] font-mono">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-violet-300 font-bold">
                      <GitCommitHorizontal className="w-3 h-3" /> {op.commitHash}
                    </span>
                    <span className={op.side === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}>
                      {op.side} {op.symbol}
                    </span>
                  </div>
                  <div className="text-white/50 mt-1">
                    @ {op.entryPrice.toFixed(2)} · risco ${op.riskAmount.toFixed(2)} · TP {op.tpPrice.toFixed(2)} · SL {op.slPrice.toFixed(2)}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <button
                      onClick={() => doAction(() => approveJarvisOperation(op.id))}
                      className="px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3 h-3" /> Aprovar
                    </button>
                    <button
                      onClick={() => doAction(() => rejectJarvisOperation(op.id))}
                      className="px-2 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3 h-3" /> Rejeitar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Trilha de auditoria */}
      <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-white text-sm">Trilha de Auditoria SHA-256 (Append-Only)</h3>
          </div>
          <span
            className={`text-[11px] font-mono px-3 py-1 rounded-full border ${
              snapshot.audit.integrity
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {snapshot.audit.integrity ? 'INTEGRIDADE OK' : 'INTEGRIDADE VIOLADA'} · {snapshot.audit.totalBlocks} blocos
          </span>
        </div>
        <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
          {snapshot.audit.tail.map((evt) => (
            <div key={evt.id} className="flex items-start gap-2 text-[11px] font-mono">
              <span
                className={`px-2 py-0.5 rounded shrink-0 ${
                  evt.type === 'ORDER_FILLED' || evt.type === 'APPROVED'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : evt.type === 'POSITION_CLOSED'
                      ? 'bg-cyan-500/15 text-cyan-300'
                      : evt.type === 'RISK_VETO' || evt.type === 'RAG_VETO'
                        ? 'bg-amber-500/15 text-amber-300'
                        : evt.type === 'HALT' || evt.type === 'REJECTED'
                          ? 'bg-rose-500/15 text-rose-300'
                          : evt.type === 'STAGED'
                            ? 'bg-violet-500/15 text-violet-300'
                            : 'bg-white/10 text-slate-300'
                }`}
              >
                {evt.type}
              </span>
              <span className="text-white/60 leading-relaxed break-all">
                {evt.detail}
                <span className="text-white/25"> · #{evt.hash.slice(0, 10)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Backtest */}
      <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Waves className="w-4 h-4 text-cyan-400" />
            <div>
              <h3 className="font-bold text-white text-sm">Backtest Determinístico do Comitê</h3>
              <p className="text-[11px] text-white/40 font-mono">
                Replay barra-a-barra (agentes → consenso → risco) sobre série sintética rotulada.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={btDays}
              onChange={(e) => setBtDays(Number(e.target.value))}
              className="bg-zinc-900/60 border border-white/10 rounded-full px-3 py-2 text-xs font-mono text-slate-200 outline-none cursor-pointer"
            >
              {[3, 7, 14, 30, 60].map((d) => (
                <option key={d} value={d}>
                  {d} dias
                </option>
              ))}
            </select>
            <button
              onClick={runBacktest}
              disabled={backtesting}
              className="px-4 py-2 rounded-full bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 font-mono text-xs flex items-center gap-2 cursor-pointer transition"
            >
              <Gauge className={`w-3.5 h-3.5 ${backtesting ? 'animate-spin' : ''}`} />
              {backtesting ? 'Executando...' : 'Rodar Backtest'}
            </button>
          </div>
        </div>

        {backtest && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="grid grid-cols-3 gap-2 lg:col-span-1">
              {[
                ['Trades', `${backtest.totalTrades}`],
                ['Win rate', `${backtest.winRate}%`],
                ['PnL', `${backtest.totalPnl >= 0 ? '+' : ''}$${backtest.totalPnl.toFixed(2)}`],
                ['Retorno', `${backtest.totalPnlPct}%`],
                ['Max DD', `${backtest.maxDrawdownPct}%`],
                ['Sharpe', `${backtest.sharpeRatio}`],
              ].map(([label, value]) => (
                <div key={label} className="bg-black/30 rounded-xl p-3 text-center">
                  <div className="text-[10px] text-white/40 font-mono">{label}</div>
                  <div className={`font-mono font-bold ${label === 'PnL' || label === 'Retorno' ? (backtest.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-white'}`}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
            <div className="lg:col-span-2 bg-black/30 border border-white/5 rounded-2xl p-4">
              <div className="text-[11px] text-white/40 font-mono mb-2">
                Curva de equity ({backtest.equityCurve.length} pontos) · {backtest.bars.toLocaleString()} velas 1m
              </div>
              <EquityCurve data={backtest.equityCurve} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EquityCurve({ data }: { data: { index: number; time: string; balance: number }[] }) {
  if (!data.length) return null;
  const w = 600;
  const h = 140;
  const pad = 8;
  const min = Math.min(...data.map((d) => d.balance));
  const max = Math.max(...data.map((d) => d.balance));
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const y = (b: number) => h - pad - ((b - min) / span) * (h - pad * 2);
  const points = data.map((d, i) => `${x(i).toFixed(1)},${y(d.balance).toFixed(1)}`).join(' ');
  const zeroY = y(100);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
      <line x1={pad} y1={zeroY} x2={w - pad} y2={zeroY} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
      <polyline points={points} fill="none" stroke="#22d3ee" strokeWidth="1.5" />
    </svg>
  );
}
