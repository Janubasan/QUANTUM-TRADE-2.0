import React, { useState } from 'react';
import { Bot, Account, StrategyId } from '../types';
import { createBot, toggleBot, deleteBot, toggleAllBots } from '../services/api';
import { PriceAggregatorAndRankingsCard } from './PriceAggregatorAndRankingsCard';
import { KillSwitchGuardCard } from './KillSwitchGuardCard';
import { Runner247FirebaseCard } from './Runner247FirebaseCard';
import { OperationalGuardCard } from './OperationalGuardCard';
import {
  Bot as BotIcon,
  Plus,
  Play,
  Pause,
  Trash2,
  Terminal,
  Activity,
  Cpu,
  X,
  CheckCircle,
} from 'lucide-react';

interface BotsViewProps {
  bots: Bot[];
  accounts: Account[];
  logs: { timestamp: string; message: string; type: string }[];
  onRefreshData: () => void;
}

export function BotsView({ bots, accounts, logs, onRefreshData }: BotsViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [strategy, setStrategy] = useState<StrategyId>('m1_pro');
  const [symbol, setSymbol] = useState('BTC/BRL');
  const [timeframe, setTimeframe] = useState('5m');
  const [riskPercent, setRiskPercent] = useState<number>(0.5);
  const [tpRatio, setTpRatio] = useState<number>(2.0);
  const [slRatio, setSlRatio] = useState<number>(1.0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTogglingAll, setIsTogglingAll] = useState(false);

  const strategyNames: Record<StrategyId, { name: string; desc: string }> = {
    m1_pro: { name: 'M1 Pro Scalper Setup', desc: 'Scalping de alta frequência em M1 com RSI (28/72) e Média Exponencial' },
    quant_orb_15m: { name: 'Quant-Bot (ORB 15m & Monte Carlo)', desc: 'Agente Quantitativo ORB 15m CME Micro Futures com Simulador Monte Carlo (500 runs) e análise Prop Firm' },
    orb_agentic_enhanced: { name: 'ORB Agentic Enhanced (Intraday Momentum)', desc: 'Filtros Agenticos: ATR < 1.5x, Volume > 1.5x, Retest no VWAP, Internal Candle Bias e Red-Team Risk Gate' },
    multi_agent_regime_desk: { name: 'Multi-Agent Regime Desk (Desk Autônomo)', desc: 'Desk com Supervisor, Analistas, Debate Bull/Bear, Alternância de Regime (Mean-Reversion x Trend) e Veto Hard de Risco' },
    kronos_grid: { name: 'Kronos Volatility Grid', desc: 'Grade dinâmica de ordens configurável com base em bandas de volatilidade' },
    quantum_entanglement: { name: 'Quantum Entanglement Arbitrage', desc: 'Arbitragem de divergência de correlação quântica entre pares (BTC/ETH/SOL)' },
    macd_cross: { name: 'MACD Trend Follower', desc: 'Seguidor de tendência por cruzamento de histograma MACD' },
  };

  const handleToggleAll = async (running: boolean) => {
    setIsTogglingAll(true);
    try {
      await toggleAllBots(running);
      onRefreshData();
    } catch (err) {
      console.error(err);
    } finally {
      setIsTogglingAll(false);
    }
  };

  const handleCreateBot = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await createBot({
        accountId,
        name: name || `Bot ${strategy.toUpperCase()}`,
        strategy,
        symbol,
        timeframe,
        riskPercent,
        tpRatio,
        slRatio,
      });
      setIsModalOpen(false);
      setName('');
      onRefreshData();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleBot = async (id: string) => {
    try {
      await toggleBot(id);
      onRefreshData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteBot = async (id: string) => {
    if (confirm('Tem certeza que deseja apagar este bot?')) {
      try {
        await deleteBot(id);
        onRefreshData();
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* 24/7 Autonomous Runner & Firebase Firestore Cloud Persistence */}
      <Runner247FirebaseCard onRefresh={onRefreshData} />

      {/* OperationalGuard Compliance & National Brokerage Safeguards */}
      <OperationalGuardCard onRefresh={onRefreshData} />

      {/* Kill Switch Global & Controlos de Risco Realista */}
      <KillSwitchGuardCard onStatusChange={onRefreshData} />

      {/* Header Bar with Global On/Off Master Switch */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
            <Cpu className="w-5 h-5 text-cyan-400" />
            Sistema Multi-Bot Autônomo
          </h2>
          <p className="text-xs text-white/40 mt-1">
            Bots de trading agênticos operando 24/7 sob controle rigoroso da Regra do Lucro Stockraft.
          </p>
        </div>

        {/* Global Master Switch */}
        <div className="flex flex-wrap items-center gap-3 bg-black/60 border border-white/10 rounded-2xl p-2.5 font-mono text-xs">
          <span className="text-white/70 text-[11px] px-2 font-bold uppercase tracking-wider">
            Controle Geral: <span className="text-cyan-400">{bots.filter(b => b.status === 'running').length}/{bots.length} Ativos</span>
          </span>
          <button
            onClick={() => handleToggleAll(true)}
            disabled={isTogglingAll}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" /> Ligar Todos
          </button>
          <button
            onClick={() => handleToggleAll(false)}
            disabled={isTogglingAll}
            className="px-3.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <Pause className="w-3.5 h-3.5" /> Desligar Todos
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(6,182,212,0.4)] transition ml-2"
          >
            <Plus className="w-4 h-4" /> Novo Bot
          </button>
        </div>
      </div>

      {/* Bots Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {bots.map((bot) => {
          const isRunning = bot.status === 'running';
          const stratInfo = strategyNames[bot.strategy] || strategyNames.m1_pro;

          return (
            <div
              key={bot.id}
              className={`bg-zinc-900/30 border rounded-3xl p-6 shadow-2xl flex flex-col justify-between transition ${
                isRunning ? 'border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.05)]' : 'border-white/5 opacity-80'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                      {bot.config.symbol} • {bot.config.timeframe}
                    </span>
                    <h3 className="text-lg font-bold text-white mt-2 tracking-tight">{bot.name}</h3>
                  </div>

                  {/* Status Toggle Switch */}
                  <button
                    onClick={() => handleToggleBot(bot.id)}
                    className={`px-3.5 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition ${
                      isRunning
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {isRunning ? 'LIGADO' : 'PAUSADO'}
                  </button>
                </div>

                <p className="text-xs text-white/50 mt-2 line-clamp-2">{stratInfo.desc}</p>

                {/* Metrics */}
                <div className="mt-5 pt-4 border-t border-white/5 space-y-2.5 font-mono text-xs">
                  <div className="flex justify-between text-white/40">
                    <span>Conta:</span>
                    <span className="text-white/80">{bot.accountName}</span>
                  </div>
                  <div className="flex justify-between text-white/40">
                    <span>Risco Configurado:</span>
                    <span className="text-cyan-300 font-bold">{bot.config.riskPercent}% por trade</span>
                  </div>
                  <div className="flex justify-between text-white/40">
                    <span>Total Trades Executadas:</span>
                    <span className="text-white/80">{bot.totalTrades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">PnL Acumulado:</span>
                    <span className={`font-bold ${bot.pnlTotal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {bot.pnlTotal >= 0 ? '+' : ''}R$ {bot.pnlTotal.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Audit Last Log */}
                {bot.lastLog && (
                  <div className="mt-4 p-3 rounded-2xl bg-black/40 border border-white/5 text-[11px] font-mono text-white/70 leading-tight flex items-start gap-2">
                    <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                    <span>{bot.lastLog}</span>
                  </div>
                )}
              </div>

              {/* Footer Delete Action */}
              <div className="mt-6 pt-3 border-t border-white/5 flex justify-end">
                <button
                  onClick={() => handleDeleteBot(bot.id)}
                  className="p-2 rounded-full hover:bg-rose-500/20 text-rose-400 transition cursor-pointer"
                  title="Excluir Bot"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Price Aggregator & Bot Ranking Panel */}
      <PriceAggregatorAndRankingsCard onRefreshData={onRefreshData} />

      {/* Real-time Bot Terminal Audit */}
      <div className="bg-black/60 border border-white/5 rounded-3xl p-6 shadow-2xl font-mono text-xs space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-white/5">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            Terminal de Execução do Engine Bot (Auditoria ao Vivo)
          </h3>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin text-white/80">
          {logs.slice(0, 10).map((log, idx) => (
            <div key={idx} className="flex items-start gap-3 text-[11px]">
              <span className="text-white/40 shrink-0">
                [{new Date(log.timestamp).toLocaleTimeString()}]
              </span>
              <span
                className={`font-semibold shrink-0 uppercase px-2 py-0.5 rounded-full text-[9px] ${
                  log.type === 'TRADE'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : log.type === 'RULE'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-cyan-500/20 text-cyan-400'
                }`}
              >
                {log.type}
              </span>
              <span className="text-white/80">{log.message}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quant-Bot Multi-Factor Prop Firm Agentic Simulator Panel */}
      <div className="bg-gradient-to-br from-indigo-950/40 via-zinc-900/60 to-black border border-indigo-500/30 rounded-3xl p-6 shadow-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold">
              Agente Analítico Quantitativo • Ground Truth ORB 15m
            </span>
            <h3 className="text-lg font-bold text-white mt-1 flex items-center gap-2 tracking-tight">
              <Cpu className="w-5 h-5 text-indigo-400" />
              Quant-Bot: Avaliador Agêntico Multi-Fatorial & Monte Carlo
            </h3>
            <p className="text-xs text-white/50">
              Análise quantitativa de Expectativa Matemática (EV), Risco de Ruína e Escalabilidade de Contas Financiadas (Combine / Prop Firms).
            </p>
          </div>
        </div>

        {/* Form Controls */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs">
          <div className="bg-black/50 border border-white/10 rounded-2xl p-3">
            <span className="text-white/40 text-[10px] block">Meta (Target)</span>
            <span className="text-emerald-400 font-bold text-sm">+$6.000</span>
          </div>
          <div className="bg-black/50 border border-white/10 rounded-2xl p-3">
            <span className="text-white/40 text-[10px] block">Max Trailing DD</span>
            <span className="text-rose-400 font-bold text-sm">-$3.000</span>
          </div>
          <div className="bg-black/50 border border-white/10 rounded-2xl p-3">
            <span className="text-white/40 text-[10px] block">Daily Stop Fixo</span>
            <span className="text-amber-400 font-bold text-sm">-$800</span>
          </div>
          <div className="bg-black/50 border border-white/10 rounded-2xl p-3">
            <span className="text-white/40 text-[10px] block">Risco / Trade</span>
            <span className="text-cyan-300 font-bold text-sm">0,40%</span>
          </div>
          <div className="bg-black/50 border border-white/10 rounded-2xl p-3">
            <span className="text-white/40 text-[10px] block">Simulações MC</span>
            <span className="text-indigo-300 font-bold text-sm">500 Runs</span>
          </div>
          <div className="bg-black/50 border border-white/10 rounded-2xl p-3">
            <span className="text-white/40 text-[10px] block">Pass Rate Esperado</span>
            <span className="text-emerald-300 font-bold text-sm">~53,2%</span>
          </div>
        </div>

        {/* Live Multi-Factor Output Box */}
        <div className="bg-black/80 border border-indigo-500/20 rounded-2xl p-5 space-y-4 text-xs font-mono">
          <div className="text-indigo-300 font-bold border-b border-indigo-500/20 pb-2 flex items-center justify-between">
            <span>🎯 1. RECAPITULAÇÃO MÉTRICA</span>
            <span className="text-[10px] text-white/40">CME Micro Futures • ORB 15-min</span>
          </div>
          <p className="text-white/70 leading-relaxed">
            • <strong className="text-white">Estratégia:</strong> Opening-Range Breakout 15m (sem overnight) | Risco: 0,40%/trade | Stop Diário: $800 | Retorno Anual Puro: ~20% (Max DD ~6%).
            <br />
            • <strong className="text-white">Prop Firm TopStep 100K:</strong> Target: +$6.000 | Trailing DD: -$3.000 | Monte Carlo (500 runs): ~53% aprovação real.
          </p>

          <div className="text-cyan-300 font-bold border-b border-cyan-500/20 pb-2 pt-2">
            🔬 2. ANÁLISE MULTI-FATORIAL
          </div>
          <div className="space-y-2 text-white/80">
            <p>
              • <strong className="text-indigo-300">Fator 1 (Restrições):</strong> O Trailing DD de -$3.000 é 2x menor que a meta de +$6.000, exigindo gerenciar o limite dinâmico de perto sem atingir o Daily Loss Limit de -$800.
            </p>
            <p>
              • <strong className="text-indigo-300">Fator 2 (Risco de Ruína):</strong> Com clustering estocástico de perdas, a probabilidade real de aprovação em 500 simulações é de <strong>53%</strong>. O principal risco é a sequência de stops, não a falta de edge estatístico.
            </p>
            <p>
              • <strong className="text-indigo-300">Fator 3 (Sizing):</strong> Manter rigorosamente 0,40% de risco por trade preserva a margem em relação ao Trailing Drawdown, impedindo ruína precoce por alavancagem excessiva.
            </p>
            <p>
              • <strong className="text-indigo-300">Fator 4 (Escalabilidade):</strong> Clonar o sinal em 5 contas simultâneas multiplica o capital, mas mantém correlação de 100% no mesmo evento de mercado.
            </p>
          </div>

          <div className="text-emerald-400 font-bold border-b border-emerald-500/20 pb-2 pt-2">
            📊 3. VEREDITO QUANT
          </div>
          <p className="text-emerald-300 font-semibold leading-relaxed">
            Expectativa Matemática Positiva (EV Esperado: +$3.000/mês por conta aprovada) com taxa de aprovação real de 53%. Recomenda-se manter o risco travado em 0,40% por trade e diversificar horários de disparo para atenuar a correlação entre subs.
          </p>
        </div>
      </div>

      {/* New Bot Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#09090d] border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl relative space-y-4">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 text-white/40 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <BotIcon className="w-5 h-5 text-cyan-400" /> Criar Bot Quântico Autônomo
            </h3>

            <form onSubmit={handleCreateBot} className="space-y-4 text-xs font-mono">
              <div>
                <label className="text-white/50 block mb-1">Nome do Bot</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Bot M1 Scalper Pro"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
                />
              </div>

              <div>
                <label className="text-white/50 block mb-1">Conta de Destino</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id} className="bg-zinc-900">
                      {a.name} ({a.type.toUpperCase()} • R${a.currentBalance.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-white/50 block mb-1">Estratégia</label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as StrategyId)}
                  className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
                >
                  <option value="quant_orb_15m" className="bg-zinc-900">Quant-Bot (ORB 15m & Prop Firm Monte Carlo)</option>
                  <option value="orb_agentic_enhanced" className="bg-zinc-900">ORB Agentic Enhanced (Intraday Momentum)</option>
                  <option value="multi_agent_regime_desk" className="bg-zinc-900">Multi-Agent Regime Desk (Desk Autônomo)</option>
                  <option value="m1_pro" className="bg-zinc-900">M1 Pro Scalper Setup</option>
                  <option value="kronos_grid" className="bg-zinc-900">Kronos Volatility Grid</option>
                  <option value="quantum_entanglement" className="bg-zinc-900">Quantum Entanglement Arbitrage</option>
                  <option value="macd_cross" className="bg-zinc-900">MACD Trend Follower</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/50 block mb-1">Ativo Par</label>
                  <select
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
                  >
                    <option value="BTC/BRL" className="bg-zinc-900">BTC/BRL</option>
                    <option value="ETH/BRL" className="bg-zinc-900">ETH/BRL</option>
                    <option value="SOL/BRL" className="bg-zinc-900">SOL/BRL</option>
                    <option value="BTC/USDT" className="bg-zinc-900">BTC/USDT</option>
                    <option value="ETH/USDT" className="bg-zinc-900">ETH/USDT</option>
                  </select>
                </div>

                <div>
                  <label className="text-white/50 block mb-1">Timeframe</label>
                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
                  >
                    <option value="1m" className="bg-zinc-900">1 Minuto (M1)</option>
                    <option value="5m" className="bg-zinc-900">5 Minutos (M5)</option>
                    <option value="15m" className="bg-zinc-900">15 Minutos (M15)</option>
                    <option value="1h" className="bg-zinc-900">1 Hora (H1)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-white/50 block mb-1">Risco (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={riskPercent}
                    onChange={(e) => setRiskPercent(parseFloat(e.target.value) || 0.5)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl p-2 text-white outline-none focus:border-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="text-white/50 block mb-1">Take Profit</label>
                  <input
                    type="number"
                    step="0.5"
                    value={tpRatio}
                    onChange={(e) => setTpRatio(parseFloat(e.target.value) || 2.0)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl p-2 text-white outline-none focus:border-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="text-white/50 block mb-1">Stop Loss</label>
                  <input
                    type="number"
                    step="0.5"
                    value={slRatio}
                    onChange={(e) => setSlRatio(parseFloat(e.target.value) || 1.0)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl p-2 text-white outline-none focus:border-cyan-500/50"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.4)]"
              >
                <CheckCircle className="w-4 h-4" />
                {isSubmitting ? 'Iniciando Bot...' : 'Ativar Bot Quântico'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
