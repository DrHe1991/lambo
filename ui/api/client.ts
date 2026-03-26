const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
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
    let message = `HTTP ${response.status}`;
    if (error.detail) {
      if (typeof error.detail === 'string') {
        message = error.detail;
      } else if (Array.isArray(error.detail)) {
        message = error.detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join(', ');
      } else {
        message = JSON.stringify(error.detail);
      }
    }
    throw new Error(message);
  }

  return response.json();
}

// API response types (matching backend schemas)
export interface ApiUser {
  id: number;
  name: string;
  handle: string;
  avatar: string | null;
  bio?: string | null;
  created_at?: string;
  available_balance?: number;
  followers_count?: number;
  following_count?: number;
  is_following?: boolean;
}

export interface ApiUserCosts {
  user_id: number;
  costs: {
    post: number;
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
  title?: string | null;
  content: string;
  content_format?: 'plain' | 'markdown' | 'html';
  post_type: 'note' | 'article' | 'question';
  status: string;
  likes_count: number;
  comments_count: number;
  bounty: number | null;
  cost_paid: number;
  media_urls: string[];
  is_ai: boolean;
  created_at: string;
  is_liked: boolean;
  like_status?: 'pending' | 'settled' | null;
  locked_until?: string | null;
  boost_amount?: number;
  boost_remaining?: number;
}

export interface ApiCostEstimate {
  base_cost: number;
  length_cost: number;
  fee_paid: number;
  total: number;
  content_limits: { min: number; max: number };
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
  like_status?: 'pending' | 'settled' | null;
  like_locked_until?: string | null;
  created_at: string;
  interaction_status?: 'pending' | 'settled' | 'cancelled';
  locked_until?: string | null;
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

// Reward, Challenge, and Boost types removed in minimal system

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

// Crypto/Pay types
export interface CryptoBalance {
  token_symbol: string;
  balance: number;
  balance_formatted: string;
}

export interface CryptoBalanceResponse {
  balances: CryptoBalance[];
}

export interface DepositAddress {
  chain: string;
  address: string;
}

export interface CryptoDeposit {
  id: number;
  chain: string;
  tx_hash: string;
  token_symbol: string;
  amount: number;
  amount_formatted: string;
  status: string;
  confirmations: number;
  created_at: string;
}

export interface CryptoDepositsResponse {
  deposits: CryptoDeposit[];
}

export interface CryptoWithdrawal {
  id: number;
  chain: string;
  to_address: string;
  token_symbol: string;
  amount: number;
  amount_formatted: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
}

export interface CryptoWithdrawalsResponse {
  withdrawals: CryptoWithdrawal[];
}

export interface WithdrawalRequest {
  to_address: string;
  amount: number;
  chain?: string;
  token_symbol?: string;
}

// Exchange types
export interface ExchangeQuota {
  btc_price: number;
  buy_sat: {
    initial: number;
    remaining: number;
    remaining_usd: number;
  };
  sell_sat: {
    initial: number;
    remaining: number;
    remaining_usd: number;
  };
}

export interface ChainFee {
  chain: string;
  min_deposit: number;
  network_fee: number;
  enabled: boolean;
  receive_amount: number;
}

export interface ExchangePreview {
  preview_id: string;
  wallet_id: number;
  direction: string;
  amount_in: number;
  amount_out: number;
  btc_price: number;
  buffer_rate: number;
  bonus_sat: number;
  total_out: number;
  expires_in_seconds: number;
}

export interface ExchangeResult {
  id: number;
  wallet_id: number;
  direction: string;
  amount_in: number;
  amount_out: number;
  btc_price: number;
  buffer_fee: number;
  bonus_sat: number;
  created_at: string;
}

export interface ExchangeHistoryItem {
  id: number;
  direction: string;
  amount_in: number;
  amount_out: number;
  btc_price: number;
  buffer_fee: number;
  bonus_sat: number;
  created_at: string;
}

export interface UserBalances {
  sat_balance: number;
  stable_balance: number;
  stable_formatted: string;
  first_exchange_eligible: boolean;
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

  getUserCosts: (userId: number) =>
    apiRequest<ApiUserCosts>(`/api/users/${userId}/costs`),

  // Posts
  createPost: (authorId: number, data: {
    content: string;
    post_type: string;
    title?: string;
    content_format?: string;
    bounty?: number;
    media_urls?: string[];
  }) =>
    apiRequest<ApiPost>('/api/posts', { method: 'POST', body: data, params: { author_id: authorId } }),

  estimatePostCost: (authorId: number, contentLength: number, postType = 'article') =>
    apiRequest<ApiCostEstimate>('/api/posts/estimate-cost', {
      method: 'POST',
      body: { content_length: contentLength, post_type: postType },
      params: { author_id: authorId },
    }),

  getPosts: (filters?: { post_type?: string; author_id?: number; user_id?: number; limit?: number; offset?: number }) =>
    apiRequest<ApiPost[]>('/api/posts', { params: filters }),

  getFeed: (userId: number, limit = 30, offset = 0) =>
    apiRequest<ApiPost[]>('/api/posts/feed', { params: { user_id: userId, limit, offset } }),

  getPost: (postId: number, userId?: number) =>
    apiRequest<ApiPost>(`/api/posts/${postId}`, { params: { user_id: userId } }),

