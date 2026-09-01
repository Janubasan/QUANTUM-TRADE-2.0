import { SignedOrder } from './adapters/BrokerAdapter.js';
import { marketClockService } from './marketClockService.js';

export interface QueuedOrder {
  id: string;
  order: SignedOrder;
  marketId: string;
  enqueuedAt: string;
  targetOpenTime?: string;
  status: 'PENDING_OPEN' | 'CANCELLED' | 'EXPIRED' | 'DISPATCHED';
  attempts: number;
}

export class ExecutionScheduler {
  private queue: QueuedOrder[] = [];
  private maxQueueSize: number = 200;

  public enqueue(order: SignedOrder): QueuedOrder {
    const marketId = marketClockService.getMarketForInstrument(order.symbol);
    const sessionInfo = marketClockService.getMarketStatus(marketId);

    const queued: QueuedOrder = {
      id: `queue-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      order,
      marketId,
      enqueuedAt: new Date().toISOString(),
      targetOpenTime: sessionInfo.nextOpenTime,
      status: 'PENDING_OPEN',
      attempts: 0,
    };

    this.queue.unshift(queued);
    if (this.queue.length > this.maxQueueSize) {
      this.queue.pop();
    }

    return queued;
  }

  public getPendingOrders(): QueuedOrder[] {
    return this.queue.filter((q) => q.status === 'PENDING_OPEN');
  }

  public getAllQueued(): QueuedOrder[] {
    return this.queue;
  }

  public markDispatched(queueId: string) {
    const item = this.queue.find((q) => q.id === queueId);
    if (item) {
      item.status = 'DISPATCHED';
    }
  }

  public cancel(queueId: string): boolean {
    const item = this.queue.find((q) => q.id === queueId);
    if (item && item.status === 'PENDING_OPEN') {
      item.status = 'CANCELLED';
      return true;
    }
    return false;
  }
}

export const executionScheduler = new ExecutionScheduler();
