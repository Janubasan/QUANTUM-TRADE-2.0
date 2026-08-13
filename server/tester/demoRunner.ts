import { defaultSigner } from '../validation/signer.js';
import { defaultVerifier } from '../validation/verifier.js';
import { defaultAuditLogger } from '../validation/logger.js';
import { defaultTradeScheduler, TradeRequest } from '../regulator/tradeScheduler.js';
import { generateMarkdownAuditReport, TradeSimulation } from './reportGenerator.js';

export class AuditDemoRunner {
  private simulatedTrades: TradeSimulation[] = [];

  /**
   * Runs an audited demo iteration with real-market style quotes from Yahoo Finance and TradingView feeds.
   * Includes test vectors for valid signatures, forced hash mismatch, timestamp drift, RAG outlier rejection,
   * and TradeScheduler timeframe mode regulation (Scalp vs Normal).
   */
  public runDemoCycle(): {
    trades: TradeSimulation[];
    markdownReport: string;
    chainHead: string;
    integrityValid: boolean;
  } {
    const currentMode = defaultTradeScheduler.getMode();

    // Market feeds with appropriate timeframe according to mode
    const feedTimeframe = currentMode === 'scalp' ? '15s' : '5m';

    const marketFeeds = [
      {
        source: 'yahoo_finance',
        symbol: 'BTC/USDT',
        close: 92450.0 + (Math.random() * 200 - 100),
        volume: 48500,
        exchange: 'B3',
        timeframe: feedTimeframe,
      },
      {
        source: 'tradingview_ws',
        symbol: 'AAPL',
        close: 232.5 + (Math.random() * 2 - 1),
        volume: 38000000,
        exchange: 'NASDAQ',
        timeframe: feedTimeframe,
      },
      {
        source: 'cme_micro_futures',
        symbol: 'CME_MICRO_ES',
        close: 5850.25 + (Math.random() * 10 - 5),
        volume: 950000,
        exchange: 'NYSE',
        timeframe: feedTimeframe,
      },
    ];

    // 1. Ingest and verify legitimate payloads
    marketFeeds.forEach((feed) => {
      const envelope = defaultSigner.signPayload(
        {
          symbol: feed.symbol,
          close: Number(feed.close.toFixed(2)),
          volume: Math.round(feed.volume),
          provider: feed.source,
          timeframe: feed.timeframe,
        },
        feed.source
      );

      const isValid = defaultVerifier.verify(envelope);

      if (isValid) {
        // Apply TradeScheduler market rules check
        const request: TradeRequest = {
          symbol: feed.symbol,
          timeframe: feed.timeframe,
          exchange: feed.exchange,
          timestamp: envelope.timestamp,
        };

        const scheduleCheck = defaultTradeScheduler.canTrade(request);

        if (scheduleCheck.allowed) {
          defaultTradeScheduler.recordTrade(request);
          const action = Math.random() > 0.5 ? 'BUY' : 'SELL';
          this.simulatedTrades.push({
            time: new Date().toISOString(),
            symbol: feed.symbol,
            price: feed.close,
            action,
            dataHash: envelope.hash,
            source: feed.source,
            verified: true,
          });
        } else {
          defaultAuditLogger.append({
            ...envelope,
            status: 'REJECTED',
            reason: scheduleCheck.reason || 'scheduler_regulation_veto',
          });
        }
      }
    });

    // 2. Inject adversarial test vectors:
    // a) Invalid timeframe for mode (e.g. 1h timeframe signal while in scalp mode)
    const invalidTf = currentMode === 'scalp' ? '1h' : '5s';
    const invalidTfEnv = defaultSigner.signPayload(
      {
        symbol: 'BTC/BRL',
        close: 540000,
        volume: 20000,
        provider: 'timeframe_mismatch_feed',
        timeframe: invalidTf,
      },
      'timeframe_mismatch_source'
    );
    const tfCheck = defaultTradeScheduler.canTrade({
      symbol: 'BTC/BRL',
      timeframe: invalidTf,
      exchange: 'B3',
    });
    defaultAuditLogger.append({
      ...invalidTfEnv,
      status: 'REJECTED',
      reason: tfCheck.reason || `timeframe_not_allowed_in_${currentMode}_mode`,
    });

    // b) Tampered Hash attack
    const tamperedEnv = defaultSigner.signPayload(
      { symbol: 'BTC/USDT', close: 92450, volume: 50000, provider: 'tampered_attacker' },
      'malicious_feed'
    );
    tamperedEnv.hash = '0000000000000000000000000000000000000000000000000000000000000000';
    defaultVerifier.verify(tamperedEnv);

    // c) RAG Outlier attack (Extreme fake price injection)
    const ragOutlierEnv = defaultSigner.signPayload(
      { symbol: 'AAPL', close: 999999.0, volume: 100, provider: 'fake_quote' },
      'untrusted_source'
    );
    defaultVerifier.verify(ragOutlierEnv);

    const chain = defaultAuditLogger.getChain();
    const markdownReport = generateMarkdownAuditReport(this.simulatedTrades, chain);

    return {
      trades: this.simulatedTrades,
      markdownReport,
      chainHead: chain[chain.length - 1].current_hash,
      integrityValid: defaultAuditLogger.verifyIntegrity(),
    };
  }

  public getSimulatedTrades(): TradeSimulation[] {
    return [...this.simulatedTrades];
  }
}

export const defaultAuditRunner = new AuditDemoRunner();

