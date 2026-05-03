/**
 * Post store — non-custodial tipping model.
 *
 * `likePost` is the entry point for the tip flow. It:
 *   1. Calls /api/tips/quote to fetch creator's wallet + chain params.
 *   2. Returns the quote to the caller (LikeConfirmModal) which signs + broadcasts
 *      via Privy delegated actions.
 *   3. Caller then calls confirmTip(postId, txHash) to finalize.
 */
import { create } from 'zustand';
import { api, type ApiPost, type ApiComment, type TipQuote, type TipConfirmResult } from '../api/client';

const FEED_PAGE_SIZE = 30;

interface PostState {
  posts: ApiPost[];
  feedPosts: ApiPost[];
  feedOffset: number;
  feedHasMore: boolean;
  feedLoading: boolean;
  currentPost: ApiPost | null;
  comments: ApiComment[];
  isLoading: boolean;
  error: string | null;

  fetchPosts: (filters?: { post_type?: string; author_id?: number }) => Promise<void>;
  fetchFeed: () => Promise<void>;
  loadMoreFeed: () => Promise<void>;
  fetchPost: (postId: number) => Promise<void>;
  fetchComments: (postId: number) => Promise<void>;
  createPost: (
    content: string,
    postType: string,
    bounty?: number,
    title?: string,
    contentFormat?: string,
    mediaUrls?: string[],
  ) => Promise<ApiPost>;

  // Tip flow
  fetchTipQuote: (postId: number, amountUsdcMicro: number) => Promise<TipQuote>;
  confirmTip: (postId: number, txHash: string) => Promise<TipConfirmResult>;

  // Comments
  createComment: (postId: number, content: string, parentId?: number) => Promise<ApiComment>;
  toggleCommentLike: (postId: number, commentId: number, currentlyLiked: boolean) => Promise<void>;
  deleteComment: (commentId: number, postId: number) => Promise<void>;
  deletePost: (postId: number) => Promise<void>;
  clearCurrentPost: () => void;
}

function patchPost(state: PostState, postId: number, patch: Partial<ApiPost>) {
  return {
    posts: state.posts.map((p) => (p.id === postId ? { ...p, ...patch } : p)),
    feedPosts: state.feedPosts.map((p) => (p.id === postId ? { ...p, ...patch } : p)),
    currentPost:
      state.currentPost?.id === postId ? { ...state.currentPost, ...patch } : state.currentPost,
  };
}

export const usePostStore = create<PostState>((set, get) => ({
  posts: [],
  feedPosts: [],
  feedOffset: 0,
  feedHasMore: true,
  feedLoading: false,
  currentPost: null,
  comments: [],
  isLoading: false,
  error: null,

  fetchPosts: async (filters) => {
    set({ isLoading: true, error: null });
    try {
      const posts = await api.getPosts(filters);
      set({ posts, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  fetchFeed: async () => {
    set({ feedLoading: true, error: null });
    try {
      const feedPosts = await api.getFeed(FEED_PAGE_SIZE, 0);
      set({
        feedPosts,
        feedOffset: FEED_PAGE_SIZE,
        feedHasMore: feedPosts.length >= FEED_PAGE_SIZE,
        feedLoading: false,
      });
    } catch (error) {
      set({ error: (error as Error).message, feedLoading: false });
    }
  },

  loadMoreFeed: async () => {
    const { feedLoading, feedHasMore, feedOffset } = get();
    if (feedLoading || !feedHasMore) return;
    set({ feedLoading: true });
    try {
      const more = await api.getFeed(FEED_PAGE_SIZE, feedOffset);
      set((state) => ({
        feedPosts: [...state.feedPosts, ...more],
        feedOffset: state.feedOffset + FEED_PAGE_SIZE,
        feedHasMore: more.length >= FEED_PAGE_SIZE,
        feedLoading: false,
      }));
    } catch {
      set({ feedLoading: false });
    }
  },

  fetchPost: async (postId) => {
    set({ isLoading: true, error: null });
    try {
      const post = await api.getPost(postId);
      set({ currentPost: post, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  fetchComments: async (postId) => {
    try {
      const comments = await api.getComments(postId);
      set({ comments });
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    }
  },

  createPost: async (content, postType, bounty, title, contentFormat, mediaUrls) => {
    set({ isLoading: true, error: null });
    try {
      const post = await api.createPost({
        content,
        post_type: postType,
        title,
        content_format: contentFormat,
        bounty,
        media_urls: mediaUrls,
      });
      set((state) => ({ posts: [post, ...state.posts], isLoading: false }));
      return post;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  fetchTipQuote: async (postId, amountUsdcMicro) => {
    return api.tipQuote(postId, amountUsdcMicro);
  },

  confirmTip: async (postId, txHash) => {
    const result = await api.tipConfirm(postId, txHash);
    set((state) =>
      patchPost(state, postId, {
        is_liked: true,
        likes_count: result.post_likes_count,
        tip_count: result.post_likes_count,
        tip_total_usdc_micro: result.post_tip_total_usdc_micro,
      }),
    );
    return result;
  },

  createComment: async (postId, content, parentId) => {
    const comment = await api.createComment(postId, { content, parent_id: parentId });
    set((state) => ({
      comments: [...state.comments, comment],
      ...patchPost(state, postId, {
        comments_count:
          (state.posts.find((p) => p.id === postId)?.comments_count ??
            state.feedPosts.find((p) => p.id === postId)?.comments_count ??
            state.currentPost?.comments_count ??
            0) + 1,
      }),
    }));
    return comment;
  },

  toggleCommentLike: async (postId, commentId, currentlyLiked) => {
    const result = currentlyLiked
      ? await api.unlikeComment(postId, commentId)
      : await api.likeComment(postId, commentId);
    set((state) => ({
      comments: state.comments.map((c) =>
        c.id === commentId
          ? { ...c, is_liked: result.is_liked, likes_count: result.likes_count }
          : c,
      ),
    }));
  },

  deleteComment: async (commentId, postId) => {
    await api.deleteComment(commentId);
    set((state) => ({
      comments: state.comments.filter((c) => c.id !== commentId),
      ...patchPost(state, postId, {
        comments_count: Math.max(
          0,
          (state.currentPost?.id === postId
            ? state.currentPost.comments_count
            : state.posts.find((p) => p.id === postId)?.comments_count ?? 0) - 1,
        ),
      }),
    }));
  },

  deletePost: async (postId) => {
    await api.deletePost(postId);
    set((state) => ({
      posts: state.posts.filter((p) => p.id !== postId),
      feedPosts: state.feedPosts.filter((p) => p.id !== postId),
      currentPost: state.currentPost?.id === postId ? null : state.currentPost,
    }));
  },

  clearCurrentPost: () => set({ currentPost: null, comments: [] }),
}));
