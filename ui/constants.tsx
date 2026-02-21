
import { User, Post, ChatSession, JuryCase } from './types';

export const MOCK_ME: User = {
  id: 'me',
  name: 'Satoshi Nakamoto',
  handle: '@satoshi',
  avatar: 'https://picsum.photos/id/64/200/200',
  trustScore: 98,
  isFollowing: false
};

export const MOCK_USERS: User[] = [
  { id: '1', name: 'Vitalik', handle: '@vbuterin', avatar: 'https://picsum.photos/id/1/200/200', trustScore: 95, isFollowing: true },
  { id: '2', name: 'Jack', handle: '@jack', avatar: 'https://picsum.photos/id/2/200/200', trustScore: 68, isFollowing: false },
  { id: '3', name: 'Elena', handle: '@elen_a', avatar: 'https://picsum.photos/id/3/200/200', trustScore: 55, isFollowing: true },
  { id: '4', name: 'Nova', handle: '@nova_builds', avatar: 'https://picsum.photos/id/11/200/200', trustScore: 28, isFollowing: false },
  { id: '5', name: 'Aiden', handle: '@aiden_l2', avatar: 'https://picsum.photos/id/12/200/200', trustScore: 73, isFollowing: true },
  { id: '6', name: 'Mira', handle: '@mira_alpha', avatar: 'https://picsum.photos/id/13/200/200', trustScore: 84, isFollowing: false },
  { id: '7', name: 'Orion', handle: '@orion_prime', avatar: 'https://picsum.photos/id/14/200/200', trustScore: 97, isFollowing: true },
];

export const MOCK_POSTS: Post[] = [
  {
    id: 'p1',
    author: MOCK_USERS[3],
    content: 'White Tier Demo: First week here. Still learning how staking and reporting works.',
    stakedSats: 120,
    likes: 18,
    comments: 6,
    timestamp: '12m ago',
    type: 'Note',
  },
  {
    id: 'p2',
    author: MOCK_USERS[2],
    content: 'Green Tier Demo: Daily challenge reviews are useful for cleaning up low-quality posts.',
    stakedSats: 260,
    likes: 46,
    comments: 11,
    timestamp: '31m ago',
    type: 'Note',
  },
  {
    id: 'p3',
    author: MOCK_USERS[4],
    content: 'Blue Tier Demo: Which fraud pattern should be added to the default AI moderation prompts?',
    stakedSats: 800,
    likes: 71,
    comments: 34,
    timestamp: '1h ago',
    type: 'Question',
    bounty: 5000,
  },
  {
    id: 'p4',
    author: MOCK_USERS[5],
    content: 'Purple Tier Demo: Liquidity campaigns should reward long-term curators, not just short spikes.',
    stakedSats: 500,
    likes: 123,
    comments: 27,
    timestamp: '2h ago',
    type: 'Note',
  },
  {
    id: 'p5',
    author: MOCK_USERS[6],
    content: 'Orange Tier Demo: This account should show orange avatar glow + highlighted sponsored style.',
    stakedSats: 1200,
    likes: 488,
    comments: 91,
    timestamp: '3h ago',
    isPromoted: true,
    type: 'Note',
  },
  {
    id: 'p6',
    author: MOCK_USERS[0],
    content: 'The future of decentralized social is here. By staking sats, we align incentives and eliminate sybil attacks naturally.',
    stakedSats: 1000,
    likes: 452,
    comments: 24,
    timestamp: '5h ago',
    type: 'Note',
  },
  {
    id: 'p7',
    author: MOCK_ME,
    content: 'Just launched my first Boost campaign. Let\'s see how the targeting performs across the tech channel.',
    stakedSats: 500,
    likes: 89,
    comments: 12,
    timestamp: '6h ago',
    isPromoted: true,
    type: 'Note',
  },
];

export const MOCK_CHATS: ChatSession[] = [
  { id: 'c1', participants: [MOCK_USERS[0]], lastMessage: 'See you at the hackathon!', timestamp: '10:30 AM', unreadCount: 2 },
  { id: 'c2', participants: [MOCK_USERS[1], MOCK_USERS[2]], lastMessage: 'The jury voted against the spam post.', timestamp: 'Yesterday', unreadCount: 0, isGroup: true },
];

export const MOCK_JURY: JuryCase[] = [
  {
    id: 'j1',
    content: 'SPAM: GET FREE SATS NOW CLICK HERE bit.ly/scam-link',
    reason: 'Phishing/Spam',
    reporter: '@user44',
    expiresAt: '2025-05-20T20:00:00Z',
    originalStaked: 500
  }
];
