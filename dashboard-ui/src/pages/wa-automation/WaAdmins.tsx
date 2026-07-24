import { useState, useCallback, useEffect } from 'react';
import { Plus, Play, Square, Trash2, Star, Download, QrCode, RefreshCw, AlertTriangle } from 'lucide-react';
import { DataTable } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Card, CardBody } from '../../components/ui/Card';
import { PageSkeleton } from '../../components/Skeleton';
import { QrSkeleton } from '../../components/ui/QrSkeleton';
import { useToast } from '../../components/Toast';
import { toUserMessage } from '../../services/error-handler';
import {
  useWaAdminsQuery,
  useCreateWaAdminMutation,
  useToggleWaAdminMutation,
  useToggleWarmupMutation,
  useAdminSessionsQuery,
  useCreateAdminSessionsMutation,
  useStartAdminSessionMutation,
  useStopAdminSessionMutation,
  useDeleteAdminSessionMutation,
  useAdminSessionQRQuery,
  useImportGroupsMutation,
  useImportCommunitiesMutation,
  useToggleSuperAdminMutation,
  useAllAdminSessionsQuery,
} from '../../hooks/wa-queries';
import type { ColumnDef } from '@tanstack/react-table';

interface Admin {
  id: number;
  label: string;
  phoneNumber: string;
  sessionsPerAdmin: number;
  totalSent: number;
  totalFailed: number;
  isActive: boolean;
  isSuperAdmin: boolean;
  skipWarmup: boolean;
  openwaSessionId: string | null;
}

interface AdminSession {
  id: number;
  adminId: number;
  sessionIndex: number;
  openwaSessionId: string;
  openwaSessionStatus: string;
  phone: string | null;
  pushName: string | null;
}

const sessionStatusVariant = (status: string) => {
  switch (status) {
    case 'ready': return 'success' as const;
    case 'qr_ready': return 'info' as const;
    case 'initializing':
    case 'authenticating': return 'warning' as const;
    case 'disconnected':
    case 'failed': return 'error' as const;
    default: return 'neutral' as const;
  }
};

