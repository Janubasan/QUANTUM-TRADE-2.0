export class KillSwitchService {
  private static instance: KillSwitchService;
  private _isActive: boolean = true; // Starts ON
  private listeners: ((status: boolean) => void)[] = [];

  private constructor() {}

  public static getInstance(): KillSwitchService {
    if (!KillSwitchService.instance) {
      KillSwitchService.instance = new KillSwitchService();
    }
    return KillSwitchService.instance;
  }

  public get isActive(): boolean {
    return this._isActive;
  }

  public setActive(status: boolean) {
    this._isActive = status;
    this.listeners.forEach((fn) => fn(status));
    console.log(`🔌 Kill Switch Global: ${status ? 'ATIVO (OPERANDO)' : 'DESATIVADO (BLOQUEADO)'}`);
  }

  public toggle(): boolean {
    this.setActive(!this._isActive);
    return this._isActive;
  }

  public onStatusChange(fn: (status: boolean) => void) {
    this.listeners.push(fn);
  }
}

export const killSwitchService = KillSwitchService.getInstance();
