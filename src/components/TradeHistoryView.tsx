import { useState } from 'react';
import { Trade, SystemLog } from '../types';
import {
  History,
  Terminal,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

interface TradeHistoryViewProps {
  trades: Trade[];
  logs: SystemLog[];
}

export function TradeHistoryView({ trades, logs }: TradeHistoryViewProps) {
  const [activeTab, setActiveTab] = useState<'trades' | 'logs'>('trades');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');

  const filteredTrades = trades.filter((t) => {
    const matchesSearch =
      t.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.accountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.botName && t.botName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
            <History className="w-5 h-5 text-cyan-400" />
            Histórico de Ordens & Auditoria do Sistema
          </h2>
          <p className="text-xs text-white/40 mt-1">
            Registro imutável de todas as execuções manuais, ordens de bots e verificações da Regra do Lucro.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center gap-1 bg-black/50 p-1.5 rounded-full border border-white/5 text-xs font-mono">
          <button
            onClick={() => setActiveTab('trades')}
            className={`px-4 py-2 rounded-full font-bold transition cursor-pointer ${
              activeTab === 'trades'
                ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                : 'text-white/40 hover:text-white'
            }`}
          >
            Trades ({trades.length})
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 rounded-full font-bold transition cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                : 'text-white/40 hover:text-white'
            }`}
          >
            Auditoria ({logs.length})
          </button>
        </div>
      </div>

      {activeTab === 'trades' ? (
        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Buscar por ativo, bot ou conta..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-2xl pl-10 pr-3 py-2.5 text-white outline-none focus:border-cyan-500/50"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-white/40" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'open' | 'closed')}
                className="bg-black/50 border border-white/10 rounded-2xl px-4 py-2.5 text-white outline-none focus:border-cyan-500/50"
              >
                <option value="all" className="bg-zinc-900">Todas as Ordens</option>
                <option value="closed" className="bg-zinc-900">Encerradas</option>
                <option value="open" className="bg-zinc-900">Abertas</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="text-white/40 border-b border-white/5">
                  <th className="pb-3 font-medium">Data / Hora</th>
                  <th className="pb-3 font-medium">Conta / Corretora</th>
                  <th className="pb-3 font-medium">Ativo</th>
                  <th className="pb-3 font-medium">Tipo</th>
                  <th className="pb-3 font-medium">Preço Entrada</th>
                  <th className="pb-3 font-medium">Preço Saída</th>
                  <th className="pb-3 font-medium">PnL R$ (%)</th>
                  <th className="pb-3 font-medium">Origem</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredTrades.map((t) => {
                  const isLong = t.direction === 'LONG';
                  const isClosed = t.status === 'closed';
                  const isProfit = t.pnl >= 0;

                  return (
                    <tr key={t.id} className="hover:bg-white/5 transition">
                      <td className="py-3.5 text-white/40 text-[11px]">
                        {new Date(t.entryTime).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3.5">
                        <span className="text-white font-bold block">{t.accountName}</span>
                        <span className="text-[10px] text-white/40 uppercase">{t.broker}</span>
                      </td>
                      <td className="py-3.5 font-bold text-white">{t.symbol}</td>
                      <td className="py-3.5">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] uppercase font-bold ${
                            isLong
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {t.direction}
                        </span>
                      </td>
                      <td className="py-3.5 text-white/80">R$ {t.entryPrice.toFixed(2)}</td>
                      <td className="py-3.5 text-white/80">
                        {isClosed ? `R$ ${t.currentPrice.toFixed(2)}` : '—'}
                      </td>
                      <td className={`py-3.5 font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfit ? '+' : ''}
                        {t.pnlPercent.toFixed(2)}% (R$ {t.pnl.toFixed(2)})
                      </td>
                      <td className="py-3.5 text-white/50">{t.botName || 'Manual'}</td>
                      <td className="py-3.5">
                        {isClosed ? (
                          <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Fechada
                          </span>
                        ) : (
                          <span className="text-cyan-400 flex items-center gap-1 text-[11px] animate-pulse">
                            Aberta
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Audit Logs Tab */
        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              Auditoria de Eventos do Servidor
            </h3>
            <span className="text-white/40 text-xs">Exibindo últimas {logs.length} entradas</span>
          </div>

          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="p-3.5 rounded-2xl bg-black/40 border border-white/5 flex items-start gap-3 text-xs"
              >
                <span className="text-white/40 shrink-0 text-[11px]">
                  {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                </span>
                <span
                  className={`font-bold uppercase px-2.5 py-0.5 rounded-full text-[10px] shrink-0 ${
                    log.type === 'TRADE'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : log.type === 'RULE'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  }`}
                >
                  {log.type}
                </span>
                <span className="text-white/80">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
