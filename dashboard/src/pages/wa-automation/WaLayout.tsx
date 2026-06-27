import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShieldUser,
  Users,
  Building2,
  Radio,
  Megaphone,
  FileText,
  Search,
  Cpu,
  HeartPulse,
  Settings,
  Menu,
  LogOut,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

const NAV_ITEMS = [
  { path: '/wa/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/wa/admins', label: 'Admins', icon: ShieldUser },
  { path: '/wa/groups', label: 'Groups', icon: Users },
  { path: '/wa/communities', label: 'Communities', icon: Building2 },
  { path: '/wa/broadcasts', label: 'Broadcasts', icon: Radio },
  { path: '/wa/advertisements', label: 'Ads', icon: Megaphone },
  { path: '/wa/templates', label: 'Templates', icon: FileText },
  { path: '/wa/scraper', label: 'Scraper', icon: Search },
  { path: '/wa/workers', label: 'Workers', icon: Cpu },
  { path: '/wa/admin-health', label: 'Health', icon: HeartPulse },
  { path: '/wa/settings', label: 'Settings', icon: Settings },
];

interface WaLayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
}

export default function WaLayout({ children, onLogout }: WaLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    setMobileOpen(false);
    onLogout();
  };

  const handleNav = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const isActive = (path: string) => location.pathname === path;

  const renderSidebar = (isMobile = false) => (
    <>
      {/* Logo + Brand */}
      <div
        className={`flex items-center h-16 px-4 border-b border-[var(--sidebar-border)] ${
          collapsed && !isMobile ? 'justify-center' : 'gap-3'
        }`}
      >
        <button
          onClick={() => collapsed && setCollapsed(false)}
          className={`w-8 h-8 rounded-xl bg-[var(--color-primary)] flex items-center justify-center shadow-lg shadow-[var(--color-primary)]/20 flex-shrink-0 ${
            collapsed && !isMobile ? 'cursor-pointer' : ''
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        {(!collapsed || isMobile) && (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--sidebar-text-active)] truncate">Senderrr</p>
              <p className="text-[10px] text-[var(--sidebar-text)] truncate -mt-0.5">Broadcasting</p>
            </div>
            {!isMobile && (
              <button
                onClick={() => setCollapsed(true)}
                className="p-1.5 rounded-lg text-[var(--sidebar-text)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--sidebar-hover-bg)] transition-colors cursor-pointer"
              >
                <PanelLeftClose size={16} />
              </button>
            )}
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
        {NAV_ITEMS.map(item => {
          const active = isActive(item.path);
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => handleNav(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer group ${
                collapsed && !isMobile ? 'justify-center px-2' : ''
              } ${
                active
                  ? 'bg-[var(--sidebar-active-bg)] text-[var(--color-primary)]'
                  : 'text-[var(--sidebar-text)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--sidebar-hover-bg)]'
              }`}
              title={collapsed && !isMobile ? item.label : undefined}
            >
              <div
                className={`flex items-center justify-center w-5 h-5 ${
                  active ? 'text-[var(--color-primary)]' : ''
                }`}
              >
                <Icon size={18} />
              </div>
              {(!collapsed || isMobile) && (
                <span className="truncate">{item.label}</span>
              )}
              {active && !collapsed && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div
        className={`border-t border-[var(--sidebar-border)] p-2.5 space-y-1 ${
          collapsed && !isMobile ? '' : ''
        }`}
      >
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--sidebar-text)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--sidebar-hover-bg)] transition-colors cursor-pointer ${
            collapsed && !isMobile ? 'justify-center px-2' : ''
          }`}
          title="Toggle theme"
        >
          <div className="flex items-center justify-center w-5 h-5">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </div>
          {(!collapsed || isMobile) && (
            <span className="truncate">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          )}
        </button>
        <button
          onClick={handleLogout}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer ${
            collapsed && !isMobile ? 'justify-center px-2' : ''
          }`}
          title="Logout"
        >
          <div className="flex items-center justify-center w-5 h-5">
            <LogOut size={18} />
          </div>
          {(!collapsed || isMobile) && <span className="truncate">Logout</span>}
        </button>

        {collapsed && !isMobile && (
          <button
            onClick={() => setCollapsed(false)}
            className="w-full flex items-center justify-center px-3 py-2 rounded-xl text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover-bg)] transition-colors cursor-pointer"
            title="Expand sidebar"
          >
            <PanelLeft size={16} />
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-[var(--color-bg)] text-[var(--color-text)] overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] transition-all duration-200 ease-in-out flex-shrink-0 ${
          collapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]'
        }`}
      >
        {renderSidebar(false)}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-[280px] h-full bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] flex flex-col animate-[slideIn_0.2s_ease] shadow-2xl">
            {renderSidebar(true)}
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
          >
            <Menu size={20} />
          </button>
          <div className="w-7 h-7 rounded-lg bg-[var(--color-primary)] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span className="font-semibold text-sm">Senderrr</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
