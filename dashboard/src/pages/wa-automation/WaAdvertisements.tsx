import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Megaphone, Trash2, Image, Plus, X, Send, Globe, Users, Target, Upload, Calendar, Square, Pause, PlayIcon, Edit3, ChevronDown, ChevronRight, BarChart3 } from 'lucide-react';
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
  useAdTelemetryQuery,
  useWaGroupsQuery,
  useWaCommunitiesQuery,
  useUpdateAdMutation,
} from '../../hooks/wa-queries';
import { adApi } from '../../services/wa-api';

const statusVariant = (status: string) => {
  switch (status) {
    case 'active': return 'success' as const;
    case 'draft': return 'neutral' as const;
    case 'completed': return 'info' as const;
    case 'paused': return 'warning' as const;
    case 'cancelled': return 'error' as const;
    default: return 'warning' as const;
  }
};

const TARGET_OPTIONS = [
  { value: 'all_groups', label: 'All Groups', icon: Globe, desc: 'All targeted, healthy groups' },
  { value: 'all_communities', label: 'All Communities', icon: Users, desc: 'Groups within active communities' },
  { value: 'specific', label: 'Specific Targets', icon: Target, desc: 'Pick groups & communities' },
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
  const updateAd = useUpdateAdMutation();
  const { success, error: showError } = useToast();
  const queryClient = useQueryClient();
  const waKeys = { advertisements: ['wa', 'advertisements'] as const };

  const [showForm, setShowForm] = useState(false);
  const [editingAd, setEditingAd] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const [expandedAd, setExpandedAd] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    body: '',
    targetType: 'all_groups' as string,
    selectedGroups: [] as Group[],
    selectedCommunities: [] as Community[],
    packageDays: 1,
  });
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [removedMediaIds, setRemovedMediaIds] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState<number | null>(null);

  const selectableGroups = groups.filter(
    (g: Group) => g.isTargeted && g.isActive !== false && g.isHealthy !== false,
  );
  const selectableCommunities = communities.filter((c: Community) => c.isActive !== false);

  const groupComboOptions = selectableGroups.map((g: Group) => ({
    value: String(g.id), label: g.name, sublabel: g.groupJid,
  }));
  const communityComboOptions = selectableCommunities.map((c: Community) => ({
    value: String(c.id), label: c.name, sublabel: c.communityJid,
  }));
  const selectedGroupOptions = formData.selectedGroups.map((g: Group) => ({
    value: String(g.id), label: g.name, sublabel: g.groupJid,
  }));
  const selectedCommunityOptions = formData.selectedCommunities.map((c: Community) => ({
    value: String(c.id), label: c.name, sublabel: c.communityJid,
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

  const handleToggleStatus = async (ad: any) => {
    setTogglingStatus(ad.id);
    try {
      if (ad.status === 'active') {
        await adApi.update(ad.id, { status: 'paused' });
        success('Campaign paused', `"${ad.title}" was paused`);
      } else if (ad.status === 'paused') {
        await adApi.update(ad.id, { status: 'active' });
        success('Campaign resumed', `"${ad.title}" will continue sending`);
      } else if (ad.status === 'cancelled') {
        showError('Cannot resume a cancelled campaign');
      }
      queryClient.invalidateQueries({ queryKey: waKeys.advertisements });
    } catch (e: any) {
      showError('Failed to update campaign', e.message);
    } finally {
      setTogglingStatus(null);
    }
  };

  const handleCancel = async (ad: any) => {
    setTogglingStatus(ad.id);
    try {
      await adApi.update(ad.id, { status: 'cancelled' });
      success('Campaign stopped', `"${ad.title}" was cancelled`);
      queryClient.invalidateQueries({ queryKey: waKeys.advertisements });
    } catch (e: any) {
      showError('Failed to stop campaign', e.message);
    } finally {
      setTogglingStatus(null);
    }
  };

  const handleFilesSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles: File[] = [];
    const newPreviews: string[] = [];
    for (const file of files) {
      newFiles.push(file);
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setMediaPreviews(prev => [...prev, e.target?.result as string]);
        };
        reader.readAsDataURL(file);
      } else {
        newPreviews.push('');
      }
    }
    setMediaFiles(prev => [...prev, ...newFiles]);
  };

  const removeMedia = (index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
    setMediaPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const openEditModal = (ad: any) => {
    setEditingAd(ad);
    setFormData({
      title: ad.title || '',
      body: ad.body || '',
      targetType: ad.targetType || 'all_groups',
      selectedGroups: ad.targetGroups || [],
      selectedCommunities: ad.targetCommunities || [],
      packageDays: ad.packageDays || 1,
    });
    setMediaFiles([]);
    setMediaPreviews([]);
    setRemovedMediaIds([]);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate: title required + at least body or attachments
    if (!formData.title.trim()) {
      showError('Validation', 'Campaign title is required');
      setCreating(false);
      return;
    }
    const hasBody = formData.body.trim().length > 0;
    const hasNewMedia = mediaFiles.length > 0;
    const hasExistingMedia = editingAd && editingAd.mediaAttachments?.length > removedMediaIds.length;
    if (!hasBody && !hasNewMedia && !hasExistingMedia) {
      showError('Validation', 'Provide a message body or upload at least one attachment');
      setCreating(false);
      return;
    }

    setCreating(true);
    try {
      const payload: any = {
        title: formData.title,
        body: formData.body,
        targetType: formData.targetType,
        packageDays: formData.packageDays,
      };
      if (formData.targetType === 'specific') {
        payload.targetGroups = formData.selectedGroups.map((g: Group) => ({ id: g.id }));
        payload.targetCommunities = formData.selectedCommunities.map((c: Community) => ({ id: c.id }));
      }

      if (editingAd) {
        await updateAd.mutateAsync({ id: editingAd.id, data: payload });

        // Remove any media the user deleted
        if (removedMediaIds.length > 0) {
          for (const mid of removedMediaIds) {
            await adApi.removeMedia(mid);
          }
        }

        // Upload new files
        if (mediaFiles.length > 0) {
          for (const file of mediaFiles) {
            await adApi.uploadMedia(editingAd.id, file);
          }
        }

        success('Campaign updated', `"${formData.title}" saved`);
      } else {
        const ad = await adApi.create(payload);

        if (mediaFiles.length > 0 && ad?.id) {
          for (const file of mediaFiles) {
            await adApi.uploadMedia(ad.id, file);
          }
        }

        success('Campaign saved as draft. Use Send Now to dispatch.');
      }

      queryClient.invalidateQueries({ queryKey: waKeys.advertisements });
      setShowForm(false);
      setEditingAd(null);
      setFormData({ title: '', body: '', targetType: 'all_groups', selectedGroups: [], selectedCommunities: [], packageDays: 1 });
      setMediaFiles([]);
      setMediaPreviews([]);
      setRemovedMediaIds([]);
    } catch (e: any) {
      showError('Failed to save campaign', e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleManualSend = async (ad: any) => {
    setTogglingStatus(ad.id);
    try {
      await adApi.send(ad.id);
      success('Campaign dispatched', `"${ad.title}" sent to targets`);
      queryClient.invalidateQueries({ queryKey: waKeys.advertisements });
    } catch (e: any) {
      showError('Failed to dispatch campaign', e.message);
    } finally {
      setTogglingStatus(null);
    }
  };

  if (isLoading) return <CardGridSkeleton count={6} />;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Advertisements</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Manage promotional ad campaigns</p>
        </div>
        <Button icon={Plus} onClick={() => { setEditingAd(null); setFormData({ title: '', body: '', targetType: 'all_groups', selectedGroups: [], selectedCommunities: [], packageDays: 1 }); setMediaFiles([]); setMediaPreviews([]); setShowForm(true); }}>New Campaign</Button>
      </div>

      {/* ─── Empty / Grid ───────────────────────────────────── */}
      {ads.length === 0 ? (
        <Card>
          <CardBody>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Megaphone size={48} className="text-[var(--color-text-muted)] mb-4" />
              <p className="text-base font-semibold text-[var(--color-text)]">No campaigns yet</p>
              <p className="text-sm text-[var(--color-text-secondary)] mt-2 max-w-md">
                Create your first campaign to start sending promotional messages to WhatsApp groups and communities.
              </p>
              <Button icon={Plus} onClick={() => setShowForm(true)} className="mt-4">Create First Campaign</Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ads.map((a: any) => (
            <AdCard
              key={a.id}
              ad={a}
              expandedAd={expandedAd}
              setExpandedAd={setExpandedAd}
              onEdit={openEditModal}
              onDelete={setDeleteTarget}
              onToggleStatus={handleToggleStatus}
              onCancel={handleCancel}
              onManualSend={handleManualSend}
              togglingStatus={togglingStatus}
            />
          ))}
        </div>
      )}

      {/* ─── Create/Edit Modal ───────────────────────────────────── */}
      <Modal open={!!showForm} onClose={() => { setShowForm(false); setEditingAd(null); }} title={editingAd ? 'Edit Campaign' : 'Create Campaign'} size="lg">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <ModalBody>

            {/* ── Section: Campaign Details ───────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center text-[var(--color-primary)]">
                  <Megaphone size={15} />
                </div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Campaign Details</h3>
              </div>
              <div className="space-y-3">
                <Input
                  label="Campaign Title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Summer Sale 2026"
                  required
                />
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">
                    Message Body
                  </label>
                  <div className="relative">
                    <Textarea
                      value={formData.body}
                      onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                      placeholder="Enter your promotional message... Leave empty to send only attachments"
                      rows={5}
                      className="pr-20"
                    />
                    <span className="absolute bottom-2.5 right-3 text-[10px] text-[var(--color-text-muted)] font-mono">
                      {formData.body.length} chars
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-1">Supports WhatsApp formatting: *bold*, _italic_, ~strikethrough~</p>
                </div>
              </div>
            </div>

            {/* ── Media / Attachments upload right below message body ── */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400">
                    <Image size={15} />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--color-text)]">Attachments</h3>
                  <span className="text-[11px] text-[var(--color-text-muted)]">optional</span>
                </div>

                {/* Existing attachments (edit mode only) */}
                {editingAd && editingAd.mediaAttachments?.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {editingAd.mediaAttachments
                      .filter((m: any) => !removedMediaIds.includes(m.id))
                      .map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)]">
                          <div className="flex items-center gap-2 min-w-0">
                            <Image size={16} className="text-[var(--color-text-muted)] flex-shrink-0" />
                            <span className="text-xs text-[var(--color-text)] truncate">{m.originalFilename || `Attachment #${m.id}`}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setRemovedMediaIds(prev => [...prev, m.id])}
                            className="text-xs text-red-500 hover:text-red-600 flex-shrink-0 cursor-pointer p-1"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                  </div>
                )}

                {/* Drag-and-drop zone for new files */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFilesSelect(e.dataTransfer.files); }}
                  className={`relative flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
                    dragOver
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                      : mediaFiles.length > 0
                        ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10'
                        : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)] bg-[var(--color-bg-secondary)]'
                  }`}
                >
                  <input
                    type="file"
                    multiple
                    onChange={(e) => handleFilesSelect(e.target.files)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />

                  {mediaFiles.length > 0 ? (
                    <div className="w-full space-y-2">
                      {mediaFiles.map((file, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[var(--color-bg)]">
                          <div className="flex items-center gap-2 min-w-0">
                            {mediaPreviews[i] ? (
                              <img src={mediaPreviews[i]} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded bg-[var(--color-bg-secondary)] flex items-center justify-center flex-shrink-0">
                                <Upload size={16} className="text-[var(--color-text-muted)]" />
                              </div>
                            )}
                            <span className="text-xs text-[var(--color-text)] truncate">{file.name}</span>
                          </div>
                          <button type="button" onClick={() => removeMedia(i)} className="text-xs text-red-500 hover:text-red-600 flex-shrink-0 cursor-pointer p-1">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <Upload size={24} className="text-[var(--color-text-muted)] mb-2" />
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        <span className="text-[var(--color-primary)] font-medium">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-1">Any file type — images, videos, documents</p>
                    </>
                  )}
                </div>
              </div>

            {/* ── Section: Targeting ──────────────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Target size={15} />
                </div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Targeting</h3>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                {TARGET_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const selected = formData.targetType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, targetType: opt.value, selectedGroups: [], selectedCommunities: [] })}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all cursor-pointer ${
                        selected
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                          : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)] bg-[var(--color-bg-secondary)]'
                      }`}
                    >
                      <Icon size={18} className={selected ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'} />
                      <span className={`text-xs font-medium ${selected ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'}`}>
                        {opt.label}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)] text-center leading-tight">{opt.desc}</span>
                    </button>
                  );
                })}
              </div>

              {formData.targetType === 'specific' && (
                <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 border border-[var(--color-border)] space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">Groups</label>
                    <ComboBox
                      placeholder="Search targeted groups..."
                      options={groupComboOptions}
                      selected={selectedGroupOptions}
                      onChange={(opts) => {
                        const m = new Map(selectableGroups.map((g: Group) => [String(g.id), g]));
                        setFormData({ ...formData, selectedGroups: opts.map(o => m.get(o.value)!).filter(Boolean) });
                      }}
                      emptyMessage="No targeted groups match your search"
                    />
                    {formData.selectedGroups.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {formData.selectedGroups.map((g: Group) => (
                          <span key={g.id} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            {g.name}
                            <button type="button" className="hover:text-red-500 cursor-pointer" onClick={() => setFormData({ ...formData, selectedGroups: formData.selectedGroups.filter(x => x.id !== g.id) })}>
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">Communities</label>
                    <ComboBox
                      placeholder="Search communities..."
                      options={communityComboOptions}
                      selected={selectedCommunityOptions}
                      onChange={(opts) => {
                        const m = new Map(selectableCommunities.map((c: Community) => [String(c.id), c]));
                        setFormData({ ...formData, selectedCommunities: opts.map(o => m.get(o.value)!).filter(Boolean) });
                      }}
                      emptyMessage="No communities match your search"
                    />
                    {formData.selectedCommunities.length > 0 && (
                      <p className="text-xs text-[var(--color-text-secondary)] mt-1.5">
                        {formData.selectedCommunities.length} community selected — all groups within will receive the broadcast
                      </p>
                    )}
                  </div>
                </div>
              )}

              {formData.targetType === 'all_groups' && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-sky-50 dark:bg-sky-900/10 border border-sky-200 dark:border-sky-800 text-xs text-sky-700 dark:text-sky-300">
                  <Globe size={14} className="flex-shrink-0" />
                  Sending to all <strong className="mx-1">{selectableGroups.length}</strong> targeted, healthy groups
                </div>
              )}

              {formData.targetType === 'all_communities' && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-sky-50 dark:bg-sky-900/10 border border-sky-200 dark:border-sky-800 text-xs text-sky-700 dark:text-sky-300">
                  <Users size={14} className="flex-shrink-0" />
                  Sending to groups within all <strong className="mx-1">{selectableCommunities.length}</strong> active communities
                </div>
              )}
            </div>

            {/* ── Section: Schedule ───────────────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <Calendar size={15} />
                </div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Schedule & Package</h3>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="max-w-xs">
                  <Input
                    label="Package Days"
                    type="number"
                    min="1"
                    max="30"
                    value={formData.packageDays}
                    onChange={(e) => setFormData({ ...formData, packageDays: parseInt(e.target.value) || 1 })}
                  />
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-1">How many days this campaign runs</p>
                </div>
              </div>
            </div>
          </ModalBody>

          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setEditingAd(null); }}>Cancel</Button>
            <Button type="submit" loading={creating} icon={editingAd ? Edit3 : Send}>
              {editingAd ? 'Save Changes' : 'Save as Draft'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* ─── Delete Confirm ─────────────────────────────────── */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Campaign">
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
    </div>
  );
}

/** Individual campaign card with telemetry, edit, and lifecycle-aware actions. */
function AdCard({
  ad,
  expandedAd,
  setExpandedAd,
  onEdit,
  onDelete,
  onToggleStatus,
  onCancel,
  onManualSend,
  togglingStatus,
}: {
  ad: any;
  expandedAd: number | null;
  setExpandedAd: (id: number | null) => void;
  onEdit: (ad: any) => void;
  onDelete: (target: { id: number; title: string }) => void;
  onToggleStatus: (ad: any) => void;
  onCancel: (ad: any) => void;
  onManualSend: (ad: any) => void;
  togglingStatus: number | null;
}) {
  const { data: telemetry } = useAdTelemetryQuery(ad.id);
  const isExpanded = expandedAd === ad.id;
  const isLocked = ad.status === 'completed' || ad.status === 'cancelled';
  const canEdit = ad.status === 'draft' || ad.status === 'active' || ad.status === 'paused';

  const daysRemaining = telemetry?.daysRemaining ?? Math.max(0, (ad.packageDays || 1) - (ad.daysUsed || 0));

  return (
    <Card hover>
      <CardBody>
        {/* ── Header ──────────────────────── */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center flex-shrink-0 text-[var(--color-primary)]">
              <Megaphone size={20} />
            </div>
            <h3 className="font-semibold text-sm text-[var(--color-text)] truncate">{ad.title}</h3>
          </div>
          <Badge variant={statusVariant(ad.status)} className="flex-shrink-0">{ad.status}</Badge>
        </div>

        {/* ── Body ────────────────────────── */}
        <p className="text-xs text-[var(--color-text-secondary)] line-clamp-3 mb-4 leading-relaxed">{ad.body}</p>

        {/* ── Telemetry Stats ──────────────── */}
        <div className="space-y-2 mb-3">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-secondary)]">
            <span>Target: <strong>{ad.targetType?.replace('_', ' ')}</strong></span>
            <span>Package: <strong>{ad.daysUsed}/{ad.packageDays}d</strong></span>
            <span>Remaining: <strong>{daysRemaining}d</strong></span>
          </div>
          {telemetry ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span className="text-emerald-600 dark:text-emerald-400">Sent: <strong>{telemetry.totalSent}</strong></span>
              <span className="text-red-500">Failed: <strong>{telemetry.totalFailed}</strong></span>
              <span className="text-[var(--color-text-secondary)]">
                Today: <strong className="text-[var(--color-primary)]">{telemetry.todaySent}</strong> sent
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-secondary)]">
              <span>Sent: <strong>{ad.totalSent || 0}</strong></span>
              <span>Failed: <strong>{ad.totalFailed || 0}</strong></span>
            </div>
          )}
          {ad.mediaAttachments?.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
              <Image size={14} />
              <span>{ad.mediaAttachments.length} attachment{ad.mediaAttachments.length > 1 ? 's' : ''}</span>
            </div>
          )}

          {/* ── Per-group expandable breakdown ──────── */}
          {telemetry && telemetry.perGroup && telemetry.perGroup.length > 0 && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setExpandedAd(isExpanded ? null : ad.id)}
                className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors cursor-pointer"
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <BarChart3 size={12} />
                Per-group breakdown ({telemetry.perGroup.length} groups)
              </button>
              {isExpanded && (
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {telemetry.perGroup.map((pg: any) => (
                    <div key={pg.groupName} className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-[var(--color-bg-secondary)]">
                      <span className="text-[var(--color-text-secondary)] truncate mr-2">{pg.groupName}</span>
                      <span className="flex-shrink-0 text-[var(--color-text-muted)]">
                        Total <strong className="text-emerald-600 dark:text-emerald-400">{pg.totalSent}</strong>
                        {pg.todaySent > 0 && (
                          <span className="ml-1.5 text-[var(--color-primary)]">(+{pg.todaySent} today)</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </CardBody>

      {/* ── Actions ──────────────────────── */}
      <CardFooter className="gap-2 flex-wrap">
        {isLocked ? (
          <>
            <Badge variant="info" className="text-[11px]">{ad.status === 'completed' ? 'Completed' : 'Cancelled'}</Badge>
            <Button
              size="sm"
              variant="danger"
              icon={Trash2}
              onClick={() => onDelete({ id: ad.id, title: ad.title })}
            >
              Delete
            </Button>
          </>
        ) : (
          <>
            {canEdit && (
              <Button
                size="sm"
                variant="secondary"
                icon={Edit3}
                onClick={() => onEdit(ad)}
              >
                Edit
              </Button>
            )}

            {(ad.status === 'draft' || ad.status === 'active' || ad.status === 'paused') && (
              <Button
                size="sm"
                variant="secondary"
                icon={Send}
                onClick={() => onManualSend(ad)}
                loading={togglingStatus === ad.id}
              >
                Send Now
              </Button>
            )}

            {(ad.status === 'active' || ad.status === 'paused') && (
              <Button
                size="sm"
                variant="secondary"
                icon={ad.status === 'active' ? Pause : PlayIcon}
                onClick={() => onToggleStatus(ad)}
                loading={togglingStatus === ad.id}
              >
                {ad.status === 'active' ? 'Pause' : 'Resume'}
              </Button>
            )}

            {ad.status === 'active' && (
              <Button
                size="sm"
                variant="secondary"
                icon={Square}
                onClick={() => onCancel(ad)}
                loading={togglingStatus === ad.id}
              >
                Stop
              </Button>
            )}

            {(ad.status === 'draft' || ad.status === 'paused') && (
              <Button
                size="sm"
                variant="danger"
                icon={Trash2}
                onClick={() => onDelete({ id: ad.id, title: ad.title })}
              >
                Delete
              </Button>
            )}
          </>
        )}
      </CardFooter>
    </Card>
  );
}
