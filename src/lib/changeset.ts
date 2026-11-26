import { DatabaseState } from '../types/database';

/**
 * Converts between the in-app DatabaseState and database rows, and works out
 * exactly which rows changed after an action (so only those are saved).
 */

export const TABLES = [
  'users',
  'metal_rates',
  'products',
  'suppliers',
  'customers',
  'purchases',
  'purchase_items',
  'sales',
  'sale_items',
  'returns',
  'stock_items',
  'payments',
  'stock_movements',
] as const;

export type TableName = (typeof TABLES)[number] | 'shop_settings';

export interface ChangeSet {
  upserts: Partial<Record<TableName, Record<string, unknown>[]>>;
  deletes: Partial<Record<TableName, string[]>>;
}

/** The counters live on the shop_settings row in the database. */
export function settingsRow(db: DatabaseState): Record<string, unknown> {
  return {
    ...db.shop_settings,
    next_stock_seq: db.next_stock_seq,
    next_purchase_seq: db.next_purchase_seq,
    next_return_seq: db.next_return_seq,
  };
}

function settingsChanged(prev: DatabaseState, next: DatabaseState): boolean {
  return (
    prev.shop_settings !== next.shop_settings ||
    prev.next_stock_seq !== next.next_stock_seq ||
    prev.next_purchase_seq !== next.next_purchase_seq ||
    prev.next_return_seq !== next.next_return_seq
  );
}

/** Rows are immutable objects: an unchanged row keeps the same reference. */
export function diffDatabase(prev: DatabaseState, next: DatabaseState): ChangeSet {
  const changes: ChangeSet = { upserts: {}, deletes: {} };

  if (settingsChanged(prev, next)) {
    changes.upserts.shop_settings = [settingsRow(next)];
  }

  for (const table of TABLES) {
    const before = prev[table] as unknown as { id: string }[];
    const after = next[table] as unknown as { id: string }[];
    if (before === after) continue;

    const beforeById = new Map(before.map((r) => [r.id, r]));
    const afterIds = new Set<string>();
    const upserts: Record<string, unknown>[] = [];
    for (const row of after) {
      afterIds.add(row.id);
      if (beforeById.get(row.id) !== row) upserts.push(row as unknown as Record<string, unknown>);
    }
    const deletes = before.filter((r) => !afterIds.has(r.id)).map((r) => r.id);
    if (upserts.length) changes.upserts[table] = upserts;
    if (deletes.length) changes.deletes[table] = deletes;
  }
  return changes;
}

export function isEmptyChangeSet(c: ChangeSet): boolean {
  return Object.keys(c.upserts).length === 0 && Object.keys(c.deletes).length === 0;
}

/** Postgres returns nulls for empty optional columns; the app expects undefined. */
function cleanRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== null || ['customer_id', 'purchase_id', 'supplier_id', 'sale_id', 'sale_item_id', 'party_id', 'previous_status'].includes(k)) {
      out[k] = typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) && NUMERIC_COLUMNS.has(k) ? Number(v) : v;
    }
  }
  return out as T;
}

const NUMERIC_COLUMNS = new Set([
  'rate_per_gram', 'weight_grams', 'subtotal', 'discount_total', 'taxable_amount', 'gst_rate', 'cgst_amount',
  'sgst_amount', 'igst_amount', 'gst_total', 'grand_total', 'amount_paid', 'balance_due', 'making_charges',
  'discount', 'gst_amount', 'total_amount', 'unit_cost', 'purchase_price', 'amount_received', 'line_total',
  'purchase_cost_snapshot', 'gold_rate_snapshot', 'silver_rate_snapshot', 'refund_amount', 'amount',
  'default_gst_rate', 'default_gold_making_charge', 'default_silver_making_charge',
]);

/** Postgres timestamps come back as "2026-11-26T03:49:20.123+00:00"; dates as "2026-11-26". */
export function buildDatabaseState(rows: Record<TableName, Record<string, unknown>[]>): DatabaseState | null {
  const settings = rows.shop_settings?.[0];
  if (!settings) return null;
  const s = cleanRow<Record<string, unknown>>(settings);
  const { next_stock_seq, next_purchase_seq, next_return_seq, ...shop } = s;
  const state: Record<string, unknown> = {
    shop_settings: shop,
    next_stock_seq: Number(next_stock_seq) || 1001,
    next_purchase_seq: Number(next_purchase_seq) || 1,
    next_return_seq: Number(next_return_seq) || 1,
  };
  for (const table of TABLES) {
    state[table] = (rows[table] || []).map((r) => cleanRow(r));
  }
  return state as unknown as DatabaseState;
}
