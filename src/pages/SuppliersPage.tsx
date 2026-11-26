import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Search } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { PaymentMode, Supplier, SupplierType } from '../types/database';
import { formatDateDisplay, formatINR, todayISO } from '../utils/format';

export const SuppliersPage: React.FC = () => {
  const { db, saveSupplier, recordPurchasePayment } = useStore();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [supplierType, setSupplierType] = useState<SupplierType>('MMTC');
  const [formError, setFormError] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payingPurchaseId, setPayingPurchaseId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<PaymentMode>('Bank Transfer');

  const openAdd = () => {
    setEditingId(undefined);
    setName('');
    setContactNumber('');
    setAddress('');
    setGstin('');
    setSupplierType('MMTC');
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (s: Supplier) => {
    setEditingId(s.id);
    setName(s.name);
    setContactNumber(s.contact_number);
    setAddress(s.address);
    setGstin(s.gstin);
    setSupplierType(s.supplier_type);
    setFormError('');
    setShowForm(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const res = saveSupplier({
      id: editingId,
      name,
      contact_number: contactNumber,
      address,
      gstin,
      supplier_type: supplierType,
    });
    if (!res.ok) {
      setFormError(res.error || 'Could not save supplier.');
      return;
    }
    setShowForm(false);
  };

  const supplierSummaries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.suppliers
      .filter((s) => {
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.contact_number.toLowerCase().includes(q) ||
          s.gstin.toLowerCase().includes(q) ||
          s.supplier_type.toLowerCase().includes(q)
        );
      })
      .map((s) => {
        const purchases = db.purchases.filter(
          (p) => p.supplier_id === s.id && p.status === 'completed'
        );
        const totalPurchased = purchases.reduce((sum, p) => sum + p.grand_total, 0);
        const outstanding = purchases.reduce((sum, p) => sum + p.balance_due, 0);
        return {
          supplier: s,
          purchases,
          purchaseCount: purchases.length,
          totalPurchased,
          outstanding,
        };
      });
  }, [db.suppliers, db.purchases, search]);

  const totalPayable = useMemo(
    () =>
      db.purchases
        .filter((p) => p.status === 'completed')
        .reduce((sum, p) => sum + p.balance_due, 0),
    [db.purchases]
  );

  const handlePaySupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingPurchaseId) return;
    const res = recordPurchasePayment(
      payingPurchaseId,
      parseFloat(payAmount) || 0,
      payMode,
      todayISO(),
      'Paid via Supplier ledger'
    );
    if (res.ok) {
      setPayingPurchaseId(null);
      setPayAmount('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplier by name, GSTIN, or type..."
            className="w-full rounded-lg border border-[#E7E5E0] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#9A6B1C]"
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-zinc-600">
            Total Payables:{' '}
            <strong
              className={`font-mono-num text-sm ${
                totalPayable > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {formatINR(totalPayable)}
            </strong>
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#9A6B1C] px-4 py-2 text-sm font-medium text-white hover:bg-[#825814] whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>Add Supplier</span>
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSave}
          className="rounded-xl border border-[#C9A25B] bg-white p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-zinc-900">
              {editingId ? 'Edit Supplier' : 'Add Supplier'}
            </h2>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs text-zinc-500 hover:text-zinc-900"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-zinc-700">Supplier Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., MMTC-PAMP India Pvt. Ltd."
                className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#9A6B1C]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">Supplier Type *</label>
              <select
                value={supplierType}
                onChange={(e) => setSupplierType(e.target.value as SupplierType)}
                className="mt-1 w-full rounded-lg border border-[#E7E5E0] bg-white px-3 py-2 text-sm outline-none focus:border-[#9A6B1C]"
              >
                <option value="MMTC">MMTC</option>
                <option value="Bullion Wholesaler">Bullion Wholesaler</option>
                <option value="Refinery">Refinery</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">Contact Number</label>
              <input
                type="text"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="+91 22 ..."
                className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 font-mono-num text-sm outline-none focus:border-[#9A6B1C]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">GSTIN</label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="06AAFCM2914G1Z2"
                className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 font-mono-num text-sm uppercase outline-none focus:border-[#9A6B1C]"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-5">
              <label className="block text-xs font-medium text-zinc-700">Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Office / bullion vault address"
                className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#9A6B1C]"
              />
            </div>
          </div>
          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-[#E7E5E0] px-4 py-2 text-sm text-zinc-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#9A6B1C] px-5 py-2 text-sm font-medium text-white hover:bg-[#825814]"
            >
              Save Supplier
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-[#E7E5E0] bg-white overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#E7E5E0] bg-[#FAF9F6] text-xs font-medium text-zinc-500">
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Contact / GSTIN</th>
              <th className="px-4 py-3 text-right">Purchases</th>
              <th className="px-4 py-3 text-right">Total Purchased</th>
              <th className="px-4 py-3 text-right">Outstanding</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0EFEA]">
            {supplierSummaries.map(({ supplier, purchases, purchaseCount, totalPurchased, outstanding }) => {
              const isExpanded = expandedId === supplier.id;
              return (
                <React.Fragment key={supplier.id}>
                  <tr className="hover:bg-[#FAF9F6]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900">{supplier.name}</div>
                      {supplier.address && (
                        <div className="max-w-xs truncate text-xs text-zinc-500">
                          {supplier.address}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-700">{supplier.supplier_type}</td>
                    <td className="px-4 py-3">
                      <div className="font-mono-num text-xs text-zinc-800">
                        {supplier.contact_number || '—'}
                      </div>
                      {supplier.gstin && (
                        <div className="font-mono-num text-[11px] text-zinc-500">
                          {supplier.gstin}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num text-zinc-700">
                      {purchaseCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num font-medium text-zinc-900">
                      {formatINR(totalPurchased)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num text-xs">
                      {outstanding > 0 ? (
                        <span className="font-semibold text-amber-700">
                          {formatINR(outstanding)}
                        </span>
                      ) : (
                        <span className="text-emerald-700">Clear</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => openEdit(supplier)}
                        className="mr-3 text-zinc-600 hover:text-zinc-900"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : supplier.id)}
                        className="inline-flex items-center gap-1 text-[#9A6B1C] hover:underline"
                      >
                        <span>History</span>
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="bg-[#FAF9F6]">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="text-xs font-semibold text-zinc-700">
                          Purchase History ({purchases.length})
                        </div>
                        {purchases.length === 0 ? (
                          <p className="mt-2 text-xs text-zinc-500">
                            No completed purchases from this supplier yet.
                          </p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {purchases.map((p) => (
                              <div
                                key={p.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E7E5E0] bg-white px-3.5 py-2.5 text-xs"
                              >
                                <div>
                                  <span className="font-mono-num font-semibold text-zinc-900">
                                    {p.purchase_number}
                                  </span>
                                  <span className="ml-2 font-mono-num text-zinc-500">
                                    Inv {p.supplier_invoice_number}
                                  </span>
                                  <span className="ml-2 text-zinc-400">
                                    {formatDateDisplay(p.purchase_date)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="font-mono-num text-zinc-800">
                                    Total: <strong>{formatINR(p.grand_total)}</strong>
                                  </span>
                                  {p.balance_due > 0 ? (
                                    <>
                                      <span className="font-mono-num font-semibold text-amber-700">
                                        Due: {formatINR(p.balance_due)}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPayingPurchaseId(p.id);
                                          setPayAmount(String(p.balance_due));
                                        }}
                                        className="rounded-md bg-[#9A6B1C] px-2.5 py-1 font-medium text-white hover:bg-[#825814]"
                                      >
                                        Pay Due
                                      </button>
                                    </>
                                  ) : (
                                    <span className="font-medium text-emerald-700">Paid</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {payingPurchaseId && purchases.some((p) => p.id === payingPurchaseId) && (
                          <form
                            onSubmit={handlePaySupplier}
                            className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-[#C9A25B] bg-[#FBF7EE] p-3"
                          >
                            <div>
                              <label className="block text-[11px] font-medium text-zinc-700">
                                Amount (₹)
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                required
                                value={payAmount}
                                onChange={(e) => setPayAmount(e.target.value)}
                                className="mt-0.5 w-32 rounded-md border border-[#E7E5E0] bg-white px-2.5 py-1.5 font-mono-num text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-zinc-700">
                                Mode
                              </label>
                              <select
                                value={payMode}
                                onChange={(e) => setPayMode(e.target.value as PaymentMode)}
                                className="mt-0.5 rounded-md border border-[#E7E5E0] bg-white px-2.5 py-1.5 text-xs"
                              >
                                {db.shop_settings.enabled_payment_modes.map((m) => (
                                  <option key={m} value={m}>
                                    {m}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              type="submit"
                              className="rounded-md bg-[#9A6B1C] px-3 py-1.5 text-xs font-medium text-white"
                            >
                              Save Payment
                            </button>
                            <button
                              type="button"
                              onClick={() => setPayingPurchaseId(null)}
                              className="rounded-md border border-[#E7E5E0] bg-white px-3 py-1.5 text-xs text-zinc-600"
                            >
                              Cancel
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
