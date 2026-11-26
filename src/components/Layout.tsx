import React, { useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Boxes,
  Building2,
  CheckCircle2,
  Info,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Receipt,
  Settings,
  ShoppingBag,
  Users,
  X,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { NavSection } from '../types/database';
import { formatINRCompact } from '../utils/format';

interface LayoutProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  children: React.ReactNode;
}

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'sales', label: 'Sales / Billing', icon: Receipt },
  { id: 'purchases', label: 'Purchases', icon: ShoppingBag },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'suppliers', label: 'Suppliers', icon: Building2 },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const SECTION_TITLES: Record<NavSection, string> = {
  dashboard: 'Dashboard',
  sales: 'Sales & Billing',
  purchases: 'Purchases',
  inventory: 'Inventory',
  customers: 'Customers',
  suppliers: 'Suppliers',
  reports: 'Business Reports',
  settings: 'Settings',
};

export const Layout: React.FC<LayoutProps> = ({ activeSection, onNavigate, children }) => {
  const {
    db,
    currentUser,
    getLatestRate,
    logout,
    switchDemoUser,
    toasts,
    dismissToast,
    isCloudMode,
    syncState,
    clearSyncError,
  } = useStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const goldRate = getLatestRate('Gold');
  const silverRate = getLatestRate('Silver');

  const handleNavClick = (section: NavSection) => {
    onNavigate(section);
    setMobileMenuOpen(false);
  };

  const otherActiveUser = isCloudMode ? undefined : db.users.find((u) => u.active && u.id !== currentUser?.id);
  const isFullScreen = activeSection === 'sales';

  const sidebarContent = (
    <div className="flex h-full flex-col border-r border-slate-200 bg-white text-slate-700">
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
        <button
          type="button"
          onClick={() => handleNavClick('dashboard')}
          className="flex items-center gap-3 text-left whitespace-nowrap shrink-0"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#B7801A] text-xs font-bold tracking-wide text-white shadow-sm">SJ</div>
          <span className="font-display text-lg font-bold tracking-tight text-slate-900">
            Sirija Jwellers
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className={`rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900 ${
            isFullScreen ? '' : 'lg:hidden'
          }`}
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="border-b border-slate-200 bg-[#FBF8F1] px-5 py-3.5">
        <div className="truncate text-xs font-semibold text-[#8A5E0B]">
          {db.shop_settings.shop_name}
        </div>
        <div className="mt-0.5 font-mono-num text-[11px] text-slate-500">
          {db.shop_settings.gstin ? `GSTIN ${db.shop_settings.gstin}` : 'Configure shop GSTIN'}
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-[#FBF3E2] text-[#7A520A] font-semibold ring-1 ring-inset ring-[#EBD3A0]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${active ? 'text-[#B7801A]' : 'text-slate-400'}`}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{currentUser?.name}</div>
            <div className="text-xs text-slate-500">
              {currentUser?.role === 'owner' ? 'Owner Account' : 'Billing Staff'}
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        {otherActiveUser && (
          <button
            type="button"
            onClick={() => switchDemoUser(otherActiveUser.id)}
            className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-slate-900 whitespace-nowrap"
          >
            Switch to {otherActiveUser.role === 'owner' ? 'Owner' : 'Staff'} (
            {otherActiveUser.name.split(' ')[0]})
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#F3F5F8] text-slate-900">
      {/* Desktop Deep Navy Sidebar (Hidden in Full-Screen POS mode) */}
      {!isFullScreen && (
        <aside className="no-print hidden w-64 shrink-0 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:block">
          {sidebarContent}
        </aside>
      )}

      {/* Slide-over Navigation Drawer */}
      {mobileMenuOpen && (
        <div className={`no-print fixed inset-0 z-50 flex ${isFullScreen ? '' : 'lg:hidden'}`}>
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-64 max-w-[82vw] bg-white shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Area — Full Width Across All Screens */}
      <div className={`flex min-w-0 flex-1 flex-col ${isFullScreen ? '' : 'lg:pl-64'}`}>
        {/* Crisp Elevated Top Bar */}
        <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200/90 bg-white px-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:px-7">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className={`rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${
                isFullScreen ? '' : 'lg:hidden'
              }`}
              aria-label="Open navigation menu"
              title="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {isFullScreen && (
              <div className="hidden items-center gap-2.5 sm:flex">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#B7801A] text-xs font-bold text-white">SJ</div>
                <span className="text-slate-300" aria-hidden="true">/</span>
              </div>
            )}

            <h1 className="truncate font-display text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
              {SECTION_TITLES[activeSection]}
            </h1>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('settings')}
            title="Click to update today's bullion rates"
            className="hidden items-center gap-4 text-sm text-slate-600 transition-colors hover:text-slate-950 md:flex whitespace-nowrap shrink-0"
          >
            <span>
              <span className="font-medium text-amber-700">Gold 999.9</span>{' '}
              <strong className="font-mono-num font-semibold text-slate-900">
                {formatINRCompact(goldRate)}/g
              </strong>
            </span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <span>
              <span className="font-medium text-sky-700">Silver 999.9</span>{' '}
              <strong className="font-mono-num font-semibold text-slate-900">
                {formatINRCompact(silverRate)}/g
              </strong>
            </span>
          </button>

          <div className="flex items-center gap-3 shrink-0">
            <span
              className={`hidden items-center gap-1.5 text-xs font-medium sm:inline-flex ${
                syncState.pending > 0 ? 'text-amber-700' : 'text-slate-500'
              }`}
              title={isCloudMode ? 'Saved to the online database' : 'Local Mode: data is kept in this browser only'}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  !isCloudMode ? 'bg-slate-400' : syncState.pending > 0 ? 'animate-pulse bg-amber-500' : 'bg-emerald-500'
                }`}
              />
              {!isCloudMode ? 'Local mode' : syncState.pending > 0 ? 'Saving…' : 'All saved'}
            </span>
            {isFullScreen ? (
              <button
                type="button"
                onClick={() => onNavigate('dashboard')}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950 whitespace-nowrap shrink-0"
              >
                Exit POS
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('sales')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#C88A12] px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-[#AE750B] whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>New Bill</span>
              </button>
            )}
          </div>
        </header>

        <main className="w-full flex-1 px-5 py-6 sm:px-7">{children}</main>
      </div>

      {syncState.error && (
        <div className="no-print fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4" role="alertdialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-rose-600" />
              <div>
                <h2 className="text-base font-semibold text-slate-900">Change not saved</h2>
                <p className="mt-1.5 text-sm text-slate-600">{syncState.error}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={clearSyncError}
                className="rounded-lg bg-[#B7801A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#9C6C12]"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="no-print fixed bottom-5 right-5 z-50 flex max-w-sm flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`flex items-start gap-2.5 rounded-xl border px-4 py-3.5 text-sm shadow-lg ${
                toast.type === 'success'
                  ? 'border-emerald-200 bg-white text-slate-900'
                  : toast.type === 'error'
                  ? 'border-rose-200 bg-white text-rose-900'
                  : 'border-slate-200 bg-white text-slate-900'
              }`}
            >
              {toast.type === 'success' && (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              )}
              {toast.type === 'error' && (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              )}
              {toast.type === 'info' && (
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#C88A12]" />
              )}
              <span className="flex-1 leading-snug">{toast.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
