import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  authApi,
  settingsApi,
  templateApi,
  scraperApi,
  campaignApi,
  adApi,
  automationApi,
} from '../services/wa-api';

// ─── Shared domain types (minimal shapes used across queries) ────

interface Admin {
  id: number;
  totalSent: number;
  totalFailed: number;
  isActive: boolean;
}

interface Group {
  id: number;
  isActive: boolean;
  isTargeted: boolean;
}

interface Broadcast {
  status: string;
}

interface Worker {
  status: string;
  openwaSessionStatus: string;
}

// ─── Query Keys ──────────────────────────────────────────────────

export const waKeys = {
  admins: ['wa', 'admins'] as const,
  groups: ['wa', 'groups'] as const,
  communities: ['wa', 'communities'] as const,
  broadcasts: ['wa', 'broadcasts'] as const,
  broadcast: (id: number) => ['wa', 'broadcast', id] as const,
  advertisements: ['wa', 'advertisements'] as const,
  templates: ['wa', 'templates'] as const,
  activeTemplate: ['wa', 'templates', 'active'] as const,
  articles: ['wa', 'articles'] as const,
  workers: ['wa', 'workers'] as const,
  settings: ['wa', 'settings'] as const,
  scraperActivity: ['wa', 'scraper-activity'] as const,
  me: ['wa', 'me'] as const,
} as const;

// ─── Auth ────────────────────────────────────────────────────────

export function useWaMeQuery() {
  return useQuery({
    queryKey: waKeys.me,
    queryFn: () => authApi.me(),
    retry: false,
  });
}

// ─── Admins ──────────────────────────────────────────────────────

export function useWaAdminsQuery() {
  return useQuery({ queryKey: waKeys.admins, queryFn: () => campaignApi.getAdmins() });
}

export function useCreateWaAdminMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { label: string; phoneNumber: string; sessionsPerAdmin?: number }) =>
      campaignApi.createAdmin(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.admins }),
  });
}

export function useToggleWaAdminMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => campaignApi.toggleAdmin(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.admins }),
  });
}

export function useToggleWarmupMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => campaignApi.toggleWarmup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.admins }),
  });
}

// ─── Groups ──────────────────────────────────────────────────────

export function useWaGroupsQuery() {
  return useQuery({ queryKey: waKeys.groups, queryFn: () => campaignApi.getGroups() });
}

export function useCreateWaGroupMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; groupJid: string }) => campaignApi.createGroup(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.groups }),
  });
}

export function useToggleWaGroupMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => campaignApi.toggleGroup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.groups }),
  });
}

export function useMarkGroupHealthyMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => campaignApi.markGroupHealthy(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.groups }),
  });
}

export function useLinkGroupCommunityMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, communityId }: { groupId: number; communityId: number }) =>
      campaignApi.linkGroupCommunity(groupId, communityId),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.groups }),
  });
}

export function useUnlinkGroupCommunityMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => campaignApi.unlinkGroupCommunity(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.groups }),
  });
}

export function useSetGroupTargetsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupIds: number[]) => campaignApi.setGroupTargets(groupIds),
    onMutate: async (groupIds) => {
      // Cancel outgoing refetches
      await qc.cancelQueries({ queryKey: waKeys.groups });
      // Snapshot previous value
      const previous = qc.getQueryData(waKeys.groups);
      // Optimistic update: set isTargeted based on the new groupIds
      qc.setQueryData(waKeys.groups, (old: Group[] | undefined) => {
        if (!old) return old;
        const targetSet = new Set(groupIds);
        return old.map(g => ({ ...g, isTargeted: targetSet.has(g.id) }));
      });
      return { previous };
    },
    onError: (_err, _groupIds, context) => {
      // Roll back on error
      if (context?.previous) {
        qc.setQueryData(waKeys.groups, context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: waKeys.groups });
    },
  });
}

// ─── Communities ─────────────────────────────────────────────────

export function useWaCommunitiesQuery() {
  return useQuery({ queryKey: waKeys.communities, queryFn: () => campaignApi.getCommunities() });
}

export function useCreateWaCommunityMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; communityJid: string }) => campaignApi.createCommunity(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.communities }),
  });
}

export function useCommunityBroadcastMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => campaignApi.communityBroadcast(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.broadcasts }),
  });
}

// ─── Broadcasts ──────────────────────────────────────────────────

export function useWaBroadcastsQuery(page = 1, status?: string) {
  return useQuery({
    queryKey: [...waKeys.broadcasts, page, status ?? 'all'],
    queryFn: () => campaignApi.getBroadcasts(page, 25, status),
    refetchInterval: 10_000,
  });
}

