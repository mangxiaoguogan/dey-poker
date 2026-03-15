// src/room-ws.js

export function handleWebSocket(request) {
  console.log('[ws] handleWebSocket');
  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);
  server.accept();

  let currentPlayerId = null;

  server.addEventListener('message', async (event) => {
    try {
      await this.resetAlarm();

      const data = JSON.parse(event.data);
      console.log('[ws message]', data);
      switch (data.type) {
        case 'identify':
          currentPlayerId = data.playerId;
          await handleIdentify.call(this, server, currentPlayerId);
          break;
        case 'select_cards':
          await this.handleSelectCards(currentPlayerId, data.indices);
          break;
        case 'card_revealed':
          await this.handleCardRevealed(currentPlayerId, data.cardIndex);
          break;
        case 'transfer_request':
          await this.handleTransferRequest(currentPlayerId, data.toPlayerId, data.amount, data.requestType);
          break;
        case 'transfer_response':
          await this.handleTransferResponse(currentPlayerId, data.accept);
          break;
        case 'ready_for_next':
          await this.handleReadyForNext(currentPlayerId);
          break;
        case 'all_cards_revealed':
          await this.handleAllCardsRevealed();
          break;
        case 'restart_game':
          await this.restartGame();
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
    console.log('[ws close]', currentPlayerId);
    if (currentPlayerId) {
      this.connections.delete(currentPlayerId);
      await updatePlayerOnlineStatus.call(this, currentPlayerId, false);
    }
    await this.resetAlarm();
  });

  return new Response(null, { status: 101, webSocket: client });
}

async function handleIdentify(ws, playerId) {
  console.log('[ws] handleIdentify', playerId);
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

  broadcastPlayerList.call(this);

  if (roomData.status === 'playing' && roomData.game) {
    ws.send(JSON.stringify({
      type: 'game_started',
      river: roomData.game.river,
      currentRound: roomData.game.currentRound,
      stage: roomData.game.stage,
    }));
    const playerIndex = roomData.players.findIndex(p => p.id === playerId);
    if (playerIndex !== -1) {
      ws.send(JSON.stringify({ type: 'your_hand', hand: roomData.game.hands[playerIndex] }));
    }
    ws.send(JSON.stringify({
      type: 'round_started',
      round: roomData.game.currentRound,
      stage: roomData.game.stage,
    }));
  }
}

async function updatePlayerOnlineStatus(playerId, online) {
  let roomData = await this.state.storage.get('roomData');
  if (!roomData) return;
  const player = roomData.players.find(p => p.id === playerId);
  if (player) {
    player.isOnline = online;
    await this.state.storage.put('roomData', roomData);
    broadcastPlayerList.call(this);
  }
}

function broadcastPlayerList() {
  this.state.storage.get('roomData').then(roomData => {
    if (!roomData) return;
    const players = roomData.players.map(p => ({
      id: p.id, name: p.name, chips: p.chips, online: p.isOnline
    }));
    broadcast.call(this, { type: 'player_list', players });
  });
}

export function broadcast(message) {
  const str = JSON.stringify(message);
  for (const [id, ws] of this.connections.entries()) {
    try {
      ws.send(str);
    } catch (err) {
      console.error(`broadcast to ${id} failed, removing`);
      this.connections.delete(id);
    }
  }
}

export function sendToPlayer(playerId, message) {
  const ws = this.connections.get(playerId);
  if (ws) {
    try {
      ws.send(JSON.stringify(message));
    } catch (err) {
      console.error(`send to ${playerId} failed`);
    }
  }
}