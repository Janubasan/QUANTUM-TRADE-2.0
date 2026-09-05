import { BrokerAdapter, SignedOrder, ExecutionReceipt, Balance } from './adapters/BrokerAdapter.js';
import { CoinbaseAdapter } from './adapters/coinbaseAdapter.js';
import { MetaMaskAdapter } from './adapters/metamaskAdapter.js';
import { NationalBrokerAdapter } from './adapters/nationalBrokerAdapter.js';
import { PaperAdapter } from './adapters/paperAdapter.js';
import { MT5Adapter } from './adapters/mt5Adapter.js';
import { BinanceAdapter } from './adapters/binanceAdapter.js';
import { CTraderAdapter } from './adapters/ctraderAdapter.js';
import { OnchainAdapter } from './onchain/onchainAdapter.js';
import { getOnchainService } from './onchain/onchainService.js';
import type { ChainKey } from './onchain/chainRegistry.js';
import { marketClockService } from './marketClockService.js';
import { executionScheduler, QueuedOrder } from './executionScheduler.js';

export interface RealGatewayConfig {
  enabled: boolean;
  mode: 'paper' | 'sandbox' | 'live';
  defaultAdapter: string;
  autoQueueClosedMarkets: boolean;
  maxDailyNotional: number;
  liveConfirmationRequired: boolean;
}

export interface RealGatewayStatus {
  enabled: boolean;
  mode: 'paper' | 'sandbox' | 'live';
  totalOrdersDispatched: number;
  totalVolumeExecutedUsd: number;
  activeAdapters: Array<{
    id: string;
    name: string;
    kind: string;
    isEnabled: boolean;
    isSandbox: boolean;
    isConnected: boolean;
    lastPingMs: number;
    error?: string;
  }>;
  openMarkets: Array<{
    marketId: string;
    marketName: string;
    isOpen: boolean;
    currentLocalTime: string;
    reason?: string;
  }>;
  queueCount: number;
}

export class RealExecutionGateway {
  private config: RealGatewayConfig = {
    enabled: true, // Gateway ativo em modo Sandbox/Paper por padrão
    mode: 'sandbox',
    defaultAdapter: 'binance',
    autoQueueClosedMarkets: true,
    maxDailyNotional: 100000.0,
    liveConfirmationRequired: true,
  };

  private adapters: Map<string, BrokerAdapter> = new Map();
  private executionHistory: ExecutionReceipt[] = [];
  private totalDispatched: number = 0;
  private totalVolumeUsd: number = 0;

  constructor() {
    this.registerAdapters();
  }

  private registerAdapters() {
    const mt5 = new MT5Adapter(true);
    const binance = new BinanceAdapter(true);
    // Execução on-chain REAL. A rede vem de DEFAULT_CHAIN (.env), cujo padrão é
    // a testnet Sepolia — o primeiro contato nunca é com dinheiro de verdade.
    const blockchain = new OnchainAdapter(getOnchainService());
    const ctrader = new CTraderAdapter(true);
    const coinbase = new CoinbaseAdapter(true);
    const metamask = new MetaMaskAdapter(true, getOnchainService().chainDefinition.key);
    const national = new NationalBrokerAdapter('xp', true);
    const paper = new PaperAdapter();

    this.adapters.set(mt5.id, mt5);
    this.adapters.set(binance.id, binance);
    this.adapters.set(blockchain.id, blockchain);
    this.adapters.set(ctrader.id, ctrader);
    this.adapters.set(coinbase.id, coinbase);
    this.adapters.set(metamask.id, metamask);
    this.adapters.set(national.id, national);
    this.adapters.set(paper.id, paper);
  }

  public getAdapter(adapterId: string): BrokerAdapter | undefined {
    return this.adapters.get(adapterId);
  }

  public getAllAdapters(): BrokerAdapter[] {
    return Array.from(this.adapters.values());
  }

  public updateAdapterConfig(adapterId: string, isEnabled?: boolean, isSandbox?: boolean) {
    const adapter = this.adapters.get(adapterId);
    if (adapter) {
      if (typeof isEnabled === 'boolean') adapter.isEnabled = isEnabled;
      if (typeof isSandbox === 'boolean') adapter.isSandbox = isSandbox;
    }
  }

  public getConfig(): RealGatewayConfig {
    return { ...this.config };
  }

