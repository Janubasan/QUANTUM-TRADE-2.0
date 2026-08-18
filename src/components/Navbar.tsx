import { Account, Bot } from '../types';
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
  Cable,
} from 'lucide-react';


interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  accounts: Account[];
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  bots: Bot[];
  onOpenNewAccountModal: () => void;
}

export function Navbar({
  activeTab,
  setActiveTab,
  accounts,
  selectedAccountId,
  setSelectedAccountId,
  bots,
  onOpenNewAccountModal,
}: NavbarProps) {
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];

  // Calculate overall portfolio metrics
  const totalBalance = accounts.reduce((acc, curr) => acc + curr.currentBalance, 0);
  const totalProfit = accounts.reduce((acc, curr) => acc + (curr.currentBalance - curr.initialBalance), 0);
  const activeBotsCount = bots.filter((b) => b.status === 'running').length;

  const tabs = [
    { id: 'dashboard', label: 'Dashboard Quântico', icon: LayoutDashboard },
    { id: 'accounts', label: 'Contas Multi-Broker', icon: Wallet },
    { id: 'integrations', label: 'MT5 & Proft', icon: Cable },
    { id: 'bots', label: 'Bots Autônomos', icon: BotIcon, badge: activeBotsCount },
    { id: 'validation', label: 'Validação RAG & Hashes', icon: ShieldCheck },
    { id: 'webhook', label: 'Webhook & Sinais', icon: Webhook },
    { id: 'entanglement', label: 'Entanglement & Sinais', icon: BrainCircuit },
    { id: 'backtest', label: 'Backtest Coletivo', icon: LineChart },
    { id: 'history', label: 'Histórico & Logs', icon: History },
  ];


  return (
    <header className="border-b border-white/5 bg-[#050507]/90 backdrop-blur-xl sticky top-0 z-40 text-[#e0e0e0]">
      {/* Top Header Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand & Logo - Bento Style */}
        <div className="flex items-center gap-4">
          <div className="bg-cyan-500 w-10 h-10 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.5)] shrink-0">
            <span className="text-black font-black text-xl">J</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tighter text-white">
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
                  {acc.name} ({acc.type.toUpperCase()} • R${acc.currentBalance.toFixed(2)})
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

          {/* Balance Pill */}
          <div className="bg-zinc-900/40 border border-white/5 px-3.5 py-1.5 rounded-full flex items-center gap-2 text-xs">
            <span className="text-white/40 text-[11px]">Saldo Total:</span>
            <span className="font-mono font-bold text-white">
              R$ {totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
            <span>Lucro: {totalProfit >= 0 ? '+' : ''}R$ {totalProfit.toFixed(2)}</span>
          </div>

          {/* Active Bots Counter */}
          <div className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-mono">
            <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#22c55e] animate-pulse" />
            <span>{activeBotsCount} Bots Ativos</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs - Bento Pill Style */}
      <nav className="border-t border-white/5 bg-zinc-950/40 overflow-x-auto scrollbar-none py-2 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-full transition whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                    : 'bg-zinc-900/30 text-white/60 hover:text-white hover:bg-zinc-900/60 border border-white/5'
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
