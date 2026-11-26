import React, { useMemo } from 'react';
import {
  ArrowRight,
  Boxes,
  Coins,
  IndianRupee,
  Receipt,
  Scale,
  ShoppingBag,
  Upload,
  Wallet,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { NavSection } from '../types/database';
import { formatDateDisplay, formatINR, formatWeight, todayISO } from '../utils/format';

interface DashboardPageProps {
  onNavigate: (section: NavSection) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { db, getLatestRate } = useStore();
  const today = todayISO();

  const metrics = useMemo(() => {
    const productById = new Map(db.products.map((p) => [p.id, p]));

    const todaySales = db.sales
      .filter((s) => s.sale_date === today)
      .reduce((sum, s) => sum + s.grand_total, 0);

    const todayPurchases = db.purchases
      .filter((p) => p.status === 'completed' && p.purchase_date === today)
      .reduce((sum, p) => sum + p.grand_total, 0);

    const availableStock = db.stock_items.filter((s) => s.status === 'Available');
    let goldWeight = 0;
    let silverWeight = 0;
    let goldUnits = 0;
    let silverUnits = 0;
    let inventoryValue = 0;

    for (const item of availableStock) {
      inventoryValue += item.purchase_price;
      const prod = productById.get(item.product_id);
      if (prod?.metal === 'Gold') {
        goldWeight += prod.weight_grams;
        goldUnits++;
      } else if (prod?.metal === 'Silver') {
        silverWeight += prod.weight_grams;
        silverUnits++;
      }
    }

    const customerOutstanding = db.sales.reduce((sum, s) => sum + s.balance_due, 0);
    const supplierOutstanding = db.purchases
      .filter((p) => p.status === 'completed')
      .reduce((sum, p) => sum + p.balance_due, 0);

    return {
      todaySales,
      todayPurchases,
      totalAvailableUnits: availableStock.length,
      goldWeight,
      silverWeight,
      goldUnits,
      silverUnits,
      inventoryValue,
      customerOutstanding,
      supplierOutstanding,
    };
  }, [db, today]);

  const recentTransactions = useMemo(() => {
    const supplierById = new Map(db.suppliers.map((s) => [s.id, s.name]));

    const saleRows = db.sales.map((s) => ({
      id: s.id,
      type: 'Sale' as const,
      date: s.sale_date,
      createdAt: s.created_at,
      ref: s.invoice_number,
      party: s.customer_name,
      amount: s.grand_total,
      balance: s.balance_due,
      status:
        s.payment_status === 'paid'
          ? 'Paid'
          : s.payment_status === 'partial'
          ? 'Partial'
          : 'Unpaid',
      target: 'sales' as NavSection,
    }));

    const purchaseRows = db.purchases
      .filter((p) => p.status !== 'draft')
      .map((p) => ({
        id: p.id,
        type: 'Purchase' as const,
        date: p.purchase_date,
        createdAt: p.created_at,
        ref: p.purchase_number,
        party: supplierById.get(p.supplier_id) || 'Supplier',
        amount: p.grand_total,
        balance: p.balance_due,
        status:
          p.status === 'reversed'
            ? 'Reversed'
            : p.payment_status === 'paid'
            ? 'Paid'
            : p.payment_status === 'partial'
            ? 'Partial'
            : 'Unpaid',
        target: 'purchases' as NavSection,
      }));

    return [...saleRows, ...purchaseRows]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8);
  }, [db.sales, db.purchases, db.suppliers]);

  const goldRate = getLatestRate('Gold');
  const silverRate = getLatestRate('Silver');

  return (
    <div className="space-y-6">
      {/* Executive Bullion Rate & Primary Action Banner */}
      <div className="flex flex-col justify-between gap-5 rounded-2xl border border-[#EADBB8] bg-[#FBF7EE] px-6 py-5 text-slate-900 lg:flex-row lg:items-center">
        <div>
          <p className="text-xs font-medium text-slate-500">Today's counter rates</p>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-[#8A5E0B]">Gold 999.9</span>
              <strong className="font-mono-num text-2xl font-bold text-slate-900">
                {formatINR(goldRate)}
              </strong>
              <span className="text-xs text-slate-500">/ gm</span>
            </div>
            <span className="hidden text-slate-300 sm:inline" aria-hidden="true">
              |
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-slate-600">Silver 999.9</span>
              <strong className="font-mono-num text-2xl font-bold text-slate-900">
                {formatINR(silverRate)}
              </strong>
              <span className="text-xs text-slate-500">/ gm</span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="text-xs font-semibold text-[#8A5E0B] underline-offset-4 hover:underline"
            >
              Update rates
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('sales')}
            className="inline-flex items-center gap-2 rounded-xl bg-[#B7801A] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#9C6C12] whitespace-nowrap"
          >
            <Receipt className="h-4 w-4" />
            <span>New Sale Bill</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('purchases')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
          >
            <ShoppingBag className="h-4 w-4 text-[#B7801A]" />
            <span>Add Purchase</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('inventory')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
          >
            <Upload className="h-4 w-4 text-[#B7801A]" />
            <span>Import MMTC Stock</span>
          </button>
        </div>
      </div>

      {/* Essential 8 KPI Cards — Full Width, Substantial Typography */}
      <section aria-label="Key business figures">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">Today&apos;s Sales</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <IndianRupee className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 font-mono-num text-2xl font-bold text-slate-900">
              {formatINR(metrics.todaySales)}
            </div>
            <div className="mt-1.5 text-xs text-slate-500">
              {db.sales.filter((s) => s.sale_date === today).length} invoice(s) billed today
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">Today&apos;s Purchases</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                <ShoppingBag className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 font-mono-num text-2xl font-bold text-slate-900">
              {formatINR(metrics.todayPurchases)}
            </div>
            <div className="mt-1.5 text-xs text-slate-500">
              {db.purchases.filter((p) => p.status === 'completed' && p.purchase_date === today).length}{' '}
              confirmed purchase(s)
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">Total Available Stock</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <Boxes className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 font-mono-num text-2xl font-bold text-slate-900">
              {metrics.totalAvailableUnits}{' '}
              <span className="text-sm font-normal text-slate-500">units</span>
            </div>
            <div className="mt-1.5 text-xs text-slate-500">
              {metrics.goldUnits} Gold · {metrics.silverUnits} Silver coins &amp; bars
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">Inventory Purchase Value</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Wallet className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 font-mono-num text-2xl font-bold text-slate-900">
              {formatINR(metrics.inventoryValue)}
            </div>
            <div className="mt-1.5 text-xs text-slate-500">Valued at actual unit purchase cost</div>
          </div>

          <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-amber-900">Gold Stock Weight</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                <Coins className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 font-mono-num text-2xl font-bold text-amber-900">
              {formatWeight(metrics.goldWeight)}
            </div>
            <div className="mt-1.5 text-xs text-amber-800/80">
              {metrics.goldUnits} available Gold 999.9 units
            </div>
          </div>

          <div className="rounded-xl border border-sky-200/80 bg-sky-50/40 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800">Silver Stock Weight</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-800">
                <Scale className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 font-mono-num text-2xl font-bold text-slate-900">
              {formatWeight(metrics.silverWeight)}
            </div>
            <div className="mt-1.5 text-xs text-slate-600">
              {metrics.silverUnits} available Silver 999.9 units
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">Customer Outstanding</span>
              <span
                className={`text-xs font-semibold ${
                  metrics.customerOutstanding > 0 ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {metrics.customerOutstanding > 0 ? 'Pending' : 'All Clear'}
              </span>
            </div>
            <div
              className={`mt-3 font-mono-num text-2xl font-bold ${
                metrics.customerOutstanding > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {formatINR(metrics.customerOutstanding)}
            </div>
            <button
              type="button"
              onClick={() => onNavigate('customers')}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-[#C88A12]"
            >
              <span>View receivables</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">Supplier Outstanding</span>
              <span
                className={`text-xs font-semibold ${
                  metrics.supplierOutstanding > 0 ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {metrics.supplierOutstanding > 0 ? 'Payable' : 'All Clear'}
              </span>
            </div>
            <div
              className={`mt-3 font-mono-num text-2xl font-bold ${
                metrics.supplierOutstanding > 0 ? 'text-rose-700' : 'text-emerald-700'
              }`}
            >
              {formatINR(metrics.supplierOutstanding)}
            </div>
            <button
              type="button"
              onClick={() => onNavigate('suppliers')}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-[#C88A12]"
            >
              <span>View payables</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Recent Transactions — Full Width, Comfortable Readable Scale */}
      <section className="rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Recent Transactions
            </h2>
            <p className="text-xs text-slate-500">Latest confirmed sales invoices and purchases</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="inline-flex items-center gap-1 text-sm font-semibold text-[#B4780C] hover:text-[#8E5D08] whitespace-nowrap"
          >
            <span>Open Reports</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No sales or purchases recorded yet. Start by creating a sale or recording a purchase.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold text-slate-600">
                  <th className="px-6 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5">Reference</th>
                  <th className="px-5 py-3.5">Customer / Supplier</th>
                  <th className="px-5 py-3.5 text-right">Total Amount</th>
                  <th className="px-5 py-3.5 text-right">Balance Due</th>
                  <th className="px-6 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentTransactions.map((tx) => (
                  <tr
                    key={`${tx.type}_${tx.id}`}
                    onClick={() => onNavigate(tx.target)}
                    className="cursor-pointer transition-colors hover:bg-amber-50/35"
                  >
                    <td className="px-6 py-3.5 text-sm text-slate-600 whitespace-nowrap">
                      {formatDateDisplay(tx.date)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`text-xs font-semibold ${
                          tx.type === 'Sale' ? 'text-emerald-700' : 'text-indigo-700'
                        }`}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono-num text-sm font-semibold text-slate-900">
                      {tx.ref}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-800">{tx.party}</td>
                    <td className="px-5 py-3.5 text-right font-mono-num font-semibold text-slate-900">
                      {formatINR(tx.amount)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono-num text-sm text-slate-600">
                      {tx.balance > 0 ? (
                        <span className="font-semibold text-amber-700">
                          {formatINR(tx.balance)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-xs font-semibold">
                      <span
                        className={
                          tx.status === 'Paid'
                            ? 'text-emerald-700'
                            : tx.status === 'Reversed'
                            ? 'text-rose-700'
                            : 'text-amber-700'
                        }
                      >
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
