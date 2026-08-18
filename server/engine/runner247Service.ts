import { store } from '../data/store.js';
import { firebaseService } from '../services/firebaseService.js';
import { botWorker } from './botWorker.js';

export interface Runner247Metrics {
  id: string;
  status: 'running' | 'paused' | 'maintenance';
  uptimeSeconds: number;
  totalTicks: number;
  startedAt: string;
  lastHeartbeat: string;
  ticksPerMinute: number;
  activeBotsCount: number;
  openTradesCount: number;
  closedTradesCount: number;
  totalProfitGenerated: number;
  firebaseConnected: boolean;
  lastFirebaseSync: string | null;
  syncCount: number;
  memoryUsageMb: number;
  autoRecoveryCount: number;
}

export class Runner247Service {
  private status: 'running' | 'paused' | 'maintenance' = 'running';
  private startedAt: number = Date.now();
  private totalTicks: number = 0;
  private autoRecoveryCount: number = 0;
  private intervalTimer: NodeJS.Timeout | null = null;
  private firebaseSyncTimer: NodeJS.Timeout | null = null;
  private tickTimestamps: number[] = [];

  constructor() {
    this.start();
  }

  public start() {
    if (this.intervalTimer) return;
    this.status = 'running';
    this.startedAt = Date.now();

    console.log('⚡ [Runner 24/7] Iniciando motor autônomo de execução contínua 24/7 com Firebase sync...');

    // Main 24/7 heartbeat loop every 2.5 seconds
    this.intervalTimer = setInterval(() => {
      if (this.status !== 'running') return;
      this.heartbeat();
    }, 2500);

    // Continuous Firebase Firestore auto-sync loop every 60 seconds (quota-friendly)
    this.firebaseSyncTimer = setInterval(() => {
      if (this.status !== 'running') return;
      this.syncWithFirebase();
    }, 60000);

    store.addLog('INFO', '⚡ Motor 24/7 Runner e sincronizador Firebase ativados com sucesso.');
  }

  public pause() {
    this.status = 'paused';
    store.addLog('INFO', '⏸️ Motor 24/7 Runner pausado manualmente.');
  }

  public resume() {
    this.status = 'running';
    store.addLog('INFO', '▶️ Motor 24/7 Runner retomado com sucesso.');
    this.syncWithFirebase();
  }

  public toggle(): boolean {
    if (this.status === 'running') {
      this.pause();
      return false;
    } else {
      this.resume();
      return true;
    }
  }

  private heartbeat() {
    this.totalTicks += 1;
    const now = Date.now();
    this.tickTimestamps.push(now);

    // Keep only timestamps from the last 60 seconds
    const oneMinAgo = now - 60000;
    this.tickTimestamps = this.tickTimestamps.filter((t) => t >= oneMinAgo);

    // Health check: ensure botWorker is active
    try {
      // Ensure bot worker is alive
      if (this.totalTicks % 10 === 0) {
        // Periodic check
        const state = store.getState();
        const runningBots = state.bots.filter((b) => b.status === 'running');
        if (runningBots.length === 0 && state.bots.length > 0) {
          // Self-heal: keep primary bot running
          state.bots[0].status = 'running';
          this.autoRecoveryCount += 1;
          store.addLog('INFO', `🛡️ [24/7 Runner] Auto-recuperação ativada: Robô ${state.bots[0].name} reativado.`);
        }
      }
    } catch (e: any) {
      console.error('[24/7 Runner Error]:', e);
    }
  }

  public async syncWithFirebase(): Promise<{ success: boolean; error?: string }> {
    const state = store.getState();
    const runnerMetrics = this.getMetrics();

    const result = await firebaseService.syncPlatformState({
      accounts: state.accounts,
      bots: state.bots,
      trades: state.trades,
      runnerStatus: runnerMetrics,
    });

    return result;
  }

  public getMetrics(): Runner247Metrics {
    const state = store.getState();
    const uptimeSeconds = Math.floor((Date.now() - this.startedAt) / 1000);
    const fbStatus = firebaseService.getStatus();

    const openTrades = state.trades.filter((t) => t.status === 'open');
    const closedTrades = state.trades.filter((t) => t.status === 'closed');
    const totalProfit = Number(
      closedTrades.reduce((acc, t) => acc + (t.pnl || 0), 0).toFixed(2)
    );
    const activeBots = state.bots.filter((b) => b.status === 'running').length;

    const memUsage = process.memoryUsage ? Math.round(process.memoryUsage().heapUsed / 1024 / 1024) : 42;

    return {
      id: 'runner-247-primary',
      status: this.status,
      uptimeSeconds,
      totalTicks: this.totalTicks,
      startedAt: new Date(this.startedAt).toISOString(),
      lastHeartbeat: new Date().toISOString(),
      ticksPerMinute: this.tickTimestamps.length,
      activeBotsCount: activeBots,
      openTradesCount: openTrades.length,
      closedTradesCount: closedTrades.length,
      totalProfitGenerated: totalProfit,
      firebaseConnected: fbStatus.initialized,
      lastFirebaseSync: fbStatus.lastSync,
      syncCount: fbStatus.syncCount,
      memoryUsageMb: memUsage,
      autoRecoveryCount: this.autoRecoveryCount,
    };
  }
}

export const runner247Service = new Runner247Service();
