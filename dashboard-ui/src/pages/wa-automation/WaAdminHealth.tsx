import { HeartPulse, QrCode, Activity } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { CardGridSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { useWaWorkersQuery, useWaAdminsQuery } from '../../hooks/wa-queries';
import { automationApi } from '../../services/wa-api';

interface WaAdmin {
  id: number;
  label: string;
  phoneNumber: string;
  sessionsPerAdmin: number;
  skipWarmup: boolean;
  warmUpStartedAt: string | null;
}

interface WaWorker {
  id: number;
  adminId: number;
  workerId: string;
  status: string;
  browserStatus: string;
  totalSent: number;
  totalFailed: number;
  lastError: string | null;
  openwaSessionId: string | null;
  openwaSessionStatus: string | null;
}

const workerStatusVariant = (status: string) => {
  switch (status) {
    case 'active': return 'success' as const;
    case 'idle': return 'info' as const;
    case 'error': case 'offline': return 'error' as const;
    default: return 'neutral' as const;
  }
};

export default function WaAdminHealth() {
  const { data: workers = [], isLoading: workersLoading } = useWaWorkersQuery();
  const { data: admins = [], isLoading: adminsLoading } = useWaAdminsQuery();
  const { success, error: showError } = useToast();

  const handleShowQr = async (sessionId: string) => {
    try {
      const result = await automationApi.getQr(sessionId);
      if (result.qr) {
        const win = window.open('', '_blank', 'width=400,height=400');
        if (win) {
          win.document.write(`<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc"><img src="${result.qr}" style="max-width:380px" /></body></html>`);
        }
      } else {
        showError('No QR available', 'Session may already be connected');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      showError('QR error', msg);
    }
  };

  const handleCheckSession = async (sessionId: string) => {
    try {
      const result = await automationApi.checkSession(sessionId);
      success(`Session ${sessionId}`, `Status: ${result.status}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      showError('Check failed', msg);
    }
  };

  const isLoading = workersLoading || adminsLoading;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Admin Health</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">Monitor worker session health and manage QR authentication</p>
      </div>

      {isLoading ? (
        <CardGridSkeleton count={admins.length || 3} />
      ) : admins.length === 0 ? (
        <Card>
          <CardBody>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <HeartPulse size={40} className="text-[var(--color-text-muted)] mb-3" />
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">No admins found</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Create admin accounts first to see health status</p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {admins.map((admin: WaAdmin) => {
            const adminWorkers = (workers as WaWorker[]).filter(w => w.adminId === admin.id);
            return (
              <Card key={admin.id}>
                <CardBody>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="font-semibold text-[var(--color-text)]">{admin.label}</h2>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                        {admin.phoneNumber} · {admin.sessionsPerAdmin} session(s)
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-[var(--color-text-muted)]">
                        Warm-up: {admin.skipWarmup ? 'Skipped' : admin.warmUpStartedAt ? new Date(admin.warmUpStartedAt).toLocaleDateString() : 'Not started'}
                      </p>
                      <Badge variant={adminWorkers.length > 0 ? 'success' : 'neutral'} className="mt-1">
                        {adminWorkers.length} worker{adminWorkers.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>

                  {adminWorkers.length === 0 ? (
                    <p className="text-sm text-[var(--color-text-muted)] py-3 text-center bg-[var(--color-bg-secondary)] rounded-lg">
                      No worker sessions registered for this admin
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {adminWorkers.map((w: WaWorker) => (
                        <div
                          key={w.id}
                          className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-xs font-semibold text-[var(--color-text)]">{w.workerId}</span>
                            <Badge variant={workerStatusVariant(w.status)}>{w.status}</Badge>
                          </div>

                          <div className="text-xs text-[var(--color-text-secondary)] space-y-1 mb-3">
                            <p>Browser: {w.browserStatus} · Sent: {w.totalSent} · Failed: {w.totalFailed}</p>
                            {w.lastError && (
                              <p className="text-red-500 truncate" title={w.lastError}>
                                Error: {w.lastError}
                              </p>
                            )}
                            {w.openwaSessionId && (
                              <p>Session: {w.openwaSessionId} ({w.openwaSessionStatus || 'unknown'})</p>
                            )}
                          </div>

                          {w.openwaSessionId && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                icon={QrCode}
                                onClick={() => handleShowQr(w.openwaSessionId!)}
                              >
                                Show QR
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                icon={Activity}
                                onClick={() => handleCheckSession(w.openwaSessionId!)}
                              >
                                Check
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
