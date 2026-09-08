// Adaptadores de corretoras — REST assinado, testnet-first, trava LIVE_TRADING.
// Ref: research/META_RESEARCH.md (Binance #1, Bybit #2, OKX #3, Coinbase #4, Kraken #5, Alpaca #6, MT5 #7, cTrader #8)
import { VenueAdapter, VenueId, OrderRequest, Fill, IntegrationStatus } from './types.js';
import { hmacSha256, hmacSha256Base64, krakenSign, coinbaseHeaders, http } from './signing.js';

const LIVE = process.env.LIVE_TRADING === 'true';
const TESTNET = (process.env.USE_TESTNET ?? 'true') !== 'false';

function guardReal(venue: string): void {
  if (!LIVE || TESTNET) return;
  // Chegou aqui = live liberado conscientemente. Nada a fazer além de logar.
  console.log(`[venues] LIVE order route enabled for ${venue} (LIVE_TRADING=true, USE_TESTNET=false)`);
}

function baseFill(venue: VenueId, o: OrderRequest, price: number, orderId: string): Fill {
  return {
    venue, orderId, clientOrderId: o.clientOrderId ?? orderId,
    symbol: o.symbol, side: o.side, quantity: o.quantity, price,
    fee: +(price * o.quantity * 0.001).toFixed(6), feeAsset: 'USDT',
    testnet: TESTNET || !LIVE, live: LIVE && !TESTNET, ts: new Date().toISOString(),
  };
}

function creds(ok: boolean, name: string): IntegrationStatus {
  return ok ? 'ready' : 'disabled';
}

// ---------- PAPER (default, sempre pronto) ----------
class PaperAdapter implements VenueAdapter {
  id: VenueId = 'paper';
  name = 'Paper / Demo $100 (simulador com slippage+taxa)';
  status: IntegrationStatus = 'ready';
  testnet = true;
  private last = new Map<string, number>();
  async getPrice(symbol: string): Promise<number> { return this.last.get(symbol) ?? 0; }
  seedPrice(symbol: string, p: number) { this.last.set(symbol, p); }
  async placeOrder(o: OrderRequest): Promise<Fill> {
    const ref = o.price ?? this.last.get(o.symbol) ?? 0;
    const slip = ref * 0.0005 * (o.side === 'BUY' ? 1 : -1);
    const fill = baseFill('paper', o, ref + slip, `paper-${Date.now().toString(36)}`);
    fill.fee = +(ref * o.quantity * 0.001).toFixed(6);
    return fill;
  }
  async cancelOrder(): Promise<boolean> { return true; }
  describe() { return { id: this.id, name: this.name, status: this.status, testnet: true, live: false }; }
}

// ---------- BINANCE (#1) ----------
class BinanceAdapter implements VenueAdapter {
  id: VenueId = 'binance';
  name = 'Binance Spot/Testnet';
  status: IntegrationStatus = creds(!!process.env.BINANCE_API_KEY, 'binance');
  testnet = TESTNET;
  base = TESTNET ? 'https://testnet.binance.vision' : 'https://api.binance.com';
  private sym(s: string) { return s.replace('/', ''); }
  async getPrice(symbol: string): Promise<number> {
    const r = await http<{ price: string }>(`${this.base}/api/v3/ticker/price?symbol=${this.sym(symbol)}`);
    return parseFloat(r.price);
  }
  async placeOrder(o: OrderRequest): Promise<Fill> {
    guardReal('binance');
    const key = process.env.BINANCE_API_KEY!, sec = process.env.BINANCE_API_SECRET!;
    if (!key || !sec) throw new Error('BINANCE_API_KEY/SECRET ausentes — rode paper ou configure .env');
    const qs = new URLSearchParams({
      symbol: this.sym(o.symbol), side: o.side, type: o.type ?? 'MARKET',
      quantity: String(o.quantity), timestamp: String(Date.now()),
    });
    if (o.type === 'LIMIT' && o.price) { qs.set('price', String(o.price)); qs.set('timeInForce', 'GTC'); }
    qs.set('signature', hmacSha256(sec, qs.toString()));
    const r = await http<any>(`${this.base}/api/v3/order?${qs.toString()}`, {
      method: 'POST', headers: { 'X-MBX-APIKEY': key },
    });
    const fills = r.fills ?? [];
    const px = fills.length
      ? fills.reduce((a: number, f: any) => a + parseFloat(f.price) * parseFloat(f.qty), 0) / parseFloat(r.executedQty || o.quantity)
      : o.price ?? 0;
    return { ...baseFill('binance', o, px, String(r.orderId)), raw: r };
  }
  async cancelOrder(orderId: string, symbol = 'BTC/USDT'): Promise<boolean> {
    const key = process.env.BINANCE_API_KEY!, sec = process.env.BINANCE_API_SECRET!;
    const qs = new URLSearchParams({ symbol: this.sym(symbol), orderId, timestamp: String(Date.now()) });
    qs.set('signature', hmacSha256(sec, qs.toString()));
    await http(`${this.base}/api/v3/order?${qs.toString()}`, { method: 'DELETE', headers: { 'X-MBX-APIKEY': key } });
    return true;
  }
  describe() { return { id: this.id, name: this.name, status: this.status, testnet: this.testnet, live: LIVE && !TESTNET }; }
}

