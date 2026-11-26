import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Info } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { exportReportToExcel } from '../utils/excel';
import { daysAgoISO, formatDateDisplay, formatINR, formatWeight, round2, todayISO } from '../utils/format';
import { exportReportToPdf } from '../utils/pdf';

type ReportId =
  | 'daily_sales'
  | 'datewise_sales'
  | 'purchases'
  | 'current_inventory'
  | 'product_stock'
  | 'metal_summary'
  | 'customer_outstanding'
  | 'supplier_outstanding'
  | 'sales_returns'
  | 'gross_margin';

type DatePreset = 'today' | 'week' | 'month' | 'all' | 'custom';

const REPORT_LIST: { id: ReportId; label: string; usesDate: boolean }[] = [
  { id: 'daily_sales', label: '1. Daily Sales Report', usesDate: false },
  { id: 'datewise_sales', label: '2. Date-wise Sales Report', usesDate: true },
  { id: 'purchases', label: '3. Purchase Report', usesDate: true },
  { id: 'current_inventory', label: '4. Current Inventory Report', usesDate: false },
  { id: 'product_stock', label: '5. Product-wise Stock Report', usesDate: false },
  { id: 'metal_summary', label: '6. Gold & Silver Stock Summary', usesDate: false },
  { id: 'customer_outstanding', label: '7. Customer Outstanding Report', usesDate: false },
  { id: 'supplier_outstanding', label: '8. Supplier Outstanding Report', usesDate: false },
  { id: 'sales_returns', label: '9. Sales Return Report', usesDate: true },
  { id: 'gross_margin', label: '10. Basic Gross Margin Report', usesDate: true },
];

