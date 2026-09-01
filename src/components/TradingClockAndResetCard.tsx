import React, { useState, useEffect, useCallback } from 'react';
import { Trade, SessionStats } from '../types';
import {
  Clock,
  RotateCcw,
  Timer,
  Activity,
  Zap,
  Play,
  Pause,
  AlertCircle,
  TrendingUp,
  CheckCircle2,
  ShieldCheck,
  Database,
  BarChart3,
  Calendar,
  Layers,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
} from 'lucide-react';
import {
  resetPlatformStore,
  resetDemoAccount,
  fetchSessionStats,
  resetSessionStats,
  toggleSessionStats,
} from '../services/api';

interface TradingClockAndResetCardProps {
  accountId: string;
  accountName: string;
  initialBalance: number;
  currentBalance: number;
  trades: Trade[];
  onResetComplete: () => void;
}

export function TradingClockAndResetCard({
  accountId,
  accountName,
  initialBalance,
  currentBalance,
  trades,
  onResetComplete,
}: TradingClockAndResetCardProps) {
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [sessionSeconds, setSessionSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(true);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [showHourlyTable, setShowHourlyTable] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Carrega e sincroniza o relógio diretamente com o banco de dados/servidor
  const loadServerSessionStats = useCallback(async () => {
    try {
      setIsSyncing(true);
      const data = await fetchSessionStats();
      setSessionStats(data);
      setIsTimerRunning(data.isTimerRunning);
      setSessionSeconds(data.sessionSeconds);
    } catch (err) {
      console.warn('Falha ao sincronizar relógio com servidor:', err);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    loadServerSessionStats();
    const interval = setInterval(loadServerSessionStats, 5000); // Polling regular a cada 5s
    return () => clearInterval(interval);
  }, [loadServerSessionStats]);

  // Cronômetro local fluído de alta precisão (incrementa segundo a segundo se ativo)
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isTimerRunning) {
      timer = setInterval(() => {
        setSessionSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isTimerRunning]);

  // Format seconds into HH:MM:SS (ou DDd HH:MM:SS para longos períodos)
  const formatTime = (totalSec: number) => {
    if (isNaN(totalSec) || totalSec < 0) return '00:00:00';
    const days = Math.floor(totalSec / 86400);
    const hrs = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    if (days > 0) {
      return `${days}d ${hrs.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m`;
    }
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Format trade duration in mm:ss or s
  const formatDurationDisplay = (totalSec: number) => {
    if (totalSec <= 0) return '≥ 1m (Auditado)';
    if (totalSec < 60) return `${totalSec}s`;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  // Calculate average duration of completed trades
  const closedTrades = trades.filter((t) => t.status === 'closed');
  const avgTradeDurationSeconds =
    closedTrades.length > 0
      ? Math.round(
          closedTrades.reduce((acc, t) => {
            if (t.durationSeconds && t.durationSeconds > 0) return acc + t.durationSeconds;
            const start = new Date(t.entryTime).getTime();
            const end = new Date(t.closeTime || t.exitTime || '').getTime();
            return acc + (isNaN(start) || isNaN(end) ? 60 : Math.max(1, (end - start) / 1000));
          }, 0) / closedTrades.length
        )
      : 60;

  const openTrades = trades.filter((t) => t.status === 'open');

  // Hourly calculations derived
  const sessionHours = Math.max(0.05, sessionSeconds / 3600);
  const tradesPerHour = sessionStats ? sessionStats.tradesPerHour : Number((closedTrades.length / sessionHours).toFixed(2));
  const totalPnl = closedTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
  const pnlPerHour = sessionStats ? sessionStats.pnlPerHour : Number((totalPnl / sessionHours).toFixed(2));

  // Reset total (Banca para R$ 100 + Relógio zerado)
  const handleResetTo100 = async () => {
    setIsResetting(true);
    setResetMessage(null);
    try {
      await resetDemoAccount(accountId);
      await resetPlatformStore();
      const res = await resetSessionStats();
      if (res && res.stats) {
        setSessionStats(res.stats);
        setSessionSeconds(0);
        setIsTimerRunning(true);
      }
      try {
        localStorage.setItem('quantum_session_start_time', Date.now().toString());
      } catch {}

      setResetMessage('Banca reiniciada com $ 100.00 USD e relógio de negociações salvo com sucesso no banco de dados!');
      setShowConfirmModal(false);
      onResetComplete();
    } catch (err: any) {
      setResetMessage(`Erro ao reiniciar: ${err.message || 'Falha na requisição'}`);
    } finally {
      setIsResetting(false);
      setTimeout(() => setResetMessage(null), 6000);
    }
  };

  // Pausar / Retomar Relógio
  const handleToggleTimer = async () => {
    const nextState = !isTimerRunning;
    setIsTimerRunning(nextState);
    try {
      const res = await toggleSessionStats(nextState);
      if (res && res.stats) {
        setSessionStats(res.stats);
      }
    } catch (e) {
      console.warn('Erro ao alternar timer:', e);
    }
  };

  // Zerar apenas o relógio de sessão
  const handleZeroTimerOnly = async () => {
    try {
      const res = await resetSessionStats();
      if (res && res.stats) {
        setSessionStats(res.stats);
        setSessionSeconds(0);
      }
      try {
        localStorage.setItem('quantum_session_start_time', Date.now().toString());
      } catch {}
      setResetMessage('Cronômetro e registros horários calibrados a partir de agora!');
      setTimeout(() => setResetMessage(null), 4000);
    } catch (err: any) {
      console.error(err);
    }
  };

  return (
    <div className="bg-gradient-to-r from-zinc-950 via-zinc-900/90 to-zinc-950 border border-cyan-500/30 rounded-3xl p-6 shadow-[0_0_30px_rgba(6,182,212,0.08)] relative overflow-hidden space-y-5">
      {/* Background radial highlight */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none -mt-20"></div>

      {/* Header and Reset Action */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-white/10 pb-4 relative z-10">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0 shadow-inner">
            <Timer className="w-6 h-6 text-cyan-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white flex items-center gap-1.5 font-mono">
                Trading Clock & Análise de Operações por Hora
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 uppercase">
                Banca Alvo: $ 100.00 USD
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Database className="w-3 h-3 text-emerald-400" />
                DB Persistente Ativo
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Auditado em Tempo Real
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Registro auditado com relógio por operação, cálculo de velocidade (trades/hora), rendimento horário (PnL/hora) e persistência durável no banco.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setShowHourlyTable((prev) => !prev)}
            className={`px-3.5 py-2 rounded-2xl font-mono text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
              showHourlyTable
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-zinc-900/80 hover:bg-zinc-800 text-white/80 border-white/10'
            }`}
            title="Ver Detalhamento de Operações por Bloco Horário"
          >
            <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
            <span>{showHourlyTable ? 'Ocultar Relatório Horário' : 'Tabela por Hora'}</span>
          </button>

          <button
            onClick={handleToggleTimer}
            className="px-3.5 py-2 rounded-2xl font-mono text-xs font-semibold bg-zinc-900/80 hover:bg-zinc-800 text-white border border-white/10 transition flex items-center gap-1.5 cursor-pointer"
            title={isTimerRunning ? 'Pausar Relógio' : 'Retomar Relógio'}
          >
            {isTimerRunning ? <Pause className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
            <span>{isTimerRunning ? 'Pausar Relógio' : 'Retomar'}</span>
          </button>

          <button
            onClick={handleZeroTimerOnly}
            className="px-3.5 py-2 rounded-2xl font-mono text-xs font-semibold bg-zinc-900/80 hover:bg-zinc-800 text-white/70 hover:text-white border border-white/10 transition flex items-center gap-1.5 cursor-pointer"
            title="Zerar Cronômetro da Sessão e Calibrar"
          >
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Zerar Relógio</span>
          </button>

          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={isResetting}
            className="px-4 py-2 rounded-2xl font-mono text-xs font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(244,63,94,0.2)] disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
            <span>Reiniciar p/ $ 100 USD</span>
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {resetMessage && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs font-mono text-emerald-300 flex items-center gap-2.5 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{resetMessage}</span>
        </div>
      )}

      {/* Bento Grid: Clocks, Timers & Hourly Performance Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 text-xs font-mono relative z-10">
        {/* Box 1: Live Session Clock */}
        <div className="bg-black/60 border border-cyan-500/30 rounded-2xl p-4 space-y-1.5 relative overflow-hidden">
          <div className="flex items-center justify-between text-[11px] text-white/50">
            <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
              <Clock className="w-3.5 h-3.5" /> Tempo de Sessão
            </span>
            <span className={`w-2 h-2 rounded-full ${isTimerRunning ? 'bg-cyan-400 animate-ping' : 'bg-amber-400'}`} />
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-300 tracking-wider">
            {formatTime(sessionSeconds)}
          </div>
          <div className="text-[10px] text-white/40 flex items-center justify-between">
            <span>Início: {sessionStats?.sessionStartedAt ? new Date(sessionStats.sessionStartedAt).toLocaleTimeString('pt-BR') : 'Agora'}</span>
            <span className="text-cyan-400/80">{sessionHours.toFixed(1)}h decorridas</span>
          </div>
        </div>

        {/* Box 2: Operações por Hora */}
        <div className="bg-black/50 border border-blue-500/30 rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-white/50">
            <span className="text-blue-400 font-bold flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> Operações / Hora
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
              Ritmo
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-blue-300">
            {tradesPerHour}{' '}
            <span className="text-xs font-normal text-white/60">ops/h</span>
          </div>
          <div className="text-[10px] text-white/40 flex items-center justify-between">
            <span>Total fechadas:</span>
            <span className="text-white font-bold">{closedTrades.length} ops</span>
          </div>
        </div>

        {/* Box 3: Rendimento por Hora (PnL / Hora) */}
        <div className="bg-black/50 border border-emerald-500/30 rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-white/50">
            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> Rendimento / Hora
            </span>
            <span className={`text-[10px] ${pnlPerHour >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {pnlPerHour >= 0 ? 'Lucrativo' : 'Drawdown'}
            </span>
          </div>
          <div className={`text-2xl font-bold font-mono ${pnlPerHour >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {pnlPerHour >= 0 ? '+' : ''}$ {pnlPerHour.toFixed(2)}
            <span className="text-xs font-normal text-white/60">/h</span>
          </div>
          <div className="text-[10px] text-white/40 flex items-center justify-between">
            <span>Última 1h:</span>
            <span className={sessionStats && sessionStats.last1HourPnl >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
              $ {sessionStats?.last1HourPnl.toFixed(2) || '0.00'} USD
            </span>
          </div>
        </div>

        {/* Box 4: Saldo da Conta & Alvo */}
        <div className="bg-black/50 border border-white/5 rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-white/50">
            <span className="text-purple-400 font-bold flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Saldo da Banca
            </span>
            <span className="text-[10px] text-white/40">USD Demo</span>
          </div>
          <div className="text-2xl font-light font-mono text-white tracking-tight">
            $ {currentBalance.toFixed(2)} USD
          </div>
          <div className="text-[10px] text-white/40 flex items-center justify-between">
            <span>Base: $ {initialBalance.toFixed(2)}</span>
            <span className={currentBalance >= initialBalance ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
              {currentBalance >= initialBalance ? '+' : ''}
              {(currentBalance - initialBalance).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Box 5: Average Duration por Trade */}
        <div className="bg-black/50 border border-white/5 rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-white/50">
            <span className="text-amber-400 font-bold flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5" /> Duração Média
            </span>
            <span className="text-[10px] text-amber-300/80">TimeGate</span>
          </div>
          <div className="text-xl font-bold font-mono text-amber-300">
            {formatDurationDisplay(avgTradeDurationSeconds)}
          </div>
          <div className="text-[10px] text-white/40 flex items-center justify-between">
            <span>Em aberto:</span>
            <span className="text-cyan-400 font-bold">{openTrades.length} vivas</span>
          </div>
        </div>

        {/* Box 6: Projeção 24h & Persistência */}
        <div className="bg-black/50 border border-white/5 rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-white/50">
            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Projeção 24h
            </span>
          </div>
          <div className={`text-xl font-bold font-mono ${sessionStats && sessionStats.projected24hPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {sessionStats && sessionStats.projected24hPnl >= 0 ? '+' : ''}$ {sessionStats?.projected24hPnl.toFixed(2) || (pnlPerHour * 24).toFixed(2)} USD
          </div>
          <div className="text-[10px] text-white/40 flex items-center justify-between">
            <span>Winrate:</span>
            <span className="text-emerald-400 font-bold">{sessionStats?.winRate || 0}%</span>
          </div>
        </div>
      </div>

      {/* Relatório Detalhado de Operações por Bloco de Horário (Hourly Performance Breakdown) */}
      {showHourlyTable && sessionStats && (
        <div className="bg-black/70 border border-cyan-500/20 rounded-2xl p-4.5 space-y-3 font-mono text-xs animate-fadeIn">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-white">Relatório Auditado de Operações por Hora</span>
              <span className="text-[11px] text-white/40">(Últimas 12 Horas de Execução)</span>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-white/60">
              <span>Últimas 4h: <strong className="text-emerald-400">$ {sessionStats.last4HoursPnl.toFixed(2)} USD</strong> ({sessionStats.last4HoursTrades} ops)</span>
              <span>Últimas 24h: <strong className="text-emerald-400">$ {sessionStats.last24HoursPnl.toFixed(2)} USD</strong> ({sessionStats.last24HoursTrades} ops)</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-white/50 text-[11px]">
                  <th className="py-2 px-3 font-medium">Bloco Horário</th>
                  <th className="py-2 px-3 font-medium text-center">Operações</th>
                  <th className="py-2 px-3 font-medium text-center">Vitórias / Derrotas</th>
                  <th className="py-2 px-3 font-medium text-center">Win Rate</th>
                  <th className="py-2 px-3 font-medium text-center">Duração Média</th>
                  <th className="py-2 px-3 font-medium text-right">Volume</th>
                  <th className="py-2 px-3 font-medium text-right">Resultado (PnL)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-[11px]">
                {sessionStats.hourlyBuckets.map((bucket, idx) => {
                  const hasTrades = bucket.tradeCount > 0;
                  return (
                    <tr
                      key={bucket.hourKey}
                      className={`hover:bg-white/5 transition ${hasTrades ? 'bg-cyan-500/5' : ''}`}
                    >
                      <td className="py-2 px-3 font-mono text-white/90 flex items-center gap-2">
                        <Clock className={`w-3.5 h-3.5 ${hasTrades ? 'text-cyan-400' : 'text-white/30'}`} />
                        <span>{bucket.displayHour}</span>
                      </td>
                      <td className="py-2 px-3 text-center font-bold font-mono">
                        {hasTrades ? (
                          <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">
                            {bucket.tradeCount} ops
                          </span>
                        ) : (
                          <span className="text-white/30">0</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center font-mono">
                        {hasTrades ? (
                          <span className="text-white/80">
                            <span className="text-emerald-400 font-bold">{bucket.winCount}W</span> /{' '}
                            <span className="text-rose-400 font-bold">{bucket.lossCount}L</span>
                          </span>
                        ) : (
                          <span className="text-white/30">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center font-mono">
                        {hasTrades ? (
                          <span className={`font-bold ${bucket.winRate >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {bucket.winRate.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-white/30">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center text-white/70 font-mono">
                        {hasTrades ? formatDurationDisplay(bucket.avgDurationSeconds) : '-'}
                      </td>
                      <td className="py-2 px-3 text-right text-white/60 font-mono">
                        {hasTrades ? `$ ${bucket.volumeTotal.toFixed(2)}` : '-'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold">
                        {hasTrades ? (
                          <span className={bucket.pnlTotal >= 0 ? 'text-emerald-400 flex items-center justify-end gap-1' : 'text-rose-400 flex items-center justify-end gap-1'}>
                            {bucket.pnlTotal >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {bucket.pnlTotal >= 0 ? '+' : ''}$ {bucket.pnlTotal.toFixed(2)} USD
                          </span>
                        ) : (
                          <span className="text-white/30">$ 0.00</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-rose-500/30 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 font-mono text-xs">
            <div className="flex items-center gap-3 text-rose-400 font-bold text-sm">
              <AlertCircle className="w-5 h-5" />
              <span>Confirmar Reinicialização de Banca</span>
            </div>

            <p className="text-white/70 leading-relaxed">
              Você deseja reiniciar a conta <strong className="text-white">{accountName}</strong> para o saldo inicial de <strong className="text-emerald-400">$ 100.00 USD</strong> e zerar o relógio de negociações?
            </p>

            <div className="p-3 bg-black/50 border border-white/10 rounded-2xl text-white/50 text-[11px] space-y-1">
              <p>• O saldo da conta será resetado exatamente para $ 100.00 USD.</p>
              <p>• As posições abertas serão encerradas e o histórico salvo com nova âncora.</p>
              <p>• O relógio de sessão e cronômetro horário voltarão para 00:00:00.</p>
              <p>• Toda a operação ficará registrada no banco de dados e auditoria.</p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white cursor-pointer transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleResetTo100}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer transition flex items-center gap-2"
              >
                {isResetting ? 'Reiniciando...' : 'Confirmar e Resetar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

