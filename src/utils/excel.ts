import * as XLSX from 'xlsx';
import { MetalType, Product, StockItem } from '../types/database';
import { MmtcImportRowInput } from '../context/StoreContext';

export interface ParsedMmtcRow extends MmtcImportRowInput {
  rowNumber: number;
  sheetName: string;
  status: 'ready' | 'new_sku' | 'duplicate' | 'error';
  message: string;
}

export interface ParsedWorkbookPreview {
  fileName: string;
  sheetsRead: string[];
  sheetsSkipped: string[];
  rows: ParsedMmtcRow[];
}

function normalizeHeader(h: string): string {
  return String(h || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function pickField(record: Record<string, unknown>, candidates: string[]): string {
  const entries = Object.entries(record);
  for (const cand of candidates) {
    const found = entries.find(([k]) => normalizeHeader(k) === cand);
    if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim() !== '') {
      return String(found[1]).trim();
    }
  }
  for (const cand of candidates) {
    const found = entries.find(([k]) => normalizeHeader(k).includes(cand));
    if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim() !== '') {
      return String(found[1]).trim();
    }
  }
  return '';
}

// Whole-word matching only: a gold coin named e.g. "Bhagya Laxmi" must not be read as silver ("ag").
function parseMetal(raw: string, productName: string): MetalType {
  const r = String(raw || '').toLowerCase().trim();
  if (/\bsilver\b/.test(r) || r === 'ag') return 'Silver';
  if (/\bgold\b/.test(r) || r === 'au') return 'Gold';
  if (/\bsilver\b/.test(String(productName || '').toLowerCase())) return 'Silver';
  return 'Gold';
}

function parseType(raw: string, productName: string): 'Coin' | 'Bar' {
  const r = String(raw || '').toLowerCase().trim();
  if (/\b(bar|ingot)\b/.test(r)) return 'Bar';
  if (/\bcoin\b/.test(r)) return 'Coin';
  if (/\b(bar|ingot)\b/.test(String(productName || '').toLowerCase())) return 'Bar';
  return 'Coin';
}

function parseNumeric(raw: string): number {
  const cleaned = String(raw || '').replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

export async function parseMmtcExcelFile(
  file: File,
  existingProducts: Product[],
  existingStock: StockItem[]
): Promise<ParsedWorkbookPreview> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sheetsRead: string[] = [];
  const sheetsSkipped: string[] = [];
  const rows: ParsedMmtcRow[] = [];

  const existingSkuSet = new Set(existingProducts.map((p) => p.sku_code.toUpperCase()));
  const existingSerialSet = new Set(existingStock.map((s) => s.serial_number.trim().toUpperCase()));
  const seenInFile = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    // Business rule: Summary sheet contains aggregated stock figures and MUST NOT be imported as physical inventory
    if (sheetName.trim().toLowerCase().includes('summary')) {
      sheetsSkipped.push(sheetName);
      continue;
    }

    const sheet = workbook.Sheets[sheetName];
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (jsonRows.length === 0) continue;

    sheetsRead.push(sheetName);

    jsonRows.forEach((rawRow, index) => {
      const sku = pickField(rawRow, ['skucode', 'sku', 'itemcode', 'productcode']).toUpperCase();
      const productName = pickField(rawRow, ['productname', 'description', 'itemname', 'name']);
      const metalRaw = pickField(rawRow, ['metal', 'metaltype']);
      const purity = pickField(rawRow, ['purity', 'fineness', 'karat']) || '999.9';
      const weightRaw = pickField(rawRow, ['weightgm', 'weight', 'wtgm', 'grossweight', 'netweight']);
      const serial = pickField(rawRow, [
        'certificateserialno',
        'serialno',
        'serialnumber',
        'certificateno',
        'certno',
        'assayno',
        'certificate',
      ]);
      const typeRaw = pickField(rawRow, ['type', 'category', 'form']);
      const hsn = pickField(rawRow, ['hsncode', 'hsn', 'sac']);
      const barcode = pickField(rawRow, ['barcode', 'ean', 'upc']);
      const priceRaw = pickField(rawRow, ['purchasepriceinr', 'purchaseprice', 'cost', 'unitcost', 'price']);

      // Ignore completely blank trailing rows
      if (!sku && !productName && !serial) return;

      const metal = parseMetal(metalRaw, productName);
      const productType = parseType(typeRaw, productName);
      const weightGrams = parseNumeric(weightRaw);
      const purchasePrice = parseNumeric(priceRaw);
      const hsnCode = hsn || (metal === 'Gold' ? '71141910' : '71141110');

      let status: ParsedMmtcRow['status'] = 'ready';
      let message = 'Ready to import';

      if (!sku || !productName || !serial || !(weightGrams > 0)) {
        status = 'error';
        const missing: string[] = [];
        if (!sku) missing.push('SKU Code');
        if (!productName) missing.push('Product Name');
        if (!(weightGrams > 0)) missing.push('Weight (gm)');
        if (!serial) missing.push('Certificate / Serial No.');
        message = `Missing ${missing.join(', ')}`;
      } else {
        const serialKey = serial.toUpperCase();
        if (existingSerialSet.has(serialKey)) {
          status = 'duplicate';
          message = 'Already exists in inventory (will skip)';
        } else if (seenInFile.has(serialKey)) {
          status = 'duplicate';
          message = 'Duplicate serial inside uploaded file (will skip)';
        } else {
          seenInFile.add(serialKey);
          if (!existingSkuSet.has(sku)) {
            status = 'new_sku';
            message = 'New SKU — will create product & import unit';
          }
        }
      }

      rows.push({
        rowNumber: index + 2,
        sheetName,
        sku_code: sku,
        product_name: productName,
        metal,
        purity,
        weight_grams: weightGrams,
        serial_number: serial,
        type: productType,
        hsn_code: hsnCode,
        barcode,
        purchase_price: purchasePrice,
        status,
        message,
      });
    });
  }

  return {
    fileName: file.name,
    sheetsRead,
    sheetsSkipped,
    rows,
  };
}

