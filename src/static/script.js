// 全局变量
let currentPlayerId = null;
let currentRoomId = null;
let ws = null;
let reconnectTimer = null;

let selectedCardIndices = []; // 当前选中的手牌索引
let hasConfirmed = false;     // 是否已确认选牌

const API_BASE = '/api';


// DOM 元素
const lobby = document.getElementById('lobby');
const roomSection = document.getElementById('roomSection');
const gameSection = document.getElementById('gameSection');
const currentRoomSpan = document.getElementById('currentRoomId');
const playersContainer = document.getElementById('playersContainer');
const wsStatus = document.getElementById('wsStatus');
const sendPingBtn = document.getElementById('sendPingBtn');
const selectConfirmBtn = document.getElementById('selectConfirmBtn');
const roundSpan = document.getElementById('round');
const stageSpan = document.getElementById('stage');
const riverArea = document.getElementById('riverArea');
const handArea = document.getElementById('handArea');

// 创建房间
document.getElementById('createBtn').addEventListener('click', async () => {
    const username = document.getElementById('createName').value.trim();
    if (!username) return alert('请输入用户名');
    const res = await fetch(`${API_BASE}/room/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    });
    const data = await res.json();
    document.getElementById('createResult').textContent = JSON.stringify(data, null, 2);
    if (res.ok) {
        handleJoinSuccess(data);
    }
});

// 加入房间
document.getElementById('joinBtn').addEventListener('click', async () => {
    const roomId = document.getElementById('joinRoomId').value.trim().toUpperCase();
    const username = document.getElementById('joinName').value.trim();
    if (!roomId || !username) return alert('请输入房间号和用户名');
    const res = await fetch(`${API_BASE}/room/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, username })
    });
    const data = await res.json();
    document.getElementById('joinResult').textContent = JSON.stringify(data, null, 2);
    if (res.ok) {
        handleJoinSuccess(data);
    }
});

// 加入成功后的处理
function handleJoinSuccess(data) {
    currentPlayerId = data.playerId;
    currentRoomId = data.roomId;
    lobby.style.display = 'none';
    roomSection.style.display = 'block';
    currentRoomSpan.textContent = currentRoomId;
    connectWebSocket(currentRoomId, currentPlayerId);
}

// 建立 WebSocket 连接
function connectWebSocket(roomId, playerId) {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${roomId}`;
    ws = new WebSocket(wsUrl);
    wsStatus.textContent = '连接中...';

    ws.onopen = () => {
        console.log('WebSocket connected');
        wsStatus.textContent = '已连接';
        ws.send(JSON.stringify({ type: 'identify', playerId }));
        if (reconnectTimer) {
            clearInterval(reconnectTimer);
            reconnectTimer = null;
        }
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('Received:', data);
            switch (data.type) {
                case 'player_list':
                    updatePlayerList(data.players);
                    break;
                case 'pong':
                    console.log('Pong received');
                    break;
                case 'game_started':
                    gameSection.style.display = 'block';
                    renderRiver(data.river);
                    break;
                case 'your_hand':
                    renderHand(data.hand);
                    break;
                case 'round_started':
                    roundSpan.textContent = data.round;
                    stageSpan.textContent = data.stage;
                    selectConfirmBtn.disabled = data.stage !== 'select';
                    break;
                case 'show_cards':
                    console.log('秀牌阶段', data);
                    break;
                case 'error':
                    alert('错误: ' + data.message);
                    break;
                default:
                    console.log('未知消息类型', data);
            }
        } catch (e) {
            console.error('消息解析失败', e);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket closed');
        wsStatus.textContent = '已断开，尝试重连...';
        if (!reconnectTimer) {
            reconnectTimer = setInterval(() => {
                if (currentRoomId && currentPlayerId) {
                    connectWebSocket(currentRoomId, currentPlayerId);
                }
            }, 3000);
        }
    };

    ws.onerror = (err) => {
        console.error('WebSocket error', err);
    };
}

// 更新玩家列表 UI
function updatePlayerList(players) {
    playersContainer.innerHTML = '';
    players.forEach(p => {
        const div = document.createElement('div');
        div.className = 'player-item';
        const statusClass = p.online ? 'online' : 'offline';
        div.innerHTML = `<span class="${statusClass}">●</span> ${p.name} (筹码: ${p.chips})`;
        playersContainer.appendChild(div);
    });
}

// 渲染河牌
function renderRiver(river) {
    riverArea.innerHTML = '河牌：' + river.map(c => 
        c.faceUp ? `${c.suit}${c.rank}` : '🂠'
    ).join(' ');
}

// 渲染手牌
function renderHand(hand) {
    handArea.innerHTML = '手牌：' + hand.map(c => 
        `${c.suit}${c.rank}`
    ).join(' ');
}

// 发送 Ping
sendPingBtn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
    } else {
        alert('WebSocket 未连接');
    }
});

// 确认选牌（后续实现）
selectConfirmBtn.addEventListener('click', () => {
    // TODO: 收集选中的手牌索引
    alert('选牌功能待实现');
});

// 页面关闭前关闭 WebSocket
window.addEventListener('beforeunload', () => {
    if (ws) ws.close();
});