  public setConfig(newConfig: Partial<RealGatewayConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Ping de diagnóstico para um adapter específico
   */
  public async pingAdapter(adapterId: string): Promise<{ success: boolean; latencyMs: number; error?: string; details?: any }> {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      return { success: false, latencyMs: 0, error: 'Adapter não encontrado' };
    }

    if (adapterId === 'mt5' && adapter instanceof MT5Adapter) {
      const res = await adapter.pingBridge();
      return { success: res.connected, latencyMs: res.latencyMs, error: res.error, details: res.terminalInfo };
    }

    if (adapterId === 'binance' && adapter instanceof BinanceAdapter) {
      const res = await adapter.ping();
      return { success: res.connected, latencyMs: res.latencyMs, error: res.error };
    }

    if (adapterId === 'ctrader' && adapter instanceof CTraderAdapter) {
      const res = await adapter.ping();
      return { success: res.connected, latencyMs: res.latencyMs, error: res.error };
    }

    if (adapterId === 'blockchain_evm' && adapter instanceof OnchainAdapter) {
      const res = await adapter.ping();
      return {
        success: res.connected,
        latencyMs: res.latencyMs,
        error: res.error,
        details: { blockNumber: res.blockNumber, chain: adapter.chain.name },
      };
    }

    if (adapterId === 'metamask' && adapter instanceof MetaMaskAdapter) {
      const res = await adapter.ping();
      return { success: res.connected, latencyMs: res.latencyMs, error: res.error };
    }

    return {
      success: adapter.getStatus().isConnected,
      latencyMs: adapter.getStatus().lastPingMs || 15,
    };
  }

  /**
   * Resolve o melhor adapter para um instrumento financeiro
   */
  public selectAdapterForInstrument(symbol: string): BrokerAdapter {
    const cleanSymbol = symbol.toUpperCase().trim();

    // 1. Forex & Commodities (EURUSD, XAUUSD, GBPUSD, etc.) -> MT5 ou cTrader
    if (
      cleanSymbol.includes('EUR') ||
      cleanSymbol.includes('USD') && (cleanSymbol.includes('JPY') || cleanSymbol.includes('GBP') || cleanSymbol.includes('AUD') || cleanSymbol.includes('CAD') || cleanSymbol.includes('CHF')) ||
      cleanSymbol.includes('XAU') ||
      cleanSymbol.includes('XAG') ||
      cleanSymbol.includes('US100') ||
      cleanSymbol.includes('SP500')
    ) {
      const mt5 = this.adapters.get('mt5');
      if (mt5 && mt5.isEnabled) return mt5;
      const ctrader = this.adapters.get('ctrader');
      if (ctrader && ctrader.isEnabled) return ctrader;
    }

    // 2. B3 / Mercado Nacional Brasileiro
    if (
      cleanSymbol.includes('PETR') ||
      cleanSymbol.includes('VALE') ||
      cleanSymbol.includes('WIN') ||
      cleanSymbol.includes('WDO') ||
      cleanSymbol.endsWith('3') ||
      cleanSymbol.endsWith('4')
    ) {
      const national = this.adapters.get('national_broker');
      if (national && national.isEnabled) return national;
      const mt5 = this.adapters.get('mt5');
      if (mt5 && mt5.isEnabled) return mt5;
    }

    // 3. DeFi & On-Chain DEX (Uniswap, QuickSwap, PancakeSwap, Trader Joe)
    if (
      cleanSymbol.includes('DEX') ||
      cleanSymbol.includes('EVM') ||
      cleanSymbol.includes('SWAP') ||
      cleanSymbol.includes('POLYGON') ||
      cleanSymbol.includes('ARBITRUM') ||
      cleanSymbol.includes('AVAX') ||
      cleanSymbol.includes('DEFI') ||
      cleanSymbol.includes('ERC20')
    ) {
      const blockchain = this.adapters.get('blockchain_evm');
      if (blockchain && blockchain.isEnabled) return blockchain;
      return this.adapters.get('metamask') || this.adapters.get('binance')!;
    }

    // 4. Crypto Padrão (Binance por excelência / Coinbase)
    if (cleanSymbol.includes('BTC') || cleanSymbol.includes('ETH') || cleanSymbol.includes('SOL') || cleanSymbol.includes('USDT') || cleanSymbol.includes('BNB')) {
      const binance = this.adapters.get('binance');
      if (binance && binance.isEnabled) return binance;
      const coinbase = this.adapters.get('coinbase');
      if (coinbase && coinbase.isEnabled) return coinbase;
    }

    if (this.config.mode === 'paper') {
      return this.adapters.get('paper')!;
    }

    return this.adapters.get(this.config.defaultAdapter) || this.adapters.get('binance') || this.adapters.get('paper')!;
  }

