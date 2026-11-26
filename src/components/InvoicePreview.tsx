import React, { useState } from 'react';
import { Check, Copy, Download, MessageCircle, Printer } from 'lucide-react';
import { InvoiceFormat, Payment, Sale, SaleItem, ShopSettings } from '../types/database';
import {
  buildWhatsAppInvoiceText,
  buildWhatsAppUrl,
  formatDateDisplay,
  formatINR,
} from '../utils/format';
import { generateInvoicePdf } from '../utils/pdf';

interface InvoicePreviewProps {
  sale: Sale;
  items: SaleItem[];
  payments: Payment[];
  shop: ShopSettings;
  defaultFormat?: InvoiceFormat;
}

export const InvoicePreview: React.FC<InvoicePreviewProps> = ({
  sale,
  items,
  payments,
  shop,
  defaultFormat,
}) => {
  const [format, setFormat] = useState<InvoiceFormat>(defaultFormat || shop.invoice_format || 'A4');
  const [copied, setCopied] = useState(false);

  const handleCopyWhatsApp = async () => {
    try {
      await navigator.clipboard.writeText(buildWhatsAppInvoiceText(sale, items, shop));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored if clipboard is restricted
    }
  };

  const whatsappUrl = buildWhatsAppUrl(sale, items, shop);

  return (
    <div className="space-y-4">
      {/* Action Toolbar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E7E5E0] bg-white p-4">
        <div className="flex items-center gap-1 rounded-lg bg-[#F5F3EE] p-1">
          <button
            type="button"
            onClick={() => setFormat('A4')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              format === 'A4'
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            A4 Tax Invoice
          </button>
          <button
            type="button"
            onClick={() => setFormat('THERMAL')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              format === 'THERMAL'
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Thermal 80mm
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => generateInvoicePdf(sale, items, payments, shop, format)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#9A6B1C] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#825814] whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            <span>Download {format === 'A4' ? 'A4 PDF' : 'Thermal PDF'}</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E0] bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 whitespace-nowrap"
          >
            <Printer className="h-4 w-4" />
            <span>Print</span>
          </button>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100 whitespace-nowrap"
          >
            <MessageCircle className="h-4 w-4" />
            <span>WhatsApp</span>
          </a>
          <button
            type="button"
            onClick={handleCopyWhatsApp}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E0] bg-white px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 whitespace-nowrap"
            title="Copy WhatsApp invoice summary"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-700" /> : <Copy className="h-4 w-4" />}
            <span>{copied ? 'Copied' : 'Copy Text'}</span>
          </button>
        </div>
      </div>

      {/* Rendered Invoice Document */}
      {format === 'A4' ? (
        <div className="rounded-xl border border-[#E7E5E0] bg-white p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-4 border-b border-[#E7E5E0] pb-5 sm:flex-row">
            <div>
              <h2 className="font-display text-xl font-bold text-zinc-900">{shop.shop_name}</h2>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-zinc-600">{shop.address}</p>
              <p className="mt-1 text-xs text-zinc-600">
                {shop.phone}
                {shop.email ? ` · ${shop.email}` : ''}
              </p>
              {shop.gstin && (
                <p className="mt-1 font-mono-num text-xs font-medium text-zinc-800">
                  GSTIN: {shop.gstin}
                </p>
              )}
            </div>
            <div className="sm:text-right">
              <div className="font-display text-base font-bold tracking-wide text-[#9A6B1C]">
                TAX INVOICE
              </div>
              <div className="mt-1 font-mono-num text-sm font-semibold text-zinc-900">
                {sale.invoice_number}
              </div>
              <div className="mt-0.5 text-xs text-zinc-600">
                Date: {formatDateDisplay(sale.sale_date)}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">
                {sale.tax_mode === 'IGST' ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)'}
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 border-b border-[#E7E5E0] py-4 sm:flex-row sm:items-end">
            <div>
              <div className="text-xs font-medium text-zinc-500">Billed To</div>
              <div className="mt-0.5 text-sm font-semibold text-zinc-900">{sale.customer_name}</div>
              <div className="text-xs text-zinc-600">
                {sale.customer_mobile || 'Walk-in customer'}
                {sale.customer_gstin ? ` · GSTIN: ${sale.customer_gstin}` : ''}
              </div>
            </div>
            <div className="text-xs text-zinc-500 sm:text-right">
              Rate Captured — Gold 999.9:{' '}
              <span className="font-mono-num text-zinc-800">₹{sale.gold_rate_snapshot}/g</span> · Silver
              999.9:{' '}
              <span className="font-mono-num text-zinc-800">₹{sale.silver_rate_snapshot}/g</span>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#E7E5E0] bg-[#FAF9F6] text-zinc-600">
                  <th className="px-3 py-2.5 font-medium">#</th>
                  <th className="px-3 py-2.5 font-medium">Product &amp; Cert/Serial</th>
                  <th className="px-3 py-2.5 font-medium">HSN</th>
                  <th className="px-3 py-2.5 text-right font-medium">Weight</th>
                  <th className="px-3 py-2.5 text-right font-medium">Rate/gm</th>
                  <th className="px-3 py-2.5 text-right font-medium">Making</th>
                  <th className="px-3 py-2.5 text-right font-medium">Disc.</th>
                  <th className="px-3 py-2.5 text-right font-medium">Taxable</th>
                  <th className="px-3 py-2.5 text-right font-medium">GST</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0EFEA]">
                {items.map((item, idx) => (
                  <tr key={item.id} className={item.returned ? 'bg-red-50/40 line-through opacity-75' : ''}>
                    <td className="px-3 py-2.5 font-mono-num text-zinc-500">{idx + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-zinc-900">{item.product_name}</div>
                      <div className="mt-0.5 text-[11px] text-zinc-500">
                        {item.metal} {item.purity} · Cert:{' '}
                        <span className="font-mono-num text-zinc-700">{item.serial_number}</span>
                        {item.returned && ' · Returned'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono-num text-zinc-600">{item.hsn_code}</td>
                    <td className="px-3 py-2.5 text-right font-mono-num text-zinc-800">
                      {item.weight_grams}g
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono-num text-zinc-800">
                      {formatINR(item.rate_per_gram)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono-num text-zinc-800">
                      {formatINR(item.making_charges)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono-num text-zinc-600">
                      {item.discount > 0 ? formatINR(item.discount) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono-num text-zinc-800">
                      {formatINR(item.taxable_amount)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono-num text-zinc-600">
                      {formatINR(item.gst_amount)} ({item.gst_rate}%)
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono-num font-semibold text-zinc-900">
                      {formatINR(item.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 border-t border-[#E7E5E0] pt-5 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-zinc-700">Payment Summary</div>
              {payments.length === 0 ? (
                <p className="mt-1.5 text-xs text-zinc-500">No payment received yet.</p>
              ) : (
                <ul className="mt-1.5 space-y-1 text-xs text-zinc-600">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between max-w-xs">
                      <span>
                        {p.mode} · {formatDateDisplay(p.payment_date)}
                      </span>
                      <span className="font-mono-num font-medium text-zinc-900">
                        {formatINR(p.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {sale.notes && <p className="mt-3 text-xs text-zinc-500">Note: {sale.notes}</p>}
            </div>

            <div className="space-y-1.5 text-sm sm:ml-auto sm:w-72">
              <div className="flex justify-between text-zinc-600">
                <span>Subtotal</span>
                <span className="font-mono-num">{formatINR(sale.subtotal)}</span>
              </div>
              {sale.discount_total > 0 && (
                <div className="flex justify-between text-zinc-600">
                  <span>Discount</span>
                  <span className="font-mono-num">- {formatINR(sale.discount_total)}</span>
                </div>
              )}
              <div className="flex justify-between text-zinc-600">
                <span>Taxable Value</span>
                <span className="font-mono-num">{formatINR(sale.taxable_amount)}</span>
              </div>
              {sale.tax_mode === 'IGST' ? (
                <div className="flex justify-between text-zinc-600">
                  <span>IGST ({sale.gst_rate}%)</span>
                  <span className="font-mono-num">{formatINR(sale.igst_amount)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-zinc-600">
                    <span>CGST ({sale.gst_rate / 2}%)</span>
                    <span className="font-mono-num">{formatINR(sale.cgst_amount)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-600">
                    <span>SGST ({sale.gst_rate / 2}%)</span>
                    <span className="font-mono-num">{formatINR(sale.sgst_amount)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t border-[#E7E5E0] pt-2 text-base font-bold text-zinc-900">
                <span>Grand Total</span>
                <span className="font-mono-num">{formatINR(sale.grand_total)}</span>
              </div>
              <div className="flex justify-between text-xs text-emerald-700">
                <span>Amount Received</span>
                <span className="font-mono-num font-medium">{formatINR(sale.amount_received)}</span>
              </div>
              {sale.balance_due > 0 && (
                <div className="flex justify-between text-xs font-semibold text-amber-700">
                  <span>Balance Due</span>
                  <span className="font-mono-num">{formatINR(sale.balance_due)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Compact Thermal 80mm Receipt Preview */
        <div className="mx-auto w-full max-w-[320px] rounded-xl border border-[#E7E5E0] bg-white p-5 font-mono-num text-xs text-zinc-900">
          <div className="text-center">
            <div className="text-sm font-bold">{shop.shop_name}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-zinc-600">{shop.address}</div>
            {shop.phone && <div className="text-[11px] text-zinc-600">Ph: {shop.phone}</div>}
            {shop.gstin && <div className="text-[11px] font-medium">GSTIN: {shop.gstin}</div>}
          </div>

          <div className="my-3 border-t border-dashed border-zinc-300" />
          <div className="text-center font-bold">TAX INVOICE</div>
          <div className="mt-1 flex justify-between text-[11px]">
            <span>{sale.invoice_number}</span>
            <span>{formatDateDisplay(sale.sale_date)}</span>
          </div>
          <div className="mt-0.5 text-[11px]">Cust: {sale.customer_name}</div>
          {sale.customer_mobile && <div className="text-[11px]">Mob: {sale.customer_mobile}</div>}

          <div className="my-3 border-t border-dashed border-zinc-300" />
          <div className="space-y-2.5">
            {items.map((item) => (
              <div key={item.id}>
                <div className="font-semibold">{item.product_name}</div>
                <div className="text-[11px] text-zinc-600">
                  Cert: {item.serial_number} ({item.weight_grams}g {item.purity})
                </div>
                <div className="flex justify-between text-[11px]">
                  <span>
                    {item.rate_per_gram}/g + Mk {item.making_charges}
                  </span>
                  <span className="font-semibold">{formatINR(item.line_total)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="my-3 border-t border-dashed border-zinc-300" />
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span>Taxable</span>
              <span>{formatINR(sale.taxable_amount)}</span>
            </div>
            {sale.tax_mode === 'IGST' ? (
              <div className="flex justify-between">
                <span>IGST ({sale.gst_rate}%)</span>
                <span>{formatINR(sale.igst_amount)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <span>CGST ({sale.gst_rate / 2}%)</span>
                  <span>{formatINR(sale.cgst_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST ({sale.gst_rate / 2}%)</span>
                  <span>{formatINR(sale.sgst_amount)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between border-t border-dashed border-zinc-300 pt-1.5 text-xs font-bold">
              <span>GRAND TOTAL</span>
              <span>{formatINR(sale.grand_total)}</span>
            </div>
            <div className="flex justify-between">
              <span>Received</span>
              <span>{formatINR(sale.amount_received)}</span>
            </div>
            {sale.balance_due > 0 && (
              <div className="flex justify-between font-semibold text-amber-700">
                <span>Balance Due</span>
                <span>{formatINR(sale.balance_due)}</span>
              </div>
            )}
          </div>
          <div className="my-3 border-t border-dashed border-zinc-300" />
          <div className="text-center text-[11px] text-zinc-500">Thank you for your visit</div>
        </div>
      )}
    </div>
  );
};
