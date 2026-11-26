import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createEmptyDatabase, createSeedDatabase } from '../data/seedData';
import { isCloudMode, loadCloudDatabase, pushChanges, supabase } from '../lib/cloud';
import { ChangeSet, diffDatabase, isEmptyChangeSet } from '../lib/changeset';
import {
  Customer,
  DatabaseState,
  MetalRate,
  MetalType,
  Payment,
  PaymentMode,
  Product,
  Purchase,
  PurchaseItem,
  ReturnResolution,
  Sale,
  SaleItem,
  SalesReturn,
  ShopSettings,
  StockItem,
  StockMovement,
  StockStatus,
  Supplier,
  TaxMode,
  User,
  UserRole,
} from '../types/database';
import { calculateTaxBreakdown, createId, round2, todayISO } from '../utils/format';

const STORAGE_KEY = 'sirija_db_v1';
const AUTH_KEY = 'sirija_user_id_v1';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface PurchaseLineInput {
  product_id: string;
  quantity: number;
  rate_per_gram: number;
  making_charges: number;
  discount: number;
  gst_rate: number;
  serial_numbers: string[];
}

export interface SavePurchaseInput {
  id?: string;
  supplier_id: string;
  supplier_invoice_number: string;
  purchase_date: string;
  tax_mode: TaxMode;
  gst_rate: number;
  payment_mode: PaymentMode;
  amount_paid: number;
  notes: string;
  attachment_name?: string;
  attachment_data_url?: string;
  confirmImmediately: boolean;
  items: PurchaseLineInput[];
}

export interface SaleLineInput {
  stock_item_id: string;
  rate_per_gram: number;
  making_charges: number;
  discount: number;
  gst_rate: number;
}

export interface SplitPaymentInput {
  mode: PaymentMode;
  amount: number;
  notes?: string;
}

export interface CreateSaleInput {
  sale_date: string;
  customer_id: string | null;
  customer_name: string;
  customer_mobile: string;
  customer_gstin: string;
  is_walk_in: boolean;
  save_new_customer?: boolean;
  tax_mode: TaxMode;
  gst_rate: number;
  notes: string;
  items: SaleLineInput[];
  payments: SplitPaymentInput[];
}

export interface ProcessReturnInput {
  sale_id: string;
  sale_item_id: string;
  return_date: string;
  reason: string;
  resolution: ReturnResolution;
  refund_amount: number;
  refund_mode: PaymentMode;
  restock_to_available: boolean;
}

export interface MmtcImportRowInput {
  sku_code: string;
  product_name: string;
  metal: MetalType;
  purity: string;
  weight_grams: number;
  serial_number: string;
  type: 'Coin' | 'Bar';
  hsn_code: string;
  barcode: string;
  purchase_price: number;
}

export interface ProductImportRow {
  sku_code: string;
  name: string;
  metal: MetalType;
  purity: string;
  weight_grams: number;
  type: 'Coin' | 'Bar';
  hsn_code: string;
  description: string;
  active: boolean;
}

export interface MmtcImportResult {
  imported: number;
  skipped: number;
  failed: number;
  createdProducts: number;
  errors: string[];
}

/** Cloud (Supabase) connection status. Always 'ready' in Local Mode once signed in. */
export type CloudStatus = 'loading' | 'signed_out' | 'needs_setup' | 'no_access' | 'ready';

export interface SyncState {
  pending: number;
  error: string | null;
}

interface StoreContextValue {
  db: DatabaseState;
  isCloudMode: boolean;
  cloudStatus: CloudStatus;
  cloudEmail: string | null;
  syncState: SyncState;
  clearSyncError: () => void;
  waitForSave: () => Promise<boolean>;
  cloudSignIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  cloudSignUp: (email: string, password: string) => Promise<{ ok: boolean; error?: string; info?: string }>;
  cloudCreateShop: (ownerName: string) => Promise<{ ok: boolean; error?: string }>;
  reloadFromCloud: () => Promise<void>;
  currentUser: User | null;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  notify: (type: ToastMessage['type'], message: string) => void;

  // Auth & Users
  loginWithCredentials: (emailOrId: string, pin: string) => { ok: boolean; error?: string };
  switchDemoUser: (userId: string) => void;
  logout: () => void;
  addUser: (input: { name: string; email: string; role: UserRole; pin: string }) => { ok: boolean; error?: string };
  toggleUserActive: (userId: string) => void;

  // Settings & Rates
  updateShopSettings: (patch: Partial<ShopSettings>) => { ok: boolean; error?: string };
  recordMetalRate: (input: {
    metal: MetalType;
    purity: string;
    rate_per_gram: number;
    effective_at: string;
    notes: string;
  }) => { ok: boolean; error?: string };
  getLatestRate: (metal: MetalType) => number;
  resetSampleData: () => void;
  restoreBackup: (data: unknown) => { ok: boolean; error?: string };