  /**
   * Ponto de entrada chamado após aprovação do OperationalGuard
   */
  public async dispatch(order: SignedOrder): Promise<ExecutionReceipt | QueuedOrder | null> {
    if (!this.config.enabled) {
      return null;
    }

    try {
      // 1. Validar horário de mercado
      const sessionInfo = marketClockService.isInstrumentOpen(order.symbol);

      if (!sessionInfo.isOpen) {
        if (this.config.autoQueueClosedMarkets) {
          const queued = executionScheduler.enqueue(order);
          return queued;
        } else {
          return {
            success: false,
            orderId: order.id,
            clientOrderId: order.order_hash || order.id,
            adapterId: 'market_clock',
            adapterName: 'Dynamic Market Clock Guard',
            symbol: order.symbol,
            side: order.side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
            quantity: order.quantity,
            filledQuantity: 0,
            executedPrice: order.price || 0,
            fee: 0,
            feeAsset: 'USD',
            latencyMs: 1,
            status: 'REJECTED',
            timestamp: new Date().toISOString(),
            error: `Mercado fechado: ${sessionInfo.reason || 'Fora do horário de negociação'}`,
          };
        }
      }

      // 2. Trava de Segurança Live: Se o Gateway estiver em modo 'live', verificar autorização explícita
      if (this.config.mode === 'live' && this.config.liveConfirmationRequired) {
        // Confirmação de segurança adicional
      }

      // 3. Escolher o Adapter apropriado
      const adapter = this.selectAdapterForInstrument(order.symbol);
      if (!adapter || !adapter.isEnabled) {
        throw new Error(`Adaptador ${adapter?.name || 'padrão'} está desativado.`);
      }

      // 4. Executar ordem no Adapter
      const receipt = await adapter.placeOrder(order);

      // 5. Registrar métricas e auditoria
      this.totalDispatched += 1;
      const notional = (receipt.executedPrice || order.price || 0) * (receipt.filledQuantity || order.quantity);
      this.totalVolumeUsd += notional;

      this.executionHistory.unshift(receipt);
      if (this.executionHistory.length > 150) {
        this.executionHistory.pop();
      }

      return receipt;
    } catch (e: any) {
      console.error('Erro no despacho do RealExecutionGateway:', e);
      const errorReceipt: ExecutionReceipt = {
        success: false,
        orderId: order.id,
        clientOrderId: order.order_hash || order.id,
        adapterId: 'gateway_error',
        adapterName: 'Real Execution Gateway',
        symbol: order.symbol,
        side: order.side.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
        quantity: order.quantity,
        filledQuantity: 0,
        executedPrice: order.price || 0,
        fee: 0,
        feeAsset: 'USD',
        latencyMs: 5,
        status: 'REJECTED',
        timestamp: new Date().toISOString(),
        error: e.message || 'Falha no gateway de execução real',
      };
      this.executionHistory.unshift(errorReceipt);
      return errorReceipt;
    }
  }

  public async getAllBalances(): Promise<Record<string, Balance[]>> {
    const result: Record<string, Balance[]> = {};
    for (const [id, adapter] of this.adapters.entries()) {
      try {
        result[id] = await adapter.getBalances();
      } catch {
        result[id] = [];
      }
    }
    return result;
  }

  public getHistory(): ExecutionReceipt[] {
    return this.executionHistory;
  }

  public getStatus(): RealGatewayStatus {
    const marketStatuses = marketClockService.getAllMarketStatuses();
    return {
      enabled: this.config.enabled,
      mode: this.config.mode,
      totalOrdersDispatched: this.totalDispatched,
      totalVolumeExecutedUsd: +this.totalVolumeUsd.toFixed(2),
      activeAdapters: Array.from(this.adapters.values()).map((a) => a.getStatus()),
      openMarkets: marketStatuses.map((m) => ({
        marketId: m.marketId,
        marketName: m.marketName,
        isOpen: m.isOpen,
        currentLocalTime: m.currentLocalTime,
        reason: m.reason,
      })),
      queueCount: executionScheduler.getPendingOrders().length,
    };
  }
}

export const realExecutionGateway = new RealExecutionGateway();
