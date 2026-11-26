export type UserRole = 'owner' | 'staff';
export type MetalType = 'Gold' | 'Silver';
export type ProductType = 'Coin' | 'Bar';
export type StockStatus = 'Available' | 'Sold' | 'Returned' | 'Damaged';
export type TaxMode = 'CGST_SGST' | 'IGST';
export type InvoiceFormat = 'A4' | 'THERMAL';
export type PaymentMode = 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Other';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid';
export type SupplierType = 'MMTC' | 'Bullion Wholesaler' | 'Refinery' | 'Other';
export type PurchaseStatus = 'draft' | 'completed' | 'reversed';
export type SaleStatus = 'completed' | 'returned' | 'partial_return';
export type ReturnResolution = 'refund' | 'exchange';
export type StockMovementType =
  | 'IMPORT'
  | 'PURCHASE'
  | 'PURCHASE_REVERSAL'
  | 'SALE'
  | 'RETURN_RESTOCK'
  | 'RETURN_DAMAGED'
  | 'ADJUSTMENT';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  pin: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShopSettings {
  id: string;
  shop_name: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  state_code: string;
  invoice_prefix: string;
  next_invoice_number: number;
  invoice_format: InvoiceFormat;
  default_gst_rate: number;
  default_tax_mode: TaxMode;
  default_gold_making_charge: number;
  default_silver_making_charge: number;
  enabled_payment_modes: PaymentMode[];
  updated_at: string;
}

export interface MetalRate {
  id: string;
  metal: MetalType;
  purity: string;
  rate_per_gram: number;
  effective_at: string;
  updated_by: string;
  notes: string;
  created_at: string;
}

export interface Product {
  id: string;
  sku_code: string;
  name: string;
  metal: MetalType;
  purity: string;
  weight_grams: number;
  type: ProductType;
  hsn_code: string;
  description: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_number: string;
  address: string;
  gstin: string;
  supplier_type: SupplierType;
  created_at: string;
  updated_at: string;
}

export interface Purchase {
  id: string;
  purchase_number: string;
  supplier_id: string;
  supplier_invoice_number: string;
  purchase_date: string; // YYYY-MM-DD
  status: PurchaseStatus;
  tax_mode: TaxMode;
  subtotal: number;
  discount_total: number;
  taxable_amount: number;
  gst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  gst_total: number;
  grand_total: number;
  amount_paid: number;
  balance_due: number;
  payment_mode: PaymentMode;
  payment_status: PaymentStatus;
  notes: string;
  attachment_name?: string;
  attachment_data_url?: string;
  reversal_reason?: string;
  reversed_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;
  weight_grams: number;
  rate_per_gram: number;
  making_charges: number;
  discount: number;
  taxable_amount: number;
  gst_rate: number;
  gst_amount: number;
  total_amount: number;
  unit_cost: number;
  serial_numbers: string[];
  created_at: string;
}

export interface StockItem {
  id: string; // Unique internal stock ID e.g. STK-1001
  product_id: string;
  serial_number: string;
  barcode: string;
  purchase_id: string | null;
  purchase_date: string; // YYYY-MM-DD
  supplier_id: string | null;
  purchase_price: number;
  status: StockStatus;
  sale_id: string | null;
  sale_item_id: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  address: string;
  gstin: string;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  invoice_number: string;
  sale_date: string; // YYYY-MM-DD
  customer_id: string | null;
  customer_name: string;
  customer_mobile: string;
  customer_gstin: string;
  is_walk_in: boolean;
  tax_mode: TaxMode;
  subtotal: number;
  discount_total: number;
  taxable_amount: number;
  gst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  gst_total: number;
  grand_total: number;
  amount_received: number;
  balance_due: number;
  payment_status: PaymentStatus;
  notes: string;
  gold_rate_snapshot: number;
  silver_rate_snapshot: number;
  status: SaleStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  stock_item_id: string;
  serial_number: string;
  product_name: string;
  sku_code: string;
  metal: MetalType;
  purity: string;
  weight_grams: number;
  hsn_code: string;
  rate_per_gram: number;
  making_charges: number;
  discount: number;
  taxable_amount: number;
  gst_rate: number;
  gst_amount: number;
  line_total: number;
  purchase_cost_snapshot: number;
  returned: boolean;
  created_at: string;
}

export interface Payment {
  id: string;
  reference_type: 'sale' | 'purchase' | 'refund';
  reference_id: string;
  party_id: string | null;
  party_name: string;
  payment_date: string; // YYYY-MM-DD
  mode: PaymentMode;
  amount: number;
  notes: string;
  created_by: string;
  created_at: string;
}

export interface SalesReturn {
  id: string;
  return_number: string;
  sale_id: string;
  invoice_number: string;
  sale_item_id: string;
  stock_item_id: string;
  serial_number: string;
  product_name: string;
  customer_id: string | null;
  customer_name: string;
  return_date: string; // YYYY-MM-DD
  reason: string;
  resolution: ReturnResolution;
  refund_amount: number;
  refund_mode: PaymentMode;
  restock_to_available: boolean;
  created_by: string;
  created_at: string;
}

export interface StockMovement {
  id: string;
  stock_item_id: string;
  product_id: string;
  serial_number: string;
  movement_type: StockMovementType;
  reference_type: 'IMPORT' | 'PURCHASE' | 'SALE' | 'RETURN' | 'ADJUSTMENT';
  reference_id: string;
  reference_number: string;
  previous_status: StockStatus | null;
  new_status: StockStatus;
  notes: string;
  created_by: string;
  created_at: string;
}

export interface DatabaseState {
  users: User[];
  shop_settings: ShopSettings;
  metal_rates: MetalRate[];
  products: Product[];
  suppliers: Supplier[];
  purchases: Purchase[];
  purchase_items: PurchaseItem[];
  stock_items: StockItem[];
  customers: Customer[];
  sales: Sale[];
  sale_items: SaleItem[];
  payments: Payment[];
  returns: SalesReturn[];
  stock_movements: StockMovement[];
  next_stock_seq: number;
  next_purchase_seq: number;
  next_return_seq: number;
}

export type NavSection =
  | 'dashboard'
  | 'sales'
  | 'purchases'
  | 'inventory'
  | 'customers'
  | 'suppliers'
  | 'reports'
  | 'settings';
