import { useState } from 'react';
import { Plus, Send, Building2, Download } from 'lucide-react';
import { Card, CardBody, CardFooter } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { CardGridSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import {
  useWaCommunitiesQuery,
  useCreateWaCommunityMutation,
  useCommunityBroadcastMutation,
  useImportCommunitiesMutation,
  useAllAdminSessionsQuery,
} from '../../hooks/wa-queries';

export default function WaCommunities() {
  const { data: communities = [], isLoading } = useWaCommunitiesQuery();
  const createMutate = useCreateWaCommunityMutation();
  const broadcastMutate = useCommunityBroadcastMutation();
  const importCommunitiesMutate = useImportCommunitiesMutation();
  const { success, error: showError } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', communityJid: '' });

  // ─── Import from session ──────────────────────────────────
  const { data: allSessions = [] } = useAllAdminSessionsQuery();
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
      const result = await importCommunitiesMutate.mutateAsync({ adminId: session.adminId, slot: session.sessionIndex });
      success('Communities imported', `${result.imported} new, ${result.skipped} already existed`);
    } catch (e: any) {
      showError('Failed to import communities', e.message);
    }
  };

  const handleCreate = async () => {
    try {
      await createMutate.mutateAsync(form);
      success('Community created', `${form.name} added successfully`);
      setModalOpen(false);
      setForm({ name: '', communityJid: '' });
    } catch (e: any) {
      showError('Failed to create community', e.message);
    }
  };

  const handleBroadcast = async (id: number, name: string) => {
    try {
      const result = await broadcastMutate.mutateAsync(id);
      success('Broadcast triggered', `Sent to ${result.affectedGroups} groups in ${name}`);
    } catch (e: any) {
      showError('Broadcast failed', e.message);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Communities</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Manage WhatsApp communities and trigger broadcasts
          </p>
        </div>
        <div className="flex items-center gap-2">
          {connectedAdmins.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={importSessionId ?? ''}
                onChange={e => setImportSessionId(e.target.value ? parseInt(e.target.value) : null)}
                className="px-3 py-2 text-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
              >
                <option value="">Select connected admin...</option>
                {connectedAdmins.map((s: any) => (
                  <option key={s.adminId} value={s.adminId}>Admin #{s.adminId}</option>
                ))}
              </select>
              <Button size="sm" variant="secondary" icon={Download} onClick={handleImport} loading={importCommunitiesMutate.isPending}>
                Import
              </Button>
            </div>
          )}
          <Button icon={Plus} onClick={() => setModalOpen(true)}>Add Community</Button>
        </div>
      </div>

      {isLoading ? (
        <CardGridSkeleton count={4} />
      ) : communities.length === 0 ? (
        <Card>
          <CardBody>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Building2 size={40} className="text-[var(--color-text-muted)] mb-3 opacity-40" />
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">No communities yet</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Create your first community or import from a connected admin</p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {communities.map((c: any) => (
            <Card key={c.id} hover>
              <CardBody>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--color-primary-ghost)] flex items-center justify-center flex-shrink-0 text-[var(--color-primary)]">
                    <Building2 size={16} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-[var(--color-text)]">{c.name}</h3>
                    <p className="text-xs text-[var(--color-text-muted)] font-mono mt-0.5">{c.communityJid}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
                  <span>Sent: <strong>{c.totalSent}</strong></span>
                  <span>Failed: <strong>{c.totalFailed}</strong></span>
                  {c.totalFailed > 0 && <Badge variant="error">{c.totalFailed} failed</Badge>}
                </div>
              </CardBody>
              <CardFooter>
                <Button size="sm" icon={Send} onClick={() => handleBroadcast(c.id, c.name)} loading={broadcastMutate.isPending}>
                  Broadcast
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Community">
        <ModalBody>
          <Input label="Community Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Tech News" />
          <Input label="Community JID" value={form.communityJid} onChange={e => setForm({ ...form, communityJid: e.target.value })} placeholder="e.g., 1234567890-123456@g.us" />
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} loading={createMutate.isPending}>Create</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
