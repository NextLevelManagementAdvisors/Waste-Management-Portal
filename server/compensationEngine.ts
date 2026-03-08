import { pool } from './db';
import type { CompensationBreakdown, CompensationRuleType, RouteValuation, PayMode } from '../shared/types/operations';

interface DbCompensationRule {
  id: string;
  name: string;
  rule_type: CompensationRuleType;
  conditions: Record<string, any>;
  rate_amount: number | null;
  rate_multiplier: number;
  priority: number;
  active: boolean;
  effective_from: string | null;
  effective_to: string | null;
}

interface LocationContext {
  id: string;
  address: string;
  service_type: string;
  difficulty_score: number;
  custom_rate: number | null;
  zone_id: string | null;
}

interface ContractContext {
  per_stop_rate: number | null;
}

/**
 * Fetch all active compensation rules, optionally filtered to a reference date
 * for effective_from/effective_to range checks.
 */
export async function getActiveRules(referenceDate?: Date): Promise<DbCompensationRule[]> {
  const refDate = referenceDate || new Date();
  const { rows } = await pool.query(
    `SELECT * FROM compensation_rules
     WHERE active = TRUE
       AND (effective_from IS NULL OR effective_from <= $1)
       AND (effective_to IS NULL OR effective_to >= $1)
     ORDER BY rule_type, priority DESC`,
    [refDate.toISOString().split('T')[0]]
  );
  return rows.map((r: any) => ({
    ...r,
    rate_amount: r.rate_amount != null ? parseFloat(r.rate_amount) : null,
    rate_multiplier: parseFloat(r.rate_multiplier),
    priority: parseInt(r.priority),
  }));
}

/**
 * Calculate compensation for a single location/order.
 *
 * Precedence chain:
 *   location.custom_rate  >  contract.per_stop_rate  >  rules engine (base_rate * modifiers)
 */
export function calculateOrderCompensation(
  location: LocationContext,
  contract: ContractContext | null,
  rules: DbCompensationRule[],
): CompensationBreakdown {
  // 1. Location custom rate — highest priority override
  if (location.custom_rate != null) {
    return {
      baseRate: location.custom_rate,
      modifiers: [],
      locationCustomRate: location.custom_rate,
      contractPerStopRate: contract?.per_stop_rate ?? null,
      finalRate: location.custom_rate,
      source: 'custom_rate',
    };
  }

  // 2. Contract per-stop rate — applied with modifiers
  if (contract?.per_stop_rate != null) {
    const modifiers = evaluateModifiers(location, rules);
    let multiplier = 1;
    for (const m of modifiers) multiplier *= m.multiplier;
    const finalRate = Math.round(contract.per_stop_rate * multiplier * 100) / 100;

    return {
      baseRate: contract.per_stop_rate,
      modifiers,
      locationCustomRate: null,
      contractPerStopRate: contract.per_stop_rate,
      finalRate,
      source: 'contract_rate',
    };
  }

  // 3. Rules engine — base_rate * all matching modifiers
  const baseRule = rules.find(r => r.rule_type === 'base_rate');
  const baseRate = baseRule?.rate_amount ?? 0;

  const modifiers = evaluateModifiers(location, rules);
  let multiplier = 1;
  for (const m of modifiers) multiplier *= m.multiplier;
  const finalRate = Math.round(baseRate * multiplier * 100) / 100;

  return {
    baseRate,
    modifiers,
    locationCustomRate: null,
    contractPerStopRate: null,
    finalRate,
    source: 'rules_engine',
  };
}

/**
 * Evaluate which modifier rules match a given location.
 * All matching modifiers are stacked (multiplicative).
 */
function evaluateModifiers(
  location: LocationContext,
  rules: DbCompensationRule[],
): CompensationBreakdown['modifiers'] {
  const modifiers: CompensationBreakdown['modifiers'] = [];

  for (const rule of rules) {
    if (rule.rule_type === 'base_rate') continue; // base_rate is not a modifier

    if (ruleMatchesLocation(rule, location)) {
      modifiers.push({
        ruleName: rule.name,
        ruleType: rule.rule_type,
        multiplier: rule.rate_multiplier,
      });
    }
  }

  return modifiers;
}

/**
 * Check whether a rule's conditions match the given location.
 */
function ruleMatchesLocation(rule: DbCompensationRule, location: LocationContext): boolean {
  const cond = rule.conditions || {};

  switch (rule.rule_type) {
    case 'service_type_modifier':
      return cond.service_type ? location.service_type === cond.service_type : true;

    case 'difficulty_modifier':
      if (cond.difficulty_min != null && location.difficulty_score < cond.difficulty_min) return false;
      if (cond.difficulty_max != null && location.difficulty_score > cond.difficulty_max) return false;
      return true;

    case 'zone_modifier':
      return cond.zone_id ? location.zone_id === cond.zone_id : true;

    default:
      return false;
  }
}

/**
 * Calculate the full route valuation — sum of all order compensations + pay mode logic.
 */
