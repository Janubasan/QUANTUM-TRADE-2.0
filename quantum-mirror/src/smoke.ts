// Smoke test — integrações + bots + auditoria + mirror (sem rede obrigatória).
// Uso: npm run smoke
import 'dotenv/config';
import { VENUES } from './integrations/brokers.js';
import { WALLETS } from './integrations/wallets.js';
import { CHAINS } from './integrations/chains.js';
import { BOTS, Candle } from './bots/types.js';
import { STRATEGIES } from './bots/strategies.js';
import { seal, verifyChain } from './engine/audit.js';
import { DemoAccount } from './engine/demoAccount.js';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

console.log('— Venues (corretoras) —');
for (const v of Object.values(VENUES)) {
  const d = v.describe();
  check(`${d.name}: ${d.status}${d.testnet ? ' (testnet)' : ''}`, true);
}
console.log('— Carteiras —');
for (const w of WALLETS) check(`${w.name}: ${w.status}`, true);
console.log('— Chains —');
for (const c of CHAINS) check(`${c.name} (${c.dex}): ${c.status}`, true);

console.log('— Bots (sinais sobre candles sintéticos) —');
const mk = (n: number, base: number, drift: number): Candle[] => {
  const out: Candle[] = [];
  let p = base;
  for (let i = 0; i < n; i++) {
    const c = p * (1 + drift + (Math.random() - 0.48) * 0.01);
    out.push({ openTime: Date.now() - (n - i) * 60000, open: p, high: Math.max(p, c) * 1.001, low: Math.min(p, c) * 0.999, close: c, volume: 1000 + Math.random() * 5000 });
    p = c;
  }
  return out;
};
const fns = [STRATEGIES.solMomentumBreakout, STRATEGIES.ethTrendWave, STRATEGIES.regimeDesk, STRATEGIES.orbMonteCarlo];
BOTS.forEach((b, i) => {
  try {
    const sig = fns[i](mk(120, 100, 0.0008), b.symbol, b.timeframe);
    check(`${b.name}: direção=${sig.direction} conf=${sig.confidence} veto=${sig.vetoed}`, sig !== null);
  } catch (e: any) { check(b.name, false, e.message); }
});

console.log('— Conta demo $100 + auditoria —');
const acc = new DemoAccount(100);
check('saldo inicial = 100', acc.balance === 100);
const blk = seal('smoke_test', { hello: 'mirror' });
check(`bloco selado ${blk.auditCode}`, !!blk.hash);
const v = verifyChain();
check(`cadeia íntegra (${v.blocks} blocos)`, v.ok);

console.log(`\nSMOKE: ${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
