const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

export async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params } = options;

  let url = `${API_BASE}${endpoint}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// API response types (matching backend schemas)
export interface ApiUser {
  id: number;
  name: string;
  handle: string;
  avatar: string | null;
  trust_score: number;
  bio?: string | null;
  created_at?: string;
  available_balance?: number;
  free_posts_remaining?: number;
  followers_count?: number;
  following_count?: number;
  is_following?: boolean;
  creator_score?: number;
  curator_score?: number;
  juror_score?: number;
  risk_score?: number;
}

export interface ApiTrustBreakdown {
  user_id: number;
  trust_score: number;
  tier: string;
  fee_multiplier: number;
  creator_score: number;
  curator_score: number;
  juror_score: number;
  risk_score: number;
}

export interface ApiUserCosts {
  user_id: number;
  trust_score: number;
  tier: string;
  fee_multiplier: number;
  costs: {
    post: number;
    question: number;
    answer: number;
    comment: number;
    reply: number;
    like_post: number;
    like_comment: number;
  };
}

export interface ApiLedgerEntry {
  id: number;
  user_id: number;
  amount: number;
  balance_after: number;
  action_type: string;
  ref_type: string;
  ref_id: number | null;
  note: string | null;
  created_at: string;
}

export interface ApiBalanceResponse {
  user_id: number;
  available_balance: number;
  change_24h: number;
}

export interface ApiPost {
  id: number;
  author: ApiUser;
  content: string;
  post_type: 'note' | 'question';
  status: string;
  likes_count: number;
  comments_count: number;
  bounty: number | null;
  cost_paid: number;
  is_ai: boolean;
  created_at: string;
  is_liked: boolean;
}

export interface ApiComment {
  id: number;
  post_id: number;
  author: ApiUser;
  content: string;
  parent_id: number | null;
  likes_count: number;
  cost_paid: number;
  is_liked: boolean;
  created_at: string;
}

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
  message_type: 'text' | 'system';
  status: 'sent' | 'pending';
  reply_to: ApiReplyInfo | null;
  reactions: ApiReaction[];
  created_at: string;
}

// Reward types
export interface ApiDiscoveryLike {
  user_id: number;
  handle: string;
  trust_score: number;
  w_trust: number;
  n_novelty: number;
  s_source: number;
  weight: number;
}

export interface ApiDiscoveryBreakdown {
  post_id: number;
  discovery_score: number;
  likes: ApiDiscoveryLike[];
  settlement: {
    status: string;
    author_reward: number;
    comment_pool: number;
    settled_at: string | null;
  } | null;
}

export interface ApiPendingItem {
  post_id: number;
  content_preview: string;
  discovery_score: number;
  days_left: number;
  created_at: string;
}

export interface ApiPendingRewards {
  user_id: number;
  pending: ApiPendingItem[];
}

export interface ApiRewardItem {
  post_id: number;
  content_preview: string;
  discovery_score: number;
  author_reward: number;
  comment_pool: number;
  settled_at: string | null;
}

export interface ApiUserRewards {
  user_id: number;
  total_earned: number;
  rewards: ApiRewardItem[];
}

// Challenge types
export interface ApiChallenge {
  id: number;
  content_type: 'post' | 'comment';
  content_id: number;
  challenger_id: number;
  author_id: number;
  reason: string;
  layer: number;
  status: 'pending' | 'guilty' | 'not_guilty';
  fee_paid: number;
  fine_amount: number;
  ai_verdict: string | null;
  ai_reason: string | null;
  ai_confidence: number | null;
  created_at: string;
  resolved_at: string | null;
}

// API methods
export const api = {
  // Users
  listUsers: () => apiRequest<ApiUser[]>('/api/users'),

  createUser: (data: { name: string; handle: string }) =>
    apiRequest<ApiUser>('/api/users', { method: 'POST', body: data }),

  getUser: (userId: number, currentUserId?: number) =>
    apiRequest<ApiUser>(`/api/users/${userId}`, { params: { current_user_id: currentUserId } }),

  updateUser: (userId: number, data: { name?: string; bio?: string; avatar?: string }) =>
    apiRequest<ApiUser>(`/api/users/${userId}`, { method: 'PATCH', body: data }),

  followUser: (userId: number, followerId: number) =>
    apiRequest<{ status: string }>(`/api/users/${userId}/follow`, {
      method: 'POST',
      params: { follower_id: followerId },
    }),

  unfollowUser: (userId: number, followerId: number) =>
    apiRequest<{ status: string }>(`/api/users/${userId}/follow`, {
      method: 'DELETE',
      params: { follower_id: followerId },
    }),

  getFollowers: (userId: number) => apiRequest<ApiUser[]>(`/api/users/${userId}/followers`),

  getFollowing: (userId: number) => apiRequest<ApiUser[]>(`/api/users/${userId}/following`),

  searchUsers: (query: string, limit = 10) =>
    apiRequest<ApiUser[]>('/api/users/search', { params: { q: query, limit } }),

  getUserByHandle: (handle: string, currentUserId?: number) =>
    apiRequest<ApiUser>(`/api/users/handle/${handle}`, { params: currentUserId ? { current_user_id: currentUserId } : {} }),

  checkMessagePermission: (senderId: number, recipientId: number) =>
    apiRequest<{ permission: string; reason: string; can_message: boolean }>(
      '/api/chat/permission',
      { params: { sender_id: senderId, recipient_id: recipientId } }
    ),

  getBalance: (userId: number) => apiRequest<ApiBalanceResponse>(`/api/users/${userId}/balance`),

  getLedger: (userId: number, limit = 50, offset = 0) =>
    apiRequest<ApiLedgerEntry[]>(`/api/users/${userId}/ledger`, { params: { limit, offset } }),

  getTrustBreakdown: (userId: number) =>
    apiRequest<ApiTrustBreakdown>(`/api/users/${userId}/trust`),

  getUserCosts: (userId: number) =>
    apiRequest<ApiUserCosts>(`/api/users/${userId}/costs`),

  // Posts
  createPost: (authorId: number, data: { content: string; post_type: string; bounty?: number }) =>
    apiRequest<ApiPost>('/api/posts', { method: 'POST', body: data, params: { author_id: authorId } }),

  getPosts: (filters?: { post_type?: string; author_id?: number; user_id?: number; limit?: number; offset?: number }) =>
    apiRequest<ApiPost[]>('/api/posts', { params: filters }),

  getFeed: (userId: number, limit = 20, offset = 0) =>
    apiRequest<ApiPost[]>('/api/posts/feed', { params: { user_id: userId, limit, offset } }),

  getPost: (postId: number, userId?: number) =>
    apiRequest<ApiPost>(`/api/posts/${postId}`, { params: { user_id: userId } }),

  likePost: (postId: number, userId: number) =>
    apiRequest<{ likes_count: number; is_liked: boolean }>(`/api/posts/${postId}/like`, {
      method: 'POST',
      params: { user_id: userId },
    }),

  unlikePost: (postId: number, userId: number) =>
    apiRequest<{ likes_count: number; is_liked: boolean }>(`/api/posts/${postId}/like`, {
      method: 'DELETE',
      params: { user_id: userId },
    }),

  getComments: (postId: number, userId?: number) =>
    apiRequest<ApiComment[]>(`/api/posts/${postId}/comments`, {
      params: { user_id: userId },
    }),

  createComment: (postId: number, authorId: number, data: { content: string; parent_id?: number }) =>
    apiRequest<ApiComment>(`/api/posts/${postId}/comments`, {
      method: 'POST',
      body: data,
      params: { author_id: authorId },
    }),

  likeComment: (postId: number, commentId: number, userId: number) =>
    apiRequest<{ likes_count: number; is_liked: boolean }>(
      `/api/posts/${postId}/comments/${commentId}/like`,
      { method: 'POST', params: { user_id: userId } },
    ),

  unlikeComment: (postId: number, commentId: number, userId: number) =>
    apiRequest<{ likes_count: number; is_liked: boolean }>(
      `/api/posts/${postId}/comments/${commentId}/like`,
      { method: 'DELETE', params: { user_id: userId } },
    ),

  // Chat
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

  sendMessage: (sessionId: number, senderId: number, content: string, replyToId?: number) =>
    apiRequest<ApiMessage[]>(`/api/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: { content, reply_to_id: replyToId || null },
      params: { sender_id: senderId },
    }),

  addReaction: (messageId: number, userId: number, emoji: string) =>
    apiRequest<{ id: number; message_id: number; user_id: number; emoji: string }>(`/api/chat/messages/${messageId}/reactions`, {
      method: 'POST',
      body: { emoji },
      params: { user_id: userId },
    }),

  removeReaction: (messageId: number, userId: number, emoji: string) =>
    apiRequest<{ status: string }>(`/api/chat/messages/${messageId}/reactions`, {
      method: 'DELETE',
      params: { user_id: userId, emoji },
    }),

  // Group management
  getGroupDetail: (sessionId: number, userId: number) =>
    apiRequest<ApiGroupDetail>(`/api/chat/sessions/${sessionId}/detail`, { params: { user_id: userId } }),

  updateGroup: (sessionId: number, userId: number, data: {
    name?: string;
    avatar?: string;
    description?: string;
    who_can_send?: string;
    who_can_add?: string;
    join_approval?: boolean;
    member_limit?: number;
  }) =>
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
    apiRequest<{ status: string; role: string }>(`/api/chat/sessions/${sessionId}/members/${targetUserId}/role`, {
      method: 'PATCH',
      body: { role },
      params: { user_id: userId },
    }),

  muteMember: (sessionId: number, userId: number, targetUserId: number, isMuted: boolean, durationHours?: number) =>
    apiRequest<{ status: string }>(`/api/chat/sessions/${sessionId}/members/${targetUserId}/mute`, {
      method: 'PATCH',
      body: { is_muted: isMuted, duration_hours: durationHours },
      params: { user_id: userId },
    }),

  transferOwnership: (sessionId: number, userId: number, newOwnerId: number) =>
    apiRequest<{ status: string }>(`/api/chat/sessions/${sessionId}/transfer`, {
      method: 'POST',
      body: { new_owner_id: newOwnerId },
      params: { user_id: userId },
    }),

  // Invite links
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

  // Join requests
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

  // Rewards
  getPostDiscovery: (postId: number) =>
    apiRequest<ApiDiscoveryBreakdown>(`/api/rewards/posts/${postId}/discovery`),

  getPendingRewards: (userId: number) =>
    apiRequest<ApiPendingRewards>(`/api/rewards/users/${userId}/pending-rewards`),

  getUserRewards: (userId: number, limit = 20) =>
    apiRequest<ApiUserRewards>(`/api/rewards/users/${userId}/rewards`, { params: { limit } }),

  // Challenges
  createChallenge: (challengerId: number, data: { content_type: string; content_id: number; reason: string }) =>
    apiRequest<ApiChallenge>('/api/challenges', {
      method: 'POST',
      body: data,
      params: { challenger_id: challengerId },
    }),

  getChallenge: (challengeId: number) =>
    apiRequest<ApiChallenge>(`/api/challenges/${challengeId}`),

  listChallenges: (filters?: { content_type?: string; content_id?: number; user_id?: number; author_id?: number }) =>
    apiRequest<ApiChallenge[]>('/api/challenges', { params: filters }),
};
