import { create } from 'zustand';
import { api, ApiChatSession, ApiMessage } from '../api/client';

interface ChatState {
  sessions: ApiChatSession[];
  currentSession: ApiChatSession | null;
  messages: ApiMessage[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchSessions: (userId: number) => Promise<void>;
  fetchSession: (sessionId: number, userId: number) => Promise<void>;
  fetchMessages: (sessionId: number, userId: number) => Promise<void>;
  sendMessage: (sessionId: number, senderId: number, content: string) => Promise<void>;
  createSession: (creatorId: number, memberIds: number[], name?: string, isGroup?: boolean) => Promise<ApiChatSession>;
  clearCurrentSession: () => void;
  markSessionAsRead: (sessionId: number) => void;
  updateSessionLastMessage: (sessionId: number, content: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  currentSession: null,
  messages: [],
  isLoading: false,
  error: null,

  fetchSessions: async (userId) => {
    set({ isLoading: true, error: null });
    try {
      const sessions = await api.getChatSessions(userId);
      set({ sessions, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  fetchSession: async (sessionId, userId) => {
    set({ isLoading: true, error: null });
    try {
      const session = await api.getChatSession(sessionId, userId);
      set({ currentSession: session, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  fetchMessages: async (sessionId, userId) => {
    try {
      const messages = await api.getMessages(sessionId, userId);
      set({ messages });
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  },

  sendMessage: async (sessionId, senderId, content) => {
    try {
      const message = await api.sendMessage(sessionId, senderId, content);
      set((state) => ({
        messages: [...state.messages, message],
        sessions: state.sessions.map((s) =>
          s.id === sessionId
            ? { ...s, last_message: content, last_message_at: message.created_at }
            : s
        ),
      }));
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  },

  createSession: async (creatorId, memberIds, name, isGroup) => {
    set({ isLoading: true, error: null });
    try {
      const session = await api.createChatSession(creatorId, {
        member_ids: memberIds,
        name,
        is_group: isGroup,
      });
      set((state) => {
        // Check if session already exists (backend returned existing session)
        const existingIndex = state.sessions.findIndex(s => s.id === session.id);
        if (existingIndex >= 0) {
          // Update existing session, move to top
          const updated = [...state.sessions];
          updated.splice(existingIndex, 1);
          return {
            sessions: [session, ...updated],
            currentSession: session,
            isLoading: false,
          };
        }
        // New session - add to top
        return {
          sessions: [session, ...state.sessions],
          currentSession: session,
          isLoading: false,
        };
      });
      return session;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  clearCurrentSession: () => set({ currentSession: null, messages: [] }),

  markSessionAsRead: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, unread_count: 0 } : s
      ),
    }));
  },

  updateSessionLastMessage: (sessionId, content) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId 
          ? { ...s, last_message: content, last_message_at: new Date().toISOString() } 
          : s
      ),
    }));
  },
}));
