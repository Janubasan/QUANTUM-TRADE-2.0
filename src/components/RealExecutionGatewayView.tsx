import { useState, useEffect, FormEvent } from 'react';
import {
  Globe,
  Radio,
  Shield,
  Zap,
  Clock,
  Wallet,
  Building2,
  Cpu,
  Send,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  Layers,
  FileCode,
  Sliders,
  ChevronRight,
  TrendingUp,
  Activity,
  Calendar,
  Lock,
  Link,
  Check,
  ExternalLink,
  Copy,
} from 'lucide-react';
import {
  fetchRealGatewayStatus,
  fetchRealGatewayConfig,
  updateRealGatewayConfig,
  fetchRealAdapters,
  updateRealAdapter,
  fetchRealBalances,
  fetchMarketStatuses,
  fetchRealExecutionHistory,
  fetchRealExecutionQueue,
  dispatchManualRealOrder,
  pingRealAdapter,
  setMetaMaskWatchAddress,
  fetchOnchainChains,
  fetchOnchainStatus,
  switchOnchainChain,
  verifyOnchainRouter,
  fetchOnchainAuditIntegrity,
  OnchainChainItem,
  OnchainStatusResponse,
  RealGatewayStatus,
  RealAdapterStatus,
  MarketSessionInfo,
  RealExecutionReceipt,
  RealBalance,
  QueuedOrder,
} from '../services/api';

