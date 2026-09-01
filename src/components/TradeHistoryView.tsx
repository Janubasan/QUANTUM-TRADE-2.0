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
  ShieldCheck,
  Lock,
  Clock,
  Timer,
  Zap,
  Activity,
} from 'lucide-react';

interface TradeHistoryViewProps {
  trades: Trade[];
  logs: SystemLog[];
}

export function TradeHistoryView({ trades, logs }: TradeHistoryViewProps) {
  const [activeTab, setActiveTab] = useState<'trades' | 'logs'>('trades');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [timeframeFilter, setTimeframeFilter] = useState<string>('all');

  const filteredTrades = trades.filter((t) => {
    const matchesSearch =
      t.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.accountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.auditCode && t.auditCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.botName && t.botName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesTimeframe = timeframeFilter === 'all' || t.timeframe === timeframeFilter;
    return matchesSearch && matchesStatus && matchesTimeframe;
  });

  // Resumo de métricas horárias rápidas
  const closedTrades = trades.filter((t) => t.status === 'closed');
  const totalPnl = closedTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
  const winCount = closedTrades.filter((t) => t.pnl > 0).length;
  const winRate = closedTrades.length > 0 ? ((winCount / closedTrades.length) * 100).toFixed(1) : '0';

  const formatDurationDisplay = (totalSec?: number) => {
    if (!totalSec || totalSec <= 0) return '< 1m';
    if (totalSec < 60) return `${totalSec}s`;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
            <History className="w-5 h-5 text-cyan-400" />
            Histórico de Ordens, Relógio & Auditoria Criptográfica
          </h2>
          <p className="text-xs text-white/40 mt-1">
            Registro com relógio de execução, duração por trade (TimeGate), código espelhado e PnL por hora auditado.
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
            Trades Auditadas ({trades.length})
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 rounded-full font-bold transition cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                : 'text-white/40 hover:text-white'
            }`}
          >
            Auditoria do Servidor ({logs.length})
          </button>
        </div>
      </div>

      {activeTab === 'trades' ? (
        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl space-y-4">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-black/40 border border-white/5 p-3 rounded-2xl text-xs font-mono">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <div>
                <div className="text-[10px] text-white/40">Total de Ordens</div>
                <div className="font-bold text-white">{trades.length} ({closedTrades.length} fechadas)</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-[10px] text-white/40">Taxa de Acerto</div>
                <div className="font-bold text-emerald-400">{winRate}% ({winCount}W / {closedTrades.length - winCount}L)</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-400" />
              <div>
                <div className="text-[10px] text-white/40">PnL Acumulado</div>
                <div className={`font-bold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalPnl >= 0 ? '+' : ''}R$ {totalPnl.toFixed(2)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <div>
                <div className="text-[10px] text-white/40">Persistência DB</div>
                <div className="font-bold text-cyan-300">Gravado & Auditado</div>
              </div>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-xs font-mono">
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Buscar por ativo, código ou conta..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-2xl pl-10 pr-3 py-2.5 text-white outline-none focus:border-cyan-500/50"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-end">
              <div className="flex items-center gap-1.5 bg-black/50 px-3 py-1.5 rounded-2xl border border-white/10">
                <span className="text-white/40 text-[11px]">Timeframe:</span>
                <select
                  value={timeframeFilter}
                  onChange={(e) => setTimeframeFilter(e.target.value)}
                  className="bg-transparent text-cyan-300 font-bold outline-none cursor-pointer text-xs"
                >
                  <option value="all" className="bg-zinc-900 text-white">Todos</option>
                  <option value="1m" className="bg-zinc-900 text-white">1m</option>
                  <option value="5m" className="bg-zinc-900 text-white">5m</option>
                  <option value="10m" className="bg-zinc-900 text-white">10m</option>
                  <option value="15m" className="bg-zinc-900 text-white">15m</option>
                  <option value="30m" className="bg-zinc-900 text-white">30m</option>
                  <option value="1h" className="bg-zinc-900 text-white">1h</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 bg-black/50 px-3 py-1.5 rounded-2xl border border-white/10">
                <Filter className="w-3.5 h-3.5 text-white/40" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | 'open' | 'closed')}
                  className="bg-transparent text-white outline-none cursor-pointer text-xs"
                >
                  <option value="all" className="bg-zinc-900">Todas as Ordens</option>
                  <option value="closed" className="bg-zinc-900">Encerradas & Seladas</option>
                  <option value="open" className="bg-zinc-900">Abertas (Em Curso)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table with Vertical Scrollbar */}
          <div className="overflow-x-auto overflow-y-auto max-h-[500px] custom-scrollbar rounded-2xl border border-white/5">
            <table className="w-full text-left text-xs font-mono">
              <thead className="sticky top-0 bg-[#0c0d12] z-10">
                <tr className="text-white/40 border-b border-white/5">
                  <th className="pb-3 pt-3 px-3 font-medium">Horário / Relógio</th>
                  <th className="pb-3 pt-3 px-3 font-medium">Duração (TimeGate)</th>
                  <th className="pb-3 pt-3 px-3 font-medium">Código Espelhado / ID</th>
                  <th className="pb-3 pt-3 px-3 font-medium">Conta / Robô</th>
                  <th className="pb-3 pt-3 px-3 font-medium">Ativo / TF</th>
                  <th className="pb-3 pt-3 px-3 font-medium">Tipo</th>
                  <th className="pb-3 pt-3 px-3 font-medium">Entrada</th>
                  <th className="pb-3 pt-3 px-3 font-medium">Saída</th>
                  <th className="pb-3 pt-3 px-3 font-medium">Lucro / PnL Auditado</th>
                  <th className="pb-3 pt-3 px-3 font-medium">Status / Selo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredTrades.map((t, idx) => {
                  const isLong = t.direction === 'LONG';
                  const isClosed = t.status === 'closed';
                  const isProfit = t.pnl >= 0;
                  const isBrl = t.symbol.includes('BRL');
                  const currSym = isBrl ? 'R$' : '$';
                  const auditCode = t.auditCode || `AUD-${(t.timeframe || '15M').toUpperCase()}-${t.id.slice(-6).toUpperCase()}`;

                  // Duration calculation
                  let durationSec = t.durationSeconds;
                  if (!durationSec && t.entryTime && (t.closeTime || t.exitTime)) {
                    const start = new Date(t.entryTime).getTime();
                    const end = new Date(t.closeTime || t.exitTime || '').getTime();
                    if (!isNaN(start) && !isNaN(end) && end >= start) {
                      durationSec = Math.round((end - start) / 1000);
                    }
                  }

                  return (
                    <tr key={`${t.id}-${idx}`} className="hover:bg-white/5 transition">
                      <td className="py-3.5 px-3 text-white/40 text-[11px]">
                        <div className="font-mono text-white/80">{new Date(t.entryTime).toLocaleTimeString('pt-BR')}</div>
                        <div className="text-[9px] text-white/40">{new Date(t.entryTime).toLocaleDateString('pt-BR')}</div>
                      </td>
                      <td className="py-3.5 px-3 text-white/70">
                        {isClosed ? (
                          <span className="px-2 py-0.5 rounded bg-zinc-800 text-amber-300 border border-amber-500/20 text-[10px] flex items-center gap-1 w-fit">
                            <Timer className="w-3 h-3 text-amber-400" />
                            {formatDurationDisplay(durationSec)}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 text-[10px] flex items-center gap-1 w-fit animate-pulse">
                            <Clock className="w-3 h-3 text-cyan-400" />
                            Em curso
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="px-2 py-0.5 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold block w-fit">
                          {auditCode}
                        </span>
                        {t.auditHash && (
                          <span className="text-[9px] text-white/30 truncate block max-w-[120px] font-mono mt-0.5" title={t.auditHash}>
                            Hash: {t.auditHash.substring(0, 10)}...
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="text-white font-bold block">{t.botName || t.accountName}</span>
                        <span className="text-[10px] text-white/40 uppercase">{t.broker}</span>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="font-bold text-white block">{t.symbol}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-white/60">
                          {t.timeframe || '15m'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
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
                      <td className="py-3.5 px-3 text-white/80">{currSym} {t.entryPrice.toFixed(2)}</td>
                      <td className="py-3.5 px-3 text-white/80">
                        {isClosed ? `${currSym} ${t.currentPrice.toFixed(2)}` : '—'}
                      </td>
                      <td className="py-3.5 px-3 font-bold">
                        {isClosed ? (
                          <span className={isProfit ? 'text-emerald-400' : 'text-rose-400'}>
                            {isProfit ? '+' : ''}
                            {t.pnlPercent.toFixed(2)}% ({currSym} {t.pnl.toFixed(2)})
                          </span>
                        ) : (
                          <div className="flex items-center gap-1 text-amber-300/80 text-[11px]">
                            <Lock className="w-3 h-3 text-amber-400" />
                            <span>Oculto em Curso</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-3">
                        {isClosed ? (
                          <span className="text-emerald-400 flex items-center gap-1 text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20 w-fit">
                            <ShieldCheck className="w-3.5 h-3.5" /> Selado
                          </span>
                        ) : (
                          <span className="text-cyan-400 flex items-center gap-1 text-[11px] animate-pulse bg-cyan-500/10 px-2 py-0.5 rounded-lg border border-cyan-500/20 w-fit">
                            Aberta (Auditando)
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
        /* Audit Logs Tab with Scrollbar */
        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              Auditoria de Eventos do Servidor & Banco de Dados
            </h3>
            <span className="text-white/40 text-xs">Exibindo últimas {logs.length} entradas</span>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
            {logs.map((log, idx) => (
              <div
                key={`${log.id}-${idx}`}
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
