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
  list: () => request<any[]>('/templates'),
  getActive: () => request<any>('/templates/active'),
  create: (data: { name: string; templateText: string }) =>
    request<any>('/templates', { method: 'POST', body: JSON.stringify(data) }),
  createAd: (data: any) =>
    request<any>('/advertisements', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { name?: string; templateText?: string }) =>
    request<any>(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  activate: (id: number) => request<any>(`/templates/${id}/activate`, { method: 'POST' }),
  deactivate: (id: number) => request<any>(`/templates/${id}/deactivate`, { method: 'POST' }),
  delete: (id: number) => request<void>(`/templates/${id}`, { method: 'DELETE' }),
  preview: (templateText: string) =>
    request<{ rendered: string }>('/templates/preview', { method: 'POST', body: JSON.stringify({ templateText }) }),
};

export const scraperApi = {
  getArticles: () => request<any[]>('/scraper/articles'),
  run: (url: string) => request<any>('/scraper/run', { method: 'POST', body: JSON.stringify({ url }) }),
  runAll: () => request<{ scraped: number; articles: any[] }>('/scraper/run-all', { method: 'POST' }),
  unseed: () => request<{ success: boolean; scraped: number; articles: any[] }>('/scraper/unseed', { method: 'POST' }),
  getParsers: () => request<{ parsers: string[] }>('/scraper/parsers'),
  getActivity: (page = 1, limit = 20) => request<{ data: any[]; total: number; page: number; limit: number }>(`/scraper/activity?page=${page}&limit=${limit}`),
};

export const campaignApi = {
  getAdmins: () => request<any[]>('/campaigns/admins'),
  createAdmin: (data: { label: string; phoneNumber: string; sessionsPerAdmin?: number; autoCreateSession?: boolean; isSuperAdmin?: boolean }) =>
    request<any>('/campaigns/admins', { method: 'POST', body: JSON.stringify(data) }),
  toggleAdmin: (id: number) => request<any>(`/campaigns/admins/${id}/toggle`, { method: 'POST' }),
  toggleWarmup: (id: number) => request<any>(`/campaigns/admins/${id}/warmup`, { method: 'POST' }),
  toggleSuperAdmin: (id: number, isSuperAdmin: boolean) =>
    request<any>(`/campaigns/admins/${id}/super-admin`, { method: 'POST', body: JSON.stringify({ isSuperAdmin }) }),

  getGroups: () => request<any[]>('/campaigns/groups'),
  createGroup: (data: { name: string; groupJid: string; communityId?: number }) =>
    request<any>('/campaigns/groups', { method: 'POST', body: JSON.stringify(data) }),
  toggleGroup: (id: number) => request<any>(`/campaigns/groups/${id}/toggle`, { method: 'POST' }),
  markGroupHealthy: (id: number) => request<any>(`/campaigns/groups/${id}/mark-healthy`, { method: 'POST' }),
  linkGroupCommunity: (id: number, communityId: number) =>
    request<any>(`/campaigns/groups/${id}/link-community`, { method: 'POST', body: JSON.stringify({ communityId }) }),
  unlinkGroupCommunity: (id: number) => request<any>(`/campaigns/groups/${id}/unlink-community`, { method: 'POST' }),

  getCommunities: () => request<any[]>('/campaigns/communities'),
  createCommunity: (data: { name: string; communityJid: string }) =>
    request<any>('/campaigns/communities', { method: 'POST', body: JSON.stringify(data) }),
  communityBroadcast: (id: number) =>
    request<any>(`/campaigns/communities/${id}/broadcast`, { method: 'POST' }),

  getBroadcasts: (page = 1, limit = 25, status?: string) => {
    let url = `/campaigns/broadcasts?page=${page}&limit=${limit}`;
    if (status) url += `&status=${status}`;
    return request<{ data: any[]; total: number; page: number; limit: number }>(url);
  },
  getBroadcast: (id: number) => request<{ broadcast: any; tasks: any[] }>(`/campaigns/broadcasts/${id}`),
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

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (response.status === 401) {
    redirectToLogin();
    throw new Error('Please sign in again. Your session has expired.');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export const adApi = {
  list: () => request<any[]>('/advertisements'),
  get: (id: number) => request<any>(`/advertisements/${id}`),
  getStatistics: (id: number) => request<any>(`/advertisements/${id}/statistics`),
  getTelemetry: (id: number) => request<any>(`/advertisements/${id}/telemetry`),
  create: (data: any) => request<any>('/advertisements', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) => request<any>(`/advertisements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  send: (id: number) => request<any>(`/advertisements/${id}/send`, { method: 'POST' }),
  delete: (id: number) => request<void>(`/advertisements/${id}`, { method: 'DELETE' }),
  uploadMedia: (id: number, file: File) =>
    uploadFile<any>(`/advertisements/${id}/media`, file, 'file'),
};

export const automationApi = {
  getWorkers: () => request<any[]>('/automation/workers'),
  getWorkerLogs: (workerId: string) => request<any[]>(`/automation/workers/${workerId}/logs`),

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
  getRateLimits: (adminId: number) => request<any>(`/automation/rate-limits/${adminId}`),
  listDisconnectedSessions: () =>
    request<Array<{ adminId: number; label: string | null; sessionName: string; status: string }>>(
      '/automation/admin/sessions/disconnected'
    ),
};
