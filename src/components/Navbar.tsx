import { useState } from 'react';
import { Account, Bot, Trade } from '../types';
import {
  LayoutDashboard,
  Wallet,
  Bot as BotIcon,
  BrainCircuit,
  LineChart,
  History,
  ShieldCheck,
  TrendingUp,
  Activity,
  PlusCircle,
  Webhook,
  Cpu,
  Radio,
  Terminal,
  Landmark,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { connectMetaMask, openInNewTab, FALLBACK_SEPOLIA_ADDRESS } from '../lib/web3MetaMask';
import { createAccount } from '../services/api';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  accounts: Account[];
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  bots: Bot[];
  trades: Trade[];
  onOpenNewAccountModal: () => void;
  onRefreshData?: () => void;
}

export function Navbar({
  activeTab,
  setActiveTab,
  accounts,
  selectedAccountId,
  setSelectedAccountId,
  bots,
  trades,
  onOpenNewAccountModal,
  onRefreshData,
}: NavbarProps) {
  const [mmConnecting, setMmConnecting] = useState(false);
  const [mmNotice, setMmNotice] = useState<string | null>(null);
  const [showIframeHelp, setShowIframeHelp] = useState(false);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];
  const metaMaskAccount = accounts.find((a) => a.broker === 'metamask');
  const isMetaMaskSelected = selectedAccount?.broker === 'metamask';

  // Calculate overall portfolio metrics
  const totalBalance = accounts.reduce((acc, curr) => acc + (curr.currentBalance || 0), 0);
  const totalProfit = accounts.reduce((acc, curr) => acc + ((curr.currentBalance || 0) - (curr.initialBalance || 0)), 0);
  const activeBotsCount = bots.filter((b) => b.status === 'running').length;

  // Analytics globais (cabeçalho)
  const totalTradesAll = accounts.reduce((acc, a) => acc + (a.totalTrades || 0), 0);
  const totalWinsAll = accounts.reduce((acc, a) => acc + (a.winningTrades || 0), 0);
  const winRate = totalTradesAll > 0 ? Math.round((totalWinsAll / totalTradesAll) * 100) : 0;
  const openPositionsCount = trades.filter((t) => t.status === 'open').length;
  const closedTradesCount = trades.filter((t) => t.status === 'closed').length;

  const handleConnectFallback = async () => {
    setMmConnecting(true);
    setMmNotice(null);
    setShowIframeHelp(false);
    try {
      const result = await connectMetaMask(FALLBACK_SEPOLIA_ADDRESS);
      let targetAccount = accounts.find((a) => a.broker === 'metamask');
      if (targetAccount) {
        setSelectedAccountId(targetAccount.id);
      } else {
        const newAcc = await createAccount({
          name: 'Conta MetaMask Web3 (Live)',
          broker: 'metamask',
          type: 'real',
          initialBalance: 100,
          currentBalance: 100,
          baseCurrency: 'USD',
          walletAddress: result.address,
        });
        setSelectedAccountId(newAcc.id);
      }
      onRefreshData?.();
      setActiveTab('dashboard');
    } catch (e: any) {
      setMmNotice(e.message);
    } finally {
      setMmConnecting(false);
    }
  };

  const handleConnectMetaMaskFromNav = async () => {
    setMmConnecting(true);
    setMmNotice(null);
    setShowIframeHelp(false);

    try {
      const result = await connectMetaMask();
      if (!result.success) {
        if (result.inIframe) {
          setShowIframeHelp(true);
        } else {
          setMmNotice(result.error || 'Erro ao conectar com MetaMask');
          setTimeout(() => setMmNotice(null), 8000);
        }
        return;
      }

      // Procura conta metamask existente ou cria uma nova
      let targetAccount = accounts.find((a) => a.broker === 'metamask');
      if (targetAccount) {
        setSelectedAccountId(targetAccount.id);
      } else {
        const newAcc = await createAccount({
          name: 'Conta MetaMask Web3 (Live)',
          broker: 'metamask',
          type: 'real',
          initialBalance: 100,
          currentBalance: 100,
          baseCurrency: 'USD',
          walletAddress: result.address,
        });
        setSelectedAccountId(newAcc.id);
      }

      onRefreshData?.();
      setActiveTab('dashboard');
    } catch (err: any) {
      setMmNotice(err.message || 'Falha ao conectar');
      setTimeout(() => setMmNotice(null), 5000);
    } finally {
      setMmConnecting(false);
    }
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard Quântico', icon: LayoutDashboard },
    { id: 'real-gateway', label: 'Gateway Real & Market Clock', icon: Radio },
    { id: 'accounts', label: 'Contas Multi-Broker', icon: Wallet },
    { id: 'bots', label: 'Bots Autônomos', icon: BotIcon, badge: activeBotsCount },
    { id: 'mt5-edge', label: 'MT5 Plus Edge (Python)', icon: Terminal },
    { id: 'nautilus', label: 'Nautilus Trader (Rust)', icon: Cpu },
    { id: 'validation', label: 'Validação RAG & Hashes', icon: ShieldCheck },
    { id: 'webhook', label: 'Webhook & Sinais', icon: Webhook },
    { id: 'entanglement', label: 'Entanglement & Sinais', icon: BrainCircuit },
    { id: 'jarvis', label: 'Comitê JARVIS', icon: Landmark },
    { id: 'backtest', label: 'Backtest Coletivo', icon: LineChart },
    { id: 'history', label: 'Histórico & Logs', icon: History },
  ];


  return (
    <header className="border-b border-white/5 bg-[#050507]/90 backdrop-blur-xl sticky top-0 z-40 text-[#e0e0e0]">
      {/* MetaMask Pop-up / Iframe Helper Notice */}
      {showIframeHelp && (
        <div className="bg-gradient-to-r from-orange-950/90 via-amber-900/90 to-orange-950/90 border-b border-orange-500/40 px-4 py-2.5 text-xs text-orange-200 flex flex-wrap items-center justify-between gap-3 font-mono">
          <div className="flex items-center gap-2">
            <span className="text-base">🦊</span>
            <span>
              <strong>Dica de Segurança Web3:</strong> Para que a janela da MetaMask abra sem restrições de sandbox do navegador, abra o app em uma aba separada.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openInNewTab()}
              className="px-3 py-1 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-orange-500/20"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Abrir em Nova Aba (Janela Direta)
            </button>
            <button
              onClick={handleConnectFallback}
              className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-orange-200 rounded-lg transition text-[11px] cursor-pointer"
            >
              Usar Carteira Sepolia (0x71C2...b437)
            </button>
            <button
              onClick={() => setShowIframeHelp(false)}
              className="px-2 py-1 text-white/50 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {mmNotice && (
        <div className="bg-amber-950/80 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-200 flex items-center justify-between font-mono">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{mmNotice}</span>
          </div>
          <button onClick={() => setMmNotice(null)} className="text-white/50 hover:text-white cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand & Logo - Bento Style */}
        <div className="flex items-center gap-4">
          <div className="bg-cyan-500 w-10 h-10 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.5)] shrink-0">
            <span className="text-black font-black text-xl">J</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tighter text-white neon-text">
                JANUTRADE
              </h1>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                PRO V4
              </span>
            </div>
            <p className="text-[10px] text-cyan-500/70 uppercase tracking-[0.2em] font-mono flex items-center gap-1.5 mt-0.5">
              <ShieldCheck className="w-3 h-3 text-emerald-400" /> Multi-Broker Intelligent Hub
            </p>
          </div>
        </div>

        {/* Global Portfolio Quick Stats & Market Regime Indicator */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Market Regime Badge */}
          <div className="hidden lg:block text-right pr-3 border-r border-white/10">
            <p className="text-[9px] text-white/40 uppercase font-bold tracking-widest">Market Regime</p>
            <p className="text-xs font-mono text-cyan-400 uppercase font-semibold">KRONOS V.2 • LOW VOL</p>
          </div>

          {/* Account Selector */}
          <div className="flex items-center gap-2 bg-zinc-900/50 border border-white/10 rounded-full px-3 py-1.5 text-xs">
            <Wallet className="w-4 h-4 text-cyan-400 ml-1" />
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="bg-transparent text-slate-200 outline-none cursor-pointer font-medium pr-2 text-xs"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id} className="bg-zinc-900 text-slate-200">
                  {acc.name} ({acc.type.toUpperCase()} • ${(acc.currentBalance ?? 0).toFixed(2)} USD)
                </option>
              ))}
            </select>
            <button
              onClick={onOpenNewAccountModal}
              title="Nova Conta"
              className="p-1 hover:bg-cyan-500/20 text-cyan-400 rounded-full transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
            </button>
          </div>

          {/* Dedicated MetaMask Web3 Action Button */}
          {metaMaskAccount && isMetaMaskSelected ? (
            <div className="bg-orange-500/10 border border-orange-500/30 text-orange-300 px-3.5 py-1.5 rounded-full flex items-center gap-2 text-xs font-mono">
              <span className="text-base leading-none">🦊</span>
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#22c55e] animate-pulse" />
              <span className="font-semibold truncate max-w-[110px]" title={metaMaskAccount.walletAddress}>
                {metaMaskAccount.walletAddress
                  ? `${metaMaskAccount.walletAddress.slice(0, 6)}...${metaMaskAccount.walletAddress.slice(-4)}`
                  : 'MetaMask Ativa'}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 uppercase font-bold">
                LIVE WEB3
              </span>
            </div>
          ) : (
            <button
              onClick={handleConnectMetaMaskFromNav}
              disabled={mmConnecting}
              title="Abre a janela da extensão MetaMask no navegador"
              className="bg-gradient-to-r from-orange-500/20 to-amber-500/20 hover:from-orange-500/30 hover:to-amber-500/30 border border-orange-500/40 text-orange-200 hover:text-white px-3.5 py-1.5 rounded-full flex items-center gap-2 text-xs font-mono transition cursor-pointer shadow-[0_0_12px_rgba(249,115,22,0.15)] shrink-0"
            >
              <span className="text-base leading-none">🦊</span>
              <span className="font-bold">
                {mmConnecting ? 'Abrindo Janela...' : 'Conectar MetaMask'}
              </span>
              <span className="text-[9px] bg-orange-500/30 text-orange-200 px-1.5 py-0.5 rounded uppercase font-bold">
                Pop-up
              </span>
            </button>
          )}

          {/* Balance Pill */}
          <div className="bg-zinc-900/40 border border-white/5 px-3.5 py-1.5 rounded-full flex items-center gap-2 text-xs">
            <span className="text-white/40 text-[11px]">Saldo Total:</span>
            <span className="font-mono font-bold text-white">
              $ {totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
            </span>
          </div>

          {/* Profit Badge */}
          <div
            className={`px-3 py-1.5 rounded-full border flex items-center gap-1.5 text-xs font-mono font-semibold ${
              totalProfit >= 0
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Lucro: {totalProfit >= 0 ? '+' : ''}$ {(totalProfit ?? 0).toFixed(2)} USD</span>
          </div>

          {/* Active Bots Counter */}
          <div className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-mono">
            <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#22c55e] animate-pulse" />
            <span>{activeBotsCount} Bots Ativos</span>
          </div>
        </div>

        {/* Analytics + carteiras (cabeçalho neon) */}
        <div className="w-full flex flex-wrap items-center gap-2 pt-1">
          <span className="px-2.5 py-1 rounded-full bg-zinc-900/60 border border-white/10 text-[10px] font-mono text-white/70">
            Win Rate <span className="text-emerald-400 font-bold">{winRate}%</span>
          </span>
          <span className="px-2.5 py-1 rounded-full bg-zinc-900/60 border border-white/10 text-[10px] font-mono text-white/70">
            Trades <span className="text-cyan-300 font-bold">{totalTradesAll}</span>
            <span className="text-white/30"> · fechados {closedTradesCount}</span>
          </span>
          <span className="px-2.5 py-1 rounded-full bg-zinc-900/60 border border-white/10 text-[10px] font-mono text-white/70">
            Posições <span className={openPositionsCount > 0 ? 'text-amber-300 font-bold' : 'text-white font-bold'}>{openPositionsCount}</span>
          </span>

          {/* Saldos por carteira */}
          {accounts.map((acc) => (
            <span
              key={acc.id}
              className="px-2.5 py-1 rounded-full bg-zinc-900/60 border border-white/10 text-[10px] font-mono text-white/60 flex items-center gap-1.5"
              title={`${acc.name} (${acc.broker})`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${acc.type === 'real' ? 'bg-orange-400' : 'bg-cyan-400'}`} />
              {acc.broker === 'metamask' ? '🦊' : acc.broker === 'blockchain_evm' ? '⛓️' : '👛'}
              <span className="truncate max-w-[90px]">{acc.name.split('(')[0].trim()}</span>
              <span className="text-white font-bold">${(acc.currentBalance ?? 0).toFixed(2)}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Navigation Tabs - Bento Pill Style with visible cyan scrollbar */}
      <nav className="border-t border-white/5 bg-zinc-950/60 overflow-x-auto custom-scrollbar py-2.5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center gap-2 min-w-max pb-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-full transition whitespace-nowrap cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.2)] font-semibold'
                    : 'bg-zinc-900/40 text-white/60 hover:text-white hover:bg-zinc-900/80 border border-white/5'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-white/40'}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500 text-black">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
