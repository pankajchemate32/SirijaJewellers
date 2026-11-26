import React, { useState } from 'react';
import { Database, Download, Lock, Plus, RotateCcw, Save, Upload } from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useStore } from '../context/StoreContext';
import { InvoiceFormat, MetalType, PaymentMode, TaxMode, UserRole } from '../types/database';
import { formatDateTimeDisplay, formatINR } from '../utils/format';

const ALL_PAYMENT_MODES: PaymentMode[] = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'];

export const SettingsPage: React.FC = () => {
  const {
    db,
    currentUser,
    getLatestRate,
    updateShopSettings,
    recordMetalRate,
    addUser,
    toggleUserActive,
    resetSampleData,
    restoreBackup,
    isCloudMode,
    notify,
  } = useStore();

  const isOwner = currentUser?.role === 'owner';

  // Metal Rate Form
  const [rateMetal, setRateMetal] = useState<MetalType>('Gold');
  const [ratePurity, setRatePurity] = useState('999.9');
  const [rateValue, setRateValue] = useState(String(getLatestRate('Gold')));
  const [rateEffectiveAt, setRateEffectiveAt] = useState(() =>
    new Date().toISOString().slice(0, 16)
  );
  const [rateNotes, setRateNotes] = useState('');

  // Shop Settings Form
  const [shopName, setShopName] = useState(db.shop_settings.shop_name);
  const [address, setAddress] = useState(db.shop_settings.address);
  const [phone, setPhone] = useState(db.shop_settings.phone);
  const [email, setEmail] = useState(db.shop_settings.email);
  const [gstin, setGstin] = useState(db.shop_settings.gstin);
  const [invoicePrefix, setInvoicePrefix] = useState(db.shop_settings.invoice_prefix);
  const [nextInvoiceNo, setNextInvoiceNo] = useState(String(db.shop_settings.next_invoice_number));
  const [invoiceFormat, setInvoiceFormat] = useState<InvoiceFormat>(db.shop_settings.invoice_format);
  const [defaultGstRate, setDefaultGstRate] = useState(String(db.shop_settings.default_gst_rate));
  const [defaultTaxMode, setDefaultTaxMode] = useState<TaxMode>(db.shop_settings.default_tax_mode);
  const [goldMaking, setGoldMaking] = useState(String(db.shop_settings.default_gold_making_charge));
  const [silverMaking, setSilverMaking] = useState(
    String(db.shop_settings.default_silver_making_charge)
  );
  const [enabledModes, setEnabledModes] = useState<PaymentMode[]>(
    db.shop_settings.enabled_payment_modes
  );

  // Add User Form
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('staff');
  const [newUserPin, setNewUserPin] = useState('');
  const [userError, setUserError] = useState('');

  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<unknown>(null);

  const handleSaveRate = (e: React.FormEvent) => {
    e.preventDefault();
    const res = recordMetalRate({
      metal: rateMetal,
      purity: ratePurity,
      rate_per_gram: parseFloat(rateValue) || 0,
      effective_at: new Date(rateEffectiveAt).toISOString(),
      notes: rateNotes,
    });
    if (res.ok) {
      setRateNotes('');
    }
  };

  const handleSaveShop = (e: React.FormEvent) => {
    e.preventDefault();
    if (enabledModes.length === 0) {
      notify('error', 'Select at least one payment method.');
      return;
    }
    updateShopSettings({
      shop_name: shopName.trim(),
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
      gstin: gstin.trim().toUpperCase(),
      invoice_prefix: invoicePrefix.trim(),
      next_invoice_number: Math.max(1, parseInt(nextInvoiceNo, 10) || 1),
      invoice_format: invoiceFormat,
      default_gst_rate: Math.max(0, parseFloat(defaultGstRate) || 0),
      default_tax_mode: defaultTaxMode,
      default_gold_making_charge: Math.max(0, parseFloat(goldMaking) || 0),
      default_silver_making_charge: Math.max(0, parseFloat(silverMaking) || 0),
      enabled_payment_modes: enabledModes,
    });
  };

  const toggleMode = (mode: PaymentMode) => {
    setEnabledModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    );
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    setUserError('');
    const res = addUser({
      name: newUserName,
      email: newUserEmail,
      role: newUserRole,
      pin: newUserPin,
    });
    if (!res.ok) {
      setUserError(res.error || 'Could not add user.');
      return;
    }
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPin('');
  };

  const handleExportBackup = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SirijaJwellers_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('success', 'Downloaded JSON backup of all 14 tables.');
  };

  return (
    <div className="space-y-8">
      {/* 1. LIVE GOLD & SILVER RATES */}
      <section className="rounded-xl border border-[#E7E5E0] bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E7E5E0] pb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-zinc-900">
              Gold &amp; Silver Bullion Rates
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Rates are manually updated with effective timestamp. Historical bills permanently retain
              the rate captured at billing time.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span>
              Current Gold:{' '}
              <strong className="font-mono-num text-sm text-[#9A6B1C]">
                {formatINR(getLatestRate('Gold'))}/g
              </strong>
            </span>
            <span className="text-zinc-300">·</span>
            <span>
              Current Silver:{' '}
              <strong className="font-mono-num text-sm text-zinc-900">
                {formatINR(getLatestRate('Silver'))}/g
              </strong>
            </span>
          </div>
        </div>

        <form onSubmit={handleSaveRate} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="block text-xs font-medium text-zinc-700">Metal</label>
            <select
              value={rateMetal}
              onChange={(e) => {
                const m = e.target.value as MetalType;
                setRateMetal(m);
                setRateValue(String(getLatestRate(m)));
              }}
              className="mt-1 w-full rounded-lg border border-[#E7E5E0] bg-white px-3 py-2 text-sm outline-none focus:border-[#9A6B1C]"
            >
              <option value="Gold">Gold</option>
              <option value="Silver">Silver</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700">Purity</label>
            <input
              type="text"
              value={ratePurity}
              onChange={(e) => setRatePurity(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 font-mono-num text-sm outline-none focus:border-[#9A6B1C]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700">Rate per gram (₹)</label>
            <input
              type="number"
              required
              min="1"
              step="0.01"
              value={rateValue}
              onChange={(e) => setRateValue(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 font-mono-num text-sm font-semibold outline-none focus:border-[#9A6B1C]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700">Effective Date &amp; Time</label>
            <input
              type="datetime-local"
              value={rateEffectiveAt}
              onChange={(e) => setRateEffectiveAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 font-mono-num text-xs outline-none focus:border-[#9A6B1C]"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-lg bg-[#9A6B1C] px-4 py-2 text-sm font-medium text-white hover:bg-[#825814]"
            >
              Save New Rate
            </button>
          </div>
          <div className="sm:col-span-2 lg:col-span-5">
            <input
              type="text"
              value={rateNotes}
              onChange={(e) => setRateNotes(e.target.value)}
              placeholder="Optional rate note (e.g., IBJA afternoon spot update)"
              className="w-full rounded-lg border border-[#E7E5E0] px-3 py-2 text-xs outline-none focus:border-[#9A6B1C]"
            />
          </div>
        </form>

        <div className="mt-5 overflow-x-auto border-t border-[#E7E5E0] pt-4">
          <div className="mb-2 text-xs font-semibold text-zinc-600">Recent Rate History</div>
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#E7E5E0] bg-[#FAF9F6] text-zinc-500">
                <th className="px-3 py-2">Effective Time</th>
                <th className="px-3 py-2">Metal &amp; Purity</th>
                <th className="px-3 py-2 text-right">Rate / gm</th>
                <th className="px-3 py-2">Updated By</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EFEA]">
              {db.metal_rates.slice(0, 6).map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono-num text-zinc-600">
                    {formatDateTimeDisplay(r.effective_at)}
                  </td>
                  <td className="px-3 py-2 font-medium text-zinc-900">
                    {r.metal} {r.purity}
                  </td>
                  <td className="px-3 py-2 text-right font-mono-num font-semibold text-zinc-900">
                    {formatINR(r.rate_per_gram)}
                  </td>
                  <td className="px-3 py-2 text-zinc-600">{r.updated_by}</td>
                  <td className="px-3 py-2 text-zinc-500">{r.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. SHOP DETAILS, INVOICE & TAX CONFIGURATION */}
      <section className="rounded-xl border border-[#E7E5E0] bg-white p-6">
        <div className="flex items-center justify-between border-b border-[#E7E5E0] pb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-zinc-900">
              Shop Profile, GST &amp; Invoice Configuration
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Configurable shop header, invoice series, tax treatment, making charges, and payment
              options.
            </p>
          </div>
          {!isOwner && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500">
              <Lock className="h-3.5 w-3.5" /> Owner only
            </span>
          )}
        </div>

        <form onSubmit={handleSaveShop} className="mt-5 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700">Jewellery Shop Name</label>
              <input
                type="text"
                disabled={!isOwner}
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#9A6B1C] disabled:bg-zinc-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">Phone</label>
              <input
                type="text"
                disabled={!isOwner}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 font-mono-num text-sm outline-none focus:border-[#9A6B1C] disabled:bg-zinc-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">Email</label>
              <input
                type="email"
                disabled={!isOwner}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#9A6B1C] disabled:bg-zinc-50"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-700">Shop Address</label>
              <input
                type="text"
                disabled={!isOwner}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#9A6B1C] disabled:bg-zinc-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">Shop GSTIN</label>
              <input
                type="text"
                disabled={!isOwner}
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 font-mono-num text-sm uppercase outline-none focus:border-[#9A6B1C] disabled:bg-zinc-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700">Invoice Prefix</label>
              <input
                type="text"
                disabled={!isOwner}
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 font-mono-num text-sm outline-none focus:border-[#9A6B1C] disabled:bg-zinc-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">Next Invoice Number</label>
              <input
                type="number"
                min={1}
                disabled={!isOwner}
                value={nextInvoiceNo}
                onChange={(e) => setNextInvoiceNo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 font-mono-num text-sm outline-none focus:border-[#9A6B1C] disabled:bg-zinc-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">Default Invoice Format</label>
              <select
                disabled={!isOwner}
                value={invoiceFormat}
                onChange={(e) => setInvoiceFormat(e.target.value as InvoiceFormat)}
                className="mt-1 w-full rounded-lg border border-[#E7E5E0] bg-white px-3 py-2 text-sm outline-none focus:border-[#9A6B1C] disabled:bg-zinc-50"
              >
                <option value="A4">A4 Tax Invoice</option>
                <option value="THERMAL">Compact Thermal (80mm)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700">Default GST Rate (%)</label>
              <input
                type="number"
                min={0}
                max={28}
                step="0.25"
                disabled={!isOwner}
                value={defaultGstRate}
                onChange={(e) => setDefaultGstRate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 font-mono-num text-sm outline-none focus:border-[#9A6B1C] disabled:bg-zinc-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700">Default Tax Breakdown</label>
              <select
                disabled={!isOwner}
                value={defaultTaxMode}
                onChange={(e) => setDefaultTaxMode(e.target.value as TaxMode)}
                className="mt-1 w-full rounded-lg border border-[#E7E5E0] bg-white px-3 py-2 text-sm outline-none focus:border-[#9A6B1C] disabled:bg-zinc-50"
              >
                <option value="CGST_SGST">CGST + SGST (Intra-State)</option>
                <option value="IGST">IGST (Inter-State)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700">Gold Making (₹)</label>
                <input
                  type="number"
                  min={0}
                  disabled={!isOwner}
                  value={goldMaking}
                  onChange={(e) => setGoldMaking(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 font-mono-num text-sm outline-none focus:border-[#9A6B1C] disabled:bg-zinc-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700">Silver Making (₹)</label>
                <input
                  type="number"
                  min={0}
                  disabled={!isOwner}
                  value={silverMaking}
                  onChange={(e) => setSilverMaking(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#E7E5E0] px-3 py-2 font-mono-num text-sm outline-none focus:border-[#9A6B1C] disabled:bg-zinc-50"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700">Enabled Payment Methods</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ALL_PAYMENT_MODES.map((m) => (
                <label
                  key={m}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    enabledModes.includes(m)
                      ? 'border-[#9A6B1C] bg-[#FBF7EE] text-[#825814]'
                      : 'border-[#E7E5E0] bg-white text-zinc-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={!isOwner}
                    checked={enabledModes.includes(m)}
                    onChange={() => toggleMode(m)}
                    className="accent-[#9A6B1C]"
                  />
                  <span>{m}</span>
                </label>
              ))}
            </div>
          </div>

          {isOwner && (
            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-[#9A6B1C] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#825814]"
              >
                <Save className="h-4 w-4" />
                <span>Save Shop Settings</span>
              </button>
            </div>
          )}
        </form>
      </section>

      {/* 3. USERS & ROLE-BASED ACCESS */}
      <section className="rounded-xl border border-[#E7E5E0] bg-white p-6">
        <div className="border-b border-[#E7E5E0] pb-4">
          <h2 className="font-display text-base font-semibold text-zinc-900">
            Users &amp; Role Permissions
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Owners have full access including purchase reversals and tax settings. Staff can bill,
            import stock, and collect payments but cannot delete or reverse completed transactions.
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#E7E5E0] bg-[#FAF9F6] text-xs font-medium text-zinc-500">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Status</th>
                {isOwner && <th className="px-4 py-2.5 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EFEA]">
              {db.users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2.5 font-medium text-zinc-900">{u.name}</td>
                  <td className="px-4 py-2.5 text-xs text-zinc-600">{u.email}</td>
                  <td className="px-4 py-2.5 text-xs font-medium text-zinc-800">
                    {u.role === 'owner' ? 'Owner' : 'Staff'}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <span className={u.active ? 'text-emerald-700' : 'text-zinc-400'}>
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {isOwner && (
                    <td className="px-4 py-2.5 text-right text-xs">
                      {u.id !== currentUser?.id && (
                        <button
                          type="button"
                          onClick={() => toggleUserActive(u.id)}
                          className="font-medium text-[#9A6B1C] hover:underline"
                        >
                          {u.active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isOwner && (
          <form onSubmit={handleAddUser} className="mt-5 grid grid-cols-1 gap-3 border-t border-[#E7E5E0] pt-4 sm:grid-cols-5">
            <input
              type="text"
              required
              placeholder="Staff name"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              className="rounded-lg border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#9A6B1C]"
            />
            <input
              type="email"
              required
              placeholder="staff@shop.in"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              className="rounded-lg border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#9A6B1C]"
            />
            <select
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value as UserRole)}
              className="rounded-lg border border-[#E7E5E0] bg-white px-3 py-2 text-sm outline-none focus:border-[#9A6B1C]"
            >
              <option value="staff">Staff</option>
              <option value="owner">Owner</option>
            </select>
            {isCloudMode ? (
              <p className="self-center text-xs text-zinc-500">They create their own password at sign-in using this email.</p>
            ) : (
            <input
              type="text"
              required
              placeholder="4-digit PIN"
              value={newUserPin}
              onChange={(e) => setNewUserPin(e.target.value)}
              className="rounded-lg border border-[#E7E5E0] px-3 py-2 font-mono-num text-sm outline-none focus:border-[#9A6B1C]"
            />
            )}
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#9A6B1C] px-4 py-2 text-sm font-medium text-white hover:bg-[#825814]"
            >
              <Plus className="h-4 w-4" />
              <span>Add User</span>
            </button>
            {userError && (
              <p className="text-xs text-red-700 sm:col-span-5">{userError}</p>
            )}
          </form>
        )}
      </section>

      {/* 4. DATA BACKUP & SUPABASE MIGRATION PATH */}
      <section className="rounded-xl border border-[#E7E5E0] bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[#9A6B1C]" />
              <h2 className="font-display text-base font-semibold text-zinc-900">
                Data Backup &amp; Supabase Migration Path
              </h2>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">
              {isCloudMode ? (
                <>
                  Connected to the online Supabase database: every change is saved centrally and shared by all
                  counters. Download a backup regularly. To move data from Local Mode, export a backup there and
                  restore it here.
                </>
              ) : (
                <>
                  Local Mode: data is kept in this browser only. To move to the online database, create a Supabase
                  project, run <span className="font-mono-num">supabase/schema.sql</span>, set{' '}
                  <span className="font-mono-num">VITE_SUPABASE_URL</span> and{' '}
                  <span className="font-mono-num">VITE_SUPABASE_ANON_KEY</span>, then restore this backup there.
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportBackup}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E0] bg-white px-4 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 whitespace-nowrap"
            >
              <Download className="h-4 w-4 text-[#9A6B1C]" />
              <span>Download Backup</span>
            </button>
            {isOwner && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#E7E5E0] bg-white px-4 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 whitespace-nowrap">
                <Upload className="h-4 w-4 text-[#9A6B1C]" />
                <span>Restore Backup</span>
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                      const parsed = JSON.parse(await file.text());
                      setPendingRestore(parsed);
                    } catch {
                      notify('error', 'Could not read this backup file.');
                    }
                  }}
                />
              </label>
            )}
            {isOwner && (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-800 hover:bg-red-100 whitespace-nowrap"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Load Sample Data</span>
              </button>
            )}
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirmReset}
        title="Replace all data with sample data?"
        description="This deletes all current bills, purchases, stock, customers, suppliers and settings, and loads the sample dataset. User logins are kept. Download a backup first if you want to keep your records."
        confirmLabel="Load Sample Data"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          resetSampleData();
          setConfirmReset(false);
        }}
      />

      <ConfirmDialog
        open={pendingRestore !== null}
        title="Restore this backup?"
        description="All current bills, purchases, stock, customers, suppliers and settings will be replaced with the contents of the backup file. User logins are kept."
        confirmLabel="Restore Backup"
        danger
        onCancel={() => setPendingRestore(null)}
        onConfirm={() => {
          const res = restoreBackup(pendingRestore);
          if (!res.ok) notify('error', res.error || 'Restore failed.');
          setPendingRestore(null);
        }}
      />
    </div>
  );
};
