import React, { useEffect, useState } from 'react';
import {
  fetchOperationalGuardStatus,
  toggleOperationalGuardKillSwitch,
  OperationalGuardStatus,
} from '../services/api';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Clock,
  Zap,
  TrendingUp,
  Percent,
  Database,
  Power,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface OperationalGuardCardProps {
  onRefresh?: () => void;
}

export function OperationalGuardCard({ onRefresh }: OperationalGuardCardProps) {
  const [guardStatus, setGuardStatus] = useState<OperationalGuardStatus | null>(null);
  const [toggling, setToggling] = useState<boolean>(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const data = await fetchOperationalGuardStatus();
      setGuardStatus(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleKillSwitch = async () => {
    if (!guardStatus) return;
    setToggling(true);
    try {
      const newActive = !guardStatus.killSwitch;
      const res = await toggleOperationalGuardKillSwitch(newActive);
      setGuardStatus((prev) => (prev ? { ...prev, killSwitch: res.kill_switch } : null));
      setMsg(
        res.kill_switch
          ? '🛑 Kill Switch Global ATIVADO! Todas as operações foram congeladas no Firestore.'
          : '🟢 Kill Switch Global DESATIVADO. Operações liberadas para execução.'
      );
      if (onRefresh) onRefresh();
    } catch (e: any) {
      setMsg(`Erro ao alterar Kill Switch: ${e.message}`);
    } finally {
      setToggling(false);
      setTimeout(() => setMsg(null), 5000);
    }
  };

  const isKilled = guardStatus?.killSwitch;

  return (
    <div className="bg-gradient-to-br from-zinc-950 via-zinc-900/90 to-zinc-950 border border-emerald-500/20 rounded-3xl p-6 shadow-2xl space-y-5 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16"></div>

      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-white/10 pb-4 relative z-10">
        <div className="flex items-center gap-3.5">
          <div
            className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 shadow-inner ${
              isKilled
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
            }`}
          >
            {isKilled ? (
              <ShieldAlert className="w-6 h-6 animate-pulse text-rose-400" />
            ) : (
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-emerald-400" />
                OperationalGuard – Travas de Compliance & Corretoras Nacionais
              </h3>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border uppercase flex items-center gap-1 ${
                  isKilled
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                    : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                {isKilled ? 'KILL SWITCH ATIVO (BLOQUEADO)' : 'COMPLIANCE 100% OPERACIONAL'}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 flex items-center gap-1">
                <Database className="w-3 h-3" />
                FIRESTORE AUDIT
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Pipeline centralizado de salvaguardas antes do envio de ordens à B3, Binance e NASDAQ.
            </p>
          </div>
        </div>

        {/* Global Kill Switch Button */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={handleToggleKillSwitch}
            disabled={toggling}
            className={`px-4 py-2.5 rounded-2xl font-mono text-xs font-bold transition flex items-center gap-2 shadow-lg cursor-pointer border ${
              isKilled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/50'
                : 'bg-rose-600/90 hover:bg-rose-500 text-white border-rose-400/50'
            }`}
          >
            <Power className="w-4 h-4" />
            {toggling
              ? 'Processando...'
              : isKilled
              ? 'Desarmar Kill Switch (Permitir)'
              : 'Acionar Kill Switch (Bloquear)'}
          </button>
        </div>
      </div>

      {/* Message feedback */}
      {msg && (
        <div
          className={`p-3 rounded-2xl text-xs font-mono flex items-center gap-2 border animate-fade-in ${
            isKilled
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          }`}
        >
          {isKilled ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{msg}</span>
        </div>
      )}

      {/* 7 Compliance Safeguards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono relative z-10">
        {/* 1. Kill Switch Global */}
        <div className="bg-black/50 border border-white/5 rounded-2xl p-3.5 space-y-1.5">
          <div className="text-white/40 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-white/80">
              <Power className="w-3.5 h-3.5 text-rose-400" /> 1. Kill Switch Global
            </span>
            <span className={isKilled ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
              {isKilled ? 'ATIVADO' : 'STANDBY'}
            </span>
          </div>
          <div className="text-white font-bold text-sm">
            {isKilled ? 'Operações Travadas' : 'Operação Normal'}
          </div>
          <p className="text-[10px] text-white/50">
            Documento Firestore <code className="text-amber-300">config/global</code> sincronizado em tempo real.
          </p>
        </div>

        {/* 2. Verificação HMAC */}
        <div className="bg-black/50 border border-white/5 rounded-2xl p-3.5 space-y-1.5">
          <div className="text-white/40 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-white/80">
              <Lock className="w-3.5 h-3.5 text-indigo-400" /> 2. HMAC-SHA256
            </span>
            <span className="text-indigo-400 font-bold">ATIVO</span>
          </div>
          <div className="text-white font-bold text-sm">Anti-Adulteração</div>
          <p className="text-[10px] text-white/50">
            Assinatura canônica obrigatória com verificação em tempo constante (timingSafeEqual).
          </p>
        </div>

        {/* 3. TimeGate */}
        <div className="bg-black/50 border border-white/5 rounded-2xl p-3.5 space-y-1.5">
          <div className="text-white/40 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-white/80">
              <Clock className="w-3.5 h-3.5 text-cyan-400" /> 3. TimeGate
            </span>
            <span className="text-cyan-400 font-bold">1m – 24h</span>
          </div>
          <div className="text-white font-bold text-sm">Janela Obrigatória</div>
          <p className="text-[10px] text-white/50">
            Bloqueia qualquer ordem com duração estimada fora de 60s a 86.400s.
          </p>
        </div>

        {/* 4. Limite de Ordens/Hora */}
        <div className="bg-black/50 border border-white/5 rounded-2xl p-3.5 space-y-1.5">
          <div className="text-white/40 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-white/80">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> 4. Rate Limit
            </span>
            <span className="text-amber-400 font-bold">Máx 10 / h</span>
          </div>
          <div className="text-white font-bold text-sm">Por Conta</div>
          <p className="text-[10px] text-white/50">
            Controle de frequência para evitar throttling e punições em corretoras nacionais.
          </p>
        </div>

        {/* 5. Limite de Lucro Diário */}
        <div className="bg-black/50 border border-white/5 rounded-2xl p-3.5 space-y-1.5">
          <div className="text-white/40 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-white/80">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> 5. Trava Diária
            </span>
            <span className="text-emerald-400 font-bold">+5,0% Meta</span>
          </div>
          <div className="text-white font-bold text-sm">Limite de Lucro</div>
          <p className="text-[10px] text-white/50">
            Bloqueia novas operações ao bater 5% do patrimônio no dia, protegendo os ganhos.
          </p>
        </div>

        {/* 6. Slippage Realista */}
        <div className="bg-black/50 border border-white/5 rounded-2xl p-3.5 space-y-1.5">
          <div className="text-white/40 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-white/80">
              <Percent className="w-3.5 h-3.5 text-orange-400" /> 6. Slippage & Taxas
            </span>
            <span className="text-orange-400 font-bold">0,05% / 0,1%</span>
          </div>
          <div className="text-white font-bold text-sm">Execução Realista</div>
          <p className="text-[10px] text-white/50">
            Aplica slippage no spread e taxa proporcional ao valor nocional total do trade.
          </p>
        </div>

        {/* 7. Persistência e Auditoria */}
        <div className="bg-black/50 border border-white/5 rounded-2xl p-3.5 space-y-1.5 sm:col-span-2">
          <div className="text-white/40 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-white/80">
              <Database className="w-3.5 h-3.5 text-purple-400" /> 7. Persistência & Auditoria Firestore
            </span>
            <span className="text-purple-400 font-bold">COLEÇÃO /orders</span>
          </div>
          <div className="text-white font-bold text-sm">Gravação Imediata de Ordens Aprovadas</div>
          <p className="text-[10px] text-white/50">
            Toda ordem aprovada pelo guardião recebe carimbo temporal, fill price auditado e registro persistente no Firestore.
          </p>
        </div>
      </div>
    </div>
  );
}
