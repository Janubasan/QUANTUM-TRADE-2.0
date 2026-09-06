import { useState, useEffect, FormEvent } from 'react';
import {
  Terminal,
  Play,
  Square,
  Shield,
  Activity,
  Zap,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Layers,
  FileCode,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  PlusCircle,
  Sliders,
  DollarSign,
  Clock,
  Send,
  X,
  Lock,
} from 'lucide-react';
import {
  fetchMT5EdgeStatus,
  connectMT5Edge,
  disconnectMT5Edge,
  startMT5EdgeTrading,
  stopMT5EdgeTrading,
  updateMT5EdgeConfig,
  fetchMT5EdgeScanner,
  fetchMT5EdgePositions,
  closeMT5EdgePosition,
  closeAllMT5EdgePositions,
  sendMT5EdgeOrder,
  fetchMT5EdgeLogs,
  fetchMT5EdgeSourceCode,
  MT5EdgeStatus,
  MT5ScannerSymbol,
  MT5Position,
  MT5EdgeLog,
  MT5SourceCode,
} from '../services/api';

export function MT5PlusEdgeView() {
  const [status, setStatus] = useState<MT5EdgeStatus | null>(null);
  const [scanner, setScanner] = useState<MT5ScannerSymbol[]>([]);
  const [positions, setPositions] = useState<MT5Position[]>([]);
  const [logs, setLogs] = useState<MT5EdgeLog[]>([]);
  const [sourceCode, setSourceCode] = useState<MT5SourceCode | null>(null);

  const [activeTab, setActiveTab] = useState<'scanner' | 'positions' | 'risk' | 'code' | 'logs'>('scanner');
  const [activeCodeTab, setActiveCodeTab] = useState<'main' | 'risk' | 'strategy' | 'bot09' | 'reqs' | 'env' | 'readme'>('bot09');

  const [loadingAction, setLoadingAction] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Manual order form
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderSymbol, setOrderSymbol] = useState('EURUSD');
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderVolume, setOrderVolume] = useState('0.10');
  const [orderSlPoints, setOrderSlPoints] = useState('30');
  const [orderTpPoints, setOrderTpPoints] = useState('45');
  const [orderSending, setOrderSending] = useState(false);
  const [orderSuccessMsg, setOrderSuccessMsg] = useState<string | null>(null);

  // Risk edit form
  const [riskPercent, setRiskPercent] = useState<number>(0.5);
  const [maxDrawdown, setMaxDrawdown] = useState<number>(3.0);
  const [maxSpread, setMaxSpread] = useState<number>(18);
  const [trailingEnabled, setTrailingEnabled] = useState<boolean>(true);
  const [magicNumber, setMagicNumber] = useState<number>(20260801);
  const [riskSavedMsg, setRiskSavedMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [st, sc, pos, lg] = await Promise.all([
        fetchMT5EdgeStatus().catch(() => null),
        fetchMT5EdgeScanner().catch(() => []),
        fetchMT5EdgePositions().catch(() => []),
        fetchMT5EdgeLogs().catch(() => []),
      ]);

      if (st) {
        setStatus(st);
        setRiskPercent(st.riskConfig.riskPercentPerTrade);
        setMaxDrawdown(st.riskConfig.maxDailyDrawdownPct);
        setMaxSpread(st.riskConfig.maxSpreadPoints);
        setTrailingEnabled(st.riskConfig.trailingStopEnabled);
        setMagicNumber(st.riskConfig.magicNumber);
      }
      setScanner(sc);
      setPositions(pos);
      setLogs(lg);
    } catch (e) {
      console.error('Erro ao carregar dados do MT5 Edge:', e);
    }
  };

  const loadCode = async () => {
    try {
      const code = await fetchMT5EdgeSourceCode();
      setSourceCode(code);
    } catch (e) {
      console.error('Erro ao carregar código fonte:', e);
    }
  };

  useEffect(() => {
    loadData();
    loadCode();
    const interval = setInterval(loadData, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleToggleTrading = async () => {
    if (!status) return;
    setLoadingAction(true);
    try {
      if (status.isRunning) {
        await stopMT5EdgeTrading();
      } else {
        await startMT5EdgeTrading();
      }
      await loadData();
    } catch (e: any) {
      alert(e.message || 'Erro ao alterar estado do motor');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleToggleTerminal = async () => {
    if (!status) return;
    setLoadingAction(true);
    try {
      if (status.isConnected) {
        await disconnectMT5Edge();
      } else {
        await connectMT5Edge({
          login: status.terminal.login,
          server: status.terminal.server,
          terminalPath: status.terminal.terminalPath,
        });
      }
      await loadData();
    } catch (e: any) {
      alert(e.message || 'Erro ao alterar conexão do terminal');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleClosePosition = async (ticket: number) => {
    try {
      await closePosition(ticket);
    } catch (e: any) {
      alert(e.message || 'Erro ao fechar posição');
    }
  };

  const closePosition = async (ticket: number) => {
    await closeMT5EdgePosition(ticket);
    await loadData();
  };

  const handleCloseAll = async () => {
    if (!confirm('Deseja acionar o CIRCUIT BREAKER e fechar todas as posições abertas no terminal MT5?')) return;
    try {
      const res = await closeAllMT5EdgePositions();
      alert(`Circuit breaker executado! ${res.closedCount} posições fechadas. PnL: $${res.totalPnl.toFixed(2)} USD.`);
      await loadData();
    } catch (e: any) {
      alert(e.message || 'Erro ao fechar posições');
    }
  };

  const handleSaveRisk = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await updateMT5EdgeConfig({
        riskPercentPerTrade: Number(riskPercent),
        maxDailyDrawdownPct: Number(maxDrawdown),
        maxSpreadPoints: Number(maxSpread),
        trailingStopEnabled: Boolean(trailingEnabled),
        magicNumber: Number(magicNumber),
      });
      setRiskSavedMsg('Parâmetros salvos e sincronizados com o motor Python!');
      setTimeout(() => setRiskSavedMsg(null), 4000);
      await loadData();
    } catch (e: any) {
      alert(e.message || 'Erro ao atualizar risco');
    }
  };

  const handleSendOrder = async (e: FormEvent) => {
    e.preventDefault();
    setOrderSending(true);
    setOrderSuccessMsg(null);
    try {
      const res = await sendMT5EdgeOrder({
        symbol: orderSymbol,
        side: orderSide,
        volume: Number(orderVolume),
        slPoints: Number(orderSlPoints),
        tpPoints: Number(orderTpPoints),
        comment: `MT5-Edge: Manual Execution`,
      });
      setOrderSuccessMsg(`Ordem #${res.position.ticket} executada com sucesso a mercado!`);
      setTimeout(() => {
        setOrderSuccessMsg(null);
        setShowOrderModal(false);
      }, 2000);
      await loadData();
    } catch (e: any) {
      alert(e.message || 'Erro ao enviar ordem');
    } finally {
      setOrderSending(false);
    }
  };

  const copyCurrentCode = () => {
    if (!sourceCode) return;
    let text = '';
    if (activeCodeTab === 'bot09') text = sourceCode.bot09Mql5EA || '';
    else if (activeCodeTab === 'main') text = sourceCode.mainScript;
    else if (activeCodeTab === 'risk') text = sourceCode.riskManagerScript;
    else if (activeCodeTab === 'strategy') text = sourceCode.strategyScript;
    else if (activeCodeTab === 'reqs') text = sourceCode.requirementsTxt;
    else if (activeCodeTab === 'env') text = sourceCode.envExample;
    else if (activeCodeTab === 'readme') text = sourceCode.readmeMd;

    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const getActiveCodeContent = () => {
    if (!sourceCode) return 'Carregando repositório...';
    switch (activeCodeTab) {
      case 'bot09':
        return sourceCode.bot09Mql5EA || '// MultiTimeframeTrendEA.mq5 carregando...';
      case 'main':
        return sourceCode.mainScript;
      case 'risk':
        return sourceCode.riskManagerScript;
      case 'strategy':
        return sourceCode.strategyScript;
      case 'reqs':
        return sourceCode.requirementsTxt;
      case 'env':
        return sourceCode.envExample;
      case 'readme':
        return sourceCode.readmeMd;
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Official Repo Header */}
      <div className="bg-[#0b0c10] border border-white/10 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
        <div className="absolute -right-16 -top-16 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono text-xs font-semibold flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" />
                LiquidGiraffe8 / Metatrader-5-Plus-Edge
              </span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-xs flex items-center gap-1.5">
                <Shield className="w-3 h-3" />
                Python MT5 Official API (5.0.45)
              </span>
              <span className="px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 font-mono text-xs">
                v2.5.0-production
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2.5">
              MetaTrader 5 Algorithmic Trading Bot in Python
            </h1>
            <p className="text-sm text-white/60 mt-1 max-w-2xl leading-relaxed">
              Integração completa com o framework open-source de trading quantitativo automatizado.
              Execução de ordens técnicas, streaming de ticks em tempo real, gestão de risco blindada com Trailing Stop e scanner multi-moeda.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleToggleTerminal}
              disabled={loadingAction}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-medium border flex items-center gap-2 transition cursor-pointer ${
                status?.isConnected
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${status?.isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              {status?.isConnected ? 'Terminal MT5 Conectado' : 'Reconectar MT5'}
            </button>

            <button
              onClick={handleToggleTrading}
              disabled={loadingAction || !status?.isConnected}
              className={`px-5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition shadow-lg cursor-pointer ${
                status?.isRunning
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                  : 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 shadow-cyan-500/20'
              }`}
            >
              {status?.isRunning ? (
                <>
                  <Square className="w-4 h-4 fill-current" /> Pausar Bot Python
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" /> Iniciar Bot Python
                </>
              )}
            </button>

            <button
              onClick={() => setShowOrderModal(true)}
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center gap-1.5 transition border border-white/10 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-cyan-400" /> Nova Ordem MT5
            </button>

            <button
              onClick={handleCloseAll}
              className="px-3.5 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Circuit Breaker: Fechar todas as ordens abertas imediatamente"
            >
              <AlertTriangle className="w-4 h-4" /> Fechar Tudo
            </button>
          </div>
        </div>

        {/* Live Terminal Telemetry Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-5 border-t border-white/5 font-mono text-xs">
          <div className="bg-black/30 p-3 rounded-xl border border-white/5">
            <span className="text-white/40 block text-[10px] uppercase tracking-wider">Conta / Servidor</span>
            <div className="text-white font-bold mt-0.5 truncate">
              {status?.terminal.login} ({status?.terminal.server})
            </div>
            <span className="text-[10px] text-white/40">Alavancagem 1:{status?.terminal.leverage}</span>
          </div>

          <div className="bg-black/30 p-3 rounded-xl border border-white/5">
            <span className="text-white/40 block text-[10px] uppercase tracking-wider">Saldo / Equity</span>
            <div className="text-cyan-400 font-bold mt-0.5">
              ${(status?.terminal?.balance ?? 0).toFixed(2)} USD
            </div>
            <span className="text-[10px] text-emerald-400">Eq: ${(status?.terminal?.equity ?? 0).toFixed(2)}</span>
          </div>

          <div className="bg-black/30 p-3 rounded-xl border border-white/5">
            <span className="text-white/40 block text-[10px] uppercase tracking-wider">PnL Flutuante Hoje</span>
            <div className={`font-bold mt-0.5 ${(status?.dailyPnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {(status?.dailyPnl || 0) >= 0 ? '+' : ''}${(status?.dailyPnl ?? 0).toFixed(2)} USD
            </div>
            <span className="text-[10px] text-white/40">Win Rate: {status?.winRateToday || 0}%</span>
          </div>

          <div className="bg-black/30 p-3 rounded-xl border border-white/5">
            <span className="text-white/40 block text-[10px] uppercase tracking-wider">Drawdown Diário</span>
            <div className="text-amber-400 font-bold mt-0.5">
              {(status?.dailyDrawdownPct ?? 0).toFixed(2)}% / {status?.riskConfig?.maxDailyDrawdownPct || 3}% Max
            </div>
            <div className="w-full bg-white/10 h-1 rounded-full mt-1.5 overflow-hidden">
              <div
                className="bg-amber-400 h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, ((status?.dailyDrawdownPct || 0) / (status?.riskConfig.maxDailyDrawdownPct || 3)) * 100)}%` }}
              />
            </div>
          </div>

          <div className="bg-black/30 p-3 rounded-xl border border-white/5">
            <span className="text-white/40 block text-[10px] uppercase tracking-wider">Posições Abertas</span>
            <div className="text-white font-bold mt-0.5">
              {status?.activePositionsCount} / {status?.riskConfig.maxOpenPositions} Max
            </div>
            <span className="text-[10px] text-cyan-400">Magic #{status?.riskConfig.magicNumber}</span>
          </div>

          <div className="bg-black/30 p-3 rounded-xl border border-white/5">
            <span className="text-white/40 block text-[10px] uppercase tracking-wider">Latência IPC / Ping</span>
            <div className="text-emerald-400 font-bold mt-0.5 flex items-center gap-1">
              <Activity className="w-3 h-3" /> {status?.terminal.pingMs} ms
            </div>
            <span className="text-[10px] text-white/40">
              {status?.isRunning ? `Uptime ${Math.floor((status?.uptimeSeconds || 0) / 60)}m` : 'Em Espera'}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3 overflow-x-auto text-sm font-medium">
        <button
          onClick={() => setActiveTab('scanner')}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'scanner'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <Zap className="w-4 h-4" /> Scanner Multi-Ativo ({scanner.length})
        </button>

        <button
          onClick={() => setActiveTab('positions')}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'positions'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <Layers className="w-4 h-4" /> Posições Abertas MT5 ({positions.length})
        </button>

        <button
          onClick={() => setActiveTab('risk')}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'risk'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <Sliders className="w-4 h-4" /> Gestão de Risco & Parâmetros
        </button>

        <button
          onClick={() => setActiveTab('code')}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'code'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <FileCode className="w-4 h-4" /> Código do Repositório Python
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'logs'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <Terminal className="w-4 h-4" /> Logs de Execução ({logs.length})
        </button>
      </div>

      {/* TAB 1: Multi-Currency Scanner */}
      {activeTab === 'scanner' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Scanner Multi-Ativos em Tempo Real</h2>
              <p className="text-xs text-white/50">
                Alimentado pela API nativa MT5 com cálculo dinâmico de RSI, ATR e filtros de spread.
              </p>
            </div>
            <div className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Live Streaming (1s)
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/5 bg-[#0b0c10]">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-white/5 text-white/40 border-b border-white/5 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Símbolo / Categoria</th>
                  <th className="py-3.5 px-4">Bid / Ask</th>
                  <th className="py-3.5 px-4">Spread</th>
                  <th className="py-3.5 px-4">RSI (14)</th>
                  <th className="py-3.5 px-4">Tendência EMA</th>
                  <th className="py-3.5 px-4">Sinal Algorítmico</th>
                  <th className="py-3.5 px-4 text-right">Ação Imediata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {scanner.map((sym) => (
                  <tr key={sym.symbol} className="hover:bg-white/[0.02] transition">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{sym.symbol}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/60">
                          {sym.category}
                        </span>
                      </div>
                      <span className="text-[10px] text-white/40 block truncate max-w-xs">{sym.signalReason}</span>
                    </td>

                    <td className="py-3.5 px-4 text-white/80">
                      <div>Bid: <span className="text-white font-semibold">{sym.bid}</span></div>
                      <div>Ask: <span className="text-white/60">{sym.ask}</span></div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          sym.spreadPoints <= (status?.riskConfig.maxSpreadPoints || 18)
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {sym.spreadPoints} pts
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${sym.rsi14 >= 70 ? 'text-amber-400' : sym.rsi14 <= 30 ? 'text-cyan-400' : 'text-white/80'}`}>
                          {sym.rsi14}
                        </span>
                        <div className="w-12 bg-white/10 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${sym.rsi14 >= 70 ? 'bg-amber-400' : sym.rsi14 <= 30 ? 'bg-cyan-400' : 'bg-emerald-400'}`}
                            style={{ width: `${sym.rsi14}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                          sym.emaTrend === 'BULLISH'
                            ? 'text-emerald-400'
                            : sym.emaTrend === 'BEARISH'
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {sym.emaTrend === 'BULLISH' && <TrendingUp className="w-3 h-3" />}
                        {sym.emaTrend === 'BEARISH' && <TrendingDown className="w-3 h-3" />}
                        {sym.emaTrend}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 ${
                          sym.signal === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : sym.signal === 'SELL'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-white/5 text-white/50 border border-white/10'
                        }`}
                      >
                        {sym.signal === 'BUY' && '▲ COMPRA FORTE'}
                        {sym.signal === 'SELL' && '▼ VENDA FORTE'}
                        {sym.signal === 'NEUTRAL' && '• NEUTRO'}
                        <span className="text-[10px] opacity-75">({sym.signalConfidence}%)</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {sym.signal !== 'NEUTRAL' ? (
                        <button
                          onClick={() => {
                            setOrderSymbol(sym.symbol);
                            setOrderSide(sym.signal === 'BUY' ? 'BUY' : 'SELL');
                            setShowOrderModal(true);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer ${
                            sym.signal === 'BUY'
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                              : 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
                          }`}
                        >
                          Disparar {sym.signal}
                        </button>
                      ) : (
                        <span className="text-white/30 text-[11px]">Aguardando setup</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Open MT5 Positions */}
      {activeTab === 'positions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Posições Abertas no Terminal MT5</h2>
              <p className="text-xs text-white/50">
                Ordens em execução direta via MetaTrader 5 com trailing stop dinâmico e SL/TP blindados.
              </p>
            </div>
            <button
              onClick={handleCloseAll}
              disabled={positions.length === 0}
              className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold hover:bg-rose-500/30 transition disabled:opacity-40 cursor-pointer"
            >
              Liquidar Todas ({positions.length})
            </button>
          </div>

          {positions.length === 0 ? (
            <div className="text-center py-12 bg-[#0b0c10] border border-white/5 rounded-2xl">
              <Layers className="w-10 h-10 text-white/20 mx-auto mb-2" />
              <p className="text-sm text-white/60">Nenhuma posição aberta no momento.</p>
              <p className="text-xs text-white/40 mt-1">O bot abrirá ordens automaticamente ou você pode disparar ordens manuais.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/5 bg-[#0b0c10]">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-white/5 text-white/40 border-b border-white/5 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Ticket / Abertura</th>
                    <th className="py-3.5 px-4">Símbolo & Lado</th>
                    <th className="py-3.5 px-4">Volume (Lotes)</th>
                    <th className="py-3.5 px-4">Entrada / Atual</th>
                    <th className="py-3.5 px-4">SL / TP</th>
                    <th className="py-3.5 px-4">Lucro / PnL</th>
                    <th className="py-3.5 px-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {positions.map((pos) => (
                    <tr key={pos.ticket} className="hover:bg-white/[0.02] transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">#{pos.ticket}</div>
                        <span className="text-[10px] text-white/40">{new Date(pos.openTime).toLocaleTimeString()}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white text-sm">{pos.symbol}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              pos.side === 'BUY'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {pos.side}
                          </span>
                        </div>
                        <span className="text-[10px] text-white/40 block truncate max-w-xs">{pos.comment}</span>
                      </td>

                      <td className="py-3.5 px-4 text-white font-semibold">
                        {pos.volume.toFixed(2)} L
                      </td>

                      <td className="py-3.5 px-4 text-white/80">
                        <div>Entrada: {pos.openPrice}</div>
                        <div>Atual: <span className="text-white font-semibold">{pos.currentPrice}</span></div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <div className="text-rose-400">SL: {pos.sl}</div>
                        <div className="text-emerald-400">TP: {pos.tp}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className={`text-sm font-bold ${pos.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)} USD
                        </div>
                        <span className={`text-[10px] ${pos.pnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleClosePosition(pos.ticket)}
                          className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-semibold transition cursor-pointer"
                        >
                          Fechar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Risk Management & Parameters */}
      {activeTab === 'risk' && (
        <div className="bg-[#0b0c10] border border-white/10 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-4">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-white">Parâmetros de Gestão de Risco do MT5 Edge</h2>
          </div>
          <p className="text-xs text-white/60 mb-6 max-w-3xl">
            As regras de proteção operam diretamente no módulo Python `risk_manager.py`, impedindo violações de capital, controlando lotes dinâmicos com base na margem livre e ativando travas de circuito em dias voláteis.
          </p>

          {riskSavedMsg && (
            <div className="p-3 mb-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4" /> {riskSavedMsg}
            </div>
          )}

          <form onSubmit={handleSaveRisk} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-white/70 block">Risco por Trade (%)</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="5.0"
                value={riskPercent}
                onChange={(e) => setRiskPercent(parseFloat(e.target.value))}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:border-cyan-400 focus:outline-none"
              />
              <span className="text-[10px] text-white/40">Ex: 0.5% do saldo líquido por ordem executada.</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-white/70 block">Drawdown Diário Máximo (%)</label>
              <input
                type="number"
                step="0.5"
                min="1.0"
                max="10.0"
                value={maxDrawdown}
                onChange={(e) => setMaxDrawdown(parseFloat(e.target.value))}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:border-cyan-400 focus:outline-none"
              />
              <span className="text-[10px] text-white/40">Trava o robô e encerra posições se o dia perder mais que isso.</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-white/70 block">Spread Máximo Aceito (Pontos)</label>
              <input
                type="number"
                step="1"
                min="5"
                max="100"
                value={maxSpread}
                onChange={(e) => setMaxSpread(parseInt(e.target.value, 10))}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:border-cyan-400 focus:outline-none"
              />
              <span className="text-[10px] text-white/40">Evita entradas em momentos de alta volatilidade e notícias.</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-white/70 block">Magic Number do Bot</label>
              <input
                type="number"
                value={magicNumber}
                onChange={(e) => setMagicNumber(parseInt(e.target.value, 10))}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:border-cyan-400 focus:outline-none"
              />
              <span className="text-[10px] text-white/40">Identificador exclusivo das ordens no terminal MetaTrader 5.</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-white/70 block">Trailing Stop Automático</label>
              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="trailing"
                  checked={trailingEnabled}
                  onChange={(e) => setTrailingEnabled(e.target.checked)}
                  className="w-5 h-5 rounded bg-black/40 border-white/20 text-cyan-500 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="trailing" className="text-xs text-white/80 cursor-pointer">
                  Avançar Stop Loss automaticamente após 25 pontos de lucro
                </label>
              </div>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-5 py-2.5 rounded-xl text-xs transition shadow-lg shadow-cyan-500/20 cursor-pointer"
              >
                Salvar Parâmetros de Risco
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 4: Python Repository Source Code Inspector */}
      {activeTab === 'code' && (
        <div className="bg-[#0b0c10] border border-white/10 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-cyan-400" />
                <h2 className="text-lg font-semibold text-white">Código Fonte do Repositório Python</h2>
              </div>
              <p className="text-xs text-white/50">
                Arquivos de produção prontos para rodar no seu ambiente Windows / VPS ou integrados na nuvem.
              </p>
            </div>

            <button
              onClick={copyCurrentCode}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-mono flex items-center gap-2 transition border border-white/10 cursor-pointer"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedCode ? 'Código Copiado!' : 'Copiar Arquivo Atual'}
            </button>
          </div>

          {/* Sub-tabs for scripts */}
          <div className="flex items-center gap-2 border-b border-white/5 pb-2 overflow-x-auto text-xs font-mono">
            <button
              onClick={() => setActiveCodeTab('bot09')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 font-bold ${
                activeCodeTab === 'bot09' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-white/60 hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              MultiTimeframeTrendEA.mq5 (Bot 09 MQL5)
            </button>
            <button
              onClick={() => setActiveCodeTab('main')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeCodeTab === 'main' ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/60 hover:text-white'
              }`}
            >
              main.py (Bot Core)
            </button>
            <button
              onClick={() => setActiveCodeTab('risk')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeCodeTab === 'risk' ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/60 hover:text-white'
              }`}
            >
              risk_manager.py
            </button>
            <button
              onClick={() => setActiveCodeTab('strategy')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeCodeTab === 'strategy' ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/60 hover:text-white'
              }`}
            >
              strategy.py
            </button>
            <button
              onClick={() => setActiveCodeTab('reqs')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeCodeTab === 'reqs' ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/60 hover:text-white'
              }`}
            >
              requirements.txt
            </button>
            <button
              onClick={() => setActiveCodeTab('env')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeCodeTab === 'env' ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/60 hover:text-white'
              }`}
            >
              .env.example
            </button>
            <button
              onClick={() => setActiveCodeTab('readme')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeCodeTab === 'readme' ? 'bg-cyan-500/20 text-cyan-300' : 'text-white/60 hover:text-white'
              }`}
            >
              README.md
            </button>
          </div>

          <pre className="p-4 bg-black/60 rounded-xl border border-white/5 font-mono text-xs text-white/90 overflow-x-auto max-h-[500px] leading-relaxed select-all">
            {getActiveCodeContent()}
          </pre>
        </div>
      )}

      {/* TAB 5: Logs */}
      {activeTab === 'logs' && (
        <div className="bg-[#0b0c10] border border-white/10 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-cyan-400" />
              <h2 className="text-lg font-semibold text-white">Logs de Auditoria e Terminal MT5</h2>
            </div>
            <span className="text-xs font-mono text-white/40">{logs.length} eventos registrados</span>
          </div>

          <div className="space-y-2 font-mono text-xs max-h-[500px] overflow-y-auto pr-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-xl bg-black/40 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      log.level === 'SUCCESS'
                        ? 'bg-emerald-400'
                        : log.level === 'WARN'
                        ? 'bg-amber-400'
                        : log.level === 'ERROR'
                        ? 'bg-rose-400'
                        : 'bg-cyan-400'
                    }`}
                  />
                  <span className="px-2 py-0.5 rounded bg-white/5 text-white/60 text-[10px] uppercase">
                    {log.source}
                  </span>
                  <span className="text-white/90">{log.message}</span>
                </div>
                <span className="text-white/30 text-[10px] whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e0f15] border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowOrderModal(false)}
              className="absolute top-4 right-4 text-white/40 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <PlusCircle className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-white">Disparo de Ordem MetaTrader 5</h3>
            </div>

            {orderSuccessMsg ? (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-center text-xs">
                {orderSuccessMsg}
              </div>
            ) : (
              <form onSubmit={handleSendOrder} className="space-y-4 font-mono text-xs">
                <div>
                  <label className="text-white/60 block mb-1">Símbolo</label>
                  <select
                    value={orderSymbol}
                    onChange={(e) => setOrderSymbol(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white"
                  >
                    {scanner.map((s) => (
                      <option key={s.symbol} value={s.symbol}>
                        {s.symbol} ({s.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-white/60 block mb-1">Direção da Ordem</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setOrderSide('BUY')}
                      className={`py-2 rounded-xl font-bold transition cursor-pointer ${
                        orderSide === 'BUY'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      BUY (Compra)
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderSide('SELL')}
                      className={`py-2 rounded-xl font-bold transition cursor-pointer ${
                        orderSide === 'SELL'
                          ? 'bg-rose-500 text-white'
                          : 'bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      SELL (Venda)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-white/60 block mb-1">Volume (Lotes)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="5.0"
                    value={orderVolume}
                    onChange={(e) => setOrderVolume(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-white/60 block mb-1">Stop Loss (Pontos)</label>
                    <input
                      type="number"
                      value={orderSlPoints}
                      onChange={(e) => setOrderSlPoints(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-white/60 block mb-1">Take Profit (Pontos)</label>
                    <input
                      type="number"
                      value={orderTpPoints}
                      onChange={(e) => setOrderTpPoints(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={orderSending}
                  className="w-full mt-2 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold py-3 rounded-xl transition cursor-pointer shadow-lg shadow-cyan-500/20"
                >
                  {orderSending ? 'Enviando ao MT5...' : `Executar ${orderSide} a Mercado`}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
