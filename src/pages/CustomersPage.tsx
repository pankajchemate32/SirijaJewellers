import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Search } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { Customer, PaymentMode } from '../types/database';
import { formatDateDisplay, formatINR, todayISO } from '../utils/format';

export const CustomersPage: React.FC = () => {
  const { db, saveCustomer, recordSalePayment } = useStore();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [formError, setFormError] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payingSaleId, setPayingSaleId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<PaymentMode>('UPI');

  const openAdd = () => {
    setEditingId(undefined);
    setName('');
    setMobile('');
    setAddress('');
    setGstin('');
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (c: Customer) => {
    setEditingId(c.id);
    setName(c.name);
    setMobile(c.mobile);
    setAddress(c.address);
    setGstin(c.gstin);
    setFormError('');
    setShowForm(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const res = saveCustomer({ id: editingId, name, mobile, address, gstin });
    if (!res.ok) {
      setFormError(res.error || 'Unable to save customer.');
      return;
    }
    setShowForm(false);
  };

  const customerSummaries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.customers
      .filter((c) => {
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.mobile.toLowerCase().includes(q) ||
          c.gstin.toLowerCase().includes(q)
        );
      })
      .map((c) => {
        const invoices = db.sales.filter((s) => s.customer_id === c.id);
        const totalValue = invoices.reduce((sum, s) => sum + s.grand_total, 0);
        const pendingAmount = invoices.reduce((sum, s) => sum + s.balance_due, 0);
        return {
          customer: c,
          invoices,
          purchaseCount: invoices.length,
          totalValue,
          pendingAmount,
        };
      });
  }, [db.customers, db.sales, search]);

  const totalReceivable = useMemo(
    () => db.sales.reduce((sum, s) => sum + s.balance_due, 0),
    [db.sales]
  );

  const handleCollect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingSaleId) return;
    const res = recordSalePayment(
      payingSaleId,
      parseFloat(payAmount) || 0,
      payMode,
      todayISO(),
      'Collected from Customer ledger'
    );
    if (res.ok) {
      setPayingSaleId(null);
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
            placeholder="Search customer by name or mobile..."
            className="w-full rounded-lg border border-[#E7E5E0] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#9A6B1C]"
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-zinc-600">
            Total Receivables:{' '}
            <strong
              className={`font-mono-num text-sm ${
                totalReceivable > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {formatINR(totalReceivable)}
            </strong>
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#9A6B1C] px-4 py-2 text-sm font-medium text-white hover:bg-[#825814] whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>Add Customer</span>
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
              {editingId ? 'Edit Customer' : 'Add New Customer'}
            </h2>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs text-zinc-500 hover:text-zinc-900"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700">Customer Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#9A6B1C]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">Mobile Number *</label>
              <input
                type="tel"
                required
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="9820012345"
                className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 font-mono-num text-sm outline-none focus:border-[#9A6B1C]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">GSTIN (Optional)</label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                placeholder="27AAAAA0000A1Z5"
                className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 font-mono-num text-sm uppercase outline-none focus:border-[#9A6B1C]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">Address (Optional)</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="City / Locality"
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
              Save Customer
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-[#E7E5E0] bg-white overflow-x-auto">
        <table className="w-full min-w-[740px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#E7E5E0] bg-[#FAF9F6] text-xs font-medium text-zinc-500">
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Mobile / GSTIN</th>
              <th className="px-4 py-3 text-right">Total Purchases</th>
              <th className="px-4 py-3 text-right">Purchase Value</th>
              <th className="px-4 py-3 text-right">Pending Due</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0EFEA]">
            {customerSummaries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-500">
                  No customers found. Walk-in buyers do not require registration.
                </td>
              </tr>
            ) : (
              customerSummaries.map(({ customer, invoices, purchaseCount, totalValue, pendingAmount }) => {
                const isExpanded = expandedId === customer.id;
                return (
                  <React.Fragment key={customer.id}>
                    <tr className="hover:bg-[#FAF9F6]">
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900">{customer.name}</div>
                        {customer.address && (
                          <div className="text-xs text-zinc-500">{customer.address}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono-num text-xs text-zinc-800">{customer.mobile}</div>
                        {customer.gstin && (
                          <div className="font-mono-num text-[11px] text-zinc-500">
                            GSTIN: {customer.gstin}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num text-zinc-700">
                        {purchaseCount}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num font-medium text-zinc-900">
                        {formatINR(totalValue)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num text-xs">
                        {pendingAmount > 0 ? (
                          <span className="font-semibold text-amber-700">
                            {formatINR(pendingAmount)}
                          </span>
                        ) : (
                          <span className="text-emerald-700">Clear</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => openEdit(customer)}
                          className="mr-3 text-zinc-600 hover:text-zinc-900"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : customer.id)}
                          className="inline-flex items-center gap-1 text-[#9A6B1C] hover:underline"
                        >
                          <span>Invoices</span>
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
                        <td colSpan={6} className="px-6 py-4">
                          <div className="text-xs font-semibold text-zinc-700">
                            Previous Invoices ({invoices.length})
                          </div>
                          {invoices.length === 0 ? (
                            <p className="mt-2 text-xs text-zinc-500">
                              No invoices billed to this customer yet.
                            </p>
                          ) : (
                            <div className="mt-2 space-y-2">
                              {invoices.map((inv) => (
                                <div
                                  key={inv.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E7E5E0] bg-white px-3.5 py-2.5 text-xs"
                                >
                                  <div>
                                    <span className="font-mono-num font-semibold text-zinc-900">
                                      {inv.invoice_number}
                                    </span>
                                    <span className="ml-2 text-zinc-500">
                                      {formatDateDisplay(inv.sale_date)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <span className="font-mono-num text-zinc-800">
                                      Total: <strong>{formatINR(inv.grand_total)}</strong>
                                    </span>
                                    {inv.balance_due > 0 ? (
                                      <>
                                        <span className="font-mono-num font-semibold text-amber-700">
                                          Due: {formatINR(inv.balance_due)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setPayingSaleId(inv.id);
                                            setPayAmount(String(inv.balance_due));
                                          }}
                                          className="rounded-md bg-[#9A6B1C] px-2.5 py-1 font-medium text-white hover:bg-[#825814]"
                                        >
                                          Collect Due
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

                          {payingSaleId && invoices.some((i) => i.id === payingSaleId) && (
                            <form
                              onSubmit={handleCollect}
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
                                Confirm Receipt
                              </button>
                              <button
                                type="button"
                                onClick={() => setPayingSaleId(null)}
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
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
