// src/room-core.js
import { handleJoin, handleGetInfo } from './room-http.js';
import { handleWebSocket, broadcast, sendToPlayer } from './room-ws.js';
import { startGame, handleSelectCards, handleCardRevealed, handleAllCardsRevealed, nextStage, restartGame } from './room-game.js';
import { handleTransferRequest, handleTransferResponse, handleReadyForNext } from './room-exchange.js';

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.connections = new Map();

    // 绑定广播方法
    this.broadcast = broadcast.bind(this);
    this.sendToPlayer = sendToPlayer.bind(this);

    // 绑定游戏逻辑方法
    this.startGame = startGame.bind(this);
    this.handleSelectCards = handleSelectCards.bind(this);
    this.handleCardRevealed = handleCardRevealed.bind(this);
    this.handleAllCardsRevealed = handleAllCardsRevealed.bind(this);
    this.nextStage = nextStage.bind(this);
    this.restartGame = restartGame.bind(this);

    // 绑定筹码交换方法
    this.handleTransferRequest = handleTransferRequest.bind(this);
    this.handleTransferResponse = handleTransferResponse.bind(this);
    this.handleReadyForNext = handleReadyForNext.bind(this);

    // 初始化最后活动时间
    this.lastActivity = Date.now();
    // 设置30分钟后自动清理的Alarm
    this.state.storage.setAlarm(Date.now() + 30 * 60 * 1000);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;
    console.log('[Room] fetch', method, url.pathname);

    // 每次HTTP请求都更新活动时间并重置Alarm
    await this.resetAlarm();

    // WebSocket 升级
    if (request.headers.get('Upgrade') === 'websocket') {
      return handleWebSocket.call(this, request);
    }

    // HTTP 请求
    if (method === 'POST' && url.pathname === '/join') {
      return handleJoin.call(this, request);
    }
    if (method === 'GET' && url.pathname === '/') {
      return handleGetInfo.call(this);
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * 重置活动时间并更新Alarm
   */
  async resetAlarm() {
    this.lastActivity = Date.now();
    await this.state.storage.setAlarm(this.lastActivity + 30 * 60 * 1000);
  }

  /**
   * Alarm 回调：检查是否长时间无活动，是则清理房间数据
   */
  async alarm() {
    const now = Date.now();
    if (now - this.lastActivity > 30 * 60 * 1000) {
      console.log('[Room] 房间无活动超过30分钟，自动销毁');
      await this.state.storage.deleteAll();
      for (const [playerId, ws] of this.connections.entries()) {
        try {
          ws.close(1000, '房间已关闭');
        } catch (e) {}
      }
      this.connections.clear();
    } else {
      await this.state.storage.setAlarm(this.lastActivity + 30 * 60 * 1000);
    }
  }

  jsonError(message, status) {
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}