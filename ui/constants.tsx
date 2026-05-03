import { User } from './types';

// Placeholder identity used as a fallback when the API hasn't returned the
// current user yet. Real identity comes from Privy + /api/wallet/link.
export const MOCK_ME: User = {
  id: 'me',
  name: 'You',
  handle: '@you',
  avatar: 'https://picsum.photos/id/64/200/200',
  isFollowing: false,
};
