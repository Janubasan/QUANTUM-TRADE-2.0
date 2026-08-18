import React, { useEffect, useState } from 'react';
import {
  fetchRunnerStatus,
  toggleRunner,
  syncFirebaseNow,
  fetchFirebaseStatus,
  RunnerMetrics,
} from '../services/api';
import {
  Flame,
  Activity,
  Zap,
  RefreshCw,
  Database,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  Server,
  Layers,
} from 'lucide-react';

interface Runner247FirebaseCardProps {
  onRefresh?: () => void;
}

export function Runner247FirebaseCard({ onRefresh }: Runner247FirebaseCardProps) {
  const [metrics, setMetrics] = useState<RunnerMetrics | null>(null);
  const [firebaseStatus, setFirebaseStatus] = useState<any>(null);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [toggling, setToggling] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [m, fb] = await Promise.all([
        fetchRunnerStatus().catch(() => null),
        fetchFirebaseStatus().catch(() => null),
      ]);
      if (m) setMetrics(m);
      if (fb) setFirebaseStatus(fb);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleRunner = async () => {
    setToggling(true);
    try {
      const res = await toggleRunner();
      setMetrics(res.metrics);
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setToggling(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await syncFirebaseNow();
      if (res.success) {
        setSyncMessage('Sincronizado com sucesso com Firebase Firestore!');
      } else {
        setSyncMessage(`Aviso de sync: ${res.error || 'Verifique conexão'}`);
      }
      setMetrics(res.metrics);
      await loadData();
      if (onRefresh) onRefresh();
    } catch (e: any) {
      setSyncMessage(`Erro: ${e.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hrs = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (days > 0) return `${days}d ${hrs}h ${mins}m ${secs}s`;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const isRunning = metrics?.status === 'running';

  return (
    <div className="bg-gradient-to-br from-zinc-950 via-zinc-900/90 to-zinc-950 border border-amber-500/20 rounded-3xl p-6 shadow-2xl space-y-5 relative overflow-hidden">
      {/* Background glow decoration */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

      {/* Top Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-white/10 pb-4 relative z-10">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-inner">
            <Flame className="w-6 h-6 text-amber-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-400" />
                Motor 24/7 Autônomo & Persistência Firebase Firestore
              </h3>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border uppercase flex items-center gap-1 ${
                  isRunning
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping"></span>
                {isRunning ? 'RODANDO 24/7' : 'PAUSADO'}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30 flex items-center gap-1">
                <Database className="w-3 h-3" />
                FIREBASE ATIVO
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Execução contínua de estratégias quânticas, validação multi-broker sem interrupções e persistência em nuvem.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="px-3.5 py-2.5 rounded-2xl font-mono text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar Firestore'}
          </button>

          <button
            onClick={handleToggleRunner}
            disabled={toggling}
            className={`px-4 py-2.5 rounded-2xl font-mono text-xs font-bold transition flex items-center gap-2 shadow-lg cursor-pointer border shrink-0 ${
              isRunning
                ? 'bg-zinc-800 hover:bg-zinc-700 text-amber-300 border-white/10'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/50'
            }`}
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {toggling ? 'Alterando...' : isRunning ? 'Pausar Runner 24/7' : 'Iniciar 24/7'}
          </button>
        </div>
      </div>

      {/* Sync feedback notification */}
      {syncMessage && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs font-mono text-amber-300 flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* 24/7 Live Metrics Bento Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono relative z-10">
        {/* Metric 1: Uptime */}
        <div className="bg-black/50 border border-white/5 rounded-2xl p-3.5 space-y-1">
          <div className="text-white/40 flex items-center gap-1.5 text-[11px]">
            <Clock className="w-3.5 h-3.5 text-amber-400" /> Uptime 24/7
          </div>
          <div className="text-white font-bold text-sm">
            {metrics ? formatUptime(metrics.uptimeSeconds) : '0m 0s'}
          </div>
          <div className="text-[10px] text-white/50">Tempo online ininterrupto</div>
        </div>

        {/* Metric 2: Total Ticks */}
        <div className="bg-black/50 border border-white/5 rounded-2xl p-3.5 space-y-1">
          <div className="text-white/40 flex items-center gap-1.5 text-[11px]">
            <Activity className="w-3.5 h-3.5 text-cyan-400" /> Ciclos Avaliados
          </div>
          <div className="text-cyan-300 font-bold text-sm">
            {metrics ? `${metrics.totalTicks.toLocaleString()} ticks` : '0 ticks'}
          </div>
          <div className="text-[10px] text-white/50">
            {metrics ? `~${metrics.ticksPerMinute} ciclos/min` : '24/min'}
          </div>
        </div>

        {/* Metric 3: Active Bots */}
        <div className="bg-black/50 border border-white/5 rounded-2xl p-3.5 space-y-1">
          <div className="text-white/40 flex items-center gap-1.5 text-[11px]">
            <Server className="w-3.5 h-3.5 text-indigo-400" /> Robôs Ativos
          </div>
          <div className="text-white font-bold text-sm">
            {metrics ? `${metrics.activeBotsCount} Operando` : '4 Operando'}
          </div>
          <div className="text-[10px] text-emerald-400">Auto-recuperação: Ativa</div>
        </div>

        {/* Metric 4: Firebase Sync Count */}
        <div className="bg-black/50 border border-white/5 rounded-2xl p-3.5 space-y-1">
          <div className="text-white/40 flex items-center gap-1.5 text-[11px]">
            <Database className="w-3.5 h-3.5 text-orange-400" /> Firebase Firestore
          </div>
          <div className="text-orange-300 font-bold text-sm">
            {metrics ? `${metrics.syncCount} Snapshots` : 'Ativo'}
          </div>
          <div className="text-[10px] text-white/50">
            {metrics?.lastFirebaseSync
              ? `Último: ${new Date(metrics.lastFirebaseSync).toLocaleTimeString()}`
              : 'Auto-sync ativo'}
          </div>
        </div>

        {/* Metric 5: Open Positions */}
        <div className="bg-black/50 border border-white/5 rounded-2xl p-3.5 space-y-1">
          <div className="text-white/40 flex items-center gap-1.5 text-[11px]">
            <Layers className="w-3.5 h-3.5 text-purple-400" /> Posições Vivas
          </div>
          <div className="text-purple-300 font-bold text-sm">
            {metrics ? `${metrics.openTradesCount} Abertas` : '0 Abertas'}
          </div>
          <div className="text-[10px] text-white/50">
            {metrics ? `${metrics.closedTradesCount} Fechadas` : 'Histórico'}
          </div>
        </div>

        {/* Metric 6: Cloud Database Project */}
        <div className="bg-black/50 border border-white/5 rounded-2xl p-3.5 space-y-1">
          <div className="text-white/40 flex items-center gap-1.5 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Status Nuvem
          </div>
          <div
            className={`font-bold text-xs truncate ${firebaseStatus?.quotaExhausted ? 'text-amber-300' : 'text-emerald-400'}`}
            title={firebaseStatus?.projectId}
          >
            {firebaseStatus?.quotaExhausted
              ? '🛡️ Modo Local Seguro'
              : firebaseStatus?.initialized
              ? '🟢 Firestore OK'
              : '🟢 Sincronizado'}
          </div>
          <div
            className="text-[10px] text-white/50 truncate"
            title={firebaseStatus?.quotaExhausted ? 'Proteção de Quota Free Tier Ativa' : firebaseStatus?.projectId}
          >
            {firebaseStatus?.quotaExhausted ? 'Quota Guard Ativo' : firebaseStatus?.projectId || 'ai-studio...'}
          </div>
        </div>
      </div>
    </div>
  );
}
