import { Ticker } from '../types';
import { ArrowUpRight, ArrowDownRight, Radio } from 'lucide-react';

interface TickerBarProps {
  tickers: Record<string, Ticker>;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

export function TickerBar({ tickers, selectedSymbol, onSelectSymbol }: TickerBarProps) {
  const tickerList = Object.values(tickers);

  return (
    <div className="bg-zinc-900/30 border-b border-white/5 py-2.5 px-4 text-xs overflow-x-auto scrollbar-none flex items-center justify-between gap-6">
      <div className="flex items-center gap-2 text-white/50 shrink-0 font-mono text-[11px] uppercase tracking-widest">
        <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
        <span className="text-cyan-400 font-bold">Cotações ao Vivo:</span>
      </div>

      <div className="flex items-center gap-3 overflow-x-auto scrollbar-none py-0.5">
        {tickerList.map((ticker) => {
          const isSelected = selectedSymbol === ticker.symbol;
          const isPositive = ticker.change24h >= 0;

          return (
            <button
              key={ticker.symbol}
              onClick={() => onSelectSymbol(ticker.symbol)}
              className={`flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border transition cursor-pointer font-mono text-xs ${
                isSelected
                  ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                  : 'bg-black/40 border-white/5 text-white/70 hover:border-white/20 hover:text-white'
              }`}
            >
              <span className="font-semibold text-white">{ticker.symbol}</span>
              <span className="font-bold">
                {ticker.symbol.includes('BRL') ? 'R$' : '$'}{' '}
                {ticker.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>

              <span
                className={`flex items-center text-[11px] font-medium ${
                  isPositive ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {isPositive ? '+' : ''}
                {ticker.change24h.toFixed(2)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
