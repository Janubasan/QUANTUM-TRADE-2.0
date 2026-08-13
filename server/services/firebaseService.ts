import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { readFileSync } from 'fs';
import path from 'path';
import { Account, Bot, Trade } from '../../src/types.js';

let dbInstance: any = null;
let firebaseInitialized = false;
let lastSyncTimestamp: string | null = null;
let syncCount = 0;
let syncError: string | null = null;

export class FirebaseService {
  private config: any = null;

  constructor() {
    this.init();
  }

  private init() {
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      const raw = readFileSync(configPath, 'utf-8');
      this.config = JSON.parse(raw);

      const app =
        getApps().length === 0 ? initializeApp(this.config) : getApp();
      dbInstance = getFirestore(
        app,
        this.config.firestoreDatabaseId || undefined
      );
      firebaseInitialized = true;
      console.log('🔥 [Firebase] Firestore inicializado com sucesso para projeto:', this.config.projectId);
    } catch (err: any) {
      console.error('⚠️ [Firebase] Erro ao inicializar Firestore:', err.message);
      syncError = err.message;
    }
  }

  public isReady(): boolean {
    return firebaseInitialized && dbInstance !== null;
  }

  public getStatus() {
    return {
      initialized: this.isReady(),
      projectId: this.config?.projectId || 'não configurado',
      databaseId: this.config?.firestoreDatabaseId || '(default)',
      lastSync: lastSyncTimestamp,
      syncCount,
      lastError: syncError,
    };
  }

  /**
   * Sincroniza o estado completo da plataforma (Contas, Bots, Trades e Runner) no Firestore
   */
  public async syncPlatformState(data: {
    accounts: Account[];
    bots: Bot[];
    trades: Trade[];
    runnerStatus: any;
  }): Promise<{ success: boolean; error?: string }> {
    if (!this.isReady()) {
      return { success: false, error: 'Firebase não inicializado' };
    }

    try {
      // 1. Sincroniza Status do Runner 24/7
      const runnerRef = doc(dbInstance, 'runner_status', 'runner-247-primary');
      await setDoc(runnerRef, {
        ...data.runnerStatus,
        lastHeartbeat: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });

      // 2. Sincroniza Contas
      for (const acc of data.accounts) {
        const accRef = doc(dbInstance, 'accounts', acc.id);
        await setDoc(accRef, {
          ...acc,
          updatedAt: new Date().toISOString(),
        });
      }

      // 3. Sincroniza Robôs
      for (const bot of data.bots) {
        const botRef = doc(dbInstance, 'bots', bot.id);
        await setDoc(botRef, {
          ...bot,
          updatedAt: new Date().toISOString(),
        });
      }

      // 4. Sincroniza Trades Recentes (Últimos 30 para performance otimizada)
      const recentTrades = data.trades.slice(0, 30);
      for (const trade of recentTrades) {
        const tradeRef = doc(dbInstance, 'trades', trade.id);
        await setDoc(tradeRef, {
          ...trade,
          syncedAt: new Date().toISOString(),
        });
      }

      lastSyncTimestamp = new Date().toISOString();
      syncCount += 1;
      syncError = null;

      return { success: true };
    } catch (err: any) {
      syncError = err.message || 'Erro ao sincronizar com Firestore';
      console.error('❌ [Firebase Sync Error]:', syncError);
      return { success: false, error: syncError };
    }
  }

  /**
   * Salva um log de execução no Firestore
   */
  public async logEvent(type: string, message: string, details?: any) {
    if (!this.isReady()) return;
    try {
      const logId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const logRef = doc(dbInstance, 'system_logs', logId);
      await setDoc(logRef, {
        id: logId,
        type,
        message,
        timestamp: new Date().toISOString(),
        details: details || {},
      });
    } catch (e) {
      // Non-blocking log failure
    }
  }
}

export const firebaseService = new FirebaseService();