export default function WaAdmins() {
  const { data: admins = [], isLoading, error } = useWaAdminsQuery();
  const { data: allSessions = [] } = useAllAdminSessionsQuery();
  const createAdminMutate = useCreateWaAdminMutation();
  const toggleMutate = useToggleWaAdminMutation();
  const createSessionsMutate = useCreateAdminSessionsMutation();
  const startMutate = useStartAdminSessionMutation();
  const stopMutate = useStopAdminSessionMutation();
  const deleteMutate = useDeleteAdminSessionMutation();
  const importGroupsMutate = useImportGroupsMutation();
  const importCommunitiesMutate = useImportCommunitiesMutation();
  const superAdminMutate = useToggleSuperAdminMutation();
  const warmupMutate = useToggleWarmupMutation();
  const { success, error: showError } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ label: '', phoneNumber: '', sessionsPerAdmin: 1, isSuperAdmin: false, autoCreateSession: true });
  const [expandedAdmin, setExpandedAdmin] = useState<number | null>(null);
  const [qrSlot, setQrSlot] = useState<{ adminId: number; slot: number } | null>(null);
  const [startingSlot, setStartingSlot] = useState<{ adminId: number; slot: number } | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  // Fetch sessions for expanded admin
  const { data: adminSessions = [] } = useAdminSessionsQuery(expandedAdmin ?? 0);
  // Poll QR when modal is open
  const { data: qrData } = useAdminSessionQRQuery(qrSlot?.adminId ?? 0, qrSlot?.slot ?? 0);

  // When start mutation completes, show QR or ready state
  useEffect(() => {
    if (startMutate.isSuccess && startingSlot) {
      const result = startMutate.data;
      if (result?.qrCode) {
        setQrSlot(startingSlot);
        // Close the starting state now that QR is shown
        setStartingSlot(null);
      } else {
        // No QR — session may already be ready
        setQrSlot(startingSlot);
        setStartingSlot(null);
      }
    }
  }, [startMutate.isSuccess, startMutate.data, startingSlot]);

  // When start mutation fails, show error in modal
  useEffect(() => {
    if (startMutate.isError && startingSlot) {
      setStartError(toUserMessage(startMutate.error));
    }
  }, [startMutate.isError, startMutate.error, startingSlot]);

  const handleToggle = useCallback(async (id: number) => {
    try {
      await toggleMutate.mutateAsync(id);
      success('Admin updated', 'Status toggled');
    } catch (e: unknown) {
      showError('Something went wrong', toUserMessage(e));
    }
  }, [toggleMutate, success, showError]);

  const handleCreate = async () => {
    try {
      const admin = await createAdminMutate.mutateAsync(form);
      success('Admin created', `${form.label} added successfully`);
      setModalOpen(false);
      setForm({ label: '', phoneNumber: '', sessionsPerAdmin: 1, isSuperAdmin: false, autoCreateSession: true });
      if (form.autoCreateSession) {
        await createSessionsMutate.mutateAsync(admin.id);
        setExpandedAdmin(admin.id);
      }
    } catch (e: unknown) {
      showError('Failed to create admin', toUserMessage(e));
    }
  };

  const handleCreateSessions = async (adminId: number) => {
    try {
      const result = await createSessionsMutate.mutateAsync(adminId);
      success('Sessions created', `${result.sessions.length} session(s) created for admin`);
      setExpandedAdmin(adminId);
    } catch (e: unknown) {
      showError('Failed to create sessions', toUserMessage(e));
    }
  };

  const handleStart = async (adminId: number, slot: number) => {
    // Immediately show loading state with QR skeleton
    setStartingSlot({ adminId, slot });
    setStartError(null);
    setQrSlot(null);
    try {
      await startMutate.mutateAsync({ adminId, slot });
      // QR modal is opened by the useEffect above
    } catch {
      // Error is handled by the useEffect above
    }
  };

  const handleStop = async (adminId: number, slot: number) => {
    try {
      await stopMutate.mutateAsync({ adminId, slot });
      success('Session stopped');
    } catch (e: unknown) {
      showError('Something went wrong', toUserMessage(e));
    }
  };

  const handleDelete = async (adminId: number, slot: number) => {
    try {
      await deleteMutate.mutateAsync({ adminId, slot });
      success('Session deleted');
    } catch (e: unknown) {
      showError('Something went wrong', toUserMessage(e));
    }
  };

  const handleSuperAdmin = async (id: number, current: boolean) => {
    try {
      await superAdminMutate.mutateAsync({ id, isSuperAdmin: !current });
      success(!current ? 'Super admin set' : 'Super admin removed');
    } catch (e: unknown) {
      showError('Something went wrong', toUserMessage(e));
    }
  };

  const handleImportGroups = async (adminId: number, slot: number) => {
    try {
      const result = await importGroupsMutate.mutateAsync({ adminId, slot });
      success('Groups imported', `${result.imported} new, ${result.skipped} already existed`);
    } catch (e: unknown) {
      showError('Failed to import groups', toUserMessage(e));
    }
  };

  const handleImportCommunities = async (adminId: number, slot: number) => {
    try {
      const result = await importCommunitiesMutate.mutateAsync({ adminId, slot });
      success('Communities imported', `${result.imported} new, ${result.skipped} already existed`);
    } catch (e: unknown) {
      showError('Failed to import communities', toUserMessage(e));
    }
  };

  const columns: ColumnDef<Admin, unknown>[] = [
    { accessorKey: 'label', header: 'Label', enableSorting: true },
    { accessorKey: 'phoneNumber', header: 'Phone' },
    { accessorKey: 'sessionsPerAdmin', header: 'Slots' },
    { accessorKey: 'totalSent', header: 'Sent' },
    { accessorKey: 'totalFailed', header: 'Failed' },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'success' : 'neutral'} dot>
          {row.original.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'sessionStatus',
      header: 'Session',
      cell: ({ row }) => {
        const adminSess = (allSessions as AdminSession[]).filter(s => s.adminId === row.original.id);
        if (adminSess.length === 0) return <Badge variant="neutral">No session</Badge>;
        const allReady = adminSess.every(s => s.openwaSessionStatus === 'ready');
        const anyReady = adminSess.some(s => s.openwaSessionStatus === 'ready');
        if (allReady) return <Badge variant="success" dot>Connected</Badge>;
        if (anyReady) return <Badge variant="warning" dot>Partial</Badge>;
        return <Badge variant="info">{adminSess[0].openwaSessionStatus}</Badge>;
      },
    },
    {
      id: 'warmup',
      header: 'Warmup',
      cell: ({ row }) => (
        <label
          className="relative inline-flex items-center cursor-pointer"
          title={row.original.skipWarmup ? 'Warmup disabled — full speed' : 'Warmup active — throttled sending'}
        >
          <input
            type="checkbox"
            checked={!row.original.skipWarmup}
            onChange={() => warmupMutate.mutate(row.original.id)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-[var(--color-bg-secondary)] rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500 border border-[var(--color-border)]"></div>
          <span className="ms-2 text-xs text-[var(--color-text-muted)]">
            {row.original.skipWarmup ? 'Off' : 'On'}
          </span>
        </label>
      ),
    },
    {
      id: 'superAdmin',
      header: 'Super',
      cell: ({ row }) => (
        <button
          onClick={() => handleSuperAdmin(row.original.id, row.original.isSuperAdmin)}
          className={`p-1 rounded-lg transition-colors cursor-pointer ${
            row.original.isSuperAdmin
              ? 'text-amber-500 hover:text-amber-600'
              : 'text-[var(--color-text-muted)] hover:text-amber-400'
          }`}
          title={row.original.isSuperAdmin ? 'Remove super admin' : 'Make super admin'}
        >
          <Star size={16} fill={row.original.isSuperAdmin ? 'currentColor' : 'none'} />
        </button>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => handleToggle(row.original.id)}>
            {row.original.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpandedAdmin(expandedAdmin === row.original.id ? null : row.original.id)}
          >
            Sessions
          </Button>
        </div>
      ),
    },
  ];

  if (isLoading) return <PageSkeleton />;
  if (error) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="bg-[var(--color-danger-light)] border border-[var(--color-danger)]/20 rounded-xl p-5 flex items-start gap-3">
          <AlertTriangle size={20} className="text-[var(--color-danger)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-[var(--color-danger)]">
              {toUserMessage(error)}
            </p>
            <p className="text-xs text-[var(--color-danger)]/70 mt-1">
              Please try again. If the problem persists, contact support.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Admin Accounts</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Manage admin accounts, WhatsApp sessions, and super admin assignments
        </p>
      </div>

      <DataTable
        columns={columns}
        data={admins}
        searchable
        searchKeys={['label', 'phoneNumber']}
        paginated
        loading={isLoading}
        emptyMessage="No admin accounts found. Create one to get started."
        actions={
          <Button icon={Plus} onClick={() => setModalOpen(true)}>
            Add Admin
          </Button>
        }
      />

      {/* ─── Expanded Session Panel ──────────────────────────── */}
      {expandedAdmin && (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
                Sessions for Admin #{expandedAdmin}
              </h2>
              <div className="flex gap-2">
                {adminSessions.length > 0 && (
                  <>
                    <Button size="sm" variant="secondary" icon={Download} onClick={() => handleImportGroups(expandedAdmin, 0)}>
                      Import Groups
                    </Button>
                    <Button size="sm" variant="secondary" icon={Download} onClick={() => handleImportCommunities(expandedAdmin, 0)}>
                      Import Communities
                    </Button>
                  </>
                )}
                <Button size="sm" icon={RefreshCw} onClick={() => handleCreateSessions(expandedAdmin)}>
                  Create Sessions
                </Button>
              </div>
            </div>

            {adminSessions.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">
                No sessions created yet. Click "Create Sessions" to set up OpenWA sessions for this admin's slots.
              </p>
            ) : (
              <div className="space-y-3">
                {(adminSessions as AdminSession[]).map(s => {
                  const isReady = s.openwaSessionStatus === 'ready';
                  const isRunning = ['initializing', 'authenticating', 'qr_ready'].includes(s.openwaSessionStatus);
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-ghost)] flex items-center justify-center text-[var(--color-primary)] font-mono text-xs font-bold">
                          {s.sessionIndex}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--color-text)]">
                            Slot {s.sessionIndex} — {s.openwaSessionId?.slice(0, 8)}...
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={sessionStatusVariant(s.openwaSessionStatus)} dot>
                              {s.openwaSessionStatus}
                            </Badge>
                            {s.phone && (
                              <span className="text-xs text-[var(--color-text-muted)]">
                                {s.phone} {s.pushName ? `· ${s.pushName}` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isRunning && !isReady && (
                          <Button size="sm" icon={Play} onClick={() => handleStart(expandedAdmin, s.sessionIndex)}>
                            Start
                          </Button>
                        )}
                        {isRunning && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={QrCode}
                              onClick={() => setQrSlot({ adminId: expandedAdmin, slot: s.sessionIndex })}
                            >
                              Show QR
                            </Button>
                            <Button size="sm" variant="secondary" icon={Square} onClick={() => handleStop(expandedAdmin, s.sessionIndex)}>
                              Stop
                            </Button>
                          </>
                        )}
                        {isReady && (
                          <>
                            <Button size="sm" variant="secondary" icon={Square} onClick={() => handleStop(expandedAdmin, s.sessionIndex)}>
                              Stop
                            </Button>
                            <Button size="sm" variant="secondary" icon={Download} onClick={() => handleImportGroups(expandedAdmin, s.sessionIndex)}>
                              Groups
                            </Button>
                            <Button size="sm" variant="secondary" icon={Download} onClick={() => handleImportCommunities(expandedAdmin, s.sessionIndex)}>
                              Communities
                            </Button>
                          </>
                        )}
                        {!isRunning && (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Trash2}
                            onClick={() => handleDelete(expandedAdmin, s.sessionIndex)}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* ─── Create Admin Modal ──────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Admin">
        <ModalBody>
          <Input
            label="Label"
            value={form.label}
            onChange={e => setForm({ ...form, label: e.target.value })}
            placeholder="e.g., Marketing Admin"
          />
          <Input
            label="Phone Number"
            value={form.phoneNumber}
            onChange={e => setForm({ ...form, phoneNumber: e.target.value })}
            placeholder="e.g., 1234567890"
          />
          <Input
            label="Sessions per Admin"
            type="number"
            min={1}
            max={4}
            value={form.sessionsPerAdmin}
            onChange={e => setForm({ ...form, sessionsPerAdmin: parseInt(e.target.value) || 1 })}
          />
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoCreateSession}
              onChange={e => setForm({ ...form, autoCreateSession: e.target.checked })}
              className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]/30"
            />
            <span className="text-sm text-[var(--color-text-secondary)]">
              Auto-create sessions and show QR
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isSuperAdmin}
              onChange={e => setForm({ ...form, isSuperAdmin: e.target.checked })}
              className="w-4 h-4 rounded border-[var(--color-border)] text-amber-500 focus:ring-amber-500/30"
            />
            <span className="text-sm text-[var(--color-text-secondary)]">
              Mark as super admin
            </span>
          </label>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} loading={createAdminMutate.isPending}>Create</Button>
        </ModalFooter>
      </Modal>

      {/* ─── QR Code Modal (shows skeleton immediately on start) ─── */}
      <Modal open={!!qrSlot || !!startingSlot} onClose={() => { setQrSlot(null); setStartingSlot(null); setStartError(null); }} title="Scan QR Code" size="sm">
        <ModalBody>
          {/* Loading skeleton — shown immediately when start is clicked */}
          {startingSlot && !qrData && !startError && (
            <QrSkeleton message="Starting session and generating QR code..." />
          )}

          {/* Error state */}
          {startError && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
                <AlertTriangle size={28} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--color-danger)]">Could not start session</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">{startError}</p>
              </div>
            </div>
          )}

          {/* QR code ready to scan */}
          {qrData && qrData.qrCode && !startingSlot && (
            <div className="text-center space-y-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 inline-block mx-auto">
                <img src={qrData.qrCode} alt="WhatsApp QR Code" className="w-64 h-64" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">Scan with WhatsApp</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  Open WhatsApp on your phone → Menu → Linked Devices → Link a Device
                </p>
              </div>
              {qrData.status !== 'ready' && (
                <div className="flex items-center justify-center gap-2 text-xs text-[var(--color-text-muted)]">
                  <RefreshCw size={12} className="animate-spin" />
                  Waiting for scan...
                </div>
              )}
            </div>
          )}

          {/* Already connected */}
          {qrData?.status === 'ready' && !startingSlot && (
            <div className="text-center py-8 space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
                <QrCode size={28} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-sm font-medium text-[var(--color-text)]">Session Connected</p>
              <p className="text-xs text-[var(--color-text-secondary)]">QR code scanned successfully</p>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => { setQrSlot(null); setStartingSlot(null); setStartError(null); }}>Close</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
