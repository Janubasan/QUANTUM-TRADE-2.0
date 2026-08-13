import crypto from 'crypto';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { getApps, initializeApp, getApp } from 'firebase/app';
import { readFileSync } from 'fs';
import path from 'path';
import { store } from '../data/store.js';

export interface OrderPayload {
  id?: string;
  order_id?: string;
  account_id: string;
  symbol: string;
  side: 'buy' | 'sell' | 'BUY' | 'SELL';
  quantity: number;
  price?: number;
  tpPrice?: number;
  slPrice?: number;
  direction?: 'LONG' | 'SHORT';
  estimated_duration_seconds?: number;
  signature?: string;
  [key: string]: any;
}

export interface ValidationResult {
  approved: boolean;
  order: Record<string, any>;
  reason: string;
}

export class OperationalGuard {
  public readonly MAX_ORDERS_PER_HOUR = 10;
  public readonly DAILY_PROFIT_LIMIT_PERCENT = 5.0;
  public readonly SLIPPAGE_RATE = 0.0005; // 0,05%
  public readonly FEE_RATE = 0.001; // 0,1%
  public readonly TIME_MIN_SECONDS = 60; // 1 min
  public readonly TIME_MAX_SECONDS = 24 * 3600; // 24 hours

  private db: any = null;
  private localKillSwitch: boolean = false; // false = trading allowed (kill switch disengaged)
  private lastKillSwitchFetch: number = 0;

  constructor() {
    this.initDb();
  }

