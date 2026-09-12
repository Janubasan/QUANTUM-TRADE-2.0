import assert from 'node:assert/strict';
import { candidateGrid, monteCarloConfidence, runWfaBacktest } from './walkForwardEngine.js';
import type { HistoricalBar } from '../../src/types.js';

// Deterministic fixture only for testing the engine mechanics. Production code
// never uses this fixture or creates market candles as a data fallback.
function fixtureBars(count: number): HistoricalBar[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index * 0.08 + Math.sin(index / 5) * 1.8;
    return {
      timestamp: new Date(Date.UTC(2020, 0, index + 1)).toISOString(),
      open: close - 0.15,
      high: close + 0.4,
      low: close - 0.4,
      close,
      volume: 1000 + index,
    };
  });
}

const bars = fixtureBars(320);
const candidate = candidateGrid(['trend_following'])[0];
const costs = { feeRateBps: 0, slippageBps: 1, positionPct: 0.02 };
const first = runWfaBacktest(bars, candidate, '1d', 100, costs);
const second = runWfaBacktest(bars, candidate, '1d', 100, costs);

assert.equal(first.report.status, 'VALID');
assert.equal(first.report.walk_forward_windows, 8);
assert.equal(first.report.lookahead_check, 'PASSED');
assert.equal(first.report.reproducibility_hash, second.report.reproducibility_hash);
assert.deepEqual(
  monteCarloConfidence(first.internal.outOfSample, [17, 31], 20),
  monteCarloConfidence(second.internal.outOfSample, [17, 31], 20)
);

const empty = runWfaBacktest([], candidate, '1d', 100, costs);
assert.equal(empty.report.status, 'NO_DATA');

console.log('walkForwardEngine: deterministic validation tests passed');
