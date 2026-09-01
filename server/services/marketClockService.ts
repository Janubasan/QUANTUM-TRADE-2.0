import fs from 'fs';
import path from 'path';

export interface MarketSessionInfo {
  isOpen: boolean;
  marketId: string;
  marketName: string;
  currentLocalTime: string;
  timezone: string;
  activeSession?: string;
  nextOpenTime?: string;
  nextCloseTime?: string;
  reason?: string;
  isHoliday?: boolean;
}

export class MarketClockService {
  private calendars: Record<string, any> = {};
  private instruments: Record<string, any> = {};

  constructor() {
    this.loadCalendars();
  }

  private loadCalendars() {
    try {
      const configPath = path.join(process.cwd(), 'server', 'config', 'execution-calendars.json');
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        this.calendars = parsed.markets || {};
        this.instruments = parsed.instruments || {};
      }
    } catch (e) {
      console.error('Falha ao carregar execution-calendars.json:', e);
    }
  }

  /**
   * Identifica o mercado correspondente a um instrumento (e.g. BTC/USDT -> crypto, PETR4 -> B3)
   */
  public getMarketForInstrument(symbol: string): string {
    const cleanSymbol = symbol.toUpperCase().trim();
    if (this.instruments[cleanSymbol]) {
      return this.instruments[cleanSymbol].market;
    }
    if (cleanSymbol.includes('USDT') || cleanSymbol.includes('BTC') || cleanSymbol.includes('ETH') || cleanSymbol.includes('SOL')) {
      return 'crypto';
    }
    if (cleanSymbol.includes('PETR') || cleanSymbol.includes('VALE') || cleanSymbol.includes('WIN') || cleanSymbol.includes('WDO') || cleanSymbol.endsWith('3') || cleanSymbol.endsWith('4')) {
      return 'B3';
    }
    return 'crypto';
  }

  /**
   * Avalia dinamicamente se o mercado está aberto para negociações
   */
  public getMarketStatus(marketId: string): MarketSessionInfo {
    const market = this.calendars[marketId];
    if (!market) {
      return {
        isOpen: true,
        marketId,
        marketName: marketId,
        currentLocalTime: new Date().toISOString(),
        timezone: 'UTC',
        activeSession: '24/7 Global',
      };
    }

    const now = new Date();
    // Formata a data atual no fuso horário do mercado
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: market.timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = parseInt(getPart('hour'), 10);
    const minute = parseInt(getPart('minute'), 10);

    const currentDateStr = `${year}-${month}-${day}`;
    const currentTimeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    const currentMinutes = hour * 60 + minute;

    // 1. Verifica feriados
    const holidays: string[] = market.holidays || [];
    if (holidays.includes(currentDateStr)) {
      return {
        isOpen: false,
        marketId,
        marketName: market.name,
        currentLocalTime: `${currentDateStr} ${currentTimeStr} (${market.timezone})`,
        timezone: market.timezone,
        isHoliday: true,
        reason: `Feriado oficial de mercado (${currentDateStr})`,
        nextOpenTime: 'Próximo dia útil às ' + (market.sessions[0]?.split('-')[0] || '10:00'),
      };
    }

    // 2. Verifica dia da semana
    const dayOfWeek = now.getUTCDay(); // 0 = Domingo, 6 = Sábado
    const allowedDays: number[] = market.days || [0, 1, 2, 3, 4, 5, 6];
    if (!allowedDays.includes(dayOfWeek)) {
      return {
        isOpen: false,
        marketId,
        marketName: market.name,
        currentLocalTime: `${currentDateStr} ${currentTimeStr} (${market.timezone})`,
        timezone: market.timezone,
        reason: 'Mercado fechado no final de semana',
        nextOpenTime: 'Segunda-feira às ' + (market.sessions[0]?.split('-')[0] || '10:00'),
      };
    }

    // 3. Verifica sessões de horário
    const sessions: string[] = market.sessions || ['00:00-23:59'];
    for (const session of sessions) {
      const [startStr, endStr] = session.split('-');
      const [startH, startM] = startStr.split(':').map(Number);
      const [endH, endM] = endStr.split(':').map(Number);

      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
        return {
          isOpen: true,
          marketId,
          marketName: market.name,
          currentLocalTime: `${currentDateStr} ${currentTimeStr} (${market.timezone})`,
          timezone: market.timezone,
          activeSession: session,
          nextCloseTime: endStr,
        };
      }
    }

    return {
      isOpen: false,
      marketId,
      marketName: market.name,
      currentLocalTime: `${currentDateStr} ${currentTimeStr} (${market.timezone})`,
      timezone: market.timezone,
      reason: `Fora da janela de negociação regular (${sessions.join(', ')})`,
      nextOpenTime: sessions[0]?.split('-')[0] || '10:00',
    };
  }

  public isInstrumentOpen(symbol: string): MarketSessionInfo {
    const marketId = this.getMarketForInstrument(symbol);
    return this.getMarketStatus(marketId);
  }

  public getAllMarketStatuses(): MarketSessionInfo[] {
    return Object.keys(this.calendars).map((id) => this.getMarketStatus(id));
  }
}

export const marketClockService = new MarketClockService();
