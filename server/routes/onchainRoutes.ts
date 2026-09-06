/**
 * onchainRoutes.ts — Endpoints da camada on-chain EVM real.
 *
 * Todas as rotas falam diretamente com OnchainService e AuditAnchorService.
 * Nenhum dado simulado ou inventado é retornado.
 */

import { Router, Request, Response } from 'express';
import { getOnchainService } from '../services/onchain/onchainService.js';
import { getAuditAnchorService } from '../services/onchain/auditAnchor.js';
import { listChains, getChain, isChainKey } from '../services/onchain/chainRegistry.js';
import { resolveToken, getRegisteredTokens } from '../services/onchain/tokenRegistry.js';
import type { ChainKey } from '../services/onchain/types.js';

export function createOnchainRouter(): Router {
  const router = Router();

  // -------------------------------------------------- Redes e Configuração

  // GET /api/onchain/chains - Lista todas as redes e status de verificação
  router.get('/chains', (_req: Request, res: Response) => {
    try {
      const svc = getOnchainService();
      const activeChain = svc.getActiveChain().key;
      const chains = listChains();
      res.json({
        activeChain,
        chains,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // GET /api/onchain/status - Status da carteira, RPC e rede ativa
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const svc = getOnchainService();
      const diag = await svc.diagnose();
      const wallet = svc.walletState();
      const tokens = getRegisteredTokens(wallet.chainKey);

      res.json({
        wallet,
        rpc: diag,
        tokens,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // POST /api/onchain/chain - Altera a rede ativa
  router.post('/chain', async (req: Request, res: Response) => {
    try {
      const { chainKey } = req.body || {};
      if (!chainKey || !isChainKey(chainKey)) {
        return res.status(400).json({ error: `Rede inválida: ${chainKey}. Use uma das redes suportadas.` });
      }

      const svc = getOnchainService();
      await svc.switchChain(chainKey as ChainKey);
      res.json({
        success: true,
        chain: svc.getActiveChain(),
      });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || String(e) });
    }
  });

  // POST /api/onchain/verify - Verifica o router da rede ativa ON-CHAIN
  router.post('/verify', async (_req: Request, res: Response) => {
    try {
      const svc = getOnchainService();
      const chain = await svc.verifyRouter();
      res.json({
        success: chain.verification === 'verified',
        verification: chain.verification,
        detail: chain.verificationDetail,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // -------------------------------------------------- Saldos e Resolução

  // GET /api/onchain/balances - Saldos reais on-chain (nativo + ERC-20)
  router.get('/balances', async (req: Request, res: Response) => {
    try {
      const svc = getOnchainService();
      const tokenAddresses = req.query.tokens
        ? String(req.query.tokens)
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      const balances = await svc.getAllBalances(tokenAddresses);
      res.json(balances);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // GET /api/onchain/resolve/:symbol - Resolve símbolo para contrato na rede ativa
  router.get('/resolve/:symbol', (req: Request, res: Response) => {
    try {
      const svc = getOnchainService();
      const chainKey = svc.getActiveChain().key;
      const symbol = req.params.symbol;
      const address = resolveToken(chainKey, symbol);
      res.json({ symbol, address, chainKey });
    } catch (e: any) {
      res.status(404).json({ error: e?.message || String(e) });
    }
  });

  // -------------------------------------------------- Cotação e Execução

  // POST /api/onchain/quote - Cotação real consultada na DEX
  router.post('/quote', async (req: Request, res: Response) => {
    try {
      const { tokenIn, tokenOut, amountIn, slippageBps } = req.body || {};
      if (!tokenIn || !tokenOut || !amountIn) {
        return res.status(400).json({ error: 'tokenIn, tokenOut e amountIn são obrigatórios.' });
      }

      const svc = getOnchainService();
      const quote = await svc.getQuote(
        tokenIn,
        tokenOut,
        String(amountIn),
        slippageBps ? Number(slippageBps) : undefined
      );

      res.json({ success: true, quote });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || String(e) });
    }
  });

  // POST /api/onchain/swap - Executa swap real ou dry-run auditado
  router.post('/swap', async (req: Request, res: Response) => {
    try {
      const { tokenIn, tokenOut, amountIn, slippageBps, confirm, dryRun } = req.body || {};
      if (!tokenIn || !tokenOut || !amountIn) {
        return res.status(400).json({ error: 'tokenIn, tokenOut e amountIn são obrigatórios.' });
      }

      const svc = getOnchainService();
      const activeChain = svc.getActiveChain();

      // Se for mainnet e estiver tentando executar de verdade, exige cabeçalho de confirmação
      if (activeChain.env === 'mainnet' && confirm === true && !dryRun) {
        const headerVal = req.header('X-Confirm-Live');
        if (headerVal !== activeChain.key) {
          return res.status(412).json({
            sent: false,
            error: `Operação em Mainnet exige cabeçalho 'X-Confirm-Live: ${activeChain.key}'.`,
          });
        }
      }

      const result = await svc.swap({
        tokenIn,
        tokenOut,
        amountIn: String(amountIn),
        slippageBps: slippageBps ? Number(slippageBps) : undefined,
        confirm: confirm === true,
        dryRun: dryRun === true,
      });

      res.json({
        success: result.status === 'CONFIRMED',
        result,
      });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || String(e) });
    }
  });

  // GET /api/onchain/tx/:hash - Consulta receipt real de transação
  router.get('/tx/:hash', async (req: Request, res: Response) => {
    try {
      const svc = getOnchainService();
      const status = await svc.getTransactionStatus(req.params.hash);
      res.json(status);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // -------------------------------------------------- Auditoria On-Chain

  // POST /api/onchain/audit/anchor - Ancora hash da auditoria on-chain
  router.post('/audit/anchor', async (req: Request, res: Response) => {
    try {
      const anchorSvc = getAuditAnchorService();
      const anchor = await anchorSvc.anchorNow({ dryRun: req.body?.dryRun === true });
      res.json({
        success: anchor.anchored,
        anchor,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // GET /api/onchain/audit/integrity - Valida integridade criptográfica da cadeia
  router.get('/audit/integrity', (_req: Request, res: Response) => {
    try {
      const anchorSvc = getAuditAnchorService();
      const report = anchorSvc.verify();
      res.json(report);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  return router;
}
