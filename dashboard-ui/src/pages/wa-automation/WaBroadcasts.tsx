import { useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw, Radio, ChevronLeft, ChevronRight as ChevRight, Pencil, Trash2 } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { PageSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import {
  useWaBroadcastsQuery,
  useWaBroadcastQuery,
  useRetryBroadcastMutation,
  useRetryAllBroadcastsMutation,
  useEditBroadcastMutation,
  useDeleteBroadcastMutation,
} from '../../hooks/wa-queries';
import type { ApiBroadcast, ApiBroadcastTask } from '../../services/wa-api';

const STATUSES = ['all', 'pending', 'in_progress', 'completed', 'partial', 'failed'] as const;

const statusVariant = (status: string) => {
  switch (status) {
    case 'completed': return 'success' as const;
    case 'failed': return 'error' as const;
    case 'in_progress': case 'processing': return 'info' as const;
    case 'pending': return 'warning' as const;
    case 'cancelled': return 'neutral' as const;
    default: return 'neutral' as const;
  }
};

const taskStatusVariant = (status: string) => {
  switch (status) {
    case 'sent': return 'success' as const;
    case 'failed': return 'error' as const;
    case 'in_progress': return 'info' as const;
    default: return 'neutral' as const;
  }
};

const statusLabel: Record<string, string> = {
  all: 'All',
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  partial: 'Partial',
  failed: 'Failed',
};

export default function WaBroadcasts() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const limit = 25;
  const { data: result, isLoading } = useWaBroadcastsQuery(page, statusFilter === 'all' ? undefined : statusFilter);
  const broadcasts = result?.data || [];
  const total = result?.total || 0;
  const totalPages = Math.ceil(total / limit);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: selected } = useWaBroadcastQuery(selectedId ?? 0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const retryMutate = useRetryBroadcastMutation();
  const retryAllMutate = useRetryAllBroadcastsMutation();
  const editMutate = useEditBroadcastMutation();
  const deleteMutate = useDeleteBroadcastMutation();
  const { success, error: showError } = useToast();

  const handleRetry = async (id: number) => {
    try {
      const retried = await retryMutate.mutateAsync(id);
      success('Retry initiated', `Retrying ${retried.retried} failed messages`);
    } catch (e: unknown) {
      showError('Retry failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const switchFilter = (s: string) => {
    setStatusFilter(s);
    setPage(1);
    setSelectedId(null);
  };

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Broadcasts</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {total} total · Page {page} of {totalPages || 1} · Broadcast #0 is on the last page
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={RotateCcw}
          onClick={async () => {
            try {
              const result = await retryAllMutate.mutateAsync();
              success('Retry all', `Retrying ${result.retried} tasks across ${result.broadcasts} broadcasts`);
            } catch (e: unknown) {
              showError('Retry all failed', e instanceof Error ? e.message : 'Unknown error');
            }
          }}
          disabled={retryAllMutate.isPending}
        >
          {retryAllMutate.isPending ? 'Retrying...' : 'Retry All Failed'}
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => switchFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              statusFilter === s
                ? 'bg-[var(--color-text)] text-[var(--color-bg)]'
                : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
            }`}
          >
            {statusLabel[s]}
          </button>
        ))}
      </div>

      {broadcasts.length === 0 ? (
        <Card>
          <CardBody>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Radio size={40} className="text-[var(--color-text-muted)] mb-3" />
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">No broadcasts yet</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Broadcasts appear here when triggered from communities or the API</p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {broadcasts.map((b: ApiBroadcast, idx: number) => {
            const displayNumber = total - 1 - (page - 1) * limit - idx;
            return (
              <Card key={b.id} hover>
                <button
                  onClick={() => setSelectedId(selectedId === b.id ? null : b.id)}
                  className="w-full text-left cursor-pointer"
                >
                  <div className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {selectedId === b.id ? <ChevronDown size={16} className="text-[var(--color-text-muted)] flex-shrink-0" /> : <ChevronRight size={16} className="text-[var(--color-text-muted)] flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text)] truncate">
                          #{displayNumber} — {b.article?.title || `Advertisement #${b.advertisementId || 'N/A'}`}
                          {(b.editHistory?.length ?? 0) > 0 && <span className="ml-2 text-xs text-[var(--color-text-muted)] italic">(edited)</span>}
                        </p>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                          {new Date(b.createdAt).toLocaleString()} · {b.totalMessages} messages
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      <span className="text-xs text-[var(--color-text-secondary)]">S: {b.sentCount} / F: {b.failedCount}</span>
                      <Badge variant={statusVariant(b.status)}>{b.status}</Badge>
                      {(b.failedCount > 0 || b.status === 'failed') && (
                        <Button size="sm" variant="ghost" icon={RotateCcw} onClick={e => { e.stopPropagation(); handleRetry(b.id); }}>
                          Retry
                        </Button>
                      )}
                      {b.status !== 'cancelled' && (
                        <>
                          <Button size="sm" variant="ghost" icon={Pencil} onClick={e => { e.stopPropagation(); setEditingId(b.id); setEditText(b.messageText || ''); }}>
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" icon={Trash2} onClick={e => {
                            e.stopPropagation();
                            if (window.confirm(`Delete broadcast #${displayNumber}? This will permanently remove the message from all WhatsApp groups.`)) {
                              deleteMutate.mutateAsync(b.id)
                                .then(r => success('Deleted', `${r.deleted} messages removed from WhatsApp`))
                                .catch((e: unknown) => showError('Delete failed', e instanceof Error ? e.message : 'Unknown error'));
                            }
                          }}>
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </button>

                {selectedId === b.id && selected && (
                  <div className="border-t border-[var(--color-border-light)] px-5 py-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-3">
                      Message Tasks ({selected.tasks.length})
                    </h3>
                    {selected.tasks.length === 0 ? (
                      <p className="text-sm text-[var(--color-text-muted)]">No task data available</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-[var(--color-bg-secondary)]">
                              <th className="px-3 py-2 text-left font-semibold text-[var(--color-text-secondary)]">Group</th>
                              <th className="px-3 py-2 text-left font-semibold text-[var(--color-text-secondary)]">Admin</th>
                              <th className="px-3 py-2 text-left font-semibold text-[var(--color-text-secondary)]">Status</th>
                              <th className="px-3 py-2 text-left font-semibold text-[var(--color-text-secondary)]">Attempts</th>
                              <th className="px-3 py-2 text-left font-semibold text-[var(--color-text-secondary)]">Error</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selected.tasks.map((t: ApiBroadcastTask) => (
                              <tr key={t.id} className="border-t border-[var(--color-border-light)]">
                                <td className="px-3 py-2">{t.group?.name || t.groupId}</td>
                                <td className="px-3 py-2">{t.admin?.label || '-'}</td>
                                <td className="px-3 py-2">
                                  <Badge variant={taskStatusVariant(t.status)}>{t.status}</Badge>
                                </td>
                                <td className="px-3 py-2 text-[var(--color-text-secondary)]">{t.attemptCount}/{t.maxAttempts}</td>
                                <td className="px-3 py-2 text-red-500 max-w-[200px] truncate" title={t.errorMessage ?? undefined}>{t.errorMessage || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm text-[var(--color-text-secondary)] px-3">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevRight size={18} />
          </button>
        </div>
      )}

      {/* Edit modal */}
      {editingId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditingId(null)}>
          <div className="bg-[var(--color-bg)] rounded-xl p-6 w-full max-w-lg mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Edit Broadcast Message</h2>
            <textarea
              className="w-full h-32 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-secondary)] text-sm resize-y text-[var(--color-text)]"
              value={editText}
              onChange={e => setEditText(e.target.value)}
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Supports WhatsApp Markdown formatting</p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  try {
                    const result = await editMutate.mutateAsync({ id: editingId, messageText: editText });
                    success('Edited', `${result.edited} messages updated across WhatsApp groups`);
                    setEditingId(null);
                  } catch (e: unknown) {
                    showError('Edit failed', e instanceof Error ? e.message : 'Unknown error');
                  }
                }}
                disabled={editMutate.isPending || !editText.trim()}
              >
                {editMutate.isPending ? 'Editing...' : 'Save & Update'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