export function RealExecutionGatewayView() {
  const [status, setStatus] = useState<RealGatewayStatus | null>(null);
  const [config, setConfig] = useState<any>(null);
  const [adapters, setAdapters] = useState<RealAdapterStatus[]>([]);
  const [balances, setBalances] = useState<Record<string, RealBalance[]>>({});
  const [markets, setMarkets] = useState<MarketSessionInfo[]>([]);
  const [history, setHistory] = useState<RealExecutionReceipt[]>([]);
  const [queue, setQueue] = useState<QueuedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [pingStates, setPingStates] = useState<Record<string, { loading: boolean; success?: boolean; latencyMs?: number; error?: string; details?: any }>>({});

  // Active view tab
  const [activeTab, setActiveTab] = useState<'overview' | 'adapters' | 'market_clock' | 'dispatch' | 'history' | 'queue'>('overview');

  // Manual Dispatch Form
  const [dispatchSymbol, setDispatchSymbol] = useState('BTC/USDT');
  const [dispatchSide, setDispatchSide] = useState<'BUY' | 'SELL'>('BUY');
  const [dispatchQty, setDispatchQty] = useState('0.05');
  const [dispatchPrice, setDispatchPrice] = useState('65200.00');
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchReceipt, setDispatchReceipt] = useState<RealExecutionReceipt | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  // Selected receipt for detailed modal view
  const [selectedReceipt, setSelectedReceipt] = useState<RealExecutionReceipt | null>(null);

  // On-Chain EVM Execution State
  const [onchainStatus, setOnchainStatus] = useState<OnchainStatusResponse | null>(null);
  const [onchainChains, setOnchainChains] = useState<OnchainChainItem[]>([]);
  const [onchainAuditValid, setOnchainAuditValid] = useState<boolean | null>(null);
  const [switchingChain, setSwitchingChain] = useState(false);
  const [verifyingRouter, setVerifyingRouter] = useState(false);
  const [onchainVerificationResult, setOnchainVerificationResult] = useState<string | null>(null);

  // MetaMask Web3 Integration State
  const [mmConnecting, setMmConnecting] = useState(false);
  const [mmInputAddress, setMmInputAddress] = useState('');
  const [mmMessage, setMmMessage] = useState<{ type: 'success' | 'warning' | 'info' | 'error'; text: string } | null>(null);
  const [mmCopied, setMmCopied] = useState(false);

  const loadData = async () => {
    try {
      const [st, cfg, adps, bals, mkts, hist, q, ocStatus, ocChains] = await Promise.all([
        fetchRealGatewayStatus().catch(() => null),
        fetchRealGatewayConfig().catch(() => null),
        fetchRealAdapters().catch(() => []),
        fetchRealBalances().catch(() => ({})),
        fetchMarketStatuses().catch(() => []),
        fetchRealExecutionHistory().catch(() => []),
        fetchRealExecutionQueue().catch(() => []),
        fetchOnchainStatus().catch(() => null),
        fetchOnchainChains().catch(() => null),
      ]);

      if (st) setStatus(st);
      if (cfg) setConfig(cfg);
      setAdapters(adps);
      setBalances(bals);
      setMarkets(mkts);
      setHistory(hist);
      setQueue(q);
      if (ocStatus) setOnchainStatus(ocStatus);
      if (ocChains?.chains) setOnchainChains(ocChains.chains);

      // Preenche o endereço da MetaMask caso já esteja sincronizado
      const mmAdp = adps.find((a: RealAdapterStatus) => a.id === 'metamask');
      if (mmAdp && mmAdp.walletAddress && mmAdp.walletAddress.startsWith('0x')) {
        setMmInputAddress((prev) => prev || mmAdp.walletAddress!);
      }
    } catch (e) {
      console.error('Error fetching Real Execution Gateway data:', e);
    }
  };

  const handleConnectMetaMask = async () => {
    setMmConnecting(true);
    setMmMessage(null);

    try {
      if (typeof window === 'undefined' || !(window as any).ethereum) {
        setMmMessage({
          type: 'info',
          text: 'Extensão MetaMask não detectada neste ambiente ou bloqueada pelo iframe. Você pode colar seu endereço EVM (0x...) abaixo para ativar o modo Observador (Watch-Only), ou abrir o app em nova aba.',
        });
        return;
      }

      const ethereum = (window as any).ethereum;
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts[0]) {
        const addr = accounts[0];
        await setMetaMaskWatchAddress(addr);
        setMmInputAddress(addr);
        setMmMessage({
          type: 'success',
          text: `MetaMask conectada com sucesso: ${addr.slice(0, 6)}...${addr.slice(-4)} (Modo Observador Ativo)`,
        });
        await loadData();
      }
    } catch (err: any) {
      if (err?.code === 4001) {
        setMmMessage({
          type: 'warning',
          text: 'Conexão cancelada pelo operador no popup da extensão MetaMask.',
        });
      } else {
        setMmMessage({
          type: 'error',
          text: `Não foi possível conectar à MetaMask: ${err?.message || 'Falha de comunicação Web3'}`,
        });
      }
    } finally {
      setMmConnecting(false);
    }
  };

  const handleSaveMetaMaskWatchAddress = async () => {
    if (!mmInputAddress.trim()) {
      try {
        await setMetaMaskWatchAddress('');
        setMmMessage({ type: 'info', text: 'Endereço de observação MetaMask removido.' });
        await loadData();
      } catch (err: any) {
        setMmMessage({ type: 'error', text: err?.message || 'Erro ao remover endereço.' });
      }
      return;
    }

    try {
      const res = await setMetaMaskWatchAddress(mmInputAddress.trim());
      setMmMessage({
        type: 'success',
        text: `Endereço EVM configurado com sucesso: ${res.watchAddress}`,
      });
      await loadData();
    } catch (err: any) {
      setMmMessage({
        type: 'error',
        text: err?.message || 'Erro ao salvar endereço de observação.',
      });
    }
  };

  const handleCopyMetaMaskAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setMmCopied(true);
    setTimeout(() => setMmCopied(false), 2000);
  };

  const handleSwitchChain = async (chainKey: string) => {
    setSwitchingChain(true);
    setOnchainVerificationResult(null);
    try {
      await switchOnchainChain(chainKey);
      await loadData();
    } catch (err: any) {
      alert(`Falha ao trocar de rede: ${err?.message || err}`);
    } finally {
      setSwitchingChain(false);
    }
  };

  const handleVerifyRouter = async () => {
    setVerifyingRouter(true);
    try {
      const res = await verifyOnchainRouter();
      setOnchainVerificationResult(`✓ Router verificado on-chain: ${res.dexName} (${res.status.toUpperCase()})`);
      await loadData();
    } catch (err: any) {
      setOnchainVerificationResult(`⚠️ Erro de verificação: ${err?.message || err}`);
    } finally {
      setVerifyingRouter(false);
    }
  };

  const handleCheckAuditIntegrity = async () => {
    try {
      const res = await fetchOnchainAuditIntegrity();
      setOnchainAuditValid(res.valid);
    } catch {
      setOnchainAuditValid(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleGateway = async () => {
    if (!config) return;
    setLoading(true);
    try {
      const updated = await updateRealGatewayConfig({ enabled: !config.enabled });
      setConfig(updated);
      await loadData();
    } catch (e: any) {
      alert(e.message || 'Erro ao alterar status do Gateway');
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = async (mode: 'paper' | 'sandbox' | 'live') => {
    if (mode === 'live') {
      const confirmed = window.confirm(
        '⚠️ ATENÇÃO: Deseja ativar o modo LIVE? Certifique-se de que os limites de risco e chaves de produção estejam devidamente auditadas.'
      );
      if (!confirmed) return;
    }
    setLoading(true);
    try {
      const updated = await updateRealGatewayConfig({ mode });
      setConfig(updated);
      await loadData();
    } catch (e: any) {
      alert(e.message || 'Erro ao alterar modo');
    } finally {
      setLoading(false);
    }
  };

  const handleAdapterToggle = async (adapterId: string, currentEnabled: boolean) => {
    try {
      await updateRealAdapter(adapterId, !currentEnabled);
      await loadData();
    } catch (e: any) {
      alert(e.message || 'Erro ao alterar adaptador');
    }
  };

  const handleAdapterSandboxToggle = async (adapterId: string, currentSandbox: boolean) => {
    try {
      await updateRealAdapter(adapterId, undefined, !currentSandbox);
      await loadData();
    } catch (e: any) {
      alert(e.message || 'Erro ao alterar modo sandbox do adaptador');
    }
  };

  const handlePingAdapter = async (adapterId: string) => {
    setPingStates((prev) => ({ ...prev, [adapterId]: { loading: true } }));
    try {
      const res = await pingRealAdapter(adapterId);
      setPingStates((prev) => ({
        ...prev,
        [adapterId]: {
          loading: false,
          success: res.success,
          latencyMs: res.latencyMs,
          error: res.error,
          details: res.details,
        },
      }));
      await loadData();
    } catch (err: any) {
      setPingStates((prev) => ({
        ...prev,
        [adapterId]: {
          loading: false,
          success: false,
          latencyMs: 0,
          error: err.message,
        },
      }));
    }
  };

  const handleManualDispatch = async (e: FormEvent) => {
    e.preventDefault();
    setDispatchLoading(true);
    setDispatchReceipt(null);
    setDispatchError(null);

    try {
      const res = await dispatchManualRealOrder({
        symbol: dispatchSymbol,
        side: dispatchSide,
        quantity: parseFloat(dispatchQty),
        price: parseFloat(dispatchPrice),
      });

      if (res.receipt) {
        setDispatchReceipt(res.receipt);
      }
      await loadData();
    } catch (e: any) {
      setDispatchError(e.message || 'Falha ao despachar ordem no gateway');
    } finally {
      setDispatchLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Banner & Control Deck */}
      <div className="bg-gradient-to-r from-zinc-900/90 via-emerald-950/30 to-zinc-900/90 border border-emerald-500/20 rounded-2xl p-6 relative overflow-hidden backdrop-blur-xl">
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                <Radio className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold text-white tracking-tight">
                    Gateway de Execução Real & Market Clock
                  </h2>
                  <span
                    className={`px-2.5 py-0.5 text-[10px] font-mono uppercase rounded-full font-semibold border ${
                      config?.mode === 'live'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : config?.mode === 'sandbox'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    }`}
                  >
                    MODO: {config?.mode?.toUpperCase() || 'SANDBOX'}
                  </span>
                </div>
                <p className="text-xs text-white/60">
                  Camada plugável pós-validação com compasso temporal dinâmico, Coinbase Advanced Trade, MetaMask EVM e Corretoras Nacionais (B3).
                </p>
              </div>
            </div>
          </div>

          {/* Master Controls */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {/* Mode Switcher */}
            <div className="bg-black/50 border border-white/10 p-1 rounded-xl flex items-center gap-1 text-xs font-mono">
              {(['paper', 'sandbox', 'live'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => handleModeChange(m)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                    config?.mode === m
                      ? m === 'live'
                        ? 'bg-rose-500 text-white shadow-[0_0_10px_rgba(244,63,94,0.4)]'
                        : m === 'sandbox'
                        ? 'bg-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                        : 'bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Master Toggle */}
            <button
              onClick={handleToggleGateway}
              disabled={loading}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer disabled:opacity-50 ${
                config?.enabled
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-white/60 border border-white/10'
              }`}
            >
              {config?.enabled ? (
                <>
                  <Pause className="w-4 h-4 text-emerald-400" /> Gateway Ativo
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" /> Gateway Desativado
                </>
              )}
            </button>

            <button
              onClick={loadData}
              title="Atualizar dados"
              className="p-2.5 bg-zinc-800/80 hover:bg-zinc-700 text-slate-300 rounded-xl border border-white/10 transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Telemetry Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-4 border-t border-white/10 text-xs">
          <div className="bg-black/30 p-3 rounded-lg border border-white/5">
            <div className="text-white/40 text-[10px] uppercase font-mono">Ordens Despachadas</div>
            <div className="text-white font-mono font-bold mt-0.5">{status?.totalOrdersDispatched || history.length}</div>
          </div>
          <div className="bg-black/30 p-3 rounded-lg border border-white/5">
            <div className="text-white/40 text-[10px] uppercase font-mono">Volume Acumulado ($)</div>
            <div className="text-emerald-400 font-mono font-bold mt-0.5">
              ${(status?.totalVolumeExecutedUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-black/30 p-3 rounded-lg border border-white/5">
            <div className="text-white/40 text-[10px] uppercase font-mono">Fila de Espera (Sessões Fechadas)</div>
            <div className="text-cyan-400 font-mono font-bold mt-0.5">{queue.length} ordens aguardando</div>
          </div>
          <div className="bg-black/30 p-3 rounded-lg border border-white/5">
            <div className="text-white/40 text-[10px] uppercase font-mono">Adaptadores Ativos</div>
            <div className="text-white font-semibold mt-0.5">
              {adapters.filter((a) => a.isEnabled).length} de {adapters.length} Prontos
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 overflow-x-auto pb-2 scrollbar-none">
        {[
          { id: 'overview', label: 'Visão Geral & Fluxo', icon: Layers },
          { id: 'adapters', label: 'Adaptadores & Saldos', icon: Wallet },
          { id: 'market_clock', label: 'Market Clock (Sessões & Feriados)', icon: Clock },
          { id: 'dispatch', label: 'Disparo Manual (Sandbox Test)', icon: Send },
          { id: 'history', label: `Histórico de Execuções (${history.length})`, icon: Activity },
          { id: 'queue', label: `Fila de Agendamento (${queue.length})`, icon: Calendar },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                  : 'bg-zinc-900/60 hover:bg-zinc-800 text-white/60 hover:text-white border border-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW & ARCHITECTURE FLOW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Architecture Pipeline Visualizer */}
          <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-2">
              <Zap className="w-4 h-4" /> Pipeline de Execução Plugável & Não-Bloqueante
            </h3>
            <p className="text-xs text-white/60">
              O fluxo central de validação e persistência do <code>operationalGuard</code> e <code>store.ts</code> permanece 100% inalterado. O Gateway atua como uma saída desacoplada.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
              <div className="bg-black/40 border border-white/10 p-4 rounded-xl space-y-1.5">
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded border border-cyan-400/20">
                  ETAPA 1
                </span>
                <h4 className="font-bold text-white text-xs">Motores Quânticos</h4>
                <p className="text-[11px] text-white/50">ORB 15m, Monte Carlo, Grid Arbitrage geram intenção de ordem.</p>
              </div>

              <div className="bg-black/40 border border-white/10 p-4 rounded-xl space-y-1.5">
                <span className="text-[10px] font-mono text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded border border-purple-400/20">
                  ETAPA 2
                </span>
                <h4 className="font-bold text-white text-xs">Operational Guard</h4>
                <p className="text-[11px] text-white/50">Valida Slippage, Notional, Kill-Switch e assina com HMAC-SHA256.</p>
              </div>

              <div className="bg-black/40 border border-amber-500/30 p-4 rounded-xl space-y-1.5 shadow-[0_0_10px_rgba(245,158,11,0.1)]">
                <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                  ETAPA 3 (NOVO)
                </span>
                <h4 className="font-bold text-white text-xs">Market Clock & Fila</h4>
                <p className="text-[11px] text-white/50">Verifica fuso horário e feriados. Se fechado, agenda na fila.</p>
              </div>

              <div className="bg-black/40 border border-emerald-500/30 p-4 rounded-xl space-y-1.5 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  ETAPA 4 (NOVO)
                </span>
                <h4 className="font-bold text-white text-xs">Broker Adapters</h4>
                <p className="text-[11px] text-white/50">Roteia para Coinbase, MetaMask, B3 (XP/Genial) ou Paper.</p>
              </div>
            </div>
          </div>

          {/* Quick Status Grid: Adapters + Open Markets */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Adapters Quick View */}
            <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-400" /> Provedores & Adaptadores
                </h3>
                <span className="text-xs text-white/40">{adapters.length} Configurados</span>
              </div>

              <div className="space-y-2">
                {adapters.map((adp) => (
                  <div
                    key={adp.id}
                    className="bg-black/40 border border-white/5 p-3 rounded-xl flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        {adp.name}
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-white/60">
                          {adp.kind.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-[10px] text-white/40 font-mono mt-0.5">
                        Ping: {adp.lastPingMs}ms • Modo: {adp.isSandbox ? 'Sandbox / Homologação' : 'Produção Live'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          adp.isEnabled ? 'bg-emerald-400 shadow-[0_0_8px_#22c55e]' : 'bg-zinc-600'
                        }`}
                      />
                      <span className="font-mono text-[11px] font-bold text-white/80">
                        {adp.isEnabled ? 'ATIVO' : 'DESLIGADO'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Market Clock Quick Status */}
            <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cyan-400" /> Status dos Mercados Globais
                </h3>
                <span className="text-xs text-white/40">Horários Oficiais</span>
              </div>

              <div className="space-y-2">
                {markets.map((mkt) => (
                  <div
                    key={mkt.marketId}
                    className="bg-black/40 border border-white/5 p-3 rounded-xl flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-white">{mkt.marketName}</div>
                      <div className="text-[10px] text-white/40 font-mono mt-0.5">
                        {mkt.currentLocalTime} • {mkt.activeSession || mkt.reason}
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-lg font-mono font-bold text-[10px] ${
                        mkt.isOpen
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {mkt.isOpen ? 'ABERTO' : 'FECHADO'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ADAPTERS & BALANCES */}
      {activeTab === 'adapters' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {adapters.map((adp) => {
              const adpBalances = balances[adp.id] || [];
              const pingState = pingStates[adp.id];
              return (
                <div key={adp.id} className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-white text-sm flex items-center gap-2">
                        {adp.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-mono text-cyan-400/80 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20 uppercase">
                          {adp.kind.toUpperCase()}
                        </span>
                        <span className="text-[10px] font-mono text-white/40 uppercase">ID: {adp.id}</span>
                        {adp.id === 'mt5' && (
                          <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                            JOAT Python Bridge
                          </span>
                        )}
                        {adp.id === 'binance' && (
                          <span className="text-[10px] font-mono text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/20">
                            CCXT Spot & Futures
                          </span>
                        )}
                        {adp.id === 'ctrader' && (
                          <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                            Open API REST
                          </span>
                        )}
                        {adp.id === 'blockchain_evm' && (
                          <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                            7 EVM Chains & DEX
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAdapterSandboxToggle(adp.id, adp.isSandbox)}
                        className={`px-2 py-1 text-[10px] font-mono rounded border transition cursor-pointer ${
                          adp.isSandbox
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        }`}
                      >
                        {adp.isSandbox ? 'SANDBOX' : 'LIVE'}
                      </button>

                      <button
                        onClick={() => handleAdapterToggle(adp.id, adp.isEnabled)}
                        className={`px-3 py-1 text-[10px] font-bold rounded-lg transition cursor-pointer ${
                          adp.isEnabled ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-white/40'
                        }`}
                      >
                        {adp.isEnabled ? 'ATIVO' : 'DESATIVAR'}
                      </button>
                    </div>
                  </div>

                  {/* Ping & Connectivity Deck */}
                  <div className="flex items-center justify-between bg-black/40 border border-white/5 px-3 py-2 rounded-xl text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${adp.isConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-rose-500'}`} />
                      <span className="font-mono text-[11px] text-white/70">
                        {adp.isConnected ? 'Conectado / Pronto' : 'Aguardando Inicialização'}
                      </span>
                      {adp.lastPingMs > 0 && (
                        <span className="text-[10px] font-mono text-white/40">({adp.lastPingMs}ms)</span>
                      )}
                    </div>

                    <button
                      onClick={() => handlePingAdapter(adp.id)}
                      disabled={pingState?.loading}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-white/80 hover:text-white text-[10px] font-mono flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${pingState?.loading ? 'animate-spin text-cyan-400' : ''}`} />
                      {pingState?.loading ? 'Testando...' : 'Testar Ping'}
                    </button>
                  </div>

                  {/* Ping Diagnostic Feedback */}
                  {pingState && !pingState.loading && (
                    <div
                      className={`text-[11px] font-mono p-2.5 rounded-xl border ${
                        pingState.success
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{pingState.success ? '✓ Resposta OK da API/Bridge' : '⚠️ Falha de Comunicação'}</span>
                        <span className="font-bold">{pingState.latencyMs}ms</span>
                      </div>
                      {pingState.error && <div className="text-[10px] text-rose-400/80 mt-1">{pingState.error}</div>}
                    </div>
                  )}

                  {/* Balances Sub-Card */}
                  <div className="bg-black/50 border border-white/5 rounded-xl p-3 space-y-2">
                    <div className="text-[10px] font-mono uppercase text-white/40">Saldos Disponíveis</div>
                    <div className="space-y-1.5">
                      {adpBalances.length === 0 ? (
                        <div className="text-[11px] text-white/30 font-mono py-2">Nenhum saldo reportado</div>
                      ) : (
                        adpBalances.map((b, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs font-mono">
                            <span className="text-white/80">{b.asset}</span>
                            <span className="font-bold text-emerald-400">
                              {b.free.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Dedicated On-Chain EVM Control Deck */}
                  {adp.id === 'blockchain_evm' && (
                    <div className="bg-purple-950/20 border border-purple-500/20 rounded-xl p-3.5 space-y-3 mt-2 text-xs font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-purple-300 font-bold flex items-center gap-1.5">
                          <Link className="w-3.5 h-3.5 text-purple-400" /> Rede EVM Ativa
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {onchainStatus?.wallet.env === 'testnet' ? 'TESTNET SANDBOX' : 'MAINNET LIVE'}
                        </span>
                      </div>

                      {/* Chain Switcher Dropdown */}
                      <div className="flex items-center gap-2">
                        <select
                          value={onchainStatus?.wallet.chainKey || 'sepolia'}
                          onChange={(e) => handleSwitchChain(e.target.value)}
                          disabled={switchingChain}
                          className="w-full bg-black/60 border border-purple-500/30 rounded-lg px-2.5 py-1.5 text-xs text-purple-200 focus:outline-none focus:border-purple-400"
                        >
                          {onchainChains.map((c) => (
                            <option key={c.key} value={c.key} className="bg-zinc-900 text-white">
                              {c.name} ({c.env.toUpperCase()} - ID {c.chainId})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* On-Chain Verification & Router Info */}
                      <div className="flex items-center justify-between pt-1 border-t border-purple-500/10">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-white/50">Router DEX</span>
                          <span className="text-[11px] text-white/90">
                            {onchainChains.find(c => c.key === onchainStatus?.wallet.chainKey)?.dexName || 'Uniswap V2'}
                          </span>
                        </div>

                        <button
                          onClick={handleVerifyRouter}
                          disabled={verifyingRouter}
                          className="px-2.5 py-1 rounded bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/30 text-[10px] flex items-center gap-1 cursor-pointer disabled:opacity-50 transition"
                        >
                          <RefreshCw className={`w-3 h-3 ${verifyingRouter ? 'animate-spin' : ''}`} />
                          {verifyingRouter ? 'Verificando...' : 'Verificar Router On-Chain'}
                        </button>
                      </div>

                      {onchainVerificationResult && (
                        <div className="p-2 rounded bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-200">
                          {onchainVerificationResult}
                        </div>
                      )}

                      {/* Security Policy & Audit Deck */}
                      <div className="pt-2 border-t border-purple-500/10 flex items-center justify-between text-[10px]">
                        <span className="text-white/40">
                          Teto: <strong>${onchainStatus?.wallet.maxNotionalUsd || 1000} USD</strong> | Conf: <strong>{onchainStatus?.wallet.confirmations || 1}</strong>
                        </span>

                        <button
                          onClick={handleCheckAuditIntegrity}
                          className="text-[10px] text-purple-300 hover:text-purple-100 underline cursor-pointer flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          {onchainAuditValid === null ? 'Checar Auditoria' : onchainAuditValid ? '✓ Trilha 100% Íntegra' : '⚠️ Violação Detectada'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Dedicated MetaMask Web3 Control Deck */}
                  {adp.id === 'metamask' && (
                    <div className="bg-orange-950/20 border border-orange-500/20 rounded-xl p-3.5 space-y-3 mt-2 text-xs font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-orange-300 font-bold flex items-center gap-1.5">
                          <Wallet className="w-3.5 h-3.5 text-orange-400" /> Gateway Web3 MetaMask
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded border ${
                          adp.isConnected
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                        }`}>
                          {adp.isConnected ? 'OBSERVADOR ATIVO (EVM)' : 'DESCONECTADA'}
                        </span>
                      </div>

                      {/* Web3 Connect Button */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleConnectMetaMask}
                            disabled={mmConnecting}
                            className="flex-1 py-2 px-3 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-[0_0_12px_rgba(234,88,12,0.3)] disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${mmConnecting ? 'animate-spin' : ''}`} />
                            {mmConnecting ? 'Conectando à Extensão...' : 'Conectar MetaMask (Navegador)'}
                          </button>
                        </div>

                        {/* Manual / Watch-Only Address Input */}
                        <div className="space-y-1">
                          <div className="text-[10px] text-white/50 flex items-center justify-between">
                            <span>Endereço EVM de Observação (Watch-Only)</span>
                            {adp.isConnected && (
                              <button
                                onClick={() => {
                                  setMmInputAddress('');
                                  setMetaMaskWatchAddress('').then(() => loadData());
                                }}
                                className="text-rose-400 hover:text-rose-300 text-[10px] underline cursor-pointer"
                              >
                                Desconectar
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={mmInputAddress}
                              onChange={(e) => setMmInputAddress(e.target.value)}
                              placeholder="0x... Cole seu endereço EVM"
                              className="flex-1 bg-black/60 border border-orange-500/30 rounded-lg px-2.5 py-1.5 text-xs text-orange-200 focus:outline-none focus:border-orange-400 font-mono"
                            />
                            <button
                              onClick={handleSaveMetaMaskWatchAddress}
                              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] font-bold border border-white/10 transition cursor-pointer"
                            >
                              Salvar
                            </button>
                          </div>
                        </div>

                        {/* Current Address Display with Copy & Explorer */}
                        {adp.walletAddress && adp.walletAddress.startsWith('0x') && (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-black/50 border border-orange-500/20 text-[11px]">
                            <span className="text-orange-300 font-mono truncate max-w-[200px]" title={adp.walletAddress}>
                              {adp.walletAddress}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleCopyMetaMaskAddress(adp.walletAddress!)}
                                className="text-white/60 hover:text-white transition flex items-center gap-1 cursor-pointer text-[10px]"
                                title="Copiar Endereço"
                              >
                                {mmCopied ? (
                                  <span className="text-emerald-400 flex items-center gap-0.5"><Check className="w-3 h-3" /> Copiado</span>
                                ) : (
                                  <span className="flex items-center gap-0.5"><Copy className="w-3 h-3" /> Copiar</span>
                                )}
                              </button>
                              <a
                                href={`https://sepolia.etherscan.io/address/${adp.walletAddress}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-orange-400 hover:text-orange-300 transition flex items-center gap-0.5 text-[10px]"
                                title="Ver no Etherscan"
                              >
                                <ExternalLink className="w-3 h-3" /> Etherscan
                              </a>
                            </div>
                          </div>
                        )}

                        {/* Notice / Feedback Banner */}
                        {mmMessage && (
                          <div className={`p-2 rounded-lg border text-[11px] font-sans ${
                            mmMessage.type === 'success'
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                              : mmMessage.type === 'warning'
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : mmMessage.type === 'info'
                              ? 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                              : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                          }`}>
                            {mmMessage.text}
                          </div>
                        )}

                        <div className="pt-2 border-t border-orange-500/10 text-[10px] text-white/50 leading-relaxed font-sans">
                          💡 <strong>Modo Cliente/Observador:</strong> A MetaMask é uma carteira de navegador. O backend atua em modo observador (lendo saldos reais on-chain). Operações interativas requerem aprovação na extensão.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: MARKET CLOCK & CALENDARS */}
      {activeTab === 'market_clock' && (
        <div className="space-y-6">
          <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400 font-mono flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Calendários Oficiais & Sessões de Negociação
            </h3>
            <p className="text-xs text-white/60">
              O <code>MarketClockService</code> calcula a cada tick se o ativo está em janela oficial de pregão no fuso horário do país de origem, prevenindo ordens rejeitadas pelo broker.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
              {markets.map((m) => (
                <div key={m.marketId} className="bg-black/50 border border-white/10 p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-white text-sm">{m.marketName}</h4>
                      <div className="text-[10px] font-mono text-white/40">Fuso: {m.timezone}</div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded font-mono font-bold text-xs ${
                        m.isOpen ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {m.isOpen ? 'SESSÃO ATIVA' : 'MERCADO FECHADO'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-black/40 p-2.5 rounded border border-white/5">
                    <div>
                      <span className="text-[10px] text-white/40 block">Hora Local:</span>
                      <span className="text-white font-bold">{m.currentLocalTime}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-white/40 block">Próxima Abertura:</span>
                      <span className="text-cyan-400">{m.nextOpenTime || 'Em andamento'}</span>
                    </div>
                  </div>

                  {m.reason && (
                    <div className="text-[11px] text-amber-300/80 bg-amber-500/10 p-2 rounded border border-amber-500/20">
                      ℹ️ {m.reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: MANUAL DISPATCH SANDBOX */}
      {activeTab === 'dispatch' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-sm uppercase font-mono flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-400" /> Disparo Direto de Ordem
              </h3>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
                Testes em Sandbox
              </span>
            </div>
            <p className="text-xs text-white/60">
              Despache ordens através do pipeline completo do <code>RealExecutionGateway</code> para validar latência e recibos de execução.
            </p>

            <form onSubmit={handleManualDispatch} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-white/50 uppercase font-mono block mb-1">Símbolo</label>
                  <select
                    value={dispatchSymbol}
                    onChange={(e) => setDispatchSymbol(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-emerald-500 outline-none font-mono"
                  >
                    <option value="BTC/USDT">BTC/USDT (Coinbase)</option>
                    <option value="ETH/USDT">ETH/USDT (Coinbase)</option>
                    <option value="SOL/USDT">SOL/USDT (Coinbase)</option>
                    <option value="PETR4">PETR4 (B3 / XP / Genial)</option>
                    <option value="VALE3">VALE3 (B3 / XP / Genial)</option>
                    <option value="ETH_DEFI">ETH_DEFI (MetaMask EVM)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-white/50 uppercase font-mono block mb-1">Lado</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDispatchSide('BUY')}
                      className={`py-2 rounded-xl text-xs font-bold transition ${
                        dispatchSide === 'BUY' ? 'bg-emerald-500 text-black' : 'bg-black/40 text-white/60 border border-white/10'
                      }`}
                    >
                      COMPRA
                    </button>
                    <button
                      type="button"
                      onClick={() => setDispatchSide('SELL')}
                      className={`py-2 rounded-xl text-xs font-bold transition ${
                        dispatchSide === 'SELL' ? 'bg-rose-500 text-white' : 'bg-black/40 text-white/60 border border-white/10'
                      }`}
                    >
                      VENDA
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-white/50 uppercase font-mono block mb-1">Quantidade</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.001"
                    value={dispatchQty}
                    onChange={(e) => setDispatchQty(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-emerald-500 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-white/50 uppercase font-mono block mb-1">Preço Alvo ($/R$)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={dispatchPrice}
                    onChange={(e) => setDispatchPrice(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-emerald-500 outline-none font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={dispatchLoading || !config?.enabled}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl py-2.5 text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:opacity-50"
              >
                {dispatchLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Despachar Ordem no Gateway Real
              </button>

              {dispatchError && (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-2.5 rounded-xl text-xs flex items-center gap-2 font-mono">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{dispatchError}</span>
                </div>
              )}
            </form>
          </div>

          {/* Execution Result Box */}
          <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 space-y-4">
            <h3 className="font-bold text-white text-sm uppercase font-mono flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Recibo de Execução do Broker
            </h3>

            {dispatchReceipt ? (
              <div className="space-y-3 font-mono text-xs animate-fade-in">
                <div className="bg-black/50 border border-emerald-500/30 p-3.5 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-400 font-bold">{dispatchReceipt.adapterName}</span>
                    <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded text-[10px]">
                      {dispatchReceipt.status} ({dispatchReceipt.latencyMs}ms)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-white/80 pt-2 border-t border-white/5">
                    <div>Símbolo: <span className="text-white font-bold">{dispatchReceipt.symbol}</span></div>
                    <div>Lado: <span className="text-white font-bold">{dispatchReceipt.side}</span></div>
                    <div>Preço Exec: <span className="text-emerald-400 font-bold">${dispatchReceipt.executedPrice}</span></div>
                    <div>Taxa: <span className="text-white/60">{dispatchReceipt.fee} {dispatchReceipt.feeAsset}</span></div>
                  </div>

                  <div className="text-[10px] text-white/40 break-all">
                    Order ID: {dispatchReceipt.orderId}
                  </div>
                </div>

                <div className="bg-black/70 border border-white/10 p-3 rounded-xl max-h-48 overflow-y-auto text-[10px] text-white/60 scrollbar-thin">
                  <pre><code>{JSON.stringify(dispatchReceipt.rawResponse || dispatchReceipt, null, 2)}</code></pre>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-white/30 text-xs font-mono">
                Aguardando despacho de ordem no formulário ao lado...
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: EXECUTION HISTORY */}
      {activeTab === 'history' && (
        <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" /> Histórico de Recibos de Execução ({history.length})
            </h3>
            <span className="text-xs text-white/40">Auditados com HMAC-SHA256</span>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {history.length === 0 ? (
              <div className="text-center py-12 text-white/40 text-xs font-mono">
                Nenhum recibo de execução registrado ainda.
              </div>
            ) : (
              history.map((receipt, idx) => (
                <div
                  key={idx}
                  className="bg-black/40 border border-white/5 hover:border-white/20 p-3.5 rounded-xl flex items-center justify-between gap-3 text-xs transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] ${
                          receipt.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {receipt.side}
                      </span>
                      <span className="font-mono font-bold text-white">{receipt.symbol}</span>
                      <span className="text-white/50 text-[11px] font-mono">Qtd: {receipt.quantity}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-white/60">
                        {receipt.adapterName}
                      </span>
                    </div>
                    <div className="text-[10px] text-white/40 font-mono">
                      Preço: ${receipt.executedPrice} • Taxa: {receipt.fee} {receipt.feeAsset} • Latência: {receipt.latencyMs}ms
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                        receipt.status === 'FILLED'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}
                    >
                      {receipt.status}
                    </div>
                    <div className="text-[9px] text-white/30 font-mono mt-1">
                      {new Date(receipt.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 6: QUEUED ORDERS */}
      {activeTab === 'queue' && (
        <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-400" /> Fila de Espera Dinâmica (Sessões Fechadas)
            </h3>
            <span className="text-xs text-white/40">{queue.length} Ordens na Fila</span>
          </div>

          <div className="space-y-2">
            {queue.length === 0 ? (
              <div className="text-center py-12 text-white/40 text-xs font-mono">
                Fila limpa. Todas as ordens recentes foram despachadas diretamente para mercados abertos.
              </div>
            ) : (
              queue.map((item) => (
                <div
                  key={item.id}
                  className="bg-black/40 border border-amber-500/20 p-3.5 rounded-xl flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white">{item.order.symbol}</span>
                      <span className="text-white/60 font-mono text-[11px]">{item.order.side} {item.order.quantity}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                        Mercado: {item.marketId}
                      </span>
                    </div>
                    <div className="text-[10px] text-white/40 font-mono">
                      Enfileirado em: {new Date(item.enqueuedAt).toLocaleTimeString()} • Disparo Previsto: {item.targetOpenTime || 'Próxima Abertura'}
                    </div>
                  </div>

                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                    {item.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
