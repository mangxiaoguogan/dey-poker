// websocket.js - 管理 WebSocket 连接、重连、消息分发

let ws = null;
let reconnectTimer = null;
let currentRoomId = null;
let currentPlayerId = null;
let messageHandler = null;
let statusHandler = null;

export function setRoomId(id) { currentRoomId = id; }
export function setPlayerId(id) { currentPlayerId = id; }
export function getWs() { return ws; }

export function connectWebSocket(roomId, playerId, handlers) {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    currentRoomId = roomId;
    currentPlayerId = playerId;
    messageHandler = handlers.onMessage;
    statusHandler = handlers.onStatusChange;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${roomId}`;
    ws = new WebSocket(wsUrl);
    updateStatus('连接中...');

    ws.onopen = () => {
        console.log('WebSocket connected');
        updateStatus('已连接');
        ws.send(JSON.stringify({ type: 'identify', playerId }));
        if (reconnectTimer) {
            clearInterval(reconnectTimer);
            reconnectTimer = null;
        }
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (messageHandler) messageHandler(data);
        } catch (e) {
            console.error('消息解析失败', e);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket closed');
        updateStatus('已断开，尝试重连...');
        if (!reconnectTimer) {
            reconnectTimer = setInterval(() => {
                if (currentRoomId && currentPlayerId) {
                    connectWebSocket(currentRoomId, currentPlayerId, { onMessage: messageHandler, onStatusChange: statusHandler });
                }
            }, 3000);
        }
    };

    ws.onerror = (err) => {
        console.error('WebSocket error', err);
    };
}

function updateStatus(status) {
    if (statusHandler) statusHandler(status);
}