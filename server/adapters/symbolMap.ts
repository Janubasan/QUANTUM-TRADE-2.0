const ALIASES: Record<string, string> = {
  'BTC/USDT': 'BTCUSDT',
  'ETH/USDT': 'ETHUSDT',
  'BTC/USD': 'BTCUSD',
  'ETH/USD': 'ETHUSD',
  'BTC/BRL': 'BTCBRL',
  'ETH/BRL': 'ETHBRL',
  'SOL/BRL': 'SOLBRL',
  'SOL/USDT': 'SOLUSDT',
  'XAU/USD': 'XAUUSD',
  'EUR/USD': 'EURUSD',
  'GBP/USD': 'GBPUSD',
  'USD/JPY': 'USDJPY',
  'USD/BRL': 'USDBRL',
  WIN: 'WIN$',
  'WIN$N': 'WIN$',
  WDO: 'WDO$',
  'WDO$N': 'WDO$',
};

const PROFT_B3: Record<string, string> = {
  WIN: 'WIN$',
  'WIN$': 'WIN$',
  'WIN$N': 'WIN$',
  WDO: 'WDO$',
  'WDO$': 'WDO$',
  'WDO$N': 'WDO$',
  PETR4: 'PETR4',
  VALE3: 'VALE3',
  ITUB4: 'ITUB4',
  BBDC4: 'BBDC4',
  'DOL$': 'WDO$',
  'IND$': 'WIN$',
};

export function toVenueSymbol(symbol: string, venue: 'mt5' | 'proft'): string {
  const raw = (symbol || '').trim().toUpperCase();
  if (venue === 'proft' && PROFT_B3[raw]) return PROFT_B3[raw];
  if (ALIASES[raw]) return ALIASES[raw];
  return raw.replace('/', '');
}

export function fromVenueSymbol(symbol: string): string {
  const raw = (symbol || '').trim().toUpperCase();
  const inverse = Object.entries(ALIASES).find(([, v]) => v === raw);
  if (inverse) return inverse[0];
  if (raw === 'WIN$' || raw === 'WIN$N') return 'WIN$';
  if (raw === 'WDO$' || raw === 'WDO$N') return 'WDO$';
  if (raw.length === 6 && !raw.includes('/')) {
    return `${raw.slice(0, 3)}/${raw.slice(3)}`;
  }
  return raw;
}

export function defaultVolume(symbol: string, quantity: number): number {
  const venue = toVenueSymbol(symbol, 'mt5');
  if (['EURUSD', 'GBPUSD', 'USDJPY', 'USDBRL', 'XAUUSD'].includes(venue)) {
    return Number(Math.max(0.01, quantity).toFixed(2));
  }
  if (venue.startsWith('WIN') || venue.startsWith('WDO')) {
    return Math.max(1, Math.round(quantity || 1));
  }
  if (venue.includes('BTC') || venue.includes('ETH')) {
    return Number(Math.max(0.01, quantity).toFixed(3));
  }
  return Number(Math.max(0.01, quantity).toFixed(2));
}