  getLikeCost: (postId: number) =>
    apiRequest<{ post_id: number; cost: number; likes_count: number }>(`/api/posts/${postId}/like-cost`),

  likePost: (postId: number, userId: number) =>
    apiRequest<{
      likes_count: number;
      is_liked: boolean;
      like_status: 'pending' | 'settled';
      locked_until: string;
      cost: number;
      your_weight: number;
      like_rank: number;
    }>(`/api/posts/${postId}/like`, {
      method: 'POST',
      params: { user_id: userId },
    }),

  unlikePost: (postId: number, userId: number) =>
    apiRequest<{
      likes_count: number;
      is_liked: boolean;
      refund_amount: number;
      refund_rate: string;
    }>(`/api/posts/${postId}/like`, {
      method: 'DELETE',
      params: { user_id: userId },
    }),

  getPostLikers: (postId: number) =>
    apiRequest<{ likers: { user_id: number; username: string; cost_paid: number; weight: number; created_at: string }[] }>(`/api/posts/${postId}/likers`),

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
    apiRequest<{
      likes_count: number;
      is_liked: boolean;
      like_status: 'pending' | 'settled';
      locked_until: string;
      cost: number;
      your_weight: number;
      like_rank: number;
    }>(
      `/api/posts/${postId}/comments/${commentId}/like`,
      { method: 'POST', params: { user_id: userId } },
    ),

  unlikeComment: (postId: number, commentId: number, userId: number) =>
    apiRequest<{
      likes_count: number;
      is_liked: boolean;
      refund_amount: number;
      refund_rate: string;
    }>(
      `/api/posts/${postId}/comments/${commentId}/like`,
      { method: 'DELETE', params: { user_id: userId } },
    ),

  deleteComment: (commentId: number, userId: number) =>
    apiRequest<{ status: string; refunded: number; penalty: number }>(
      `/api/posts/comments/${commentId}`,
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

  sendMessage: (sessionId: number, senderId: number, content: string, replyToId?: number, mediaUrl?: string) =>
    apiRequest<ApiMessage[]>(`/api/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: { content, reply_to_id: replyToId || null, media_url: mediaUrl || null },
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

  // Rewards, Challenges, and Boost removed in minimal system

  // Drafts
  getDrafts: (userId: number) =>
    apiRequest<ApiDraft[]>('/api/drafts', { params: { user_id: userId } }),

  createDraft: (userId: number, data: {
    post_type: string;
    title?: string;
    content: string;
    bounty?: number;
    has_title: boolean;
  }) =>
    apiRequest<ApiDraft>('/api/drafts', { method: 'POST', body: data, params: { user_id: userId } }),

  updateDraft: (draftId: number, userId: number, data: {
    post_type?: string;
    title?: string;
    content?: string;
    bounty?: number;
    has_title?: boolean;
  }) =>
    apiRequest<ApiDraft>(`/api/drafts/${draftId}`, { method: 'PUT', body: data, params: { user_id: userId } }),

  deleteDraft: (draftId: number, userId: number) =>
    apiRequest<void>(`/api/drafts/${draftId}`, { method: 'DELETE', params: { user_id: userId } }),

  // Pay / Crypto
  getDepositAddress: (userId: number, chain = 'tron') =>
    apiRequest<DepositAddress>('/api/pay/address', { params: { user_id: userId, chain } }),

  getCryptoBalance: (userId: number) =>
    apiRequest<CryptoBalanceResponse>('/api/pay/balance', { params: { user_id: userId } }),

  getCryptoDeposits: (userId: number, limit = 50, offset = 0) =>
    apiRequest<CryptoDepositsResponse>('/api/pay/deposits', { params: { user_id: userId, limit, offset } }),

  requestWithdrawal: (userId: number, data: WithdrawalRequest) =>
    apiRequest<CryptoWithdrawal>('/api/pay/withdraw', {
      method: 'POST',
      body: data,
      params: { user_id: userId },
    }),

  getCryptoWithdrawals: (userId: number, limit = 50, offset = 0) =>
    apiRequest<CryptoWithdrawalsResponse>('/api/pay/withdrawals', { params: { user_id: userId, limit, offset } }),

  // Exchange
  getBtcPrice: () =>
    apiRequest<{ btc_price: number }>('/api/pay/exchange/price'),

  getExchangeQuota: () =>
    apiRequest<ExchangeQuota>('/api/pay/exchange/quota'),

  getChainFees: () =>
    apiRequest<ChainFee[]>('/api/pay/exchange/chain-fees'),

  createExchangePreview: (userId: number, amount: number, direction: string) =>
    apiRequest<ExchangePreview>('/api/pay/exchange/preview', {
      method: 'POST',
      body: { amount, direction },
      params: { user_id: userId },
    }),

  confirmExchange: (userId: number, previewId: string) =>
    apiRequest<ExchangeResult>('/api/pay/exchange/confirm', {
      method: 'POST',
      body: { preview_id: previewId },
      params: { user_id: userId },
    }),

  getExchangeHistory: (userId: number, limit = 20, offset = 0) =>
    apiRequest<{ exchanges: ExchangeHistoryItem[] }>('/api/pay/exchange/history', {
      params: { user_id: userId, limit, offset },
    }),

  getUserBalances: (userId: number) =>
    apiRequest<UserBalances>('/api/pay/user-balance', { params: { user_id: userId } }),

  // Media
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
};
