// src/room-http.js
import { initGame } from './game.js';

export async function handleJoin(request) {
  console.log('[http] handleJoin');
  const body = await request.json();
  const { username, roomId } = body;
  if (!username) return this.jsonError('Username required', 400);

  // 加载房间数据
  let roomData = await this.state.storage.get('roomData') || {
    id: '',
    players: [],
    createdAt: Date.now(),
    status: 'waiting',
    game: null,
  };

  if (!roomData.id) {
    if (!roomId) return this.jsonError('Room ID required', 400);
    roomData.id = roomId;
  }

  // 查找或创建玩家
  let player = roomData.players.find(p => p.name === username);
  if (player) {
    if (player.isOnline) {
      return this.jsonError('Username already exists', 409);
    }
    player.isOnline = true;
  } else {
    if (roomData.players.length >= 3) return this.jsonError('Room is full', 403);
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

  // 如果满三人且游戏未开始，开始游戏
  if (roomData.players.length === 3 && roomData.status === 'waiting') {
    // 调用 room-game.js 中的 startGame 函数，传递 this 上下文
    const { startGame } = await import('./room-game.js');
    await startGame.call(this, roomData);
  }

  return new Response(JSON.stringify({
    success: true,
    playerId: player.id,
    players: roomData.players.map(p => ({ id: p.id, name: p.name, chips: p.chips })),
  }), { headers: { 'Content-Type': 'application/json' } });
}

export async function handleGetInfo() {
  const roomData = await this.state.storage.get('roomData') || {};
  return new Response(JSON.stringify(roomData), {
    headers: { 'Content-Type': 'application/json' },
  });
}