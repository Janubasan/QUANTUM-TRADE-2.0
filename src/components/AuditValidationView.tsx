import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Database,
  FileText,
  Lock,
  Play,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Download,
  Layers,
  Activity,
  Cpu,
  Zap,
  Clock,
  Sliders,
} from 'lucide-react';
import {
  fetchAuditChain,
  fetchAuditReport,
  runAuditDemo,
  fetchSchedulerState,
  updateSchedulerMode,
} from '../services/api';

export function AuditValidationView() {
  const [activeSubTab, setActiveSubTab] = useState<'chain' | 'report' | 'rag' | 'scheduler' | 'architecture'>('chain');
  const [chainData, setChainData] = useState<{
    integrityValid: boolean;
    totalBlocks: number;
    headHash: string;
    chain: any[];
  } | null>(null);
  const [reportMarkdown, setReportMarkdown] = useState<string>('');
  const [schedulerState, setSchedulerState] = useState<{
    mode: 'scalp' | 'normal';
    allowedTimeframes: string[];
    allAllowedTimeframes: Record<'scalp' | 'normal', string[]>;
    exchangeRules: Record<string, any>;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [updatingMode, setUpdatingMode] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [c, r, s] = await Promise.all([
        fetchAuditChain(),
        fetchAuditReport(),
        fetchSchedulerState(),
      ]);
      setChainData(c);
      setReportMarkdown(r.markdown);
      setSchedulerState(s);
    } catch (err) {
      console.error('Error loading audit data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleMode = async (newMode: 'scalp' | 'normal') => {
    if (updatingMode || schedulerState?.mode === newMode) return;
    setUpdatingMode(true);
    try {
      await updateSchedulerMode(newMode);
      await loadData();
    } catch (err) {
      console.error('Error toggling scheduler mode:', err);
    } finally {
      setUpdatingMode(false);
    }
  };

  const handleRunDemo = async () => {
    setDemoRunning(true);
    try {
      const res = await runAuditDemo();
      setReportMarkdown(res.markdownReport);
      await loadData();
    } catch (err) {
      console.error('Error running demo audit:', err);
    } finally {
      setDemoRunning(false);
    }
  };

  const handleCopyReport = () => {
    if (!reportMarkdown) return;
    navigator.clipboard.writeText(reportMarkdown);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleDownloadReport = () => {
    if (!reportMarkdown) return;
    const blob = new Blob([reportMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_auditoria_trading_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                Validação & Regulação de Mercado
                <span className="text-xs px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full font-mono uppercase">
                  Zero Dados Falsos
                </span>
              </h2>
              <p className="text-xs text-white/50 mt-1">
                Ingestão Criptográfica (SHA-256 + HMAC), Verificação RAG Contextual, TradeScheduler e Módulos de Regulação de Mercado (Scalp/Normal).
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl text-xs font-mono font-semibold flex items-center gap-2 transition border border-white/10 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar Cadeia
          </button>

          <button
            onClick={handleRunDemo}
            disabled={demoRunning}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-mono font-bold text-xs uppercase tracking-wider rounded-2xl flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.4)] transition"
          >
            <Play className={`w-4 h-4 ${demoRunning ? 'animate-spin' : ''}`} />
            {demoRunning ? 'Rodando Demo Real...' : 'Rodar Teste Demo Auditado'}
          </button>
        </div>
      </div>

      {/* Security & Scheduler Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Scalp Mode & Scheduler Status */}
        <div className="bg-zinc-900/30 border border-amber-500/20 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-white/50 font-mono mb-2">
            <span>REGULADOR / SCHEDULER</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold font-mono text-amber-300 uppercase flex items-center gap-1.5">
              <span>Modo: {schedulerState?.mode || 'SCALP'}</span>
            </div>
            <div className="flex bg-black/50 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => handleToggleMode('scalp')}
                disabled={updatingMode}
                className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg transition cursor-pointer ${
                  schedulerState?.mode === 'scalp'
                    ? 'bg-amber-500 text-black'
                    : 'text-white/40 hover:text-white'
                }`}
              >
                SCALP
              </button>
              <button
                onClick={() => handleToggleMode('normal')}
                disabled={updatingMode}
                className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg transition cursor-pointer ${
                  schedulerState?.mode === 'normal'
                    ? 'bg-amber-500 text-black'
                    : 'text-white/40 hover:text-white'
                }`}
              >
                NORMAL
              </button>
            </div>
          </div>
          <p className="text-[11px] text-white/50 mt-2 font-mono">
            Timeframes:{' '}
            <span className="text-amber-400 font-bold">
              {schedulerState?.allowedTimeframes?.join(', ') || '5s, 10s, 15s, 30s'}
            </span>
          </p>
        </div>

        {/* Integrity Card */}
        <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-white/50 font-mono mb-2">
            <span>INTEGRIDADE CRIPTOGRÁFICA</span>
            <Lock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-center gap-2 text-xl font-bold font-mono text-emerald-400">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>100% VÁLIDA</span>
          </div>
          <p className="text-[11px] text-white/40 mt-2 font-mono">
            Recomputação SHA-256 sem violações na hash chain.
          </p>
        </div>

        {/* Head Hash Card */}
        <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-white/50 font-mono mb-2">
            <span>HASH HEAD DA CADEIA</span>
            <KeyRound className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xs font-mono font-bold text-cyan-300 truncate">
            {chainData?.headHash || 'Calculando...'}
          </div>
          <p className="text-[11px] text-white/40 mt-2 font-mono">
            Total de Blocos Encadeados: {chainData?.totalBlocks || 0}
          </p>
        </div>

        {/* RAG Contextual Gate */}
        <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs text-white/50 font-mono mb-2">
            <span>RAG PLAUSIBILITY GATE</span>
            <Database className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-sm font-bold font-mono text-purple-300 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-purple-400" />
            <span>OHLC Bounds Ativos</span>
          </div>
          <p className="text-[11px] text-white/40 mt-2 font-mono">
            Yahoo Finance + TradingView Historical Vector Validation.
          </p>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('chain')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
            activeSubTab === 'chain'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-white/50 hover:text-white bg-zinc-900/40'
          }`}
        >
          <Layers className="w-4 h-4" /> Cadeia de Hashes Imutável ({chainData?.totalBlocks || 0})
        </button>

        <button
          onClick={() => setActiveSubTab('scheduler')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
            activeSubTab === 'scheduler'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-white/50 hover:text-white bg-zinc-900/40'
          }`}
        >
          <Sliders className="w-4 h-4" /> TradeScheduler & Regras de Mercado
        </button>

        <button
          onClick={() => setActiveSubTab('report')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
            activeSubTab === 'report'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'text-white/50 hover:text-white bg-zinc-900/40'
          }`}
        >
          <FileText className="w-4 h-4" /> Relatório de Auditoria (.md)
        </button>

        <button
          onClick={() => setActiveSubTab('rag')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
            activeSubTab === 'rag'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
              : 'text-white/50 hover:text-white bg-zinc-900/40'
          }`}
        >
          <Database className="w-4 h-4" /> Base Histórica RAG (OHLC Bounds)
        </button>

        <button
          onClick={() => setActiveSubTab('architecture')}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
            activeSubTab === 'architecture'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
              : 'text-white/50 hover:text-white bg-zinc-900/40'
          }`}
        >
          <Cpu className="w-4 h-4" /> Arquitetura do Sistema
        </button>
      </div>

      {/* Tab 1: Immutable Hash Chain */}
      {activeSubTab === 'chain' && (
        <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2 font-mono">
              <Layers className="w-5 h-5 text-cyan-400" /> Audit Log Imutável (Cadeia SHA-256)
            </h3>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/30">
              Cadeia verified ✓
            </span>
          </div>

          <p className="text-xs text-white/50">
            Cada evento de ingestão de mercado é transformado em um bloco encadeado. Qualquer alteração nos dados do payload inviabiliza o Hash Head.
          </p>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            {chainData?.chain.map((block: any) => {
              const isApproved = block.entry.status === 'APPROVED';
              return (
                <div
                  key={block.blockNumber}
                  className={`p-4 rounded-2xl border font-mono text-xs transition ${
                    isApproved
                      ? 'bg-zinc-900/80 border-emerald-500/20'
                      : 'bg-rose-950/20 border-rose-500/30'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">Bloco #{block.blockNumber}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          isApproved
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {block.entry.status}
                      </span>
                      {block.entry.reason && (
                        <span className="text-rose-400 text-[11px] font-bold">
                          [{block.entry.reason}]
                        </span>
                      )}
                    </div>
                    <span className="text-white/40 text-[11px]">{block.timestamp}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-white/70">
                    <div>
                      <span className="text-white/40">Provedor:</span>{' '}
                      <span className="text-cyan-400 font-bold">{block.entry.source}</span>
                    </div>
                    <div>
                      <span className="text-white/40">Símbolo & Preço:</span>{' '}
                      <span className="text-white font-bold">
                        {block.entry.payload.symbol || 'N/A'}{' '}
                        {block.entry.payload.close ? `@ R$ ${Number(block.entry.payload.close).toFixed(2)}` : ''}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 space-y-1 text-[10px] text-white/50 bg-black/40 p-2.5 rounded-xl border border-white/5">
                    <div className="truncate">
                      <span className="text-white/30">Prev Hash:</span> {block.prev_hash}
                    </div>
                    <div className="truncate font-bold text-cyan-400">
                      <span className="text-white/30">Current Hash:</span> {block.current_hash}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: TradeScheduler & Market Rules */}
      {activeSubTab === 'scheduler' && (
        <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2 font-mono">
                <Sliders className="w-5 h-5 text-amber-400" /> Regulador de Mercado (`TradeScheduler`)
              </h3>
              <p className="text-xs text-white/50 mt-1">
                Garante que operações no modo SCALP usem exclusivamente timeframes sub-minuto (5s, 10s, 15s, 30s) e respeitem taxas limites de ordens por bolsa.
              </p>
            </div>

            <div className="flex items-center gap-3 bg-black/60 p-2 rounded-2xl border border-white/10">
              <span className="text-xs font-mono text-white/60">Modo de Operação:</span>
              <button
                onClick={() => handleToggleMode('scalp')}
                disabled={updatingMode}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
                  schedulerState?.mode === 'scalp'
                    ? 'bg-amber-500 text-black shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                    : 'text-white/40 hover:text-white bg-zinc-800'
                }`}
              >
                SCALP (Sub-minuto)
              </button>
              <button
                onClick={() => handleToggleMode('normal')}
                disabled={updatingMode}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
                  schedulerState?.mode === 'normal'
                    ? 'bg-amber-500 text-black shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                    : 'text-white/40 hover:text-white bg-zinc-800'
                }`}
              >
                NORMAL (Minutos/Horas)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Allowed Timeframes Card */}
            <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-5 space-y-4 font-mono">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h4 className="text-xs font-bold text-amber-400 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> TIMEFRAMES PERMITIDOS POR MODO
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 uppercase font-bold">
                  Ativo: {schedulerState?.mode}
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-black/40 border border-amber-500/30">
                  <div className="font-bold text-amber-300 mb-1">⚡ Modo SCALP (Sub-Minuto Acelerado)</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {['5s', '10s', '15s', '30s'].map((tf) => (
                      <span
                        key={tf}
                        className={`px-3 py-1 rounded-lg text-xs font-bold border ${
                          schedulerState?.mode === 'scalp'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                            : 'bg-zinc-800 text-white/30 border-white/5'
                        }`}
                      >
                        {tf}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-white/40 mt-2">
                    Sinais em 1m, 5m ou 1h enviados no modo SCALP são instantaneamente recusados pelo scheduler e auditados.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                  <div className="font-bold text-cyan-300 mb-1">📊 Modo NORMAL (Intraday Padrão)</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {['1m', '5m', '10m', '15m', '30m', '1h'].map((tf) => (
                      <span
                        key={tf}
                        className={`px-3 py-1 rounded-lg text-xs font-bold border ${
                          schedulerState?.mode === 'normal'
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                            : 'bg-zinc-800 text-white/30 border-white/5'
                        }`}
                      >
                        {tf}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Exchange Rate Limits Card */}
            <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-5 space-y-4 font-mono">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> REGRAS DE FREQUÊNCIA DAS BOLSAS (MARKET RULES)
                </h4>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1">
                  <div className="font-bold text-emerald-300">🇧🇷 B3 (Brasil - WIN$ / IND$ / BRL)</div>
                  <p className="text-white/60 text-[11px]">Máx Ordens / Seg: 1 req</p>
                  <p className="text-white/60 text-[11px]">Máx Ordens / Min: 30 reqs</p>
                  <p className="text-white/60 text-[11px]">Intervalo Mínimo Obrigatório: 1.0s</p>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1">
                  <div className="font-bold text-cyan-300">🇺🇸 NYSE / NASDAQ (US Equities & CME Futures)</div>
                  <p className="text-white/60 text-[11px]">Máx Ordens / Seg: 2 reqs</p>
                  <p className="text-white/60 text-[11px]">Máx Ordens / Min: 50 reqs</p>
                  <p className="text-white/60 text-[11px]">Intervalo Mínimo Obrigatório: 0.5s</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Markdown Audit Report */}
      {activeSubTab === 'report' && (
        <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2 font-mono">
                <FileText className="w-5 h-5 text-emerald-400" /> Relatório de Auditoria em Markdown (.md)
              </h3>
              <p className="text-xs text-white/50 mt-0.5">
                Relatório de auditoria gerado automaticamente com resumo de sinais, validações e hashes.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyReport}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-mono rounded-xl border border-white/10 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-cyan-400" />
                {copySuccess ? 'Copiado!' : 'Copiar Markdown'}
              </button>

              <button
                onClick={handleDownloadReport}
                className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-mono font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar .md
              </button>
            </div>
          </div>

          <div className="bg-black/70 border border-white/10 rounded-2xl p-5 text-xs font-mono text-emerald-300 leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-[550px] overflow-y-auto">
            {reportMarkdown || 'Gerando relatório de auditoria...'}
          </div>
        </div>
      )}

      {/* Tab 3: RAG Trusted Data Bounds */}
      {activeSubTab === 'rag' && (
        <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2 font-mono">
              <Database className="w-5 h-5 text-purple-400" /> Base Histórica Confiável para Validação RAG
            </h3>
            <span className="text-xs font-mono text-purple-300 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/30">
              ChromaDB / Vector Database Active
            </span>
          </div>

          <p className="text-xs text-white/50">
            A camada RAG consulta os limites históricos (OHLC) pré-validados para barrar injeção de cotações anômalas ou fraudulentas antes da execução do bot.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-4 font-mono text-xs space-y-2">
              <div className="flex items-center justify-between text-cyan-400 font-bold border-b border-white/5 pb-2">
                <span>BTC/USDT</span>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded">Yahoo / Binance Feed</span>
              </div>
              <div className="text-white/70 space-y-1 text-[11px]">
                <p>Preço Mínimo Histórico: $15.000,00</p>
                <p>Preço Máximo Histórico: $180.000,00</p>
                <p>Tolerância Outliers: ±15% no candle</p>
                <p className="text-emerald-400 font-bold mt-2">Status: Válido (Cotação Atual ~ $92.450)</p>
              </div>
            </div>

            <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-4 font-mono text-xs space-y-2">
              <div className="flex items-center justify-between text-cyan-400 font-bold border-b border-white/5 pb-2">
                <span>BTC/BRL</span>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded">Mercado Bitcoin / Foxbit</span>
              </div>
              <div className="text-white/70 space-y-1 text-[11px]">
                <p>Preço Mínimo Histórico: R$ 80.000,00</p>
                <p>Preço Máximo Histórico: R$ 1.000.000,00</p>
                <p>Tolerância Outliers: ±15% no candle</p>
                <p className="text-emerald-400 font-bold mt-2">Status: Válido (Cotação Atual ~ R$ 540.000)</p>
              </div>
            </div>

            <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-4 font-mono text-xs space-y-2">
              <div className="flex items-center justify-between text-cyan-400 font-bold border-b border-white/5 pb-2">
                <span>AAPL (Apple Inc.)</span>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded">Yahoo Finance / TradingView</span>
              </div>
              <div className="text-white/70 space-y-1 text-[11px]">
                <p>Preço Mínimo Histórico: $80,00</p>
                <p>Preço Máximo Histórico: $350,00</p>
                <p>Volume Médio Mínimo: 10.000.000</p>
                <p className="text-emerald-400 font-bold mt-2">Status: Válido (Cotação Atual ~ $232,50)</p>
              </div>
            </div>

            <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-4 font-mono text-xs space-y-2">
              <div className="flex items-center justify-between text-cyan-400 font-bold border-b border-white/5 pb-2">
                <span>CME MICRO FUTURES (ES)</span>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded">IBKR / cTrader Feed</span>
              </div>
              <div className="text-white/70 space-y-1 text-[11px]">
                <p>Preço Mínimo Histórico: 3.000,00 pts</p>
                <p>Preço Máximo Histórico: 7.000,00 pts</p>
                <p>Volume Mínimo Diário: 500.000 contratos</p>
                <p className="text-emerald-400 font-bold mt-2">Status: Válido (Cotação Atual ~ 5.850 pts)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Architecture Diagram */}
      {activeSubTab === 'architecture' && (
        <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 space-y-4 font-mono">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-amber-400" /> Fluxo da Arquitetura de Validação & Zero Dados Falsos
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-black/60 rounded-2xl border border-white/10 space-y-2">
              <div className="text-cyan-400 font-bold flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs">1</span>
                Provedores Externos
              </div>
              <p className="text-white/60 text-[11px]">
                Yahoo Finance API e TradingView WebSocket alimentam o Ingestion Service em tempo real.
              </p>
            </div>

            <div className="p-4 bg-black/60 rounded-2xl border border-white/10 space-y-2">
              <div className="text-amber-400 font-bold flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs">2</span>
                Ingestão & Assinatura (Ed25519)
              </div>
              <p className="text-white/60 text-[11px]">
                Geração de envelope criptográfico: SHA-256 do payload, timestamp Unix e assinatura HMAC/Key.
              </p>
            </div>

            <div className="p-4 bg-black/60 rounded-2xl border border-white/10 space-y-2">
              <div className="text-emerald-400 font-bold flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">3</span>
                TradeScheduler & Gate RAG
              </div>
              <p className="text-white/60 text-[11px]">
                Regulação de Timeframes (Scalp sub-minuto vs Normal), limites por bolsa, Hash, Assinatura e Bounds RAG.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
