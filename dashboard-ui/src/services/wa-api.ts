const API_BASE = '/api/wa';

function getToken(): string | null {
  return sessionStorage.getItem('wa_token');
}

function redirectToLogin(): void {
  sessionStorage.removeItem('wa_token');
  window.location.reload();
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    redirectToLogin();
    throw new Error('Please sign in again. Your session has expired.');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

// ─── Shared API payload types ─────────────────────────────────────

/** Minimal shape for template objects returned by the API. */
export interface ApiTemplate {
  id: number;
  name: string;
  templateText: string;
  isActive: boolean;
}

/** Minimal shape for scraped article objects. */
export interface ApiArticle {
  id: number;
  title: string | null;
  url: string | null;
  sourceName: string;
  createdAt: string;
}

/** Minimal shape for scraper activity log entries. */
export interface ApiScraperActivity {
  id: number;
  checkedAt: string;
  url: string;
  articlesFound: number;
  articlesNew: number;
  articlesSkipped: number;
  articlesFailed: number;
  listingChanged: boolean;
  durationMs: number;
  errors: string | null;
}

/** Minimal shape for admin objects. */
export interface ApiAdmin {
  id: number;
  label: string;
  phoneNumber: string;
  sessionsPerAdmin: number;
  totalSent: number;
  totalFailed: number;
  isActive: boolean;
  isSuperAdmin: boolean;
  skipWarmup: boolean;
  warmUpStartedAt: string | null;
  openwaSessionId: string | null;
  [key: string]: unknown;
}

/** Minimal shape for group objects. */
export interface ApiGroup {
  id: number;
  name: string;
  groupJid: string;
  community?: { id: number; name: string } | null;
  totalSent: number;
  totalFailed: number;
  isHealthy: boolean;
  isActive: boolean;
  isTargeted: boolean;
  [key: string]: unknown;
}

/** Minimal shape for community objects. */
export interface ApiCommunity {
  id: number;
  name: string;
  communityJid: string;
  totalSent: number;
  totalFailed: number;
}

/** Minimal shape for broadcast objects. */
export interface ApiBroadcast {
  id: number;
  status: string;
  totalMessages: number;
  sentCount: number;
  failedCount: number;
  messageText: string | null;
  createdAt: string;
  advertisementId: number | null;
  article?: { title: string } | null;
  editHistory?: unknown[];
}

/** Minimal shape for broadcast task objects. */
export interface ApiBroadcastTask {
  id: number;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  errorMessage: string | null;
  group?: { name: string } | null;
  admin?: { label: string } | null;
  groupId: number;
}

/** Minimal shape for advertisement objects. */
export interface ApiAd {
  id: number;
  status: string;
  [key: string]: unknown;
}

/** Minimal shape for advertisement template objects. */
export interface ApiAdTemplate {
  id: number;
  name: string;
  body: string | null;
  isActive: boolean;
  mediaId: number | null;
  media: { id: number; originalFilename: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

/** Minimal shape for worker objects. */
export interface ApiWorker {
  id: number;
  workerId: string;
  adminId: number;
  status: string;
  browserStatus: string;
  totalSent: number;
  totalFailed: number;
  lastError: string | null;
  openwaSessionId: string | null;
  openwaSessionStatus: string | null;
  lastHeartbeatAt: string | null;
  currentGroupId: string | null;
  [key: string]: unknown;
}

// ─── API modules ──────────────────────────────────────────────────

export const authApi = {
  login: (username: string, password: string) =>
    request<{ token: string; user: { id: number; username: string; role: string } }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ username, password }) }
    ),
  me: () => request<{ id: number; username: string; role: string }>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};

export const settingsApi = {
  list: () => request<Array<{ key: string; value: string }>>('/settings'),
  update: (entries: Array<{ key: string; value: string }>) =>
    request<{ success: boolean }>('/settings', { method: 'PUT', body: JSON.stringify(entries) }),
};

