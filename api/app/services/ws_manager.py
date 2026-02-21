"""WebSocket connection manager for real-time chat."""
from fastapi import WebSocket
from collections import defaultdict


class ConnectionManager:
    """Manages WebSocket connections per user."""

    def __init__(self):
        # user_id -> list of WebSocket connections (user can have multiple tabs/devices)
        self.active_connections: dict[int, list[WebSocket]] = defaultdict(list)

    async def connect(self, websocket: WebSocket, user_id: int):
        """Accept and register a new connection."""
        await websocket.accept()
        self.active_connections[user_id].append(websocket)
        print(f'[WS] User {user_id} connected. Total connections: {len(self.active_connections[user_id])}')

    def disconnect(self, websocket: WebSocket, user_id: int):
        """Remove a connection."""
        if websocket in self.active_connections[user_id]:
            self.active_connections[user_id].remove(websocket)
        if not self.active_connections[user_id]:
            del self.active_connections[user_id]
        print(f'[WS] User {user_id} disconnected. Remaining: {len(self.active_connections.get(user_id, []))}')

    async def send_to_user(self, user_id: int, message: dict):
        """Send a message to all connections of a specific user."""
        if user_id in self.active_connections:
            print(f'[WS] Sending to user {user_id} ({len(self.active_connections[user_id])} connections)')
            dead_connections = []
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                    print(f'[WS] Sent to user {user_id} successfully')
                except Exception as e:
                    print(f'[WS] Failed to send to user {user_id}: {e}')
                    dead_connections.append(connection)
            # Clean up dead connections
            for conn in dead_connections:
                self.disconnect(conn, user_id)
        else:
            print(f'[WS] User {user_id} has no active connections')

    async def broadcast_to_session(self, session_member_ids: list[int], message: dict, exclude_user: int | None = None):
        """Broadcast a message to all members of a chat session."""
        print(f'[WS] Broadcasting to session members: {session_member_ids} (excluding {exclude_user})')
        for user_id in session_member_ids:
            if exclude_user and user_id == exclude_user:
                continue
            await self.send_to_user(user_id, message)


# Singleton instance
manager = ConnectionManager()
