import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { LoginScreen } from './components/LoginScreen';
import { StoreProvider, useStore } from './context/StoreContext';
import { CustomersPage } from './pages/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { ReportsPage } from './pages/ReportsPage';
import { SalesBillingPage } from './pages/SalesBillingPage';
import { SettingsPage } from './pages/SettingsPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { NavSection } from './types/database';

const AppShell: React.FC = () => {
  const { currentUser } = useStore();
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');

  if (!currentUser) {
    return <LoginScreen />;
  }

  return (
    <Layout activeSection={activeSection} onNavigate={setActiveSection}>
      {activeSection === 'dashboard' && <DashboardPage onNavigate={setActiveSection} />}
      {activeSection === 'sales' && <SalesBillingPage />}
      {activeSection === 'purchases' && <PurchasesPage />}
      {activeSection === 'inventory' && <InventoryPage />}
      {activeSection === 'customers' && <CustomersPage />}
      {activeSection === 'suppliers' && <SuppliersPage />}
      {activeSection === 'reports' && <ReportsPage />}
      {activeSection === 'settings' && <SettingsPage />}
    </Layout>
  );
};

export default function App() {
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  );
}
