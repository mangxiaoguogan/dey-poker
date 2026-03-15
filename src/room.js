// src/room.js
import { initGame } from './game.js';

export class Room {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.connections = new Map(); // playerId -> WebSocket
    }

    async fetch(request) {
        const url = new URL(request.url);
        const method = request.method;
        console.log('[fetch]', method, url.pathname);

        // 处理 WebSocket 升级
        if (request.headers.get('Upgrade') === 'websocket') {
            return this.handleWebSocket(request);
        }

        // 加载房间数据
        let roomData = await this.state.storage.get('roomData') || {
            id: '',
            players: [],
            createdAt: Date.now(),
            status: 'waiting',
            game: null,
        };

        // 处理加入请求
        if (method === 'POST' && url.pathname === '/join') {
            return this.handleJoin(request, roomData);
        }

        // 获取房间信息
        if (method === 'GET' && url.pathname === '/') {
            return new Response(JSON.stringify(roomData), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response('Not found', { status: 404 });
    }

    async handleJoin(request, roomData) {
        const body = await request.json();
        const { username, roomId } = body;
        if (!username) return this.jsonError('Username required', 400);

        // 初始化房间
        if (!roomData.id) {
            if (!roomId) return this.jsonError('Room ID required', 400);
            roomData.id = roomId;
        }

        // 查找现有玩家（用于重连）
        let player = roomData.players.find(p => p.name === username);
        if (player) {
            if (player.isOnline) {
                return this.jsonError('Username already exists', 409);
            }
            // 重连：复用玩家，更新在线状态
            player.isOnline = true;
        } else {
            if (roomData.players.length >= 3) {
                return this.jsonError('Room is full', 403);
            }
            player = {
                id: crypto.randomUUID(),
                name: username,
                chips: 30,
                isReady: false,
                isOnline: true,
            };
            roomData.players.push(player);
        }

        await this.state.storage.put('roomData', roomData);

        // 如果房间满三人且游戏未开始，自动开始
        if (roomData.players.length === 3 && roomData.status === 'waiting') {
            await this.startGame(roomData);
        }

        return new Response(JSON.stringify({
            success: true,
            playerId: player.id,
            players: roomData.players.map(p => ({ id: p.id, name: p.name, chips: p.chips })),
        }), { headers: { 'Content-Type': 'application/json' } });
    }

    async startGame(roomData) {
        console.log('[startGame] starting game for room', roomData.id);
        roomData.status = 'playing';
        roomData.game = initGame(); // 初始化游戏状态

        await this.state.storage.put('roomData', roomData);

        // 广播 game_started（公共信息）
        const gameInfo = {
            river: roomData.game.river,
            currentRound: roomData.game.currentRound,
            stage: roomData.game.stage,
        };
        this.broadcast({ type: 'game_started', ...gameInfo });

        // 分别发送手牌给每个玩家
        roomData.players.forEach((p, index) => {
            const hand = roomData.game.hands[index];
            this.sendToPlayer(p.id, { type: 'your_hand', hand });
        });

        // 广播第一轮开始
        this.broadcast({ type: 'round_started', round: 1, stage: 'select' });
    }

    // ==================== WebSocket 处理 ====================
    handleWebSocket(request) {
        const webSocketPair = new WebSocketPair();
        const [client, server] = Object.values(webSocketPair);
        server.accept();

        let currentPlayerId = null;

        server.addEventListener('message', async (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('[ws message]', data);
                switch (data.type) {
                    case 'identify':
                        currentPlayerId = data.playerId;
                        await this.handleIdentify(server, currentPlayerId);
                        break;
                    case 'select_cards':
                        await this.handleSelectCards(currentPlayerId, data.indices);
                        break;
                    case 'ping':
                        server.send(JSON.stringify({ type: 'pong' }));
                        break;
                    default:
                        server.send(JSON.stringify({ type: 'error', message: 'Unknown type' }));
                }
            } catch (err) {
                console.error('[ws error]', err);
                server.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
            }
        });

        server.addEventListener('close', async () => {
            if (currentPlayerId) {
                this.connections.delete(currentPlayerId);
                await this.updatePlayerOnlineStatus(currentPlayerId, false);
            }
        });

        return new Response(null, { status: 101, webSocket: client });
    }

    async handleIdentify(ws, playerId) {
        let roomData = await this.state.storage.get('roomData');
        if (!roomData) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
            ws.close();
            return;
        }
        const player = roomData.players.find(p => p.id === playerId);
        if (!player) {
            ws.send(JSON.stringify({ type: 'error', message: 'Player not found' }));
            ws.close();
            return;
        }
        const existing = this.connections.get(playerId);
        if (existing) existing.close();
        this.connections.set(playerId, ws);
        player.isOnline = true;
        await this.state.storage.put('roomData', roomData);
        this.broadcastPlayerList();

        // 如果游戏已经开始，补发游戏状态给新连接的玩家
        if (roomData.status === 'playing' && roomData.game) {
            // 补发 game_started 消息
            ws.send(JSON.stringify({
                type: 'game_started',
                river: roomData.game.river,
                currentRound: roomData.game.currentRound,
                stage: roomData.game.stage,
            }));
            // 补发手牌
            const playerIndex = roomData.players.findIndex(p => p.id === playerId);
            if (playerIndex !== -1) {
                ws.send(JSON.stringify({ type: 'your_hand', hand: roomData.game.hands[playerIndex] }));
            }
            // 补发当前轮次信息
            ws.send(JSON.stringify({
                type: 'round_started',
                round: roomData.game.currentRound,
                stage: roomData.game.stage,
            }));
        }
    }

    async handleSelectCards(playerId, indices) {
        // 简化处理，后续完善
        let roomData = await this.state.storage.get('roomData');
        if (!roomData || roomData.status !== 'playing') return;
        const playerIndex = roomData.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) return;
        roomData.game.selectedCards[playerIndex] = indices;
        await this.state.storage.put('roomData', roomData);
        const allSelected = roomData.game.selectedCards.every(arr => arr.length === 2);
        if (allSelected) {
            this.broadcast({ type: 'show_cards', cards: roomData.game.selectedCards });
        }
    }

    async updatePlayerOnlineStatus(playerId, online) {
        let roomData = await this.state.storage.get('roomData');
        if (!roomData) return;
        const player = roomData.players.find(p => p.id === playerId);
        if (player) {
            player.isOnline = online;
            await this.state.storage.put('roomData', roomData);
            this.broadcastPlayerList();
        }
    }

    broadcastPlayerList() {
        this.state.storage.get('roomData').then(roomData => {
            if (!roomData) return;
            const players = roomData.players.map(p => ({
                id: p.id, name: p.name, chips: p.chips, online: p.isOnline
            }));
            this.broadcast({ type: 'player_list', players });
        });
    }

    sendToPlayer(playerId, message) {
        const ws = this.connections.get(playerId);
        if (ws) {
            try {
                ws.send(JSON.stringify(message));
            } catch (err) {
                console.error(`send to ${playerId} failed`, err);
            }
        }
    }

    broadcast(message) {
        const str = JSON.stringify(message);
        for (const [id, ws] of this.connections.entries()) {
            try {
                ws.send(str);
            } catch (err) {
                this.connections.delete(id);
            }
        }
    }

    jsonError(message, status) {
        return new Response(JSON.stringify({ error: message }), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}