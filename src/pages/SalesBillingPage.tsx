import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Barcode,
  CheckCircle2,
  ChevronDown,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  Trash2,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { InvoicePreview } from '../components/InvoicePreview';
import { useStore } from '../context/StoreContext';
import { Payment, PaymentMode, ReturnResolution, Sale, SaleItem, TaxMode } from '../types/database';
import {
  calculateTaxBreakdown,
  formatDateDisplay,
  formatINR,
  formatWeight,
  round2,
  todayISO,
} from '../utils/format';

interface CartLine {
  stock_item_id: string;
  serial_number: string;
  product_id: string;
  product_name: string;
  sku_code: string;
  metal: 'Gold' | 'Silver';
  purity: string;
  weight_grams: number;
  hsn_code: string;
  rate_per_gram: number;
  making_charges: number;
  discount: number;
  gst_rate: number;
}

interface PaymentRow {
  id: string;
  mode: PaymentMode;
  amount: string;
  notes: string;
}

type SalesTab = 'pos' | 'history' | 'returns';
type CategoryFilter = 'ALL' | 'GOLD_COIN' | 'GOLD_BAR' | 'SILVER_COIN' | 'SILVER_BAR';

const CATEGORY_OPTIONS: { id: CategoryFilter; label: string }[] = [
  { id: 'ALL', label: 'All Categories' },
  { id: 'GOLD_COIN', label: 'Gold Coins' },
  { id: 'GOLD_BAR', label: 'Gold Bars' },
  { id: 'SILVER_COIN', label: 'Silver Coins' },
  { id: 'SILVER_BAR', label: 'Silver Bars' },
];

