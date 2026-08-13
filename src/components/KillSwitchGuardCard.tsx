import React, { useEffect, useState } from 'react';
import {
  fetchKillSwitchStatus,
  toggleKillSwitch,
  fetchTimeGateLimits,
  fetchRealisticSettings,
  resetPlatformData,
} from '../services/api';
import { Power, ShieldAlert, Clock, Gauge, DollarSign, Activity, RotateCcw } from 'lucide-react';

interface KillSwitchGuardCardProps {
  onStatusChange?: (isActive: boolean) => void;
}

export function KillSwitchGuardCard({ onStatusChange }: KillSwitchGuardCardProps) {
  const [isActive, setIsActive] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [resetting, setResetting] = useState<boolean>(false);
  const [timeLimits, setTimeLimits] = useState<any>(null);
  const [realisticSettings, setRealisticSettings] = useState<any>(null);

  const loadData = async () => {
    try {
      const [ks, limits, settings] = await Promise.all([
        fetchKillSwitchStatus().catch(() => ({ isActive: true })),
        fetchTimeGateLimits().catch(() => null),
        fetchRealisticSettings().catch(() => null),
      ]);
      setIsActive(ks.isActive);
      setTimeLimits(limits);
      setRealisticSettings(settings);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async () => {
    setLoading(true);
    try {
      const res = await toggleKillSwitch();
      setIsActive(res.isActive);
      if (onStatusChange) onStatusChange(res.isActive);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Deseja resetar a banca e o histórico para iniciar 100% no lucro?')) return;
    setResetting(true);
    try {
      await resetPlatformData();
      if (onStatusChange) onStatusChange(isActive);
      await loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-white/10 rounded-3xl p-5 shadow-2xl space-y-4">
      {/* Top Banner & Main Kill Switch Toggle */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
              isActive
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
            }`}
          >
            <Power className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-cyan-400" />
                Kill Switch Global & Operações de Alta Precisão (Lucro)
              </h3>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border uppercase ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse'
                }`}
              >
                {isActive ? '🟢 OPERAÇÕES ATIVAS' : '🔴 PARADA DE EMERGÊNCIA'}
              </span>
            </div>
            <p className="text-xs text-white/50">
              Taxas calibradas sobre volume nocional, alvo de Take Profit com alta assertividade e filtro TimeGate.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleReset}
            disabled={resetting}
            title="Limpar histórico e reiniciar banca em R$ 100,00"
            className="px-3.5 py-2.5 rounded-2xl font-mono text-xs font-semibold bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 transition flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
            {resetting ? 'Resetando...' : 'Resetar Banca'}
          </button>

          <button
            onClick={handleToggle}
            disabled={loading}
            className={`px-5 py-2.5 rounded-2xl font-mono text-xs font-bold transition flex items-center gap-2 shadow-lg cursor-pointer border shrink-0 ${
              isActive
                ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400/50 hover:shadow-rose-500/20'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/50 hover:shadow-emerald-500/20'
            }`}
          >
            <Power className="w-4 h-4" />
            {loading ? 'Processando...' : isActive ? 'DESLIGAR BOTS' : 'ATIVAR OPERAÇÕES'}
          </button>
        </div>
      </div>

      {/* Realistic Execution Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
        {/* Metric 1: TimeGate */}
        <div className="bg-black/40 border border-white/5 rounded-2xl p-3 space-y-1">
          <div className="text-white/40 flex items-center gap-1.5 text-[11px]">
            <Clock className="w-3.5 h-3.5 text-cyan-400" /> Duração TimeGate
          </div>
          <div className="text-white font-bold text-sm">
            {timeLimits ? `${timeLimits.minMinutes} min – ${timeLimits.maxHours}h` : '1 min – 24 hrs'}
          </div>
          <div className="text-[10px] text-white/50">Ordens fora do tempo são rejeitadas</div>
        </div>

        {/* Metric 2: Order Frequency */}
        <div className="bg-black/40 border border-white/5 rounded-2xl p-3 space-y-1">
          <div className="text-white/40 flex items-center gap-1.5 text-[11px]">
            <Gauge className="w-3.5 h-3.5 text-indigo-400" /> Limite de Frequência
          </div>
          <div className="text-white font-bold text-sm">
            {realisticSettings ? `Máx ${realisticSettings.maxOrdersPerHour} / hora` : 'Máx 10 / hora'}
          </div>
          <div className="text-[10px] text-white/50">Proteção contra spam de ordens</div>
        </div>

        {/* Metric 3: Daily Profit Cap */}
        <div className="bg-black/40 border border-white/5 rounded-2xl p-3 space-y-1">
          <div className="text-white/40 flex items-center gap-1.5 text-[11px]">
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Trava Lucro Diário
          </div>
          <div className="text-emerald-400 font-bold text-sm">
            {realisticSettings ? `Máx ${realisticSettings.dailyProfitLimitPct}% do Capital` : 'Máx 5% do Capital'}
          </div>
          <div className="text-[10px] text-white/50">Crescimento de lucro sustentável</div>
        </div>

        {/* Metric 4: Slippage & Fees */}
        <div className="bg-black/40 border border-white/5 rounded-2xl p-3 space-y-1">
          <div className="text-white/40 flex items-center gap-1.5 text-[11px]">
            <Activity className="w-3.5 h-3.5 text-amber-400" /> Slippage & Corretagem
          </div>
          <div className="text-amber-300 font-bold text-sm">
            {realisticSettings
              ? `${realisticSettings.slippagePct}% Slip | ${realisticSettings.feeRatePct}% Fee`
              : '0.05% Slip | 0.1% Fee'}
          </div>
          <div className="text-[10px] text-white/50">Cálculo realista de PnL líquido</div>
        </div>
      </div>
    </div>
  );
}
