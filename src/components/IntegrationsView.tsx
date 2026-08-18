import { useEffect, useMemo, useState } from 'react';
import {
  Cable,
  Copy,
  RefreshCw,
  Radio,
  ShieldCheck,
  Terminal,
  AlertTriangle,
  Play,
  KeyRound,
  Link2,
} from 'lucide-react';
import {
  fetchIntegrationStatus,
  issueBridgeToken,
  sendVenueTestOrder,
  updateAccountRouting,
} from '../services/api';
import { Account } from '../types';

interface IntegrationsViewProps {
  accounts: Account[];
  onRefreshData: () => void;
}

export function IntegrationsView({ accounts, onRefreshData }: IntegrationsViewProps) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenBox, setTokenBox] = useState<Record<string, string>>({});
  const [testSymbol, setTestSymbol] = useState('EURUSD');
  const [busyId, setBusyId] = useState<string>('');

  const venueAccounts = useMemo(
    () => accounts.filter((a) => a.broker === 'mt5' || a.broker === 'proft'),
    [accounts]
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchIntegrationStatus();
      setStatus(data);
      if (data.bootstrapTokens) {
        setTokenBox((prev) => ({ ...data.bootstrapTokens, ...prev }));
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar integrações');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  const handleIssueToken = async (accountId: string) => {
    setBusyId(accountId);
    try {
      const res = await issueBridgeToken(accountId);
      setTokenBox((prev) => ({ ...prev, [accountId]: res.token }));
      onRefreshData();
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  const handleRouting = async (accountId: string, patch: Record<string, unknown>) => {
    setBusyId(accountId);
    try {
      await updateAccountRouting(accountId, patch);
      onRefreshData();
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  const handleTest = async (accountId: string) => {
    setBusyId(accountId);
    setError(null);
    try {
      await sendVenueTestOrder({ accountId, symbol: testSymbol, direction: 'LONG', quantity: 0.01 });
      onRefreshData();
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Cable className="w-5 h-5 text-cyan-400" />
            Integração Real MT5 + Proft/Profit
          </h2>
          <p className="text-xs text-white/40 mt-1 max-w-3xl">
            Demo auditado no mesmo caminho do live. Sem fill inventado: a ordem fica pendente até o EA ou o agente
            Profit reportar ticket/deal reais.
          </p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2.5 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-white flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar venues
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-5">
          <div className="text-[10px] font-mono text-white/40 uppercase">Live trading</div>
          <div className={`mt-2 font-bold ${status?.liveTradingEnabled ? 'text-amber-300' : 'text-emerald-300'}`}>
            {status?.liveTradingEnabled ? 'HABILITADO NO SERVIDOR' : 'BLOQUEADO (somente demo)'}
          </div>
          <p className="text-[11px] text-white/40 mt-2">ALLOW_LIVE_TRADING precisa ser true para promover conta real.</p>
        </div>
        <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-5">
          <div className="text-[10px] font-mono text-white/40 uppercase">Terminais MT5</div>
          <div className="mt-2 font-bold text-cyan-300">
            {(status?.mt5?.sessions || []).filter((s: any) => s.connected).length} online
          </div>
          <p className="text-[11px] text-white/40 mt-2">EA QuantumTradeBridge.mq5 em polling autenticado.</p>
        </div>
        <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-5">
          <div className="text-[10px] font-mono text-white/40 uppercase">Agentes Proft/Profit</div>
          <div className="mt-2 font-bold text-purple-300">
            {(status?.proft?.sessions || []).filter((s: any) => s.connected).length} online
          </div>
          <p className="text-[11px] text-white/40 mt-2">
            REST {status?.proftRestConfigured ? 'configurado' : 'não configurado'} • ProfitDLL via agente Python.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {venueAccounts.map((acc) => {
          const session = [...(status?.mt5?.sessions || []), ...(status?.proft?.sessions || [])].find(
            (s: any) => s.accountId === acc.id
          );
          const online = Boolean(session?.connected);
          const token = tokenBox[acc.id];
          return (
            <div key={acc.id} className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border border-cyan-500/30 text-cyan-300">
                      {acc.broker}
                    </span>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border border-amber-500/30 text-amber-300">
                      {acc.venueEnvironment || 'demo'}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white mt-2">{acc.name}</h3>
                  <p className="text-[11px] font-mono text-white/40">{acc.id}</p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase flex items-center gap-1.5 ${
                    online
                      ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                      : 'bg-white/5 text-white/50 border border-white/10'
                  }`}
                >
                  <Radio className="w-3 h-3" /> {online ? 'venue online' : 'offline'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="bg-black/40 rounded-xl p-3 border border-white/5">
                  Saldo venue
                  <div className="text-white font-bold mt-1">
                    {acc.liveCurrency || acc.baseCurrency} {(acc.liveBalance ?? acc.currentBalance).toFixed(2)}
                  </div>
                </div>
                <div className="bg-black/40 rounded-xl p-3 border border-white/5">
                  Equity / alavancagem
                  <div className="text-white font-bold mt-1">
                    {(acc.liveEquity ?? acc.currentBalance).toFixed(2)} / {acc.liveLeverage || '—'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleRouting(acc.id, { routeToVenue: !acc.routeToVenue })}
                  className="px-3 py-1.5 rounded-full text-[11px] font-mono border border-white/10 bg-white/5 text-white"
                >
                  Roteamento: {acc.routeToVenue ? 'ON' : 'OFF'}
                </button>
                <button
                  disabled={busyId === acc.id}
                  onClick={() => handleIssueToken(acc.id)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-mono border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 flex items-center gap-1"
                >
                  <KeyRound className="w-3 h-3" /> Novo token
                </button>
                <button
                  disabled={busyId === acc.id}
                  onClick={() => handleTest(acc.id)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-mono border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 flex items-center gap-1"
                >
                  <Play className="w-3 h-3" /> Ordem teste demo
                </button>
              </div>

              {token && (
                <div className="bg-black/50 border border-cyan-500/20 rounded-2xl p-3 text-[11px] font-mono text-cyan-200">
                  <div className="flex items-center justify-between gap-2">
                    <span>Bridge token (guarde agora)</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(token)}
                      className="text-white/70 hover:text-white"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="break-all mt-1">{token}</div>
                </div>
              )}

              <div className="bg-black/40 border border-white/5 rounded-2xl p-3 text-[10px] font-mono text-white/60 whitespace-pre-wrap">
                {acc.broker === 'mt5'
                  ? `MT5 > Experts > QuantumTradeBridge.mq5
InpBaseUrl = ${origin}
InpAccountId = ${acc.id}
InpBridgeToken = ${token || '(emitir token)'}
Ferramentas > Opções > Expert Advisors > permita WebRequest para ${origin}`
                  : `python profit/quantum_trade_profit_agent.py \\
  --hub ${origin} \\
  --account-id ${acc.id} \\
  --token ${token || 'SEU_TOKEN'} \\
  --environment demo`}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" /> Trilha de execução da venue
          </h3>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-white/40">Símbolo teste</span>
            <input
              value={testSymbol}
              onChange={(e) => setTestSymbol(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white"
            />
          </div>
        </div>
        <div className="max-h-[360px] overflow-y-auto space-y-2">
          {(status?.events || []).length === 0 && (
            <p className="text-xs text-white/40 font-mono">Nenhum evento de venue ainda. Conecte o EA/agente e envie um teste.</p>
          )}
          {(status?.events || []).map((ev: any) => (
            <div key={ev.id} className="p-3 rounded-xl bg-black/40 border border-white/5 text-[11px] font-mono">
              <div className="flex justify-between gap-2 text-white/70">
                <span className="text-cyan-300">{ev.venue}:{ev.stage}</span>
                <span>{ev.timestamp}</span>
              </div>
              <div className="text-white mt-1">
                {ev.symbol} • {ev.environment} • {ev.accountId}
              </div>
              <div className="text-white/40 truncate">{ev.hash}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 text-xs text-white/60 space-y-2">
        <div className="flex items-center gap-2 text-white font-bold">
          <Terminal className="w-4 h-4 text-amber-400" /> Como replicar no mundo real
        </div>
        <p>1. Abra uma conta demo na corretora MT5 (MetaQuotes-Demo ou a demo da sua mesa) e anexe o EA.</p>
        <p>2. Para B3/Profit, rode o agente Python com ProfitDLL + chave Nelogica, ou aponte PROFT_API_BASE_URL para o REST da mesa.</p>
        <p>3. Envie ordens de teste até o ticket da corretora aparecer na trilha HMAC/SHA-256.</p>
        <p className="flex items-center gap-1">
          <Link2 className="w-3 h-3" /> 4. Só então defina ALLOW_LIVE_TRADING=true, mude a conta para real e marque allowLiveExecution.
        </p>
      </div>
    </div>
  );
}
