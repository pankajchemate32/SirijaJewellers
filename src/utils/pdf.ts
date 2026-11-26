import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { InvoiceFormat, Payment, Sale, SaleItem, ShopSettings } from '../types/database';
import { formatDateDisplay } from './format';

function fmtRs(val: number): string {
  return `Rs. ${Number(val || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function generateInvoicePdf(
  sale: Sale,
  items: SaleItem[],
  payments: Payment[],
  shop: ShopSettings,
  format: InvoiceFormat
): void {
  if (format === 'THERMAL') {
    generateThermalInvoicePdf(sale, items, payments, shop);
    return;
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(24, 24, 27);
  doc.text(shop.shop_name, 14, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(82, 82, 91);
  const addrLines = doc.splitTextToSize(shop.address || '', 110);
  doc.text(addrLines, 14, 24);
  const addrBottom = 24 + addrLines.length * 4.5;
  doc.text(`Phone: ${shop.phone || '-'}  |  Email: ${shop.email || '-'}`, 14, addrBottom + 1);
  if (shop.gstin) {
    doc.setFont('helvetica', 'bold');
    doc.text(`GSTIN: ${shop.gstin}`, 14, addrBottom + 6);
  }

  // Right Tax Invoice Box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(154, 107, 28);
  doc.text('TAX INVOICE', pageWidth - 14, 18, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(24, 24, 27);
  doc.text(`Invoice No: ${sale.invoice_number}`, pageWidth - 14, 25, { align: 'right' });
  doc.text(`Date: ${formatDateDisplay(sale.sale_date)}`, pageWidth - 14, 30, { align: 'right' });
  doc.text(
    `Tax Type: ${sale.tax_mode === 'IGST' ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)'}`,
    pageWidth - 14,
    35,
    { align: 'right' }
  );

  const dividerY = Math.max(addrBottom + 10, 42);
  doc.setDrawColor(228, 228, 231);
  doc.line(14, dividerY, pageWidth - 14, dividerY);

  // Customer Block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(113, 113, 122);
  doc.text('BILL TO', 14, dividerY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(24, 24, 27);
  doc.text(sale.customer_name, 14, dividerY + 11.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(82, 82, 91);
  const custMeta = [
    sale.customer_mobile ? `Mobile: ${sale.customer_mobile}` : '',
    sale.customer_gstin ? `GSTIN: ${sale.customer_gstin}` : '',
  ]
    .filter(Boolean)
    .join('   |   ');
  if (custMeta) {
    doc.text(custMeta, 14, dividerY + 16.5);
  }

  // Rate snapshot right side
  doc.setFontSize(8.5);
  doc.setTextColor(113, 113, 122);
  doc.text(
    `Bullion Rate on Invoice Date — Gold 999.9: Rs.${sale.gold_rate_snapshot}/g | Silver 999.9: Rs.${sale.silver_rate_snapshot}/g`,
    pageWidth - 14,
    dividerY + 16.5,
    { align: 'right' }
  );

  // Line Items Table
  autoTable(doc, {
    startY: dividerY + 22,
    head: [
      [
        '#',
        'Product & Cert/Serial No.',
        'HSN',
        'Wt (gm)',
        'Rate/gm',
        'Making',
        'Disc.',
        'Taxable',
        'GST',
        'Total',
      ],
    ],
    body: items.map((item, i) => [
      String(i + 1),
      `${item.product_name}\n${item.metal} ${item.purity} | Cert: ${item.serial_number}`,
      item.hsn_code,
      item.weight_grams.toFixed(item.weight_grams % 1 === 0 ? 1 : 3),
      item.rate_per_gram.toLocaleString('en-IN'),
      item.making_charges.toLocaleString('en-IN'),
      item.discount > 0 ? item.discount.toLocaleString('en-IN') : '-',
      item.taxable_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      `${item.gst_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${item.gst_rate}%)`,
      item.line_total.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
    ]),
    theme: 'grid',
    headStyles: {
      fillColor: [245, 243, 238],
      textColor: [24, 24, 27],
      fontStyle: 'bold',
      fontSize: 8,
      lineColor: [228, 228, 231],
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [39, 39, 42],
      lineColor: [235, 235, 238],
    },
    columnStyles: {
      0: { cellWidth: 7 },
      1: { cellWidth: 52 },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 140;

  // Payment Breakdown Left + Totals Right
  let leftY = finalY + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(24, 24, 27);
  doc.text('Payment Details', 14, leftY);
  leftY += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(82, 82, 91);
  if (payments.length === 0) {
    doc.text('No payment recorded yet (Credit / Unpaid)', 14, leftY);
    leftY += 5;
  } else {
    payments.forEach((p) => {
      doc.text(`${formatDateDisplay(p.payment_date)}  •  ${p.mode}: ${fmtRs(p.amount)}`, 14, leftY);
      leftY += 4.8;
    });
  }

  if (sale.notes) {
    leftY += 3;
    doc.setFont('helvetica', 'italic');
    doc.text(`Notes: ${sale.notes}`, 14, leftY);
  }

  // Right Totals
  let rightY = finalY + 10;
  const labelX = pageWidth - 68;
  const valX = pageWidth - 14;
  const addRow = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 10 : 9);
    doc.setTextColor(bold ? 24 : 82, bold ? 24 : 82, bold ? 27 : 91);
    doc.text(label, labelX, rightY);
    doc.text(value, valX, rightY, { align: 'right' });
    rightY += bold ? 6.5 : 5;
  };

  addRow('Subtotal', fmtRs(sale.subtotal));
  if (sale.discount_total > 0) {
    addRow('Discount', `- ${fmtRs(sale.discount_total)}`);
  }
  addRow('Taxable Value', fmtRs(sale.taxable_amount));
  if (sale.tax_mode === 'IGST') {
    addRow(`IGST (${sale.gst_rate}%)`, fmtRs(sale.igst_amount));
  } else {
    addRow(`CGST (${sale.gst_rate / 2}%)`, fmtRs(sale.cgst_amount));
    addRow(`SGST (${sale.gst_rate / 2}%)`, fmtRs(sale.sgst_amount));
  }
  doc.setDrawColor(212, 212, 216);
  doc.line(labelX, rightY - 2, valX, rightY - 2);
  rightY += 2.5;
  addRow('Grand Total', fmtRs(sale.grand_total), true);
  addRow('Amount Received', fmtRs(sale.amount_received));
  addRow('Balance Due', fmtRs(sale.balance_due), sale.balance_due > 0);

  // Footer Signatory
  const footerY = Math.max(leftY, rightY) + 18;
  doc.setDrawColor(228, 228, 231);
  doc.line(14, footerY, pageWidth - 14, footerY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(113, 113, 122);
  doc.text('Certified pure MMTC bullion sold in original tamper-proof packaging.', 14, footerY + 6);
  doc.text(`For ${shop.shop_name}`, pageWidth - 14, footerY + 6, { align: 'right' });
  doc.text('Authorized Signatory', pageWidth - 14, footerY + 18, { align: 'right' });

  doc.save(`${sale.invoice_number}_A4.pdf`);
}

function generateThermalInvoicePdf(
  sale: Sale,
  items: SaleItem[],
  payments: Payment[],
  shop: ShopSettings
): void {
  const heightMm = Math.max(150, 115 + items.length * 18 + payments.length * 6);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, heightMm] });
  const center = 40;
  let y = 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(shop.shop_name, center, y, { align: 'center' });
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const addr = doc.splitTextToSize(shop.address || '', 70);
  doc.text(addr, center, y, { align: 'center' });
  y += addr.length * 3.5;

  if (shop.phone) {
    doc.text(`Ph: ${shop.phone}`, center, y, { align: 'center' });
    y += 3.5;
  }
  if (shop.gstin) {
    doc.text(`GSTIN: ${shop.gstin}`, center, y, { align: 'center' });
    y += 4;
  }

  doc.setDrawColor(160, 160, 160);
  doc.line(4, y, 76, y);
  y += 4.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('TAX INVOICE', center, y, { align: 'center' });
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Inv: ${sale.invoice_number}`, 5, y);
  doc.text(formatDateDisplay(sale.sale_date), 75, y, { align: 'right' });
  y += 4;
  doc.text(`Cust: ${sale.customer_name}`, 5, y);
  y += 3.5;
  if (sale.customer_mobile) {
    doc.text(`Mob: ${sale.customer_mobile}`, 5, y);
    y += 3.5;
  }

  doc.line(4, y, 76, y);
  y += 4;

  items.forEach((item) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    const titleLines = doc.splitTextToSize(item.product_name, 70);
    doc.text(titleLines, 5, y);
    y += titleLines.length * 3.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Cert: ${item.serial_number}  (${item.weight_grams}g ${item.purity})`, 5, y);
    y += 3.5;
    doc.text(`Rate ${item.rate_per_gram}/g + Mk ${item.making_charges}`, 5, y);
    doc.text(fmtRs(item.line_total), 75, y, { align: 'right' });
    y += 4.5;
  });

  doc.line(4, y, 76, y);
  y += 4;

  const row = (l: string, v: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 8.5 : 7.5);
    doc.text(l, 5, y);
    doc.text(v, 75, y, { align: 'right' });
    y += bold ? 4.8 : 3.8;
  };

  row('Taxable Value', fmtRs(sale.taxable_amount));
  if (sale.tax_mode === 'IGST') {
    row(`IGST (${sale.gst_rate}%)`, fmtRs(sale.igst_amount));
  } else {
    row(`CGST (${sale.gst_rate / 2}%)`, fmtRs(sale.cgst_amount));
    row(`SGST (${sale.gst_rate / 2}%)`, fmtRs(sale.sgst_amount));
  }
  row('GRAND TOTAL', fmtRs(sale.grand_total), true);
  row('Received', fmtRs(sale.amount_received));
  if (sale.balance_due > 0) {
    row('Balance Due', fmtRs(sale.balance_due), true);
  }

  if (payments.length > 0) {
    y += 1.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Paid via: ${payments.map((p) => `${p.mode} (${fmtRs(p.amount)})`).join(', ')}`, 5, y, {
      maxWidth: 70,
    });
    y += 6;
  }

  doc.line(4, y, 76, y);
  y += 4.5;
  doc.setFontSize(7);
  doc.text('Thank you for your business!', center, y, { align: 'center' });

  doc.save(`${sale.invoice_number}_Thermal80mm.pdf`);
}

export function exportReportToPdf(
  title: string,
  subtitle: string,
  columns: string[],
  rows: (string | number)[][],
  summaryLines: string[],
  shopName: string,
  filename: string
): void {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(24, 24, 27);
  doc.text(shopName, 14, 15);

  doc.setFontSize(11);
  doc.setTextColor(154, 107, 28);
  doc.text(title, 14, 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(82, 82, 91);
  doc.text(subtitle, 14, 27.5);

  let y = 32;
  if (summaryLines.length > 0) {
    doc.setFontSize(8.5);
    doc.setTextColor(24, 24, 27);
    summaryLines.forEach((line) => {
      doc.text(line, 14, y);
      y += 4.5;
    });
    y += 2;
  }

  autoTable(doc, {
    startY: y,
    head: [columns],
    body: rows.map((r) => r.map((c) => String(c))),
    theme: 'grid',
    headStyles: {
      fillColor: [245, 243, 238],
      textColor: [24, 24, 27],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [39, 39, 42],
    },
    margin: { left: 14, right: 14 },
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
