import { Sale, SaleItem, ShopSettings, TaxMode } from '../types/database';

export function round2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function round3(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

export function formatINR(amount: number): string {
  const num = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatINRCompact(amount: number): string {
  const num = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatWeight(grams: number): string {
  const num = Number.isFinite(grams) ? grams : 0;
  return `${num.toFixed(num % 1 === 0 ? 1 : 3)} gm`;
}

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysAgoISO(days: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() - days);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateDisplay(isoDate: string): string {
  if (!isoDate) return '-';
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length !== 3) return isoDate;
  const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return dt.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTimeDisplay(iso: string): string {
  if (!iso) return '-';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36).slice(-5);
  return `${prefix}_${ts}${rand}`;
}

export function calculateTaxBreakdown(
  taxableAmount: number,
  gstRate: number,
  taxMode: TaxMode
): {
  cgst: number;
  sgst: number;
  igst: number;
  gstTotal: number;
  grandTotal: number;
} {
  const safeTaxable = Math.max(0, round2(taxableAmount));
  const gstTotal = round2((safeTaxable * gstRate) / 100);
  if (taxMode === 'IGST') {
    return {
      cgst: 0,
      sgst: 0,
      igst: gstTotal,
      gstTotal,
      grandTotal: round2(safeTaxable + gstTotal),
    };
  }
  const half = round2(gstTotal / 2);
  const secondHalf = round2(gstTotal - half);
  return {
    cgst: half,
    sgst: secondHalf,
    igst: 0,
    gstTotal,
    grandTotal: round2(safeTaxable + gstTotal),
  };
}

export function buildWhatsAppInvoiceText(
  sale: Sale,
  items: SaleItem[],
  shop: ShopSettings
): string {
  const lines: string[] = [
    `*${shop.shop_name}*`,
    shop.gstin ? `GSTIN: ${shop.gstin}` : '',
    `Tax Invoice: *${sale.invoice_number}*`,
    `Date: ${formatDateDisplay(sale.sale_date)}`,
    `Customer: ${sale.customer_name}${sale.customer_mobile ? ` (${sale.customer_mobile})` : ''}`,
    ``,
    `*Items Purchased:*`,
    ...items.map(
      (item, idx) =>
        `${idx + 1}. ${item.product_name} (${item.weight_grams}g ${item.metal} ${item.purity}) — Cert: ${item.serial_number} — ${formatINR(item.line_total)}`
    ),
    ``,
    `Taxable Value: ${formatINR(sale.taxable_amount)}`,
    sale.tax_mode === 'IGST'
      ? `IGST (${sale.gst_rate}%): ${formatINR(sale.igst_amount)}`
      : `CGST (${sale.gst_rate / 2}%): ${formatINR(sale.cgst_amount)} | SGST (${sale.gst_rate / 2}%): ${formatINR(sale.sgst_amount)}`,
    `*Grand Total: ${formatINR(sale.grand_total)}*`,
    `Amount Paid: ${formatINR(sale.amount_received)}`,
    sale.balance_due > 0 ? `Balance Due: ${formatINR(sale.balance_due)}` : `Status: Paid in Full`,
    ``,
    `Thank you for choosing ${shop.shop_name}.`,
  ].filter(Boolean);

  return lines.join('\n');
}

export function buildWhatsAppUrl(
  sale: Sale,
  items: SaleItem[],
  shop: ShopSettings
): string {
  const text = encodeURIComponent(buildWhatsAppInvoiceText(sale, items, shop));
  const digits = (sale.customer_mobile || '').replace(/\D/g, '');
  const phone = digits.length === 10 ? `91${digits}` : digits;
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}