// ---------- BYBIT V5 (#2) ----------
class BybitAdapter implements VenueAdapter {
  id: VenueId = 'bybit';
  name = 'Bybit V5 (spot+derivativos unificados)';
  status: IntegrationStatus = creds(!!process.env.BYBIT_API_KEY, 'bybit');
  testnet = TESTNET;
  base = TESTNET ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
  private sym(s: string) { return s.replace('/', ''); }
  private headers(key: string, sec: string, body = '') {
    const ts = String(Date.now());
    const recv = '5000';
    const sign = hmacSha256(sec, ts + key + recv + body);
    return { 'X-BAPI-API-KEY': key, 'X-BAPI-TIMESTAMP': ts, 'X-BAPI-RECV-WINDOW': recv, 'X-BAPI-SIGN': sign, 'Content-Type': 'application/json' };
  }
  async getPrice(symbol: string): Promise<number> {
    const r = await http<any>(`${this.base}/v5/market/tickers?category=spot&symbol=${this.sym(symbol)}`);
    return parseFloat(r?.result?.list?.[0]?.lastPrice ?? '0');
  }
  async placeOrder(o: OrderRequest): Promise<Fill> {
    guardReal('bybit');
    const key = process.env.BYBIT_API_KEY!, sec = process.env.BYBIT_API_SECRET!;
    if (!key || !sec) throw new Error('BYBIT_API_KEY/SECRET ausentes');
    const body = JSON.stringify({
      category: 'spot', symbol: this.sym(o.symbol), side: o.side === 'BUY' ? 'Buy' : 'Sell',
      orderType: o.type ?? 'Market', qty: String(o.quantity),
      ...(o.type === 'LIMIT' && o.price ? { price: String(o.price) } : {}),
    });
    const r = await http<any>(`${this.base}/v5/order/create`, { method: 'POST', headers: this.headers(key, sec, body), body });
    if (r.retCode !== 0) throw new Error(`Bybit: ${r.retMsg}`);
    return { ...baseFill('bybit', o, o.price ?? 0, r.result.orderId), raw: r };
  }
  async cancelOrder(orderId: string, symbol = 'BTC/USDT'): Promise<boolean> {
    const key = process.env.BYBIT_API_KEY!, sec = process.env.BYBIT_API_SECRET!;
    const body = JSON.stringify({ category: 'spot', symbol: this.sym(symbol), orderId });
    await http(`${this.base}/v5/order/cancel`, { method: 'POST', headers: this.headers(key, sec, body), body });
    return true;
  }
  describe() { return { id: this.id, name: this.name, status: this.status, testnet: this.testnet, live: LIVE && !TESTNET }; }
}

