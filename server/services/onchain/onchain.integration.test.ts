/**
 * onchain.integration.test.ts — Teste de integração REAL da camada on-chain.
 *
 * Rodar:  npm run test:onchain
 *
 * O que este teste prova
 * ----------------------
 * Ele sobe um nó JSON-RPC local (testing/localChainStub.ts) e executa o
 * `OnchainService` / `OnchainAdapter` / `AuditAnchorService` DE VERDADE contra
 * ele. Quem assina e serializa as transações é o `ethers` real, dentro do
 * código que vai para produção. Não há reimplementação da lógica sendo testada.
 *
 * Cada asserção abaixo corresponde a um defeito específico encontrado na
 * auditoria do commit 5ad0464 — ou seja, este teste é a prova de correção.
 */

import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { LocalChainStub, TEST_ADDRESS, TEST_PRIVATE_KEY } from './testing/localChainStub.js';
import { OnchainService } from './onchainService.js';
import { OnchainAdapter } from './onchainAdapter.js';
import { AuditAnchorService, setAuditAnchorService } from './auditAnchor.js';
import { setOnchainService } from './onchainService.js';
import { defaultAuditLogger } from '../../validation/logger.js';
import { verifyChain } from './chainRegistry.js';
import { parsePair, resolveToken } from './tokenRegistry.js';
import type { SignedOrder } from '../adapters/BrokerAdapter.js';
import type { ChainDefinition } from './types.js';

