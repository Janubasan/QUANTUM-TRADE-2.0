import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  GitBranch,
  LockKeyhole,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import type {
  PromotionChecklistResults,
  ValidationPipelineRequest,
  ValidationPipelineResult,
  ValidationMetrics,
} from '../types.js';
import { promoteLastValidation, runValidationPipeline } from '../services/api.js';
import { OperationBatchCard } from './OperationBatchCard';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function metric(value: number | undefined, suffix = ''): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)}${suffix}`;
}

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ');
}

function statusClass(status: string): string {
  if (status === 'CHAMPION_FOUND' || status === 'APPROVED' || status === 'PASSED_ROBUSTNESS') {
    return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30';
  }
  if (status === 'NO_DATA' || status === 'INVALID_BACKTEST' || status === 'REJECTED' || status === 'NO_VIABLE_STRATEGY') {
    return 'text-rose-300 bg-rose-500/10 border-rose-500/30';
  }
  return 'text-amber-300 bg-amber-500/10 border-amber-500/30';
}

function MetricsGrid({ title, metrics }: { title: string; metrics: ValidationMetrics | null | undefined }) {
  const items = [
    ['Trades', metrics?.n_trades ?? 0, ''],
    ['Win rate', metrics?.win_rate ?? 0, '%'],
    ['Profit factor', metrics?.profit_factor ?? 0, ''],
    ['Sharpe', metrics?.sharpe ?? 0, ''],
    ['Sortino', metrics?.sortino ?? 0, ''],
    ['Max DD', metrics?.max_drawdown ?? 0, '%'],
    ['Retorno', metrics?.total_return ?? 0, '%'],
    ['Custos', (metrics?.fees_total ?? 0) + (metrics?.slippage_total ?? 0), ' USD'],
  ];
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-cyan-300" />
        <h3 className="text-xs uppercase tracking-[0.18em] font-bold text-white/60">{title}</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {items.map(([label, value, suffix]) => (
          <div key={label} className="rounded-2xl border border-white/5 bg-black/30 p-3">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">{label}</p>
            <p className="mt-1 text-sm text-white font-mono font-bold">
              {typeof value === 'number' && label === 'Custos' ? money.format(value) : metric(value as number, suffix as string)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Checklist({ checklist }: { checklist: PromotionChecklistResults }) {
  const labels: Record<string, string> = {
    status_champion_found: 'Campeã encontrada',
    oos_efficiency_ratio: 'Eficiência OOS ≥ 0,5',
    sharpe_out_of_sample: 'Sharpe OOS ≥ 0,8',
    max_drawdown_out_of_sample: 'Drawdown OOS ≤ 25%',
    monte_carlo_worst_drawdown: 'Monte Carlo pior DD ≤ 35%',
    parameter_stability: 'Estabilidade de parâmetros',
    n_trades_out_of_sample: 'Amostra OOS ≥ 30 trades',
    cross_asset_validation: 'Validação cross-asset',
    cost_ratio: 'Custos < 40% do lucro bruto',
    capital_compatibility: 'Compatibilidade Alpaca / USD 100',
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {Object.entries(checklist).map(([key, result]) => (
        <div
          key={key}
          className={`flex items-start gap-2 rounded-2xl border px-3 py-2.5 ${
            result.passed
              ? 'border-emerald-500/20 bg-emerald-500/5'
              : 'border-rose-500/20 bg-rose-500/5'
          }`}
        >
          {result.passed ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-300 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-rose-300 mt-0.5 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-xs text-white/80">{labels[key] || key}</p>
            <p className="text-[10px] text-white/40 mt-0.5 break-words">
              valor: {typeof result.value === 'number' ? result.value.toFixed(3) : result.value}
              {'reason' in result && result.reason ? ` · ${result.reason}` : ''}
              {'justification' in result && result.justification ? ` · ${result.justification}` : ''}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function PipelineStage({
  number,
  icon,
  title,
  description,
  state,
}: {
  number: string;
  icon: ReactNode;
  title: string;
  description: string;
  state: 'idle' | 'running' | 'passed' | 'failed';
}) {
  const stateStyles = {
    idle: 'border-white/10 bg-white/[0.02] text-white/40',
    running: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200',
    passed: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    failed: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  };
  return (
    <div className={`rounded-2xl border p-3 ${stateStyles[state]}`}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-black/30 flex items-center justify-center shrink-0 font-mono text-xs font-bold">
          {state === 'passed' ? <Check className="w-4 h-4" /> : state === 'failed' ? <X className="w-4 h-4" /> : number}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon}
            <p className="text-xs font-bold text-white">{title}</p>
          </div>
          <p className="text-[10px] text-white/45 mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

export function BacktestingView() {
  const [asset, setAsset] = useState('SPY');
  const [validationAssets, setValidationAssets] = useState('QQQ');
  const [timeframe, setTimeframe] = useState('1d');
  const [lookbackDays, setLookbackDays] = useState(1095);
  const [initialCapital, setInitialCapital] = useState(100);
  const [positionPct, setPositionPct] = useState(2);
  const [feeRateBps, setFeeRateBps] = useState(0);
  const [slippageBps, setSlippageBps] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ValidationPipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);

  const request = useMemo<ValidationPipelineRequest>(
    () => ({
      asset,
      validation_assets: validationAssets
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
      timeframe,
      lookback_days: lookbackDays,
      initial_capital: initialCapital,
      position_pct: positionPct / 100,
      fee_rate_bps: feeRateBps,
      slippage_bps: slippageBps,
    }),
    [asset, validationAssets, timeframe, lookbackDays, initialCapital, positionPct, feeRateBps, slippageBps]
  );

  const run = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setResult(await runValidationPipeline(request));
    } catch (err: any) {
      setError(err?.message || 'Não foi possível executar a validação.');
    } finally {
      setLoading(false);
    }
  };

  const promote = async () => {
    setPromoting(true);
    setError(null);
    try {
      const promotion = await promoteLastValidation();
      setResult((previous) => (previous ? { ...previous, promotion } : previous));
    } catch (err: any) {
      setError(err?.message || 'O gate de promoção falhou.');
    } finally {
      setPromoting(false);
    }
  };

  const backtestMetrics = result?.backtest?.metrics_out_of_sample;
  const championMetrics = result?.tournament.champion_metrics_out_of_sample;
  const canPromote = result?.tournament.status === 'CHAMPION_FOUND';

  const fieldClass =
    'w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60 transition';

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-cyan-400/15 bg-gradient-to-br from-cyan-950/20 via-zinc-950/50 to-zinc-900/30 p-5 sm:p-6 shadow-2xl">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-cyan-300 bg-cyan-400/10 border border-cyan-400/20 px-2 py-1 rounded-full">
                WFA / paper gate
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-emerald-300 bg-emerald-400/10 border border-emerald-400/20 px-2 py-1 rounded-full">
                dados reais
              </span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <GitBranch className="w-6 h-6 text-cyan-300" />
              Research funnel: dados → WFA → paper
            </h2>
            <p className="text-sm text-white/50 max-w-2xl mt-2 leading-relaxed">
              O motor não cria candles, não usa look-ahead e não promove uma estratégia só porque ela teve o maior retorno. O portão final consulta a Alpaca PAPER antes de gravar qualquer deployment.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-white/45 rounded-2xl border border-white/5 bg-black/20 px-3 py-2">
            <LockKeyhole className="w-4 h-4 text-emerald-300" />
            AUTO-START: bloqueado até APPROVED
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
          <PipelineStage
            number="01"
            icon={<Database className="w-3.5 h-3.5" />}
            title="Dados históricos"
            description="Yahoo Finance ou Alpaca Market Data, com provider e intervalo auditáveis."
            state={loading ? 'running' : result?.data.bars_by_asset[asset] ? 'passed' : 'idle'}
          />
          <PipelineStage
            number="02"
            icon={<Gauge className="w-3.5 h-3.5" />}
            title="Tournament + WFA"
            description="8 janelas OOS, custos, Monte Carlo determinístico e sensibilidade."
            state={
              loading ? 'running' : result?.tournament.status === 'CHAMPION_FOUND' ? 'passed' : result ? 'failed' : 'idle'
            }
          />
          <PipelineStage
            number="03"
            icon={<ShieldCheck className="w-3.5 h-3.5" />}
            title="Promotion gate"
            description="Checklist binário para PAPER USD 100; LIVE nunca é ativado automaticamente."
            state={
              loading ? 'running' : result?.promotion.decision === 'APPROVED' ? 'passed' : result ? 'failed' : 'idle'
            }
          />
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-5">
        <section className="rounded-3xl border border-white/5 bg-zinc-900/30 p-5 shadow-xl h-fit">
          <div className="flex items-center gap-2 pb-3 border-b border-white/5">
            <SlidersHorizontal className="w-4 h-4 text-cyan-300" />
            <h3 className="text-sm font-bold text-white">Configuração auditável</h3>
          </div>
          <form onSubmit={run} className="space-y-3.5 mt-4">
            <label className="block">
              <span className="field-label">Ativo principal</span>
              <input value={asset} onChange={(event) => setAsset(event.target.value.toUpperCase())} className={fieldClass} placeholder="SPY" />
            </label>
            <label className="block">
              <span className="field-label">Ativos para cross-validation</span>
              <input value={validationAssets} onChange={(event) => setValidationAssets(event.target.value.toUpperCase())} className={fieldClass} placeholder="QQQ, IWM" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="field-label">Timeframe</span>
                <select value={timeframe} onChange={(event) => setTimeframe(event.target.value)} className={fieldClass}>
                  <option value="1d" className="bg-zinc-900">1D</option>
                  <option value="1h" className="bg-zinc-900">1H</option>
                  <option value="15m" className="bg-zinc-900">15M</option>
                  <option value="5m" className="bg-zinc-900">5M</option>
                </select>
              </label>
              <label className="block">
                <span className="field-label">Lookback (dias)</span>
                <input type="number" min="30" max="3650" value={lookbackDays} onChange={(event) => setLookbackDays(Number(event.target.value))} className={fieldClass} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="field-label">Banca inicial</span>
                <input type="number" min="100" max="100" step="1" value={initialCapital} onChange={(event) => setInitialCapital(100)} className={fieldClass} />
              </label>
              <label className="block">
                <span className="field-label">Posição máx. %</span>
                <input type="number" min="0.1" max="2" step="0.1" value={positionPct} onChange={(event) => setPositionPct(Math.min(2, Number(event.target.value)))} className={fieldClass} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="field-label">Taxa (bps)</span>
                <input type="number" min="0" step="0.1" value={feeRateBps} onChange={(event) => setFeeRateBps(Number(event.target.value))} className={fieldClass} />
              </label>
              <label className="block">
                <span className="field-label">Slippage (bps)</span>
                <input type="number" min="0" step="0.1" value={slippageBps} onChange={(event) => setSlippageBps(Number(event.target.value))} className={fieldClass} />
              </label>
            </div>
            <div className="rounded-2xl border border-amber-400/15 bg-amber-400/5 p-3 text-[11px] leading-relaxed text-amber-100/60">
              <div className="flex items-center gap-2 text-amber-200 font-bold mb-1"><AlertTriangle className="w-3.5 h-3.5" /> Sem aprovação implícita</div>
              Sem API keys da Alpaca, o gate permanece REJECTED. Ausência de dados nunca vira dado sintético.
            </div>
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-slate-950 font-bold text-xs uppercase tracking-wider py-3 flex items-center justify-center gap-2 transition">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {loading ? 'Executando 8 janelas…' : 'Rodar validação real'}
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-white/5 bg-zinc-900/30 p-5 shadow-xl min-h-[420px]">
          {!result && !error && (
            <div className="min-h-[380px] flex flex-col items-center justify-center text-center px-5">
              <div className="w-14 h-14 rounded-2xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center mb-4">
                <Sparkles className="w-7 h-7 text-cyan-300" />
              </div>
              <h3 className="text-lg font-bold text-white">Nenhum relatório nesta sessão</h3>
              <p className="text-sm text-white/40 max-w-md mt-2 leading-relaxed">Configure um ativo real e execute o funil. O resultado pode ser NO_VIABLE_STRATEGY — isso é uma saída válida, não um erro.</p>
            </div>
          )}
          {error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200 flex gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <div><p className="font-bold">Falha no pipeline</p><p className="text-xs text-rose-200/70 mt-1">{error}</p></div>
            </div>
          )}
          {result && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-white/5">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white">Relatório {result.pipeline_id}</h3>
                    <span className={`px-2 py-1 rounded-full border text-[10px] font-mono font-bold uppercase ${statusClass(result.status)}`}>{statusLabel(result.status)}</span>
                  </div>
                  <p className="text-xs text-white/40 mt-1 font-mono">{result.data.source} · {result.data.start ? `${new Date(result.data.start).toLocaleDateString('pt-BR')} → ${new Date(result.data.end || result.data.start).toLocaleDateString('pt-BR')}` : 'sem intervalo carregado'}</p>
                </div>
                <div className="text-right text-xs font-mono">
                  <p className="text-white/40">Dados carregados</p>
                  <p className="text-white mt-1">{Object.entries(result.data.bars_by_asset).map(([key, count]) => `${key}: ${count}`).join(' · ') || '0 candles'}</p>
                </div>
              </div>

              <MetricsGrid title="OOS do backtest auditável" metrics={backtestMetrics} />
              <MetricsGrid title="Campeã do tournament" metrics={championMetrics} />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-2xl border border-white/5 bg-black/20 p-3"><p className="text-[10px] text-white/40 uppercase">Candidatas</p><p className="text-lg text-white font-mono font-bold mt-1">{result.tournament.candidates_tested}</p></div>
                <div className="rounded-2xl border border-white/5 bg-black/20 p-3"><p className="text-[10px] text-white/40 uppercase">WFA windows</p><p className="text-lg text-white font-mono font-bold mt-1">{result.backtest?.walk_forward_windows || 0}/8</p></div>
                <div className="rounded-2xl border border-white/5 bg-black/20 p-3"><p className="text-[10px] text-white/40 uppercase">OOS efficiency</p><p className="text-lg text-white font-mono font-bold mt-1">{metric(result.tournament.candidates.find((candidate) => candidate.strategy_id === result.tournament.champion_strategy_id)?.oos_efficiency_ratio || 0)}</p></div>
                <div className="rounded-2xl border border-white/5 bg-black/20 p-3"><p className="text-[10px] text-white/40 uppercase">Monte Carlo DD</p><p className="text-lg text-white font-mono font-bold mt-1">{result.tournament.monte_carlo_ci_95_drawdown ? `${metric(result.tournament.monte_carlo_ci_95_drawdown[1])}%` : '—'}</p></div>
              </div>

              <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-xs uppercase tracking-[0.18em] font-bold text-cyan-200/70">Portfólio sistematizado</p><p className="text-[11px] text-white/45 mt-1">Cada operação OOS abaixo respeita o mesmo contrato de risco do lote e fica auditável no JSON.</p></div>
                  <div className="flex flex-wrap gap-2 text-[10px] font-mono text-white/70"><span className="rounded-full border border-white/10 px-2 py-1">válidas: {result.backtest?.valid_operations || 0}</span><span className="rounded-full border border-white/10 px-2 py-1">simultâneas: {result.portfolio_policy.max_concurrent_positions}</span><span className="rounded-full border border-white/10 px-2 py-1">exposição: {result.portfolio_policy.max_gross_exposure_pct}%</span></div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div><p className="text-xs uppercase tracking-[0.18em] font-bold text-white/60">Promotion gate</p><p className="text-sm text-white mt-1">{result.tournament.champion_strategy_id || 'Nenhuma campeã elegível'}</p></div>
                  <span className={`self-start px-3 py-1.5 rounded-full border text-[10px] font-mono font-bold ${statusClass(result.promotion.decision)}`}>{result.promotion.decision}</span>
                </div>
                <Checklist checklist={result.promotion.checklist_results} />
                {canPromote && result.promotion.decision !== 'APPROVED' && (
                  <button type="button" onClick={promote} disabled={promoting} className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/20 text-amber-200 px-4 py-2 text-xs font-bold flex items-center gap-2 transition disabled:opacity-50">
                    {promoting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Revalidar gate PAPER
                  </button>
                )}
                {result.promotion.reasons.length > 0 && <p className="mt-3 text-[11px] text-white/40 leading-relaxed">{result.promotion.reasons.join(' · ')}</p>}
              </div>

              <div className="rounded-2xl border border-white/5 overflow-hidden">
                <div className="px-4 py-3 bg-white/[0.03] flex items-center justify-between"><p className="text-xs uppercase tracking-[0.18em] font-bold text-white/60">Ranking auditável</p><p className="text-[10px] text-white/30">sem retorno bruto como único critério</p></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-white/30 border-b border-white/5"><tr><th className="px-4 py-2">Estratégia</th><th className="px-4 py-2">Fase</th><th className="px-4 py-2">OOS</th><th className="px-4 py-2">Sharpe</th><th className="px-4 py-2">DD</th><th className="px-4 py-2">Score</th></tr></thead>
                    <tbody>
                      {result.tournament.candidates.slice(0, 12).map((candidate) => <tr key={candidate.strategy_id} className="border-b border-white/5 last:border-0"><td className="px-4 py-2.5 text-white/75 font-mono whitespace-nowrap">{candidate.strategy_id}</td><td className="px-4 py-2.5"><span className={`px-2 py-1 rounded-full border text-[9px] font-bold uppercase ${statusClass(candidate.status)}`}>{statusLabel(candidate.status)}</span></td><td className="px-4 py-2.5 text-white/60 font-mono">{metric(candidate.metrics_out_of_sample.total_return)}%</td><td className="px-4 py-2.5 text-white/60 font-mono">{metric(candidate.metrics_out_of_sample.sharpe)}</td><td className="px-4 py-2.5 text-white/60 font-mono">{metric(candidate.metrics_out_of_sample.max_drawdown)}%</td><td className="px-4 py-2.5 text-cyan-200 font-mono">{candidate.score === undefined ? '—' : metric(candidate.score)}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>

              {result.data.errors.length > 0 && <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-100/70"><Clock3 className="inline w-3.5 h-3.5 mr-2" />{result.data.errors.join(' · ')}</div>}
            </div>
          )}
        </section>
      </div>

      <OperationBatchCard />
    </div>
  );
}
