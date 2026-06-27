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
      qc.setQueryData(waKeys.groups, (old: any[] | undefined) => {
        if (!old) return old;
        const targetSet = new Set(groupIds);
        return old.map((g: any) => ({ ...g, isTargeted: targetSet.has(g.id) }));
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

export function useWaBroadcastsQuery() {
  return useQuery({ queryKey: waKeys.broadcasts, queryFn: () => campaignApi.getBroadcasts() });
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

// ─── Advertisements ──────────────────────────────────────────────

export function useWaAdvertisementsQuery() {
  return useQuery({ queryKey: waKeys.advertisements, queryFn: () => adApi.list() });
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
      const [admins, groups, broadcasts, workers, articles] = await Promise.all([
        campaignApi.getAdmins().catch(() => []),
        campaignApi.getGroups().catch(() => []),
        campaignApi.getBroadcasts().catch(() => []),
        automationApi.getWorkers().catch(() => []),
        scraperApi.getArticles().catch(() => []),
      ]);

      const totalSent = admins.reduce((sum: number, a: any) => sum + (a.totalSent || 0), 0);
      const totalFailed = admins.reduce((sum: number, a: any) => sum + (a.totalFailed || 0), 0);
      const totalAttempted = totalSent + totalFailed;
      const deliveryRate = totalAttempted > 0 ? Math.round((totalSent / totalAttempted) * 100) : 100;
      const activeBroadcasts = broadcasts.filter((b: any) =>
        b.status === 'in_progress' || b.status === 'pending'
      ).length;
      const readySessions = workers.filter((w: any) => w.openwaSessionStatus === 'ready').length;
      const totalSessions = workers.length;

      return {
        activeAdmins: admins.length,
        activeGroups: groups.filter((g: any) => g.isActive).length,
        totalBroadcasts: broadcasts.length,
        activeBroadcasts,
        activeWorkers: workers.filter((w: any) => w.status === 'active').length,
        scrapedArticles: articles.length,
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