export const ReportsPage: React.FC = () => {
  const { db } = useStore();
  const [reportId, setReportId] = useState<ReportId>('datewise_sales');
  const [preset, setPreset] = useState<DatePreset>('month');
  const [fromDate, setFromDate] = useState(daysAgoISO(30));
  const [toDate, setToDate] = useState(todayISO());

  const dateRange = useMemo(() => {
    const today = todayISO();
    if (reportId === 'daily_sales' || preset === 'today') {
      return { from: today, to: today, label: `Today (${formatDateDisplay(today)})` };
    }
    if (preset === 'week') {
      const start = daysAgoISO(6);
      return {
        from: start,
        to: today,
        label: `Last 7 Days (${formatDateDisplay(start)} – ${formatDateDisplay(today)})`,
      };
    }
    if (preset === 'month') {
      const d = new Date();
      const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      return {
        from: start,
        to: today,
        label: `This Month (${formatDateDisplay(start)} – ${formatDateDisplay(today)})`,
      };
    }
    if (preset === 'all') {
      return { from: '2000-01-01', to: '2099-12-31', label: 'All Recorded Dates' };
    }
    return {
      from: fromDate,
      to: toDate,
      label: `${formatDateDisplay(fromDate)} – ${formatDateDisplay(toDate)}`,
    };
  }, [reportId, preset, fromDate, toDate]);

  const inRange = (isoDate: string) =>
    isoDate >= dateRange.from && isoDate <= dateRange.to;

  const reportData = useMemo(() => {
    const productById = new Map(db.products.map((p) => [p.id, p]));
    const supplierById = new Map(db.suppliers.map((s) => [s.id, s.name]));

    let columns: string[] = [];
    let rows: (string | number)[][] = [];
    let summaryLines: string[] = [];
    let title = REPORT_LIST.find((r) => r.id === reportId)?.label || 'Report';
    let note = '';

    if (reportId === 'daily_sales' || reportId === 'datewise_sales') {
      const sales = db.sales.filter((s) => inRange(s.sale_date));
      columns = ['Invoice No', 'Date', 'Customer', 'Taxable (INR)', 'GST (INR)', 'Grand Total (INR)', 'Received (INR)', 'Balance (INR)'];
      rows = sales.map((s) => [
        s.invoice_number,
        formatDateDisplay(s.sale_date),
        s.customer_name,
        formatINR(s.taxable_amount),
        formatINR(s.gst_total),
        formatINR(s.grand_total),
        formatINR(s.amount_received),
        formatINR(s.balance_due),
      ]);
      const totalGrand = round2(sales.reduce((sum, s) => sum + s.grand_total, 0));
      const totalGst = round2(sales.reduce((sum, s) => sum + s.gst_total, 0));
      const totalRec = round2(sales.reduce((sum, s) => sum + s.amount_received, 0));
      summaryLines = [
        `Invoices: ${sales.length}  |  Total Sales: ${formatINR(totalGrand)}  |  GST Collected: ${formatINR(totalGst)}  |  Received: ${formatINR(totalRec)}`,
      ];
    } else if (reportId === 'purchases') {
      const purchases = db.purchases.filter(
        (p) => p.status === 'completed' && inRange(p.purchase_date)
      );
      columns = ['Purchase No', 'Date', 'Supplier', 'Supplier Inv', 'Taxable (INR)', 'GST (INR)', 'Grand Total (INR)', 'Balance Due (INR)'];
      rows = purchases.map((p) => [
        p.purchase_number,
        formatDateDisplay(p.purchase_date),
        supplierById.get(p.supplier_id) || 'Supplier',
        p.supplier_invoice_number,
        formatINR(p.taxable_amount),
        formatINR(p.gst_total),
        formatINR(p.grand_total),
        formatINR(p.balance_due),
      ]);
      const total = round2(purchases.reduce((sum, p) => sum + p.grand_total, 0));
      const bal = round2(purchases.reduce((sum, p) => sum + p.balance_due, 0));
      summaryLines = [
        `Confirmed Purchases: ${purchases.length}  |  Total Value: ${formatINR(total)}  |  Balance Payable: ${formatINR(bal)}`,
      ];
    } else if (reportId === 'current_inventory') {
      const avail = db.stock_items.filter((s) => s.status === 'Available');
      columns = ['Stock ID', 'SKU', 'Product', 'Metal / Purity', 'Weight (gm)', 'Cert / Serial No', 'Purchase Date', 'Purchase Cost (INR)'];
      rows = avail.map((s) => {
        const p = productById.get(s.product_id);
        return [
          s.id,
          p?.sku_code || '',
          p?.name || '',
          p ? `${p.metal} ${p.purity}` : '',
          p?.weight_grams || 0,
          s.serial_number,
          formatDateDisplay(s.purchase_date),
          formatINR(s.purchase_price),
        ];
      });
      const val = round2(avail.reduce((sum, s) => sum + s.purchase_price, 0));
      summaryLines = [`Available Physical Units: ${avail.length}  |  Total Cost Value: ${formatINR(val)}`];
    } else if (reportId === 'product_stock') {
      const avail = db.stock_items.filter((s) => s.status === 'Available');
      const map = new Map<string, { qty: number; wt: number; val: number }>();
      avail.forEach((s) => {
        const p = productById.get(s.product_id);
        if (!p) return;
        const cur = map.get(p.id) || { qty: 0, wt: 0, val: 0 };
        cur.qty += 1;
        cur.wt += p.weight_grams;
        cur.val += s.purchase_price;
        map.set(p.id, cur);
      });
      columns = ['SKU Code', 'Product Name', 'Metal', 'Purity', 'Unit Wt (gm)', 'Available Qty', 'Total Weight', 'Purchase Value (INR)'];
      rows = db.products.map((p) => {
        const d = map.get(p.id) || { qty: 0, wt: 0, val: 0 };
        return [
          p.sku_code,
          p.name,
          p.metal,
          p.purity,
          p.weight_grams,
          d.qty,
          formatWeight(d.wt),
          formatINR(d.val),
        ];
      });
      summaryLines = [`Products Tracked: ${db.products.length}  |  Total Units Available: ${avail.length}`];
    } else if (reportId === 'metal_summary') {
      const avail = db.stock_items.filter((s) => s.status === 'Available');
      const calcMetal = (metal: 'Gold' | 'Silver') => {
        const items = avail.filter((s) => productById.get(s.product_id)?.metal === metal);
        const wt = items.reduce((sum, s) => sum + (productById.get(s.product_id)?.weight_grams || 0), 0);
        const val = items.reduce((sum, s) => sum + s.purchase_price, 0);
        const coins = items.filter((s) => productById.get(s.product_id)?.type === 'Coin').length;
        const bars = items.filter((s) => productById.get(s.product_id)?.type === 'Bar').length;
        return [metal, items.length, coins, bars, formatWeight(wt), formatINR(val)];
      };
      columns = ['Metal', 'Available Units', 'Coins', 'Bars', 'Total Fine Weight', 'Inventory Cost Value (INR)'];
      rows = [calcMetal('Gold'), calcMetal('Silver')];
      const totalVal = round2(avail.reduce((sum, s) => sum + s.purchase_price, 0));
      summaryLines = [`Combined Available Inventory Purchase Value: ${formatINR(totalVal)}`];
    } else if (reportId === 'customer_outstanding') {
      const pendingSales = db.sales.filter((s) => s.balance_due > 0.01);
      columns = ['Invoice No', 'Sale Date', 'Customer Name', 'Mobile', 'Grand Total (INR)', 'Received (INR)', 'Balance Due (INR)'];
      rows = pendingSales.map((s) => [
        s.invoice_number,
        formatDateDisplay(s.sale_date),
        s.customer_name,
        s.customer_mobile || '-',
        formatINR(s.grand_total),
        formatINR(s.amount_received),
        formatINR(s.balance_due),
      ]);
      const dueTotal = round2(pendingSales.reduce((sum, s) => sum + s.balance_due, 0));
      summaryLines = [`Pending Customer Invoices: ${pendingSales.length}  |  Total Receivable: ${formatINR(dueTotal)}`];
    } else if (reportId === 'supplier_outstanding') {
      const pendingPurchases = db.purchases.filter(
        (p) => p.status === 'completed' && p.balance_due > 0.01
      );
      columns = ['Purchase No', 'Date', 'Supplier', 'Supplier Inv', 'Grand Total (INR)', 'Paid (INR)', 'Balance Payable (INR)'];
      rows = pendingPurchases.map((p) => [
        p.purchase_number,
        formatDateDisplay(p.purchase_date),
        supplierById.get(p.supplier_id) || 'Supplier',
        p.supplier_invoice_number,
        formatINR(p.grand_total),
        formatINR(p.amount_paid),
        formatINR(p.balance_due),
      ]);
      const dueTotal = round2(pendingPurchases.reduce((sum, p) => sum + p.balance_due, 0));
      summaryLines = [`Pending Supplier Bills: ${pendingPurchases.length}  |  Total Payable: ${formatINR(dueTotal)}`];
    } else if (reportId === 'sales_returns') {
      const rets = db.returns.filter((r) => inRange(r.return_date));
      columns = ['Return No', 'Date', 'Orig Invoice', 'Customer', 'Product', 'Serial No', 'Resolution', 'Stock Action', 'Refund / Credit (INR)'];
      rows = rets.map((r) => [
        r.return_number,
        formatDateDisplay(r.return_date),
        r.invoice_number,
        r.customer_name,
        r.product_name,
        r.serial_number,
        r.resolution === 'exchange' ? 'Exchange' : 'Refund',
        r.restock_to_available ? 'Restocked' : 'Damaged',
        formatINR(r.refund_amount),
      ]);
      const totalRef = round2(rets.reduce((sum, r) => sum + r.refund_amount, 0));
      summaryLines = [`Confirmed Returns: ${rets.length}  |  Total Refund/Credit: ${formatINR(totalRef)}`];
    } else if (reportId === 'gross_margin') {
      const saleById = new Map(db.sales.map((s) => [s.id, s]));
      const activeSoldItems = db.sale_items.filter((si) => {
        if (si.returned) return false;
        const sale = saleById.get(si.sale_id);
        return sale ? inRange(sale.sale_date) : false;
      });

      let totalTaxableSale = 0;
      let totalPurchaseCost = 0;

      columns = ['Invoice', 'Date', 'Product', 'Serial No', 'Taxable Sale (INR)', 'Actual Purchase Cost (INR)', 'Gross Margin (INR)', 'Margin %'];
      rows = activeSoldItems.map((si) => {
        const sale = saleById.get(si.sale_id)!;
        const margin = round2(si.taxable_amount - si.purchase_cost_snapshot);
        const pct = si.taxable_amount > 0 ? round2((margin / si.taxable_amount) * 100) : 0;
        totalTaxableSale = round2(totalTaxableSale + si.taxable_amount);
        totalPurchaseCost = round2(totalPurchaseCost + si.purchase_cost_snapshot);
        return [
          sale.invoice_number,
          formatDateDisplay(sale.sale_date),
          si.product_name,
          si.serial_number,
          formatINR(si.taxable_amount),
          formatINR(si.purchase_cost_snapshot),
          formatINR(margin),
          `${pct.toFixed(2)}%`,
        ];
      });
      const totalMargin = round2(totalTaxableSale - totalPurchaseCost);
      const overallPct =
        totalTaxableSale > 0 ? round2((totalMargin / totalTaxableSale) * 100) : 0;
      summaryLines = [
        `Items Sold (Net of Returns): ${activeSoldItems.length}  |  Taxable Sales: ${formatINR(totalTaxableSale)}  |  Actual Cost of Goods: ${formatINR(totalPurchaseCost)}  |  Gross Margin: ${formatINR(totalMargin)} (${overallPct.toFixed(2)}%)`,
      ];
      note =
        'Gross Margin is computed strictly as Taxable Sale Value minus the Actual Historical Purchase Cost of each specific serial unit sold (excluding GST and returned items). This represents Gross Margin — NOT Net Business Profit, as shop rent, staff salaries, insurance, and other operating expenses are not deducted.';
    }

    return { title, columns, rows, summaryLines, note };
  }, [db, reportId, dateRange]);

  const currentReportDef = REPORT_LIST.find((r) => r.id === reportId)!;

  const handleExportExcel = () => {
    const objects = reportData.rows.map((r) => {
      const obj: Record<string, string | number> = {};
      reportData.columns.forEach((col, i) => {
        obj[col] = r[i] ?? '';
      });
      return obj;
    });
    exportReportToExcel(
      `SirijaJwellers_${reportId}_${todayISO()}.xlsx`,
      reportData.title.replace(/^\d+\.\s*/, ''),
      objects
    );
  };

  const handleExportPdf = () => {
    exportReportToPdf(
      reportData.title,
      currentReportDef.usesDate ? `Period: ${dateRange.label}` : `As of ${formatDateDisplay(todayISO())}`,
      reportData.columns,
      reportData.rows,
      reportData.summaryLines,
      db.shop_settings.shop_name,
      `SirijaJwellers_${reportId}_${todayISO()}.pdf`
    );
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left Report Menu */}
      <aside className="lg:col-span-3">
        <div className="rounded-xl border border-[#E7E5E0] bg-white p-3">
          <div className="px-2.5 py-2 text-xs font-semibold text-zinc-500">Select Report</div>
          <div className="space-y-1">
            {REPORT_LIST.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setReportId(r.id)}
                className={`w-full rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors sm:text-sm ${
                  reportId === r.id
                    ? 'bg-[#FBF7EE] text-[#825814]'
                    : 'text-zinc-700 hover:bg-[#FAF9F6] hover:text-zinc-900'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Right Report Output */}
      <section className="space-y-4 lg:col-span-9">
        <div className="rounded-xl border border-[#E7E5E0] bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-zinc-900">
                {reportData.title}
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                {currentReportDef.usesDate
                  ? `Period: ${dateRange.label}`
                  : reportId === 'daily_sales'
                  ? `Date: ${formatDateDisplay(todayISO())}`
                  : `Snapshot as of ${formatDateDisplay(todayISO())}`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={reportData.rows.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E0] bg-white px-3.5 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-40 whitespace-nowrap"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
                <span>Export Excel</span>
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={reportData.rows.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#9A6B1C] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#825814] disabled:opacity-40 whitespace-nowrap"
              >
                <Download className="h-4 w-4" />
                <span>Export PDF</span>
              </button>
            </div>
          </div>

          {currentReportDef.usesDate && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#E7E5E0] pt-4">
              <div className="inline-flex flex-wrap rounded-lg bg-[#F5F3EE] p-1 text-xs">
                {(
                  [
                    { id: 'today', label: 'Today' },
                    { id: 'week', label: 'This Week' },
                    { id: 'month', label: 'This Month' },
                    { id: 'all', label: 'All Time' },
                    { id: 'custom', label: 'Custom Range' },
                  ] as { id: DatePreset; label: string }[]
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPreset(p.id)}
                    className={`rounded-md px-3 py-1.5 font-medium transition-colors whitespace-nowrap ${
                      preset === p.id
                        ? 'bg-white text-zinc-900 shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {preset === 'custom' && (
                <div className="flex items-center gap-2 text-xs">
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="rounded-lg border border-[#E7E5E0] px-2.5 py-1.5 font-mono-num"
                  />
                  <span className="text-zinc-400">to</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="rounded-lg border border-[#E7E5E0] px-2.5 py-1.5 font-mono-num"
                  />
                </div>
              )}
            </div>
          )}

          {reportData.summaryLines.length > 0 && (
            <div className="mt-4 rounded-lg bg-[#FAF9F6] px-4 py-3 font-mono-num text-xs font-medium text-zinc-800">
              {reportData.summaryLines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}

          {reportData.note && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#E7DFC8] bg-[#FBF7EE] px-4 py-3 text-xs leading-relaxed text-[#724E12]">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{reportData.note}</span>
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[660px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#E7E5E0] bg-[#FAF9F6] text-zinc-500">
                  {reportData.columns.map((c) => (
                    <th key={c} className="px-3.5 py-2.5 font-medium whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EFEA]">
                {reportData.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={reportData.columns.length}
                      className="px-4 py-10 text-center text-sm text-zinc-500"
                    >
                      No records found for this report and date filter.
                    </td>
                  </tr>
                ) : (
                  reportData.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-[#FAF9F6]">
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className={`px-3.5 py-2.5 text-zinc-800 ${
                            String(cell).length <= 40 ? 'whitespace-nowrap' : 'min-w-[220px]'
                          } ${
                            String(cell).includes('₹') || typeof cell === 'number'
                              ? 'font-mono-num'
                              : ''
                          }`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};
