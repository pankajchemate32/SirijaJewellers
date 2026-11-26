import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Coins,
  FileText,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  Trash2,
  Wallet,
  Wand2,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useStore } from '../context/StoreContext';
import { PaymentMode, Purchase, TaxMode } from '../types/database';
import {
  calculateTaxBreakdown,
  formatDateDisplay,
  formatINR,
  round2,
  todayISO,
} from '../utils/format';

interface DraftLine {
  key: string;
  product_id: string;
  quantity: number;
  rate_per_gram: number;
  making_charges: number;
  discount: number;
  serialText: string;
}

export const PurchasesPage: React.FC = () => {
  const {
    db,
    currentUser,
    getLatestRate,
    savePurchase,
    deleteDraftPurchase,
    reverseCompletedPurchase,
    recordPurchasePayment,
  } = useStore();

  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'completed' | 'draft' | 'reversed'>('ALL');

  // Form State
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [supplierId, setSupplierId] = useState(db.suppliers[0]?.id || '');
  const [supplierInvNo, setSupplierInvNo] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [taxMode, setTaxMode] = useState<TaxMode>(db.shop_settings.default_tax_mode);
  const [gstRate, setGstRate] = useState<number>(db.shop_settings.default_gst_rate);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Bank Transfer');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [payInFull, setPayInFull] = useState(true);
  const [notes, setNotes] = useState('');
  const [attachmentName, setAttachmentName] = useState<string | undefined>(undefined);
  const [attachmentDataUrl, setAttachmentDataUrl] = useState<string | undefined>(undefined);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [formError, setFormError] = useState('');

  // Reversal & Payment State
  const [reversingPurchase, setReversingPurchase] = useState<Purchase | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [payingPurchaseId, setPayingPurchaseId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<PaymentMode>('Bank Transfer');
  const [payNotes, setPayNotes] = useState('');

  const supplierById = useMemo(
    () => new Map(db.suppliers.map((s) => [s.id, s.name])),
    [db.suppliers]
  );
  const productById = useMemo(
    () => new Map(db.products.map((p) => [p.id, p])),
    [db.products]
  );

  const overviewStats = useMemo(() => {
    const completed = db.purchases.filter((p) => p.status === 'completed');
    const draftCount = db.purchases.filter((p) => p.status === 'draft').length;
    const completedIds = new Set(completed.map((p) => p.id));
    const totalUnits = db.purchase_items
      .filter((pi) => completedIds.has(pi.purchase_id))
      .reduce((sum, pi) => sum + pi.quantity, 0);
    const totalValue = completed.reduce((sum, p) => sum + p.grand_total, 0);
    const totalPaid = completed.reduce((sum, p) => sum + p.amount_paid, 0);
    const totalPayable = completed.reduce((sum, p) => sum + p.balance_due, 0);
    return {
      completedCount: completed.length,
      draftCount,
      totalUnits,
      totalValue,
      totalPaid,
      totalPayable,
    };
  }, [db.purchases, db.purchase_items]);

  const createEmptyLine = (): DraftLine => {
    const firstProd = db.products.find((p) => p.active) || db.products[0];
    const rate = firstProd ? getLatestRate(firstProd.metal) : 7800;
    return {
      key: `ln_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      product_id: firstProd?.id || '',
      quantity: 1,
      rate_per_gram: round2(rate * 0.97),
      making_charges: 150,
      discount: 0,
      serialText: '',
    };
  };

  const openNewPurchase = () => {
    setEditingId(undefined);
    setSupplierId(db.suppliers[0]?.id || '');
    setSupplierInvNo('');
    setPurchaseDate(todayISO());
    setTaxMode(db.shop_settings.default_tax_mode);
    setGstRate(db.shop_settings.default_gst_rate);
    setPaymentMode('Bank Transfer');
    setAmountPaid('');
    setPayInFull(true);
    setNotes('');
    setAttachmentName(undefined);
    setAttachmentDataUrl(undefined);
    setLines([createEmptyLine()]);
    setFormError('');
    setMode('form');
  };

  const openEditDraft = (p: Purchase) => {
    const pItems = db.purchase_items.filter((pi) => pi.purchase_id === p.id);
    setEditingId(p.id);
    setSupplierId(p.supplier_id);
    setSupplierInvNo(p.supplier_invoice_number);
    setPurchaseDate(p.purchase_date);
    setTaxMode(p.tax_mode);
    setGstRate(p.gst_rate);
    setPaymentMode(p.payment_mode);
    setAmountPaid(String(p.amount_paid));
    setPayInFull(p.balance_due <= 0.01);
    setNotes(p.notes);
    setAttachmentName(p.attachment_name);
    setAttachmentDataUrl(p.attachment_data_url);
    setLines(
      pItems.map((pi) => ({
        key: pi.id,
        product_id: pi.product_id,
        quantity: pi.quantity,
        rate_per_gram: pi.rate_per_gram,
        making_charges: pi.making_charges,
        discount: pi.discount,
        serialText: pi.serial_numbers.join(', '),
      }))
    );
    setFormError('');
    setMode('form');
  };

  const parseSerials = (text: string): string[] =>
    text
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const autoGenerateSerials = (lineKey: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== lineKey) return l;
        const prod = productById.get(l.product_id);
        const prefix = prod
          ? `${prod.metal === 'Gold' ? 'AU' : 'AG'}${prod.weight_grams}G`
          : 'MMTC';
        const base = Date.now().toString().slice(-5);
        const generated = Array.from(
          { length: Math.max(1, l.quantity) },
          (_, idx) => `MP-${prefix}-${base}${String(idx + 1).padStart(2, '0')}`
        );
        return { ...l, serialText: generated.join(', ') };
      })
    );
  };

  const handleAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setFormError('Attachment file must be under 2 MB for local storage.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentName(file.name);
      setAttachmentDataUrl(typeof reader.result === 'string' ? reader.result : undefined);
    };
    reader.readAsDataURL(file);
  };

  const purchaseTotals = useMemo(() => {
    let subtotal = 0;
    let discountTotal = 0;
    let taxableTotal = 0;

    lines.forEach((l) => {
      const prod = productById.get(l.product_id);
      const wt = prod?.weight_grams || 0;
      const gross = round2((l.quantity || 0) * (wt * (l.rate_per_gram || 0) + (l.making_charges || 0)));
      const disc = Math.max(0, round2(l.discount || 0));
      const taxable = Math.max(0, round2(gross - disc));
      subtotal = round2(subtotal + gross);
      discountTotal = round2(discountTotal + disc);
      taxableTotal = round2(taxableTotal + taxable);
    });

    const tax = calculateTaxBreakdown(taxableTotal, gstRate, taxMode);
    const paid = payInFull ? tax.grandTotal : Math.max(0, round2(parseFloat(amountPaid) || 0));
    const balance = round2(Math.max(0, tax.grandTotal - paid));

    return { subtotal, discountTotal, taxableTotal, ...tax, paid, balance };
  }, [lines, productById, gstRate, taxMode, payInFull, amountPaid]);

  const submitPurchase = (confirmImmediately: boolean) => {
    setFormError('');
    const res = savePurchase({
      id: editingId,
      supplier_id: supplierId,
      supplier_invoice_number: supplierInvNo,
      purchase_date: purchaseDate,
      tax_mode: taxMode,
      gst_rate: gstRate,
      payment_mode: paymentMode,
      amount_paid: purchaseTotals.paid,
      notes,
      attachment_name: attachmentName,
      attachment_data_url: attachmentDataUrl,
      confirmImmediately,
      items: lines.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        rate_per_gram: l.rate_per_gram,
        making_charges: l.making_charges,
        discount: l.discount,
        gst_rate: gstRate,
        serial_numbers: parseSerials(l.serialText),
      })),
    });

    if (!res.ok) {
      setFormError(res.error || 'Could not save purchase.');
      return;
    }
    setMode('list');
  };

  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.purchases.filter((p) => {
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
      if (!q) return true;
      const supName = (supplierById.get(p.supplier_id) || '').toLowerCase();
      return (
        p.purchase_number.toLowerCase().includes(q) ||
        p.supplier_invoice_number.toLowerCase().includes(q) ||
        supName.includes(q)
      );
    });
  }, [db.purchases, search, statusFilter, supplierById]);

  const handleRecordSupplierPay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingPurchaseId) return;
    const res = recordPurchasePayment(
      payingPurchaseId,
      parseFloat(payAmount) || 0,
      payMode,
      todayISO(),
      payNotes
    );
    if (res.ok) {
      setPayingPurchaseId(null);
      setPayAmount('');
      setPayNotes('');
    }
  };

  return (
    <div className="space-y-6">
      {mode === 'list' ? (
        <>
          {/* Full-width 4-Card Summary Strip */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Confirmed Purchases
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <ShoppingBag className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 font-mono-num text-2xl font-bold text-slate-900">
                {formatINR(overviewStats.totalValue)}
              </div>
              <div className="mt-1 text-xs font-medium text-slate-500">
                {overviewStats.completedCount} confirmed
                {overviewStats.draftCount > 0 ? ` · ${overviewStats.draftCount} draft` : ''}
              </div>
            </div>

            <div className="rounded-xl border border-amber-200/80 bg-amber-50/45 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                  Units Purchased
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <Coins className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 font-mono-num text-2xl font-bold text-slate-900">
                {overviewStats.totalUnits} pcs
              </div>
              <div className="mt-1 text-xs font-medium text-amber-800/80">
                Serial-tracked coins &amp; bars added
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                  Total Paid to Suppliers
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 font-mono-num text-2xl font-bold text-emerald-900">
                {formatINR(overviewStats.totalPaid)}
              </div>
              <div className="mt-1 text-xs font-medium text-emerald-700">
                Settled via Bank / UPI / Cash
              </div>
            </div>

            <div
              className={`rounded-xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] ${
                overviewStats.totalPayable > 0
                  ? 'border-rose-200/90 bg-rose-50/50'
                  : 'border-slate-200/90 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    overviewStats.totalPayable > 0 ? 'text-rose-800' : 'text-slate-500'
                  }`}
                >
                  Outstanding Payables
                </span>
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    overviewStats.totalPayable > 0
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Wallet className="h-4 w-4" />
                </span>
              </div>
              <div
                className={`mt-2 font-mono-num text-2xl font-bold ${
                  overviewStats.totalPayable > 0 ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {formatINR(overviewStats.totalPayable)}
              </div>
              <div className="mt-1 text-xs font-medium text-slate-500">
                {overviewStats.totalPayable > 0 ? 'Pending supplier balance' : 'All supplier bills settled'}
              </div>
            </div>
          </div>

          {/* Search, Filter & Primary Action */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-80 max-w-full">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search PO number, supplier, or invoice..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#C88A12]"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'ALL' | 'completed' | 'draft' | 'reversed')
                }
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-[#C88A12]"
              >
                <option value="ALL">All Purchases</option>
                <option value="completed">Completed</option>
                <option value="draft">Drafts</option>
                <option value="reversed">Reversed</option>
              </select>
            </div>

            <button
              type="button"
              onClick={openNewPurchase}
              className="inline-flex items-center gap-2 rounded-lg bg-[#C88A12] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#AE750B] whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>Record Purchase</span>
            </button>
          </div>

          {payingPurchaseId && (
            <form
              onSubmit={handleRecordSupplierPay}
              className="flex flex-wrap items-end gap-4 rounded-xl border border-amber-300 bg-amber-50/70 p-5"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700">Payment Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="mt-1 w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-num text-sm text-slate-900 outline-none focus:border-[#C88A12]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Payment Mode</label>
                <select
                  value={payMode}
                  onChange={(e) => setPayMode(e.target.value as PaymentMode)}
                  className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#C88A12]"
                >
                  {db.shop_settings.enabled_payment_modes.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[220px]">
                <label className="block text-xs font-semibold text-slate-700">UTR / Notes</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="NEFT / RTGS reference"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#C88A12]"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-[#C88A12] px-4 py-2 text-sm font-semibold text-white hover:bg-[#AE750B]"
                >
                  Record Payment
                </button>
                <button
                  type="button"
                  onClick={() => setPayingPurchaseId(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-5 py-3.5">Purchase No.</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Supplier &amp; Invoice</th>
                  <th className="px-5 py-3.5 text-right">Units</th>
                  <th className="px-5 py-3.5 text-right">Grand Total</th>
                  <th className="px-5 py-3.5 text-right">Balance Due</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-500">
                      No purchases match your filter. Click <strong>Record Purchase</strong> to add
                      a new MMTC or supplier lot.
                    </td>
                  </tr>
                ) : (
                  filteredPurchases.map((p) => {
                    const unitCount = db.purchase_items
                      .filter((pi) => pi.purchase_id === p.id)
                      .reduce((sum, pi) => sum + pi.quantity, 0);
                    return (
                      <tr key={p.id} className="hover:bg-amber-50/30 transition-colors">
                        <td className="px-5 py-3.5 font-mono-num text-sm font-semibold text-slate-900">
                          {p.purchase_number}
                          {p.attachment_data_url && (
                            <a
                              href={p.attachment_data_url}
                              download={p.attachment_name || 'supplier-invoice'}
                              title={`Download ${p.attachment_name}`}
                              className="ml-2 inline-flex align-middle text-[#B47A0E] hover:text-[#8A5C08]"
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-sm text-slate-600 whitespace-nowrap">
                          {formatDateDisplay(p.purchase_date)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-slate-900">
                            {supplierById.get(p.supplier_id) || 'Supplier'}
                          </div>
                          <div className="font-mono-num text-xs text-slate-500">
                            Inv: {p.supplier_invoice_number}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono-num font-medium text-slate-700">
                          {unitCount}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono-num font-semibold text-slate-900">
                          {formatINR(p.grand_total)}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono-num text-sm">
                          {p.balance_due > 0 && p.status === 'completed' ? (
                            <span className="font-semibold text-rose-700">
                              {formatINR(p.balance_due)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-xs font-semibold">
                          {p.status === 'draft' ? (
                            <span className="text-slate-500">Draft</span>
                          ) : p.status === 'reversed' ? (
                            <span className="text-rose-700">Reversed</span>
                          ) : p.payment_status === 'paid' ? (
                            <span className="text-emerald-700">Completed · Paid</span>
                          ) : (
                            <span className="text-amber-700">
                              Completed · {p.payment_status === 'partial' ? 'Partial' : 'Unpaid'}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap text-xs font-semibold">
                          {p.status === 'draft' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditDraft(p)}
                                className="mr-3 text-[#B47A0E] hover:underline"
                              >
                                Edit / Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteDraftPurchase(p.id)}
                                className="text-rose-700 hover:underline"
                              >
                                Delete Draft
                              </button>
                            </>
                          )}
                          {p.status === 'completed' && (
                            <div className="inline-flex items-center gap-3.5">
                              {p.balance_due > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPayingPurchaseId(p.id);
                                    setPayAmount(String(p.balance_due));
                                  }}
                                  className="text-emerald-700 hover:underline"
                                >
                                  Pay Due
                                </button>
                              )}
                              {currentUser?.role === 'owner' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReversingPurchase(p);
                                    setReversalReason('');
                                  }}
                                  className="inline-flex items-center gap-1 text-slate-500 hover:text-rose-700"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  <span>Reverse</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        /* ============ PURCHASE ENTRY FORM ============ */
        <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)] space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h2 className="font-display text-xl font-semibold text-slate-900">
                {editingId ? 'Edit Draft Purchase' : 'Record New Bullion Purchase'}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Confirming automatically creates individual serial-tracked stock units with exact
                purchase cost.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMode('list')}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              ← Back to Purchases
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Supplier *</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#C88A12]"
              >
                {db.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.supplier_type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Supplier Invoice Number *
              </label>
              <input
                type="text"
                value={supplierInvNo}
                onChange={(e) => setSupplierInvNo(e.target.value)}
                placeholder="e.g., MMTC/MH/26-27/4502"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono-num text-sm text-slate-900 outline-none focus:border-[#C88A12]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Purchase Date *</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono-num text-sm text-slate-900 outline-none focus:border-[#C88A12]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Supplier Invoice PDF / Image
              </label>
              <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 hover:border-[#C88A12] hover:bg-amber-50/40">
                <FileText className="h-4 w-4 text-[#B47A0E]" />
                <span className="truncate">{attachmentName || 'Attach invoice (optional)'}</span>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleAttachment}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Purchase Product Lines */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Purchased Products &amp; Serials</h3>
              <button
                type="button"
                onClick={() => setLines((prev) => [...prev, createEmptyLine()])}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Product Row</span>
              </button>
            </div>

            {lines.map((line, index) => {
              const prod = productById.get(line.product_id);
              const wt = prod?.weight_grams || 0;
              const gross = round2(line.quantity * (wt * line.rate_per_gram + line.making_charges));
              const taxable = Math.max(0, round2(gross - line.discount));
              const serialList = parseSerials(line.serialText);

              return (
                <div
                  key={line.key}
                  className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <div className="lg:col-span-2">
                      <label className="block text-xs font-semibold text-slate-600">
                        Product #{index + 1}
                      </label>
                      <select
                        value={line.product_id}
                        onChange={(e) => {
                          const newProd = productById.get(e.target.value);
                          const suggestedRate = newProd
                            ? round2(getLatestRate(newProd.metal) * 0.97)
                            : line.rate_per_gram;
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === line.key
                                ? { ...l, product_id: e.target.value, rate_per_gram: suggestedRate }
                                : l
                            )
                          );
                        }}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#C88A12]"
                      >
                        {db.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.weight_grams}g)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === line.key
                                ? { ...l, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) }
                                : l
                            )
                          )
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-num text-sm text-slate-900 outline-none focus:border-[#C88A12]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">
                        Rate / gm (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.rate_per_gram}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === line.key
                                ? { ...l, rate_per_gram: parseFloat(e.target.value) || 0 }
                                : l
                            )
                          )
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-num text-sm text-slate-900 outline-none focus:border-[#C88A12]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">
                        Making / unit (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.making_charges}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === line.key
                                ? { ...l, making_charges: parseFloat(e.target.value) || 0 }
                                : l
                            )
                          )
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-num text-sm text-slate-900 outline-none focus:border-[#C88A12]"
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-slate-600">
                          Line Discount (₹)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.discount}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === line.key
                                  ? { ...l, discount: parseFloat(e.target.value) || 0 }
                                  : l
                              )
                            )
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-num text-sm text-slate-900 outline-none focus:border-[#C88A12]"
                        />
                      </div>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                          className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-white hover:text-rose-600"
                          aria-label="Remove line"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Serial Numbers */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-slate-600">
                          Certificate / Serial Numbers (comma separated — need {line.quantity}, entered{' '}
                          <span
                            className={
                              serialList.length === line.quantity
                                ? 'font-bold text-emerald-700'
                                : 'font-bold text-amber-700'
                            }
                          >
                            {serialList.length}
                          </span>
                          )
                        </label>
                        <button
                          type="button"
                          onClick={() => autoGenerateSerials(line.key)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#B47A0E] hover:underline"
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                          <span>Auto-fill serials</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={line.serialText}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === line.key ? { ...l, serialText: e.target.value } : l
                            )
                          )
                        }
                        placeholder="MP-AU5-260201, MP-AU5-260202"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono-num text-xs text-slate-900 outline-none focus:border-[#C88A12]"
                      />
                    </div>
                    <div className="text-right text-xs text-slate-600 sm:w-52">
                      <div>
                        Line Taxable:{' '}
                        <strong className="font-mono-num text-sm text-slate-900">
                          {formatINR(taxable)}
                        </strong>
                      </div>
                      <div>
                        Unit Cost:{' '}
                        <span className="font-mono-num font-medium text-slate-700">
                          {formatINR(line.quantity > 0 ? taxable / line.quantity : 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Totals & Payment Footer */}
          <div className="grid grid-cols-1 gap-6 border-t border-slate-200 pt-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Tax Mode</label>
                  <select
                    value={taxMode}
                    onChange={(e) => setTaxMode(e.target.value as TaxMode)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#C88A12]"
                  >
                    <option value="CGST_SGST">CGST + SGST</option>
                    <option value="IGST">IGST</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">GST Rate (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={28}
                    step="0.25"
                    value={gstRate}
                    onChange={(e) => setGstRate(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono-num text-sm text-slate-900 outline-none focus:border-[#C88A12]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#C88A12]"
                  >
                    {db.shop_settings.enabled_payment_modes.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700">
                      Amount Paid (₹)
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={payInFull}
                        onChange={(e) => setPayInFull(e.target.checked)}
                        className="accent-[#C88A12]"
                      />
                      Full
                    </label>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={payInFull}
                    value={payInFull ? purchaseTotals.grandTotal : amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono-num text-sm text-slate-900 outline-none focus:border-[#C88A12] disabled:bg-slate-100 disabled:text-slate-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Notes (Optional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Lot details, assay verification remarks"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#C88A12]"
                />
              </div>
            </div>

            <div className="space-y-2.5 rounded-xl bg-[#0F172A] p-5 text-sm text-slate-200">
              <div className="flex justify-between text-slate-300">
                <span>Subtotal</span>
                <span className="font-mono-num font-medium text-white">
                  {formatINR(purchaseTotals.subtotal)}
                </span>
              </div>
              {purchaseTotals.discountTotal > 0 && (
                <div className="flex justify-between text-emerald-300">
                  <span>Discount</span>
                  <span className="font-mono-num">- {formatINR(purchaseTotals.discountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-300">
                <span>Taxable Value</span>
                <span className="font-mono-num font-medium text-white">
                  {formatINR(purchaseTotals.taxableTotal)}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>
                  {taxMode === 'IGST'
                    ? `IGST (${gstRate}%)`
                    : `CGST (${gstRate / 2}%) + SGST (${gstRate / 2}%)`}
                </span>
                <span className="font-mono-num font-medium text-white">
                  {formatINR(purchaseTotals.gstTotal)}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-700 pt-3 text-base font-bold text-white">
                <span>Total Purchase Amount</span>
                <span className="font-mono-num text-lg text-[#F5B942]">
                  {formatINR(purchaseTotals.grandTotal)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-300 pt-0.5">
                <span>Amount Paid: {formatINR(purchaseTotals.paid)}</span>
                <span className={purchaseTotals.balance > 0 ? 'font-semibold text-amber-300' : 'text-emerald-300'}>
                  Balance Due: {formatINR(purchaseTotals.balance)}
                </span>
              </div>
            </div>
          </div>

          {formError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {formError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => submitPurchase(false)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Save as Draft
            </button>
            <button
              type="button"
              onClick={() => submitPurchase(true)}
              className="rounded-lg bg-[#C88A12] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#AE750B]"
            >
              Confirm Purchase &amp; Add Stock
            </button>
          </div>
        </div>
      )}

      {/* Controlled Purchase Reversal Dialog (Owner Only) */}
      <ConfirmDialog
        open={Boolean(reversingPurchase)}
        title={`Reverse Completed Purchase ${reversingPurchase?.purchase_number || ''}`}
        description="Reversing removes all still-available units from this purchase out of inventory and logs a permanent PURCHASE_REVERSAL audit movement. Fails if any unit has already been sold."
        confirmLabel="Confirm Reversal"
        danger
        onCancel={() => setReversingPurchase(null)}
        onConfirm={() => {
          if (reversingPurchase) {
            const res = reverseCompletedPurchase(reversingPurchase.id, reversalReason);
            if (res.ok) setReversingPurchase(null);
          }
        }}
      >
        <div>
          <label className="block text-xs font-semibold text-slate-700">Reversal Reason *</label>
          <input
            type="text"
            required
            value={reversalReason}
            onChange={(e) => setReversalReason(e.target.value)}
            placeholder="e.g., Supplier invoice rate mismatch — re-issued"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-600"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
};

