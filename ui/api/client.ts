const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8003';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | undefined>;
  skipAuth?: boolean;
}

let refreshPromise: Promise<void> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('bitlink_refresh_token');
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    localStorage.setItem('bitlink_access_token', data.access_token);
    localStorage.setItem('bitlink_refresh_token', data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params, skipAuth } = options;

  let url = `${API_BASE}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.append(key, String(value));
    });
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!skipAuth) {
    const token = localStorage.getItem('bitlink_access_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && !skipAuth) {
    if (!refreshPromise) {
      refreshPromise = tryRefreshToken().then((ok) => {
        refreshPromise = null;
        if (!ok) throw new Error('Token refresh failed');
      });
    }
    try {
      await refreshPromise;
      const newToken = localStorage.getItem('bitlink_access_token');
      if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      // Fall through with the original 401
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    let message = `HTTP ${response.status}`;
    if (error.detail) {
      if (typeof error.detail === 'string') message = error.detail;
      else if (Array.isArray(error.detail))
        message = error.detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join(', ');
      else message = JSON.stringify(error.detail);
    }
    throw new Error(message);
  }

  return response.json();
}

// ===========================================================================
// Response types
// ===========================================================================

export interface ApiUser {
  id: number;
  name: string;
  handle: string;
  avatar: string | null;
  bio?: string | null;
  embedded_wallet_address?: string | null;
  trust_score?: number;
  free_posts_remaining?: number;
  created_at?: string;
  followers_count?: number;
  following_count?: number;
  is_following?: boolean;
  // Deprecated — kept optional for legacy UI code paths during migration cleanup.
  available_balance?: number;
}

export interface ApiLedgerEntry {
  id: number;
  user_id: number;
  amount_usdc_micro: number;
  action_type: string;
  ref_type: string;
  ref_id: number | null;
  tx_hash: string | null;
  note: string | null;
  created_at: string;
}

export interface ApiWallet {
  user_id: number;
  embedded_wallet_address: string | null;
  delegated_actions_enabled: boolean;
}

export interface ApiPost {
  id: number;
  author: ApiUser;
  title?: string | null;
  content: string;
  content_format?: 'plain' | 'markdown' | 'html';
  post_type: 'note' | 'article' | 'question';
  status: string;
  likes_count: number;
  comments_count: number;
  bounty: number | null;
  tip_count: number;
  tip_total_usdc_micro: number;
  media_urls: string[];
  is_ai: boolean;
  quality?: string | null;
  tags?: string[] | null;
  ai_summary?: string | null;
  created_at: string;
  is_liked: boolean;
  // Deprecated — kept optional for legacy UI code paths
  cost_paid?: number;
}

export interface ApiComment {
  id: number;
  post_id: number;
  author: ApiUser;
  content: string;
  parent_id: number | null;
  likes_count: number;
  is_liked: boolean;
  created_at: string;
  // Deprecated — kept optional
  cost_paid?: number;
}

// --- Tip flow ---

export interface TipQuote {
  post_id: number;
  creator_user_id: number;
  creator_handle: string;
  creator_wallet: string;
  amount_usdc_micro: number;
  usdc_token_address: string;
  chain_id: number;
  min_tip_micro: number;
  max_tip_micro: number;
  already_tipped: boolean;
}

export interface TipConfirmResult {
  tip_id: number;
  post_id: number;
  creator_user_id: number;
  amount_usdc_micro: number;
  tx_hash: string;
  confirmed_at: string;
  post_likes_count: number;
  post_tip_total_usdc_micro: number;
}

export interface TipHistoryItem {
  id: number;
  direction: 'sent' | 'received';
  amount_usdc_micro: number;
  counterparty_handle: string | null;
  post_id: number | null;
  tx_hash: string | null;
  created_at: string;
}

// --- Wallet link (Privy first-time) ---

export interface LinkWalletPayload {
  embedded_wallet_address: string;
  delegated_actions_enabled?: boolean;
  name?: string;
  handle?: string;
  avatar?: string;
  email?: string;
}

export interface LinkWalletResult {
  user_id: number;
  handle: string;
  embedded_wallet_address: string;
  delegated_actions_enabled: boolean;
  is_new: boolean;
}

// --- Chat (unchanged shapes) ---

export interface ApiChatSession {
  id: number;
  name: string | null;
  is_group: boolean;
  avatar: string | null;
  description: string | null;
  owner_id: number | null;
  members: ApiUser[];
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  who_can_send: string;
  who_can_add: string;
  join_approval: boolean;
  member_limit: number | null;
  created_at: string;
  user_has_left: boolean;
}

export interface ApiMemberInfo {
  user: ApiUser;
  role: 'owner' | 'admin' | 'member';
  is_muted: boolean;
  joined_at: string;
}

export interface ApiGroupDetail {
  id: number;
  name: string | null;
  avatar: string | null;
  description: string | null;
  owner_id: number;
  members: ApiMemberInfo[];
  member_count: number;
  who_can_send: string;
  who_can_add: string;
  join_approval: boolean;
  member_limit: number | null;
  my_role: 'owner' | 'admin' | 'member';
  created_at: string;
}

export interface ApiInviteLink {
  id: number;
  code: string;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  is_active: boolean;
  created_at: string;
}

export interface ApiInvitePreview {
  group_name: string | null;
  avatar: string | null;
  description: string | null;
  member_count: number;
  requires_approval: boolean;
}

export interface ApiJoinRequest {
  id: number;
  session_id: number;
  user: ApiUser;
  invite_code: string | null;
  status: string;
  created_at: string;
}

export interface ApiReaction {
  emoji: string;
  user_id: number;
  user_name: string;
}

export interface ApiReplyInfo {
  id: number;
  content: string;
  sender_id: number;
  sender_name: string;
}

export interface ApiMessage {
  id: number;
  session_id: number;
  sender_id: number;
  sender: ApiUser;
  content: string;
  media_url: string | null;
  message_type: 'text' | 'image' | 'system';
  status: 'sent' | 'pending';
  reply_to: ApiReplyInfo | null;
  reactions: ApiReaction[];
  created_at: string;
}

export interface MediaUploadResponse {
  url: string;
  thumbnail_url: string;
  media_type: string;
}

export interface ApiDraft {
  id: number;
  post_type: 'note' | 'article' | 'question';
  title: string | null;
  content: string;
  bounty: number | null;
  has_title: boolean;
  created_at: string;
  updated_at: string;
}

// --- Free post quota ---

export interface FreeQuotaResponse {
  free_posts_remaining: number;
  daily_quota: number;
  message: string;
}

// ===========================================================================
// API
// ===========================================================================

export const api = {
  // --- Users ---
  listUsers: () => apiRequest<ApiUser[]>('/api/users'),

  getMe: () => apiRequest<ApiUser>('/api/users/me'),

  getUser: (userId: number) => apiRequest<ApiUser>(`/api/users/${userId}`),

  updateMe: (data: { name?: string; bio?: string; avatar?: string }) =>
    apiRequest<ApiUser>('/api/users/me', { method: 'PATCH', body: data }),

  followUser: (userId: number) =>
    apiRequest<{ status: string }>(`/api/users/${userId}/follow`, { method: 'POST' }),

  unfollowUser: (userId: number) =>
    apiRequest<{ status: string }>(`/api/users/${userId}/follow`, { method: 'DELETE' }),

  getFollowers: (userId: number) => apiRequest<ApiUser[]>(`/api/users/${userId}/followers`),

  getFollowing: (userId: number) => apiRequest<ApiUser[]>(`/api/users/${userId}/following`),

  searchUsers: (query: string, limit = 10) =>
    apiRequest<ApiUser[]>('/api/users/search', { params: { q: query, limit } }),

  getUserByHandle: (handle: string) =>
    apiRequest<ApiUser>(`/api/users/handle/${handle}`),

  getMyLedger: (limit = 50, offset = 0) =>
    apiRequest<ApiLedgerEntry[]>('/api/users/me/ledger', { params: { limit, offset } }),

  getMyWallet: () => apiRequest<ApiWallet>('/api/users/me/wallet'),

  // --- Posts ---
  getFreeQuota: () => apiRequest<FreeQuotaResponse>('/api/posts/free-quota'),

  createPost: (data: {
    content: string;
    post_type: string;
    title?: string;
    content_format?: string;
    bounty?: number;
    media_urls?: string[];
  }) => apiRequest<ApiPost>('/api/posts', { method: 'POST', body: data }),

  getPosts: (filters?: { post_type?: string; author_id?: number; limit?: number; offset?: number }) =>
    apiRequest<ApiPost[]>('/api/posts', { params: filters }),

  getFeed: (limit = 30, offset = 0) =>
    apiRequest<ApiPost[]>('/api/posts/feed', { params: { limit, offset } }),

  getPost: (postId: number) => apiRequest<ApiPost>(`/api/posts/${postId}`),

  deletePost: (postId: number) =>
    apiRequest<{ status: string }>(`/api/posts/${postId}`, { method: 'DELETE' }),

  // --- Comments ---
  getComments: (postId: number) =>
    apiRequest<ApiComment[]>(`/api/posts/${postId}/comments`),

  createComment: (postId: number, data: { content: string; parent_id?: number }) =>
    apiRequest<ApiComment>(`/api/posts/${postId}/comments`, { method: 'POST', body: data }),

  deleteComment: (commentId: number) =>
    apiRequest<{ status: string }>(`/api/posts/comments/${commentId}`, { method: 'DELETE' }),

  likeComment: (postId: number, commentId: number) =>
    apiRequest<{ is_liked: boolean; likes_count: number }>(
      `/api/posts/${postId}/comments/${commentId}/like`,
      { method: 'POST' },
    ),

  unlikeComment: (postId: number, commentId: number) =>
    apiRequest<{ is_liked: boolean; likes_count: number }>(
      `/api/posts/${postId}/comments/${commentId}/like`,
      { method: 'DELETE' },
    ),

  // --- Tips (replaces post-likes economic flow) ---
  tipQuote: (post_id: number, amount_usdc_micro: number) =>
    apiRequest<TipQuote>('/api/tips/quote', {
      method: 'POST',
      body: { post_id, amount_usdc_micro },
    }),

  tipConfirm: (post_id: number, tx_hash: string) =>
    apiRequest<TipConfirmResult>('/api/tips/confirm', {
      method: 'POST',
      body: { post_id, tx_hash },
    }),

  getTipHistory: (limit = 50, offset = 0) =>
    apiRequest<TipHistoryItem[]>('/api/tips/history', { params: { limit, offset } }),

  // --- Wallet ---
  linkWallet: (payload: LinkWalletPayload) =>
    apiRequest<LinkWalletResult>('/api/wallet/link', { method: 'POST', body: payload }),

  // --- Chat (still uses ?user_id= legacy; deferred refactor) ---
  createChatSession: (creatorId: number, data: { member_ids: number[]; name?: string; is_group?: boolean }) =>
    apiRequest<ApiChatSession>('/api/chat/sessions', {
      method: 'POST',
      body: data,
      params: { creator_id: creatorId },
    }),

  getChatSessions: (userId: number) =>
    apiRequest<ApiChatSession[]>('/api/chat/sessions', { params: { user_id: userId } }),

  getChatSession: (sessionId: number, userId: number) =>
    apiRequest<ApiChatSession>(`/api/chat/sessions/${sessionId}`, { params: { user_id: userId } }),

  getMessages: (sessionId: number, userId: number, beforeId?: number) =>
    apiRequest<ApiMessage[]>(`/api/chat/sessions/${sessionId}/messages`, {
      params: { user_id: userId, before_id: beforeId },
    }),

  sendMessage: (sessionId: number, senderId: number, content: string, replyToId?: number, mediaUrl?: string) =>
    apiRequest<ApiMessage[]>(`/api/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: { content, reply_to_id: replyToId || null, media_url: mediaUrl || null },
      params: { sender_id: senderId },
    }),

  addReaction: (messageId: number, userId: number, emoji: string) =>
    apiRequest<{ id: number; message_id: number; user_id: number; emoji: string }>(
      `/api/chat/messages/${messageId}/reactions`,
      { method: 'POST', body: { emoji }, params: { user_id: userId } },
    ),

  removeReaction: (messageId: number, userId: number, emoji: string) =>
    apiRequest<{ status: string }>(`/api/chat/messages/${messageId}/reactions`, {
      method: 'DELETE',
      params: { user_id: userId, emoji },
    }),

  getGroupDetail: (sessionId: number, userId: number) =>
    apiRequest<ApiGroupDetail>(`/api/chat/sessions/${sessionId}/detail`, { params: { user_id: userId } }),

  updateGroup: (sessionId: number, userId: number, data: Record<string, unknown>) =>
    apiRequest<ApiChatSession>(`/api/chat/sessions/${sessionId}`, {
      method: 'PATCH',
      body: data,
      params: { user_id: userId },
    }),

  deleteGroup: (sessionId: number, userId: number) =>
    apiRequest<{ status: string }>(`/api/chat/sessions/${sessionId}`, {
      method: 'DELETE',
      params: { user_id: userId },
    }),

  addMembers: (sessionId: number, userId: number, userIds: number[]) =>
    apiRequest<{ added: number }>(`/api/chat/sessions/${sessionId}/members`, {
      method: 'POST',
      body: { user_ids: userIds },
      params: { user_id: userId },
    }),

  removeMember: (sessionId: number, userId: number, targetUserId: number) =>
    apiRequest<{ status: string }>(`/api/chat/sessions/${sessionId}/members/${targetUserId}`, {
      method: 'DELETE',
      params: { user_id: userId },
    }),

  leaveGroup: (sessionId: number, userId: number) =>
    apiRequest<{ status: string }>(`/api/chat/sessions/${sessionId}/leave`, {
      method: 'POST',
      params: { user_id: userId },
    }),

  updateMemberRole: (sessionId: number, userId: number, targetUserId: number, role: 'admin' | 'member') =>
    apiRequest<{ status: string; role: string }>(
      `/api/chat/sessions/${sessionId}/members/${targetUserId}/role`,
      { method: 'PATCH', body: { role }, params: { user_id: userId } },
    ),

  muteMember: (sessionId: number, userId: number, targetUserId: number, isMuted: boolean, durationHours?: number) =>
    apiRequest<{ status: string }>(
      `/api/chat/sessions/${sessionId}/members/${targetUserId}/mute`,
      { method: 'PATCH', body: { is_muted: isMuted, duration_hours: durationHours }, params: { user_id: userId } },
    ),

  transferOwnership: (sessionId: number, userId: number, newOwnerId: number) =>
    apiRequest<{ status: string }>(`/api/chat/sessions/${sessionId}/transfer`, {
      method: 'POST',
      body: { new_owner_id: newOwnerId },
      params: { user_id: userId },
    }),

  createInviteLink: (sessionId: number, userId: number, expiresInDays?: number, maxUses?: number) =>
    apiRequest<ApiInviteLink>(`/api/chat/sessions/${sessionId}/invite-link`, {
      method: 'POST',
      body: { expires_in_days: expiresInDays, max_uses: maxUses },
      params: { user_id: userId },
    }),

  getInviteLinks: (sessionId: number, userId: number) =>
    apiRequest<ApiInviteLink[]>(`/api/chat/sessions/${sessionId}/invite-links`, {
      params: { user_id: userId },
    }),

  revokeInviteLink: (code: string, userId: number) =>
    apiRequest<{ status: string }>(`/api/chat/invite-links/${code}`, {
      method: 'DELETE',
      params: { user_id: userId },
    }),

  previewInvite: (code: string) =>
    apiRequest<ApiInvitePreview>(`/api/chat/invite/${code}/preview`),

  joinViaInvite: (code: string, userId: number) =>
    apiRequest<{ status: string; session_id: number }>(`/api/chat/join/${code}`, {
      method: 'POST',
      params: { user_id: userId },
    }),

  getJoinRequests: (sessionId: number, userId: number) =>
    apiRequest<ApiJoinRequest[]>(`/api/chat/sessions/${sessionId}/join-requests`, {
      params: { user_id: userId },
    }),

  handleJoinRequest: (sessionId: number, requestId: number, userId: number, action: 'approve' | 'reject') =>
    apiRequest<{ status: string }>(`/api/chat/sessions/${sessionId}/join-requests/${requestId}`, {
      method: 'POST',
      body: { action },
      params: { user_id: userId },
    }),

  checkMessagePermission: (senderId: number, recipientId: number) =>
    apiRequest<{ permission: string; reason: string; can_message: boolean }>(
      '/api/chat/permission',
      { params: { sender_id: senderId, recipient_id: recipientId } },
    ),

  // --- Drafts ---
  getDrafts: () => apiRequest<ApiDraft[]>('/api/drafts'),

  createDraft: (data: {
    post_type: string;
    title?: string;
    content: string;
    bounty?: number;
    has_title: boolean;
  }) => apiRequest<ApiDraft>('/api/drafts', { method: 'POST', body: data }),

  updateDraft: (draftId: number, data: {
    post_type?: string;
    title?: string;
    content?: string;
    bounty?: number;
    has_title?: boolean;
  }) => apiRequest<ApiDraft>(`/api/drafts/${draftId}`, { method: 'PUT', body: data }),

  deleteDraft: (draftId: number) =>
    apiRequest<void>(`/api/drafts/${draftId}`, { method: 'DELETE' }),

  // --- Media ---
  uploadMedia: async (file: Blob, purpose: 'post' | 'chat'): Promise<MediaUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file, 'image.webp');
    const response = await fetch(`${API_BASE}/api/media/upload?purpose=${purpose}`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }
    return response.json();
  },

  // --- Auth (legacy local JWT path — kept for dev; new path is /api/wallet/link) ---
  googleLogin: (idToken: string) =>
    apiRequest<{ access_token: string; refresh_token: string; needs_onboarding: boolean }>(
      '/api/auth/google',
      { method: 'POST', body: { id_token: idToken }, skipAuth: true },
    ),

  refreshTokens: (refreshToken: string) =>
    apiRequest<{ access_token: string; refresh_token: string }>(
      '/api/auth/refresh',
      { method: 'POST', body: { refresh_token: refreshToken }, skipAuth: true },
    ),

  authLogout: (refreshToken: string) =>
    apiRequest<void>('/api/auth/logout', { method: 'POST', body: { refresh_token: refreshToken } }),

  authMe: () => apiRequest<ApiUser>('/api/auth/me'),
};

// Compatibility helper kept so older callsites compile during migration.
// Returns the user's free post quota — formerly used to compute SAT cost.
export type ApiUserCosts = FreeQuotaResponse;
