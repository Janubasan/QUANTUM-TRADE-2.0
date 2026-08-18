export function isLiveTradingEnabled(): boolean {
  return process.env.ALLOW_LIVE_TRADING === 'true';
}

export function defaultVenueEnvironment(): 'demo' | 'live' {
  return process.env.DEFAULT_VENUE_ENV === 'live' ? 'live' : 'demo';
}

export function commandTtlMs(): number {
  return Number(process.env.VENUE_COMMAND_TTL_MS || 90_000);
}

export function heartbeatStaleMs(): number {
  return Number(process.env.VENUE_HEARTBEAT_STALE_MS || 20_000);
}

export function assertEnvironmentAllowed(params: {
  requested: 'demo' | 'live';
  accountType: 'demo' | 'real';
  allowLiveExecution?: boolean;
}): { ok: boolean; reason?: string; environment: 'demo' | 'live' } {
  if (params.requested === 'demo' || params.accountType === 'demo') {
    return { ok: true, environment: 'demo' };
  }
  if (!isLiveTradingEnabled()) {
    return {
      ok: false,
      environment: 'demo',
      reason: 'Live bloqueado. Defina ALLOW_LIVE_TRADING=true no servidor após validar o demo.',
    };
  }
  if (!params.allowLiveExecution) {
    return {
      ok: false,
      environment: 'demo',
      reason: 'Conta real sem allowLiveExecution. Promova explicitamente após auditoria do demo.',
    };
  }
  return { ok: true, environment: 'live' };
}
