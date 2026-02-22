import { useEffect, useRef, useCallback } from 'react';
import { ApiMessage } from '../api/client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';
const WS_BASE = API_BASE.replace(/^http/, 'ws');

interface ReactionEvent {
  message_id: number;
  user_id: number;
  user_name?: string;
  emoji: string;
}

type WebSocketMessage = 
  | { type: 'new_message'; message: ApiMessage }
  | { type: 'reaction_added'; message_id: number; user_id: number; user_name: string; emoji: string }
  | { type: 'reaction_removed'; message_id: number; user_id: number; emoji: string };

interface UseChatWebSocketOptions {
  userId: number | null;
  onMessage: (message: ApiMessage) => void;
  onReactionAdded?: (event: ReactionEvent) => void;
  onReactionRemoved?: (event: ReactionEvent) => void;
}

export function useChatWebSocket({ userId, onMessage, onReactionAdded, onReactionRemoved }: UseChatWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  
  // Use refs for callbacks to avoid reconnecting when they change
  const onMessageRef = useRef(onMessage);
  const onReactionAddedRef = useRef(onReactionAdded);
  const onReactionRemovedRef = useRef(onReactionRemoved);
  
  useEffect(() => {
    onMessageRef.current = onMessage;
    onReactionAddedRef.current = onReactionAdded;
    onReactionRemovedRef.current = onReactionRemoved;
  }, [onMessage, onReactionAdded, onReactionRemoved]);

  const connect = useCallback(() => {
    if (!userId) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    const ws = new WebSocket(`${WS_BASE}/api/chat/ws/${userId}`);

    ws.onopen = () => {
      console.log('[WS] Connected');
      // Send periodic pings to keep connection alive
      pingIntervalRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000); // Every 30 seconds
    };

    ws.onmessage = (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        console.log('[WS] Received:', data.type, data);
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
        }
      } catch (e) {
        // Ignore non-JSON messages (pong, etc.)
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected, reconnecting in 3s...');
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('[WS] Error:', error);
    };

    wsRef.current = ws;
  }, [userId]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
