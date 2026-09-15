import { useState } from 'react'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CustomersPage from './pages/CustomersPage'
import InventoryPage from './pages/InventoryPage'
import NewInvoicePage from './pages/NewInvoicePage'
import InvoiceHistoryPage from './pages/InvoiceHistoryPage'
import UsersPage from './pages/UsersPage'
import AuditPage from './pages/AuditPage'
import { can } from './domain/permissions'
import { useStore } from './state/store'

type Screen = 'dashboard' | 'customers' | 'inventory' | 'new-invoice' | 'invoices' | 'users' | 'audit'

const TABS: { id: Screen; label: string; adminOnly?: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'customers', label: 'Customers' },
  { id: 'inventory', label: 'Inventory / Parts' },
  { id: 'new-invoice', label: 'New Invoice' },
  { id: 'invoices', label: 'Invoice History' },
  { id: 'users', label: 'Users', adminOnly: true },
  { id: 'audit', label: 'Audit Log' },
]

export default function App() {
  const { session, logout, toasts, dismissToast, storageWarning } = useStore()
  const [screen, setScreen] = useState<Screen>('dashboard')

  if (!session) return <LoginPage />

  const tabs = TABS.filter((t) => !t.adminOnly || can(session.role, 'user.manage'))
  const go = (s: Screen) => setScreen(s)

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">APEX DMS</span>
        <span className="version">v3.0 · web</span>
        <div className="spacer" />
        <span className="who">
          {session.fullName || session.username}
          <span className="role-chip">{session.role}</span>
        </span>
        <button className="btn" onClick={logout}>
          Sign out
        </button>
      </header>

      <nav className="nav">
        {tabs.map((t) => (
          <button key={t.id} aria-current={screen === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {storageWarning && <div className="notice warn">{storageWarning}</div>}
        {screen === 'dashboard' && <DashboardPage onNavigate={go} />}
        {screen === 'customers' && <CustomersPage />}
        {screen === 'inventory' && <InventoryPage />}
        {screen === 'new-invoice' && <NewInvoicePage onSaved={() => go('invoices')} />}
        {screen === 'invoices' && <InvoiceHistoryPage />}
        {screen === 'users' && <UsersPage />}
        {screen === 'audit' && <AuditPage />}
      </main>

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span style={{ flex: 1 }}>{t.text}</span>
            <button aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
