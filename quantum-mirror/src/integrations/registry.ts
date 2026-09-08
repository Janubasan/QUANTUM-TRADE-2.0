// Registry unificado — GET /api/integrations expõe tudo pronto para plugar.
import { VENUES } from './brokers.js';
import { WALLETS } from './wallets.js';
import { CHAINS } from './chains.js';

export function integrationMatrix() {
  return {
    venue: process.env.EXECUTION_VENUE ?? 'paper',
    live: process.env.LIVE_TRADING === 'true',
    testnet: (process.env.USE_TESTNET ?? 'true') !== 'false',
    brokers: Object.values(VENUES).map((v) => v.describe()),
    wallets: WALLETS,
    chains: CHAINS,
    updatedAt: new Date().toISOString(),
  };
}
