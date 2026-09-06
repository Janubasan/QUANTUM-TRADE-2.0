/**
 * httpSmoke.ts — Teste de fumaça HTTP de ponta a ponta.
 *
 * Rodar:  npm run test:http
 *
 * O que ele faz:
 *   1. Sobe o nó JSON-RPC local (testing/localChainStub.ts);
 *   2. Inicia uma instância Express real com o roteador /api/onchain e rotas
 *      de compatibilidade legadas;
 *   3. Executa chamadas HTTP reais via fetch e valida as respostas.
 *
 * Cobre todo o ciclo: requisição HTTP -> roteador Express -> OnchainService ->
 * ethers -> JSON-RPC -> assinatura -> receipt.
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import express from 'express';
import { ethers } from 'ethers';
import { LocalChainStub, TEST_ADDRESS, TEST_PRIVATE_KEY } from './localChainStub.js';
import { OnchainService, setOnchainService } from '../onchainService.js';
import { AuditAnchorService, setAuditAnchorService } from '../auditAnchor.js';
import { createOnchainRouter } from '../../../routes/onchainRoutes.js';
import { realExecutionGateway } from '../../realExecutionGateway.js';
import { BlockchainAdapter, CHAINS } from '../../adapters/blockchainAdapter.js';
import type { ChainDefinition } from '../types.js';

const WETH = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const ROUTER = '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E';
const TST = ethers.getAddress('0x0000000000000000000000000000000000000aa1');
const USDC = ethers.getAddress('0x0000000000000000000000000000000000000aa2');

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err: any) {
    failed += 1;
    failures.push(`${name}: ${err?.message || err}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${String(err?.message || err).slice(0, 300)}`);
  }
}

function makeChain(rpcUrl: string, env: 'mainnet' | 'testnet' = 'testnet', key = 'sepolia'): ChainDefinition {
  return {
    key,
    name: 'Ethereum Sepolia Testnet',
    env,
    chainId: 11155111,
    nativeSymbol: 'ETH',
    rpcUrls: [rpcUrl],
    wrappedNative: WETH,
    dexRouter: ROUTER,
    dexName: 'Uniswap V2 (Sepolia)',
    explorer: 'https://sepolia.etherscan.io',
    blockTimeSeconds: 12,
    liveAllowedByDefault: env === 'testnet',
    verification: 'unverified',
  };
}

async function main() {
  console.log('\n\x1b[1mFumaça HTTP — servidor Express real + nó JSON-RPC local\x1b[0m\n');

  const stub = new LocalChainStub({
    chainId: 11155111,
    wrappedNative: WETH,
    router: ROUTER,
    rateOutPerIn: 2n,
    tokens: {
      [TST.toLowerCase()]: { symbol: 'TST', decimals: 18, balances: { [TEST_ADDRESS.toLowerCase()]: ethers.parseEther('100') }, allowances: {} },
      [USDC.toLowerCase()]: { symbol: 'USDC', decimals: 18, balances: { [TEST_ADDRESS.toLowerCase()]: ethers.parseEther('5000') }, allowances: {} },
      [WETH.toLowerCase()]: { symbol: 'WETH', decimals: 18, balances: { [TEST_ADDRESS.toLowerCase()]: ethers.parseEther('10') }, allowances: {} },
    },
    nativeBalances: { [TEST_ADDRESS.toLowerCase()]: ethers.parseEther('3') },
  });
  const rpcUrl = await stub.start();
  console.log(`Nó local: ${rpcUrl}`);

  // Configura OnchainService com o nó local
  const svc = new OnchainService({
    chainOverride: makeChain(rpcUrl),
    privateKey: TEST_PRIVATE_KEY,
    confirmations: 1,
    maxNotionalUsd: 1_000_000,
  });
  setOnchainService(svc);

  // Configura AuditAnchorService
  const tmpAudit = `/tmp/qt-smoke-audit-${Date.now()}`;
  const auditSvc = new AuditAnchorService(tmpAudit);
  setAuditAnchorService(auditSvc);

  // Cria app Express real e monta rotas
  const app = express();
  app.use(express.json());

  // Rotas On-Chain
  app.use('/api/onchain', createOnchainRouter());

  // Rotas legadas Blockchain (mantidas para compatibilidade retroativa)
  app.get('/api/blockchain/chains', (_req, res) => {
    res.json({ chains: CHAINS });
  });

  app.get('/api/blockchain/wallet', async (_req, res) => {
    try {
      const adapter = realExecutionGateway.getAdapter('blockchain_evm') as BlockchainAdapter | undefined;
      if (!adapter) return res.status(404).json({ error: 'Adaptador Blockchain EVM não registrado.' });

      const nativeBalance = await adapter.getNativeBalance();
      const currentChain = adapter.getChain();
      const balances = await adapter.getBalances();

      res.json({
        address: adapter.address,
        chain: currentChain,
        nativeBalance,
        balances,
        isSandbox: adapter.isSandbox,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/real-execution/status', (_req, res) => {
    res.json(realExecutionGateway.getStatus());
  });

  // Sobe o servidor HTTP em porta efêmera
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const BASE = `http://127.0.0.1:${port}`;
  console.log(`Servidor Express em ${BASE}\n`);

  async function api(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    return { status: res.status, json };
  }

  try {
    await test('GET /api/onchain/chains lista as redes com estado de verificação', async () => {
      const r = await api('GET', '/api/onchain/chains');
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.json.chains));
      const sepolia = r.json.chains.find((c: any) => c.key === 'sepolia');
      assert.ok(sepolia, 'rede sepolia deveria estar na lista');
      assert.equal(sepolia.chainId, 11155111);
      assert.equal(sepolia.env, 'testnet');
      assert.equal(r.json.activeChain, 'sepolia');
    });

    await test('GET /api/onchain/status mostra carteira REAL e saúde do RPC', async () => {
      const r = await api('GET', '/api/onchain/status');
      assert.equal(r.status, 200);
      assert.equal(r.json.wallet.address.toLowerCase(), TEST_ADDRESS.toLowerCase());
      assert.equal(r.json.wallet.hasSigningKey, true);
      assert.equal(r.json.wallet.isTestnet, true);
      assert.equal(r.json.rpc.connected, true, `RPC deveria estar conectado: ${r.json.rpc.error}`);
      assert.equal(r.json.rpc.blockNumber, stub.getBlockNumber());
    });

    await test('POST /api/onchain/verify confirma o router on-chain', async () => {
      const r = await api('POST', '/api/onchain/verify');
      assert.equal(r.status, 200);
      assert.equal(r.json.success, true, r.json.detail);
      assert.equal(r.json.verification, 'verified');
    });

    await test('GET /api/onchain/balances devolve saldos REAIS (nada de 5400 USDC)', async () => {
      const r = await api('GET', `/api/onchain/balances?tokens=${TST},${USDC}`);
      assert.equal(r.status, 200);
      assert.equal(r.json.native.amount, '3.0');
      const tst = r.json.tokens.find((t: any) => t.token.symbol === 'TST');
      assert.equal(tst.amount, '100.0');
      assert.equal(tst.provenance, 'onchain');
      const fake = r.json.tokens.find((t: any) => t.amount === '5400.0');
      assert.equal(fake, undefined, 'saldo fabricado não pode aparecer');
    });

    await test('POST /api/onchain/quote devolve cotação REAL com amountOutMin', async () => {
      const r = await api('POST', '/api/onchain/quote', {
        tokenIn: TST,
        tokenOut: USDC,
        amountIn: '10',
        slippageBps: 100,
      });
      assert.equal(r.status, 200);
      assert.equal(r.json.quote.amountOutHuman, '20.0');
      assert.equal(r.json.quote.provenance, 'onchain');
      assert.equal(r.json.quote.amountOutMinRaw, ((ethers.parseEther('20') * 9900n) / 10000n).toString());
    });

    await test('POST /api/onchain/swap SEM confirm faz DRY-RUN e não devolve hash falso', async () => {
      const before = stub.getTransactions().length;
      const r = await api('POST', '/api/onchain/swap', { tokenIn: TST, tokenOut: USDC, amountIn: '1' });
      assert.equal(r.status, 200);
      assert.equal(r.json.success, false);
      assert.equal(r.json.result.hash, null, 'hash deve ser null em dry-run');
      assert.equal(r.json.result.dryRun, true);
      assert.equal(r.json.result.status, 'NOT_SENT');
      assert.equal(stub.getTransactions().length, before, 'nenhuma transação deveria ter sido enviada');
    });

    await test('POST /api/onchain/swap COM confirm envia transação REAL', async () => {
      const before = stub.getTransactions().length;
      const r = await api('POST', '/api/onchain/swap', {
        tokenIn: TST,
        tokenOut: USDC,
        amountIn: '2',
        slippageBps: 50,
        confirm: true,
      });
      assert.equal(r.status, 200, JSON.stringify(r.json).slice(0, 300));
      assert.equal(r.json.success, true, r.json.result?.error);
      assert.equal(r.json.result.status, 'CONFIRMED');
      assert.match(r.json.result.hash, /^0x[0-9a-f]{64}$/);
      assert.equal(r.json.result.explorerUrl, `https://sepolia.etherscan.io/tx/${r.json.result.hash}`);
      assert.ok(stub.getTransactions().length > before, 'transações deveriam ter sido enviadas');
      const tx = stub.getTransactions().at(-1)!;
      assert.equal(tx.decoded?.method, 'router.swapExactTokensForTokens');
    });

    await test('GET /api/onchain/tx/:hash relê o receipt REAL', async () => {
      const swap = await api('POST', '/api/onchain/swap', {
        tokenIn: TST,
        tokenOut: USDC,
        amountIn: '1',
        confirm: true,
      });
      const hash = swap.json.result.hash;
      const r = await api('GET', `/api/onchain/tx/${hash}`);
      assert.equal(r.status, 200);
      assert.equal(r.json.found, true);
      assert.equal(r.json.status, 'CONFIRMED');
      assert.equal(r.json.provenance, 'onchain');
    });

    await test('GET /api/onchain/tx/:hash inexistente não inventa confirmação', async () => {
      const r = await api('GET', `/api/onchain/tx/0x${'ab'.repeat(32)}`);
      assert.equal(r.status, 200);
      assert.equal(r.json.found, false);
      assert.equal(r.json.blockNumber, null);
    });

    await test('GET /api/onchain/resolve/:symbol resolve por rede ativa', async () => {
      const r = await api('GET', '/api/onchain/resolve/WETH');
      assert.equal(r.status, 200);
      assert.equal(r.json.address.toLowerCase(), WETH.toLowerCase());
      const bad = await api('GET', '/api/onchain/resolve/DOGE');
      assert.equal(bad.status, 404);
      assert.match(bad.json.error, /não registrado/);
    });

    await test('POST /api/onchain/audit/anchor ancora a trilha on-chain', async () => {
      const r = await api('POST', '/api/onchain/audit/anchor', {});
      assert.equal(r.status, 200);
      assert.equal(r.json.success, true, r.json.anchor?.reason);
      assert.match(r.json.anchor.txHash, /^0x[0-9a-f]{64}$/);
      assert.ok(r.json.anchor.explorerUrl);
      const tx = stub.getTransactions().at(-1)!;
      assert.equal(tx.data, `0x${r.json.anchor.auditHeadHash}`);
    });

    await test('GET /api/onchain/audit/integrity recheca hash por hash', async () => {
      const r = await api('GET', '/api/onchain/audit/integrity');
      assert.equal(r.status, 200);
      assert.equal(r.json.valid, true, r.json.brokenReason);
      assert.ok(r.json.totalBlocks >= 1);
      assert.ok(Array.isArray(r.json.anchors));
    });

    await test('POST /api/onchain/chain rejeita rede inexistente', async () => {
      const r = await api('POST', '/api/onchain/chain', { chainKey: 'solana' });
      assert.equal(r.status, 400);
      assert.match(r.json.error, /Rede inválida/);
    });

    await test('GET /api/blockchain/wallet (legado) usa saldo real, não fabricado', async () => {
      const r = await api('GET', '/api/blockchain/wallet');
      assert.equal(r.status, 200);
      assert.equal(r.json.address.toLowerCase(), TEST_ADDRESS.toLowerCase());
      assert.equal(r.json.nativeBalance, '3.0');
      assert.equal(r.json.isSandbox, true);
      const fake = (r.json.balances || []).find((b: any) => b.total === 5400);
      assert.equal(fake, undefined);
    });

    await test('GET /api/real-execution/status mostra o adapter on-chain real', async () => {
      const r = await api('GET', '/api/real-execution/status');
      assert.equal(r.status, 200);
      const bc = (r.json.activeAdapters || []).find((a: any) => a.id === 'blockchain_evm');
      assert.ok(bc, 'adapter blockchain_evm deveria estar registrado');
      assert.equal(bc.isSandbox, true, 'testnet => sandbox derivado da rede');
      assert.equal(bc.currentChain, 'sepolia');
    });
  } finally {
    server.close();
    svc.destroy();
    await stub.stop().catch(() => undefined);
  }

  console.log(`\n\x1b[1mResultado: ${passed} passaram, ${failed} falharam\x1b[0m`);
  if (failures.length) {
    console.log('\n\x1b[31mFalhas:\x1b[0m');
    for (const f of failures) console.log(`  • ${f}`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n\x1b[31mErro fatal no smoke test:\x1b[0m', err);
  process.exit(1);
});
