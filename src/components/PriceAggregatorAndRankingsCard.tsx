import React, { useEffect, useState } from 'react';
import { fetchAllAggregatedPrices, fetchBotRankings, triggerBotEvaluation } from '../services/api';
import { Globe, Trophy, Play, CheckCircle2, ShieldCheck, Zap, AlertTriangle, Cpu } from 'lucide-react';

interface PriceAggregatorAndRankingsProps {
  onRefreshData?: () => void;
}

export function PriceAggregatorAndRankingsCard({ onRefreshData }: PriceAggregatorAndRankingsProps) {
  const [aggregatedPrices, setAggregatedPrices] = useState<Record<string, any>>({});
  const [rankings, setRankings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [evaluatingBotId, setEvaluatingBotId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [pricesData, rankData] = await Promise.all([
        fetchAllAggregatedPrices().catch(() => ({})),
        fetchBotRankings().catch(() => []),
      ]);
      setAggregatedPrices(pricesData || {});
      setRankings(rankData || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleManualTrigger = async (botId: string) => {
    setEvaluatingBotId(botId);
    setActionMessage(null);
    try {
      const res = await triggerBotEvaluation(botId);
      setActionMessage(res.message);
      if (onRefreshData) onRefreshData();
      await loadData();
    } catch (e: any) {
      setActionMessage(`Erro ao disparar bot: ${e.message}`);
    } finally {
      setEvaluatingBotId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Multi-Source Price Aggregator Panel */}
      <div className="bg-zinc-900/40 border border-white/10 rounded-3xl p-6 shadow-2xl backdrop-blur-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-cyan-400" />
              Agregador de Preços Multi-Fonte em Tempo Real
            </h3>
            <p className="text-xs text-white/50">
              Cotações auditadas e validadas cruzando Binance, Yahoo Finance e CoinGecko com descarte de outliers (&lt;2%).
            </p>
          </div>
          <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" /> Dados 100% Autênticos
          </span>
        </div>

        {/* Price Stream Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.keys(aggregatedPrices).length === 0 ? (
            <div className="col-span-full p-4 text-center text-xs font-mono text-white/40">
              Carregando cotações multi-fonte agregadas...
            </div>
          ) : (
            Object.entries(aggregatedPrices).map(([sym, pData]: [string, any]) => (
              <div
                key={sym}
                className="bg-black/50 border border-white/10 rounded-2xl p-4 space-y-2 font-mono text-xs hover:border-cyan-500/40 transition"
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white text-sm">{sym}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                    {pData.sourcesCount || 3} Fontes
                  </span>
                </div>

                <div className="text-xl font-extrabold text-cyan-300">
                  R$ {Number(pData.aggregated).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>

                {/* Sources breakdown */}
                <div className="pt-2 border-t border-white/5 space-y-1 text-[11px] text-white/60">
                  <div className="flex justify-between">
                    <span>Binance WS/REST:</span>
                    <span className="text-white">
                      {pData.binance ? `R$ ${pData.binance.toLocaleString('pt-BR')}` : 'Online'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Yahoo Finance:</span>
                    <span className="text-white">
                      {pData.yahoo ? `R$ ${pData.yahoo.toLocaleString('pt-BR')}` : 'Online'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>CoinGecko / TV:</span>
                    <span className="text-white">
                      {pData.coingecko ? `R$ ${pData.coingecko.toLocaleString('pt-BR')}` : 'Online'}
                    </span>
                  </div>
                </div>

                {pData.outlierFiltered && (
                  <div className="text-[10px] text-amber-400 flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" /> Outliers filtrados com sucesso
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 2. Bot Performance Ranking */}
      <div className="bg-zinc-900/40 border border-white/10 rounded-3xl p-6 shadow-2xl backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              Ranking de Performance dos Robôs Cotados
            </h3>
            <p className="text-xs text-white/50">
              Acompanhamento de PnL acumulado (com impacto no saldo real), Win Rate e Sharpe Ratio.
            </p>
          </div>
        </div>

        {actionMessage && (
          <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono">
            {actionMessage}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="text-white/40 border-b border-white/10 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3"># Pos</th>
                <th className="py-3 px-3">Robô & Estratégia</th>
                <th className="py-3 px-3">Ativo & Timeframe</th>
                <th className="py-3 px-3 text-right">Trades</th>
                <th className="py-3 px-3 text-right">Win Rate</th>
                <th className="py-3 px-3 text-right">PnL Acumulado (R$)</th>
                <th className="py-3 px-3 text-right">Sharpe Ratio</th>
                <th className="py-3 px-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-white/80">
              {rankings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-white/40">
                    Nenhum bot cotado em execução no momento.
                  </td>
                </tr>
              ) : (
                rankings.map((r, i) => (
                  <tr key={r.botId} className="hover:bg-white/5 transition">
                    <td className="py-3 px-3 font-bold text-amber-400">#{i + 1}</td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-white">{r.botName}</div>
                      <div className="text-[10px] text-white/40">{r.strategy}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {r.symbol} • {r.timeframe}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">{r.totalTrades}</td>
                    <td className="py-3 px-3 text-right text-emerald-400 font-bold">
                      {r.winRate}%
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-bold ${
                        r.pnlTotal >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {r.pnlTotal >= 0 ? '+' : ''}R$ {r.pnlTotal.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right text-cyan-300 font-bold">{r.sharpeRatio}</td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => handleManualTrigger(r.botId)}
                        disabled={evaluatingBotId === r.botId}
                        className="px-3 py-1 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[11px] font-bold cursor-pointer transition disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        <Zap className="w-3 h-3 text-cyan-400" /> Disparar Fatia
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