export const SalesBillingPage: React.FC = () => {
  const { db, getLatestRate, createSale, recordSalePayment, processReturn, waitForSave } = useStore();
  const [savingBill, setSavingBill] = useState(false);
  const [activeTab, setActiveTab] = useState<SalesTab>('pos');

  // --- POS CUSTOMER STATE ---
  const [saleDate, setSaleDate] = useState(todayISO());
  const [isWalkIn, setIsWalkIn] = useState(true);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [saveNewCustomer, setSaveNewCustomer] = useState(true);

  // --- POS PRODUCT & SERIAL DROPDOWN STATE ---
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [weightFilter, setWeightFilter] = useState<string>('ALL');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedSerialStockId, setSelectedSerialStockId] = useState<string>('');
  const [quickScanInput, setQuickScanInput] = useState('');
  const [scanFeedback, setScanFeedback] = useState('');

  const productComboRef = useRef<HTMLDivElement>(null);
  const customerComboRef = useRef<HTMLDivElement>(null);

  // --- POS CART & PAYMENT STATE ---
  const [cart, setCart] = useState<CartLine[]>([]);
  const [taxMode, setTaxMode] = useState<TaxMode>(db.shop_settings.default_tax_mode);
  const [gstRate, setGstRate] = useState<number>(db.shop_settings.default_gst_rate);
  const [billNotes, setBillNotes] = useState('');
  const [payments, setPayments] = useState<PaymentRow[]>([
    { id: 'p1', mode: 'UPI', amount: '', notes: '' },
  ]);
  const [autoFillFullPayment, setAutoFillFullPayment] = useState(true);
  const [posError, setPosError] = useState('');

  const [completedBill, setCompletedBill] = useState<{
    sale: Sale;
    items: SaleItem[];
    payments: Payment[];
  } | null>(null);

  // --- HISTORY STATE ---
  const [historyQuery, setHistoryQuery] = useState('');
  const [viewingSaleId, setViewingSaleId] = useState<string | null>(null);
  const [collectingSaleId, setCollectingSaleId] = useState<string | null>(null);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectMode, setCollectMode] = useState<PaymentMode>('UPI');
  const [collectNotes, setCollectNotes] = useState('');

  // --- RETURNS STATE ---
  const [returnSearch, setReturnSearch] = useState('');
  const [selectedReturnSaleId, setSelectedReturnSaleId] = useState<string | null>(null);
  const [selectedReturnItemId, setSelectedReturnItemId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [returnResolution, setReturnResolution] = useState<ReturnResolution>('refund');
  const [returnRefundAmount, setReturnRefundAmount] = useState('');
  const [returnRefundMode, setReturnRefundMode] = useState<PaymentMode>('Cash');
  const [returnRestock, setReturnRestock] = useState(true);
  const [returnError, setReturnError] = useState('');

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (productComboRef.current && !productComboRef.current.contains(e.target as Node)) {
        setProductDropdownOpen(false);
      }
      if (customerComboRef.current && !customerComboRef.current.contains(e.target as Node)) {
        setCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const productById = useMemo(
    () => new Map(db.products.map((p) => [p.id, p])),
    [db.products]
  );

  const availableStock = useMemo(
    () => db.stock_items.filter((s) => s.status === 'Available'),
    [db.stock_items]
  );

  const cartStockIds = useMemo(() => new Set(cart.map((c) => c.stock_item_id)), [cart]);

  const availableUnitsByProduct = useMemo(() => {
    const map = new Map<string, typeof availableStock>();
    for (const st of availableStock) {
      if (cartStockIds.has(st.id)) continue;
      const list = map.get(st.product_id) || [];
      list.push(st);
      map.set(st.product_id, list);
    }
    return map;
  }, [availableStock, cartStockIds]);

  const uniqueWeights = useMemo(() => {
    const weights = new Set<number>();
    db.products
      .filter((p) => p.active)
      .forEach((p) => weights.add(p.weight_grams));
    return Array.from(weights).sort((a, b) => a - b);
  }, [db.products]);

  // Filtered products inside the searchable combobox dropdown
  const dropdownProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    return db.products
      .filter((p) => {
        if (!p.active) return false;
        if (categoryFilter === 'GOLD_COIN' && !(p.metal === 'Gold' && p.type === 'Coin'))
          return false;
        if (categoryFilter === 'GOLD_BAR' && !(p.metal === 'Gold' && p.type === 'Bar'))
          return false;
        if (categoryFilter === 'SILVER_COIN' && !(p.metal === 'Silver' && p.type === 'Coin'))
          return false;
        if (categoryFilter === 'SILVER_BAR' && !(p.metal === 'Silver' && p.type === 'Bar'))
          return false;
        if (weightFilter !== 'ALL' && String(p.weight_grams) !== weightFilter) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku_code.toLowerCase().includes(q) ||
          p.metal.toLowerCase().includes(q) ||
          p.purity.toLowerCase().includes(q) ||
          p.type.toLowerCase().includes(q) ||
          String(p.weight_grams).includes(q)
        );
      })
      .map((p) => ({
        product: p,
        units: availableUnitsByProduct.get(p.id) || [],
      }))
      .sort((a, b) => {
        if (a.units.length > 0 && b.units.length === 0) return -1;
        if (a.units.length === 0 && b.units.length > 0) return 1;
        return a.product.name.localeCompare(b.product.name);
      });
  }, [db.products, availableUnitsByProduct, categoryFilter, weightFilter, productQuery]);

  const selectedProduct = selectedProductId ? productById.get(selectedProductId) || null : null;
  const selectedProductUnits = useMemo(
    () => (selectedProductId ? availableUnitsByProduct.get(selectedProductId) || [] : []),
    [selectedProductId, availableUnitsByProduct]
  );

  // Quick scan suggestions (by barcode or serial)
  const quickScanMatches = useMemo(() => {
    const q = quickScanInput.trim().toLowerCase();
    if (!q) return [];
    return availableStock
      .filter(
        (st) =>
          !cartStockIds.has(st.id) &&
          (st.serial_number.toLowerCase().includes(q) ||
            (st.barcode && st.barcode.toLowerCase().includes(q)))
      )
      .slice(0, 5);
  }, [availableStock, cartStockIds, quickScanInput]);

  // Customer search suggestions
  const matchingCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return db.customers.slice(0, 8);
    return db.customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.mobile.toLowerCase().includes(q) ||
          c.gstin.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [db.customers, customerSearch]);

  const addStockToCart = (stockId: string) => {
    const stock = availableStock.find((s) => s.id === stockId);
    if (!stock || cartStockIds.has(stockId)) return;
    const product = productById.get(stock.product_id);
    if (!product) return;

    const latestRate = getLatestRate(product.metal);
    const defaultMaking =
      product.metal === 'Gold'
        ? db.shop_settings.default_gold_making_charge
        : db.shop_settings.default_silver_making_charge;

    setCart((prev) => [
      ...prev,
      {
        stock_item_id: stock.id,
        serial_number: stock.serial_number,
        product_id: product.id,
        product_name: product.name,
        sku_code: product.sku_code,
        metal: product.metal,
        purity: product.purity,
        weight_grams: product.weight_grams,
        hsn_code: product.hsn_code,
        rate_per_gram: latestRate,
        making_charges: defaultMaking,
        discount: 0,
        gst_rate: gstRate,
      },
    ]);
    setPosError('');
    setScanFeedback('');

    // Advance serial picker smoothly if more units of the same product remain
    const remaining = (availableUnitsByProduct.get(product.id) || []).filter(
      (u) => u.id !== stockId
    );
    if (remaining.length > 0 && selectedProductId === product.id) {
      setSelectedSerialStockId(remaining[0].id);
    } else if (selectedProductId === product.id) {
      setSelectedSerialStockId('');
    }
  };

  const handleSelectProductFromDropdown = (productId: string) => {
    setSelectedProductId(productId);
    const units = availableUnitsByProduct.get(productId) || [];
    setSelectedSerialStockId(units[0]?.id || '');
    setProductDropdownOpen(false);
    setProductQuery('');
  };

  const handleQuickScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = quickScanInput.trim().toLowerCase();
    if (!q) return;
    const exact = availableStock.find(
      (st) =>
        !cartStockIds.has(st.id) &&
        (st.serial_number.toLowerCase() === q ||
          (st.barcode && st.barcode.toLowerCase() === q))
    );
    const target = exact || (quickScanMatches.length === 1 ? quickScanMatches[0] : null);
    if (target) {
      addStockToCart(target.id);
      setQuickScanInput('');
      setScanFeedback('');
    } else {
      setScanFeedback('No matching available barcode or serial number found.');
    }
  };

  const updateCartLine = (stockId: string, patch: Partial<CartLine>) => {
    setCart((prev) =>
      prev.map((line) => (line.stock_item_id === stockId ? { ...line, ...patch } : line))
    );
  };

  const removeCartLine = (stockId: string) => {
    setCart((prev) => prev.filter((line) => line.stock_item_id !== stockId));
  };

  // Automatic bill totals
  const totals = useMemo(() => {
    let subtotal = 0;
    let discountTotal = 0;
    let taxableTotal = 0;

    const lineCalcs = cart.map((line) => {
      const gross = round2(
        line.weight_grams * (line.rate_per_gram || 0) + (line.making_charges || 0)
      );
      const disc = Math.max(0, round2(line.discount || 0));
      const taxable = Math.max(0, round2(gross - disc));
      const gstAmt = round2((taxable * gstRate) / 100);
      const total = round2(taxable + gstAmt);
      subtotal = round2(subtotal + gross);
      discountTotal = round2(discountTotal + disc);
      taxableTotal = round2(taxableTotal + taxable);
      return { stock_item_id: line.stock_item_id, taxable, gstAmt, total };
    });

    const tax = calculateTaxBreakdown(taxableTotal, gstRate, taxMode);
    return {
      subtotal,
      discountTotal,
      taxableTotal,
      ...tax,
      lineMap: new Map(lineCalcs.map((l) => [l.stock_item_id, l])),
    };
  }, [cart, gstRate, taxMode]);

  const effectivePayments = useMemo(() => {
    if (autoFillFullPayment && payments.length === 1) {
      return [{ ...payments[0], numericAmount: totals.grandTotal }];
    }
    return payments.map((p) => ({
      ...p,
      numericAmount: Math.max(0, round2(parseFloat(p.amount) || 0)),
    }));
  }, [payments, autoFillFullPayment, totals.grandTotal]);

  const totalReceived = useMemo(
    () => round2(effectivePayments.reduce((sum, p) => sum + p.numericAmount, 0)),
    [effectivePayments]
  );

  const balanceDue = round2(Math.max(0, totals.grandTotal - totalReceived));

  const addSplitPaymentRow = () => {
    setAutoFillFullPayment(false);
    const firstAmount =
      payments.length === 1 && !payments[0].amount
        ? String(round2(totals.grandTotal / 2))
        : payments[0].amount;
    const rem = Math.max(0, round2(totals.grandTotal - (parseFloat(firstAmount) || 0)));
    setPayments((prev) => {
      const updated = prev.map((p, idx) =>
        idx === 0 && !p.amount ? { ...p, amount: firstAmount } : p
      );
      return [
        ...updated,
        {
          id: `p_${Date.now()}`,
          mode: 'Cash',
          amount: rem > 0 ? String(rem) : '',
          notes: '',
        },
      ];
    });
  };

  const resetPosForm = () => {
    setSaleDate(todayISO());
    setIsWalkIn(true);
    setSelectedCustomerId(null);
    setCustomerSearch('');
    setCustomerName('');
    setCustomerMobile('');
    setCustomerGstin('');
    setCategoryFilter('ALL');
    setWeightFilter('ALL');
    setProductQuery('');
    setSelectedProductId('');
    setSelectedSerialStockId('');
    setQuickScanInput('');
    setScanFeedback('');
    setCart([]);
    setTaxMode(db.shop_settings.default_tax_mode);
    setGstRate(db.shop_settings.default_gst_rate);
    setBillNotes('');
    setPayments([{ id: 'p1', mode: 'UPI', amount: '', notes: '' }]);
    setAutoFillFullPayment(true);
    setPosError('');
    setCompletedBill(null);
  };

  const handleSaveBill = async () => {
    if (savingBill) return;
    setPosError('');
    if (cart.length === 0) {
      setPosError('Please add at least one coin or bar to the bill.');
      return;
    }
    if (!isWalkIn && !customerName.trim()) {
      setPosError('Enter customer name or choose Walk-in Customer.');
      return;
    }

    const res = createSale({
      sale_date: saleDate,
      customer_id: isWalkIn ? null : selectedCustomerId,
      customer_name: isWalkIn ? customerName.trim() || 'Walk-in Customer' : customerName.trim(),
      customer_mobile: customerMobile.trim(),
      customer_gstin: customerGstin.trim(),
      is_walk_in: isWalkIn,
      save_new_customer: saveNewCustomer,
      tax_mode: taxMode,
      gst_rate: gstRate,
      notes: billNotes,
      items: cart.map((c) => ({
        stock_item_id: c.stock_item_id,
        rate_per_gram: c.rate_per_gram,
        making_charges: c.making_charges,
        discount: c.discount,
        gst_rate: gstRate,
      })),
      payments: effectivePayments
        .filter((p) => p.numericAmount > 0)
        .map((p) => ({
          mode: p.mode,
          amount: p.numericAmount,
          notes: p.notes,
        })),
    });

    if (!res.ok || !res.sale) {
      setPosError(res.error || 'Could not save invoice.');
      return;
    }

    // Cloud Mode: show the bill as saved only after the database confirms it.
    setSavingBill(true);
    const saved = await waitForSave();
    setSavingBill(false);
    if (!saved) {
      setPosError('This bill was NOT saved. Check the items (one may have just been sold at another counter) and save again.');
      return;
    }

    setCompletedBill({
      sale: res.sale,
      items: res.items || [],
      payments: res.payments || [],
    });
  };

  // --- HISTORY FILTER ---
  const filteredSales = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return db.sales;
    return db.sales.filter((s) => {
      const hasSerial = db.sale_items
        .filter((si) => si.sale_id === s.id)
        .some((si) => si.serial_number.toLowerCase().includes(q));
      return (
        s.invoice_number.toLowerCase().includes(q) ||
        s.customer_name.toLowerCase().includes(q) ||
        s.customer_mobile.toLowerCase().includes(q) ||
        hasSerial
      );
    });
  }, [db.sales, db.sale_items, historyQuery]);

  const viewingSale = useMemo(() => {
    if (!viewingSaleId) return null;
    const sale = db.sales.find((s) => s.id === viewingSaleId);
    if (!sale) return null;
    return {
      sale,
      items: db.sale_items.filter((si) => si.sale_id === sale.id),
      payments: db.payments.filter((p) => p.reference_type === 'sale' && p.reference_id === sale.id),
    };
  }, [viewingSaleId, db.sales, db.sale_items, db.payments]);

  // --- RETURN SEARCH ---
  const matchingReturnSales = useMemo(() => {
    const q = returnSearch.trim().toLowerCase();
    return db.sales
      .filter((s) => {
        if (!q) return true;
        const items = db.sale_items.filter((si) => si.sale_id === s.id);
        return (
          s.invoice_number.toLowerCase().includes(q) ||
          s.customer_name.toLowerCase().includes(q) ||
          s.customer_mobile.toLowerCase().includes(q) ||
          items.some((i) => i.serial_number.toLowerCase().includes(q))
        );
      })
      .slice(0, 8);
  }, [db.sales, db.sale_items, returnSearch]);

  const selectedReturnSale = db.sales.find((s) => s.id === selectedReturnSaleId) || null;
  const selectedReturnSaleItems = useMemo(
    () => (selectedReturnSale ? db.sale_items.filter((si) => si.sale_id === selectedReturnSale.id) : []),
    [selectedReturnSale, db.sale_items]
  );

  const handleConfirmReturn = (e: React.FormEvent) => {
    e.preventDefault();
    setReturnError('');
    if (!selectedReturnSaleId || !selectedReturnItemId) {
      setReturnError('Select an invoice and the exact returned coin/bar.');
      return;
    }
    const res = processReturn({
      sale_id: selectedReturnSaleId,
      sale_item_id: selectedReturnItemId,
      return_date: todayISO(),
      reason: returnReason,
      resolution: returnResolution,
      refund_amount: parseFloat(returnRefundAmount) || 0,
      refund_mode: returnRefundMode,
      restock_to_available: returnRestock,
    });
    if (!res.ok) {
      setReturnError(res.error || 'Could not process return.');
      return;
    }
    setSelectedReturnItemId(null);
    setReturnReason('');
    setReturnRefundAmount('');
  };

  const handleCollectDue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectingSaleId) return;
    const res = recordSalePayment(
      collectingSaleId,
      parseFloat(collectAmount) || 0,
      collectMode,
      todayISO(),
      collectNotes
    );
    if (res.ok) {
      setCollectingSaleId(null);
      setCollectAmount('');
      setCollectNotes('');
    }
  };

  const enabledModes = db.shop_settings.enabled_payment_modes;

  return (
    <div className="space-y-4">
      {/* Compact POS Sub-Navigation Strip */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-slate-200/80 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('pos')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'pos'
                ? 'bg-[#0F172A] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            New Bill (POS)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'history'
                ? 'bg-[#0F172A] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            Invoices ({db.sales.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('returns')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'returns'
                ? 'bg-[#0F172A] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            Returns &amp; Exchanges ({db.returns.length})
          </button>
        </div>

        {activeTab === 'pos' && !completedBill && (
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
            <span>
              Available in vault:{' '}
              <strong className="font-mono-num text-emerald-700">
                {availableStock.length - cart.length}
              </strong>{' '}
              units
            </span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <span>
              Invoice:{' '}
              <strong className="font-mono-num text-slate-900">
                {db.shop_settings.invoice_prefix}
                {db.shop_settings.next_invoice_number}
              </strong>
            </span>
            <input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              aria-label="Invoice Date"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono-num text-xs text-slate-800 outline-none focus:border-[#C88A12]"
            />
          </div>
        )}
      </div>

      {/* =================== TAB 1: FULL-SCREEN POS BILLING SCREEN =================== */}
      {activeTab === 'pos' && (
        <>
          {completedBill ? (
            <div className="mx-auto max-w-5xl space-y-5">
              <div className="no-print flex flex-col justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 sm:flex-row sm:items-center">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                  <div>
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      Invoice {completedBill.sale.invoice_number} Saved
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {completedBill.items.length} physical unit(s) marked Sold and linked to this
                      invoice · Grand Total{' '}
                      <strong className="font-mono-num text-slate-900">
                        {formatINR(completedBill.sale.grand_total)}
                      </strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetPosForm}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#C88A12] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#AE750B] whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Next Bill</span>
                </button>
              </div>

              <InvoicePreview
                sale={completedBill.sale}
                items={completedBill.items}
                payments={completedBill.payments}
                shop={db.shop_settings}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
              {/* LEFT WORKSPACE (68% on desktop): Customer + Searchable Category/Item/Serial Selector + Wide Bill Table */}
              <div className="space-y-4 xl:col-span-8">
                {/* 1. COMPACT CUSTOMER DETAILS BAR */}
                <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <h2 className="font-display text-base font-bold text-slate-900">
                        1. Customer
                      </h2>
                      <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setIsWalkIn(true);
                            setSelectedCustomerId(null);
                          }}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                            isWalkIn
                              ? 'bg-[#0F172A] text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Walk-in
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsWalkIn(false)}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                            !isWalkIn
                              ? 'bg-[#0F172A] text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Existing / New
                        </button>
                      </div>
                    </div>

                    {!isWalkIn && !selectedCustomerId && (
                      <div ref={customerComboRef} className="relative w-full sm:w-80">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={customerSearch}
                          onFocus={() => setCustomerDropdownOpen(true)}
                          onChange={(e) => {
                            setCustomerSearch(e.target.value);
                            setCustomerDropdownOpen(true);
                          }}
                          placeholder="Search saved customer by name or mobile..."
                          className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#C88A12] focus:bg-white"
                        />
                        {customerDropdownOpen && matchingCustomers.length > 0 && (
                          <div className="absolute right-0 z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                            {matchingCustomers.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setSelectedCustomerId(c.id);
                                  setCustomerName(c.name);
                                  setCustomerMobile(c.mobile);
                                  setCustomerGstin(c.gstin);
                                  setCustomerSearch('');
                                  setCustomerDropdownOpen(false);
                                }}
                                className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm hover:bg-amber-50/70"
                              >
                                <span className="flex items-center gap-2 font-medium text-slate-900">
                                  <User className="h-3.5 w-3.5 text-slate-400" />
                                  {c.name}
                                </span>
                                <span className="font-mono-num text-xs text-slate-500">
                                  {c.mobile}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {selectedCustomerId && !isWalkIn ? (
                    <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-sm">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-semibold text-slate-900">{customerName}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-mono-num text-slate-700">{customerMobile}</span>
                        {customerGstin && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="font-mono-num text-xs text-slate-600">
                              GSTIN {customerGstin}
                            </span>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCustomerId(null);
                          setCustomerName('');
                          setCustomerMobile('');
                          setCustomerGstin('');
                        }}
                        className="text-xs font-semibold text-[#B4780C] hover:underline"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder={
                          isWalkIn ? 'Customer Name (Optional — Walk-in)' : 'Customer Full Name *'
                        }
                        className="rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-[#C88A12]"
                      />
                      <input
                        type="tel"
                        value={customerMobile}
                        onChange={(e) => setCustomerMobile(e.target.value)}
                        placeholder="Mobile Number"
                        className="rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono-num text-sm outline-none focus:border-[#C88A12]"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={customerGstin}
                          onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                          placeholder="GSTIN (Optional)"
                          className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono-num text-sm uppercase outline-none focus:border-[#C88A12]"
                        />
                        {!isWalkIn && !selectedCustomerId && (
                          <label
                            title="Save to customer directory"
                            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2.5 text-xs font-medium text-slate-700 whitespace-nowrap"
                          >
                            <input
                              type="checkbox"
                              checked={saveNewCustomer}
                              onChange={(e) => setSaveNewCustomer(e.target.checked)}
                              className="accent-[#C88A12]"
                            />
                            <UserPlus className="h-3.5 w-3.5" />
                            <span>Save</span>
                          </label>
                        )}
                      </div>
                    </div>
                  )}
                </section>

                {/* 2. SCALABLE DROPDOWN SELECTOR: CATEGORY + SEARCHABLE ITEM COMBOBOX + SERIAL DROPDOWN + QUICK SCAN */}
                <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-base font-bold text-slate-900">
                      2. Select Coin / Bar &amp; Certificate Serial
                    </h2>

                    {/* Category Filter Segmented Control */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-slate-100 p-1">
                        {CATEGORY_OPTIONS.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setCategoryFilter(cat.id);
                              setSelectedProductId('');
                              setSelectedSerialStockId('');
                            }}
                            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                              categoryFilter === cat.id
                                ? 'bg-[#0F172A] text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-950'
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>

                      <select
                        value={weightFilter}
                        onChange={(e) => {
                          setWeightFilter(e.target.value);
                          setSelectedProductId('');
                          setSelectedSerialStockId('');
                        }}
                        aria-label="Filter by weight"
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-num text-xs font-medium text-slate-800 outline-none focus:border-[#C88A12]"
                      >
                        <option value="ALL">All Weights</option>
                        {uniqueWeights.map((w) => (
                          <option key={w} value={String(w)}>
                            {formatWeight(w)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Primary Selector Row */}
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                    {/* Searchable Product Dropdown (Combobox) */}
                    <div ref={productComboRef} className="relative lg:col-span-6">
                      <label className="block text-xs font-medium text-slate-600">
                        Item (Search by Name, SKU, Metal or Weight)
                      </label>
                      <div className="relative mt-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={
                            productDropdownOpen
                              ? productQuery
                              : selectedProduct
                              ? `${selectedProduct.name} (${selectedProduct.weight_grams}g · ${selectedProduct.purity})`
                              : productQuery
                          }
                          onFocus={() => {
                            setProductDropdownOpen(true);
                            setProductQuery('');
                          }}
                          onChange={(e) => {
                            setProductQuery(e.target.value);
                            setProductDropdownOpen(true);
                          }}
                          placeholder="Click to browse or type coin/bar name, SKU..."
                          className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-9 text-sm text-slate-900 outline-none transition-colors focus:border-[#C88A12] focus:bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => setProductDropdownOpen((v) => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                          aria-label="Toggle product list"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>

                      {productDropdownOpen && (
                        <div className="absolute left-0 right-0 z-40 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                          <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-500">
                            <span>
                              {dropdownProducts.length} matching item
                              {dropdownProducts.length === 1 ? '' : 's'}
                            </span>
                            <span>Available Stock</span>
                          </div>
                          {dropdownProducts.length === 0 ? (
                            <div className="px-4 py-6 text-center text-sm text-slate-500">
                              No coins or bars match your category or search query.
                            </div>
                          ) : (
                            <div className="divide-y divide-slate-100">
                              {dropdownProducts.map(({ product, units }) => {
                                const isOut = units.length === 0;
                                const isSelected = selectedProductId === product.id;
                                return (
                                  <button
                                    key={product.id}
                                    type="button"
                                    disabled={isOut}
                                    onClick={() => handleSelectProductFromDropdown(product.id)}
                                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                                      isOut
                                        ? 'cursor-not-allowed bg-slate-50/70 opacity-50'
                                        : isSelected
                                        ? 'bg-amber-50/80'
                                        : 'hover:bg-slate-50'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-semibold text-slate-900">
                                        {product.name}
                                      </div>
                                      <div className="mt-0.5 text-xs text-slate-500">
                                        <span
                                          className={
                                            product.metal === 'Gold'
                                              ? 'font-medium text-amber-700'
                                              : 'font-medium text-sky-700'
                                          }
                                        >
                                          {product.metal} {product.purity}
                                        </span>{' '}
                                        · {formatWeight(product.weight_grams)} · {product.type} ·{' '}
                                        <span className="font-mono-num">{product.sku_code}</span>
                                      </div>
                                    </div>
                                    <span
                                      className={`shrink-0 font-mono-num text-xs font-bold ${
                                        isOut ? 'text-slate-400' : 'text-emerald-700'
                                      }`}
                                    >
                                      {isOut ? '0 avail.' : `${units.length} avail.`}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Certificate / Serial Number Dropdown */}
                    <div className="lg:col-span-4">
                      <label className="block text-xs font-medium text-slate-600">
                        Certificate / Serial No.{' '}
                        {selectedProduct ? `(${selectedProductUnits.length} available)` : ''}
                      </label>
                      <select
                        value={selectedSerialStockId}
                        disabled={!selectedProduct || selectedProductUnits.length === 0}
                        onChange={(e) => setSelectedSerialStockId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono-num text-sm text-slate-900 outline-none focus:border-[#C88A12] disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        {!selectedProduct ? (
                          <option value="">Select an item first...</option>
                        ) : selectedProductUnits.length === 0 ? (
                          <option value="">No units remaining</option>
                        ) : (
                          selectedProductUnits.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.serial_number} {u.barcode ? `(${u.barcode})` : ''}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    {/* Add to Bill Button */}
                    <div className="flex items-end lg:col-span-2">
                      <button
                        type="button"
                        disabled={!selectedSerialStockId}
                        onClick={() => selectedSerialStockId && addStockToCart(selectedSerialStockId)}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#C88A12] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#AE750B] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Add Item</span>
                      </button>
                    </div>
                  </div>

                  {/* Secondary Quick-Scan Bar */}
                  <form
                    onSubmit={handleQuickScanSubmit}
                    className="relative flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3.5"
                  >
                    <div className="relative flex-1 min-w-[240px]">
                      <Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={quickScanInput}
                        onChange={(e) => {
                          setQuickScanInput(e.target.value);
                          setScanFeedback('');
                        }}
                        placeholder="Quick scan barcode or type Certificate / Serial No. (press Enter to add instantly)..."
                        className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 font-mono-num text-sm text-slate-900 outline-none focus:border-[#C88A12] focus:bg-white"
                      />
                      {quickScanMatches.length > 0 && (
                        <div className="absolute left-0 right-0 z-30 mt-1 rounded-xl border border-slate-200 bg-white shadow-xl">
                          {quickScanMatches.map((st) => {
                            const prod = productById.get(st.product_id);
                            if (!prod) return null;
                            return (
                              <button
                                key={st.id}
                                type="button"
                                onClick={() => {
                                  addStockToCart(st.id);
                                  setQuickScanInput('');
                                }}
                                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-amber-50/70"
                              >
                                <span>
                                  <strong className="font-mono-num text-slate-900">
                                    {st.serial_number}
                                  </strong>{' '}
                                  · {prod.name} ({prod.weight_grams}g)
                                </span>
                                <span className="font-semibold text-[#B4780C]">+ Add</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <button
                      type="submit"
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      Quick Add
                    </button>
                    {scanFeedback && <span className="text-xs font-medium text-rose-700">{scanFeedback}</span>}
                  </form>
                </section>

                {/* 3. WIDE FULL-SCREEN BILL ITEMS TABLE */}
                <section className="rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                  <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
                    <h2 className="font-display text-base font-bold text-slate-900">
                      Bill Items ({cart.length})
                    </h2>
                    {cart.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCart([])}
                        className="text-xs font-semibold text-slate-500 hover:text-rose-700"
                      >
                        Clear all items
                      </button>
                    )}
                  </div>

                  {cart.length === 0 ? (
                    <div className="px-6 py-16 text-center">
                      <Receipt className="mx-auto h-9 w-9 text-slate-300" />
                      <p className="mt-3 text-base font-semibold text-slate-700">
                        Your bill is ready for items
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Pick a category &amp; item from the dropdown above, or scan a certificate
                        barcode to add coins/bars.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[780px] border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                            <th className="px-4 py-3">Product &amp; Serial</th>
                            <th className="px-3 py-3 text-right">Wt (gm)</th>
                            <th className="px-3 py-3 text-right">Rate / gm (₹)</th>
                            <th className="px-3 py-3 text-right">Making (₹)</th>
                            <th className="px-3 py-3 text-right">Discount (₹)</th>
                            <th className="px-3 py-3 text-right">Taxable</th>
                            <th className="px-3 py-3 text-right">GST ({gstRate}%)</th>
                            <th className="px-4 py-3 text-right">Line Total</th>
                            <th className="px-2 py-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {cart.map((line) => {
                            const calc = totals.lineMap.get(line.stock_item_id);
                            return (
                              <tr key={line.stock_item_id} className="hover:bg-amber-50/30">
                                <td className="px-4 py-3">
                                  <div className="font-semibold text-slate-900">
                                    {line.product_name}
                                  </div>
                                  <div className="mt-0.5 text-xs text-slate-500">
                                    <span
                                      className={
                                        line.metal === 'Gold'
                                          ? 'font-medium text-amber-700'
                                          : 'font-medium text-sky-700'
                                      }
                                    >
                                      {line.metal} {line.purity}
                                    </span>{' '}
                                    · Cert:{' '}
                                    <span className="font-mono-num font-semibold text-slate-800">
                                      {line.serial_number}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-right font-mono-num font-medium text-slate-800">
                                  {line.weight_grams}g
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={line.rate_per_gram}
                                    onChange={(e) =>
                                      updateCartLine(line.stock_item_id, {
                                        rate_per_gram: parseFloat(e.target.value) || 0,
                                      })
                                    }
                                    className="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right font-mono-num text-sm outline-none focus:border-[#C88A12]"
                                  />
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={line.making_charges}
                                    onChange={(e) =>
                                      updateCartLine(line.stock_item_id, {
                                        making_charges: parseFloat(e.target.value) || 0,
                                      })
                                    }
                                    className="w-20 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right font-mono-num text-sm outline-none focus:border-[#C88A12]"
                                  />
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={line.discount}
                                    onChange={(e) =>
                                      updateCartLine(line.stock_item_id, {
                                        discount: parseFloat(e.target.value) || 0,
                                      })
                                    }
                                    className="w-20 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right font-mono-num text-sm outline-none focus:border-[#C88A12]"
                                  />
                                </td>
                                <td className="px-3 py-3 text-right font-mono-num text-slate-700">
                                  {formatINR(calc?.taxable || 0)}
                                </td>
                                <td className="px-3 py-3 text-right font-mono-num text-slate-600">
                                  {formatINR(calc?.gstAmt || 0)}
                                </td>
                                <td className="px-4 py-3 text-right font-mono-num font-bold text-slate-900">
                                  {formatINR(calc?.total || 0)}
                                </td>
                                <td className="px-2 py-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => removeCartLine(line.stock_item_id)}
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                    aria-label="Remove item"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>

              {/* RIGHT CHECKOUT PANEL (32% on desktop): Totals, Tax, Payment & Save */}
              <div className="xl:col-span-4">
                <section className="sticky top-[80px] rounded-xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3.5">
                    <h2 className="font-display text-base font-bold text-slate-900">
                      3. Calculation &amp; Payment
                    </h2>
                    <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setTaxMode('CGST_SGST')}
                        className={`rounded-md px-2.5 py-1 font-semibold ${
                          taxMode === 'CGST_SGST'
                            ? 'bg-[#0F172A] text-white shadow-xs'
                            : 'text-slate-600'
                        }`}
                      >
                        CGST/SGST
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaxMode('IGST')}
                        className={`rounded-md px-2.5 py-1 font-semibold ${
                          taxMode === 'IGST'
                            ? 'bg-[#0F172A] text-white shadow-xs'
                            : 'text-slate-600'
                        }`}
                      >
                        IGST
                      </button>
                    </div>
                  </div>

                  {/* Bill Totals Breakdown */}
                  <div className="mt-4 space-y-2.5 text-sm">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal</span>
                      <span className="font-mono-num font-medium text-slate-900">
                        {formatINR(totals.subtotal)}
                      </span>
                    </div>
                    {totals.discountTotal > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>Discount</span>
                        <span className="font-mono-num text-emerald-700">
                          - {formatINR(totals.discountTotal)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <span>{taxMode === 'IGST' ? 'IGST' : 'CGST + SGST'}</span>
                        <input
                          type="number"
                          min={0}
                          max={28}
                          step="0.25"
                          value={gstRate}
                          onChange={(e) => setGstRate(Math.max(0, parseFloat(e.target.value) || 0))}
                          aria-label="GST rate percentage"
                          className="w-14 rounded border border-slate-300 px-1.5 py-0.5 text-right font-mono-num text-xs text-slate-900 outline-none focus:border-[#C88A12]"
                        />
                        <span className="text-xs">%</span>
                      </span>
                      <span className="font-mono-num font-medium text-slate-900">
                        {formatINR(totals.gstTotal)}
                      </span>
                    </div>

                    {/* High-Contrast Executive Grand Total Strip */}
                    <div className="mt-3 flex items-baseline justify-between rounded-xl bg-[#0F172A] px-4 py-4 text-white">
                      <span className="font-display text-sm font-semibold text-slate-300">
                        Grand Total
                      </span>
                      <span className="font-mono-num text-2xl font-bold text-[#F5B942]">
                        {formatINR(totals.grandTotal)}
                      </span>
                    </div>
                  </div>

                  {/* Payment Mode & Split / Partial Payment */}
                  <div className="mt-5 space-y-3.5 border-t border-slate-200 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">Payment Mode</span>
                      <button
                        type="button"
                        onClick={addSplitPaymentRow}
                        className="text-xs font-semibold text-[#B4780C] hover:underline"
                      >
                        + Split Payment
                      </button>
                    </div>

                    {payments.length === 1 ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                          {enabledModes.map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() =>
                                setPayments((prev) =>
                                  prev.map((p, idx) => (idx === 0 ? { ...p, mode } : p))
                                )
                              }
                              className={`rounded-lg border px-2 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                                payments[0].mode === mode
                                  ? 'border-[#C88A12] bg-amber-50 text-amber-900 shadow-xs'
                                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {mode === 'Bank Transfer' ? 'Bank' : mode}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <label className="text-sm font-medium text-slate-700">
                            Amount Received (₹)
                          </label>
                          <div className="flex items-center gap-2">
                            {!autoFillFullPayment && (
                              <button
                                type="button"
                                onClick={() => {
                                  setAutoFillFullPayment(true);
                                  setPayments((prev) => [{ ...prev[0], amount: '' }]);
                                }}
                                className="text-xs font-semibold text-[#B4780C] hover:underline whitespace-nowrap"
                              >
                                Full Amount
                              </button>
                            )}
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={
                                autoFillFullPayment
                                  ? totals.grandTotal || ''
                                  : payments[0].amount
                              }
                              onChange={(e) => {
                                setAutoFillFullPayment(false);
                                setPayments((prev) =>
                                  prev.map((p, idx) =>
                                    idx === 0 ? { ...p, amount: e.target.value } : p
                                  )
                                );
                              }}
                              className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-right font-mono-num text-sm font-bold text-slate-900 outline-none focus:border-[#C88A12]"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {payments.map((row, idx) => (
                          <div key={row.id} className="flex items-center gap-2">
                            <select
                              value={row.mode}
                              onChange={(e) =>
                                setPayments((prev) =>
                                  prev.map((p) =>
                                    p.id === row.id
                                      ? { ...p, mode: e.target.value as PaymentMode }
                                      : p
                                  )
                                )
                              }
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium outline-none focus:border-[#C88A12]"
                            >
                              {enabledModes.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="Amount"
                              value={row.amount}
                              onChange={(e) =>
                                setPayments((prev) =>
                                  prev.map((p) =>
                                    p.id === row.id ? { ...p, amount: e.target.value } : p
                                  )
                                )
                              }
                              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-right font-mono-num text-sm outline-none focus:border-[#C88A12]"
                            />
                            {idx > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setPayments((prev) => prev.filter((p) => p.id !== row.id))
                                }
                                className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm">
                      <span className="text-slate-600">
                        Received:{' '}
                        <strong className="font-mono-num text-emerald-700">
                          {formatINR(totalReceived)}
                        </strong>
                      </span>
                      <span className="text-slate-600">
                        Balance Due:{' '}
                        <strong
                          className={`font-mono-num ${
                            balanceDue > 0 ? 'text-amber-700' : 'text-slate-900'
                          }`}
                        >
                          {formatINR(balanceDue)}
                        </strong>
                      </span>
                    </div>

                    <input
                      type="text"
                      value={billNotes}
                      onChange={(e) => setBillNotes(e.target.value)}
                      placeholder="Optional bill note (assay card handed over, gift box...)"
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-[#C88A12]"
                    />
                  </div>

                  {posError && (
                    <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                      {posError}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveBill}
                    disabled={cart.length === 0 || savingBill}
                    className="mt-5 w-full rounded-xl bg-[#C88A12] px-5 py-4 text-base font-bold text-white shadow-sm transition-colors hover:bg-[#AE750B] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {savingBill ? 'Saving bill…' : <>Save Invoice &amp; Complete Sale ({formatINR(totals.grandTotal)})</>}
                  </button>
                </section>
              </div>
            </div>
          )}
        </>
      )}

      {/* =================== TAB 2: INVOICES HISTORY =================== */}
      {activeTab === 'history' && (
        <div className="w-full space-y-5">
          {viewingSale ? (
            <div className="mx-auto max-w-5xl space-y-4">
              <div className="no-print flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setViewingSaleId(null)}
                  className="text-sm font-semibold text-[#B4780C] hover:underline"
                >
                  ← Back to all invoices
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedReturnSaleId(viewingSale.sale.id);
                    setViewingSaleId(null);
                    setActiveTab('returns');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Process Return for this Invoice</span>
                </button>
              </div>
              <InvoicePreview
                sale={viewingSale.sale}
                items={viewingSale.items}
                payments={viewingSale.payments}
                shop={db.shop_settings}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
                <div className="relative w-full max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={historyQuery}
                    onChange={(e) => setHistoryQuery(e.target.value)}
                    placeholder="Search invoice no, customer, mobile, or serial..."
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#C88A12] focus:bg-white"
                  />
                </div>
                <div className="text-sm text-slate-600">
                  Showing{' '}
                  <strong className="font-mono-num text-slate-900">{filteredSales.length}</strong>{' '}
                  invoice(s)
                </div>
              </div>

              {collectingSaleId && (
                <form
                  onSubmit={handleCollectDue}
                  className="flex flex-wrap items-end gap-3 border-b border-amber-200 bg-amber-50/70 p-5"
                >
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Amount Received (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={collectAmount}
                      onChange={(e) => setCollectAmount(e.target.value)}
                      className="mt-1 w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-num text-sm outline-none focus:border-[#C88A12]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Payment Mode</label>
                    <select
                      value={collectMode}
                      onChange={(e) => setCollectMode(e.target.value as PaymentMode)}
                      className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#C88A12]"
                    >
                      {enabledModes.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-semibold text-slate-700">
                      Reference / Note
                    </label>
                    <input
                      type="text"
                      value={collectNotes}
                      onChange={(e) => setCollectNotes(e.target.value)}
                      placeholder="UTR / Cash receipt note"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#C88A12]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="rounded-lg bg-[#C88A12] px-4 py-2 text-sm font-semibold text-white hover:bg-[#AE750B]"
                    >
                      Save Payment
                    </button>
                    <button
                      type="button"
                      onClick={() => setCollectingSaleId(null)}
                      className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="px-5 py-3.5">Invoice</th>
                      <th className="px-4 py-3.5">Date</th>
                      <th className="px-4 py-3.5">Customer</th>
                      <th className="px-4 py-3.5 text-right">Items</th>
                      <th className="px-4 py-3.5 text-right">Grand Total</th>
                      <th className="px-4 py-3.5 text-right">Balance Due</th>
                      <th className="px-4 py-3.5">Payment</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSales.map((s) => {
                      const itemCount = db.sale_items.filter((i) => i.sale_id === s.id).length;
                      return (
                        <tr key={s.id} className="hover:bg-amber-50/30">
                          <td className="px-5 py-3.5 font-mono-num text-sm font-semibold text-slate-900">
                            {s.invoice_number}
                            {s.status !== 'completed' && (
                              <span className="ml-1.5 font-sans text-xs font-medium text-amber-700">
                                ({s.status === 'returned' ? 'Returned' : 'Partial Return'})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-sm text-slate-600 whitespace-nowrap">
                            {formatDateDisplay(s.sale_date)}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-slate-900">{s.customer_name}</div>
                            {s.customer_mobile && (
                              <div className="font-mono-num text-xs text-slate-500">
                                {s.customer_mobile}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono-num text-slate-700">
                            {itemCount}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono-num font-semibold text-slate-900">
                            {formatINR(s.grand_total)}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono-num text-sm">
                            {s.balance_due > 0 ? (
                              <span className="font-semibold text-amber-700">
                                {formatINR(s.balance_due)}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-semibold">
                            <span
                              className={
                                s.payment_status === 'paid'
                                  ? 'text-emerald-700'
                                  : s.payment_status === 'partial'
                                  ? 'text-amber-700'
                                  : 'text-rose-700'
                              }
                            >
                              {s.payment_status === 'paid'
                                ? 'Paid'
                                : s.payment_status === 'partial'
                                ? 'Partial'
                                : 'Unpaid'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-3 text-sm font-semibold">
                              {s.balance_due > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCollectingSaleId(s.id);
                                    setCollectAmount(String(s.balance_due));
                                  }}
                                  className="text-emerald-700 hover:underline"
                                >
                                  Collect Due
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setViewingSaleId(s.id)}
                                className="text-[#B4780C] hover:underline"
                              >
                                View / Print
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================== TAB 3: RETURNS & EXCHANGES =================== */}
      {activeTab === 'returns' && (
        <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <h2 className="font-display text-base font-bold text-slate-900">
                Process Verified Sales Return
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Search the original invoice to verify the coin/bar was sold before restoring eligible
                stock to available inventory.
              </p>

              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={returnSearch}
                  onChange={(e) => setReturnSearch(e.target.value)}
                  placeholder="Search by invoice number, customer name, or certificate serial..."
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#C88A12] focus:bg-white"
                />
              </div>

              <div className="mt-3 space-y-2">
                {matchingReturnSales.map((s) => {
                  const selected = selectedReturnSaleId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedReturnSaleId(s.id);
                        setSelectedReturnItemId(null);
                        setReturnError('');
                      }}
                      className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                        selected
                          ? 'border-[#C88A12] bg-amber-50/70'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <span className="font-mono-num font-semibold text-slate-900">
                          {s.invoice_number}
                        </span>
                        <span className="ml-2.5 font-medium text-slate-700">{s.customer_name}</span>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <span className="font-mono-num text-sm font-semibold text-slate-900">
                          {formatINR(s.grand_total)}
                        </span>{' '}
                        · {formatDateDisplay(s.sale_date)}
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedReturnSale && (
                <form
                  onSubmit={handleConfirmReturn}
                  className="mt-5 space-y-4 border-t border-slate-200 pt-5"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      Select Sold Item from {selectedReturnSale.invoice_number}
                    </div>
                    <div className="mt-2 space-y-2">
                      {selectedReturnSaleItems.map((si) => (
                        <button
                          key={si.id}
                          type="button"
                          disabled={si.returned}
                          onClick={() => {
                            setSelectedReturnItemId(si.id);
                            setReturnRefundAmount(String(si.line_total));
                            setReturnError('');
                          }}
                          className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                            si.returned
                              ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400 line-through'
                              : selectedReturnItemId === si.id
                              ? 'border-[#C88A12] bg-amber-50/70'
                              : 'border-slate-200 bg-white hover:border-amber-400'
                          }`}
                        >
                          <div>
                            <div className="font-semibold text-slate-900">{si.product_name}</div>
                            <div className="font-mono-num text-xs text-slate-500">
                              Cert: {si.serial_number} · {si.weight_grams}g
                            </div>
                          </div>
                          <div className="font-mono-num font-bold text-slate-900">
                            {si.returned ? 'Already Returned' : formatINR(si.line_total)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedReturnItemId && (
                    <>
                      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700">
                            Return Reason *
                          </label>
                          <input
                            type="text"
                            required
                            value={returnReason}
                            onChange={(e) => setReturnReason(e.target.value)}
                            placeholder="e.g., Customer exchanged for 10g bar"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#C88A12]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700">
                            Resolution Type
                          </label>
                          <select
                            value={returnResolution}
                            onChange={(e) =>
                              setReturnResolution(e.target.value as ReturnResolution)
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#C88A12]"
                          >
                            <option value="refund">Refund to Customer</option>
                            <option value="exchange">Exchange Adjustment</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700">
                            Refund / Credit Amount (₹)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={returnRefundAmount}
                            onChange={(e) => setReturnRefundAmount(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono-num text-sm outline-none focus:border-[#C88A12]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700">
                            Refund Payment Mode
                          </label>
                          <select
                            value={returnRefundMode}
                            onChange={(e) => setReturnRefundMode(e.target.value as PaymentMode)}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#C88A12]"
                          >
                            {enabledModes.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={returnRestock}
                            onChange={(e) => setReturnRestock(e.target.checked)}
                            className="mt-1 h-4 w-4 rounded accent-[#C88A12]"
                          />
                          <span>
                            <strong>Intact Assay Packaging — Return to Available Stock</strong>
                            <br />
                            <span className="text-xs text-slate-500">
                              Uncheck if tamper-proof packaging is opened or damaged (will mark unit
                              as Damaged instead of Available).
                            </span>
                          </span>
                        </label>
                      </div>

                      {returnError && (
                        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                          {returnError}
                        </p>
                      )}

                      <button
                        type="submit"
                        className="rounded-xl bg-[#C88A12] px-5 py-3 text-sm font-semibold text-white hover:bg-[#AE750B]"
                      >
                        Confirm Return &amp; Update Stock
                      </button>
                    </>
                  )}
                </form>
              )}
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <h3 className="font-display text-base font-bold text-slate-900">Return History</h3>
              {db.returns.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  No sales returns recorded yet. Confirmed returns appear here with traceable stock
                  movements.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {db.returns.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono-num font-bold text-slate-900">
                          {r.return_number}
                        </span>
                        <span className="text-xs text-slate-500">
                          {formatDateDisplay(r.return_date)}
                        </span>
                      </div>
                      <div className="mt-1 font-semibold text-slate-900">{r.product_name}</div>
                      <div className="mt-0.5 text-xs text-slate-600">
                        Inv {r.invoice_number} · Cert{' '}
                        <span className="font-mono-num font-medium">{r.serial_number}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">Reason: {r.reason}</div>
                      <div className="mt-2.5 flex items-center justify-between border-t border-slate-200 pt-2 text-xs">
                        <span
                          className={
                            r.restock_to_available
                              ? 'font-semibold text-emerald-700'
                              : 'font-semibold text-rose-700'
                          }
                        >
                          {r.restock_to_available ? 'Restocked to Available' : 'Marked Damaged'}
                        </span>
                        <span className="font-mono-num font-bold text-slate-900">
                          {r.resolution === 'exchange' ? 'Exchange' : 'Refund'}:{' '}
                          {formatINR(r.refund_amount)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
