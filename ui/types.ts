export type Tab = 'Feed' | 'Following' | 'Chat' | 'Profile' | 'Search';

export interface User {
  id: string | number;
  name: string;
  handle: string;
  avatar: string | null;
  trustScore: number;
  isFollowing?: boolean;
  bio?: string | null;
  followers_count?: number;
  following_count?: number;
}

export interface Post {
  id: string | number;
  author: User;
  content: string;
  stakedSats?: number;
  likes: number;
  comments: number;
  timestamp: string;
  isAI?: boolean;
  isPromoted?: boolean;
  type: 'Note' | 'Question';
  bounty?: number;
  status?: string;
  isLiked?: boolean;
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
}

export interface JuryCase {
  id: string;
  content: string;
  reason: string;
  reporter: string;
  expiresAt: string;
  originalStaked: number;
}

// Helper to convert API user to UI user
export function apiUserToUser(apiUser: {
  id: number;
  name: string;
  handle: string;
  avatar: string | null;
  trust_score: number;
  is_following?: boolean;
  bio?: string | null;
  followers_count?: number;
  following_count?: number;
}): User {
  return {
    id: apiUser.id,
    name: apiUser.name,
    handle: apiUser.handle.startsWith('@') ? apiUser.handle : `@${apiUser.handle}`,
    avatar: apiUser.avatar || `https://picsum.photos/id/${apiUser.id + 10}/200/200`,
    trustScore: Math.round(apiUser.trust_score / 10), // Convert 0-1000 to 0-100 for display
    isFollowing: apiUser.is_following,
    bio: apiUser.bio,
    followers_count: apiUser.followers_count,
    following_count: apiUser.following_count,
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
    trust_score: number;
  };
  content: string;
  post_type: 'note' | 'question';
  status: string;
  likes_count: number;
  comments_count: number;
  bounty: number | null;
  is_ai: boolean;
  created_at: string;
  is_liked: boolean;
}): Post {
  return {
    id: apiPost.id,
    author: apiUserToUser(apiPost.author),
    content: apiPost.content,
    type: apiPost.post_type === 'question' ? 'Question' : 'Note',
    likes: apiPost.likes_count,
    comments: apiPost.comments_count,
    timestamp: formatTimestamp(apiPost.created_at),
    bounty: apiPost.bounty || undefined,
    isAI: apiPost.is_ai,
    status: apiPost.status,
    isLiked: apiPost.is_liked,
  };
}

// Helper to convert API chat session to UI format
export function apiSessionToSession(apiSession: {
  id: number;
  name: string | null;
  is_group: boolean;
  members: Array<{
    id: number;
    name: string;
    handle: string;
    avatar: string | null;
    trust_score: number;
  }>;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  created_at: string;
}): ChatSession {
  return {
    id: apiSession.id,
    name: apiSession.name,
    isGroup: apiSession.is_group,
    participants: apiSession.members.map(apiUserToUser),
    lastMessage: apiSession.last_message || '',
    timestamp: apiSession.last_message_at ? formatTimestamp(apiSession.last_message_at) : formatTimestamp(apiSession.created_at),
    unreadCount: apiSession.unread_count,
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