export function downloadMmtcTemplate(): void {
  const wb = XLSX.utils.book_new();

  const stockRows = [
    {
      'SKU Code': 'MMTC-AU-5G-LAX',
      'Product Name': '5 gm Gold 999.9 Minted Coin Laxmi',
      Metal: 'Gold',
      Purity: '999.9',
      'Weight (gm)': 5,
      'Certificate / Serial No.': 'MP-AU5-260191',
      Type: 'Coin',
      'HSN Code': '71141910',
      Barcode: '8904155901912',
      'Purchase Price (INR)': 38100,
    },
    {
      'SKU Code': 'MMTC-AU-10G-LOT',
      'Product Name': '10 gm Gold 999.9 Minted Bar Lotus',
      Metal: 'Gold',
      Purity: '999.9',
      'Weight (gm)': 10,
      'Certificate / Serial No.': 'MP-AU10-260491',
      Type: 'Bar',
      'HSN Code': '71081200',
      Barcode: '8904155904913',
      'Purchase Price (INR)': 76200,
    },
    {
      'SKU Code': 'MMTC-AU-2G-OVL',
      'Product Name': '2 gm Gold 999.9 Oval Coin',
      Metal: 'Gold',
      Purity: '999.9',
      'Weight (gm)': 2,
      'Certificate / Serial No.': 'MP-AU2-260291',
      Type: 'Coin',
      'HSN Code': '71141910',
      Barcode: '8904155902919',
      'Purchase Price (INR)': 15350,
    },
    {
      'SKU Code': 'MMTC-AG-100G-LOT',
      'Product Name': '100 gm Silver 999.9 Minted Bar Lotus',
      Metal: 'Silver',
      Purity: '999.9',
      'Weight (gm)': 100,
      'Certificate / Serial No.': 'MP-AG100-261091',
      Type: 'Bar',
      'HSN Code': '71069210',
      Barcode: '8904155910914',
      'Purchase Price (INR)': 9400,
    },
    {
      'SKU Code': 'MMTC-AU-8G-SOV',
      'Product Name': '8 gm Gold 999.9 Minted Sovereign Coin',
      Metal: 'Gold',
      Purity: '999.9',
      'Weight (gm)': 8,
      'Certificate / Serial No.': 'MP-AU8-260801',
      Type: 'Coin',
      'HSN Code': '71141910',
      Barcode: '8904155908010',
      'Purchase Price (INR)': 61100,
    },
  ];

  const summaryRows = [
    { Metal: 'Gold', 'Total Units': 4, 'Total Weight (gm)': 25 },
    { Metal: 'Silver', 'Total Units': 1, 'Total Weight (gm)': 100 },
  ];

  const wsStock = XLSX.utils.json_to_sheet(stockRows);
  wsStock['!cols'] = [
    { wch: 18 },
    { wch: 36 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 24 },
    { wch: 10 },
    { wch: 12 },
    { wch: 18 },
    { wch: 20 },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);

  XLSX.utils.book_append_sheet(wb, wsStock, 'Stock List');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  XLSX.writeFile(wb, 'MMTC_Stock_Import_Template.xlsx');
}

