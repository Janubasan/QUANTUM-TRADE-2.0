import { useState, useEffect } from 'react';
import { WebhookAuditLog, WebhookConfig } from '../types';
import {
  fetchWebhookConfig,
  updateWebhookSecret,
  fetchWebhookAudits,
  sendTestWebhookSignal,
} from '../services/api';
import {
  Webhook,
  Key,
  Copy,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Zap,
  Play,
  Send,
  RefreshCw,
  Sliders,
  Code2,
} from 'lucide-react';

export function WebhookView() {
  const [config, setConfig] = useState<WebhookConfig | null>(null);
  const [audits, setAudits] = useState<WebhookAuditLog[]>([]);
  const [secretInput, setSecretInput] = useState('');
  const [isCopiedUrl, setIsCopiedUrl] = useState(false);
  const [isCopiedTemplate, setIsCopiedTemplate] = useState(false);
  const [isSavingSecret, setIsSavingSecret] = useState(false);
  const [simulating, setSimulating] = useState(false);

  // Simulator Form State
  const [simSymbol, setSimSymbol] = useState('BTC/BRL');
  const [simAction, setSimAction] = useState<'buy' | 'sell'>('buy');
  const [simPrice, setSimPrice] = useState('345200');
  const [simAmount, setSimAmount] = useState('0.005');
  const [simSecret, setSimSecret] = useState('');
  const [simDelaySec, setSimDelaySec] = useState('0');

  const loadData = async () => {
    try {
      const cfg = await fetchWebhookConfig();
      setConfig(cfg);
      setSecretInput(cfg.secret);
      setSimSecret(cfg.secret);

      const auditLogs = await fetchWebhookAudits();
      setAudits(auditLogs);
    } catch (err) {
      console.error('Error loading webhook config/audits:', err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleSaveSecret = async () => {
    if (!secretInput.trim()) return;
    setIsSavingSecret(true);
    try {
      const res = await updateWebhookSecret(secretInput.trim());
      setSecretInput(res.secret);
      setSimSecret(res.secret);
      await loadData();
    } catch (err) {
      console.error('Error updating secret:', err);
    } finally {
      setIsSavingSecret(false);
    }
  };

  const copyToClipboard = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendSimulation = async (overrideParams?: Record<string, any>) => {
    setSimulating(true);
    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const delay = parseInt(overrideParams?.delaySec ?? simDelaySec, 10) || 0;
      const ts = nowSec - delay;

      const payload = {
        secret: overrideParams?.secret ?? simSecret,
        symbol: overrideParams?.symbol ?? simSymbol,
        action: overrideParams?.action ?? simAction,
        amount: parseFloat(overrideParams?.amount ?? simAmount) || 0.005,
        price: parseFloat(overrideParams?.price ?? simPrice) || 345200,
        timestamp: ts,
        order_id: overrideParams?.order_id ?? `SIM_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      };

      await sendTestWebhookSignal(payload);
      await loadData();
    } catch (err) {
      console.error('Error sending simulated webhook:', err);
    } finally {
      setSimulating(false);
    }
  };

  // Metric computations
  const totalAudits = audits.length;
  const executedAudits = audits.filter((a) => a.status === 'EXECUTED').length;
  const staleAudits = audits.filter((a) => a.status === 'REJECTED_STALE').length;
  const slippageAudits = audits.filter((a) => a.status === 'REJECTED_SLIPPAGE').length;
  const authFailedAudits = audits.filter((a) => a.status === 'AUTH_FAILED').length;

  const avgLatencyMs =
    totalAudits > 0
      ? Math.round(audits.reduce((acc, curr) => acc + curr.latencyMs, 0) / totalAudits)
      : 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-cyan-950/40 border border-cyan-500/20 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="p-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-xl">
                <Webhook className="w-6 h-6" />
              </span>
              <h2 className="text-2xl font-black text-white tracking-tight">
                WEBHOOK ENGINE & AUDITORIA DE PRODUÇÃO
              </h2>
            </div>
            <p className="text-sm text-zinc-400 max-w-2xl">
              Engine de alta performance com validação de assinatura HMAC/Secret, eliminação de sinais expirados (
              <span className="text-cyan-400 font-medium">&lt;5s</span>), controle rígido de slippage (
              <span className="text-cyan-400 font-medium">&lt;0.5%</span>) e auditoria completa de execução Demo x Real.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 flex items-center gap-2 text-xs font-semibold cursor-pointer transition"
            >
              <RefreshCw className="w-4 h-4 text-cyan-400" />
              <span>Atualizar Audit Logs</span>
            </button>
          </div>
        </div>
      </div>

      {/* Production Infrastructure Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Processed */}
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-zinc-400">Total de Sinais Auditados</span>
            <Zap className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-white">{totalAudits}</span>
            <span className="text-xs text-emerald-400 font-mono">({executedAudits} executados)</span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Webhook ativo em tempo real
          </p>
        </div>

        {/* Avg Latency */}
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-zinc-400">Latência Média</span>
            <Clock className="w-5 h-5 text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-amber-400">{avgLatencyMs}</span>
            <span className="text-xs text-zinc-400 font-mono">ms</span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            Resposta Webhook em <span className="text-emerald-400 font-mono font-bold">&lt; 200ms</span>
          </p>
        </div>

        {/* Stale Filtered */}
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-zinc-400">Filtro Stale (&gt;5s)</span>
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-rose-400">{staleAudits}</span>
            <span className="text-xs text-zinc-400">sinais bloqueados</span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            Prevenção contra atrasos e ruídos de mercado
          </p>
        </div>

        {/* Slippage Filtered */}
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-zinc-400">Filtro Slippage (&gt;0.5%)</span>
            <Sliders className="w-5 h-5 text-purple-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-purple-400">{slippageAudits}</span>
            <span className="text-xs text-zinc-400">rejeitados</span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            Proteção contra variação severa de preço
          </p>
        </div>
      </div>

      {/* Webhook Endpoint & TradingView Payload Config Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Endpoint & Secret Management */}
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-cyan-400" />
              <h3 className="font-bold text-white text-base">URL do Webhook & Autenticação</h3>
            </div>
            <span className="text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              PROD READY
            </span>
          </div>

          {/* Webhook URL Field */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono">
              Endpoint HTTP POST (TradingView / Webhook)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={config?.webhookUrl || 'Carregando...'}
                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-mono text-cyan-300 outline-none select-all"
              />
              <button
                onClick={() => config && copyToClipboard(config.webhookUrl, setIsCopiedUrl)}
                className="px-3.5 py-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl font-semibold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 transition"
              >
                {isCopiedUrl ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{isCopiedUrl ? 'Copiado!' : 'Copiar URL'}</span>
              </button>
            </div>
          </div>

          {/* Secret Key Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono">
              Chave Secreta HMAC / Secret Key (`secret`)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                placeholder="Insira sua chave secreta..."
                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none focus:border-cyan-500"
              />
              <button
                onClick={handleSaveSecret}
                disabled={isSavingSecret}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 transition disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isSavingSecret ? 'Salvando...' : 'Salvar Secret'}</span>
              </button>
            </div>
            <p className="text-[11px] text-zinc-500">
              Esta chave deve ser informada no payload JSON enviado pelo TradingView para garantir origem segura.
            </p>
          </div>
        </div>

        {/* TradingView Alert Payload Template */}
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-cyan-400" />
              <h3 className="font-bold text-white text-base">Payload de Alertas TradingView (JSON)</h3>
            </div>
            <button
              onClick={() => config && copyToClipboard(config.tradingViewTemplate, setIsCopiedTemplate)}
              className="px-3 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-mono flex items-center gap-1 cursor-pointer transition"
            >
              {isCopiedTemplate ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{isCopiedTemplate ? 'Copiado!' : 'Copiar JSON'}</span>
            </button>
          </div>

          <p className="text-xs text-zinc-400">
            Copie o JSON abaixo e cole no campo <span className="text-cyan-300 font-mono">Mensagem / Message</span> do seu Alerta no TradingView:
          </p>

          <pre className="bg-zinc-950 border border-white/10 rounded-xl p-4 text-xs font-mono text-cyan-300 overflow-x-auto leading-relaxed">
            {config?.tradingViewTemplate || '{\n  "secret": "...",\n  "symbol": "{{ticker}}"\n}'}
          </pre>
        </div>
      </div>

      {/* Simulator & Test Webhook Signals Bar */}
      <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Play className="w-5 h-5 text-cyan-400" /> Simulador de Webhook em Tempo Real
            </h3>
            <p className="text-xs text-zinc-400">
              Dispare sinais de teste para testar a engine de auditoria, filtros de atraso e slippage.
            </p>
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleSendSimulation({ delaySec: 0, price: 345200 })}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-semibold hover:bg-emerald-500/20 transition cursor-pointer"
            >
              + Sinal Válido
            </button>
            <button
              onClick={() => handleSendSimulation({ delaySec: 8 })}
              className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30 text-xs font-semibold hover:bg-rose-500/20 transition cursor-pointer"
            >
              + Sinal Expirado (&gt;5s)
            </button>
            <button
              onClick={() => handleSendSimulation({ price: 380000 })}
              className="px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/30 text-xs font-semibold hover:bg-purple-500/20 transition cursor-pointer"
            >
              + Slippage Alto (&gt;0.5%)
            </button>
            <button
              onClick={() => handleSendSimulation({ secret: 'CHAVE_ERRADA' })}
              className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-semibold hover:bg-amber-500/20 transition cursor-pointer"
            >
              + Secret Inválido
            </button>
          </div>
        </div>

        {/* Manual Test Form */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-[10px] font-mono uppercase text-zinc-400">Símbolo</label>
            <input
              type="text"
              value={simSymbol}
              onChange={(e) => setSimSymbol(e.target.value)}
              className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono mt-1"
            />
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase text-zinc-400">Ação</label>
            <select
              value={simAction}
              onChange={(e) => setSimAction(e.target.value as 'buy' | 'sell')}
              className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono mt-1"
            >
              <option value="buy">BUY (Comprar)</option>
              <option value="sell">SELL (Vender)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase text-zinc-400">Preço Sinal</label>
            <input
              type="number"
              value={simPrice}
              onChange={(e) => setSimPrice(e.target.value)}
              className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono mt-1"
            />
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase text-zinc-400">Quantidade</label>
            <input
              type="text"
              value={simAmount}
              onChange={(e) => setSimAmount(e.target.value)}
              className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono mt-1"
            />
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase text-zinc-400">Atraso (Segs)</label>
            <input
              type="number"
              value={simDelaySec}
              onChange={(e) => setSimDelaySec(e.target.value)}
              className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono mt-1"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={() => handleSendSimulation()}
              disabled={simulating}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-1.5 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{simulating ? 'Enviando...' : 'Testar Signal'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Audit Logs Trail Table */}
      <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <h3 className="font-bold text-white text-base">Trilha de Auditoria do Webhook (Audit Trail)</h3>
            <p className="text-xs text-zinc-400">
              Histórico em tempo real de latência, slippage e status de execução Demo x Real.
            </p>
          </div>
          <span className="text-xs font-mono text-zinc-500">{audits.length} registros</span>
        </div>

        {audits.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 space-y-2">
            <Webhook className="w-8 h-8 mx-auto text-zinc-600 animate-pulse" />
            <p className="text-sm font-mono">Nenhum sinal recebido via webhook ainda.</p>
            <p className="text-xs">Use o simulador acima ou configure seu TradingView para começar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-white/10 text-zinc-400 uppercase text-[10px]">
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Order ID</th>
                  <th className="py-3 px-3">Símbolo</th>
                  <th className="py-3 px-3">Ação</th>
                  <th className="py-3 px-3">Preço Sinal</th>
                  <th className="py-3 px-3">Preço Mercado</th>
                  <th className="py-3 px-3">Latência</th>
                  <th className="py-3 px-3">Slippage</th>
                  <th className="py-3 px-3">Conta / Target</th>
                  <th className="py-3 px-3">Detalhes / Detalhe Auditoria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {audits.map((audit) => {
                  let statusBadge = (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit">
                      <CheckCircle2 className="w-3 h-3" /> EXECUTADO
                    </span>
                  );

                  if (audit.status === 'REJECTED_STALE') {
                    statusBadge = (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1 w-fit">
                        <XCircle className="w-3 h-3" /> EXPIRADO (&gt;5s)
                      </span>
                    );
                  } else if (audit.status === 'REJECTED_SLIPPAGE') {
                    statusBadge = (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/30 flex items-center gap-1 w-fit">
                        <AlertTriangle className="w-3 h-3" /> SLIPPAGE HIGH
                      </span>
                    );
                  } else if (audit.status === 'REJECTED_DUPLICATE') {
                    statusBadge = (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-400 border border-white/10 flex items-center gap-1 w-fit">
                        <XCircle className="w-3 h-3" /> DUPLICADO
                      </span>
                    );
                  } else if (audit.status === 'AUTH_FAILED') {
                    statusBadge = (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1 w-fit">
                        <ShieldCheck className="w-3 h-3" /> SECRET ERRO
                      </span>
                    );
                  }

                  return (
                    <tr key={audit.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-3 px-3">{statusBadge}</td>
                      <td className="py-3 px-3 font-mono text-zinc-300 text-[11px]">{audit.orderId}</td>
                      <td className="py-3 px-3 font-bold text-white">{audit.symbol}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`font-bold ${
                            audit.action === 'buy' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {audit.action.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-zinc-300">R$ {audit.signalPrice?.toLocaleString('pt-BR')}</td>
                      <td className="py-3 px-3 text-cyan-300">
                        {audit.marketPrice ? `R$ ${audit.marketPrice?.toLocaleString('pt-BR')}` : 'N/A'}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`font-bold ${
                            audit.latencyMs > 5000 ? 'text-rose-400' : 'text-amber-400'
                          }`}
                        >
                          {audit.latencyMs} ms
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`font-bold ${
                            (audit.slippagePercent || 0) > 0.5 ? 'text-purple-400' : 'text-emerald-400'
                          }`}
                        >
                          {audit.slippagePercent !== undefined ? `${audit.slippagePercent}%` : 'N/A'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-zinc-400">
                        <span className="px-2 py-0.5 bg-zinc-800 rounded text-[10px]">
                          {audit.brokerAccount}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[11px] text-zinc-400 max-w-xs truncate" title={audit.reason}>
                        {audit.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
