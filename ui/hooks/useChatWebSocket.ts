import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ApiMessage } from '../api/client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';
const WS_BASE = API_BASE.replace(/^http/, 'ws');

interface ReactionEvent {
  message_id: number;
  user_id: number;
  user_name?: string;
  emoji: string;
}

interface GroupEvent {
  session_id: number;
  user_id?: number;
}

type WebSocketMessage = 
  | { type: 'new_message'; message: ApiMessage }
  | { type: 'reaction_added'; message_id: number; user_id: number; user_name: string; emoji: string }
  | { type: 'reaction_removed'; message_id: number; user_id: number; emoji: string }
  | { type: 'member_removed'; session_id: number; user_id: number }
  | { type: 'members_added'; session_id: number; count: number }
  | { type: 'you_were_removed'; session_id: number };

interface UseChatWebSocketOptions {
  userId: number | null;
  onMessage: (message: ApiMessage) => void;
  onReactionAdded?: (event: ReactionEvent) => void;
  onReactionRemoved?: (event: ReactionEvent) => void;
  onMemberRemoved?: (event: GroupEvent) => void;
  onMembersAdded?: (event: GroupEvent & { count: number }) => void;
  onYouWereRemoved?: (event: { session_id: number }) => void;
  onResume?: () => void;
}

export function useChatWebSocket({ 
  userId, 
  onMessage, 
  onReactionAdded, 
  onReactionRemoved,
  onMemberRemoved,
  onMembersAdded,
  onYouWereRemoved,
  onResume
}: UseChatWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const isCleaningUpRef = useRef(false);
  
  const onMessageRef = useRef(onMessage);
  const onReactionAddedRef = useRef(onReactionAdded);
  const onReactionRemovedRef = useRef(onReactionRemoved);
  const onMemberRemovedRef = useRef(onMemberRemoved);
  const onMembersAddedRef = useRef(onMembersAdded);
  const onYouWereRemovedRef = useRef(onYouWereRemoved);
  const onResumeRef = useRef(onResume);
  const userIdRef = useRef(userId);
  
  onMessageRef.current = onMessage;
  onReactionAddedRef.current = onReactionAdded;
  onReactionRemovedRef.current = onReactionRemoved;
  onMemberRemovedRef.current = onMemberRemoved;
  onMembersAddedRef.current = onMembersAdded;
  onYouWereRemovedRef.current = onYouWereRemoved;
  onResumeRef.current = onResume;
  userIdRef.current = userId;

  useEffect(() => {
    if (!userId) return;

    isCleaningUpRef.current = false;

    const destroySocket = () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };

    const connect = () => {
      if (isCleaningUpRef.current) return;
      if (!userIdRef.current) return;

      destroySocket();

      const ws = new WebSocket(`${WS_BASE}/api/chat/ws/${userIdRef.current}`);

      ws.onopen = () => {
        console.log('[WS] Connected');
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
        }
        pingIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          if (data.type === 'new_message') {
            onMessageRef.current(data.message);
          } else if (data.type === 'reaction_added' && onReactionAddedRef.current) {
            onReactionAddedRef.current({
              message_id: data.message_id,
              user_id: data.user_id,
              user_name: data.user_name,
              emoji: data.emoji,
            });
          } else if (data.type === 'reaction_removed' && onReactionRemovedRef.current) {
            onReactionRemovedRef.current({
              message_id: data.message_id,
              user_id: data.user_id,
              emoji: data.emoji,
            });
          } else if (data.type === 'member_removed' && onMemberRemovedRef.current) {
            onMemberRemovedRef.current({
              session_id: data.session_id,
              user_id: data.user_id,
            });
          } else if (data.type === 'members_added' && onMembersAddedRef.current) {
            onMembersAddedRef.current({
              session_id: data.session_id,
              count: data.count,
            });
          } else if (data.type === 'you_were_removed' && onYouWereRemovedRef.current) {
            onYouWereRemovedRef.current({
              session_id: data.session_id,
            });
          }
        } catch (e) {
          // Ignore non-JSON messages (pong, etc.)
        }
      };

      ws.onclose = () => {
        if (!isCleaningUpRef.current) {
          console.log('[WS] Disconnected, reconnecting in 3s...');
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
          }
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
      };

      wsRef.current = ws;
    };

    // Force reconnect and refresh data when app returns to foreground
    const handleResume = () => {
      if (isCleaningUpRef.current || !userIdRef.current) return;
      console.log('[WS] App resumed, reconnecting...');
      connect();
      onResumeRef.current?.();
    };

    connect();

    // Native: listen for Capacitor appStateChange
    let nativeListener: { remove: () => void } | null = null;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) handleResume();
      }).then(l => { nativeListener = l; });
    }

    // Web fallback: visibilitychange
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleResume();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      isCleaningUpRef.current = true;
      destroySocket();
      document.removeEventListener('visibilitychange', handleVisibility);
      nativeListener?.remove();
    };
  }, [userId]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