export function useWaBroadcastQuery(id: number) {
  return useQuery({
    queryKey: waKeys.broadcast(id),
    queryFn: () => campaignApi.getBroadcast(id),
    enabled: !!id,
  });
}

export function useRetryBroadcastMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => campaignApi.retryBroadcast(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.broadcasts }),
  });
}

export function useEditBroadcastMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, messageText }: { id: number; messageText: string }) =>
      campaignApi.editBroadcast(id, messageText),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.broadcasts }),
  });
}

export function useDeleteBroadcastMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => campaignApi.deleteBroadcast(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.broadcasts }),
  });
}

export function useRetryAllBroadcastsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => campaignApi.retryAllBroadcasts(),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.broadcasts }),
  });
}

// ─── Advertisements ──────────────────────────────────────────────

export function useWaAdvertisementsQuery(status?: string, search?: string) {
  return useQuery({
    queryKey: [...waKeys.advertisements, status ?? 'all', search ?? ''],
    queryFn: () => adApi.list(status, search),
    placeholderData: (previousData) => previousData,
  });
}

export function useAdTelemetryQuery(id: number) {
  return useQuery({
    queryKey: [...waKeys.advertisements, 'telemetry', id],
    queryFn: () => adApi.getTelemetry(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Poll every 30s for active campaigns, stop polling for completed/cancelled
      if (data && (data.status === 'completed' || data.status === 'cancelled')) return false;
      return 30_000;
    },
  });
}

export function useAdLogsQuery(id: number, enabled: boolean) {
  return useQuery({
    queryKey: [...waKeys.advertisements, 'logs', id],
    queryFn: () => adApi.getLogs(id),
    enabled: !!id && enabled,
  });
}

export function useDeleteAdMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.advertisements }),
  });
}

export function useSendAdMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => adApi.send(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.advertisements }),
  });
}

export function useUpdateAdMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => adApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.advertisements }),
  });
}

// ─── Ad Templates ───────────────────────────────────────────

export function useAdTemplatesQuery(adId: number) {
  return useQuery({
    queryKey: [...waKeys.advertisements, 'templates', adId],
    queryFn: () => adApi.listTemplates(adId),
    enabled: !!adId,
  });
}

export function useCreateAdTemplateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ adId, data }: { adId: number; data: { name: string; body?: string; mediaId?: number } }) =>
      adApi.createTemplate(adId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.advertisements }),
  });
}

export function useUpdateAdTemplateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ adId, tplId, data }: { adId: number; tplId: number; data: { name?: string; body?: string; mediaId?: number } }) =>
      adApi.updateTemplate(adId, tplId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.advertisements }),
  });
}

export function useActivateAdTemplateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ adId, tplId }: { adId: number; tplId: number }) =>
      adApi.activateTemplate(adId, tplId),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.advertisements }),
  });
}

export function useDeleteAdTemplateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ adId, tplId }: { adId: number; tplId: number }) =>
      adApi.deleteTemplate(adId, tplId),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.advertisements }),
  });
}

// ─── Templates ───────────────────────────────────────────────────

export function useWaTemplatesQuery() {
  return useQuery({ queryKey: waKeys.templates, queryFn: () => templateApi.list() });
}

export function useActiveTemplateQuery() {
  return useQuery({ queryKey: waKeys.activeTemplate, queryFn: () => templateApi.getActive() });
}

export function useCreateTemplateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; templateText: string }) => templateApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.templates }),
  });
}

export function useUpdateTemplateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; templateText?: string }) =>
      templateApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.templates }),
  });
}

export function useActivateTemplateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => templateApi.activate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: waKeys.templates });
      qc.invalidateQueries({ queryKey: waKeys.activeTemplate });
    },
  });
}

export function useDeleteTemplateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => templateApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.templates }),
  });
}

export function useDeactivateTemplateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => templateApi.deactivate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: waKeys.templates });
      qc.invalidateQueries({ queryKey: waKeys.activeTemplate });
    },
  });
}

// ─── Scraper ─────────────────────────────────────────────────────

export function useWaArticlesQuery() {
  return useQuery({ queryKey: waKeys.articles, queryFn: () => scraperApi.getArticles() });
}

export function useRunScraperMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => scraperApi.run(url),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.articles }),
  });
}

export function useScraperActivityQuery(page = 1) {
  return useQuery({
    queryKey: [...waKeys.scraperActivity, page],
    queryFn: () => scraperApi.getActivity(page),
  });
}

export function useRunAllScraperMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => scraperApi.runAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.articles }),
  });
}

export function useUnseedScraperMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => scraperApi.unseed(),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.articles }),
  });
}

// ─── Workers ─────────────────────────────────────────────────────

export function useWaWorkersQuery() {
  return useQuery({ queryKey: waKeys.workers, queryFn: () => automationApi.getWorkers() });
}