  // Products & MMTC Import
  saveProduct: (input: Omit<Product, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => {
    ok: boolean;
    error?: string;
    product?: Product;
  };
  toggleProductActive: (productId: string) => void;
  importProducts: (rows: ProductImportRow[]) => { created: number; updated: number; failed: number };
  importMmtcStock: (
    rows: MmtcImportRowInput[],
    supplierId: string | null,
    purchaseDate: string
  ) => MmtcImportResult;

  // Inventory
  adjustStockStatus: (stockId: string, newStatus: StockStatus, notes: string) => { ok: boolean; error?: string };

  // Suppliers & Purchases
  saveSupplier: (input: Omit<Supplier, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => {
    ok: boolean;
    error?: string;
    supplier?: Supplier;
  };
  savePurchase: (input: SavePurchaseInput) => { ok: boolean; error?: string; purchase?: Purchase };
  deleteDraftPurchase: (purchaseId: string) => { ok: boolean; error?: string };
  reverseCompletedPurchase: (purchaseId: string, reason: string) => { ok: boolean; error?: string };
  recordPurchasePayment: (purchaseId: string, amount: number, mode: PaymentMode, date: string, notes: string) => {
    ok: boolean;
    error?: string;
  };

  // Customers & Sales
  saveCustomer: (input: Omit<Customer, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => {
    ok: boolean;
    error?: string;
    customer?: Customer;
  };
  createSale: (input: CreateSaleInput) => {
    ok: boolean;
    error?: string;
    sale?: Sale;
    items?: SaleItem[];
    payments?: Payment[];
  };
  recordSalePayment: (saleId: string, amount: number, mode: PaymentMode, date: string, notes: string) => {
    ok: boolean;
    error?: string;
  };

  // Returns
  processReturn: (input: ProcessReturnInput) => { ok: boolean; error?: string; salesReturn?: SalesReturn };
}

const StoreContext = createContext<StoreContextValue | null>(null);

function loadInitialDb(): DatabaseState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DatabaseState;
      if (parsed && Array.isArray(parsed.products) && parsed.shop_settings) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to read local storage DB, loading seed data:', err);
  }
  return createSeedDatabase();
}

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDbState] = useState<DatabaseState>(() => (isCloudMode ? createEmptyDatabase() : loadInitialDb()));
  const dbRef = useRef<DatabaseState>(db);
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    if (isCloudMode) return null;
    const saved = localStorage.getItem(AUTH_KEY);
    if (!saved || saved === 'SIGNED_OUT') return null;
    return saved;
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // ---- Cloud (Supabase) state ----
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(isCloudMode ? 'loading' : 'ready');
  const [cloudEmail, setCloudEmail] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>({ pending: 0, error: null });
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef(0);
  const failCountRef = useRef(0);

  /**
   * Every action updates the in-memory database through this function.
   * In Cloud Mode the exact rows that changed are then saved to Supabase in one
   * database transaction (all-or-nothing). If the database refuses the change
   * (for example the coin was just sold on another counter), the screen is
   * reloaded from the database and the user is told the save did not happen.
   */
  const setDb = useCallback((updater: (prev: DatabaseState) => DatabaseState) => {
    const prev = dbRef.current;
    const next = updater(prev);
    if (next === prev) return;
    dbRef.current = next;
    setDbState(next);
    if (isCloudMode) {
      const changes = diffDatabase(prev, next);
      if (!isEmptyChangeSet(changes)) enqueuePush(changes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replaceDb = (next: DatabaseState) => {
    dbRef.current = next;
    setDbState(next);
  };

  const reloadFromCloud = useCallback(async () => {
    if (!supabase) return;
    try {
      const loaded = await loadCloudDatabase(supabase);
      if (pendingRef.current > 0) return; // a newer save is on its way; next refresh will catch up
      if (loaded) {
        replaceDb(loaded);
        setCloudStatus((s) => (s === 'loading' || s === 'needs_setup' ? 'ready' : s));
      } else {
        replaceDb(createEmptyDatabase());
        setCloudStatus('needs_setup');
      }
    } catch (err) {
      console.error(err);
      setSyncState((s) => ({ ...s, error: `Could not load data from the database: ${(err as Error).message}` }));
    }
  }, []);

  const enqueuePush = (changes: ChangeSet) => {
    if (!supabase) return;
    pendingRef.current += 1;
    setSyncState((s) => ({ ...s, pending: pendingRef.current }));
    queueRef.current = queueRef.current.then(async () => {
      try {
        await pushChanges(supabase!, changes);
      } catch (err) {
        console.error('Save failed', err);
        failCountRef.current += 1;
        setSyncState((s) => ({
          ...s,
          error: `The last change was NOT saved. ${(err as Error).message} The screen has been refreshed with the latest saved data.`,
        }));
        pendingRef.current = 0; // everything queued after a failure is based on stale data
        await reloadFromCloud();
      } finally {
        pendingRef.current = Math.max(0, pendingRef.current - 1);
        setSyncState((s) => ({ ...s, pending: pendingRef.current }));
      }
    });
  };

  /** Resolves true once everything queued so far is saved (always true in Local Mode). */
  const waitForSave = async (): Promise<boolean> => {
    const before = failCountRef.current;
    await queueRef.current;
    return failCountRef.current === before;
  };

  const clearSyncError = () => setSyncState((s) => ({ ...s, error: null }));

  // Sign-in session tracking (Cloud Mode)
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    const apply = async (email: string | null) => {
      if (cancelled) return;
      setCloudEmail(email);
      if (!email) {
        replaceDb(createEmptyDatabase());
        setCloudStatus('signed_out');
        return;
      }
      setCloudStatus('loading');
      await reloadFromCloud();
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session?.user.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') apply(session?.user.email ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [reloadFromCloud]);

  // Keep counters in sync with other devices: refresh on focus and every minute when idle.
  useEffect(() => {
    if (!supabase || cloudStatus !== 'ready') return;
    const refresh = () => {
      if (pendingRef.current === 0 && document.visibilityState === 'visible') reloadFromCloud();
    };
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
    };
  }, [cloudStatus, reloadFromCloud]);

  // Match the signed-in email to a shop user (owner / staff)
  useEffect(() => {
    if (!isCloudMode || !cloudEmail || cloudStatus === 'loading' || cloudStatus === 'signed_out') return;
    if (cloudStatus === 'needs_setup') {
      setCurrentUserId(null);
      return;
    }
    const match = db.users.find((u) => u.active && u.email.toLowerCase() === cloudEmail.toLowerCase());
    setCurrentUserId(match?.id ?? null);
    setCloudStatus(match ? 'ready' : 'no_access');
  }, [db.users, cloudEmail, cloudStatus]);

  const cloudSignIn = async (email: string, password: string) => {
    if (!supabase) return { ok: false, error: 'Cloud database is not configured.' };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const cloudSignUp = async (email: string, password: string) => {
    if (!supabase) return { ok: false, error: 'Cloud database is not configured.' };
    if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return { ok: false, error: error.message };
    if (!data.session) {
      return { ok: true, info: 'Account created. Please open the confirmation email, then sign in.' };
    }
    return { ok: true };
  };

  const cloudCreateShop = async (ownerName: string) => {
    if (!supabase) return { ok: false, error: 'Cloud database is not configured.' };
    const { data, error } = await supabase.rpc('bootstrap_owner', { p_name: ownerName });
    if (error) return { ok: false, error: error.message };
    await reloadFromCloud();
    if (data !== 'owner') {
      return { ok: false, error: 'This shop already has an owner. Ask the owner to add your email in Settings.' };
    }
    return { ok: true };
  };

  useEffect(() => {
    if (isCloudMode) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (err) {
      console.error('Failed to persist local DB:', err);
    }
  }, [db]);

  useEffect(() => {
    if (isCloudMode) return;
    if (currentUserId) {
      localStorage.setItem(AUTH_KEY, currentUserId);
    } else {
      localStorage.setItem(AUTH_KEY, 'SIGNED_OUT');
    }
  }, [currentUserId]);

  const currentUser = useMemo(() => {
    if (!currentUserId) return null;
    return db.users.find((u) => u.id === currentUserId && u.active) || null;
  }, [db.users, currentUserId]);

  const notify = (type: ToastMessage['type'], message: string) => {
    const id = createId('toast');
    setToasts((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const actorName = currentUser?.name || 'System';

  const getLatestRate = (metal: MetalType): number => {
    const matching = db.metal_rates
      .filter((r) => r.metal === metal)
      .sort((a, b) => new Date(b.effective_at).getTime() - new Date(a.effective_at).getTime());
    return matching[0]?.rate_per_gram || (metal === 'Gold' ? 7900 : 98);
  };

  const loginWithCredentials = (emailOrId: string, pin: string) => {
    const q = emailOrId.trim().toLowerCase();
    const user = db.users.find(
      (u) => u.active && (u.email.toLowerCase() === q || u.id === emailOrId) && u.pin === pin.trim()
    );
    if (!user) {
      return { ok: false, error: 'Invalid email or 4-digit PIN. Please check and try again.' };
    }
    setCurrentUserId(user.id);
    notify('success', `Signed in as ${user.name} (${user.role === 'owner' ? 'Owner' : 'Staff'})`);
    return { ok: true };
  };

  const switchDemoUser = (userId: string) => {
    const user = db.users.find((u) => u.id === userId && u.active);
    if (user) {
      setCurrentUserId(user.id);
      notify('info', `Switched account to ${user.name} (${user.role === 'owner' ? 'Owner' : 'Staff'})`);
    }
  };

  const logout = () => {
    setCurrentUserId(null);
    if (supabase) supabase.auth.signOut();
  };

  const addUser = (input: { name: string; email: string; role: UserRole; pin: string }) => {
    if (currentUser?.role !== 'owner') {
      return { ok: false, error: 'Only an Owner can manage staff accounts.' };
    }
    const email = input.email.trim().toLowerCase();
    if (!input.name.trim() || !email || (!isCloudMode && input.pin.trim().length < 4)) {
      return {
        ok: false,
        error: isCloudMode ? 'Name and email are required.' : 'Name, email, and at least a 4-digit PIN are required.',
      };
    }
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      return { ok: false, error: 'A user with this email already exists.' };
    }
    const now = new Date().toISOString();
    const newUser: User = {
      id: createId('usr'),
      name: input.name.trim(),
      email,
      role: input.role,
      pin: input.pin.trim(),
      active: true,
      created_at: now,
      updated_at: now,
    };
    setDb((prev) => ({ ...prev, users: [...prev.users, newUser] }));
    notify('success', `Added ${newUser.name} (${newUser.role})`);
    return { ok: true };
  };

  const toggleUserActive = (userId: string) => {
    if (currentUser?.role !== 'owner') {
      notify('error', 'Only an Owner can change user status.');
      return;
    }
    if (userId === currentUser.id) {
      notify('error', 'You cannot deactivate your own active account.');
      return;
    }
    setDb((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === userId ? { ...u, active: !u.active, updated_at: new Date().toISOString() } : u
      ),
    }));
  };

  const updateShopSettings = (patch: Partial<ShopSettings>) => {
    if (currentUser?.role !== 'owner') {
      return { ok: false, error: 'Only an Owner can update shop and tax configuration.' };
    }
    setDb((prev) => ({
      ...prev,
      shop_settings: {
        ...prev.shop_settings,
        ...patch,
        updated_at: new Date().toISOString(),
      },
    }));
    notify('success', 'Shop settings saved.');
    return { ok: true };
  };

  const recordMetalRate = (input: {
    metal: MetalType;
    purity: string;
    rate_per_gram: number;
    effective_at: string;
    notes: string;
  }) => {
    if (input.rate_per_gram <= 0) {
      return { ok: false, error: 'Rate per gram must be greater than zero.' };
    }
    const now = new Date().toISOString();
    const entry: MetalRate = {
      id: createId('rate'),
      metal: input.metal,
      purity: input.purity.trim() || '999.9',
      rate_per_gram: round2(input.rate_per_gram),
      effective_at: input.effective_at || now,
      updated_by: actorName,
      notes: input.notes.trim(),
      created_at: now,
    };
    setDb((prev) => ({
      ...prev,
      metal_rates: [entry, ...prev.metal_rates],
    }));
    notify('success', `Updated ${entry.metal} (${entry.purity}) rate to ₹${entry.rate_per_gram}/gm`);
    return { ok: true };
  };

  /** Replaces all business data with the given dataset (sample data, or a backup file). Owner only. */
  const loadDataset = (dataset: DatabaseState, label: string) => {
    if (currentUser?.role !== 'owner') {
      notify('error', 'Only an Owner can replace shop data.');
      return;
    }
    if (supabase) {
      const keepUsers = dbRef.current.users;
      (async () => {
        await queueRef.current;
        const { error } = await supabase.rpc('reset_business_data');
        if (error) {
          notify('error', `Could not clear old data: ${error.message}`);
          return;
        }
        replaceDb({ ...createEmptyDatabase(), users: keepUsers });
        setDb(() => ({ ...dataset, users: keepUsers }));
        notify('info', `${label} loaded.`);
      })();
      return;
    }
    setDb(() => dataset);
    if (!dataset.users.some((u) => u.id === currentUser.id)) setCurrentUserId(dataset.users.find((u) => u.role === 'owner')?.id ?? null);
    notify('info', `${label} loaded.`);
  };

  const resetSampleData = () => loadDataset(createSeedDatabase(), 'Sample bullion data');

  const restoreBackup = (raw: unknown): { ok: boolean; error?: string } => {
    const data = raw as DatabaseState;
    if (!data || typeof data !== 'object' || !data.shop_settings || !Array.isArray(data.products) || !Array.isArray(data.stock_items)) {
      return { ok: false, error: 'This file is not a Sirija Jwellers backup.' };
    }
    const blank = createEmptyDatabase();
    const merged = { ...blank, ...data } as DatabaseState;
    for (const key of Object.keys(blank) as (keyof DatabaseState)[]) {
      if (Array.isArray(blank[key]) && !Array.isArray(merged[key])) (merged as unknown as Record<string, unknown>)[key] = [];
    }
    loadDataset(merged, 'Backup');
    return { ok: true };
  };

  const saveProduct = (input: Omit<Product, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => {
    const sku = input.sku_code.trim().toUpperCase();
    const name = input.name.trim();
    if (!sku || !name) {
      return { ok: false, error: 'SKU Code and Product Name are required.' };
    }
    if (!Number.isFinite(input.weight_grams) || input.weight_grams <= 0) {
      return { ok: false, error: 'Weight in grams must be greater than 0.' };
    }
    const duplicate = db.products.find(
      (p) => p.sku_code.toUpperCase() === sku && p.id !== input.id
    );
    if (duplicate) {
      return { ok: false, error: `SKU Code "${sku}" already exists.` };
    }
    const now = new Date().toISOString();
    let saved: Product;
    if (input.id) {
      const existing = db.products.find((p) => p.id === input.id);
      if (!existing) return { ok: false, error: 'Product not found.' };
      saved = {
        ...existing,
        ...input,
        sku_code: sku,
        name,
        hsn_code: input.hsn_code.trim() || '71141910',
        updated_at: now,
      };
      setDb((prev) => ({
        ...prev,
        products: prev.products.map((p) => (p.id === saved.id ? saved : p)),
      }));
      notify('success', `Updated product ${saved.sku_code}`);
    } else {
      saved = {
        id: createId('prod'),
        sku_code: sku,
        name,
        metal: input.metal,
        purity: input.purity.trim() || '999.9',
        weight_grams: Number(input.weight_grams),
        type: input.type,
        hsn_code: input.hsn_code.trim() || (input.metal === 'Gold' ? '71141910' : '71141110'),
        description: input.description.trim(),
        active: input.active,
        created_at: now,
        updated_at: now,
      };
      setDb((prev) => ({ ...prev, products: [saved, ...prev.products] }));
      notify('success', `Added product ${saved.name}`);
    }
    return { ok: true, product: saved };
  };

  const toggleProductActive = (productId: string) => {
    setDb((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.id === productId ? { ...p, active: !p.active, updated_at: new Date().toISOString() } : p
      ),
    }));
  };

  /** Creates new SKUs and updates existing ones (matched by SKU code). Never touches stock. */
  const importProducts = (rows: ProductImportRow[]) => {
    const now = new Date().toISOString();
    const bySku = new Map(db.products.map((p) => [p.sku_code.toUpperCase(), p]));
    const updates = new Map<string, Product>();
    const created: Product[] = [];
    let failed = 0;
    for (const r of rows) {
      const sku = r.sku_code.trim().toUpperCase();
      if (!sku || !r.name.trim() || !(r.weight_grams > 0)) {
        failed++;
        continue;
      }
      const existing = bySku.get(sku);
      const fields = {
        sku_code: sku,
        name: r.name.trim(),
        metal: r.metal,
        purity: r.purity.trim() || '999.9',
        weight_grams: Number(r.weight_grams),
        type: r.type,
        hsn_code: r.hsn_code.trim(),
        description: r.description.trim(),
        active: r.active,
      };
      if (existing) {
        const hasStock = db.stock_items.some((s) => s.product_id === existing.id);
        // Weight / metal of a product that already has stock must not change (bills use them).
        const safe = hasStock ? { ...fields, weight_grams: existing.weight_grams, metal: existing.metal } : fields;
        const next = { ...existing, ...safe, updated_at: now };
        updates.set(existing.id, next);
        bySku.set(sku, next);
      } else {
        const p: Product = { id: createId('prod'), ...fields, created_at: now, updated_at: now };
        created.push(p);
        bySku.set(sku, p);
      }
    }
    if (created.length || updates.size) {
      setDb((prev) => ({
        ...prev,
        products: [...created, ...prev.products.map((p) => updates.get(p.id) || p)],
      }));
    }
    notify(
      created.length || updates.size ? 'success' : 'error',
      `Products imported: ${created.length} new, ${updates.size} updated${failed ? `, ${failed} failed` : ''}.`
    );
    return { created: created.length, updated: updates.size, failed };
  };

  const importMmtcStock = (
    rows: MmtcImportRowInput[],
    supplierId: string | null,
    purchaseDate: string
  ): MmtcImportResult => {
    const now = new Date().toISOString();
    const batchId = createId('imp');
    const batchRef = `IMP-${todayISO().replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

    const productsBySku = new Map<string, Product>();
    db.products.forEach((p) => productsBySku.set(p.sku_code.toUpperCase(), p));

    const existingSerials = new Set<string>(
      db.stock_items.map((s) => s.serial_number.trim().toUpperCase())
    );

    const newProducts: Product[] = [];
    const newStockItems: StockItem[] = [];
    const newMovements: StockMovement[] = [];
    let stockSeq = db.next_stock_seq;

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    const goldRate = getLatestRate('Gold');
    const silverRate = getLatestRate('Silver');

    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const sku = (r.sku_code || '').trim().toUpperCase();
      const serial = (r.serial_number || '').trim();
      const serialKey = serial.toUpperCase();

      if (!sku || !serial || !r.product_name?.trim() || !(r.weight_grams > 0)) {
        failed++;
        errors.push(`Row ${idx + 1}: Missing required SKU, Product Name, Weight, or Serial No.`);
        continue;
      }

      if (existingSerials.has(serialKey)) {
        skipped++;
        continue;
      }

      let product = productsBySku.get(sku);
      if (!product) {
        product = {
          id: createId('prod'),
          sku_code: sku,
          name: r.product_name.trim(),
          metal: r.metal === 'Silver' ? 'Silver' : 'Gold',
          purity: (r.purity || '999.9').toString().trim(),
          weight_grams: Number(r.weight_grams),
          type: r.type === 'Bar' ? 'Bar' : 'Coin',
          hsn_code: (r.hsn_code || (r.metal === 'Silver' ? '71141110' : '71141910')).toString().trim(),
          description: `Imported via MMTC stock sheet (${sku})`,
          active: true,
          created_at: now,
          updated_at: now,
        };
        productsBySku.set(sku, product);
        newProducts.push(product);
      }

      const estimatedUnitCost =
        r.purchase_price > 0
          ? round2(r.purchase_price)
          : round2(product.weight_grams * (product.metal === 'Gold' ? goldRate * 0.96 : silverRate * 0.95));

      const stockId = `STK-${stockSeq++}`;
      const stockItem: StockItem = {
        id: stockId,
        product_id: product.id,
        serial_number: serial,
        barcode: (r.barcode || '').toString().trim(),
        purchase_id: null,
        purchase_date: purchaseDate || todayISO(),
        supplier_id: supplierId,
        purchase_price: estimatedUnitCost,
        status: 'Available',
        sale_id: null,
        sale_item_id: null,
        notes: `Imported via ${batchRef}`,
        created_at: now,
        updated_at: now,
      };

      existingSerials.add(serialKey);
      newStockItems.push(stockItem);
      newMovements.push({
        id: createId('mov'),
        stock_item_id: stockId,
        product_id: product.id,
        serial_number: serial,
        movement_type: 'IMPORT',
        reference_type: 'IMPORT',
        reference_id: batchId,
        reference_number: batchRef,
        previous_status: null,
        new_status: 'Available',
        notes: `MMTC Excel stock import (${sku})`,
        created_by: actorName,
        created_at: now,
      });
      imported++;
    }

    if (newProducts.length > 0 || newStockItems.length > 0) {
      setDb((prev) => ({
        ...prev,
        products: [...newProducts, ...prev.products],
        stock_items: [...newStockItems, ...prev.stock_items],
        stock_movements: [...newMovements, ...prev.stock_movements],
        next_stock_seq: stockSeq,
      }));
    }

    if (imported > 0) {
      notify(
        'success',
        `Imported ${imported} stock unit${imported === 1 ? '' : 's'}${skipped > 0 ? `, skipped ${skipped} duplicates` : ''}.`
      );
    } else if (skipped > 0) {
      notify('info', `No new stock imported — ${skipped} duplicate serial(s) skipped.`);
    } else {
      notify('error', 'Import failed. Please review row errors.');
    }

    return {
      imported,
      skipped,
      failed,
      createdProducts: newProducts.length,
      errors,
    };
  };

  const adjustStockStatus = (stockId: string, newStatus: StockStatus, notes: string) => {
    if (currentUser?.role !== 'owner') {
      return { ok: false, error: 'Only an Owner can manually adjust stock status.' };
    }
    const item = db.stock_items.find((s) => s.id === stockId);
    if (!item) return { ok: false, error: 'Stock item not found.' };
    if (item.status === 'Sold') {
      return {
        ok: false,
        error: 'Sold stock cannot be manually restored. Process a confirmed Sales Return instead.',
      };
    }
    if (item.status === newStatus) {
      return { ok: false, error: `Item is already marked as ${newStatus}.` };
    }
    const now = new Date().toISOString();
    const mov: StockMovement = {
      id: createId('mov'),
      stock_item_id: item.id,
      product_id: item.product_id,
      serial_number: item.serial_number,
      movement_type: 'ADJUSTMENT',
      reference_type: 'ADJUSTMENT',
      reference_id: createId('adj'),
      reference_number: `ADJ-${todayISO().replace(/-/g, '')}`,
      previous_status: item.status,
      new_status: newStatus,
      notes: notes.trim() || `Manual status update to ${newStatus}`,
      created_by: actorName,
      created_at: now,
    };

    setDb((prev) => ({
      ...prev,
      stock_items: prev.stock_items.map((s) =>
        s.id === stockId ? { ...s, status: newStatus, notes: notes.trim() || s.notes, updated_at: now } : s
      ),
      stock_movements: [mov, ...prev.stock_movements],
    }));
    notify('success', `Updated ${item.serial_number} to ${newStatus}.`);
    return { ok: true };
  };

  const saveSupplier = (input: Omit<Supplier, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => {
    if (!input.name.trim()) {
      return { ok: false, error: 'Supplier name is required.' };
    }
    const now = new Date().toISOString();
    let saved: Supplier;
    if (input.id) {
      const existing = db.suppliers.find((s) => s.id === input.id);
      if (!existing) return { ok: false, error: 'Supplier not found.' };
      saved = {
        ...existing,
        ...input,
        name: input.name.trim(),
        updated_at: now,
      };
      setDb((prev) => ({
        ...prev,
        suppliers: prev.suppliers.map((s) => (s.id === saved.id ? saved : s)),
      }));
      notify('success', `Updated supplier ${saved.name}`);
    } else {
      saved = {
        id: createId('sup'),
        name: input.name.trim(),
        contact_number: input.contact_number.trim(),
        address: input.address.trim(),
        gstin: input.gstin.trim().toUpperCase(),
        supplier_type: input.supplier_type,
        created_at: now,
        updated_at: now,
      };
      setDb((prev) => ({ ...prev, suppliers: [saved, ...prev.suppliers] }));
      notify('success', `Added supplier ${saved.name}`);
    }
    return { ok: true, supplier: saved };
  };

  const savePurchase = (input: SavePurchaseInput) => {
    const supplier = db.suppliers.find((s) => s.id === input.supplier_id);
    if (!supplier) return { ok: false, error: 'Please select a valid supplier.' };
    if (!input.supplier_invoice_number.trim()) {
      return { ok: false, error: 'Supplier invoice number is required.' };
    }
    if (!input.items.length) {
      return { ok: false, error: 'Add at least one product line to the purchase.' };
    }

    const existingPurchase = input.id ? db.purchases.find((p) => p.id === input.id) : undefined;
    if (existingPurchase && existingPurchase.status !== 'draft') {
      return {
        ok: false,
        error: 'Completed or reversed purchases cannot be edited directly. Use Reversal instead.',
      };
    }

    const now = new Date().toISOString();
    const purchaseId = existingPurchase?.id || createId('pur');
    const purchaseNumber =
      existingPurchase?.purchase_number ||
      `PUR-${new Date().getFullYear()}-${String(db.next_purchase_seq).padStart(3, '0')}`;

    const existingSerials = new Set(db.stock_items.map((s) => s.serial_number.trim().toUpperCase()));
    const batchSerials = new Set<string>();

    let subtotal = 0;
    let discountTotal = 0;
    let taxableTotal = 0;
    const builtItems: PurchaseItem[] = [];
    const newStockItems: StockItem[] = [];
    const newMovements: StockMovement[] = [];
    let stockSeq = db.next_stock_seq;

    for (let i = 0; i < input.items.length; i++) {
      const line = input.items[i];
      const product = db.products.find((p) => p.id === line.product_id);
      if (!product) return { ok: false, error: `Line ${i + 1}: Select a valid product.` };
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        return { ok: false, error: `Line ${i + 1}: Quantity must be a whole number >= 1.` };
      }
      if (line.rate_per_gram <= 0) {
        return { ok: false, error: `Line ${i + 1}: Rate per gram must be greater than 0.` };
      }

      const grossLine = round2(
        line.quantity * (product.weight_grams * line.rate_per_gram + (line.making_charges || 0))
      );
      const lineDiscount = Math.max(0, round2(line.discount || 0));
      const lineTaxable = Math.max(0, round2(grossLine - lineDiscount));
      const lineGst = round2((lineTaxable * line.gst_rate) / 100);
      const lineTotal = round2(lineTaxable + lineGst);
      // Actual unit purchase cost (taxable cost per physical coin/bar — matches GST-exclusive gross margin basis)
      const unitCost = round2(lineTaxable / line.quantity);

      subtotal = round2(subtotal + grossLine);
      discountTotal = round2(discountTotal + lineDiscount);
      taxableTotal = round2(taxableTotal + lineTaxable);

      const cleanedSerials = line.serial_numbers
        .map((s) => s.trim())
        .filter(Boolean);

      if (input.confirmImmediately) {
        if (cleanedSerials.length !== line.quantity) {
          return {
            ok: false,
            error: `Line ${i + 1} (${product.name}): Provide ${line.quantity} serial/certificate number(s) to confirm purchase (currently ${cleanedSerials.length}).`,
          };
        }
        for (const sn of cleanedSerials) {
          const snKey = sn.toUpperCase();
          if (existingSerials.has(snKey) || batchSerials.has(snKey)) {
            return {
              ok: false,
              error: `Duplicate certificate/serial number detected: "${sn}". Every physical unit must have a unique serial number.`,
            };
          }
          batchSerials.add(snKey);
        }
      }

      builtItems.push({
        id: createId('pi'),
        purchase_id: purchaseId,
        product_id: product.id,
        quantity: line.quantity,
        weight_grams: product.weight_grams,
        rate_per_gram: round2(line.rate_per_gram),
        making_charges: round2(line.making_charges || 0),
        discount: lineDiscount,
        taxable_amount: lineTaxable,
        gst_rate: line.gst_rate,
        gst_amount: lineGst,
        total_amount: lineTotal,
        unit_cost: unitCost,
        serial_numbers: cleanedSerials,
        created_at: now,
      });

      if (input.confirmImmediately) {
        for (const sn of cleanedSerials) {
          const stockId = `STK-${stockSeq++}`;
          newStockItems.push({
            id: stockId,
            product_id: product.id,
            serial_number: sn,
            barcode: '',
            purchase_id: purchaseId,
            purchase_date: input.purchase_date,
            supplier_id: supplier.id,
            purchase_price: unitCost,
            status: 'Available',
            sale_id: null,
            sale_item_id: null,
            notes: `Invoice ${input.supplier_invoice_number.trim()}`,
            created_at: now,
            updated_at: now,
          });
          newMovements.push({
            id: createId('mov'),
            stock_item_id: stockId,
            product_id: product.id,
            serial_number: sn,
            movement_type: 'PURCHASE',
            reference_type: 'PURCHASE',
            reference_id: purchaseId,
            reference_number: purchaseNumber,
            previous_status: null,
            new_status: 'Available',
            notes: `Purchased from ${supplier.name} (${input.supplier_invoice_number.trim()})`,
            created_by: actorName,
            created_at: now,
          });
        }
      }
    }

    const tax = calculateTaxBreakdown(taxableTotal, input.gst_rate, input.tax_mode);
    const amountPaid = input.confirmImmediately
      ? Math.min(tax.grandTotal, Math.max(0, round2(input.amount_paid || 0)))
      : round2(input.amount_paid || 0);
    const balanceDue = round2(Math.max(0, tax.grandTotal - amountPaid));
    const paymentStatus =
      balanceDue <= 0.01 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';

    const purchase: Purchase = {
      id: purchaseId,
      purchase_number: purchaseNumber,
      supplier_id: supplier.id,
      supplier_invoice_number: input.supplier_invoice_number.trim(),
      purchase_date: input.purchase_date,
      status: input.confirmImmediately ? 'completed' : 'draft',
      tax_mode: input.tax_mode,
      subtotal,
      discount_total: discountTotal,
      taxable_amount: taxableTotal,
      gst_rate: input.gst_rate,
      cgst_amount: tax.cgst,
      sgst_amount: tax.sgst,
      igst_amount: tax.igst,
      gst_total: tax.gstTotal,
      grand_total: tax.grandTotal,
      amount_paid: amountPaid,
      balance_due: balanceDue,
      payment_mode: input.payment_mode,
      payment_status: paymentStatus,
      notes: input.notes.trim(),
      attachment_name: input.attachment_name,
      attachment_data_url: input.attachment_data_url,
      created_by: existingPurchase?.created_by || actorName,
      created_at: existingPurchase?.created_at || now,
      updated_at: now,
    };

    const newPayments: Payment[] = [];
    if (input.confirmImmediately && amountPaid > 0) {
      newPayments.push({
        id: createId('pay'),
        reference_type: 'purchase',
        reference_id: purchaseId,
        party_id: supplier.id,
        party_name: supplier.name,
        payment_date: input.purchase_date,
        mode: input.payment_mode,
        amount: amountPaid,
        notes: `Initial payment for ${purchaseNumber}`,
        created_by: actorName,
        created_at: now,
      });
    }

    setDb((prev) => ({
      ...prev,
      purchases: existingPurchase
        ? prev.purchases.map((p) => (p.id === purchaseId ? purchase : p))
        : [purchase, ...prev.purchases],
      purchase_items: [
        ...prev.purchase_items.filter((pi) => pi.purchase_id !== purchaseId),
        ...builtItems,
      ],
      stock_items: [...newStockItems, ...prev.stock_items],
      stock_movements: [...newMovements, ...prev.stock_movements],
      payments: [...newPayments, ...prev.payments],
      next_stock_seq: stockSeq,
      next_purchase_seq: existingPurchase ? prev.next_purchase_seq : prev.next_purchase_seq + 1,
    }));

    notify(
      'success',
      input.confirmImmediately
        ? `Purchase ${purchaseNumber} confirmed — ${newStockItems.length} unit(s) added to available inventory.`
        : `Draft purchase ${purchaseNumber} saved.`
    );
    return { ok: true, purchase };
  };

  const deleteDraftPurchase = (purchaseId: string) => {
    const purchase = db.purchases.find((p) => p.id === purchaseId);
    if (!purchase) return { ok: false, error: 'Purchase not found.' };
    if (purchase.status !== 'draft') {
      return { ok: false, error: 'Completed purchases cannot be deleted. Use controlled reversal instead.' };
    }
    setDb((prev) => ({
      ...prev,
      purchases: prev.purchases.filter((p) => p.id !== purchaseId),
      purchase_items: prev.purchase_items.filter((pi) => pi.purchase_id !== purchaseId),
    }));
    notify('info', `Draft purchase ${purchase.purchase_number} removed.`);
    return { ok: true };
  };

  const reverseCompletedPurchase = (purchaseId: string, reason: string) => {
    if (currentUser?.role !== 'owner') {
      return { ok: false, error: 'Only an Owner can reverse a completed purchase.' };
    }
    if (!reason.trim()) {
      return { ok: false, error: 'A reversal reason is mandatory.' };
    }
    const purchase = db.purchases.find((p) => p.id === purchaseId);
    if (!purchase) return { ok: false, error: 'Purchase not found.' };
    if (purchase.status !== 'completed') {
      return { ok: false, error: 'Only completed purchases can be reversed.' };
    }
    const linkedStock = db.stock_items.filter((s) => s.purchase_id === purchaseId);
    const soldOrModified = linkedStock.filter((s) => s.status !== 'Available');
    if (soldOrModified.length > 0) {
      return {
        ok: false,
        error: `Cannot reverse: ${soldOrModified.length} unit(s) from this purchase are already Sold/Returned/Damaged.`,
      };
    }

    const now = new Date().toISOString();
    const reversalMovements: StockMovement[] = linkedStock.map((s) => ({
      id: createId('mov'),
      stock_item_id: s.id,
      product_id: s.product_id,
      serial_number: s.serial_number,
      movement_type: 'PURCHASE_REVERSAL',
      reference_type: 'PURCHASE',
      reference_id: purchase.id,
      reference_number: purchase.purchase_number,
      previous_status: s.status,
      new_status: 'Returned',
      notes: `Purchase reversed: ${reason.trim()}`,
      created_by: actorName,
      created_at: now,
    }));

    const linkedIds = new Set(linkedStock.map((s) => s.id));
    setDb((prev) => ({
      ...prev,
      purchases: prev.purchases.map((p) =>
        p.id === purchaseId
          ? {
              ...p,
              status: 'reversed',
              balance_due: 0,
              reversal_reason: reason.trim(),
              reversed_at: now,
              updated_at: now,
            }
          : p
      ),
      stock_items: prev.stock_items.map((s) =>
        linkedIds.has(s.id)
          ? { ...s, status: 'Returned', notes: `Reversed (${purchase.purchase_number})`, updated_at: now }
          : s
      ),
      stock_movements: [...reversalMovements, ...prev.stock_movements],
    }));

    notify('info', `Purchase ${purchase.purchase_number} reversed and ${linkedStock.length} unit(s) removed from available stock.`);
    return { ok: true };
  };

  const recordPurchasePayment = (
    purchaseId: string,
    amount: number,
    mode: PaymentMode,
    date: string,
    notes: string
  ) => {
    const purchase = db.purchases.find((p) => p.id === purchaseId);
    if (!purchase || purchase.status !== 'completed') {
      return { ok: false, error: 'Active completed purchase not found.' };
    }
    const cleanAmount = round2(amount);
    if (cleanAmount <= 0 || cleanAmount > round2(purchase.balance_due + 0.01)) {
      return { ok: false, error: 'Payment amount must be greater than 0 and not exceed balance due.' };
    }
    const supplier = db.suppliers.find((s) => s.id === purchase.supplier_id);
    const now = new Date().toISOString();
    const newPaid = round2(purchase.amount_paid + cleanAmount);
    const newBalance = round2(Math.max(0, purchase.grand_total - newPaid));
    const payment: Payment = {
      id: createId('pay'),
      reference_type: 'purchase',
      reference_id: purchase.id,
      party_id: purchase.supplier_id,
      party_name: supplier?.name || 'Supplier',
      payment_date: date || todayISO(),
      mode,
      amount: cleanAmount,
      notes: notes.trim() || `Settlement for ${purchase.purchase_number}`,
      created_by: actorName,
      created_at: now,
    };

    setDb((prev) => ({
      ...prev,
      purchases: prev.purchases.map((p) =>
        p.id === purchaseId
          ? {
              ...p,
              amount_paid: newPaid,
              balance_due: newBalance,
              payment_status: newBalance <= 0.01 ? 'paid' : 'partial',
              updated_at: now,
            }
          : p
      ),
      payments: [payment, ...prev.payments],
    }));
    notify('success', `Recorded supplier payment of ₹${cleanAmount.toLocaleString('en-IN')}.`);
    return { ok: true };
  };

  const saveCustomer = (input: Omit<Customer, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => {
    if (!input.name.trim() || !input.mobile.trim()) {
      return { ok: false, error: 'Customer name and mobile number are required.' };
    }
    const now = new Date().toISOString();
    let saved: Customer;
    if (input.id) {
      const existing = db.customers.find((c) => c.id === input.id);
      if (!existing) return { ok: false, error: 'Customer not found.' };
      saved = {
        ...existing,
        ...input,
        name: input.name.trim(),
        mobile: input.mobile.trim(),
        gstin: input.gstin.trim().toUpperCase(),
        updated_at: now,
      };
      setDb((prev) => ({
        ...prev,
        customers: prev.customers.map((c) => (c.id === saved.id ? saved : c)),
      }));
      notify('success', `Updated customer ${saved.name}`);
    } else {
      saved = {
        id: createId('cust'),
        name: input.name.trim(),
        mobile: input.mobile.trim(),
        address: input.address.trim(),
        gstin: input.gstin.trim().toUpperCase(),
        created_at: now,
        updated_at: now,
      };
      setDb((prev) => ({ ...prev, customers: [saved, ...prev.customers] }));
      notify('success', `Added customer ${saved.name}`);
    }
    return { ok: true, customer: saved };
  };

  const createSale = (input: CreateSaleInput) => {
    if (!input.items.length) {
      return { ok: false, error: 'Add at least one available coin or bar to create an invoice.' };
    }

    // Strict stock availability & uniqueness check (a stock item can NEVER be sold twice)
    const seenStockIds = new Set<string>();
    for (const line of input.items) {
      if (seenStockIds.has(line.stock_item_id)) {
        return { ok: false, error: 'The same serial number cannot be billed twice in one invoice.' };
      }
      seenStockIds.add(line.stock_item_id);
      const stock = db.stock_items.find((s) => s.id === line.stock_item_id);
      if (!stock) {
        return { ok: false, error: 'Selected stock item could not be found.' };
      }
      if (stock.status !== 'Available') {
        return {
          ok: false,
          error: `Serial "${stock.serial_number}" is currently marked as ${stock.status} and cannot be sold.`,
        };
      }
    }

    const now = new Date().toISOString();
    let resolvedCustomerId = input.customer_id;
    let newCustomerRecord: Customer | null = null;
    const customerName = input.is_walk_in
      ? input.customer_name.trim() || 'Walk-in Customer'
      : input.customer_name.trim();

    if (!input.is_walk_in && !customerName) {
      return { ok: false, error: 'Enter customer name or switch to Walk-in Customer.' };
    }

    if (!input.is_walk_in && !resolvedCustomerId && input.save_new_customer && input.customer_mobile.trim()) {
      newCustomerRecord = {
        id: createId('cust'),
        name: customerName,
        mobile: input.customer_mobile.trim(),
        address: '',
        gstin: input.customer_gstin.trim().toUpperCase(),
        created_at: now,
        updated_at: now,
      };
      resolvedCustomerId = newCustomerRecord.id;
    }

    const saleId = createId('sale');
    const invoiceNumber = `${db.shop_settings.invoice_prefix}${db.shop_settings.next_invoice_number}`;

    let subtotal = 0;
    let discountTotal = 0;
    let taxableTotal = 0;
    const saleItems: SaleItem[] = [];
    const movements: StockMovement[] = [];
    const stockSaleItemMap = new Map<string, string>();

    for (const line of input.items) {
      const stock = db.stock_items.find((s) => s.id === line.stock_item_id)!;
      const product = db.products.find((p) => p.id === stock.product_id)!;

      const grossLine = round2(product.weight_grams * line.rate_per_gram + (line.making_charges || 0));
      const lineDiscount = Math.max(0, round2(line.discount || 0));
      const lineTaxable = Math.max(0, round2(grossLine - lineDiscount));
      const lineGst = round2((lineTaxable * line.gst_rate) / 100);
      const lineTotal = round2(lineTaxable + lineGst);

      subtotal = round2(subtotal + grossLine);
      discountTotal = round2(discountTotal + lineDiscount);
      taxableTotal = round2(taxableTotal + lineTaxable);

      const saleItemId = createId('si');
      stockSaleItemMap.set(stock.id, saleItemId);

      saleItems.push({
        id: saleItemId,
        sale_id: saleId,
        product_id: product.id,
        stock_item_id: stock.id,
        serial_number: stock.serial_number,
        product_name: product.name,
        sku_code: product.sku_code,
        metal: product.metal,
        purity: product.purity,
        weight_grams: product.weight_grams,
        hsn_code: product.hsn_code,
        rate_per_gram: round2(line.rate_per_gram),
        making_charges: round2(line.making_charges || 0),
        discount: lineDiscount,
        taxable_amount: lineTaxable,
        gst_rate: line.gst_rate,
        gst_amount: lineGst,
        line_total: lineTotal,
        purchase_cost_snapshot: stock.purchase_price,
        returned: false,
        created_at: now,
      });

      movements.push({
        id: createId('mov'),
        stock_item_id: stock.id,
        product_id: product.id,
        serial_number: stock.serial_number,
        movement_type: 'SALE',
        reference_type: 'SALE',
        reference_id: saleId,
        reference_number: invoiceNumber,
        previous_status: 'Available',
        new_status: 'Sold',
        notes: `Sold to ${customerName}`,
        created_by: actorName,
        created_at: now,
      });
    }

    const tax = calculateTaxBreakdown(taxableTotal, input.gst_rate, input.tax_mode);
    const validPayments = input.payments
      .filter((p) => p.amount > 0)
      .map((p) => ({ ...p, amount: round2(p.amount) }));
    const totalReceived = round2(validPayments.reduce((sum, p) => sum + p.amount, 0));

    if (totalReceived > round2(tax.grandTotal + 0.05)) {
      return {
        ok: false,
        error: 'Total received payment exceeds the invoice Grand Total.',
      };
    }

    const balanceDue = round2(Math.max(0, tax.grandTotal - totalReceived));
    const paymentStatus =
      balanceDue <= 0.01 ? 'paid' : totalReceived > 0 ? 'partial' : 'unpaid';

    const sale: Sale = {
      id: saleId,
      invoice_number: invoiceNumber,
      sale_date: input.sale_date || todayISO(),
      customer_id: resolvedCustomerId,
      customer_name: customerName,
      customer_mobile: input.customer_mobile.trim(),
      customer_gstin: input.customer_gstin.trim().toUpperCase(),
      is_walk_in: input.is_walk_in,
      tax_mode: input.tax_mode,
      subtotal,
      discount_total: discountTotal,
      taxable_amount: taxableTotal,
      gst_rate: input.gst_rate,
      cgst_amount: tax.cgst,
      sgst_amount: tax.sgst,
      igst_amount: tax.igst,
      gst_total: tax.gstTotal,
      grand_total: tax.grandTotal,
      amount_received: totalReceived,
      balance_due: balanceDue,
      payment_status: paymentStatus,
      notes: input.notes.trim(),
      gold_rate_snapshot: getLatestRate('Gold'),
      silver_rate_snapshot: getLatestRate('Silver'),
      status: 'completed',
      created_by: actorName,
      created_at: now,
      updated_at: now,
    };

    const paymentRecords: Payment[] = validPayments.map((p) => ({
      id: createId('pay'),
      reference_type: 'sale',
      reference_id: saleId,
      party_id: resolvedCustomerId,
      party_name: customerName,
      payment_date: sale.sale_date,
      mode: p.mode,
      amount: p.amount,
      notes: p.notes?.trim() || `Invoice ${invoiceNumber}`,
      created_by: actorName,
      created_at: now,
    }));

    setDb((prev) => ({
      ...prev,
      customers: newCustomerRecord ? [newCustomerRecord, ...prev.customers] : prev.customers,
      sales: [sale, ...prev.sales],
      sale_items: [...saleItems, ...prev.sale_items],
      payments: [...paymentRecords, ...prev.payments],
      stock_items: prev.stock_items.map((s) =>
        stockSaleItemMap.has(s.id)
          ? {
              ...s,
              status: 'Sold',
              sale_id: saleId,
              sale_item_id: stockSaleItemMap.get(s.id)!,
              updated_at: now,
            }
          : s
      ),
      stock_movements: [...movements, ...prev.stock_movements],
      shop_settings: {
        ...prev.shop_settings,
        next_invoice_number: prev.shop_settings.next_invoice_number + 1,
      },
    }));

    // In Cloud Mode the billing screen confirms the save only after the database accepts it.
    if (!isCloudMode) notify('success', `Invoice ${invoiceNumber} saved — ${saleItems.length} item(s) marked Sold.`);
    return { ok: true, sale, items: saleItems, payments: paymentRecords };
  };

  const recordSalePayment = (
    saleId: string,
    amount: number,
    mode: PaymentMode,
    date: string,
    notes: string
  ) => {
    const sale = db.sales.find((s) => s.id === saleId);
    if (!sale) return { ok: false, error: 'Invoice not found.' };
    const cleanAmount = round2(amount);
    if (cleanAmount <= 0 || cleanAmount > round2(sale.balance_due + 0.01)) {
      return { ok: false, error: 'Payment amount must be greater than 0 and not exceed balance due.' };
    }
    const now = new Date().toISOString();
    const newReceived = round2(sale.amount_received + cleanAmount);
    const newBalance = round2(Math.max(0, sale.grand_total - newReceived));

    const payment: Payment = {
      id: createId('pay'),
      reference_type: 'sale',
      reference_id: sale.id,
      party_id: sale.customer_id,
      party_name: sale.customer_name,
      payment_date: date || todayISO(),
      mode,
      amount: cleanAmount,
      notes: notes.trim() || `Balance collection for ${sale.invoice_number}`,
      created_by: actorName,
      created_at: now,
    };

    setDb((prev) => ({
      ...prev,
      sales: prev.sales.map((s) =>
        s.id === saleId
          ? {
              ...s,
              amount_received: newReceived,
              balance_due: newBalance,
              payment_status: newBalance <= 0.01 ? 'paid' : 'partial',
              updated_at: now,
            }
          : s
      ),
      payments: [payment, ...prev.payments],
    }));
    notify('success', `Received ₹${cleanAmount.toLocaleString('en-IN')} against ${sale.invoice_number}.`);
    return { ok: true };
  };

  const processReturn = (input: ProcessReturnInput) => {
    const sale = db.sales.find((s) => s.id === input.sale_id);
    if (!sale) return { ok: false, error: 'Original sales invoice not found.' };

    const saleItem = db.sale_items.find(
      (si) => si.id === input.sale_item_id && si.sale_id === sale.id
    );
    if (!saleItem) {
      return { ok: false, error: 'Selected item does not belong to this invoice.' };
    }
    if (saleItem.returned) {
      return { ok: false, error: 'This item has already been returned.' };
    }

    const stockItem = db.stock_items.find((s) => s.id === saleItem.stock_item_id);
    if (!stockItem || stockItem.status !== 'Sold') {
      return {
        ok: false,
        error: 'Inventory verification failed: item is not currently recorded as Sold.',
      };
    }
    if (!input.reason.trim()) {
      return { ok: false, error: 'Please specify a return reason.' };
    }

    const now = new Date().toISOString();
    const returnNumber = `RET-${new Date().getFullYear()}-${String(db.next_return_seq).padStart(3, '0')}`;
    const refundAmount = Math.max(0, round2(input.refund_amount));
    const newStockStatus: StockStatus = input.restock_to_available ? 'Available' : 'Damaged';

    const salesReturn: SalesReturn = {
      id: createId('ret'),
      return_number: returnNumber,
      sale_id: sale.id,
      invoice_number: sale.invoice_number,
      sale_item_id: saleItem.id,
      stock_item_id: stockItem.id,
      serial_number: stockItem.serial_number,
      product_name: saleItem.product_name,
      customer_id: sale.customer_id,
      customer_name: sale.customer_name,
      return_date: input.return_date || todayISO(),
      reason: input.reason.trim(),
      resolution: input.resolution,
      refund_amount: refundAmount,
      refund_mode: input.refund_mode,
      restock_to_available: input.restock_to_available,
      created_by: actorName,
      created_at: now,
    };

    const movement: StockMovement = {
      id: createId('mov'),
      stock_item_id: stockItem.id,
      product_id: stockItem.product_id,
      serial_number: stockItem.serial_number,
      movement_type: input.restock_to_available ? 'RETURN_RESTOCK' : 'RETURN_DAMAGED',
      reference_type: 'RETURN',
      reference_id: salesReturn.id,
      reference_number: returnNumber,
      previous_status: 'Sold',
      new_status: newStockStatus,
      notes: `Return from ${sale.invoice_number}: ${input.reason.trim()}`,
      created_by: actorName,
      created_at: now,
    };

    const refundPayment: Payment | null =
      refundAmount > 0
        ? {
            id: createId('pay'),
            reference_type: 'refund',
            reference_id: salesReturn.id,
            party_id: sale.customer_id,
            party_name: sale.customer_name,
            payment_date: salesReturn.return_date,
            mode: input.refund_mode,
            amount: refundAmount,
            notes: `${input.resolution === 'exchange' ? 'Exchange credit' : 'Refund'} for ${returnNumber} (${sale.invoice_number})`,
            created_by: actorName,
            created_at: now,
          }
        : null;

    const allSaleItems = db.sale_items.filter((si) => si.sale_id === sale.id);
    const allReturnedNow = allSaleItems.every(
      (si) => si.id === saleItem.id || si.returned
    );

    setDb((prev) => ({
      ...prev,
      returns: [salesReturn, ...prev.returns],
      sale_items: prev.sale_items.map((si) =>
        si.id === saleItem.id ? { ...si, returned: true } : si
      ),
      sales: prev.sales.map((s) =>
        s.id === sale.id
          ? {
              ...s,
              status: allReturnedNow ? 'returned' : 'partial_return',
              updated_at: now,
            }
          : s
      ),
      stock_items: prev.stock_items.map((st) =>
        st.id === stockItem.id
          ? {
              ...st,
              status: newStockStatus,
              sale_id: null,
              sale_item_id: null,
              notes: `Returned via ${returnNumber}`,
              updated_at: now,
            }
          : st
      ),
      stock_movements: [movement, ...prev.stock_movements],
      payments: refundPayment ? [refundPayment, ...prev.payments] : prev.payments,
      next_return_seq: prev.next_return_seq + 1,
    }));

    notify(
      'success',
      `Return ${returnNumber} confirmed — ${stockItem.serial_number} moved to ${newStockStatus}.`
    );
    return { ok: true, salesReturn };
  };

  return (
    <StoreContext.Provider
      value={{
        db,
        isCloudMode,
        cloudStatus,
        cloudEmail,
        syncState,
        clearSyncError,
        waitForSave,
        cloudSignIn,
        cloudSignUp,
        cloudCreateShop,
        reloadFromCloud,
        currentUser,
        toasts,
        dismissToast,
        notify,
        loginWithCredentials,
        switchDemoUser,
        logout,
        addUser,
        toggleUserActive,
        updateShopSettings,
        recordMetalRate,
        getLatestRate,
        resetSampleData,
        restoreBackup,
        saveProduct,
        toggleProductActive,
        importProducts,
        importMmtcStock,
        adjustStockStatus,
        saveSupplier,
        savePurchase,
        deleteDraftPurchase,
        reverseCompletedPurchase,
        recordPurchasePayment,
        saveCustomer,
        createSale,
        recordSalePayment,
        processReturn,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore must be used inside StoreProvider');
  }
  return ctx;
}
