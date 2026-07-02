import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Megaphone, Trash2, Image, Plus, X, Send, Globe, Users, Target, Upload, FileText, Calendar, Square, Pause, PlayIcon } from 'lucide-react';
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
  useWaGroupsQuery,
  useWaCommunitiesQuery,
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
  const { success, error: showError } = useToast();
  const queryClient = useQueryClient();
  const waKeys = { advertisements: ['wa', 'advertisements'] as const };

  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);

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
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
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
        // Can't resume cancelled ads
        showError('Cannot resume a cancelled campaign');
      }
      // Invalidate cache so the list updates immediately
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

  const handleFileSelect = (file: File | null) => {
    setMediaFile(file);
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setMediaPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setMediaPreview(null);
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

      // Upload media if selected
      if (mediaFile && ad?.id) {
        await adApi.uploadMedia(ad.id, mediaFile);
      }

      // Auto-start: activate and dispatch immediately
      if (ad?.id) {
        await adApi.send(ad.id);
      }

      queryClient.invalidateQueries({ queryKey: waKeys.advertisements });

      success('Campaign created and started automatically');
      setShowForm(false);
      setFormData({ title: '', body: '', targetType: 'all_groups', selectedGroups: [], selectedCommunities: [], packageDays: 1, preferredTime: '' });
      setMediaFile(null);
      setMediaPreview(null);
    } catch (e: any) {
      showError('Failed to create campaign', e.message);
    } finally {
      setCreating(false);
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
        <Button icon={Plus} onClick={() => setShowForm(true)}>New Campaign</Button>
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
                <p className="text-xs text-[var(--color-text-secondary)] line-clamp-3 mb-4 leading-relaxed">{a.body}</p>
                <div className="space-y-2 mb-4">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-secondary)]">
                    <span>Target: <strong>{a.targetType.replace('_', ' ')}</strong></span>
                    <span>Package: <strong>{a.daysUsed}/{a.packageDays}d</strong></span>
                    <span>Sent: <strong>{a.totalSent}</strong> / Failed: <strong>{a.totalFailed}</strong></span>
                  </div>
                  {a.mediaAttachments?.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                      <Image size={14} />
                      <span>{a.mediaAttachments.length} attachment{a.mediaAttachments.length > 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              </CardBody>
              <CardFooter className="gap-2">
                {(a.status === 'active' || a.status === 'paused') && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={a.status === 'active' ? Pause : PlayIcon}
                    onClick={() => handleToggleStatus(a)}
                    loading={togglingStatus === a.id}
                  >
                    {a.status === 'active' ? 'Pause' : 'Resume'}
                  </Button>
                )}
                {a.status === 'active' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Square}
                    onClick={() => handleCancel(a)}
                    loading={togglingStatus === a.id}
                  >
                    Stop
                  </Button>
                )}
                {(a.status === 'draft' || a.status === 'completed' || a.status === 'cancelled') && (
                  <Button
                    size="sm"
                    variant="danger"
                    icon={Trash2}
                    onClick={() => setDeleteTarget({ id: a.id, title: a.title })}
                  >
                    Delete
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Create Modal ───────────────────────────────────── */}
      <Modal open={!!showForm} onClose={() => setShowForm(false)} title="Create Campaign" size="lg">
        <form onSubmit={handleCreate}>
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
                    Message Body *
                  </label>
                  <div className="relative">
                    <Textarea
                      value={formData.body}
                      onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                      placeholder="Enter your promotional message..."
                      rows={5}
                      required
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
              <div className="grid grid-cols-2 gap-3">
                <div>
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
                <div>
                  <Input
                    label="Preferred Send Time"
                    type="time"
                    value={formData.preferredTime}
                    onChange={(e) => setFormData({ ...formData, preferredTime: e.target.value })}
                  />
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-1">Optional — leave blank for any time</p>
                </div>
              </div>
            </div>

            {/* ── Section: Media ──────────────────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <Image size={15} />
                </div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Media Attachment</h3>
                <span className="text-[11px] text-[var(--color-text-muted)]">optional</span>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files[0]); }}
                className={`relative flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
                  dragOver
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                    : mediaFile
                      ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10'
                      : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)] bg-[var(--color-bg-secondary)]'
                }`}
              >
                <input
                  type="file"
                  accept="image/*,video/*,.pdf,.doc,.docx,.txt"
                  onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />

                {mediaPreview ? (
                  <>
                    <img src={mediaPreview} alt="preview" className="max-h-24 rounded-lg mb-2 object-contain" />
                    <p className="text-xs font-medium text-[var(--color-text)]">{mediaFile?.name}</p>
                    <button type="button" onClick={() => { setMediaFile(null); setMediaPreview(null); }} className="text-xs text-red-500 hover:text-red-600 mt-1 cursor-pointer">Remove</button>
                  </>
                ) : mediaFile ? (
                  <>
                    <FileText size={24} className="text-emerald-500 mb-2" />
                    <p className="text-xs font-medium text-[var(--color-text)]">{mediaFile?.name}</p>
                    <button type="button" onClick={() => { setMediaFile(null); setMediaPreview(null); }} className="text-xs text-red-500 hover:text-red-600 mt-1 cursor-pointer">Remove</button>
                  </>
                ) : (
                  <>
                    <Upload size={24} className="text-[var(--color-text-muted)] mb-2" />
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      <span className="text-[var(--color-primary)] font-medium">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-[10px] text-[var(--color-text-muted)] mt-1">Images, videos, PDFs, documents</p>
                  </>
                )}
              </div>
            </div>

          </ModalBody>

          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" loading={creating} icon={Send}>Launch Campaign</Button>
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