// ─── Dashboard Stats ─────────────────────────────────────────────

export function useWaDashboardStatsQuery() {
  return useQuery({
    queryKey: ['wa', 'dashboard-stats'],
    queryFn: async () => {
      const [admins, groups, broadcasts, workers, articleCount] = await Promise.all([
        campaignApi.getAdmins().catch(() => [] as Admin[]),
        campaignApi.getGroups().catch(() => [] as Group[]),
        campaignApi.getBroadcasts().catch(() => ({ data: [] as Broadcast[], total: 0, page: 1, limit: 25 })),
        automationApi.getWorkers().catch(() => [] as Worker[]),
        scraperApi.getArticleCount().catch(() => ({ count: 0 })),
      ]);

      const bcList = (broadcasts.data || []) as Broadcast[];
      const adminList = admins as Admin[];
      const groupList = groups as Group[];
      const totalSent = adminList.reduce((sum, a) => sum + (a.totalSent || 0), 0);
      const totalFailed = adminList.reduce((sum, a) => sum + (a.totalFailed || 0), 0);
      const totalAttempted = totalSent + totalFailed;
      const deliveryRate = totalAttempted > 0 ? Math.round((totalSent / totalAttempted) * 100) : 100;
      const workerList = workers as Worker[];
      const readySessions = workerList.filter(w => w.openwaSessionStatus === 'ready').length;
      const totalSessions = workerList.length;

      return {
        activeAdmins: adminList.length,
        activeGroups: groupList.filter(g => g.isTargeted).length,
        totalBroadcasts: broadcasts.total,
        activeBroadcasts: bcList.filter(b =>
          b.status === 'in_progress' || b.status === 'pending'
        ).length,
        activeWorkers: workerList.filter(w => w.status === 'active').length,
        scrapedArticles: articleCount.count,
        totalSent,
        totalFailed,
        deliveryRate,
        readySessions,
        totalSessions,
      };
    },
    staleTime: 30_000,
  });
}

// ─── Settings ────────────────────────────────────────────────────

export function useWaSettingsQuery() {
  return useQuery({ queryKey: waKeys.settings, queryFn: () => settingsApi.list() });
}

export function useUpdateSettingsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entries: Array<{ key: string; value: string }>) => settingsApi.update(entries),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.settings }),
  });
}

// ─── Admin Sessions ──────────────────────────────────────────────

export function useAdminSessionsQuery(adminId: number) {
  return useQuery({
    queryKey: ['wa', 'admin-sessions', adminId],
    queryFn: () => automationApi.listAdminSessions(adminId),
    enabled: !!adminId,
  });
}

export function useAllAdminSessionsQuery() {
  return useQuery({
    queryKey: ['wa', 'admin-sessions', 'all'],
    queryFn: () => automationApi.listAllAdminSessions(),
  });
}

export function useCreateAdminSessionsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (adminId: number) => automationApi.createAdminSessions(adminId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['wa', 'admin-sessions', data.adminId] });
      qc.invalidateQueries({ queryKey: waKeys.admins });
    },
  });
}

export function useStartAdminSessionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ adminId, slot }: { adminId: number; slot: number }) =>
      automationApi.startAdminSession(adminId, slot),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa', 'admin-sessions'] }),
  });
}

export function useStopAdminSessionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ adminId, slot }: { adminId: number; slot: number }) =>
      automationApi.stopAdminSession(adminId, slot),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa', 'admin-sessions'] }),
  });
}

export function useDeleteAdminSessionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ adminId, slot }: { adminId: number; slot: number }) =>
      automationApi.deleteAdminSession(adminId, slot),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa', 'admin-sessions'] }),
  });
}

export function useAdminSessionQRQuery(adminId: number, slot: number) {
  return useQuery({
    queryKey: ['wa', 'admin-session-qr', adminId, slot],
    queryFn: () => automationApi.getAdminSessionQR(adminId, slot),
    enabled: !!adminId && slot >= 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 5000;
      return data.status === 'ready' || data.status === 'disconnected' ? false : 5000;
    },
  });
}

export function useImportGroupsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ adminId, slot }: { adminId: number; slot: number }) =>
      automationApi.importAdminGroups(adminId, slot),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.groups }),
  });
}

export function useImportCommunitiesMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ adminId, slot }: { adminId: number; slot: number }) =>
      automationApi.importAdminCommunities(adminId, slot),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.communities }),
  });
}

export function useToggleSuperAdminMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isSuperAdmin }: { id: number; isSuperAdmin: boolean }) =>
      campaignApi.toggleSuperAdmin(id, isSuperAdmin),
    onSuccess: () => qc.invalidateQueries({ queryKey: waKeys.admins }),
  });
}
