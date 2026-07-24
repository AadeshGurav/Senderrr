import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { RoleProvider, useRole, type UserRole } from './hooks/useRole';
import { ErrorBoundary } from './components/ErrorBoundary';
import WaLayout from './pages/wa-automation/WaLayout';
import WaLogin from './pages/wa-automation/WaLogin';
import WaDashboard from './pages/wa-automation/WaDashboard';
import WaAdmins from './pages/wa-automation/WaAdmins';
import WaGroups from './pages/wa-automation/WaGroups';
import WaCommunities from './pages/wa-automation/WaCommunities';
import WaBroadcasts from './pages/wa-automation/WaBroadcasts';
import WaAdvertisements from './pages/wa-automation/WaAdvertisements';
import WaTemplates from './pages/wa-automation/WaTemplates';
import WaScraper from './pages/wa-automation/WaScraper';
import WaWorkers from './pages/wa-automation/WaWorkers';
import WaAdminHealth from './pages/wa-automation/WaAdminHealth';
import WaSettings from './pages/wa-automation/WaSettings';
import { FeatureErrorBoundary } from './components/FeatureErrorBoundary';

const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Sessions = lazy(() => import('./pages/Sessions').then(m => ({ default: m.Sessions })));
const Webhooks = lazy(() => import('./pages/Webhooks').then(m => ({ default: m.Webhooks })));
const Logs = lazy(() => import('./pages/Logs').then(m => ({ default: m.Logs })));
const ApiKeys = lazy(() => import('./pages/ApiKeys').then(m => ({ default: m.ApiKeys })));
const MessageTester = lazy(() => import('./pages/MessageTester').then(m => ({ default: m.MessageTester })));
const Infrastructure = lazy(() => import('./pages/Infrastructure').then(m => ({ default: m.Infrastructure })));
const Plugins = lazy(() => import('./pages/Plugins'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
});

// ─── WA Automation App (at /wa/*) ─────────────────────────────────

function WaAppContent() {
  const [token, setToken] = useState<string | null>(sessionStorage.getItem('wa_token'));
  const [initialized, setInitialized] = useState(!!token);

  const handleLogin = (newToken: string) => {
    setToken(newToken);
    setInitialized(true);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('wa_token');
    setToken(null);
    setInitialized(false);
  };

  if (!initialized) {
    return <WaLogin onLogin={handleLogin} />;
  }

  return (
    <WaLayout onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<Navigate to="/wa/dashboard" replace />} />
        <Route path="/wa/dashboard" element={<FeatureErrorBoundary name="Dashboard"><WaDashboard /></FeatureErrorBoundary>} />
        <Route path="/wa/admins" element={<FeatureErrorBoundary name="Admins"><WaAdmins /></FeatureErrorBoundary>} />
        <Route path="/wa/groups" element={<FeatureErrorBoundary name="Groups"><WaGroups /></FeatureErrorBoundary>} />
        <Route path="/wa/communities" element={<FeatureErrorBoundary name="Communities"><WaCommunities /></FeatureErrorBoundary>} />
        <Route path="/wa/broadcasts" element={<FeatureErrorBoundary name="Broadcasts"><WaBroadcasts /></FeatureErrorBoundary>} />
        <Route path="/wa/advertisements" element={<FeatureErrorBoundary name="Ads"><WaAdvertisements /></FeatureErrorBoundary>} />
        <Route path="/wa/templates" element={<FeatureErrorBoundary name="Templates"><WaTemplates /></FeatureErrorBoundary>} />
        <Route path="/wa/scraper" element={<FeatureErrorBoundary name="Scraper"><WaScraper /></FeatureErrorBoundary>} />
        <Route path="/wa/workers" element={<FeatureErrorBoundary name="Workers"><WaWorkers /></FeatureErrorBoundary>} />
        <Route path="/wa/admin-health" element={<FeatureErrorBoundary name="Health"><WaAdminHealth /></FeatureErrorBoundary>} />
        <Route path="/wa/settings" element={<FeatureErrorBoundary name="Settings"><WaSettings /></FeatureErrorBoundary>} />
        <Route path="*" element={<Navigate to="/wa/dashboard" replace />} />
      </Routes>
    </WaLayout>
  );
}

function WaApp() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <WaAppContent />
        </ToastProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

// ─── Senderrr Admin App (at /_senderrr/*) ──────────────────────────

function OpenwaAppContent() {
  const savedKey = sessionStorage.getItem('openwa_api_key');
  const [isAuthenticated, setIsAuthenticated] = useState(!!savedKey);
  const [, setApiKey] = useState(savedKey || '');
  const { setRole, role } = useRole();

  const handleLogin = async (key: string) => {
    setApiKey(key);
    sessionStorage.setItem('openwa_api_key', key);
    try {
      const response = await fetch('/api/auth/validate', {
        method: 'POST', headers: { 'X-API-Key': key },
      });
      if (response.ok) {
        const data = await response.json();
        setRole(data.role as UserRole);
      }
    } catch { setRole('viewer'); }
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setApiKey('');
    setIsAuthenticated(false);
    setRole(null);
    sessionStorage.removeItem('openwa_api_key');
  };

  useEffect(() => {
    if (!savedKey) return;
    fetch('/api/auth/validate', {
      method: 'POST', headers: { 'X-API-Key': savedKey },
    })
      .then(res => res.json())
      .then(data => { if (data.valid && data.role) setRole(data.role as UserRole); })
      .catch(() => {});
  }, [savedKey, setRole]);

  const loadingFallback = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Loader2 className="animate-spin" size={32} />
    </div>
  );

  if (!isAuthenticated) {
    return <Suspense fallback={loadingFallback}><Login onLogin={handleLogin} /></Suspense>;
  }

  return (
    <ToastProvider>
      <Suspense fallback={loadingFallback}>
      <Routes>
        <Route path="/" element={<Layout onLogout={handleLogout} userRole={role} />}>
          <Route index element={<Dashboard />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="webhooks" element={<Webhooks />} />
          {role === 'admin' && <Route path="api-keys" element={<ApiKeys />} />}
          <Route path="logs" element={<Logs />} />
          <Route path="message-tester" element={<MessageTester />} />
          <Route path="infrastructure" element={<Infrastructure />} />
          {role === 'admin' && <Route path="plugins" element={<Plugins />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </Suspense>
    </ToastProvider>
  );
}

function OpenwaApp() {
  return (
    <BrowserRouter basename="/_senderrr">
      <QueryClientProvider client={queryClient}>
        <RoleProvider>
          <OpenwaAppContent />
        </RoleProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

// ─── Router — detect which app based on path ─────────────────────

function AppContent() {
  const path = window.location.pathname;

  // WA Automation is the default app
  if (path.startsWith('/_senderrr')) {
    return <OpenwaApp />;
  }
  // Everything else (including / and /wa/*) goes to WA_Automation
  return <WaApp />;
}

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

export default App;
