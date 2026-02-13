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
  followers_count?: number;
  following_count?: number;
  is_following?: boolean;
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
  created_at: string;
}

export interface ApiChatSession {
  id: number;
  name: string | null;
  is_group: boolean;
  members: ApiUser[];
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  created_at: string;
}

export interface ApiMessage {
  id: number;
  session_id: number;
  sender_id: number;
  sender: ApiUser;
  content: string;
  created_at: string;
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

  // Posts
  createPost: (authorId: number, data: { content: string; post_type: string; bounty?: number }) =>
    apiRequest<ApiPost>('/api/posts', { method: 'POST', body: data, params: { author_id: authorId } }),

  getPosts: (filters?: { post_type?: string; author_id?: number; limit?: number; offset?: number }) =>
    apiRequest<ApiPost[]>('/api/posts', { params: filters }),

  getFeed: (userId: number, limit = 20, offset = 0) =>
    apiRequest<ApiPost[]>('/api/posts/feed', { params: { user_id: userId, limit, offset } }),

  getPost: (postId: number) => apiRequest<ApiPost>(`/api/posts/${postId}`),

  likePost: (postId: number, userId: number) =>
    apiRequest<{ likes_count: number }>(`/api/posts/${postId}/like`, {
      method: 'POST',
      params: { user_id: userId },
    }),

  getComments: (postId: number) => apiRequest<ApiComment[]>(`/api/posts/${postId}/comments`),

  createComment: (postId: number, authorId: number, data: { content: string; parent_id?: number }) =>
    apiRequest<ApiComment>(`/api/posts/${postId}/comments`, {
      method: 'POST',
      body: data,
      params: { author_id: authorId },
    }),

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

  sendMessage: (sessionId: number, senderId: number, content: string) =>
    apiRequest<ApiMessage>(`/api/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: { content },
      params: { sender_id: senderId },
    }),
};
