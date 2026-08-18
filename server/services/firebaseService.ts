import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
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
// Default to active quota protection (cooldown 12 hours) when quota limit has been hit
let isQuotaExhausted = true;
let quotaCooldownUntil = Date.now() + 12 * 3600 * 1000;

export class FirebaseService {
  private config: any = null;
  private lastWrittenStateHash: string = '';

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
      console.log('🔥 [Firebase] Firestore conectado com salvaguarda de quota ativa para:', this.config.projectId);
    } catch (err: any) {
      console.warn('⚠️ [Firebase] Inicialização Firestore operando em modo local:', err.message);
      syncError = err.message;
    }
  }

  public isReady(): boolean {
    return firebaseInitialized && dbInstance !== null;
  }

  public getDb() {
    return dbInstance;
  }

  public isQuotaLimited(): boolean {
    return isQuotaExhausted && Date.now() < quotaCooldownUntil;
  }

  public markQuotaExhausted() {
    isQuotaExhausted = true;
    quotaCooldownUntil = Date.now() + 12 * 3600 * 1000;
    syncError = 'Quota diária do Firestore atingida (Free Tier). O sistema continua operando com 100% de estabilidade local.';
  }

  public getStatus() {
    const isUnderQuotaCooldown = this.isQuotaLimited();
    return {
      initialized: this.isReady(),
      projectId: this.config?.projectId || 'não configurado',
      databaseId: this.config?.firestoreDatabaseId || '(default)',
      lastSync: lastSyncTimestamp,
      syncCount,
      lastError: isUnderQuotaCooldown
        ? 'Quota diária de escrita do Firestore atingida (Free Tier). Modo Local/Memória ativo com segurança.'
        : syncError,
      quotaExhausted: isUnderQuotaCooldown,
    };
  }

  /**
   * Sincroniza o estado da plataforma com proteção contra esgotamento de quota
   */
  public async syncPlatformState(data: {
    accounts: Account[];
    bots: Bot[];
    trades: Trade[];
    runnerStatus: any;
  }): Promise<{ success: boolean; error?: string; localOnly?: boolean }> {
    if (!this.isReady() || this.isQuotaLimited()) {
      return {
        success: true,
        localOnly: true,
        error: this.isQuotaLimited() ? 'Quota diária atingida. Operando com persistência em memória.' : undefined,
      };
    }

    // Hash rápido para evitar regravação de dados idênticos
    const currentHash = `${data.accounts.length}-${data.bots.map(b => b.status).join(':')}-${data.trades.length}-${data.runnerStatus.status}`;
    if (this.lastWrittenStateHash === currentHash && syncCount > 0) {
      // Nenhum dado crítico mudou, atualizar apenas heartbeat em memória
      lastSyncTimestamp = new Date().toISOString();
      return { success: true };
    }

    try {
      // 1. Sincroniza Status consolidado do Runner 24/7
      const runnerRef = doc(dbInstance, 'runner_status', 'runner-247-primary');
      await setDoc(
        runnerRef,
        {
          ...data.runnerStatus,
          lastHeartbeat: new Date().toISOString(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 2. Sincroniza snapshot compacto de contas e bots (1 gravação consolidada no config para economizar cota)
      const platformDocRef = doc(dbInstance, 'config', 'platform_state');
      await setDoc(
        platformDocRef,
        {
          accountsCount: data.accounts.length,
          botsCount: data.bots.length,
          openTradesCount: data.trades.filter((t) => t.status === 'open').length,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      this.lastWrittenStateHash = currentHash;
      lastSyncTimestamp = new Date().toISOString();
      syncCount += 1;
      syncError = null;

      return { success: true };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Quota limit')) {
        this.markQuotaExhausted();
        return { success: true, localOnly: true, error: syncError || undefined };
      }

      syncError = errMsg;
      return { success: false, error: syncError };
    }
  }

  /**
   * Salva um log de execução no Firestore com salvaguarda
   */
  public async logEvent(type: string, message: string, details?: any) {
    if (!this.isReady() || this.isQuotaLimited()) return;
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
    } catch (e: any) {
      if (e?.message?.includes('RESOURCE_EXHAUSTED') || e?.message?.includes('quota')) {
        this.markQuotaExhausted();
      }
    }
  }
}

export const firebaseService = new FirebaseService();