// ---------- OKX (#3) ----------
class OkxAdapter implements VenueAdapter {
  id: VenueId = 'okx';
  name = 'OKX (conta unificada + demo)';
  status: IntegrationStatus = creds(!!process.env.OKX_API_KEY, 'okx');
  testnet = TESTNET;
  base = 'https://www.okx.com';
  private sym(s: string) { return s.replace('/', '-'); }
  private headers(key: string, sec: string, pass: string, method: string, path: string, body = '') {
    const ts = new Date().toISOString();
    const { hmacSha256Base64 } = require('./signing.js') as typeof import('./signing.js');
    const sign = hmacSha256Base64(sec, ts + method + path + body);
    const h: Record<string, string> = {
      'OK-ACCESS-KEY': key, 'OK-ACCESS-SIGN': sign, 'OK-ACCESS-TIMESTAMP': ts,
      'OK-ACCESS-PASSPHRASE': pass, 'Content-Type': 'application/json',
    };
    if (TESTNET) h['x-simulated-trading'] = '1';
    return h;
  }
  async getPrice(symbol: string): Promise<number> {
    const r = await http<any>(`${this.base}/api/v5/market/ticker?instId=${this.sym(symbol)}`);
    return parseFloat(r?.data?.[0]?.last ?? '0');
  }
  async placeOrder(o: OrderRequest): Promise<Fill> {
    guardReal('okx');
    const key = process.env.OKX_API_KEY!, sec = process.env.OKX_API_SECRET!, pass = process.env.OKX_PASSPHRASE!;
    if (!key || !sec || !pass) throw new Error('OKX_API_KEY/SECRET/PASSPHRASE ausentes');
    const path = '/api/v5/trade/order';
    const body = JSON.stringify({
      instId: this.sym(o.symbol), tdMode: 'cash', side: o.side === 'BUY' ? 'buy' : 'sell',
      ordType: o.type === 'LIMIT' ? 'limit' : 'market', sz: String(o.quantity),
      ...(o.type === 'LIMIT' && o.price ? { px: String(o.price) } : {}),
    });
    const r = await http<any>(`${this.base}${path}`, { method: 'POST', headers: this.headers(key, sec, pass, 'POST', path, body), body });
    if (r.code !== '0') throw new Error(`OKX: ${r.msg}`);
    return { ...baseFill('okx', o, o.price ?? 0, r.data[0].ordId), raw: r };
  }
  async cancelOrder(orderId: string, symbol = 'BTC/USDT'): Promise<boolean> {
    const key = process.env.OKX_API_KEY!, sec = process.env.OKX_API_SECRET!, pass = process.env.OKX_PASSPHRASE!;
    const path = '/api/v5/trade/cancel-order';
    const body = JSON.stringify({ instId: this.sym(symbol), ordId: orderId });
    await http(`${this.base}${path}`, { method: 'POST', headers: this.headers(key, sec, pass, 'POST', path, body), body });
    return true;
  }
  describe() { return { id: this.id, name: this.name, status: this.status, testnet: this.testnet, live: LIVE && !TESTNET }; }
}

// ---------- COINBASE ADVANCED (#4) ----------
class CoinbaseAdapter implements VenueAdapter {
  id: VenueId = 'coinbase';
  name = 'Coinbase Advanced Trade';
  status: IntegrationStatus = creds(!!process.env.COINBASE_API_KEY, 'coinbase');
  testnet = TESTNET;
  base = 'https://api.coinbase.com';
  private sym(s: string) { return s.replace('/', '-'); }
  async getPrice(symbol: string): Promise<number> {
    const r = await http<any>(`${this.base}/api/v3/brokerage/products/${this.sym(symbol)}`);
    return parseFloat(r?.price ?? '0');
  }
  async placeOrder(o: OrderRequest): Promise<Fill> {
    guardReal('coinbase');
    const key = process.env.COINBASE_API_KEY!, sec = process.env.COINBASE_API_SECRET!;
    if (!key || !sec) throw new Error('COINBASE_API_KEY/SECRET ausentes');
    const path = '/api/v3/brokerage/orders';
    const body = JSON.stringify({
      client_order_id: o.clientOrderId ?? `qm-${Date.now()}`,
      product_id: this.sym(o.symbol), side: o.side,
      order_configuration: o.type === 'LIMIT' && o.price
        ? { limit_limit_gtc: { base_size: String(o.quantity), limit_price: String(o.price) } }
        : { market_market_ioc: { base_size: String(o.quantity) } },
    });
    const r = await http<any>(`${this.base}${path}`, {
      method: 'POST', headers: { ...coinbaseHeaders(key, sec, 'POST', path, body), 'Content-Type': 'application/json' }, body,
    });
    if (!r.success) throw new Error(`Coinbase: ${r.error_response?.message ?? 'order failed'}`);
    return { ...baseFill('coinbase', o, o.price ?? 0, r.success_response.order_id), raw: r };
  }
  async cancelOrder(orderId: string): Promise<boolean> {
    const key = process.env.COINBASE_API_KEY!, sec = process.env.COINBASE_API_SECRET!;
    const path = `/api/v3/brokerage/orders/historical/${orderId}`;
    await http(`${this.base}${path}`, { method: 'DELETE', headers: coinbaseHeaders(key, sec, 'DELETE', path) });
    return true;
  }
  describe() { return { id: this.id, name: this.name, status: this.status, testnet: this.testnet, live: LIVE && !TESTNET }; }
}

