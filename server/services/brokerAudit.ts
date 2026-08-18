import crypto from 'crypto';
import { defaultAuditLogger } from '../validation/logger.js';
import { defaultSigner } from '../validation/signer.js';
import { BrokerExecutionEvent, VenueEnvironment } from '../../src/types.js';

class BrokerAuditLedger {
  private events: BrokerExecutionEvent[] = [];

  append(params: {
    accountId: string;
    venue: string;
    environment: VenueEnvironment;
    stage: string;
    symbol: string;
    payload: Record<string, unknown>;
  }): BrokerExecutionEvent {
    const payload = {
      ...params.payload,
      accountId: params.accountId,
      venue: params.venue,
      environment: params.environment,
      stage: params.stage,
    };
    const envelope = defaultSigner.signPayload(
      {
        symbol: params.symbol,
        close: Number(params.payload.fillPrice || params.payload.price || 0),
        volume: Number(params.payload.volume || params.payload.quantity || 0),
        provider: `${params.venue}_${params.environment}`,
        stage: params.stage,
        ...payload,
      },
      `VENUE_${params.venue.toUpperCase()}`
    );
    envelope.status = params.stage.includes('reject') || params.stage.includes('fail') ? 'REJECTED' : 'APPROVED';
    envelope.reason = String(params.payload.reason || params.stage);
    defaultAuditLogger.append(envelope);

    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    const event: BrokerExecutionEvent = {
      id: `exec-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      timestamp: new Date().toISOString(),
      accountId: params.accountId,
      venue: params.venue,
      environment: params.environment,
      stage: params.stage,
      symbol: params.symbol,
      payload,
      hash: crypto.createHash('sha256').update(canonical).digest('hex'),
    };
    this.events.unshift(event);
    if (this.events.length > 1000) this.events.pop();
    return event;
  }

  list(limit = 200): BrokerExecutionEvent[] {
    return this.events.slice(0, limit);
  }

  byAccount(accountId: string, limit = 100): BrokerExecutionEvent[] {
    return this.events.filter((e) => e.accountId === accountId).slice(0, limit);
  }
}

export const brokerAudit = new BrokerAuditLedger();
