import { fixUrl } from './utils/urlFixer';

export type Tab = 'Feed' | 'Following' | 'Chat' | 'Profile' | 'Search';

export interface User {
  id: string | number;
  name: string;
  handle: string;
  avatar: string | null;
  isFollowing?: boolean;
  bio?: string | null;
  followers_count?: number;
  following_count?: number;
  walletAddress?: string | null;
}

export interface Post {
  id: string | number;
  author: User;
  title?: string | null;
  content: string;
  contentFormat?: 'plain' | 'markdown' | 'html';
  likes: number;
  comments: number;
  timestamp: string;
  isAI?: boolean;
  type: 'Note' | 'Article' | 'Question';
  bounty?: number;
  status?: string;
  mediaUrls?: string[];
  isLiked?: boolean;
  tipCount?: number;
  tipTotalUsdcMicro?: number;
}

export interface Comment {
  id: string | number;
  postId: string | number;
  author: User;
  content: string;
  parentId?: string | number | null;
  likesCount: number;
  isLiked?: boolean;
  timestamp: string;
}

export interface ChatMessage {
  id: string | number;
  senderId: string | number;
  text: string;
  timestamp: string;
}

export interface ChatSession {
  id: string | number;
  participants: User[];
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
  isGroup?: boolean;
  name?: string | null;
  userHasLeft?: boolean;
}

// Helper to convert API user to UI user
export function apiUserToUser(apiUser: {
  id: number;
  name: string;
  handle: string;
  avatar: string | null;
  is_following?: boolean;
  bio?: string | null;
  followers_count?: number;
  following_count?: number;
  embedded_wallet_address?: string | null;
}): User {
  return {
    id: apiUser.id,
    name: apiUser.name,
    handle: apiUser.handle.startsWith('@') ? apiUser.handle : `@${apiUser.handle}`,
    avatar: apiUser.avatar || `https://i.pravatar.cc/150?u=${encodeURIComponent(apiUser.name)}`,
    isFollowing: apiUser.is_following,
    bio: apiUser.bio,
    followers_count: apiUser.followers_count,
    following_count: apiUser.following_count,
    walletAddress: apiUser.embedded_wallet_address ?? null,
  };
}

// Helper to convert API post to UI post
export function apiPostToPost(apiPost: {
  id: number;
  author: {
    id: number;
    name: string;
    handle: string;
    avatar: string | null;
    embedded_wallet_address?: string | null;
  };
  title?: string | null;
  content: string;
  content_format?: 'plain' | 'markdown' | 'html';
  post_type: 'note' | 'article' | 'question';
  status: string;
  likes_count: number;
  comments_count: number;
  bounty: number | null;
  tip_count?: number;
  tip_total_usdc_micro?: number;
  is_ai: boolean;
  created_at: string;
  media_urls?: string[];
  is_liked: boolean;
}): Post {
  const typeMap: Record<string, 'Note' | 'Article' | 'Question'> = {
    note: 'Note',
    article: 'Article',
    question: 'Question',
  };

  return {
    id: apiPost.id,
    author: apiUserToUser(apiPost.author),
    title: apiPost.title,
    content: apiPost.content,
    contentFormat: apiPost.content_format || 'plain',
    type: typeMap[apiPost.post_type] || 'Note',
    likes: apiPost.likes_count,
    comments: apiPost.comments_count,
    timestamp: formatTimestamp(apiPost.created_at),
    bounty: apiPost.bounty || undefined,
    isAI: apiPost.is_ai,
    status: apiPost.status,
    mediaUrls: (apiPost.media_urls || []).map(fixUrl),
    isLiked: apiPost.is_liked,
    tipCount: apiPost.tip_count ?? 0,
    tipTotalUsdcMicro: apiPost.tip_total_usdc_micro ?? 0,
  };
}

export function apiSessionToSession(apiSession: {
  id: number;
  name: string | null;
  is_group: boolean;
  members: Array<{
    id: number;
    name: string;
    handle: string;
    avatar: string | null;
  }>;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  created_at: string;
  user_has_left?: boolean;
}): ChatSession {
  return {
    id: apiSession.id,
    name: apiSession.name,
    isGroup: apiSession.is_group,
    participants: apiSession.members.map(apiUserToUser),
    lastMessage: apiSession.last_message || '',
    timestamp: apiSession.last_message_at
      ? formatTimestamp(apiSession.last_message_at)
      : formatTimestamp(apiSession.created_at),
    unreadCount: apiSession.unread_count,
    userHasLeft: apiSession.user_has_left ?? false,
  };
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function apiCommentToComment(apiComment: {
  id: number;
  post_id: number;
  author: {
    id: number;
    name: string;
    handle: string;
    avatar: string | null;
  };
  content: string;
  parent_id: number | null;
  likes_count: number;
  is_liked: boolean;
  created_at: string;
}): Comment {
  return {
    id: apiComment.id,
    postId: apiComment.post_id,
    author: apiUserToUser(apiComment.author),
    content: apiComment.content,
    parentId: apiComment.parent_id,
    likesCount: apiComment.likes_count,
    isLiked: apiComment.is_liked,
    timestamp: formatTimestamp(apiComment.created_at),
  };
}
