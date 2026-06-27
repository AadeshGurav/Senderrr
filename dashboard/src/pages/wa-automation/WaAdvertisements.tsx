import { useState } from 'react';
import { Megaphone, Trash2, Play, Image, Plus } from 'lucide-react';
import { Card, CardBody, CardFooter } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/Modal';
import { CardGridSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { useWaAdvertisementsQuery, useDeleteAdMutation, useSendAdMutation } from '../../hooks/wa-queries';
import { templateApi } from '../../services/wa-api';

const statusVariant = (status: string) => {
  switch (status) {
    case 'active': return 'success' as const;
    case 'draft': return 'neutral' as const;
    case 'completed': return 'info' as const;
    default: return 'warning' as const;
  }
};

const targetTypes = [
  { value: 'all_groups', label: 'All Groups' },
  { value: 'all_communities', label: 'All Communities' },
  { value: 'specific', label: 'Specific Targets' },
];

export default function WaAdvertisements() {
  const { data: ads = [], isLoading } = useWaAdvertisementsQuery();
  const deleteMutate = useDeleteAdMutation();
  const sendMutate = useSendAdMutation();
  const { success, error: showError } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const [sendTarget, setSendTarget] = useState<{ id: number; title: string } | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    body: '',
    targetType: 'all_groups' as string,
    targetGroups: [] as number[],
    targetCommunities: [] as number[],
    packageDays: 1,
    preferredTime: '',
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutate.mutateAsync(deleteTarget.id);
      success('Advertisement deleted', `"${deleteTarget.title}" removed`);
      setDeleteTarget(null);
    } catch (e: any) {
      showError('Failed to delete advertisement', e.message);
    }
  };

  const handleSend = async () => {
    if (!sendTarget) return;
    try {
      const res = await sendMutate.mutateAsync(sendTarget.id);
      success('Advertisement queued', res.message);
      setSendTarget(null);
    } catch (e: any) {
      showError('Failed to send advertisement', e.message);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const targetData = {
        targetType: formData.targetType,
        targetGroups: formData.targetType === 'specific' ? formData.targetGroups : undefined,
        targetCommunities: formData.targetType === 'specific' ? formData.targetCommunities : undefined,
        packageDays: formData.packageDays,
        preferredTime: formData.preferredTime || null,
      };

      await templateApi.createAd({
        title: formData.title,
        body: formData.body,
        ...targetData,
      });

      success('Advertisement created');
      setShowForm(false);
      setFormData({
        title: '',
        body: '',
        targetType: 'all_groups',
        targetGroups: [],
        targetCommunities: [],
        packageDays: 1,
        preferredTime: '',
      });
    } catch (e: any) {
      showError('Failed to create advertisement', e.message);
    }
  };

  if (isLoading) {
    return <CardGridSkeleton count={6} />;
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Advertisements</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Manage promotional ad campaigns</p>
        </div>
        <Button icon={Plus} onClick={() => setShowForm(true)}>
          New Advertisement
        </Button>
      </div>

      {ads.length === 0 ? (
        <Card>
          <CardBody>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Megaphone size={48} className="text-[var(--color-text-muted)] mb-4" />
              <p className="text-base font-semibold text-[var(--color-text)]">No advertisements yet</p>
              <p className="text-sm text-[var(--color-text-secondary)] mt-2 max-w-md">
                Create your first advertisement to start sending promotional messages to WhatsApp groups and communities.
              </p>
              <Button icon={Plus} onClick={() => setShowForm(true)} className="mt-4">
                Create First Advertisement
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ads.map((a: any) => (
            <Card key={a.id} hover>
              <CardBody>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center flex-shrink-0 text-[var(--color-primary)]">
                      <Megaphone size={20} />
                    </div>
                    <h3 className="font-semibold text-sm text-[var(--color-text)] truncate">{a.title}</h3>
                  </div>
                  <Badge variant={statusVariant(a.status)} className="flex-shrink-0">{a.status}</Badge>
                </div>

                <p className="text-xs text-[var(--color-text-secondary)] line-clamp-3 mb-4 leading-relaxed">
                  {a.body}
                </p>

                <div className="space-y-2 mb-4">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-secondary)]">
                    <span>Target: <strong>{a.targetType.replace('_', ' ')}</strong></span>
                    <span>Package: <strong>{a.daysUsed}/{a.packageDays}d</strong></span>
                    <span>Sent: <strong>{a.totalSent}</strong> / Failed: <strong>{a.totalFailed}</strong></span>
                  </div>

                  {a.mediaAttachments && a.mediaAttachments.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                      <Image size={14} />
                      <span>{a.mediaAttachments.length} attachment{a.mediaAttachments.length > 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              </CardBody>
              <CardFooter className="gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  icon={Play}
                  onClick={() => setSendTarget({ id: a.id, title: a.title })}
                  disabled={a.status !== 'active' && a.status !== 'draft'}
                >
                  Send
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon={Trash2}
                  onClick={() => setDeleteTarget({ id: a.id, title: a.title })}
                >
                  Delete
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!showForm} onClose={() => setShowForm(false)} title="Create Advertisement">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text)] mb-1">Title *</label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Campaign title"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text)] mb-1">Message Body *</label>
            <Textarea
              value={formData.body}
              onChange={(e) => setFormData({ ...formData, body: e.target.value })}
              placeholder="Enter your message (supports WhatsApp formatting)"
              rows={4}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text)] mb-1">Target Type *</label>
            <select
              value={formData.targetType}
              onChange={(e) => setFormData({ ...formData, targetType: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-[var(--color-bg)] text-[var(--color-text)]"
            >
              {targetTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {formData.targetType === 'specific' && (
            <div className="p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
              <p className="text-xs text-[var(--color-text-muted)] mb-2">Select specific groups and communities</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">Groups</label>
                  <div className="h-24 overflow-y-auto border border-[var(--color-border)] rounded-lg p-2">
                    <p className="text-xs text-[var(--color-text-muted)]">No groups available</p>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">Communities</label>
                  <div className="h-24 overflow-y-auto border border-[var(--color-border)] rounded-lg p-2">
                    <p className="text-xs text-[var(--color-text-muted)]">No communities available</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--color-text)] mb-1">Package Days</label>
            <Input
              type="number"
              min="1"
              max="30"
              value={formData.packageDays}
              onChange={(e) => setFormData({ ...formData, packageDays: parseInt(e.target.value) || 1 })}
              placeholder="1"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text)] mb-1">Preferred Send Time</label>
            <Input
              type="time"
              value={formData.preferredTime}
              onChange={(e) => setFormData({ ...formData, preferredTime: e.target.value })}
            />
          </div>

          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Advertisement</Button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Advertisement">
        <ModalBody>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Are you sure you want to delete <strong>"{deleteTarget?.title}"</strong>? This action cannot be undone.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} loading={deleteMutate.isPending}>Delete</Button>
        </ModalFooter>
      </Modal>

      <Modal open={!!sendTarget} onClose={() => setSendTarget(null)} title="Send Advertisement">
        <ModalBody>
          <p className="text-sm text-[var(--color-text)]">
            Send <strong>"{sendTarget?.title}"</strong> to all targets?
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-2">
            This will queue the advertisement for broadcast to all selected groups and communities.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setSendTarget(null)}>Cancel</Button>
          <Button icon={Play} onClick={handleSend} loading={sendMutate.isPending}>
            Send Advertisement
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}