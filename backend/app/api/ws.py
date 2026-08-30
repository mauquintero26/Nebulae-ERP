from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            self.active_connections[room_id].remove(websocket)

    async def broadcast(self, message: str, room_id: str):
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                await connection.send_text(message)

chat_manager = ConnectionManager()
mcp_manager = ConnectionManager()

@router.websocket("/chat/{agent_id}")
async def chat_endpoint(websocket: WebSocket, agent_id: str):
    await chat_manager.connect(websocket, agent_id)
    try:
        while True:
            data = await websocket.receive_text()
            # client to server logic (if any)
    except WebSocketDisconnect:
        chat_manager.disconnect(websocket, agent_id)

@router.websocket("/mcp-logs")
async def mcp_logs_endpoint(websocket: WebSocket):
    room_id = "global_mcp"
    await mcp_manager.connect(websocket, room_id)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        mcp_manager.disconnect(websocket, room_id)
