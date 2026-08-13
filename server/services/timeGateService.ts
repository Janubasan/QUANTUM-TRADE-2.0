export class TimeGateService {
  private readonly MIN_DURATION_MS = 60 * 1000; // 1 minuto (60s)
  private readonly MAX_DURATION_MS = 24 * 60 * 60 * 1000; // 1 dia (24h)

  /**
   * Estima o tempo médio para atingir TP ou SL com base na volatilidade do mercado
   */
  public estimateDuration(
    entryPrice: number,
    tp: number,
    sl: number,
    volatilityPct: number = 0.1
  ): number {
    const avgMove = entryPrice * ((volatilityPct || 0.1) / 100);
    const targetDistance = Math.min(Math.abs(tp - entryPrice), Math.abs(sl - entryPrice));
    const estimatedMinutes = targetDistance / (avgMove || 0.001);
    
    // Converte para milissegundos com piso em 60s e teto em 24h
    return Math.max(60_000, Math.min(86_400_000, Math.round(estimatedMinutes * 60_000)));
  }

  /**
   * Verifica se a duração estimada está dentro do intervalo permitido (1min - 24h)
   */
  public isDurationValid(estimatedMs: number): boolean {
    return estimatedMs >= this.MIN_DURATION_MS && estimatedMs <= this.MAX_DURATION_MS;
  }

  public getLimits() {
    return {
      minSeconds: this.MIN_DURATION_MS / 1000,
      maxSeconds: this.MAX_DURATION_MS / 1000,
      minMinutes: 1,
      maxHours: 24,
    };
  }
}

export const timeGateService = new TimeGateService();