export function exportReportToExcel(
  filename: string,
  sheetName: string,
  rows: Record<string, string | number>[]
): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}


// ---------------------------------------------------------------------
// Product master import (products only, no physical stock)
// ---------------------------------------------------------------------

export interface ParsedProductRow {
  rowNumber: number;
  sheetName: string;
  sku_code: string;
  name: string;
  metal: MetalType;
  purity: string;
  weight_grams: number;
  type: 'Coin' | 'Bar';
  hsn_code: string;
  description: string;
  active: boolean;
  error: string;
}

export async function parseProductExcelFile(file: File): Promise<ParsedProductRow[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const rows: ParsedProductRow[] = [];
  const seen = new Set<string>();
  for (const sheetName of workbook.SheetNames) {
    if (sheetName.trim().toLowerCase().includes('summary')) continue;
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
    jsonRows.forEach((raw, index) => {
      const sku = pickField(raw, ['skucode', 'sku', 'itemcode', 'productcode']).toUpperCase();
      const name = pickField(raw, ['productname', 'itemname', 'name']);
      if (!sku && !name) return;
      const metalRaw = pickField(raw, ['metal', 'metaltype']);
      const metal = parseMetal(metalRaw, name);
      const weight = parseNumeric(pickField(raw, ['weightgm', 'weight', 'wtgm', 'netweight']));
      const activeRaw = pickField(raw, ['active', 'status']).toLowerCase();
      let error = '';
      if (!sku || !name || !(weight > 0)) {
        error = `Missing ${[!sku && 'SKU Code', !name && 'Product Name', !(weight > 0) && 'Weight (gm)'].filter(Boolean).join(', ')}`;
      } else if (seen.has(sku)) {
        error = 'SKU repeated in this file';
      }
      if (sku) seen.add(sku);
      rows.push({
        rowNumber: index + 2,
        sheetName,
        sku_code: sku,
        name,
        metal,
        purity: pickField(raw, ['purity', 'fineness']) || '999.9',
        weight_grams: weight,
        type: parseType(pickField(raw, ['type', 'category', 'form']), name),
        hsn_code: pickField(raw, ['hsncode', 'hsn']) || (metal === 'Gold' ? '71141910' : '71141110'),
        description: pickField(raw, ['description', 'defaultproductdescription', 'details']),
        active: !(activeRaw === 'no' || activeRaw === 'inactive' || activeRaw === 'false' || activeRaw === '0'),
        error,
      });
    });
  }
  return rows;
}

export function downloadProductTemplate(): void {
  const wb = XLSX.utils.book_new();
  const rows = [
    { 'SKU Code': 'MMTC-AU-5G-LAX', 'Product Name': '5 gm Gold 999.9 Minted Coin Laxmi', Metal: 'Gold', Purity: '999.9', 'Weight (gm)': 5, Type: 'Coin', 'HSN Code': '71141910', Description: 'Laxmi design minted coin in assay card', Active: 'Yes' },
    { 'SKU Code': 'MMTC-AU-10G-LOT', 'Product Name': '10 gm Gold 999.9 Minted Bar Lotus', Metal: 'Gold', Purity: '999.9', 'Weight (gm)': 10, Type: 'Bar', 'HSN Code': '71081200', Description: 'Lotus minted bar', Active: 'Yes' },
    { 'SKU Code': 'MMTC-AG-50G-BAR', 'Product Name': '50 gm Silver 999.9 Bar', Metal: 'Silver', Purity: '999.9', 'Weight (gm)': 50, Type: 'Bar', 'HSN Code': '71069200', Description: '', Active: 'Yes' },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Products');
  XLSX.writeFile(wb, 'Sirija_Product_Master_Template.xlsx');
}