export const templateApi = {
  list: () => request<ApiTemplate[]>('/templates'),
  getActive: () => request<ApiTemplate | null>('/templates/active'),
  create: (data: { name: string; templateText: string }) =>
    request<ApiTemplate>('/templates', { method: 'POST', body: JSON.stringify(data) }),
  createAd: (data: Record<string, unknown>) =>
    request<ApiAd>('/advertisements', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { name?: string; templateText?: string }) =>
    request<ApiTemplate>(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  activate: (id: number) => request<ApiTemplate>(`/templates/${id}/activate`, { method: 'POST' }),
  deactivate: (id: number) => request<ApiTemplate>(`/templates/${id}/deactivate`, { method: 'POST' }),
  delete: (id: number) => request<void>(`/templates/${id}`, { method: 'DELETE' }),
  preview: (templateText: string) =>
    request<{ rendered: string }>('/templates/preview', { method: 'POST', body: JSON.stringify({ templateText }) }),
};

export const scraperApi = {
  getArticles: () => request<ApiArticle[]>('/scraper/articles'),
  run: (url: string) => request<{ detected: boolean; article?: ApiArticle }>('/scraper/run', { method: 'POST', body: JSON.stringify({ url }) }),
  runAll: () => request<{ scraped: number; articles: ApiArticle[] }>('/scraper/run-all', { method: 'POST' }),
  unseed: () => request<{ success: boolean; scraped: number; articles: ApiArticle[] }>('/scraper/unseed', { method: 'POST' }),
  getParsers: () => request<{ parsers: string[] }>('/scraper/parsers'),
  getActivity: (page = 1, limit = 20) => request<{ data: ApiScraperActivity[]; total: number; page: number; limit: number }>(`/scraper/activity?page=${page}&limit=${limit}`),
};

export const campaignApi = {
  getAdmins: () => request<ApiAdmin[]>('/campaigns/admins'),
  createAdmin: (data: { label: string; phoneNumber: string; sessionsPerAdmin?: number; autoCreateSession?: boolean; isSuperAdmin?: boolean }) =>
    request<ApiAdmin>('/campaigns/admins', { method: 'POST', body: JSON.stringify(data) }),
  toggleAdmin: (id: number) => request<ApiAdmin>(`/campaigns/admins/${id}/toggle`, { method: 'POST' }),
  toggleWarmup: (id: number) => request<ApiAdmin>(`/campaigns/admins/${id}/warmup`, { method: 'POST' }),
  toggleSuperAdmin: (id: number, isSuperAdmin: boolean) =>
    request<ApiAdmin>(`/campaigns/admins/${id}/super-admin`, { method: 'POST', body: JSON.stringify({ isSuperAdmin }) }),

  getGroups: () => request<ApiGroup[]>('/campaigns/groups'),
  createGroup: (data: { name: string; groupJid: string; communityId?: number }) =>
    request<ApiGroup>('/campaigns/groups', { method: 'POST', body: JSON.stringify(data) }),
  toggleGroup: (id: number) => request<ApiGroup>(`/campaigns/groups/${id}/toggle`, { method: 'POST' }),
  markGroupHealthy: (id: number) => request<ApiGroup>(`/campaigns/groups/${id}/mark-healthy`, { method: 'POST' }),
  linkGroupCommunity: (id: number, communityId: number) =>
    request<ApiGroup>(`/campaigns/groups/${id}/link-community`, { method: 'POST', body: JSON.stringify({ communityId }) }),
  unlinkGroupCommunity: (id: number) => request<ApiGroup>(`/campaigns/groups/${id}/unlink-community`, { method: 'POST' }),

  getCommunities: () => request<ApiCommunity[]>('/campaigns/communities'),
  createCommunity: (data: { name: string; communityJid: string }) =>
    request<ApiCommunity>('/campaigns/communities', { method: 'POST', body: JSON.stringify(data) }),
  communityBroadcast: (id: number) =>
    request<{ affectedGroups: number }>(`/campaigns/communities/${id}/broadcast`, { method: 'POST' }),

  getBroadcasts: (page = 1, limit = 25, status?: string) => {
    let url = `/campaigns/broadcasts?page=${page}&limit=${limit}`;
    if (status) url += `&status=${status}`;
    return request<{ data: ApiBroadcast[]; total: number; page: number; limit: number }>(url);
  },
  getBroadcast: (id: number) => request<{ broadcast: ApiBroadcast; tasks: ApiBroadcastTask[] }>(`/campaigns/broadcasts/${id}`),
  editBroadcast: (id: number, messageText: string) =>
    request<{ edited: number; failed: number }>(`/campaigns/broadcasts/${id}/edit`, {
      method: 'PATCH', body: JSON.stringify({ messageText }),
    }),
  deleteBroadcast: (id: number) =>
    request<{ deleted: number; failed: number }>(`/campaigns/broadcasts/${id}`, {
      method: 'DELETE',
    }),
  retryBroadcast: (id: number) => request<{ retried: number }>(`/campaigns/broadcasts/${id}/retry`, { method: 'POST' }),
  retryAllBroadcasts: () => request<{ retried: number; broadcasts: number }>('/campaigns/broadcasts/retry-all', { method: 'POST' }),
  recoverGroups: () => request<{ recovered: number }>('/campaigns/recover-groups', { method: 'POST' }),
  setGroupTargets: (groupIds: number[]) =>
    request<{ targeted: number }>('/campaigns/groups/set-targets', {
      method: 'POST',
      body: JSON.stringify({ groupIds }),
    }),
};

async function uploadFile<T>(endpoint: string, file: File, fieldName = 'file'): Promise<T> {
  const token = getToken();
  const formData = new FormData();
  formData.append(fieldName, file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}${endpoint}`, true);

    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.onload = () => {
      if (xhr.status === 401) {
        redirectToLogin();
        return reject(new Error('Please sign in again. Your session has expired.'));
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response as T);
        } catch (e) {
          resolve({} as T);
        }
      } else {
        let message = `HTTP ${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body.message) message = body.message;
        } catch (e) {
          // ignore
        }
        reject(new Error(message));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    
    xhr.send(formData);
  });
}

