import { useState, useEffect } from 'react';
import { EntanglementData } from '../types';
import { fetchEntanglementData } from '../services/api';
import {
  BrainCircuit,
  Activity,
  Zap,
  TrendingUp,
  RefreshCw,
  GitCompare,
  Layers,
} from 'lucide-react';

export function EntanglementView() {
  const [data, setData] = useState<EntanglementData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadEntanglement = async () => {
    setLoading(true);
    try {
      const res = await fetchEntanglementData();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntanglement();
  }, []);

  if (loading || !data) {
    return (
      <div className="py-20 text-center font-mono text-xs text-slate-400 flex items-center justify-center gap-2">
        <Activity className="w-5 h-5 text-cyan-400 animate-spin" />
        <span>Processando Matriz de Emaranhamento Quântico e Inteligência Coletiva...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
            <BrainCircuit className="w-5 h-5 text-cyan-400" />
            Inteligência Coletiva & Emaranhamento Quântico
          </h2>
          <p className="text-xs text-white/40 mt-1">
            Rede descentralizada de experiência anonimizada. Correlações estatísticas e arbitragem por divergência de ativos.
          </p>
        </div>

        <button
          onClick={loadEntanglement}
          className="px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white/80 font-mono text-xs flex items-center gap-2 cursor-pointer transition border border-white/5"
        >
          <RefreshCw className="w-3.5 h-3.5 text-cyan-400" /> Atualizar Matriz
        </button>
      </div>

      {/* Overview Metric Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-zinc-900/40 border border-cyan-500/30 rounded-3xl p-6 shadow-2xl">
          <div className="text-xs text-white/40">Taxa de Acerto Coletivo</div>
          <div className="mt-2 font-mono text-3xl font-light tracking-tight text-cyan-300">
            {data.collectiveWinRate}%
          </div>
          <div className="mt-2 text-[11px] text-white/50 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-400" /> Baseado em {data.totalSignalsCollected.toLocaleString()} sinais
          </div>
        </div>

        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl">
          <div className="text-xs text-white/40">Regime Dominante Kronos</div>
          <div className="mt-2 font-mono text-xl font-bold text-emerald-400">
            {data.dominantRegime}
          </div>
          <div className="mt-2 text-[11px] text-white/40">Volatilidade calibrada em tempo real</div>
        </div>

        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl">
          <div className="text-xs text-white/40">Anomalias de Correlação Ativas</div>
          <div className="mt-2 font-mono text-3xl font-light tracking-tight text-indigo-400">
            {data.anomalies.length} Pares Divergentes
          </div>
          <div className="mt-2 text-[11px] text-white/40">Oportunidades de Pair Trading</div>
        </div>
      </div>

      {/* Main Content: Heatmap & Anomalies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Correlation Heatmap Matrix */}
        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl">
          <h3 className="font-bold text-white text-base mb-1 flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Matriz de Correlação Entre Ativos
          </h3>
          <p className="text-xs text-white/40 mb-4">
            Valores próximos de 1.0 representam forte acoplamento de movimento.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-center font-mono text-xs">
              <thead>
                <tr>
                  <th className="p-2 text-left text-white/40">Ativo</th>
                  {data.symbols.map((sym) => (
                    <th key={sym} className="p-2 text-white/80 font-bold">
                      {sym.split('/')[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.symbols.map((rowSym, rIdx) => (
                  <tr key={rowSym} className="border-t border-white/5">
                    <td className="p-2 text-left font-bold text-white/70">
                      {rowSym.split('/')[0]}
                    </td>
                    {data.matrix[rIdx].map((val, cIdx) => {
                      const isDiagonal = rIdx === cIdx;
                      let bg = 'bg-black/30 text-white/40';
                      if (!isDiagonal) {
                        if (val >= 0.85) bg = 'bg-cyan-500/30 text-cyan-200 font-bold';
                        else if (val >= 0.7) bg = 'bg-cyan-500/15 text-cyan-300';
                        else bg = 'bg-black/40 text-white/40';
                      }

                      return (
                        <td key={cIdx} className={`p-2.5 rounded-xl m-0.5 ${bg}`}>
                          {val.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Correlation Anomalies & Pair Trading Signals */}
        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-white text-base mb-1 flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-cyan-400" />
              Sinais de Emaranhamento Quântico (Pair Trading)
            </h3>
            <p className="text-xs text-white/40 mb-4">
              Identifica desvios onde o preço de dois ativos altamente correlacionados divergiu temporariamente.
            </p>

            <div className="space-y-4">
              {data.anomalies.map((anom, idx) => (
                <div
                  key={idx}
                  className="bg-black/40 border border-indigo-500/30 rounded-2xl p-4 shadow-xl space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-sm text-white font-mono">
                      {anom.pair[0]} ↔ {anom.pair[1]}
                    </div>
                    <span className="px-3 py-1 rounded-full text-[10px] uppercase font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono">
                      Confiança {anom.recommendedTrade.confidence}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono text-white/50">
                    <div>
                      Correlação Histórica: <span className="text-white font-bold">{anom.historicalCorrelation}</span>
                    </div>
                    <div>
                      Correlação Atual: <span className="text-rose-400 font-bold">{anom.currentCorrelation}</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs font-mono space-y-1">
                    <div className="text-indigo-300 font-bold flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-cyan-400" /> Recomendação de Convergência Quântica:
                    </div>
                    <div className="text-white/80 pt-1">
                      🟢 LONG: <span className="text-emerald-400 font-bold">{anom.recommendedTrade.longAsset}</span>
                    </div>
                    <div className="text-white/80">
                      🔴 SHORT: <span className="text-rose-400 font-bold">{anom.recommendedTrade.shortAsset}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 text-xs text-white/40 font-mono text-center">
            🔒 Dados totalmente anonimizados para proteção da inteligência coletiva.
          </div>
        </div>
      </div>
    </div>
  );
}
