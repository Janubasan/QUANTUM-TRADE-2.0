import { createHash } from 'node:crypto';
import type {
  OperationBatchValidationRequest,
  OperationBatchValidationResult,
  OperationCandidate,
  OperationValidationResult,
  PortfolioPolicy,
} from '../../src/types.js';
import { store } from '../data/store.js';

const EPSILON = 1e-9;

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function batchHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function round(value: number, digits = 8): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizePolicy(request: OperationBatchValidationRequest): PortfolioPolicy {
  const initial = finitePositive(request.initial_capital_usd) ? request.initial_capital_usd : 100;
  const maxPositionPct = finitePositive(request.max_position_pct)
    ? Math.min(request.max_position_pct, 0.02)
    : 0.02;
  const maxConcurrent = finitePositive(request.max_concurrent_positions)
    ? Math.min(Math.floor(request.max_concurrent_positions), 5)
    : 5;
  const maxGrossPct = finitePositive(request.max_gross_exposure_pct)
    ? Math.min(request.max_gross_exposure_pct, 0.1)
    : 0.1;
  const maxRiskPct = finitePositive(request.max_risk_per_trade_pct)
    ? Math.min(request.max_risk_per_trade_pct, 0.01)
    : 0.01;
  return {
    initial_capital_usd: round(initial, 2),
    max_position_pct: round(maxPositionPct * 100, 4),
    max_concurrent_positions: maxConcurrent,
    max_gross_exposure_pct: round(maxGrossPct * 100, 4),
    max_risk_per_trade_pct: round(maxRiskPct * 100, 4),
  };
}

function validateOne(
  operation: OperationCandidate,
  index: number,
  policy: PortfolioPolicy,
  existingExposure: number,
  acceptedAssets: Set<string>,
  seenIds: Set<string>,
  acceptedCount: number
): OperationValidationResult {
  const operationId = String(operation.operation_id || `operation-${String(index + 1).padStart(3, '0')}`);
  const asset = String(operation.asset || '').trim().toUpperCase();
  const side = operation.side;
  const entry = Number(operation.entry_price);
  const stop = Number(operation.stop_price);
  const target = Number(operation.take_profit_price);
  const reasons: string[] = [];
  const duplicateId = seenIds.has(operationId);
  const duplicateAsset = acceptedAssets.has(asset);
  const validSide = side === 'LONG' || side === 'SHORT';
  const pricesConsistent =
    validSide &&
    finitePositive(entry) &&
    finitePositive(stop) &&
    finitePositive(target) &&
    (side === 'LONG' ? stop < entry && entry < target : stop > entry && entry > target);

  const suppliedQuantity = Number(operation.quantity);
  const suppliedNotional = Number(operation.notional_usd);
  const hasQuantity = finitePositive(suppliedQuantity);
  const hasNotional = finitePositive(suppliedNotional);
  const quantity = hasQuantity ? suppliedQuantity : hasNotional && finitePositive(entry) ? suppliedNotional / entry : 0;
  const notional = finitePositive(entry) && finitePositive(quantity) ? entry * quantity : 0;
  const notionalConsistent =
    !hasQuantity || !hasNotional || (finitePositive(suppliedNotional) && Math.abs(notional - suppliedNotional) / suppliedNotional <= 0.01);
  const maxPositionNotional = policy.initial_capital_usd * (policy.max_position_pct / 100);
  const maxGrossExposure = policy.initial_capital_usd * (policy.max_gross_exposure_pct / 100);
  const maxRisk = policy.initial_capital_usd * (policy.max_risk_per_trade_pct / 100);
  const risk = finitePositive(quantity) && finitePositive(entry) && finitePositive(stop) ? Math.abs(entry - stop) * quantity : 0;
  const notionalWithinLimit = notional > EPSILON && notional <= maxPositionNotional + EPSILON && notionalConsistent;
  const riskWithinLimit = risk > EPSILON && risk <= maxRisk + EPSILON;
  const exposureAfter = existingExposure + notional;
  const exposureWithinLimit = exposureAfter <= maxGrossExposure + EPSILON;
  const concurrencyWithinLimit = acceptedCount < policy.max_concurrent_positions;
  const marketPrice = Number(operation.market_price);
  const marketPriceGuard =
    !Number.isFinite(marketPrice) || marketPrice <= 0 || (finitePositive(entry) && Math.abs(entry - marketPrice) / marketPrice <= 0.02);

  if (!asset) reasons.push('Ativo obrigatório.');
  if (!validSide) reasons.push('side deve ser LONG ou SHORT.');
  if (!pricesConsistent) reasons.push('Stop e take profit não respeitam a direção da operação.');
  if (!hasQuantity && !hasNotional) reasons.push('Informe quantity ou notional_usd.');
  if (!notionalConsistent) reasons.push('quantity e notional_usd divergem mais de 1%.');
  if (!notionalWithinLimit) reasons.push(`Notional excede o limite de ${maxPositionNotional.toFixed(2)} USD.`);
  if (!riskWithinLimit) reasons.push(`Risco no stop excede o limite de ${maxRisk.toFixed(2)} USD.`);
  if (!exposureWithinLimit) reasons.push(`Exposição agregada excede ${maxGrossExposure.toFixed(2)} USD.`);
  if (!concurrencyWithinLimit) reasons.push(`Limite de ${policy.max_concurrent_positions} posições simultâneas atingido.`);
  if (duplicateId) reasons.push('operation_id duplicado no lote.');
  if (duplicateAsset) reasons.push('Já existe uma posição do mesmo ativo neste lote.');
  if (!marketPriceGuard) reasons.push('Preço de entrada diverge mais de 2% da cotação informada.');

  const status: OperationValidationResult['status'] = reasons.length === 0 ? 'VALID' : 'REJECTED';
  return {
    operation_id: operationId,
    asset,
    status,
    reasons,
    rule_checks: {
      prices_consistent: pricesConsistent,
      notional_within_limit: notionalWithinLimit,
      risk_within_limit: riskWithinLimit,
      exposure_within_limit: exposureWithinLimit && concurrencyWithinLimit,
      no_duplicate_asset: !duplicateAsset && !duplicateId,
      market_price_guard: marketPriceGuard,
    },
    side: validSide ? side : 'LONG',
    entry_price: round(entry),
    stop_price: round(stop),
    take_profit_price: round(target),
    quantity: round(quantity),
    notional_usd: round(notional, 2),
    risk_usd: round(risk, 2),
    exposure_after_usd: round(status === 'VALID' ? exposureAfter : existingExposure, 2),
  };
}

