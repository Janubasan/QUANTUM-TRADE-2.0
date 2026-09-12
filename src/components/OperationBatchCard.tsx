import { useEffect, useState } from 'react';
import { CheckCircle2, Plus, Send, ShieldAlert, Trash2, XCircle } from 'lucide-react';
import type {
  OperationBatchValidationResult,
  OperationCandidate,
  OperationSide,
  Ticker,
} from '../types.js';
import { fetchTickers, validateOperationBatch } from '../services/api.js';

interface OperationRow {
  operation_id: string;
  asset: string;
  side: OperationSide;
  entry_price: string;
  stop_price: string;
  take_profit_price: string;
  notional_usd: string;
}

const initialRows: OperationRow[] = [
  { operation_id: 'op-spy-01', asset: 'SPY', side: 'LONG', entry_price: '', stop_price: '', take_profit_price: '', notional_usd: '2' },
  { operation_id: 'op-qqq-01', asset: 'QQQ', side: 'LONG', entry_price: '', stop_price: '', take_profit_price: '', notional_usd: '2' },
  { operation_id: 'op-btc-01', asset: 'BTC/USDT', side: 'SHORT', entry_price: '', stop_price: '', take_profit_price: '', notional_usd: '2' },
];

const inputClass = 'w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-[11px] text-white outline-none focus:border-cyan-400/60';

function roundPrice(price: number, multiplier: number) {
  return price > 0 ? (price * multiplier).toFixed(price >= 100 ? 2 : 4) : '';
}

