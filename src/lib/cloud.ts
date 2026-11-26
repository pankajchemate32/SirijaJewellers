import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DatabaseState } from '../types/database';
import { buildDatabaseState, ChangeSet, TABLES, TableName } from './changeset';

/**
 * Supabase connection. Set these two values in a `.env.local` file
 * (see .env.example). Without them the app runs in Local Mode and keeps
 * data in this browser only.
 */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

export const isCloudMode = supabase !== null;

const PAGE = 1000;

async function fetchTable(client: SupabaseClient, table: TableName): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = client.from(table).select('*').range(from, from + PAGE - 1);
    if (table !== 'shop_settings') q = q.order('created_at', { ascending: false }).order('id');
    const { data, error } = await q;
    if (error) throw new Error(`Could not load ${table}: ${error.message}`);
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

/** Loads the whole shop database. Returns null when the shop has no settings row yet. */
export async function loadCloudDatabase(client: SupabaseClient): Promise<DatabaseState | null> {
  const names: TableName[] = ['shop_settings', ...TABLES];
  const results = await Promise.all(names.map((t) => fetchTable(client, t)));
  const rows = Object.fromEntries(names.map((t, i) => [t, results[i]])) as Record<TableName, Record<string, unknown>[]>;
  return buildDatabaseState(rows);
}

/** Saves one action's changes in a single database transaction. */
export async function pushChanges(client: SupabaseClient, changes: ChangeSet): Promise<void> {
  const { error } = await client.rpc('apply_changeset', { p_changes: changes });
  if (error) throw new Error(friendlyDbError(error.message));
}

export function friendlyDbError(message: string): string {
  if (/ux_stock_serial/.test(message)) return 'This certificate / serial number already exists in stock.';
  if (/ux_sale_items_active_stock/.test(message)) return 'This coin/bar has already been sold on another bill.';
  if (/sales_invoice_number_key/.test(message)) return 'Another counter saved a bill at the same moment, so this bill was not saved. Your items are still in the bill: check them and save again.';
  if (/purchases_purchase_number_key/.test(message)) return 'Another purchase took this number at the same moment. Please save again.';
  if (/stock_items_pkey/.test(message)) return 'Another device added stock at the same moment. Please save again.';
  if (/ux_products_sku/.test(message)) return 'This SKU code already exists.';
  return message;
}