  private initDb() {
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      const raw = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw);
      const app = getApps().length === 0 ? initializeApp(config) : getApp();
      this.db = getFirestore(app, config.firestoreDatabaseId || undefined);
      console.log('🛡️ [OperationalGuard] Inicializado com Firestore ativo.');
      // Initialize global config if needed
      this.syncKillSwitchFromDb();
    } catch (e: any) {
      console.warn('⚠️ [OperationalGuard] Firestore em modo local/fallback:', e.message);
    }
  }

  // ------------------------------------------------------------------
  // 1. KILL SWITCH (Firestore doc: config/global)
  // ------------------------------------------------------------------
  public async getKillSwitch(): Promise<boolean> {
    const now = Date.now();
    // Cache for 2 seconds to avoid excessive network roundtrips on high frequency ticks
    if (this.db && now - this.lastKillSwitchFetch > 2000) {
      try {
        const docRef = doc(this.db, 'config', 'global');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          this.localKillSwitch = Boolean(data?.kill_switch);
        }
        this.lastKillSwitchFetch = now;
      } catch (e: any) {
        // Fallback to local memory state
      }
    }
    return this.localKillSwitch;
  }

  public async setKillSwitch(active: boolean): Promise<boolean> {
    this.localKillSwitch = active;
    this.lastKillSwitchFetch = Date.now();
    if (this.db) {
      try {
        const docRef = doc(this.db, 'config', 'global');
        await setDoc(
          docRef,
          {
            kill_switch: active,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (e: any) {
        console.error('Erro ao atualizar kill_switch no Firestore:', e.message);
      }
    }
    store.addLog(
      'INFO',
      `🛡️ [OperationalGuard] Kill Switch ${active ? '🛑 ATIVADO (Operações Bloqueadas)' : '🟢 DESATIVADO (Operações Permitidas)'}`
    );
    return this.localKillSwitch;
  }

  // Synchronous accessor for fast loops
  public isKillSwitchActive(): boolean {
    return this.localKillSwitch;
  }

  public async syncKillSwitchFromDb() {
    if (!this.db) return;
    try {
      const docRef = doc(this.db, 'config', 'global');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (typeof data.kill_switch === 'boolean') {
          this.localKillSwitch = data.kill_switch;
        }
      } else {
        // Create initial config if not existing
        await setDoc(docRef, { kill_switch: false, updatedAt: new Date().toISOString() });
      }
    } catch (e) {
      // Non-blocking
    }
  }

  // ------------------------------------------------------------------
  // 2. INTEGRIDADE (HMAC-SHA256)
  // ------------------------------------------------------------------
  public verifyIntegrity(payload: Record<string, any>, signature: string, secret: string): boolean {
    if (!signature || !secret) return false;
    try {
      // Build canonical sorted JSON string
      const canonical = this.canonicalJsonString(payload);
      const expected = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
    } catch (e) {
      return false;
    }
  }

  private canonicalJsonString(obj: Record<string, any>): string {
    const keys = Object.keys(obj).filter((k) => k !== 'signature').sort();
    const sortedObj: Record<string, any> = {};
    for (const key of keys) {
      sortedObj[key] = obj[key];
    }
    return JSON.stringify(sortedObj);
  }

  // Helper to generate HMAC signature for outgoing orders or testing
  public signPayload(payload: Record<string, any>, secret: string): string {
    const canonical = this.canonicalJsonString(payload);
    return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  }

  // ------------------------------------------------------------------
  // 3. TIMEGATE (1 min a 24 horas)
  // ------------------------------------------------------------------
  public checkTimegate(estimatedDurationSeconds: number): [boolean, string] {
    if (isNaN(estimatedDurationSeconds) || estimatedDurationSeconds < this.TIME_MIN_SECONDS) {
      return [
        false,
        `Duração estimada ${estimatedDurationSeconds.toFixed(0)}s abaixo do mínimo de ${this.TIME_MIN_SECONDS}s (TimeGate)`,
      ];
    }
    if (estimatedDurationSeconds > this.TIME_MAX_SECONDS) {
      return [
        false,
        `Duração estimada ${estimatedDurationSeconds.toFixed(0)}s acima do máximo de ${this.TIME_MAX_SECONDS / 3600}h (TimeGate)`,
      ];
    }
    return [true, 'OK'];
  }

  // ------------------------------------------------------------------
  // 4. LIMITE DE ORDENS/HORA (Máx 10 ordens por hora por conta)
  // ------------------------------------------------------------------
  public async checkRateLimit(accountId: string): Promise<[boolean, string]> {
    const oneHourAgoDate = new Date(Date.now() - 3600 * 1000);
    const oneHourAgoIso = oneHourAgoDate.toISOString();

    // 1. Check in Firestore orders if DB available
    if (this.db) {
      try {
        const ordersRef = collection(this.db, 'orders');
        const q = query(
          ordersRef,
          where('account_id', '==', accountId),
          where('created_at', '>=', oneHourAgoIso),
          where('status', 'in', ['approved', 'filled'])
        );
        const snapshot = await getDocs(q);
        if (snapshot.size >= this.MAX_ORDERS_PER_HOUR) {
          return [false, `Limite de ${this.MAX_ORDERS_PER_HOUR} ordens/hora excedido para a conta ${accountId} (Firestore count: ${snapshot.size})`];
        }
      } catch (e: any) {
        // Fallback to local store
      }
    }

    // 2. Local store verification
    const state = store.getState();
    const recentTrades = state.trades.filter(
      (t) => t.accountId === accountId && new Date(t.entryTime) >= oneHourAgoDate
    );
    if (recentTrades.length >= this.MAX_ORDERS_PER_HOUR) {
      return [false, `Limite de ${this.MAX_ORDERS_PER_HOUR} ordens/hora excedido para a conta ${accountId} (${recentTrades.length}/${this.MAX_ORDERS_PER_HOUR})`];
    }

    return [true, 'OK'];
  }

  // ------------------------------------------------------------------
  // 5. LIMITE DE LUCRO DIÁRIO (5% do Patrimônio)
  // ------------------------------------------------------------------
  public async checkDailyProfit(accountId: string, equity: number): Promise<[boolean, string]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const state = store.getState();
    const closedToday = state.trades.filter(
      (t) =>
        (t.accountId === accountId || !t.accountId) &&
        t.status === 'closed' &&
        t.closeTime &&
        new Date(t.closeTime) >= today
    );

    // Calculate NET PnL (gains minus losses)
    const netProfitToday = closedToday.reduce((acc, t) => acc + (t.pnl || 0), 0);

    if (equity > 0 && netProfitToday > 0 && (netProfitToday / equity) * 100 >= this.DAILY_PROFIT_LIMIT_PERCENT) {
      return [
        false,
        `Lucro diário de R$ ${netProfitToday.toFixed(2)} atingiu o limite de compliance de ${this.DAILY_PROFIT_LIMIT_PERCENT}% da banca (R$ ${equity.toFixed(2)})`,
      ];
    }

    return [true, 'OK'];
  }

  // ------------------------------------------------------------------
  // 6. EXECUÇÃO REALISTA (Slippage de 0,05% e Taxa de 0,1% sobre Nocional)
  // ------------------------------------------------------------------
  public applyRealisticExecution(order: Record<string, any>, currentPrice: number): Record<string, any> {
    const qty = Number(order.quantity) || 0;
    const notional = Number((qty * currentPrice).toFixed(4));
    const slippage = Number((currentPrice * this.SLIPPAGE_RATE).toFixed(4));
    const fee = Number((notional * this.FEE_RATE).toFixed(4));

    const isBuy =
      order.side?.toLowerCase() === 'buy' ||
      order.direction === 'LONG' ||
      order.side === 'LONG';

    const fillPrice = isBuy
      ? Number((currentPrice + slippage).toFixed(2))
      : Number((currentPrice - slippage).toFixed(2));

    order.fill_price = fillPrice;
    order.price = currentPrice;
    order.slippage = slippage;
    order.fee = fee;
    order.net_notional = Number((notional - fee).toFixed(4));
    return order;
  }

  // ------------------------------------------------------------------
  // MÉTODO CENTRAL DE VALIDAÇÃO E PREPARAÇÃO
  // ------------------------------------------------------------------
  public async validateAndPrepare(params: {
    order: OrderPayload;
    account: { id: string; equity: number; [key: string]: any };
    marketPrice: number;
    estimatedDurationSeconds: number;
    integritySignature?: string;
    integritySecret?: string;
  }): Promise<ValidationResult> {
    const {
      order,
      account,
      marketPrice,
      estimatedDurationSeconds,
      integritySignature,
      integritySecret,
    } = params;

    const orderCopy = { ...order };

    // 1. Kill Switch
    const isKilled = await this.getKillSwitch();
    if (isKilled) {
      const reason = 'Kill Switch ativo no Firestore: todas as operações estão bloqueadas';
      store.addLog('ERROR', `🛑 ${reason} (Conta: ${orderCopy.account_id})`);
      return { approved: false, order: orderCopy, reason };
    }

    // 2. Integridade (HMAC)
    if (integritySignature && integritySecret) {
      const validHmac = this.verifyIntegrity(orderCopy, integritySignature, integritySecret);
      if (!validHmac) {
        const reason = 'Falha na verificação de integridade criptográfica (HMAC inválido)';
        store.addLog('ERROR', `🔒 ${reason} para ordem ${orderCopy.symbol}`);
        return { approved: false, order: orderCopy, reason };
      }
    }

    // 3. TimeGate
    const [timegateOk, timegateMsg] = this.checkTimegate(estimatedDurationSeconds);
    if (!timegateOk) {
      store.addLog('RULE', `⏳ TimeGate Veto: ${timegateMsg}`);
      return { approved: false, order: orderCopy, reason: timegateMsg };
    }

    // 4. Limite de ordens/hora (Máx 10/hora)
    const [rateOk, rateMsg] = await this.checkRateLimit(orderCopy.account_id);
    if (!rateOk) {
      store.addLog('RULE', `⚡ Rate Limit: ${rateMsg}`);
      return { approved: false, order: orderCopy, reason: rateMsg };
    }

    // 5. Limite de lucro diário (5% da equity)
    const [profitOk, profitMsg] = await this.checkDailyProfit(orderCopy.account_id, account.equity);
    if (!profitOk) {
      store.addLog('RULE', `💰 Profit Lock: ${profitMsg}`);
      return { approved: false, order: orderCopy, reason: profitMsg };
    }

    // 6. Execução realista (Slippage + Taxa)
    const processedOrder = this.applyRealisticExecution(orderCopy, marketPrice);

    // 7. Persistir ordem aprovada no Firestore (Auditoria e Compliance)
    const orderId =
      processedOrder.order_id ||
      processedOrder.id ||
      `ord-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    
    processedOrder.id = orderId;
    processedOrder.order_id = orderId;
    processedOrder.status = 'approved';
    processedOrder.validated_at = new Date().toISOString();
    processedOrder.created_at = processedOrder.created_at || new Date().toISOString();

    if (this.db) {
      try {
        const docRef = doc(this.db, 'orders', orderId);
        await setDoc(docRef, {
          ...processedOrder,
          updatedAt: serverTimestamp(),
        });
      } catch (e: any) {
        console.error('Erro ao persistir ordem aprovada no Firestore:', e.message);
      }
    }

    return {
      approved: true,
      order: processedOrder,
      reason: 'Ordem validada e pronta para envio à corretora',
    };
  }
}

export const operationalGuard = new OperationalGuard();
