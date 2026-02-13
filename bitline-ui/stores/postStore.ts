import { create } from 'zustand';
import { api, ApiPost, ApiComment } from '../api/client';

interface PostState {
  posts: ApiPost[];
  feedPosts: ApiPost[];
  currentPost: ApiPost | null;
  comments: ApiComment[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchPosts: (filters?: { post_type?: string; author_id?: number }) => Promise<void>;
  fetchFeed: (userId: number) => Promise<void>;
  fetchPost: (postId: number) => Promise<void>;
  fetchComments: (postId: number) => Promise<void>;
  createPost: (authorId: number, content: string, postType: string, bounty?: number) => Promise<ApiPost>;
  likePost: (postId: number, userId: number) => Promise<void>;
  createComment: (postId: number, authorId: number, content: string, parentId?: number) => Promise<void>;
  clearCurrentPost: () => void;
}

export const usePostStore = create<PostState>((set, get) => ({
  posts: [],
  feedPosts: [],
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
    set({ isLoading: true, error: null });
    try {
      const feedPosts = await api.getFeed(userId);
      set({ feedPosts, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
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

  likePost: async (postId, userId) => {
    try {
      const result = await api.likePost(postId, userId);
      // Update the post in the list
      set((state) => ({
        posts: state.posts.map((p) =>
          p.id === postId ? { ...p, likes_count: result.likes_count, is_liked: true } : p
        ),
        feedPosts: state.feedPosts.map((p) =>
          p.id === postId ? { ...p, likes_count: result.likes_count, is_liked: true } : p
        ),
        currentPost:
          state.currentPost?.id === postId
            ? { ...state.currentPost, likes_count: result.likes_count, is_liked: true }
            : state.currentPost,
      }));
    } catch (error) {
      console.error('Failed to like post:', error);
    }
  },

  createComment: async (postId, authorId, content, parentId) => {
    try {
      const comment = await api.createComment(postId, authorId, { content, parent_id: parentId });
      set((state) => ({
        comments: [...state.comments, comment],
      }));
    } catch (error) {
      console.error('Failed to create comment:', error);
      throw error;
    }
  },

  clearCurrentPost: () => set({ currentPost: null, comments: [] }),
}));