export const adApi = {
  list: (status?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.set('status', status);
    if (search) params.set('search', search);
    const qs = params.toString();
    return request<ApiAd[]>(`/advertisements${qs ? `?${qs}` : ''}`);
  },
  get: (id: number) => request<ApiAd>(`/advertisements/${id}`),
  getStatistics: (id: number) => request<Record<string, unknown>>(`/advertisements/${id}/statistics`),
  getTelemetry: (id: number) => request<Record<string, unknown> & { status?: string }>(`/advertisements/${id}/telemetry`),
  getLogs: (id: number, page = 1) => request<{ groupName: string; status: string; timestamp: string }[]>(`/advertisements/${id}/logs?page=${page}`),
  create: (data: Record<string, unknown>) => request<ApiAd>('/advertisements', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Record<string, unknown>) => request<ApiAd>(`/advertisements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  send: (id: number) => request<ApiAd>(`/advertisements/${id}/send`, { method: 'POST' }),
  delete: (id: number) => request<void>(`/advertisements/${id}`, { method: 'DELETE' }),
  uploadMedia: (id: number, file: File) =>
    uploadFile<{ id: number }>(`/advertisements/${id}/media`, file, 'file'),
  removeMedia: (id: number) => request<void>(`/advertisements/media/${id}`, { method: 'DELETE' }),

  // ─── Templates ─────────────────────────────────────────────
  listTemplates: (adId: number) => request<ApiAdTemplate[]>(`/advertisements/${adId}/templates`),
  createTemplate: (adId: number, data: { name: string; body?: string; mediaId?: number }) =>
    request<ApiAdTemplate>(`/advertisements/${adId}/templates`, { method: 'POST', body: JSON.stringify(data) }),
  updateTemplate: (adId: number, tplId: number, data: { name?: string; body?: string; mediaId?: number }) =>
    request<ApiAdTemplate>(`/advertisements/${adId}/templates/${tplId}`, { method: 'PUT', body: JSON.stringify(data) }),
  activateTemplate: (adId: number, tplId: number) =>
    request<ApiAdTemplate>(`/advertisements/${adId}/templates/${tplId}/activate`, { method: 'POST' }),
  deleteTemplate: (adId: number, tplId: number) =>
    request<void>(`/advertisements/${adId}/templates/${tplId}`, { method: 'DELETE' }),
};

export const automationApi = {
  getWorkers: () => request<ApiWorker[]>('/automation/workers'),
  getWorkerLogs: (workerId: string) => request<Record<string, unknown>[]>(`/automation/workers/${workerId}/logs`),

  // ─── Admin Sessions ────────────────────────────────────────────
  createAdminSessions: (adminId: number) =>
    request<{ adminId: number; sessions: Array<{ id: number; slot: number; openwaSessionId: string; status: string }> }>(
      `/automation/admin/${adminId}/session/create`, { method: 'POST' }
    ),
  startAdminSession: (adminId: number, slot: number) =>
    request<{ status: string; qrCode?: string }>(
      `/automation/admin/${adminId}/session/${slot}/start`, { method: 'POST' }
    ),
  stopAdminSession: (adminId: number, slot: number) =>
    request<{ success: boolean }>(
      `/automation/admin/${adminId}/session/${slot}/stop`, { method: 'POST' }
    ),
  deleteAdminSession: (adminId: number, slot: number) =>
    request<void>(`/automation/admin/${adminId}/session/${slot}`, { method: 'DELETE' }),
  getAdminSessionQR: (adminId: number, slot: number) =>
    request<{ qrCode: string; status: string }>(
      `/automation/admin/${adminId}/session/${slot}/qr`
    ),
  listAdminSessions: (adminId: number) =>
    request<Array<{ id: number; sessionIndex: number; openwaSessionId: string; openwaSessionStatus: string; phone: string | null; pushName: string | null }>>(
      `/automation/admin/${adminId}/sessions`
    ),
  listAllAdminSessions: () =>
    request<Array<{ id: number; adminId: number; sessionIndex: number; openwaSessionId: string; openwaSessionStatus: string; phone: string | null; pushName: string | null }>>(
      '/automation/admin/sessions'
    ),

  // ─── Groups & Communities ──────────────────────────────────────
  fetchAdminGroups: (adminId: number, slot: number) =>
    request<Array<{ id: string; name: string }>>(
      `/automation/admin/${adminId}/session/${slot}/groups`
    ),
  importAdminGroups: (adminId: number, slot: number) =>
    request<{ imported: number; skipped: number }>(
      `/automation/admin/${adminId}/session/${slot}/import-groups`, { method: 'POST' }
    ),
  fetchAdminCommunities: (adminId: number, slot: number) =>
    request<Array<{ id: string; name: string }>>(
      `/automation/admin/${adminId}/session/${slot}/communities`
    ),
  importAdminCommunities: (adminId: number, slot: number) =>
    request<{ imported: number; skipped: number }>(
      `/automation/admin/${adminId}/session/${slot}/import-communities`, { method: 'POST' }
    ),

  // ─── Legacy ────────────────────────────────────────────────────
  checkSession: (sessionId: string) => request<{ sessionId: string; status: string }>(
    `/automation/session/${sessionId}/check`, { method: 'POST' }
  ),
  getQr: (sessionId: string) => request<{ sessionId: string; qr: string | null }>(
    `/automation/session/${sessionId}/qr`
  ),
  getRateLimits: (adminId: number) => request<Record<string, unknown>>(`/automation/rate-limits/${adminId}`),
  listDisconnectedSessions: () =>
    request<Array<{ adminId: number; sessionIndex: number; label: string | null; sessionName: string; status: string }>>(
      '/automation/admin/sessions/disconnected'
    ),
  autoReconnectSessions: () =>
    request<{
      reconnected: { adminId: number; sessionIndex: number }[];
      failed: { adminId: number; sessionIndex: number; label: string | null; sessionName: string; status: string }[];
    }>('/automation/admin/sessions/auto-reconnect', { method: 'POST' }),
};