// ------------------------------------------------------------------ harness

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err: any) {
    failed += 1;
    const msg = err?.message ? String(err.message) : String(err);
    failures.push(`${name}\n      ${msg.split('\n').join('\n      ')}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`      ${msg.split('\n').slice(0, 4).join('\n      ')}`);
  }
}

async function expectThrows(fn: () => Promise<unknown>, needle: string, label: string): Promise<void> {
  try {
    await fn();
  } catch (err: any) {
    const msg = err?.message ? String(err.message) : String(err);
    assert.ok(
      msg.toLowerCase().includes(needle.toLowerCase()),
      `${label}: erro inesperado. Esperava conter "${needle}", veio: ${msg}`
    );
    return;
  }
  throw new Error(`${label}: esperava exceção contendo "${needle}", mas nada foi lançado.`);
}

// ------------------------------------------------------------------- fixtures

const WETH = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const ROUTER = '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E';
// ethers.getAddress aplica o checksum EIP-55 — endereço mixed-case inválido
// é exatamente o que chainRegistry.requireAddress() deve rejeitar.
const TST = ethers.getAddress('0x0000000000000000000000000000000000000aa1');
const USDC = ethers.getAddress('0x0000000000000000000000000000000000000aa2');

function makeChain(rpcUrl: string, env: 'mainnet' | 'testnet' = 'testnet', key = 'stub_chain'): ChainDefinition {
  return {
    key,
    name: env === 'testnet' ? 'Stub Testnet' : 'Stub Mainnet',
    env,
    chainId: 11155111,
    nativeSymbol: 'ETH',
    rpcUrls: [rpcUrl],
    wrappedNative: WETH,
    dexRouter: ROUTER,
    dexName: 'Stub DEX',
    explorer: 'https://stub.explorer',
    blockTimeSeconds: 12,
    liveAllowedByDefault: env === 'testnet',
    verification: 'unverified',
  };
}

async function main() {
  console.log('\n\x1b[1mIntegração on-chain — executando código real contra nó JSON-RPC local\x1b[0m\n');

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
  console.log(`Nó local em ${rpcUrl} | carteira de teste ${TEST_ADDRESS}\n`);

  const svc = new OnchainService({
    chainOverride: makeChain(rpcUrl),
    privateKey: TEST_PRIVATE_KEY,
    confirmations: 1,
    maxNotionalUsd: 1_000_000,
  });

  // ------------------------------------------------------- 1. conectividade

  await test('diagnose() lê altura de bloco REAL via eth_blockNumber', async () => {
    const d = await svc.diagnose();
    assert.equal(d.connected, true, `esperava conectado, veio erro: ${d.error}`);
    assert.equal(d.blockNumber, stub.getBlockNumber());
    assert.equal(d.endpoints[0].url, rpcUrl);
    assert.ok(d.endpoints[0].successes >= 1, 'endpoint deveria registrar sucesso');
  });

  await test('getBlockNumber() reflete o estado do nó', async () => {
    const n = await svc.getBlockNumber();
    assert.equal(typeof n, 'number');
    assert.ok(n >= 18_000_000);
  });

  // ------------------------------------------------- 2. verificação do router

  await test('verifyRouter() confere o router ON-CHAIN e marca verified', async () => {
    const chain = await svc.verifyRouter();
    assert.equal(chain.verification, 'verified', chain.verificationDetail);
    assert.match(chain.verificationDetail || '', /confirmado on-chain/);
  });

  await test('verifyChain() marca INVALID quando o router devolve WETH diferente', async () => {
    const wrong = { ...makeChain(rpcUrl), dexRouter: ROUTER, wrappedNative: USDC };
    const provider = new ethers.JsonRpcProvider(rpcUrl, 11155111, { staticNetwork: true });
    const res = await verifyChain(wrong, provider);
    assert.equal(res.verification, 'invalid');
    assert.match(res.verificationDetail || '', /discordam/);
    provider.destroy();
  });

  await test('verifyChain() marca INVALID quando não há contrato no endereço', async () => {
    const ghost = { ...makeChain(rpcUrl), dexRouter: '0x000000000000000000000000000000000000dEaD' };
    const provider = new ethers.JsonRpcProvider(rpcUrl, 11155111, { staticNetwork: true });
    const res = await verifyChain(ghost, provider);
    assert.equal(res.verification, 'invalid');
    assert.match(res.verificationDetail || '', /Nenhum contrato/);
    provider.destroy();
  });

  // ------------------------------------------------------------- 3. saldos

  await test('getNativeBalance() devolve o saldo REAL do nó (não 1.50 fixo)', async () => {
    const b = await svc.getNativeBalance();
    assert.equal(b.amount, '3.0');
    assert.equal(b.provenance, 'onchain');
    assert.equal(b.address, TEST_ADDRESS);
    assert.equal(b.wei, ethers.parseEther('3').toString());
  });

  await test('getNativeBalance() SEM carteira lança erro em vez de inventar saldo', async () => {
    const noKey = new OnchainService({ chainOverride: makeChain(rpcUrl) });
    await expectThrows(() => noKey.getNativeBalance(), 'Nenhuma carteira configurada', 'sem carteira');
    noKey.destroy();
  });

  await test('getTokenInfo() lê symbol/decimals on-chain', async () => {
    const info = await svc.getTokenInfo(TST);
    assert.equal(info.symbol, 'TST');
    assert.equal(info.decimals, 18);
    assert.equal(info.provenance, 'onchain');
  });

  await test('getTokenBalance() devolve saldo e allowance reais', async () => {
    const b = await svc.getTokenBalance(TST);
    assert.equal(b.amount, '100.0');
    assert.equal(b.token.symbol, 'TST');
    assert.equal(b.allowanceToRouter, '0');
    assert.equal(b.provenance, 'onchain');
  });

  // ------------------------------------------------------------ 4. cotação

  await test('getQuote() calcula amountOutMin a partir de getAmountsOut real', async () => {
    const q = await svc.getQuote(TST, USDC, '10', 100); // 1% de slippage
    assert.equal(q.provenance, 'onchain');
    assert.equal(q.amountInHuman, '10.0');
    assert.equal(q.amountOutHuman, '20.0'); // rate 2x no stub
    assert.equal(q.slippageBps, 100);
    assert.equal(q.amountOutMinRaw, ((ethers.parseEther('20') * 9900n) / 10000n).toString());
    assert.deepEqual(q.path, [TST, USDC]);
    assert.ok(q.expiresAt > Date.now());
  });

  await test('getQuote() rejeita slippage fora de faixa', async () => {
    await expectThrows(() => svc.getQuote(TST, USDC, '1', 9000), 'slippageBps inválido', 'slippage 9000');
  });

  await test('getQuote() rejeita tokenIn == tokenOut', async () => {
    await expectThrows(() => svc.getQuote(TST, TST, '1'), 'mesmo endereço', 'mesmo token');
  });

  // ----------------------------------------------- 5. ausência de fabricação

  await test('swap() SEM confirm NÃO envia transação e NÃO inventa hash', async () => {
    const before = stub.getTransactions().length;
    const res = await svc.swap({ tokenIn: TST, tokenOut: USDC, amountIn: '1' });
    assert.equal(res.dryRun, true);
    assert.equal(res.status, 'NOT_SENT');
    assert.equal(res.hash, null, 'hash deve ser null quando nada foi enviado');
    assert.equal(res.provenance, 'local');
    assert.equal(stub.getTransactions().length, before, 'nenhuma tx deveria ter sido enviada');
    assert.match(res.dryRunReason || '', /confirm/i);
  });

  await test('swap() com dryRun=true explicitamente também não envia', async () => {
    const before = stub.getTransactions().length;
    const res = await svc.swap({ tokenIn: TST, tokenOut: USDC, amountIn: '1', dryRun: true, confirm: true });
    assert.equal(res.hash, null);
    assert.equal(stub.getTransactions().length, before);
  });

  await test('swap() em rede MAINNET sem allowLive lança e não envia nada', async () => {
    const live = new OnchainService({
      chainOverride: makeChain(rpcUrl, 'mainnet', 'stub_mainnet'),
      privateKey: TEST_PRIVATE_KEY,
      allowLive: false,
      maxNotionalUsd: 1_000_000,
    });
    await live.verifyRouter();
    const before = stub.getTransactions().length;
    await expectThrows(
      () => live.swap({ tokenIn: TST, tokenOut: USDC, amountIn: '1', confirm: true }),
      'exige allowLive',
      'guarda mainnet'
    );
    assert.equal(stub.getTransactions().length, before);
    live.destroy();
  });

  await test('swap() com router NÃO verificado é recusado', async () => {
    const fresh = new OnchainService({
      chainOverride: makeChain(rpcUrl, 'testnet', 'stub_unverified'),
      privateKey: TEST_PRIVATE_KEY,
      maxNotionalUsd: 1_000_000,
    });
    await expectThrows(
      () => fresh.swap({ tokenIn: TST, tokenOut: USDC, amountIn: '1', confirm: true }),
      'não verificado',
      'router não verificado'
    );
    fresh.destroy();
  });

  await test('swap() com saldo insuficiente lança ANTES de enviar', async () => {
    const before = stub.getTransactions().length;
    await expectThrows(
      () => svc.swap({ tokenIn: TST, tokenOut: USDC, amountIn: '200', confirm: true }),
      'Saldo insuficiente',
      'saldo insuficiente'
    );
    assert.equal(stub.getTransactions().length, before, 'nenhuma tx deveria ter sido enviada');
  });

  await test('guarda de notional bloqueia swap acima de ONCHAIN_MAX_NOTIONAL_USD', async () => {
    const capped = new OnchainService({
      chainOverride: makeChain(rpcUrl, 'testnet', 'stub_capped'),
      privateKey: TEST_PRIVATE_KEY,
      maxNotionalUsd: 1, // limite de 1 unidade
      confirmations: 1,
    });
    await capped.verifyRouter();
    const before = stub.getTransactions().length;
    await expectThrows(
      () => capped.swap({ tokenIn: TST, tokenOut: USDC, amountIn: '10', confirm: true }),
      'Guarda de risco',
      'guarda de notional'
    );
    assert.equal(stub.getTransactions().length, before);
    capped.destroy();
  });

  // --------------------------------------------------- 6. execução de verdade

  await test('swap(confirm=true) envia approve + swap REAIS e confirma', async () => {
    const before = stub.getTransactions().length;
    const res = await svc.swap({ tokenIn: TST, tokenOut: USDC, amountIn: '5', slippageBps: 100, confirm: true });

    assert.equal(res.status, 'CONFIRMED', res.error || 'esperava CONFIRMED');
    assert.ok(res.hash && /^0x[0-9a-f]{64}$/.test(res.hash), `hash real esperado, veio ${res.hash}`);
    assert.equal(res.provenance, 'onchain');
    assert.ok(res.blockNumber && res.blockNumber > 0, 'blockNumber real esperado');
    assert.equal(res.explorerUrl, `https://stub.explorer/tx/${res.hash}`);
    assert.ok(res.txFeeNative, 'taxa real esperada');
    assert.ok(res.approval, 'approve deveria ter sido enviado (allowance era 0)');
    assert.equal(res.approval!.status, 'CONFIRMED');

    const txs = stub.getTransactions().slice(before);
    assert.equal(txs.length, 2, `esperava 2 transações (approve + swap), vieram ${txs.length}`);

    const approve = txs[0].decoded;
    assert.equal(approve?.method, 'erc20.approve');
    assert.equal(String(approve?.args.spender).toLowerCase(), ROUTER.toLowerCase());
    // Aprovação EXATA, não infinita: protege o saldo residual da carteira.
    assert.equal(approve?.args.amount, ethers.parseEther('5').toString());

    const swap = txs[1].decoded;
    assert.equal(swap?.method, 'router.swapExactTokensForTokens');
    assert.equal(swap?.args.amountIn, ethers.parseEther('5').toString());
    assert.equal(swap?.args.amountOutMin, ((ethers.parseEther('10') * 9900n) / 10000n).toString());
    assert.equal(String(swap?.args.to).toLowerCase(), TEST_ADDRESS.toLowerCase());
  });

  await test('swap() relê saldo de saída e reporta o delta REAL', async () => {
    const res = await svc.swap({ tokenIn: TST, tokenOut: USDC, amountIn: '2', confirm: true });
    assert.equal(res.status, 'CONFIRMED');
    assert.ok(res.balanceOutBefore !== undefined, 'saldo antes deveria ter sido lido');
    assert.ok(res.balanceOutAfter !== undefined, 'saldo depois deveria ter sido lido');
    // rate 2x => 2 in vira 4 out
    assert.equal(res.realizedOutAmount, ethers.parseEther('4').toString());
  });

  await test('swap() não repete approve quando a allowance já cobre o valor', async () => {
    const before = stub.getTransactions().length;
    const res = await svc.swap({ tokenIn: TST, tokenOut: USDC, amountIn: '0.1', confirm: true });
    assert.equal(res.status, 'CONFIRMED');
    const txs = stub.getTransactions().slice(before);
    assert.equal(txs.length, 1, 'apenas o swap deveria ter sido enviado');
    assert.equal(txs[0].decoded?.method, 'router.swapExactTokensForTokens');
  });

  await test('swap() de token NATIVO usa swapExactETHForTokens com value', async () => {
    const before = stub.getTransactions().length;
    const res = await svc.swap({ tokenIn: 'NATIVE', tokenOut: TST, amountIn: '0.5', confirm: true });
    assert.equal(res.status, 'CONFIRMED', res.error);
    const txs = stub.getTransactions().slice(before);
    const swap = txs[txs.length - 1].decoded;
    assert.equal(swap?.method, 'router.swapExactETHForTokens');
    assert.equal(txs[txs.length - 1].value, ethers.parseEther('0.5'));
  });

  await test('swap() para token NATIVO usa swapExactTokensForETH', async () => {
    const before = stub.getTransactions().length;
    const res = await svc.swap({ tokenIn: USDC, tokenOut: 'NATIVE', amountIn: '1', confirm: true });
    assert.equal(res.status, 'CONFIRMED', res.error);
    const txs = stub.getTransactions().slice(before);
    assert.equal(txs[txs.length - 1].decoded?.method, 'router.swapExactTokensForETH');
  });

  await test('swap() reporta REVERTED quando a transação entra com status 0', async () => {
    const reverting = new LocalChainStub({
      chainId: 11155111,
      wrappedNative: WETH,
      router: ROUTER,
      revertTx: true,
      tokens: {
        [TST.toLowerCase()]: { symbol: 'TST', decimals: 18, balances: { [TEST_ADDRESS.toLowerCase()]: ethers.parseEther('100') }, allowances: {} },
        [USDC.toLowerCase()]: { symbol: 'USDC', decimals: 18, balances: { [TEST_ADDRESS.toLowerCase()]: ethers.parseEther('5000') }, allowances: {} },
      },
      nativeBalances: { [TEST_ADDRESS.toLowerCase()]: ethers.parseEther('3') },
    });
    const url2 = await reverting.start();
    const s2 = new OnchainService({ chainOverride: makeChain(url2, 'testnet', 'stub_revert'), privateKey: TEST_PRIVATE_KEY, maxNotionalUsd: 1_000_000 });
    await s2.verifyRouter();
    const res = await s2.swap({ tokenIn: 'NATIVE', tokenOut: TST, amountIn: '0.1', confirm: true });
    assert.equal(res.status, 'REVERTED');
    assert.match(res.error || '', /REVERTIDA/i);
    assert.ok(res.hash, 'mesmo revertida, o hash real existe');
    s2.destroy();
    await reverting.stop();
  });

  // --------------------------------------------------------- 7. ancoragem

  await test('anchorHash() grava o hash no calldata de uma transação real', async () => {
    const before = stub.getTransactions().length;
    const head = defaultAuditLogger.getLatestBlock()!.current_hash;
    const res = await svc.anchorHash(head);
    assert.equal(res.status, 'CONFIRMED');
    const txs = stub.getTransactions().slice(before);
    assert.equal(txs.length, 1);
    assert.equal(txs[0].data, `0x${head}`);
    assert.equal(txs[0].value, 0n);
  });

  await test('anchorHash() rejeita hash malformado', async () => {
    await expectThrows(() => svc.anchorHash('nao-e-hash'), 'inválido', 'hash inválido');
  });

  await test('getTransactionStatus() relê o receipt pelo hash', async () => {
    const res = await svc.swap({ tokenIn: TST, tokenOut: USDC, amountIn: '1', confirm: true });
    const st = await svc.getTransactionStatus(res.hash!);
    assert.equal(st.found, true);
    assert.equal(st.status, 'CONFIRMED');
    assert.equal(st.blockNumber, res.blockNumber);
    assert.equal(st.provenance, 'onchain');
    assert.equal(st.explorerUrl, `https://stub.explorer/tx/${res.hash}`);
  });

  await test('getTransactionStatus() de hash inexistente reporta found=false', async () => {
    const st = await svc.getTransactionStatus('0x' + 'ab'.repeat(32));
    assert.equal(st.found, false);
    assert.equal(st.status, 'SUBMITTED');
  });

  // --------------------------------------------------------- 8. adapter

  const adapter = new OnchainAdapter(svc, {
    // Lista de tokens da rede de teste. Em produção, o adapter usa o
    // TOKEN_REGISTRY (server/services/onchain/tokenRegistry.ts).
    tokenMap: { TST, USDC, WETH },
  });

  await test('adapter.ping() reporta conexão real', async () => {
    const p = await adapter.ping();
    assert.equal(p.connected, true);
    assert.ok(p.latencyMs >= 0);
    assert.equal(p.blockNumber, stub.getBlockNumber());
  });

  await test('getBlockNumber() NÃO devolve valor obsoleto do cache de 250ms do ethers', async () => {
    // Regressão documentada: AbstractProvider guarda getBlockNumber por 250 ms.
    // Sem a leitura fresca, o diagnóstico reportava altura antiga.
    const before = await svc.getBlockNumber();
    await svc.anchorHash('b'.repeat(64));
    const after = await svc.getBlockNumber();
    assert.ok(after > before, `altura deveria avançar (${before} -> ${after})`);
    assert.equal(after, stub.getBlockNumber(), 'deve bater exatamente com o nó');
  });

  await test('adapter.isSandbox deriva da rede (não de um botão)', async () => {
    assert.equal(adapter.isSandbox, true, 'stub é testnet => sandbox true');
    adapter.isSandbox = false; // tentativa de forçar
    assert.equal(adapter.isSandbox, true, 'setter não deve conseguir fingir mainnet/live');
  });

  await test('adapter.getBalances() devolve saldos REAIS, sem USDC 5400 fixo', async () => {
    const bals = await adapter.getBalances();
    const native = bals.find((b) => b.asset === 'ETH');
    assert.ok(native, 'saldo nativo esperado');
    assert.ok(Number(native!.total) > 0 && Number(native!.total) < 3.01);
    const fake = bals.find((b) => b.asset === 'USDC' && b.total === 5400);
    assert.equal(fake, undefined, 'saldo fabricado de 5400 USDC não pode existir');
  });

  await test('adapter.placeOrder() sem onchainConfirm NÃO executa (status QUEUED)', async () => {
    const before = stub.getTransactions().length;
    const order: SignedOrder = {
      id: 'ord-1',
      account_id: 'acc-1',
      symbol: 'TST/USDC',
      side: 'BUY',
      quantity: 1,
      price: 2,
    };
    const receipt = await adapter.placeOrder(order);
    assert.equal(receipt.status, 'QUEUED');
    assert.equal(receipt.success, false);
    assert.equal(receipt.externalOrderId, undefined);
    assert.equal(stub.getTransactions().length, before, 'nenhuma tx enviada sem confirmação');
  });

  await test('adapter.placeOrder() BUY com onchainConfirm executa swap real', async () => {
    const order: SignedOrder = {
      id: 'ord-2',
      account_id: 'acc-1',
      symbol: 'TST/USDC',
      side: 'BUY',
      quantity: 1,
      price: 4,
      meta: { onchainConfirm: true, slippageBps: 50 },
    };
    const receipt = await adapter.placeOrder(order);
    assert.equal(receipt.status, 'FILLED', receipt.error);
    assert.equal(receipt.success, true);
    assert.ok(receipt.externalOrderId && /^0x[0-9a-f]{64}$/.test(receipt.externalOrderId));
    // BUY TST/USDC => tokenIn é USDC
    const tx = stub.getTransactions().at(-1)!;
    assert.equal(tx.decoded?.method, 'router.swapExactTokensForTokens');
    assert.equal(String((tx.decoded!.args.path as unknown as string[])[0]).toLowerCase(), USDC.toLowerCase());
  });

  await test('adapter.placeOrder() SELL inverte a direção do swap', async () => {
    const order: SignedOrder = {
      id: 'ord-3',
      account_id: 'acc-1',
      symbol: 'TST/USDC',
      side: 'SELL',
      quantity: 1,
      meta: { onchainConfirm: true },
    };
    const receipt = await adapter.placeOrder(order);
    assert.equal(receipt.status, 'FILLED', receipt.error);
    const tx = stub.getTransactions().at(-1)!;
    // SELL TST/USDC => tokenIn é TST
    assert.equal(String((tx.decoded!.args.path as unknown as string[])[0]).toLowerCase(), TST.toLowerCase());
  });

  await test('adapter.placeOrder() rejeita par sem token registrado na rede', async () => {
    const order: SignedOrder = {
      id: 'ord-4',
      account_id: 'acc-1',
      symbol: 'DOGE/USDC',
      side: 'BUY',
      quantity: 1,
      price: 1,
      meta: { onchainConfirm: true },
    };
    const receipt = await adapter.placeOrder(order);
    assert.equal(receipt.status, 'REJECTED');
    assert.equal(receipt.success, false);
    assert.match(receipt.error || '', /não registrado/i);
  });

  await test('adapter.getOrder() lê o receipt real; hash lixo não vira FILLED', async () => {
    const order: SignedOrder = {
      id: 'ord-5',
      account_id: 'acc-1',
      symbol: 'TST/USDC',
      side: 'SELL',
      quantity: 1,
      meta: { onchainConfirm: true },
    };
    const receipt = await adapter.placeOrder(order);
    const st = await adapter.getOrder(receipt.externalOrderId!);
    assert.equal(st.status, 'FILLED');
    assert.equal(st.externalOrderId, receipt.externalOrderId);

    const garbage = await adapter.getOrder('qualquer-coisa');
    assert.equal(garbage.status, 'REJECTED', 'orderId inválido nunca pode virar FILLED');
    assert.equal(garbage.filledQuantity, 0);

    const unknown = await adapter.getOrder('0x' + 'cd'.repeat(32));
    assert.equal(unknown.status, 'PENDING', 'hash válido mas não minerado => PENDING');
  });

  await test('adapter.cancelOrder() é false: transação on-chain não se cancela', async () => {
    assert.equal(await adapter.cancelOrder('qualquer'), false);
  });

  await test('adapter.getStatus() não inventa lastPingMs nem isConnected', async () => {
    const freshAdapter = new OnchainAdapter(
      new OnchainService({ chainOverride: makeChain(rpcUrl, 'testnet', 'stub_status'), privateKey: TEST_PRIVATE_KEY }),
      { tokenMap: { TST, USDC } }
    );
    const st = freshAdapter.getStatus();
    assert.equal(st.isConnected, false, 'antes de qualquer ping real, isConnected deve ser false');
    assert.equal(st.lastPingMs, 0);
  });

  // ------------------------------------------------- 9. trilha de auditoria
  setOnchainService(svc); // AuditAnchorService ancora usando este service

  await test('AuditAnchorService persiste blocos e assina com HMAC real', async (  ) => {
    const tmp = `/tmp/qt-audit-${Date.now()}`;
    const svcAudit = new AuditAnchorService(tmp);
    setAuditAnchorService(svcAudit);
    defaultAuditLogger.resetChain();
    defaultAuditLogger.append({
      source: 'TEST',
      timestamp: Date.now() / 1000,
      payload: { symbol: 'TST/USDC', close: 1.23, volume: 10, provider: 'test' },
      hash: 'a'.repeat(64),
      signature: 'x',
      status: 'APPROVED',
    });
    const written = svcAudit.persistNewBlocks();
    assert.ok(written >= 2, `esperava genesis + 1 bloco, gravou ${written}`);
    assert.equal(svcAudit.countPersistedBlocks(), 2);
    const report = svcAudit.verify();
    assert.equal(report.valid, true, report.brokenReason);
    assert.equal(report.totalBlocks, 2);
    assert.equal(report.persistedBlocks, 2);
  });

  await test('AuditAnchorService.anchorNow() ancora o hash da cabeça on-chain', async () => {
    const tmp = `/tmp/qt-audit-anchor-${Date.now()}`;
    const svcAudit = new AuditAnchorService(tmp);
    setAuditAnchorService(svcAudit);
    const head = defaultAuditLogger.getLatestBlock()!.current_hash;
    const rec = await svcAudit.anchorNow();
    assert.equal(rec.anchored, true, rec.reason);
    assert.equal(rec.auditHeadHash, head);
    assert.ok(rec.txHash && /^0x[0-9a-f]{64}$/.test(rec.txHash));
    assert.ok(rec.explorerUrl);
    assert.equal(svcAudit.verifyAnchorSignature(rec), true, 'assinatura HMAC do registro deve conferir');
  });

  await test('assinatura HMAC detecta adulteração do registro de âncora', async () => {
    const tmp = `/tmp/qt-audit-tamper-${Date.now()}`;
    const svcAudit = new AuditAnchorService(tmp);
    const rec = await svcAudit.anchorNow();
    const tampered = { ...rec, auditHeadHash: 'f'.repeat(64) };
    assert.equal(svcAudit.verifyAnchorSignature(tampered), false);
  });

  // --------------------------------------------------------- 10. utilidades

  await test('parsePair() interpreta BASE/QUOTE e sufixo de stablecoin', () => {
    assert.deepEqual(parsePair('ETH/USDC'), { base: 'ETH', quote: 'USDC' });
    assert.deepEqual(parsePair('btcusdt'), { base: 'BTC', quote: 'USDT' });
  });

  await test('resolveToken() é específico por rede (fim do USDC-da-Polygon-em-todo-lugar)', () => {
    const ethUsdc = resolveToken('ethereum', 'USDC');
    const polyUsdc = resolveToken('polygon', 'USDC');
    assert.equal(ethUsdc, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
    assert.equal(polyUsdc, '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359');
    assert.notEqual(ethUsdc, polyUsdc);
    assert.throws(() => resolveToken('sepolia', 'DOGE'), /não registrado/);
  });

  // ------------------------------------------------------------ encerramento

  svc.destroy();
  await stub.stop();

  console.log(`\n\x1b[1mResultado: ${passed} passaram, ${failed} falharam\x1b[0m`);
  if (failures.length) {
    console.log('\n\x1b[31mFalhas:\x1b[0m');
    for (const f of failures) console.log(`  • ${f}`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n\x1b[31mErro fatal no teste de integração:\x1b[0m', err);
  process.exit(1);
});