export async function calculateRouteValuation(routeId: string): Promise<RouteValuation> {
  // Fetch route details
  const routeResult = await pool.query(
    `SELECT r.id, r.base_pay, r.pay_mode, r.pay_premium, r.contract_id,
            rc.per_stop_rate AS contract_per_stop_rate
     FROM routes r
     LEFT JOIN route_contracts rc ON r.contract_id = rc.id
     WHERE r.id = $1`,
    [routeId]
  );
  if (routeResult.rows.length === 0) throw new Error(`Route not found: ${routeId}`);
  const route = routeResult.rows[0];

  // Fetch orders with location data
  const ordersResult = await pool.query(
    `SELECT rs.id AS order_id, rs.location_id,
            l.address, l.service_type, l.zone_id,
            COALESCE(l.difficulty_score, 1.0) AS difficulty_score,
            l.custom_rate
     FROM route_orders rs
     LEFT JOIN locations l ON rs.location_id = l.id
     WHERE rs.route_id = $1
     ORDER BY rs.order_number`,
    [routeId]
  );

  const rules = await getActiveRules();
  const contract: ContractContext | null = route.contract_per_stop_rate != null
    ? { per_stop_rate: parseFloat(route.contract_per_stop_rate) }
    : null;

  const orderBreakdowns: RouteValuation['orderBreakdowns'] = [];
  let computedValue = 0;

  for (const order of ordersResult.rows) {
    if (!order.location_id) {
      // Orders without a location (e.g., imported from OptimoRoute) — no compensation
      orderBreakdowns.push({
        orderId: order.order_id,
        locationId: order.location_id,
        address: order.address || 'Unknown',
        compensation: 0,
        breakdown: {
          baseRate: 0,
          modifiers: [],
          locationCustomRate: null,
          contractPerStopRate: null,
          finalRate: 0,
          source: 'rules_engine',
        },
      });
      continue;
    }

    const locationCtx: LocationContext = {
      id: order.location_id,
      address: order.address || '',
      service_type: order.service_type || 'residential',
      difficulty_score: parseFloat(order.difficulty_score) || 1.0,
      custom_rate: order.custom_rate != null ? parseFloat(order.custom_rate) : null,
      zone_id: order.zone_id,
    };

    const breakdown = calculateOrderCompensation(locationCtx, contract, rules);
    computedValue += breakdown.finalRate;

    orderBreakdowns.push({
      orderId: order.order_id,
      locationId: order.location_id,
      address: order.address || '',
      compensation: breakdown.finalRate,
      breakdown,
    });
  }

  computedValue = Math.round(computedValue * 100) / 100;

  const payMode: PayMode = route.pay_mode || 'dynamic';
  const basePay = route.base_pay != null ? parseFloat(route.base_pay) : null;
  const payPremium = parseFloat(route.pay_premium) || 0;

  let finalPay: number;
  switch (payMode) {
    case 'flat':
      finalPay = basePay ?? 0;
      break;
    case 'dynamic_premium':
      finalPay = Math.round((computedValue + payPremium) * 100) / 100;
      break;
    case 'dynamic':
    default:
      finalPay = computedValue;
      break;
  }

  return {
    computedValue,
    orderBreakdowns,
    payMode,
    basePay,
    payPremium,
    finalPay,
  };
}

/**
 * Recalculate and persist the computed_value for a route.
 * Call this after adding/removing orders or when compensation rules change.
 */
export async function recalculateRouteValue(routeId: string): Promise<RouteValuation> {
  const valuation = await calculateRouteValuation(routeId);

  // Update route computed_value
  await pool.query(
    `UPDATE routes SET computed_value = $1, updated_at = NOW() WHERE id = $2`,
    [valuation.computedValue, routeId]
  );

  // Update per-order compensation
  for (const order of valuation.orderBreakdowns) {
    await pool.query(
      `UPDATE route_orders SET compensation = $1 WHERE id = $2`,
      [order.compensation, order.orderId]
    );
  }

  return valuation;
}

/**
 * Calculate compensation for a single location without persisting.
 * Useful for previews (e.g., showing estimated compensation in review panel).
 */
export async function previewLocationCompensation(
  locationId: string,
  contractId?: string,
): Promise<CompensationBreakdown> {
  const locResult = await pool.query(
    `SELECT id, address, service_type, zone_id,
            COALESCE(difficulty_score, 1.0) AS difficulty_score,
            custom_rate
     FROM locations WHERE id = $1`,
    [locationId]
  );
  if (locResult.rows.length === 0) throw new Error(`Location not found: ${locationId}`);
  const loc = locResult.rows[0];

  let contract: ContractContext | null = null;
  if (contractId) {
    const cResult = await pool.query(
      `SELECT per_stop_rate FROM route_contracts WHERE id = $1`,
      [contractId]
    );
    if (cResult.rows.length > 0 && cResult.rows[0].per_stop_rate != null) {
      contract = { per_stop_rate: parseFloat(cResult.rows[0].per_stop_rate) };
    }
  }

  const rules = await getActiveRules();

  return calculateOrderCompensation(
    {
      id: loc.id,
      address: loc.address,
      service_type: loc.service_type || 'residential',
      difficulty_score: parseFloat(loc.difficulty_score) || 1.0,
      custom_rate: loc.custom_rate != null ? parseFloat(loc.custom_rate) : null,
      zone_id: loc.zone_id,
    },
    contract,
    rules,
  );
}