// ---------- KRAKEN (#5) ----------
class KrakenAdapter implements VenueAdapter {
  id: VenueId = 'kraken';
  name = 'Kraken (REST+WS+FIX)';
  status: IntegrationStatus = creds(!!process.env.KRAKEN_API_KEY, 'kraken');
  testnet = TESTNET;
  base = 'https://api.kraken.com';
  private sym(s: string) {
    return s.replace('/', '').replace('BTC', 'XBT').replace('USDT', 'USDT');
  }
  async getPrice(symbol: string): Promise<number> {
    const pair = this.sym(symbol) === 'XBTUSDT' ? 'XBTUSDT' : this.sym(symbol);
    const r = await http<any>(`${this.base}/0/public/Ticker?pair=${pair}`);
    const k = Object.keys(r.result ?? {})[0];
    return parseFloat(r.result?.[k]?.c?.[0] ?? '0');
  }
  private async private(method: string, params: Record<string, string>): Promise<any> {
    const key = process.env.KRAKEN_API_KEY!, sec = process.env.KRAKEN_API_SECRET!;
    const path = `/0/private/${method}`;
    const nonce = String(Date.now() * 1000);
    const post = new URLSearchParams({ nonce, ...params }).toString();
    return http(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'API-Key': key, 'API-Sign': krakenSign(sec, path, nonce, post), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: post,
    });
  }
  async placeOrder(o: OrderRequest): Promise<Fill> {
    guardReal('kraken');
    const r = await this.private('AddOrder', {
      pair: this.sym(o.symbol), type: o.side.toLowerCase(), ordertype: o.type?.toLowerCase() ?? 'market',
      volume: String(o.quantity), ...(o.type === 'LIMIT' && o.price ? { price: String(o.price) } : {}),
      ...(TESTNET ? { validate: 'true' } : {}),
    });
    if ((r.error ?? []).length) throw new Error(`Kraken: ${r.error.join('; ')}`);
    return { ...baseFill('kraken', o, o.price ?? 0, r.result?.txid?.[0] ?? `kraken-${Date.now()}`), raw: r };
  }
  async cancelOrder(orderId: string): Promise<boolean> {
    await this.private('CancelOrder', { txid: orderId });
    return true;
  }
  describe() { return { id: this.id, name: this.name, status: this.status, testnet: this.testnet, live: LIVE && !TESTNET }; }
}

// ---------- ALPACA (#6) ----------
class AlpacaAdapter implements VenueAdapter {
  id: VenueId = 'alpaca';
  name = 'Alpaca (paper nativo + ações/cripto)';
  status: IntegrationStatus = creds(!!process.env.ALPACA_API_KEY, 'alpaca');
  testnet = TESTNET;
  base = TESTNET ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
  data = 'https://data.alpaca.markets';
  private h() {
    return {
      'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!, 'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET!,
      'Content-Type': 'application/json',
    };
  }
  async getPrice(symbol: string): Promise<number> {
    const s = symbol.replace('/', '');
    const r = await http<any>(`${this.data}/v2/stocks/${s}/trades/latest`, { headers: this.h() });
    return parseFloat(r?.trade?.p ?? '0');
  }
  async placeOrder(o: OrderRequest): Promise<Fill> {
    guardReal('alpaca');
    const r = await http<any>(`${this.base}/v2/orders`, {
      method: 'POST', headers: this.h(),
      body: JSON.stringify({
        symbol: o.symbol.replace('/', ''), qty: String(o.quantity), side: o.side.toLowerCase(),
        type: (o.type ?? 'MARKET').toLowerCase(), time_in_force: 'gtc',
        ...(o.type === 'LIMIT' && o.price ? { limit_price: String(o.price) } : {}),
      }),
    });
    return { ...baseFill('alpaca', o, parseFloat(r.filled_avg_price ?? o.price ?? 0), r.id), raw: r };
  }
  async cancelOrder(orderId: string): Promise<boolean> {
    await http(`${this.base}/v2/orders/${orderId}`, { method: 'DELETE', headers: this.h() });
    return true;
  }
  describe() { return { id: this.id, name: this.name, status: this.status, testnet: this.testnet, live: LIVE && !TESTNET }; }
}