export function OperationBatchCard() {
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const [rows, setRows] = useState<OperationRow[]>(initialRows);
  const [result, setResult] = useState<OperationBatchValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTickers().then(setTickers).catch(() => undefined);
  }, []);

  useEffect(() => {
    setRows((current) => current.map((row) => {
      if (row.entry_price) return row;
      const price = tickers[row.asset]?.price || 0;
      if (!price) return row;
      return {
        ...row,
        entry_price: String(price),
        stop_price: roundPrice(price, row.side === 'LONG' ? 0.995 : 1.005),
        take_profit_price: roundPrice(price, row.side === 'LONG' ? 1.01 : 0.99),
      };
    }));
  }, [tickers]);

  const updateRow = (index: number, patch: Partial<OperationRow>) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  const removeRow = (index: number) => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));

  const validate = async () => {
    setLoading(true);
    setError(null);
    try {
      const operations: OperationCandidate[] = rows.map((row) => ({
        operation_id: row.operation_id,
        asset: row.asset,
        side: row.side,
        entry_price: Number(row.entry_price),
        stop_price: Number(row.stop_price),
        take_profit_price: Number(row.take_profit_price),
        notional_usd: Number(row.notional_usd),
        market_price: tickers[row.asset]?.price,
        source: 'WFA_UI_BATCH',
      }));
      setResult(await validateOperationBatch({
        initial_capital_usd: 100,
        max_position_pct: 0.02,
        max_concurrent_positions: 5,
        max_gross_exposure_pct: 0.1,
        max_risk_per_trade_pct: 0.01,
        operations,
      }));
    } catch (err: any) {
      setError(err?.message || 'Falha ao validar o lote.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-3xl border border-white/5 bg-zinc-900/30 p-5 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-cyan-300" />
            <h3 className="text-sm font-bold text-white">Lote de operações válidas</h3>
          </div>
          <p className="text-[11px] text-white/40 mt-1 max-w-2xl">
            Valida várias entradas antes de qualquer envio: no máximo 2% por posição, 5 posições, 10% de exposição e 1% de risco no stop.
          </p>
        </div>
        <span className="text-[10px] font-mono text-white/35 uppercase">sem submit_order</span>
      </div>

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={`${row.operation_id}-${index}`} className="grid grid-cols-2 md:grid-cols-[1.15fr_0.75fr_0.8fr_0.8fr_0.8fr_0.65fr_auto] gap-2 items-end rounded-2xl border border-white/5 bg-black/20 p-2.5">
            <label><span className="text-[9px] text-white/35 uppercase">Ativo</span><input value={row.asset} onChange={(event) => updateRow(index, { asset: event.target.value.toUpperCase() })} className={inputClass} /></label>
            <label><span className="text-[9px] text-white/35 uppercase">Lado</span><select value={row.side} onChange={(event) => updateRow(index, { side: event.target.value as OperationSide })} className={inputClass}><option className="bg-zinc-900">LONG</option><option className="bg-zinc-900">SHORT</option></select></label>
            <label><span className="text-[9px] text-white/35 uppercase">Entrada</span><input type="number" value={row.entry_price} onChange={(event) => updateRow(index, { entry_price: event.target.value })} className={inputClass} /></label>
            <label><span className="text-[9px] text-white/35 uppercase">Stop</span><input type="number" value={row.stop_price} onChange={(event) => updateRow(index, { stop_price: event.target.value })} className={inputClass} /></label>
            <label><span className="text-[9px] text-white/35 uppercase">Alvo</span><input type="number" value={row.take_profit_price} onChange={(event) => updateRow(index, { take_profit_price: event.target.value })} className={inputClass} /></label>
            <label><span className="text-[9px] text-white/35 uppercase">Notional</span><input type="number" min="0" step="0.01" value={row.notional_usd} onChange={(event) => updateRow(index, { notional_usd: event.target.value })} className={inputClass} /></label>
            <button type="button" onClick={() => removeRow(index)} className="h-8 w-8 rounded-lg text-white/35 hover:text-rose-300 hover:bg-rose-500/10 flex items-center justify-center" title="Remover operação"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button type="button" onClick={() => setRows((current) => [...current, { operation_id: `op-${current.length + 1}`, asset: 'SPY', side: 'LONG', entry_price: '', stop_price: '', take_profit_price: '', notional_usd: '2' }])} className="rounded-xl border border-white/10 hover:border-cyan-400/40 px-3 py-2 text-[11px] text-white/65 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Adicionar</button>
        <button type="button" onClick={validate} disabled={loading || rows.length === 0} className="rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 px-4 py-2 text-[11px] font-bold text-slate-950 flex items-center gap-1.5">{loading ? 'Validando…' : 'Validar lote'}</button>
        {result && <span className={`rounded-full border px-2.5 py-1 text-[10px] font-mono font-bold ${result.status === 'VALID_BATCH' ? 'border-emerald-400/30 text-emerald-300 bg-emerald-500/10' : result.status === 'PARTIAL_BATCH' ? 'border-amber-400/30 text-amber-300 bg-amber-500/10' : 'border-rose-400/30 text-rose-300 bg-rose-500/10'}`}>{result.status}</span>}
      </div>

      {error && <div className="mt-3 text-xs text-rose-300 flex items-center gap-2"><ShieldAlert className="w-4 h-4" />{error}</div>}
      {result && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
          <div className="rounded-2xl border border-white/5 bg-black/20 p-3 text-[11px] font-mono text-white/60 space-y-1">
            <p><span className="text-white/35">Batch:</span> {result.batch_id}</p>
            <p><span className="text-white/35">Válidas:</span> {result.accepted_count}</p>
            <p><span className="text-white/35">Rejeitadas:</span> {result.rejected_count}</p>
            <p><span className="text-white/35">Exposição:</span> ${result.accepted_notional_usd.toFixed(2)}</p>
            <p><span className="text-white/35">Risco:</span> ${result.accepted_risk_usd.toFixed(2)}</p>
          </div>
          <div className="space-y-1.5">
            {result.operations.map((operation) => (
              <div key={operation.operation_id} className={`rounded-xl border px-3 py-2 ${operation.status === 'VALID' ? 'border-emerald-400/20 bg-emerald-500/5' : 'border-rose-400/20 bg-rose-500/5'}`}>
                <div className="flex items-start gap-2">
                  {operation.status === 'VALID' ? <CheckCircle2 className="w-4 h-4 text-emerald-300 mt-0.5" /> : <XCircle className="w-4 h-4 text-rose-300 mt-0.5" />}
                  <div className="min-w-0"><p className="text-xs text-white font-mono">{operation.operation_id} · {operation.asset} · {operation.status}</p><p className="text-[10px] text-white/45 mt-0.5">{operation.status === 'VALID' ? `notional $${operation.notional_usd.toFixed(2)} · risco $${operation.risk_usd.toFixed(2)}` : operation.reasons.join(' ')}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
