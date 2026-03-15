// main.js - 入口模块
import { createRoom, joinRoom } from './api.js';
import { connectWebSocket, getWs, setPlayerId, setRoomId } from './websocket.js';
import * as ui from './ui.js';
import * as game from './game.js';


export let currentPlayerId = null;
export let currentRoomId = null;
let currentRound = 1; // 新增，用于阶段更新

export function setCurrentPlayerId(id) {
    currentPlayerId = id;
    setPlayerId(id);
    window.currentPlayerId = id;
}

export function setCurrentRoomId(id) {
    currentRoomId = id;
    setRoomId(id);
}

// DOM 元素
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const sendPingBtn = document.getElementById('sendPingBtn');
const selectConfirmBtn = document.getElementById('selectConfirmBtn');

createBtn.addEventListener('click', handleCreate);
joinBtn.addEventListener('click', handleJoin);
sendPingBtn.addEventListener('click', handleSendPing);
selectConfirmBtn.addEventListener('click', handleSelectConfirm);

async function handleCreate() {
    const username = document.getElementById('createName').value.trim();
    if (!username) return alert('请输入用户名');
    const result = await createRoom(username);
    if (result.success) {
        handleJoinSuccess(result);
    }
    document.getElementById('createResult').textContent = JSON.stringify(result, null, 2);
}

async function handleJoin() {
    const roomId = document.getElementById('joinRoomId').value.trim().toUpperCase();
    const username = document.getElementById('joinName').value.trim();
    if (!roomId || !username) return alert('请输入房间号和用户名');
    const result = await joinRoom(roomId, username);
    if (result.success) {
        handleJoinSuccess(result);
    }
    document.getElementById('joinResult').textContent = JSON.stringify(result, null, 2);
}

function handleJoinSuccess(data) {
    setCurrentPlayerId(data.playerId);
    setCurrentRoomId(data.roomId);
    ui.showRoomSection(data.roomId);
    connectWebSocket(data.roomId, data.playerId, {
        onMessage: handleWebSocketMessage,
        onStatusChange: ui.updateConnectionStatus,
    });
}

function handleSendPing() {
    const ws = getWs();
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
    } else {
        alert('WebSocket 未连接');
    }
}

function handleSelectConfirm() {
    ui.handleSelectConfirm();
}

function handleWebSocketMessage(data) {
    console.log('收到消息', data);
    switch (data.type) {
        case 'player_list':
            ui.updatePlayerList(data.players);
            break;
        case 'pong':
            console.log('Pong received');
            break;
        case 'game_started':
            ui.showGameSection();
            ui.renderRiver(data.river);
            break;
        case 'your_hand':
            game.setHand(data.hand);
            window.myHand = data.hand;
            ui.renderHand(data.hand);
            break;
        case 'round_started':
            currentRound = data.round;
            ui.updateRoundInfo(data.round, data.stage);
            ui.showStageChanged(data.stage); // 新增
            game.resetSelection();
            break;
        case 'player_selected':
            ui.handlePlayerSelected(data);
            break;
        case 'show_cards':
            if (data.players) {
                ui.renderShowCards(data.combinations, data.players, currentPlayerId, () => {
                    const ws = getWs();
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'all_cards_revealed' }));
                    }
                });
                // 更新阶段为秀牌（但通常 stage_changed 会随后到达）
                // 这里可以调用 ui.updateRoundInfo(currentRound, 'show');
                ui.updateRoundInfo(currentRound, 'show');
            } else {
                console.error('show_cards 缺少 players 字段');
            }
            break;
        case 'card_revealed':
            ui.revealCard(data.playerId, data.cardIndex);
            break;
        case 'stage_changed':
            // 使用当前轮次更新阶段名称
            ui.updateRoundInfo(currentRound, data.stage);
            ui.showStageChanged(data.stage); // 用于显示/隐藏交换按钮
            break;
        case 'transfer_request':
            import('./exchange.js').then(mod => mod.showTransferRequest(data.from, data.fromName, data.amount, data.requestType));
            break;
        case 'transfer_failed':
            import('./exchange.js').then(mod => mod.showTransferFailed(data.reason));
            break;
        case 'transfer_rejected':
            import('./exchange.js').then(mod => mod.showTransferRejected());
            break;
        case 'chips_updated':
            ui.updatePlayersChips(data.players);
            break;
        case 'player_ready':
            // console.log('玩家准备', data.playerId);
            ui.showPlayerReady(data.playerId);

            break;
        case 'error':
            alert('错误: ' + data.message);
            break;
        case 'river_updated':
            ui.renderRiver(data.river);
            break;
        case 'game_over':
            // 显示结算弹窗
            const overlay = document.getElementById('gameover-overlay');
            const content = document.getElementById('gameover-content');
            content.innerHTML = data.players.map(p => `${p.name}: ${p.chips} 筹码`).join('<br>');
            overlay.style.display = 'flex';
            // 按钮文字改为“再来一局”
            document.getElementById('restartBtn').textContent = '再来一局';
            document.getElementById('restartBtn').onclick = () => {
                overlay.style.display = 'none';
                // 发送重启游戏消息
                const ws = getWs();
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'restart_game' }));
                } else {
                    console.error('WebSocket 未连接，无法重启');
                }
            };
            break;
        // case 'game_over':
        //     // 显示结算弹窗
        //     const overlay = document.getElementById('gameover-overlay');
        //     const content = document.getElementById('gameover-content');
        //     content.innerHTML = data.players.map(p => `${p.name}: ${p.chips} 筹码`).join('<br>');
        //     overlay.style.display = 'flex';
        //     // 绑定再来一局按钮
        //     document.getElementById('restartBtn').onclick = () => {
        //         overlay.style.display = 'none';
        //         const ws = getWs();
        //         if (ws) {
        //             ws.send(JSON.stringify({ type: 'restart_game' }));
        //         }
        //     };
        //     break;

        default:
            console.log('未知消息类型', data);
    }
}

window.addEventListener('beforeunload', () => {
    const ws = getWs();
    if (ws) ws.close();
});