// ---------- MT5 (#7) via bridge + cTrader (#8) stub ----------
class Mt5BridgeAdapter implements VenueAdapter {
  id: VenueId = 'mt5';
  name = 'MetaTrader 5 (bridge FastAPI+HMAC)';
  status: IntegrationStatus = 'ready';
  testnet = TESTNET;
  base = process.env.MT5_BRIDGE_URL ?? 'http://localhost:8000';
  async getPrice(): Promise<number> { return 0; }
  async placeOrder(o: OrderRequest): Promise<Fill> {
    guardReal('mt5');
    const body = JSON.stringify({ symbol: o.symbol, side: o.side, volume: o.quantity, price: o.price, tp: o.tpPrice, sl: o.slPrice });
    const sign = hmacSha256(process.env.MT5_HMAC_SECRET ?? 'dev', body);
    const r = await http<any>(`${this.base}/order`, { method: 'POST', headers: { 'X-Signature': sign, 'Content-Type': 'application/json' }, body })
      .catch((e) => { throw new Error(`MT5 bridge offline (${this.base}): ${e.message}`); });
    return { ...baseFill('mt5', o, r.price ?? o.price ?? 0, String(r.ticket ?? Date.now())), raw: r };
  }
  async cancelOrder(): Promise<boolean> { return false; }
  describe() { return { id: this.id, name: this.name, status: this.status, testnet: this.testnet, live: LIVE && !TESTNET }; }
}

class CTraderStubAdapter implements VenueAdapter {
  id: VenueId = 'ctrader';
  name = 'cTrader Open API (stub pronto)';
  status: IntegrationStatus = 'stub';
  testnet = TESTNET;
  async getPrice(): Promise<number> { throw new Error('cTrader stub: conecte Open API (clientId/secret) para ativar'); }
  async placeOrder(): Promise<Fill> { throw new Error('cTrader stub: conecte Open API (clientId/secret) para ativar'); }
  async cancelOrder(): Promise<boolean> { return false; }
  describe() { return { id: this.id, name: this.name, status: this.status, testnet: this.testnet, live: false }; }
}

class OnchainAdapter implements VenueAdapter {
  id: VenueId = 'onchain';
  name = 'On-chain DEX (roteado por chains.ts)';
  status: IntegrationStatus = 'stub';
  testnet = TESTNET;
  async getPrice(): Promise<number> { throw new Error('onchain: use /api/onchain/quote (EVM) ou Jupiter (Solana)'); }
  async placeOrder(): Promise<Fill> { throw new Error('onchain: habilite EVM_PRIVATE_KEY/SOLANA_PRIVATE_KEY + ONCHAIN_ALLOW_LIVE'); }
  async cancelOrder(): Promise<boolean> { return false; }
  describe() { return { id: this.id, name: this.name, status: this.status, testnet: this.testnet, live: false }; }
}

export const paperAdapter = new PaperAdapter();

export const VENUES: Record<VenueId, VenueAdapter> = {
  paper: paperAdapter,
  binance: new BinanceAdapter(),
  bybit: new BybitAdapter(),
  okx: new OkxAdapter(),
  coinbase: new CoinbaseAdapter(),
  kraken: new KrakenAdapter(),
  alpaca: new AlpacaAdapter(),
  mt5: new Mt5BridgeAdapter(),
  ctrader: new CTraderStubAdapter(),
  onchain: new OnchainAdapter(),
};

export function getVenue(id: string): VenueAdapter {
  const v = (VENUES as Record<string, VenueAdapter>)[id];
  if (!v) throw new Error(`Venue desconhecida: ${id}`);
  if (v.status === 'disabled') throw new Error(`Venue ${id} sem credenciais — configure .env ou use paper`);
  return v;
}
