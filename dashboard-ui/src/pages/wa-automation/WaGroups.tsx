import { useState, useCallback, useEffect } from 'react';
import { Plus, Download, Target, ChevronDown, ChevronRight } from 'lucide-react';
import { DataTable } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { ComboBox } from '../../components/ui/ComboBox';
import { PageSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import {
  useWaGroupsQuery,
  useWaCommunitiesQuery,
  useCreateWaGroupMutation,
  useToggleWaGroupMutation,
  useMarkGroupHealthyMutation,
  useLinkGroupCommunityMutation,
  useUnlinkGroupCommunityMutation,
  useSetGroupTargetsMutation,
  useImportGroupsMutation,
  useAllAdminSessionsQuery,
} from '../../hooks/wa-queries';
import type { ColumnDef } from '@tanstack/react-table';

interface Group {
  id: number;
  name: string;
  groupJid: string;
  community?: { id: number; name: string } | null;
  totalSent: number;
  totalFailed: number;
  isHealthy: boolean;
  isActive: boolean;
  isTargeted: boolean;
}

export default function WaGroups() {
  const { data: groups = [], isLoading } = useWaGroupsQuery();
  const { data: communities = [] } = useWaCommunitiesQuery();
  const createMutate = useCreateWaGroupMutation();
  const toggleMutate = useToggleWaGroupMutation();
  const markHealthyMutate = useMarkGroupHealthyMutation();
  const linkMutate = useLinkGroupCommunityMutation();
  const unlinkMutate = useUnlinkGroupCommunityMutation();
  const setTargetsMutate = useSetGroupTargetsMutation();
  const { success, error: showError } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', groupJid: '' });
  const [linkTarget, setLinkTarget] = useState<Group | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<Group[]>([]);
  const [importExpanded, setImportExpanded] = useState(false);

  // Pre-populate selected targets from server data (only on initial load)
  useEffect(() => {
    setSelectedTargets(groups.filter((g: Group) => g.isTargeted));
  }, [groups]);

  const handleSaveTargets = async () => {
    try {
      await setTargetsMutate.mutateAsync(selectedTargets.map(g => g.id));
      setSelectedTargets([]);
      success('Targets saved', `${selectedTargets.length} group(s) will receive article broadcasts`);
    } catch (e: any) {
      showError('Failed to save targets', e.message);
    }
  };

  const handleRemoveTarget = async (group: Group) => {
    const updated = selectedTargets.filter(g => g.id !== group.id);
    setSelectedTargets(updated);
    try {
      await setTargetsMutate.mutateAsync(updated.map(g => g.id));
    } catch (e: any) {
      showError('Failed to remove target', e.message);
    }
  };

  // ─── Import from session ──────────────────────────────────
  const { data: allSessions = [] } = useAllAdminSessionsQuery();
  const importMutate = useImportGroupsMutation();
  const [importSessionId, setImportSessionId] = useState<number | null>(null);

  const connectedAdmins = allSessions
    .filter((s: any) => s.openwaSessionStatus === 'ready')
    .reduce((acc: any[], s: any) => {
      if (!acc.find((a: any) => a.adminId === s.adminId)) {
        acc.push({ adminId: s.adminId, sessionIndex: s.sessionIndex });
      }
      return acc;
    }, []);

  const handleImport = async () => {
    if (!importSessionId) return;
    const session = connectedAdmins.find((s: any) => s.adminId === importSessionId);
    if (!session) return;
    try {
      const result = await importMutate.mutateAsync({ adminId: session.adminId, slot: session.sessionIndex });
      success('Groups imported', `${result.imported} new, ${result.skipped} already existed`);
    } catch (e: any) {
      showError('Failed to import groups', e.message);
    }
  };

  const handleToggle = useCallback(async (id: number) => {
    await toggleMutate.mutateAsync(id);
    success('Group updated', 'Status toggled');
  }, [toggleMutate, success]);

  const handleMarkHealthy = useCallback(async (id: number) => {
    await markHealthyMutate.mutateAsync(id);
    success('Group marked healthy');
  }, [markHealthyMutate, success]);

  const handleUnlink = useCallback(async (id: number) => {
    await unlinkMutate.mutateAsync(id);
    success('Group unlinked from community');
  }, [unlinkMutate, success]);

  const handleCreate = async () => {
    try {
      await createMutate.mutateAsync(form);
      success('Group created', `${form.name} added successfully`);
      setModalOpen(false);
      setForm({ name: '', groupJid: '' });
    } catch (e: any) {
      showError('Failed to create group', e.message);
    }
  };

  const columns: ColumnDef<Group, unknown>[] = [
    { accessorKey: 'name', header: 'Name', enableSorting: true },
    {
      accessorKey: 'groupJid',
      header: 'JID',
      cell: ({ row }) => <span className="text-xs text-[var(--color-text-secondary)] font-mono">{row.original.groupJid}</span>,
    },
    {
      accessorKey: 'community',
      header: 'Community',
      cell: ({ row }) => <span className="text-xs">{row.original.community?.name || '-'}</span>,
    },
    { accessorKey: 'totalSent', header: 'Sent' },
    { accessorKey: 'totalFailed', header: 'Failed' },
    {
      accessorKey: 'isHealthy',
      header: 'Health',
      cell: ({ row }) => (
        <Badge variant={row.original.isHealthy ? 'success' : 'error'}>
          {row.original.isHealthy ? 'Healthy' : 'Unhealthy'}
        </Badge>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'success' : 'neutral'}>
          {row.original.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => handleToggle(row.original.id)}>
            {row.original.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          {!row.original.isHealthy && (
            <Button size="sm" variant="ghost" onClick={() => handleMarkHealthy(row.original.id)}>
              Mark Healthy
            </Button>
          )}
          {row.original.community ? (
            <Button size="sm" variant="ghost" onClick={() => handleUnlink(row.original.id)}>
              Unlink
            </Button>
          ) : (
            communities.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setLinkTarget(row.original)}>
                Link Community
              </Button>
            )
          )}
          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => handleRemoveTarget(row.original)}>
            Remove
          </Button>
        </div>
      ),
    },
  ];

  if (isLoading) return <PageSkeleton />;

  const targetedGroups = groups.filter((g: Group) => g.isTargeted);
  const untargetedGroups = groups.filter((g: Group) => !g.isTargeted);

  const comboOptions = untargetedGroups.map((g: Group) => ({
    value: String(g.id),
    label: g.name,
    sublabel: g.groupJid,
  }));

  const selectedTargetsMapped = selectedTargets.map((g: Group) => ({
    value: String(g.id),
    label: g.name,
    sublabel: g.groupJid,
  }));

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* ─── Page Header ───────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">WhatsApp Groups</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {targetedGroups.length} of {groups.length} group(s) targeted
          </p>
        </div>
        <Button icon={Plus} onClick={() => setModalOpen(true)}>
          Add Group
        </Button>
      </div>

      {/* ─── Target Selection ─────────────────────────────── */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Target Selection</h2>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              Choose which groups receive article broadcasts. Only targeted groups will receive future articles.
            </p>
          </div>
          <Button
            size="sm"
            icon={Target}
            onClick={handleSaveTargets}
            loading={setTargetsMutate.isPending}
          >
            Save Targets
          </Button>
        </div>

        <div className="relative">
          <ComboBox
            label="Search and select groups to target"
            placeholder="Type to search groups..."
            options={comboOptions}
            selected={selectedTargetsMapped}
            onChange={(opts) => {
              const groupsMap = new Map(groups.map((g: Group) => [String(g.id), g]));
              setSelectedTargets(opts.map(o => groupsMap.get(o.value)!).filter(Boolean));
            }}
            emptyMessage="No groups match your search"
          />
          {selectedTargets.length > 0 && (
            <span className="absolute right-0 top-0 -mt-0.5 inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full
              bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              {selectedTargets.length} selected
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          {selectedTargets.length > 0 ? (
            <p className="text-xs text-[var(--color-text-secondary)]">
              {selectedTargets.length} group(s) selected to receive article broadcasts
            </p>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">
              No groups selected — articles will not be sent until you add targets
            </p>
          )}
        </div>

        {/* ─── Collapsible Import ──────────────────────────── */}
        {connectedAdmins.length > 0 && (
          <>
            <hr className="border-[var(--color-border)]" />
            <div>
              <button
                type="button"
                onClick={() => setImportExpanded(v => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)]
                  hover:text-[var(--color-text)] transition-colors cursor-pointer"
              >
                {importExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Import Groups from WhatsApp
              </button>
              {importExpanded && (
                <div className="flex items-center gap-2 mt-3">
                  <select
                    value={importSessionId ?? ''}
                    onChange={e => setImportSessionId(e.target.value ? parseInt(e.target.value) : null)}
                    className="flex-1 px-3 py-2 text-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl
                      text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                  >
                    <option value="">Select a connected admin...</option>
                    {connectedAdmins.map((s: any) => (
                      <option key={s.adminId} value={s.adminId}>Admin #{s.adminId}</option>
                    ))}
                  </select>
                  <Button size="sm" variant="secondary" icon={Download} onClick={handleImport} loading={importMutate.isPending}>
                    Import
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ─── Targeted Groups Table ─────────────────────────── */}
      <DataTable
        columns={columns}
        data={targetedGroups}
        paginated
        emptyMessage={
          groups.length === 0
            ? 'No groups registered. Import groups from a connected WhatsApp admin or add one manually.'
            : 'No groups targeted yet. Use the selector above to choose which groups receive broadcasts.'
        }
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Group">
        <ModalBody>
          <Input label="Group Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Marketing Team" />
          <Input label="Group JID" value={form.groupJid} onChange={e => setForm({ ...form, groupJid: e.target.value })} placeholder="e.g., 1234567890-123456@g.us" />
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} loading={createMutate.isPending}>Add</Button>
        </ModalFooter>
      </Modal>

      {linkTarget && (
        <Modal open={!!linkTarget} onClose={() => setLinkTarget(null)} title={`Link ${linkTarget.name}`}>
          <ModalBody>
            <Select
              label="Community"
              placeholder="Select a community..."
              options={communities.map((c: any) => ({ value: String(c.id), label: c.name }))}
              onChange={e => {
                const communityId = parseInt(e.target.value);
                if (communityId) {
                  linkMutate.mutateAsync({ groupId: linkTarget.id, communityId });
                  setLinkTarget(null);
                  success('Group linked to community');
                }
              }}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setLinkTarget(null)}>Cancel</Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