export class OperationBatchService {
  private lastBatch: OperationBatchValidationResult | null = null;

  validate(request: OperationBatchValidationRequest): OperationBatchValidationResult {
    const policy = normalizePolicy(request);
    const existingExposure = finitePositive(request.existing_exposure_usd) ? request.existing_exposure_usd : 0;
    const operations = Array.isArray(request.operations) ? request.operations.slice(0, 50) : [];
    const acceptedAssets = new Set<string>();
    const seenIds = new Set<string>();
    const results: OperationValidationResult[] = [];
    let acceptedExposure = existingExposure;
    let acceptedRisk = 0;
    let acceptedCount = 0;

    for (let index = 0; index < operations.length; index += 1) {
      const operation = operations[index];
      const result = validateOne(operation, index, policy, acceptedExposure, acceptedAssets, seenIds, acceptedCount);
      const operationId = result.operation_id;
      seenIds.add(operationId);
      if (result.status === 'VALID') {
        acceptedAssets.add(result.asset);
        acceptedExposure += result.notional_usd;
        acceptedRisk += result.risk_usd;
        acceptedCount += 1;
      }
      results.push(result);
    }

    const accepted = results.filter((operation) => operation.status === 'VALID');
    const rejected = results.length - accepted.length;
    const status: OperationBatchValidationResult['status'] =
      accepted.length === results.length && accepted.length > 0
        ? 'VALID_BATCH'
        : accepted.length > 0
          ? 'PARTIAL_BATCH'
          : 'REJECTED_BATCH';
    const generatedAt = new Date().toISOString();
    const batchId = `batch-${batchHash({ policy, existingExposure, operations }).slice(0, 16)}`;
    const result: OperationBatchValidationResult = {
      batch_id: batchId,
      status,
      policy,
      accepted_count: accepted.length,
      rejected_count: rejected,
      accepted_notional_usd: round(accepted.reduce((sum, operation) => sum + operation.notional_usd, 0), 2),
      accepted_risk_usd: round(acceptedRisk, 2),
      operations: results,
      generated_at: generatedAt,
    };
    this.lastBatch = result;
    store.addLog(
      status === 'VALID_BATCH' ? 'RULE' : 'ERROR',
      `Lote ${batchId}: ${accepted.length} operações válidas, ${rejected} rejeitadas; exposição aceita USD ${result.accepted_notional_usd.toFixed(2)}.`
    );
    return result;
  }

  getLast(): OperationBatchValidationResult | null {
    return this.lastBatch;
  }
}

export const operationBatchService = new OperationBatchService();
