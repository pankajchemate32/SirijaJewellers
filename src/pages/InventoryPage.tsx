import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Plus,
  Search,
  Upload,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MmtcImportResult, useStore } from '../context/StoreContext';
import { MetalType, Product, ProductType, StockStatus } from '../types/database';
import {
  downloadMmtcTemplate,
  downloadProductTemplate,
  ParsedProductRow,
  ParsedWorkbookPreview,
  parseMmtcExcelFile,
  parseProductExcelFile,
} from '../utils/excel';
import {
  formatDateDisplay,
  formatDateTimeDisplay,
  formatINR,
  formatWeight,
  todayISO,
} from '../utils/format';

type InventoryTab = 'units' | 'summary' | 'products' | 'import' | 'movements';

export const InventoryPage: React.FC = () => {
  const {
    db,
    currentUser,
    saveProduct,
    toggleProductActive,
    importMmtcStock,
    importProducts,
    adjustStockStatus,
    notify,
  } = useStore();
  const [productImport, setProductImport] = useState<ParsedProductRow[] | null>(null);

  const [activeTab, setActiveTab] = useState<InventoryTab>('units');

  // Stock Units Search & Filters
  const [search, setSearch] = useState('');
  const [metalFilter, setMetalFilter] = useState<'ALL' | MetalType>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | StockStatus>('Available');
  const [adjustingStockId, setAdjustingStockId] = useState<string | null>(null);
  const [adjustTargetStatus, setAdjustTargetStatus] = useState<StockStatus>('Damaged');
  const [adjustNotes, setAdjustNotes] = useState('');

  // Product Master Inline Form
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | undefined>(undefined);
  const [pSku, setPSku] = useState('');
  const [pName, setPName] = useState('');
  const [pMetal, setPMetal] = useState<MetalType>('Gold');
  const [pPurity, setPPurity] = useState('999.9');
  const [pWeight, setPWeight] = useState('5');
  const [pType, setPType] = useState<ProductType>('Coin');
  const [pHsn, setPHsn] = useState('71141910');
  const [pDesc, setPDesc] = useState('');
  const [pActive, setPActive] = useState(true);
  const [productError, setProductError] = useState('');
  const [productSearch, setProductSearch] = useState('');

  // MMTC Import State
  const [importSupplierId, setImportSupplierId] = useState<string>(
    db.suppliers.find((s) => s.supplier_type === 'MMTC')?.id || db.suppliers[0]?.id || ''
  );
  const [importDate, setImportDate] = useState(todayISO());
  const [preview, setPreview] = useState<ParsedWorkbookPreview | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState<MmtcImportResult | null>(null);

  const productById = useMemo(
    () => new Map(db.products.map((p) => [p.id, p])),
    [db.products]
  );
  const supplierById = useMemo(
    () => new Map(db.suppliers.map((s) => [s.id, s.name])),
    [db.suppliers]
  );
  const saleById = useMemo(
    () => new Map(db.sales.map((s) => [s.id, s.invoice_number])),
    [db.sales]
  );

  // Top Inventory KPIs
  const stats = useMemo(() => {
    const avail = db.stock_items.filter((s) => s.status === 'Available');
    let goldQty = 0;
    let goldWt = 0;
    let silverQty = 0;
    let silverWt = 0;
    let totalValue = 0;

    for (const st of avail) {
      totalValue += st.purchase_price;
      const p = productById.get(st.product_id);
      if (p?.metal === 'Gold') {
        goldQty++;
        goldWt += p.weight_grams;
      } else if (p?.metal === 'Silver') {
        silverQty++;
        silverWt += p.weight_grams;
      }
    }
    return {
      totalAvail: avail.length,
      goldQty,
      goldWt,
      silverQty,
      silverWt,
      totalValue,
    };
  }, [db.stock_items, productById]);

  const filteredStock = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.stock_items.filter((st) => {
      const prod = productById.get(st.product_id);
      if (statusFilter !== 'ALL' && st.status !== statusFilter) return false;
      if (metalFilter !== 'ALL' && prod?.metal !== metalFilter) return false;
      if (!q) return true;
      return (
        st.id.toLowerCase().includes(q) ||
        st.serial_number.toLowerCase().includes(q) ||
        (st.barcode && st.barcode.toLowerCase().includes(q)) ||
        (prod?.sku_code.toLowerCase().includes(q) ?? false) ||
        (prod?.name.toLowerCase().includes(q) ?? false) ||
        (prod?.purity.toLowerCase().includes(q) ?? false) ||
        (prod ? String(prod.weight_grams).includes(q) : false)
      );
    });
  }, [db.stock_items, productById, search, metalFilter, statusFilter]);

  // Product-wise & Weight-wise summaries
  const summaries = useMemo(() => {
    const avail = db.stock_items.filter((s) => s.status === 'Available');
    const byProduct = new Map<
      string,
      { product: Product; qty: number; totalWeight: number; totalValue: number }
    >();
    const byWeightKey = new Map<
      string,
      { metal: MetalType; weight: number; qty: number; totalWeight: number; totalValue: number }
    >();

    for (const st of avail) {
      const prod = productById.get(st.product_id);
      if (!prod) continue;
      const pEntry = byProduct.get(prod.id) || {
        product: prod,
        qty: 0,
        totalWeight: 0,
        totalValue: 0,
      };
      pEntry.qty += 1;
      pEntry.totalWeight += prod.weight_grams;
      pEntry.totalValue += st.purchase_price;
      byProduct.set(prod.id, pEntry);

      const wKey = `${prod.metal}_${prod.weight_grams}`;
      const wEntry = byWeightKey.get(wKey) || {
        metal: prod.metal,
        weight: prod.weight_grams,
        qty: 0,
        totalWeight: 0,
        totalValue: 0,
      };
      wEntry.qty += 1;
      wEntry.totalWeight += prod.weight_grams;
      wEntry.totalValue += st.purchase_price;
      byWeightKey.set(wKey, wEntry);
    }

    return {
      productWise: Array.from(byProduct.values()).sort((a, b) => b.totalValue - a.totalValue),
      weightWise: Array.from(byWeightKey.values()).sort((a, b) =>
        a.metal === b.metal ? a.weight - b.weight : a.metal.localeCompare(b.metal)
      ),
    };
  }, [db.stock_items, productById]);

  const openNewProductForm = () => {
    setEditingProductId(undefined);
    setPSku('');
    setPName('');
    setPMetal('Gold');
    setPPurity('999.9');
    setPWeight('5');
    setPType('Coin');
    setPHsn('71141910');
    setPDesc('');
    setPActive(true);
    setProductError('');
    setShowProductForm(true);
  };

  const openEditProductForm = (p: Product) => {
    setEditingProductId(p.id);
    setPSku(p.sku_code);
    setPName(p.name);
    setPMetal(p.metal);
    setPPurity(p.purity);
    setPWeight(String(p.weight_grams));
    setPType(p.type);
    setPHsn(p.hsn_code);
    setPDesc(p.description);
    setPActive(p.active);
    setProductError('');
    setShowProductForm(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    setProductError('');
    const res = saveProduct({
      id: editingProductId,
      sku_code: pSku,
      name: pName,
      metal: pMetal,
      purity: pPurity,
      weight_grams: parseFloat(pWeight) || 0,
      type: pType,
      hsn_code: pHsn,
      description: pDesc,
      active: pActive,
    });
    if (!res.ok) {
      setProductError(res.error || 'Could not save product.');
      return;
    }
    setShowProductForm(false);
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    setImportError('');
    setImportResult(null);
    try {
      const parsed = await parseMmtcExcelFile(file, db.products, db.stock_items);
      if (parsed.rows.length === 0) {
        setImportError(
          'No importable stock rows found. Ensure your sheet includes SKU Code, Product Name, Weight (gm), and Certificate / Serial No.'
        );
        setPreview(null);
      } else {
        setPreview(parsed);
      }
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Unable to parse Excel file. Please use .xlsx, .xls, or .csv.'
      );
      setPreview(null);
    } finally {
      setImportLoading(false);
      e.target.value = '';
    }
  };

  const handleConfirmImport = () => {
    if (!preview) return;
    const validAndDupRows = preview.rows.filter((r) => r.status !== 'error');
    const result = importMmtcStock(
      validAndDupRows,
      importSupplierId || null,
      importDate
    );
    const errorCount = preview.rows.filter((r) => r.status === 'error').length;
    setImportResult({
      ...result,
      failed: result.failed + errorCount,
    });
    setPreview(null);
  };

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return db.products;
    return db.products.filter(
      (p) =>
        p.sku_code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.metal.toLowerCase().includes(q) ||
        String(p.weight_grams).includes(q)
    );
  }, [db.products, productSearch]);

  return (
    <div className="space-y-6">
      {/* Rich Top Inventory KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="text-sm font-medium text-slate-600">Available Stock</div>
          <div className="mt-2 font-mono-num text-2xl font-bold text-slate-900">
            {stats.totalAvail} <span className="text-sm font-normal text-slate-500">units</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">{db.products.length} SKUs in product master</div>
        </div>
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/45 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="text-sm font-semibold text-amber-900">Gold Stock</div>
          <div className="mt-2 font-mono-num text-2xl font-bold text-amber-900">
            {formatWeight(stats.goldWt)}
          </div>
          <div className="mt-1 text-xs text-amber-800/80">{stats.goldQty} available units</div>
        </div>
        <div className="rounded-xl border border-sky-200/80 bg-sky-50/45 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="text-sm font-semibold text-slate-800">Silver Stock</div>
          <div className="mt-2 font-mono-num text-2xl font-bold text-slate-900">
            {formatWeight(stats.silverWt)}
          </div>
          <div className="mt-1 text-xs text-slate-600">{stats.silverQty} available units</div>
        </div>
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="text-sm font-semibold text-emerald-900">Available Purchase Value</div>
          <div className="mt-2 font-mono-num text-2xl font-bold text-emerald-900">
            {formatINR(stats.totalValue)}
          </div>
          <div className="mt-1 text-xs text-emerald-800/80">Actual unit purchase cost basis</div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-slate-200/80 p-1">
          {(
            [
              { id: 'units', label: 'Serial Stock Units' },
              { id: 'summary', label: 'Product & Weight Summary' },
              { id: 'products', label: 'Product Master' },
              { id: 'import', label: 'MMTC Excel Import' },
              { id: 'movements', label: 'Stock Movements' },
            ] as { id: InventoryTab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? 'bg-[#0F172A] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('import')}
          className="inline-flex items-center gap-2 rounded-lg bg-[#C88A12] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#AE750B] whitespace-nowrap"
        >
          <Upload className="h-4 w-4" />
          <span>Import MMTC Excel</span>
        </button>
      </div>

      {/* ============ TAB 1: INDIVIDUAL SERIAL STOCK UNITS ============ */}
      {activeTab === 'units' && (
        <div className="rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
            <div className="relative w-full max-w-lg">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SKU, product, weight, purity, barcode, or certificate no..."
                className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#C88A12] focus:bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={metalFilter}
                onChange={(e) => setMetalFilter(e.target.value as 'ALL' | MetalType)}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-[#C88A12]"
              >
                <option value="ALL">All Metals</option>
                <option value="Gold">Gold Only</option>
                <option value="Silver">Silver Only</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | StockStatus)}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-[#C88A12]"
              >
                <option value="Available">Available</option>
                <option value="Sold">Sold</option>
                <option value="Returned">Returned</option>
                <option value="Damaged">Damaged</option>
                <option value="ALL">All Statuses</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-5 py-3.5">Stock ID</th>
                  <th className="px-4 py-3.5">Product / SKU</th>
                  <th className="px-4 py-3.5">Certificate / Serial No.</th>
                  <th className="px-4 py-3.5">Barcode</th>
                  <th className="px-4 py-3.5">Supplier / Date</th>
                  <th className="px-4 py-3.5 text-right">Purchase Cost</th>
                  <th className="px-4 py-3.5">Status</th>
                  {currentUser?.role === 'owner' && <th className="px-5 py-3.5 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStock.length === 0 ? (
                  <tr>
                    <td
                      colSpan={currentUser?.role === 'owner' ? 8 : 7}
                      className="px-5 py-12 text-center text-sm text-slate-500"
                    >
                      No stock units match your search filter.
                    </td>
                  </tr>
                ) : (
                  filteredStock.map((st) => {
                    const prod = productById.get(st.product_id);
                    return (
                      <tr key={st.id} className="hover:bg-amber-50/30">
                        <td className="px-5 py-3.5 font-mono-num text-xs font-medium text-slate-500">
                          {st.id}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-slate-900">{prod?.name || 'Unknown'}</div>
                          <div className="text-xs text-slate-500">
                            <span className="font-mono-num">{prod?.sku_code}</span> ·{' '}
                            <span
                              className={
                                prod?.metal === 'Gold'
                                  ? 'font-medium text-amber-700'
                                  : 'font-medium text-sky-700'
                              }
                            >
                              {prod?.metal} {prod?.purity}
                            </span>{' '}
                            · {prod ? formatWeight(prod.weight_grams) : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono-num text-sm font-semibold text-slate-900">
                          {st.serial_number}
                        </td>
                        <td className="px-4 py-3.5 font-mono-num text-xs text-slate-500">
                          {st.barcode || '—'}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-slate-700">
                          <div>{st.supplier_id ? supplierById.get(st.supplier_id) || '—' : 'Direct Import'}</div>
                          <div className="text-xs text-slate-400">{formatDateDisplay(st.purchase_date)}</div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono-num font-semibold text-slate-900">
                          {formatINR(st.purchase_price)}
                        </td>
                        <td className="px-4 py-3.5 text-xs font-semibold">
                          <span
                            className={
                              st.status === 'Available'
                                ? 'text-emerald-700'
                                : st.status === 'Sold'
                                ? 'text-slate-600'
                                : st.status === 'Damaged'
                                ? 'text-rose-700'
                                : 'text-amber-700'
                            }
                          >
                            {st.status}
                          </span>
                          {st.sale_id && (
                            <div className="font-mono-num text-[11px] font-normal text-slate-400">
                              {saleById.get(st.sale_id)}
                            </div>
                          )}
                        </td>
                        {currentUser?.role === 'owner' && (
                          <td className="px-5 py-3.5 text-right text-xs font-semibold">
                            {st.status === 'Available' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setAdjustingStockId(st.id);
                                  setAdjustTargetStatus('Damaged');
                                  setAdjustNotes('');
                                }}
                                className="text-slate-500 hover:text-rose-700"
                              >
                                Mark Damaged
                              </button>
                            )}
                            {st.status === 'Damaged' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setAdjustingStockId(st.id);
                                  setAdjustTargetStatus('Available');
                                  setAdjustNotes('');
                                }}
                                className="text-[#B4780C] hover:underline"
                              >
                                Restore Available
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============ TAB 2: PRODUCT & WEIGHT SUMMARY ============ */}
      {activeTab === 'summary' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] lg:col-span-7">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="font-display text-base font-bold text-slate-900">
                Product-Wise Available Stock
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-5 py-3.5">Product</th>
                    <th className="px-4 py-3.5 text-right">Qty</th>
                    <th className="px-4 py-3.5 text-right">Total Wt</th>
                    <th className="px-5 py-3.5 text-right">Stock Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summaries.productWise.map((row) => (
                    <tr key={row.product.id} className="hover:bg-amber-50/30">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{row.product.name}</div>
                        <div className="text-xs text-slate-500">
                          <span className="font-mono-num">{row.product.sku_code}</span> ·{' '}
                          <span
                            className={
                              row.product.metal === 'Gold'
                                ? 'font-medium text-amber-700'
                                : 'font-medium text-sky-700'
                            }
                          >
                            {row.product.metal} {row.product.purity}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono-num font-bold text-slate-900">
                        {row.qty}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono-num text-slate-700">
                        {formatWeight(row.totalWeight)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono-num font-semibold text-slate-900">
                        {formatINR(row.totalValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] lg:col-span-5">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="font-display text-base font-bold text-slate-900">
                Weight-Wise Stock Summary
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-5 py-3.5">Metal &amp; Denomination</th>
                    <th className="px-4 py-3.5 text-right">Units</th>
                    <th className="px-4 py-3.5 text-right">Total Wt</th>
                    <th className="px-5 py-3.5 text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summaries.weightWise.map((w) => (
                    <tr key={`${w.metal}_${w.weight}`} className="hover:bg-amber-50/30">
                      <td className="px-5 py-3.5 font-semibold text-slate-900">
                        <span className={w.metal === 'Gold' ? 'text-amber-700' : 'text-sky-700'}>
                          {w.metal}
                        </span>{' '}
                        · {formatWeight(w.weight)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono-num font-semibold text-slate-800">
                        {w.qty}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono-num text-slate-700">
                        {formatWeight(w.totalWeight)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono-num font-semibold text-slate-900">
                        {formatINR(w.totalValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============ TAB 3: PRODUCT MASTER ============ */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products by SKU, name, or weight..."
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#C88A12]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={downloadProductTemplate}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 whitespace-nowrap"
              >
                <Download className="h-4 w-4" />
                <span>Template</span>
              </button>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap">
                <FileSpreadsheet className="h-4 w-4 text-[#B7801A]" />
                <span>Import Excel</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                      const rows = await parseProductExcelFile(file);
                      if (!rows.length) notify('error', 'No product rows found in this file.');
                      else setProductImport(rows);
                    } catch {
                      notify('error', 'Could not read this Excel file.');
                    }
                  }}
                />
              </label>
              <button
                type="button"
                onClick={openNewProductForm}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#C88A12] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#AE750B] whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                <span>Add Product SKU</span>
              </button>
            </div>
          </div>

          {productImport && (() => {
            const existing = new Set(db.products.map((p) => p.sku_code.toUpperCase()));
            const ok = productImport.filter((r) => !r.error);
            const bad = productImport.filter((r) => r.error);
            const newCount = ok.filter((r) => !existing.has(r.sku_code)).length;
            return (
              <div className="rounded-xl border border-amber-300 bg-white p-5 shadow-sm">
                <h3 className="font-display text-base font-bold text-slate-900">Product import preview</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {newCount} new product{newCount === 1 ? '' : 's'}, {ok.length - newCount} existing SKU
                  {ok.length - newCount === 1 ? '' : 's'} to update
                  {bad.length > 0 && <span className="text-rose-700">, {bad.length} row{bad.length === 1 ? '' : 's'} with errors (will be skipped)</span>}.
                  Stock quantities are not changed.
                </p>
                <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Row</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2">Metal</th><th className="px-3 py-2">Weight</th><th className="px-3 py-2">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {productImport.map((r) => (
                        <tr key={`${r.sheetName}-${r.rowNumber}`}>
                          <td className="px-3 py-1.5 text-slate-500">{r.rowNumber}</td>
                          <td className="px-3 py-1.5 font-mono-num">{r.sku_code}</td>
                          <td className="px-3 py-1.5">{r.name}</td>
                          <td className="px-3 py-1.5">{r.metal} {r.purity}</td>
                          <td className="px-3 py-1.5">{r.weight_grams} g</td>
                          <td className={`px-3 py-1.5 font-medium ${r.error ? 'text-rose-700' : existing.has(r.sku_code) ? 'text-sky-700' : 'text-emerald-700'}`}>
                            {r.error || (existing.has(r.sku_code) ? 'Update' : 'New')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setProductImport(null)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={ok.length === 0}
                    onClick={() => {
                      importProducts(ok);
                      setProductImport(null);
                    }}
                    className="rounded-lg bg-[#C88A12] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#AE750B] disabled:opacity-50"
                  >
                    Import {ok.length} product{ok.length === 1 ? '' : 's'}
                  </button>
                </div>
              </div>
            );
          })()}

          {showProductForm && (
            <form
              onSubmit={handleSaveProduct}
              className="rounded-xl border border-amber-300 bg-white p-6 shadow-sm space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-slate-900">
                  {editingProductId ? 'Edit Product Master Record' : 'Add New Coin / Bar SKU'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowProductForm(false)}
                  className="text-sm font-medium text-slate-500 hover:text-slate-900"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">SKU Code *</label>
                  <input
                    type="text"
                    required
                    value={pSku}
                    onChange={(e) => setPSku(e.target.value.toUpperCase())}
                    placeholder="MMTC-AU-5G-LAX"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono-num text-sm uppercase outline-none focus:border-[#C88A12]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                    placeholder="5 gm Gold 999.9 Minted Coin Laxmi"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#C88A12]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Metal *</label>
                  <select
                    value={pMetal}
                    onChange={(e) => {
                      const m = e.target.value as MetalType;
                      setPMetal(m);
                      setPHsn(m === 'Gold' ? '71141910' : '71141110');
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#C88A12]"
                  >
                    <option value="Gold">Gold</option>
                    <option value="Silver">Silver</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Purity *</label>
                  <input
                    type="text"
                    required
                    value={pPurity}
                    onChange={(e) => setPPurity(e.target.value)}
                    placeholder="999.9 / 999 / 916.7"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono-num text-sm outline-none focus:border-[#C88A12]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Weight (grams) *</label>
                  <input
                    type="number"
                    required
                    min="0.1"
                    step="0.001"
                    value={pWeight}
                    onChange={(e) => setPWeight(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono-num text-sm outline-none focus:border-[#C88A12]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Type *</label>
                  <select
                    value={pType}
                    onChange={(e) => setPType(e.target.value as ProductType)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#C88A12]"
                  >
                    <option value="Coin">Coin</option>
                    <option value="Bar">Bar</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">HSN Code *</label>
                  <input
                    type="text"
                    required
                    value={pHsn}
                    onChange={(e) => setPHsn(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono-num text-sm outline-none focus:border-[#C88A12]"
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-semibold text-slate-700">
                    Default Product Description
                  </label>
                  <input
                    type="text"
                    value={pDesc}
                    onChange={(e) => setPDesc(e.target.value)}
                    placeholder="MMTC-PAMP minted bullion in tamper-proof assay card"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#C88A12]"
                  />
                </div>
                <div className="flex items-end">
                  <label className="inline-flex cursor-pointer items-center gap-2 pb-2.5 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={pActive}
                      onChange={(e) => setPActive(e.target.checked)}
                      className="h-4 w-4 rounded accent-[#C88A12]"
                    />
                    <span>Active in POS</span>
                  </label>
                </div>
              </div>

              {productError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                  {productError}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowProductForm(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#C88A12] px-5 py-2 text-sm font-semibold text-white hover:bg-[#AE750B]"
                >
                  Save Product
                </button>
              </div>
            </form>
          )}

          <div className="rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-5 py-3.5">SKU Code</th>
                  <th className="px-4 py-3.5">Product Name</th>
                  <th className="px-4 py-3.5">Metal &amp; Purity</th>
                  <th className="px-4 py-3.5 text-right">Weight</th>
                  <th className="px-4 py-3.5">Type / HSN</th>
                  <th className="px-4 py-3.5 text-right">Available</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((p) => {
                  const availCount = db.stock_items.filter(
                    (s) => s.product_id === p.id && s.status === 'Available'
                  ).length;
                  return (
                    <tr key={p.id} className="hover:bg-amber-50/30">
                      <td className="px-5 py-3.5 font-mono-num text-xs font-semibold text-slate-900">
                        {p.sku_code}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        {p.description && (
                          <div className="max-w-lg truncate text-xs text-slate-500">
                            {p.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-sm">
                        <span
                          className={
                            p.metal === 'Gold'
                              ? 'font-semibold text-amber-700'
                              : 'font-semibold text-sky-700'
                          }
                        >
                          {p.metal}
                        </span>{' '}
                        · {p.purity}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono-num font-medium text-slate-800">
                        {formatWeight(p.weight_grams)}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">
                        {p.type} · <span className="font-mono-num text-xs">{p.hsn_code}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono-num font-bold text-slate-900">
                        {availCount}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-semibold">
                        <span className={p.active ? 'text-emerald-700' : 'text-slate-400'}>
                          {p.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap text-sm font-semibold">
                        <button
                          type="button"
                          onClick={() => openEditProductForm(p)}
                          className="mr-3 text-[#B4780C] hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleProductActive(p.id)}
                          className="text-slate-500 hover:text-slate-900"
                        >
                          {p.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============ TAB 4: MMTC EXCEL STOCK IMPORT ============ */}
      {activeTab === 'import' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Import MMTC Gold &amp; Silver Stock from Excel
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
                  Upload your MMTC Excel sheet (.xlsx, .xls, or .csv). Products are matched or
                  auto-created by <strong>SKU Code</strong>, individual units are tracked by{' '}
                  <strong>Certificate / Serial No.</strong>, duplicates are automatically skipped,
                  and any <strong>Summary</strong> sheet is excluded so aggregated stock is never
                  double-counted.
                </p>
              </div>
              <button
                type="button"
                onClick={downloadMmtcTemplate}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:border-amber-400 hover:bg-amber-50 whitespace-nowrap"
              >
                <Download className="h-4 w-4 text-[#C88A12]" />
                <span>Download MMTC Excel Template</span>
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Supplier Source</label>
                <select
                  value={importSupplierId}
                  onChange={(e) => setImportSupplierId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#C88A12]"
                >
                  <option value="">Direct / Opening Stock</option>
                  {db.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Stock Receipt Date</label>
                <input
                  type="date"
                  value={importDate}
                  onChange={(e) => setImportDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono-num text-sm outline-none focus:border-[#C88A12]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Upload Excel File</label>
                <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-amber-400 bg-amber-50/70 px-4 py-2.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100/70">
                  <FileSpreadsheet className="h-4 w-4 text-[#B4780C]" />
                  <span>{importLoading ? 'Reading Excel...' : 'Choose .xlsx / .csv File'}</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleExcelUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {importError && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {importError}
              </div>
            )}

            {importResult && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
                <div className="flex items-center gap-2.5 text-emerald-900">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span>
                    Import complete: <strong>{importResult.imported} imported</strong> ·{' '}
                    <strong>{importResult.skipped} skipped (duplicates)</strong> ·{' '}
                    <strong>{importResult.failed} failed</strong>
                    {importResult.createdProducts > 0
                      ? ` · ${importResult.createdProducts} new SKU(s) created`
                      : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('units')}
                  className="text-sm font-semibold text-emerald-800 hover:underline"
                >
                  View Inventory →
                </button>
              </div>
            )}
          </div>

          {/* Import Preview Table */}
          {preview && (
            <div className="rounded-xl border border-amber-300 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    Import Preview: {preview.fileName}
                  </h3>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Sheets read: <strong>{preview.sheetsRead.join(', ')}</strong>
                    {preview.sheetsSkipped.length > 0 && (
                      <span>
                        {' '}
                        · Skipped Summary sheet(s):{' '}
                        <strong className="text-[#B4780C]">
                          {preview.sheetsSkipped.join(', ')}
                        </strong>
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    className="rounded-lg bg-[#C88A12] px-5 py-2 text-sm font-semibold text-white hover:bg-[#AE750B]"
                  >
                    Confirm &amp; Import{' '}
                    {
                      preview.rows.filter(
                        (r) => r.status === 'ready' || r.status === 'new_sku'
                      ).length
                    }{' '}
                    Unit(s)
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="px-4 py-3">Row</th>
                      <th className="px-4 py-3">SKU Code</th>
                      <th className="px-4 py-3">Product Name</th>
                      <th className="px-4 py-3">Metal / Purity / Wt</th>
                      <th className="px-4 py-3">Cert / Serial No.</th>
                      <th className="px-4 py-3">Barcode</th>
                      <th className="px-4 py-3">Validation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.rows.map((r, i) => (
                      <tr key={`${r.sheetName}_${r.rowNumber}_${i}`}>
                        <td className="px-4 py-3 font-mono-num text-xs text-slate-500">{r.rowNumber}</td>
                        <td className="px-4 py-3 font-mono-num font-semibold text-slate-900">
                          {r.sku_code || '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-800">{r.product_name || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {r.metal} {r.purity} · {r.weight_grams}g ({r.type})
                        </td>
                        <td className="px-4 py-3 font-mono-num font-semibold text-slate-900">
                          {r.serial_number || '—'}
                        </td>
                        <td className="px-4 py-3 font-mono-num text-xs text-slate-500">
                          {r.barcode || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold">
                          <span
                            className={
                              r.status === 'ready'
                                ? 'text-emerald-700'
                                : r.status === 'new_sku'
                                ? 'text-[#B4780C]'
                                : r.status === 'duplicate'
                                ? 'text-amber-700'
                                : 'text-rose-700'
                            }
                          >
                            {r.message}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============ TAB 5: IMMUTABLE STOCK MOVEMENTS ============ */}
      {activeTab === 'movements' && (
        <div className="rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-[#C88A12]" />
              <h2 className="font-display text-base font-bold text-slate-900">
                Stock Movement Audit Log
              </h2>
            </div>
            <span className="text-sm text-slate-500">
              Append-only ledger ({db.stock_movements.length} movements)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-5 py-3.5">Timestamp</th>
                  <th className="px-4 py-3.5">Movement</th>
                  <th className="px-4 py-3.5">Stock ID / Serial</th>
                  <th className="px-4 py-3.5">Reference</th>
                  <th className="px-4 py-3.5">Status Transition</th>
                  <th className="px-5 py-3.5">Notes &amp; User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {db.stock_movements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5 font-mono-num text-xs text-slate-500 whitespace-nowrap">
                      {formatDateTimeDisplay(m.created_at)}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-bold text-slate-900">{m.movement_type}</td>
                    <td className="px-4 py-3.5">
                      <div className="font-mono-num font-semibold text-slate-900">
                        {m.serial_number}
                      </div>
                      <div className="font-mono-num text-xs text-slate-500">
                        {m.stock_item_id}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono-num text-sm text-slate-700">
                      {m.reference_number}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-700">
                      {m.previous_status ? `${m.previous_status} → ` : ''}
                      <strong className="text-slate-900">{m.new_status}</strong>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600">
                      <div>{m.notes}</div>
                      <div className="text-xs text-slate-400">By {m.created_by}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Controlled Stock Adjustment Dialog */}
      <ConfirmDialog
        open={Boolean(adjustingStockId)}
        title={`Update Stock Status to ${adjustTargetStatus}`}
        description="This creates a permanent audit entry in Stock Movements. Historical movements are never deleted."
        confirmLabel={`Confirm ${adjustTargetStatus}`}
        danger={adjustTargetStatus === 'Damaged'}
        onCancel={() => setAdjustingStockId(null)}
        onConfirm={() => {
          if (adjustingStockId) {
            adjustStockStatus(adjustingStockId, adjustTargetStatus, adjustNotes);
            setAdjustingStockId(null);
          }
        }}
      >
        <div>
          <label className="block text-xs font-semibold text-slate-700">Reason / Remarks</label>
          <input
            type="text"
            value={adjustNotes}
            onChange={(e) => setAdjustNotes(e.target.value)}
            placeholder="e.g., Assay blister seal cracked during display"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#C88A12]"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
};
