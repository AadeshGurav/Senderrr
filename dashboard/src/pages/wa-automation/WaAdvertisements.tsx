import { useState } from 'react';
import { Megaphone, Trash2, Play, Image, Plus, X } from 'lucide-react';
import { Card, CardBody, CardFooter } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Modal, ModalBody, ModalFooter } from '../../components/ui/Modal';
import { ComboBox } from '../../components/ui/ComboBox';
import { CardGridSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import {
  useWaAdvertisementsQuery,
  useDeleteAdMutation,
  useSendAdMutation,
  useWaGroupsQuery,
  useWaCommunitiesQuery,
} from '../../hooks/wa-queries';
import { adApi } from '../../services/wa-api';

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

interface Group {
  id: number;
  name: string;
  groupJid: string;
  isTargeted?: boolean;
  isActive?: boolean;
  isHealthy?: boolean;
}

interface Community {
  id: number;
  name: string;
  communityJid: string;
  isActive?: boolean;
}

export default function WaAdvertisements() {
  const { data: ads = [], isLoading } = useWaAdvertisementsQuery();
  const { data: groups = [] } = useWaGroupsQuery();
  const { data: communities = [] } = useWaCommunitiesQuery();
  const deleteMutate = useDeleteAdMutation();
  const sendMutate = useSendAdMutation();
  const { success, error: showError } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const [sendTarget, setSendTarget] = useState<{ id: number; title: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    targetType: 'all_groups' as string,
    selectedGroups: [] as Group[],
    selectedCommunities: [] as Community[],
    packageDays: 1,
    preferredTime: '',
  });
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);

  // Only targeted & active & healthy groups are selectable
  const selectableGroups = groups.filter(
    (g: Group) => g.isTargeted && g.isActive !== false && g.isHealthy !== false,
  );
  const selectableCommunities = communities.filter((c: Community) => c.isActive !== false);

  const groupComboOptions = selectableGroups.map((g: Group) => ({
    value: String(g.id),
    label: g.name,
    sublabel: g.groupJid,
  }));

  const communityComboOptions = selectableCommunities.map((c: Community) => ({
    value: String(c.id),
    label: c.name,
    sublabel: c.communityJid,
  }));

  const selectedGroupOptions = formData.selectedGroups.map((g: Group) => ({
    value: String(g.id),
    label: g.name,
    sublabel: g.groupJid,
  }));

  const selectedCommunityOptions = formData.selectedCommunities.map((c: Community) => ({
    value: String(c.id),
    label: c.name,
    sublabel: c.communityJid,
  }));

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
    setCreating(true);
    try {
      const payload: any = {
        title: formData.title,
        body: formData.body,
        targetType: formData.targetType,
        packageDays: formData.packageDays,
        preferredTime: formData.preferredTime || null,
      };

      if (formData.targetType === 'specific') {
        payload.targetGroups = formData.selectedGroups.map((g: Group) => ({ id: g.id }));
        payload.targetCommunities = formData.selectedCommunities.map((c: Community) => ({ id: c.id }));
      }

      const ad = await adApi.create(payload);

      // Upload media after creation if a file was selected
      if (mediaFile && ad?.id) {
        await adApi.uploadMedia(ad.id, mediaFile);
      }

      success('Advertisement created');
      setShowForm(false);
      setFormData({
        title: '',
        body: '',
        targetType: 'all_groups',
        selectedGroups: [],
        selectedCommunities: [],
        packageDays: 1,
        preferredTime: '',
      });
      setMediaFile(null);
    } catch (e: any) {
      showError('Failed to create advertisement', e.message);
    } finally {
      setCreating(false);
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

      {/* ─── Create Advertisement Modal ─────────────────────── */}
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
            <div className="p-3 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] space-y-4">
              {/* Groups ComboBox */}
              <div>
                <label className="block text-xs font-medium text-[var(--color-text)] mb-1">
                  Target Groups
                </label>
                <ComboBox
                  placeholder="Search targeted groups..."
                  options={groupComboOptions}
                  selected={selectedGroupOptions}
                  onChange={(opts) => {
                    const groupsMap = new Map(selectableGroups.map((g: Group) => [String(g.id), g]));
                    setFormData({ ...formData, selectedGroups: opts.map(o => groupsMap.get(o.value)!).filter(Boolean) });
                  }}
                  emptyMessage="No targeted groups match your search"
                />
                {formData.selectedGroups.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {formData.selectedGroups.map((g: Group) => (
                      <span
                        key={g.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full
                          bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      >
                        {g.name}
                        <button
                          type="button"
                          className="hover:text-red-500"
                          onClick={() => setFormData({
                            ...formData,
                            selectedGroups: formData.selectedGroups.filter(x => x.id !== g.id),
                          })}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Communities ComboBox */}
              <div>
                <label className="block text-xs font-medium text-[var(--color-text)] mb-1">
                  Target Communities (all groups in selected communities)
                </label>
                <ComboBox
                  placeholder="Search communities..."
                  options={communityComboOptions}
                  selected={selectedCommunityOptions}
                  onChange={(opts) => {
                    const communitiesMap = new Map(selectableCommunities.map((c: Community) => [String(c.id), c]));
                    setFormData({ ...formData, selectedCommunities: opts.map(o => communitiesMap.get(o.value)!).filter(Boolean) });
                  }}
                  emptyMessage="No communities match your search"
                />
                {formData.selectedCommunities.length > 0 && (
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                    {formData.selectedCommunities.map((c: Community) => c.name).join(', ')}
                  </p>
                )}
              </div>
            </div>
          )}

          {formData.targetType === 'all_groups' && (
            <p className="text-xs text-[var(--color-text-muted)]">
              Sends to all {selectableGroups.length} targeted, healthy groups.
            </p>
          )}

          {formData.targetType === 'all_communities' && (
            <p className="text-xs text-[var(--color-text-muted)]">
              Sends to groups within all {selectableCommunities.length} active communities.
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--color-text)] mb-1">Package Days</label>
            <Input
              type="number"
              min="1"
              max="30"
              value={formData.packageDays}
              onChange={(e) => setFormData({ ...formData, packageDays: parseInt(e.target.value) || 1 })}
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

          <div>
            <label className="block text-xs font-medium text-[var(--color-text)] mb-1">Media Attachment (optional)</label>
            <input
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx,.txt"
              onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-[var(--color-text-secondary)] file:mr-3 file:py-1.5 file:px-3
                file:rounded-lg file:border-0 file:text-sm file:font-medium
                file:bg-[var(--color-primary)]/10 file:text-[var(--color-primary)]
                hover:file:bg-[var(--color-primary)]/20 cursor-pointer"
            />
            {mediaFile && (
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">{mediaFile.name}</p>
            )}
          </div>

          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Create Advertisement
            </Button>
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
