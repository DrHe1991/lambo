import { create } from 'zustand';
import { api, ApiPost, ApiComment } from '../api/client';

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

  // Actions
  fetchPosts: (filters?: { post_type?: string; author_id?: number; user_id?: number }) => Promise<void>;
  fetchFeed: (userId: number) => Promise<void>;
  loadMoreFeed: (userId: number) => Promise<void>;
  fetchPost: (postId: number, userId?: number) => Promise<void>;
  fetchComments: (postId: number, userId?: number) => Promise<void>;
  createPost: (authorId: number, content: string, postType: string, bounty?: number) => Promise<ApiPost>;
  toggleLikePost: (postId: number, userId: number, isLiked: boolean) => Promise<void>;
  createComment: (postId: number, authorId: number, content: string, parentId?: number) => Promise<ApiComment>;
  toggleLikeComment: (postId: number, commentId: number, userId: number, isLiked: boolean) => Promise<void>;
  deleteComment: (commentId: number, postId: number, userId: number) => Promise<{ refunded: number; penalty: number }>;
  clearCurrentPost: () => void;
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

  fetchFeed: async (userId) => {
    set({ feedLoading: true, error: null });
    try {
      const feedPosts = await api.getFeed(userId, FEED_PAGE_SIZE, 0);
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

  loadMoreFeed: async (userId) => {
    const { feedLoading, feedHasMore, feedOffset } = get();
    if (feedLoading || !feedHasMore) return;
    set({ feedLoading: true });
    try {
      const more = await api.getFeed(userId, FEED_PAGE_SIZE, feedOffset);
      set((state) => ({
        feedPosts: [...state.feedPosts, ...more],
        feedOffset: state.feedOffset + FEED_PAGE_SIZE,
        feedHasMore: more.length >= FEED_PAGE_SIZE,
        feedLoading: false,
      }));
    } catch (error) {
      set({ feedLoading: false });
    }
  },

  fetchPost: async (postId, userId) => {
    set({ isLoading: true, error: null });
    try {
      const post = await api.getPost(postId, userId);
      set({ currentPost: post, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  fetchComments: async (postId, userId) => {
    try {
      const comments = await api.getComments(postId, userId);
      set({ comments });
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    }
  },

  createPost: async (authorId, content, postType, bounty) => {
    set({ isLoading: true, error: null });
    try {
      const post = await api.createPost(authorId, {
        content,
        post_type: postType,
        bounty,
      });
      set((state) => ({
        posts: [post, ...state.posts],
        isLoading: false,
      }));
      return post;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  toggleLikePost: async (postId, userId, isLiked) => {
    const doToggle = isLiked ? api.unlikePost : api.likePost;
    try {
      const result = await doToggle(postId, userId);
      const patch = { likes_count: result.likes_count, is_liked: result.is_liked };
      set((state) => ({
        posts: state.posts.map((p) => (p.id === postId ? { ...p, ...patch } : p)),
        feedPosts: state.feedPosts.map((p) => (p.id === postId ? { ...p, ...patch } : p)),
        currentPost: state.currentPost?.id === postId
          ? { ...state.currentPost, ...patch }
          : state.currentPost,
      }));
    } catch (error) {
      throw error;
    }
  },

  createComment: async (postId, authorId, content, parentId) => {
    const comment = await api.createComment(postId, authorId, { content, parent_id: parentId });
    set((state) => ({
      comments: [...state.comments, comment],
      // Update comment count on the post
      posts: state.posts.map((p) =>
        p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p,
      ),
      currentPost: state.currentPost?.id === postId
        ? { ...state.currentPost, comments_count: state.currentPost.comments_count + 1 }
        : state.currentPost,
    }));
    return comment;
  },

  toggleLikeComment: async (postId, commentId, userId, isLiked) => {
    const doToggle = isLiked ? api.unlikeComment : api.likeComment;
    try {
      const result = await doToggle(postId, commentId, userId);
      set((state) => ({
        comments: state.comments.map((c) =>
          c.id === commentId
            ? { ...c, likes_count: result.likes_count, is_liked: result.is_liked }
            : c,
        ),
      }));
    } catch (error) {
      throw error;
    }
  },

  deleteComment: async (commentId, postId, userId) => {
    const result = await api.deleteComment(commentId, userId);
    set((state) => ({
      comments: state.comments.filter((c) => c.id !== commentId),
      posts: state.posts.map((p) =>
        p.id === postId ? { ...p, comments_count: Math.max(0, p.comments_count - 1) } : p,
      ),
      currentPost: state.currentPost?.id === postId
        ? { ...state.currentPost, comments_count: Math.max(0, state.currentPost.comments_count - 1) }
        : state.currentPost,
    }));
    return { refunded: result.refunded, penalty: result.penalty };
  },

  clearCurrentPost: () => set({ currentPost: null, comments: [] }),
}));
