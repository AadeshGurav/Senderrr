import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Megaphone, Trash2, Image, Plus, X, Send, Globe, Users, Target, Upload, Calendar, Edit3, ChevronDown, ChevronRight, BarChart3, Search, CheckCircle, Layers } from 'lucide-react';
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
  useAdLogsQuery,
  useAdTemplatesQuery,
  useCreateAdTemplateMutation,
  useActivateAdTemplateMutation,
  useDeleteAdTemplateMutation,
} from '../../hooks/wa-queries';
import { adApi } from '../../services/wa-api';
import type { ApiAd, ApiAdTemplate } from '../../services/wa-api';

// ─── Local extended types ──────────────────────────────────────────

interface MediaAttachment {
  id: number;
  originalFilename: string | null;
}

interface PerGroupStat {
  groupName: string;
  totalSent: number;
  todaySent: number;
}

interface Telemetry {
  totalSent: number;
  totalFailed: number;
  todaySent: number;
  firedToday: boolean;
  daysRemaining: number;
  perGroup: PerGroupStat[];
}

/** Full ad shape as returned by the API (extends ApiAd with rich fields). */
interface ApiAdFull extends ApiAd {
  title: string;
  body: string | null;
  targetType: string;
  packageDays: number;
  daysUsed: number;
  totalSent: number;
  totalFailed: number;
  targetGroups?: { id: number }[];
  targetCommunities?: { id: number }[];
  mediaAttachments?: MediaAttachment[];
}

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
  const queryClient = useQueryClient();
  const waKeys = { advertisements: ['wa', 'advertisements'] as const };
  const { success, error: showError } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [packageDaysInput, setPackageDaysInput] = useState('1');
  const [editingAd, setEditingAd] = useState<ApiAdFull | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const [expandedAd, setExpandedAd] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    targetType: 'all_groups' as string,
    selectedGroups: [] as Group[],
    selectedCommunities: [] as Community[],
    packageDays: 1,
  });
  const [newTplName, setNewTplName] = useState('');
  const [newTplBody, setNewTplBody] = useState('');
  const [newTplFile, setNewTplFile] = useState<File | null>(null);
  const [newTplPreview, setNewTplPreview] = useState('');
  const [creating, setCreating] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState<number | null>(null);

  const { data: ads = [], isLoading } = useWaAdvertisementsQuery(statusFilter, searchTerm);
  const { data: groups = [] } = useWaGroupsQuery();
  const { data: communities = [] } = useWaCommunitiesQuery();
  const deleteMutate = useDeleteAdMutation();
  const updateAd = useUpdateAdMutation();
  const { data: existingTemplates = [] } = useAdTemplatesQuery(editingAd?.id ?? 0);
  const createTemplateMut = useCreateAdTemplateMutation();
  const activateTemplateMut = useActivateAdTemplateMutation();
  const deleteTemplateMut = useDeleteAdTemplateMutation();

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
    } catch (e: unknown) {
      showError('Failed to delete advertisement', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const openEditModal = (ad: ApiAdFull) => {
    setEditingAd(ad);
    setFormData({
      title: ad.title || '',
      targetType: ad.targetType || 'all_groups',
      selectedGroups: (ad.targetGroups as Group[] | undefined) ?? [],
      selectedCommunities: (ad.targetCommunities as Community[] | undefined) ?? [],
      packageDays: ad.packageDays || 1,
    });
    setPackageDaysInput(String(ad.packageDays || 1));
    setNewTplName('');
    setNewTplBody('');
    setNewTplFile(null);
    setNewTplPreview('');
    setShowForm(true);
  };

  const handleCreateTemplate = async () => {
    const adId = editingAd?.id;
    if (!adId) {
      showError('Validation', 'Save the campaign first before adding templates');
      return;
    }
    if (!newTplName.trim()) {
      showError('Validation', 'Template name is required');
      return;
    }

    try {
      // Upload media first to get its ID
      let mediaId: number | undefined;
      if (newTplFile) {
        const media = await adApi.uploadMedia(adId, newTplFile);
        mediaId = media.id;
      }

      // Then create the template with the mediaId linked directly
      await createTemplateMut.mutateAsync({
        adId,
        data: { name: newTplName.trim(), body: newTplBody || undefined, mediaId },
      });

      success('Template added', `"${newTplName}" created`);
      setNewTplName('');
      setNewTplBody('');
      setNewTplFile(null);
      setNewTplPreview('');
      queryClient.invalidateQueries({ queryKey: ['wa', 'advertisements', 'templates', adId] });
    } catch (e: unknown) {
      showError('Failed to create template', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleActivateTemplate = async (tplId: number) => {
    if (!editingAd) return;
    try {
      await activateTemplateMut.mutateAsync({ adId: editingAd.id, tplId });
      success('Template activated');
      queryClient.invalidateQueries({ queryKey: ['wa', 'advertisements', 'templates', editingAd.id] });
    } catch (e: unknown) {
      showError('Failed to activate template', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleDeleteTemplate = async (tplId: number) => {
    if (!editingAd) return;
    try {
      await deleteTemplateMut.mutateAsync({ adId: editingAd.id, tplId });
      success('Template deleted');
      queryClient.invalidateQueries({ queryKey: ['wa', 'advertisements', 'templates', editingAd.id] });
    } catch (e: unknown) {
      showError('Failed to delete template', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      showError('Validation', 'Campaign title is required');
      return;
    }

    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        title: formData.title,
        targetType: formData.targetType,
        packageDays: formData.packageDays,
      };
      if (formData.targetType === 'specific') {
        payload.targetGroups = formData.selectedGroups.map((g: Group) => ({ id: g.id }));
        payload.targetCommunities = formData.selectedCommunities.map((c: Community) => ({ id: c.id }));
      }

      if (editingAd) {
        await updateAd.mutateAsync({ id: editingAd.id, data: payload });
        success('Campaign updated', `"${formData.title}" saved`);
      } else {
        await adApi.create(payload);
        success('Campaign saved as draft. Add templates and use Send Now to dispatch.');
      }

      queryClient.invalidateQueries({ queryKey: waKeys.advertisements });
      setShowForm(false);
      setEditingAd(null);
      setFormData({ title: '', targetType: 'all_groups', selectedGroups: [], selectedCommunities: [], packageDays: 1 });
      setPackageDaysInput('1');
      setNewTplName('');
      setNewTplBody('');
      setNewTplFile(null);
      setNewTplPreview('');
    } catch (e: unknown) {
      showError('Failed to save campaign', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  };

  const handleManualSend = async (ad: ApiAdFull) => {
    setTogglingStatus(ad.id);
    try {
      await adApi.send(ad.id);
      success('Campaign dispatched', `"${ad.title}" sent to targets`);
      queryClient.invalidateQueries({ queryKey: waKeys.advertisements });
    } catch (e: unknown) {
      showError('Failed to dispatch campaign', e instanceof Error ? e.message : 'Unknown error');
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
        <Button icon={Plus} onClick={() => { setEditingAd(null); setFormData({ title: '', targetType: 'all_groups', selectedGroups: [], selectedCommunities: [], packageDays: 1 }); setPackageDaysInput('1'); setNewTplName(''); setNewTplBody(''); setNewTplFile(null); setNewTplPreview(''); setShowForm(true); }}>New Campaign</Button>
      </div>

      {/* ─── Filter Bar ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-1 bg-[var(--color-bg-secondary)] rounded-xl p-1 border border-[var(--color-border)]">
          {['all', 'draft', 'active', 'completed', 'cancelled'].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer capitalize ${
                statusFilter === s
                  ? 'bg-[var(--color-primary)] text-white shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)]'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search campaigns..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-primary)] transition-colors"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>
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
          {(ads as ApiAdFull[]).map(a => (
            <AdCard
              key={a.id}
              ad={a}
              expandedAd={expandedAd}
              setExpandedAd={setExpandedAd}
              onEdit={openEditModal}
              onDelete={setDeleteTarget}
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
              </div>
            </div>

            {/* ── Section: Templates ─────────────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <Layers size={15} />
                </div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Templates</h3>
                <span className="text-[11px] text-[var(--color-text-muted)]">One active per campaign</span>
              </div>

              {/* Existing templates (edit mode) */}
              {editingAd && existingTemplates.length > 0 && (
                <div className="space-y-2 mb-4">
                  {existingTemplates.map((tpl: ApiAdTemplate) => (
                    <div
                      key={tpl.id}
                      className={`p-3 rounded-xl border transition-colors ${
                        tpl.isActive
                          ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10'
                          : 'border-[var(--color-border)] bg-[var(--color-bg)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="font-medium text-xs text-[var(--color-text)]">{tpl.name}</span>
                          {tpl.isActive && <Badge variant="success">Active</Badge>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!tpl.isActive && (
                            <button
                              type="button"
                              onClick={() => handleActivateTemplate(tpl.id)}
                              className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary)]/80 cursor-pointer px-2 py-1 rounded hover:bg-[var(--color-primary)]/5"
                            >
                              Activate
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteTemplate(tpl.id)}
                            className="text-xs text-red-500 hover:text-red-600 cursor-pointer p-1"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      {tpl.body && (
                        <p className="text-[11px] text-[var(--color-text-secondary)] mt-1 line-clamp-2">{tpl.body}</p>
                      )}
                      {tpl.media && (
                        <div className="flex items-center gap-1 mt-1">
                          <Image size={11} className="text-[var(--color-text-muted)]" />
                          <span className="text-[10px] text-[var(--color-text-muted)]">{tpl.media.originalFilename}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add template form */}
              {editingAd && (
                <div className="bg-[var(--color-bg-secondary)] rounded-xl p-4 border border-[var(--color-border)] border-dashed space-y-3">
                  <p className="text-xs font-medium text-[var(--color-text-secondary)]">Add New Template</p>
                  <Input
                    label="Template Name"
                    value={newTplName}
                    onChange={(e) => setNewTplName(e.target.value)}
                    placeholder="e.g., Text with Image, Plain Text, Offer"
                  />
                  <Textarea
                    label="Message Body"
                    value={newTplBody}
                    onChange={(e) => setNewTplBody(e.target.value)}
                    placeholder="Enter message for this template..."
                    rows={3}
                  />
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                      Optional Media
                    </label>
                    <input
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setNewTplFile(file);
                        if (file?.type.startsWith('image/')) {
                          const reader = new FileReader();
                          reader.onload = (ev) => setNewTplPreview(ev.target?.result as string);
                          reader.readAsDataURL(file);
                        } else {
                          setNewTplPreview('');
                        }
                      }}
                      className="text-xs text-[var(--color-text-secondary)] file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[var(--color-primary)]/10 file:text-[var(--color-primary)] hover:file:bg-[var(--color-primary)]/20 cursor-pointer"
                    />
                    {newTplPreview && (
                      <img src={newTplPreview} alt="" className="mt-2 w-16 h-16 rounded object-cover border border-[var(--color-border)]" />
                    )}
                    {newTplFile && !newTplPreview && (
                      <div className="flex items-center gap-1 mt-2">
                        <Upload size={12} className="text-[var(--color-text-muted)]" />
                        <span className="text-[10px] text-[var(--color-text-muted)]">{newTplFile.name}</span>
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    icon={Plus}
                    onClick={handleCreateTemplate}
                    loading={createTemplateMut.isPending}
                  >
                    Add Template
                  </Button>
                </div>
              )}

              {!editingAd && (
                <div className="px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                  <CheckCircle size={14} />
                  Save the campaign first, then add templates with custom messages and media.
                </div>
              )}
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
                    value={packageDaysInput}
                    onChange={(e) => setPackageDaysInput(e.target.value)}
                    onBlur={() => {
                      let parsed = parseInt(packageDaysInput, 10);
                      if (isNaN(parsed) || parsed < 1) parsed = 1;
                      if (parsed > 30) parsed = 30;
                      setPackageDaysInput(String(parsed));
                      setFormData(prev => ({ ...prev, packageDays: parsed }));
                    }}
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
  onManualSend,
  togglingStatus,
}: {
  ad: ApiAdFull;
  expandedAd: number | null;
  setExpandedAd: (id: number | null) => void;
  onEdit: (ad: ApiAdFull) => void;
  onDelete: (target: { id: number; title: string }) => void;
  onManualSend: (ad: ApiAdFull) => void;
  togglingStatus: number | null;
}) {
  const [showLogs, setShowLogs] = useState(false);
  const { data: logs, isLoading: loadingLogs } = useAdLogsQuery(ad.id, showLogs);

  const { data: rawTelemetry } = useAdTelemetryQuery(ad.id);
  const telemetry = rawTelemetry ? (rawTelemetry as unknown as Telemetry) : null;
  const isExpanded = expandedAd === ad.id;
  const isLocked = ad.status === 'completed' || ad.status === 'cancelled';
  const canEdit = ad.status === 'draft' || ad.status === 'active' || ad.status === 'paused';

  const daysRemaining = telemetry?.daysRemaining ?? Math.max(0, (ad.packageDays || 1) - (ad.daysUsed || 0));

  return (
    <Card hover className={telemetry?.firedToday ? 'ring-1 ring-emerald-500 bg-emerald-50/30 dark:bg-emerald-900/10 border-l-4 border-l-emerald-500' : ''}>
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
              <span className="text-emerald-600 dark:text-emerald-400">Sent: <strong>{(telemetry as Telemetry).totalSent}</strong></span>
              <span className="text-red-500">Failed: <strong>{(telemetry as Telemetry).totalFailed}</strong></span>
              <span className="text-[var(--color-text-secondary)]">
                Today: <strong className="text-[var(--color-primary)]">{(telemetry as Telemetry).todaySent}</strong> sent
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-secondary)]">
              <span>Sent: <strong>{ad.totalSent || 0}</strong></span>
              <span>Failed: <strong>{ad.totalFailed || 0}</strong></span>
            </div>
          )}
          {(ad.mediaAttachments?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
              <Image size={14} />
              <span>{ad.mediaAttachments!.length} attachment{ad.mediaAttachments!.length > 1 ? 's' : ''}</span>
            </div>
          )}

          {/* ── Per-group expandable breakdown ──────── */}
          {telemetry && (telemetry as Telemetry).perGroup && (telemetry as Telemetry).perGroup.length > 0 && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setExpandedAd(isExpanded ? null : ad.id)}
                className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors cursor-pointer"
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <BarChart3 size={12} />
                Per-group breakdown ({(telemetry as Telemetry).perGroup.length} groups)
              </button>
              {isExpanded && (
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {(telemetry as Telemetry).perGroup.map(pg => (
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

          {/* ── Per-fire Logs ──────── */}
          <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setShowLogs(!showLogs)}
              className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors cursor-pointer"
            >
              {showLogs ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Calendar size={12} />
              View Send Logs
            </button>
            {showLogs && (
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {loadingLogs ? (
                  <div className="text-[11px] text-[var(--color-text-muted)] text-center py-2">Loading logs...</div>
                ) : logs && logs.length > 0 ? (
                  logs.map((log: { groupName: string; status: string; timestamp: string }, i: number) => (
                    <div key={i} className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-[var(--color-bg-secondary)]">
                      <span className="text-[var(--color-text-secondary)] truncate mr-2">{log.groupName}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={log.status === 'sent' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>
                          {log.status === 'sent' ? 'Sent' : 'Failed'}
                        </span>
                        <span className="text-[var(--color-text-muted)]">
                          {new Date(log.timestamp).toLocaleString(undefined, {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-[11px] text-[var(--color-text-muted)] text-center py-2">No logs found.</div>
                )}
              </div>
            )}
          </div>
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
