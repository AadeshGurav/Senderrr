import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, ShieldUser, Users, FileText, Search, Send, Activity, CheckCircle, Wifi } from 'lucide-react';
import { StatCard } from '../../components/ui/StatCard';
import { Card, CardBody } from '../../components/ui/Card';
import { StatCardSkeleton, CardGridSkeleton } from '../../components/Skeleton';
import { useWaDashboardStatsQuery } from '../../hooks/wa-queries';

export default function WaDashboard() {
  const navigate = useNavigate();
  const { data: stats, isLoading, error } = useWaDashboardStatsQuery();

  const deliveryColor = (rate: number) => {
    if (rate >= 95) return 'text-emerald-500';
    if (rate >= 80) return 'text-amber-500';
    return 'text-red-500';
  };

  const statCards = [
    { label: 'Active Admins', value: stats?.activeAdmins ?? 0, icon: ShieldUser },
    { label: 'Targeted Groups', value: stats?.activeGroups ?? 0, icon: Users },
    { label: 'Messages Sent', value: stats?.totalSent ?? 0, icon: Send },
    { label: 'Delivery Rate', value: `${stats?.deliveryRate ?? 100}%`, icon: CheckCircle, valueClass: deliveryColor(stats?.deliveryRate ?? 100) },
    { label: 'Sessions Ready', value: `${stats?.readySessions ?? 0}/${stats?.totalSessions ?? 0}`, icon: Wifi },
    { label: 'Articles Scraped', value: stats?.scrapedArticles ?? 0, icon: FileText },
  ];

  const quickActions = [
    { label: 'Manage Admins', path: '/wa/admins', icon: ShieldUser, description: 'Add or manage admin accounts' },
    { label: 'View Groups', path: '/wa/groups', icon: Users, description: 'Monitor WhatsApp groups' },
    { label: 'Broadcasts', path: '/wa/broadcasts', icon: Radio, description: 'View broadcast history' },
    { label: 'Run Scraper', path: '/wa/scraper', icon: Search, description: 'Scrape new articles' },
    { label: 'Templates', path: '/wa/templates', icon: FileText, description: 'Manage message templates' },
    { label: 'Admin Health', path: '/wa/admin-health', icon: Activity, description: 'Check session health' },
  ];

  const systemInfo = [
    'Scraper runs every 5 minutes during active hours',
    'Failed messages are retried up to 3 times with exponential backoff',
    'Unhealthy groups auto-recover after 2 hours of downtime',
    'Heartbeat checks session health every 5 minutes',
    'Group sync runs every 30 minutes automatically',
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Dashboard</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Overview of your WhatsApp automation system
        </p>
      </div>

      {error && (
        <div className="bg-[var(--color-danger-light)] border border-[var(--color-danger)]/20 text-[var(--color-danger)] px-4 py-3 rounded-xl text-sm">
          Failed to load dashboard data. The API may be unavailable.
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
          : statCards.map(s => (
              <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} />
            ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <Card>
          <CardBody>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-4 flex items-center gap-2">
              <LayoutDashboard size={14} />
              Quick Actions
            </h2>
            {isLoading ? (
              <CardGridSkeleton count={3} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {quickActions.map(action => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.path}
                      onClick={() => navigate(action.path)}
                      className="flex items-start gap-3 p-3 rounded-xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 hover:shadow-[var(--shadow-sm)] transition-all text-left cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-lg bg-[var(--color-primary-ghost)] flex items-center justify-center flex-shrink-0 text-[var(--color-primary)]">
                        <Icon size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text)]">{action.label}</p>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                          {action.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        {/* System Info */}
        <Card>
          <CardBody>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-4 flex items-center gap-2">
              <Activity size={14} />
              System Information
            </h2>
            <ul className="space-y-3">
              {systemInfo.map((info, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-sm text-[var(--color-text-secondary)]"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] mt-1.5 flex-shrink-0" />
                  {info}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
