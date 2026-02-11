
export type Tab = 'Feed' | 'Following' | 'Chat' | 'Profile' | 'Search';

export interface User {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  trustScore: number;
  isFollowing: boolean;
}

export interface Post {
  id: string;
  author: User;
  content: string;
  stakedSats: number;
  likes: number;
  comments: number;
  timestamp: string;
  isAI?: boolean;
  isPromoted?: boolean;
  type: 'Note' | 'Question';
  bounty?: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  participants: User[];
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
  isGroup?: boolean;
}

export interface JuryCase {
  id: string;
  content: string;
  reason: string;
  reporter: string;
  expiresAt: string;
  originalStaked: number;
}
