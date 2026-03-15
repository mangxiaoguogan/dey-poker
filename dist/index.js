var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/game.js
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  deck.push({ suit: "joker", rank: "big" });
  deck.push({ suit: "joker", rank: "small" });
  return deck;
}
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function deal(deck) {
  const hands = [[], [], []];
  for (let i = 0; i < 5; i++) {
    for (let p = 0; p < 3; p++) {
      const card = deck.pop();
      hands[p].push(card);
    }
  }
  const river = [];
  for (let i = 0; i < 4; i++) {
    river.push(deck.pop());
  }
  return { hands, river };
}
function initGame() {
  const deck = shuffle(createDeck());
  const { hands, river } = deal(deck);
  const riverWithState = river.map((card, index) => ({
    ...card,
    faceUp: index < 3
    // 前三张明牌，第四张暗牌
  }));
  return {
    deck,
    // 剩余牌堆
    hands,
    // 三个玩家的手牌
    river: riverWithState,
    currentRound: 1,
    stage: "select",
    selectedCards: [[], [], []],
    readyCount: 0
  };
}
var SUITS, RANKS;
var init_game = __esm({
  "src/game.js"() {
    SUITS = ["spade", "heart", "club", "diamond"];
    RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
    __name(createDeck, "createDeck");
    __name(shuffle, "shuffle");
    __name(deal, "deal");
    __name(initGame, "initGame");
  }
});

// src/room-game.js
var room_game_exports = {};
__export(room_game_exports, {
  handleAllCardsRevealed: () => handleAllCardsRevealed,
  handleCardRevealed: () => handleCardRevealed,
  handleSelectCards: () => handleSelectCards,
  nextStage: () => nextStage,
  restartGame: () => restartGame,
  startGame: () => startGame
});
async function startGame(roomData) {
  console.log("[game] startGame", roomData.id);
  roomData.status = "playing";
  roomData.game = initGame();
  roomData.game.revealedCards = [[false, false], [false, false], [false, false]];
  await this.state.storage.put("roomData", roomData);
  this.broadcast({
    type: "game_started",
    river: roomData.game.river,
    currentRound: roomData.game.currentRound,
    stage: roomData.game.stage
  });
  roomData.players.forEach((p, index) => {
    const hand = roomData.game.hands[index];
    this.sendToPlayer(p.id, { type: "your_hand", hand });
  });
  this.broadcast({
    type: "round_started",
    round: 1,
    stage: "select"
  });
}
async function handleSelectCards(playerId, indices) {
  console.log("[game] handleSelectCards", playerId, indices);
  let roomData = await this.state.storage.get("roomData");
  if (!roomData || roomData.status !== "playing") return;
  const playerIndex = roomData.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1) return;
  roomData.game.selectedCards[playerIndex] = indices.slice(0, 2);
  await this.state.storage.put("roomData", roomData);
  const player = roomData.players[playerIndex];
  const hand = roomData.game.hands[playerIndex];
  const selectedCards = indices.slice(0, 2).map((i) => hand[i]);
  this.broadcast({
    type: "player_selected",
    playerId: player.id,
    cards: selectedCards
  });
  await checkAllSelected.call(this, roomData);
}
async function checkAllSelected(roomData) {
  const allSelected = roomData.game.selectedCards.every((arr) => arr.length === 2);
  if (!allSelected) return;
  console.log("[game] all players selected, entering show stage");
  roomData.game.revealedCards = roomData.game.selectedCards.map((cards) => cards.map(() => false));
  const combinations = roomData.players.map((player, idx) => {
    const selectedIndices = roomData.game.selectedCards[idx];
    const hand = roomData.game.hands[idx];
    return selectedIndices.map((i) => hand[i]);
  });
  const playersInfo = roomData.players.map((p) => ({ id: p.id, name: p.name }));
  this.broadcast({
    type: "show_cards",
    combinations,
    players: playersInfo
  });
  this.broadcast({ type: "stage_changed", stage: "show" });
  roomData.game.stage = "show";
  await this.state.storage.put("roomData", roomData);
}
async function handleCardRevealed(playerId, cardIndex) {
  console.log("[game] handleCardRevealed", playerId, cardIndex);
  let roomData = await this.state.storage.get("roomData");
  if (!roomData || roomData.status !== "playing") return;
  const playerIdx = roomData.players.findIndex((p) => p.id === playerId);
  if (playerIdx === -1) return;
  if (roomData.game.revealedCards[playerIdx][cardIndex]) return;
  roomData.game.revealedCards[playerIdx][cardIndex] = true;
  await this.state.storage.put("roomData", roomData);
  this.broadcast({
    type: "card_revealed",
    playerId,
    cardIndex
  });
  const allRevealed = roomData.game.revealedCards.every((playerCards) => playerCards.every((v) => v === true));
  if (allRevealed) {
    await handleAllCardsRevealed.call(this);
  }
}
async function handleAllCardsRevealed() {
  console.log("[game] all cards revealed");
  let roomData = await this.state.storage.get("roomData");
  if (!roomData || roomData.status !== "playing") return;
  const currentRound = roomData.game.currentRound;
  if (currentRound === 4 && !roomData.game.river[3].faceUp) {
    console.log("[game] \u7B2C\u56DB\u8F6E\u79C0\u724C\u5B8C\u6210\uFF0C\u7B49\u5F855\u79D2\u540E\u7FFB\u5F00\u6CB3\u724C");
    setTimeout(async () => {
      console.log("[game] 5\u79D2\u5230\uFF0C\u7FFB\u5F00\u6CB3\u724C");
      let freshData = await this.state.storage.get("roomData");
      if (!freshData || freshData.status !== "playing") return;
      freshData.game.river[3].faceUp = true;
      await this.state.storage.put("roomData", freshData);
      this.broadcast({
        type: "river_updated",
        river: freshData.game.river
      });
      freshData.players.forEach((p) => p.isReady = false);
      freshData.game.stage = "exchange";
      await this.state.storage.put("roomData", freshData);
      this.broadcast({ type: "stage_changed", stage: "exchange" });
    }, 5e3);
    return;
  }
  roomData.players.forEach((p) => p.isReady = false);
  roomData.game.stage = "exchange";
  await this.state.storage.put("roomData", roomData);
  this.broadcast({ type: "stage_changed", stage: "exchange" });
}
async function drawCards(roomData) {
  console.log("[game] drawCards");
  const deck = roomData.game.deck;
  for (let i = 0; i < roomData.players.length; i++) {
    const hand = roomData.game.hands[i];
    const selectedIndices = roomData.game.selectedCards[i];
    const sortedIndices = [...selectedIndices].sort((a, b) => b - a);
    for (const idx of sortedIndices) {
      hand.splice(idx, 1);
    }
    for (let j = 0; j < 2; j++) {
      if (deck.length > 0) {
        hand.push(deck.pop());
      } else {
        console.error("[game] deck empty!");
      }
    }
  }
  roomData.game.selectedCards = [[], [], []];
}
function hasNegativeChips(roomData) {
  return roomData.players.some((p) => p.chips < 0);
}
async function endGame(roomData) {
  console.log("[game] game over due to negative chips");
  roomData.status = "ended";
  const finalChips = roomData.players.map((p) => ({ id: p.id, name: p.name, chips: p.chips }));
  await this.state.storage.put("roomData", roomData);
  this.broadcast({ type: "game_over", players: finalChips });
}
async function restartGame() {
  let roomData = await this.state.storage.get("roomData");
  if (!roomData) return;
  roomData.players.forEach((p) => p.chips = 30);
  roomData.status = "playing";
  roomData.game = initGame();
  roomData.game.revealedCards = [[false, false], [false, false], [false, false]];
  roomData.game.currentRound = 1;
  roomData.game.stage = "select";
  roomData.players.forEach((p) => p.isReady = false);
  await this.state.storage.put("roomData", roomData);
  const playersInfo = roomData.players.map((p) => ({ id: p.id, name: p.name, chips: p.chips, online: p.isOnline }));
  this.broadcast({ type: "player_list", players: playersInfo });
  this.broadcast({
    type: "game_started",
    river: roomData.game.river,
    currentRound: 1,
    stage: "select"
  });
  roomData.players.forEach((p, index) => {
    const hand = roomData.game.hands[index];
    this.sendToPlayer(p.id, { type: "your_hand", hand });
  });
  this.broadcast({
    type: "round_started",
    round: 1,
    stage: "select"
  });
}
async function nextStage(roomData) {
  console.log("[game] nextStage", roomData.game.currentRound, roomData.game.stage);
  if (roomData.game.stage !== "exchange") return;
  if (hasNegativeChips(roomData)) {
    await endGame.call(this, roomData);
    return;
  }
  const currentRound = roomData.game.currentRound;
  if (currentRound < 4) {
    await drawCards.call(this, roomData);
    roomData.game.currentRound++;
    roomData.game.stage = "select";
    roomData.players.forEach((p) => p.isReady = false);
    await this.state.storage.put("roomData", roomData);
    this.broadcast({
      type: "round_started",
      round: roomData.game.currentRound,
      stage: "select"
    });
    roomData.players.forEach((p, index) => {
      const hand = roomData.game.hands[index];
      this.sendToPlayer(p.id, { type: "your_hand", hand });
    });
  } else if (currentRound === 4) {
    for (let i = 0; i < roomData.players.length; i++) {
      const hand = roomData.game.hands[i];
      const selectedIndices = roomData.game.selectedCards[i];
      const sortedIndices = [...selectedIndices].sort((a, b) => b - a);
      for (const idx of sortedIndices) {
        hand.splice(idx, 1);
      }
    }
    roomData.game.selectedCards = [[], [], []];
    roomData.players.forEach((p) => p.isReady = false);
    roomData.game.currentRound = 5;
    roomData.game.stage = "show";
    roomData.game.revealedCards = roomData.game.hands.map((hand) => hand.map(() => false));
    const combinations = roomData.game.hands;
    const playersInfo = roomData.players.map((p) => ({ id: p.id, name: p.name }));
    await this.state.storage.put("roomData", roomData);
    this.broadcast({
      type: "round_started",
      round: 5,
      stage: "show"
    });
    this.broadcast({
      type: "show_cards",
      combinations,
      players: playersInfo
    });
    this.broadcast({ type: "stage_changed", stage: "show" });
  } else if (currentRound === 5) {
    if (hasNegativeChips(roomData)) {
      await endGame.call(this, roomData);
    } else {
      console.log("[game] game finished, starting new round with same chips");
      const chips = roomData.players.map((p) => p.chips);
      roomData.game = initGame();
      roomData.game.revealedCards = [[false, false], [false, false], [false, false]];
      roomData.players.forEach((p, idx) => p.chips = chips[idx]);
      roomData.status = "playing";
      roomData.game.currentRound = 1;
      roomData.game.stage = "select";
      roomData.players.forEach((p) => p.isReady = false);
      await this.state.storage.put("roomData", roomData);
      this.broadcast({
        type: "game_started",
        river: roomData.game.river,
        currentRound: 1,
        stage: "select"
      });
      roomData.players.forEach((p, index) => {
        const hand = roomData.game.hands[index];
        this.sendToPlayer(p.id, { type: "your_hand", hand });
      });
      this.broadcast({
        type: "round_started",
        round: 1,
        stage: "select"
      });
    }
  }
}
var init_room_game = __esm({
  "src/room-game.js"() {
    init_game();
    __name(startGame, "startGame");
    __name(handleSelectCards, "handleSelectCards");
    __name(checkAllSelected, "checkAllSelected");
    __name(handleCardRevealed, "handleCardRevealed");
    __name(handleAllCardsRevealed, "handleAllCardsRevealed");
    __name(drawCards, "drawCards");
    __name(hasNegativeChips, "hasNegativeChips");
    __name(endGame, "endGame");
    __name(restartGame, "restartGame");
    __name(nextStage, "nextStage");
  }
});

// src/utils.js
function generateRoomId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
__name(generateRoomId, "generateRoomId");
function isValidUsername(name) {
  if (!name || typeof name !== "string") return false;
  if (name.length < 1 || name.length > 20) return false;
  return /^[\u4e00-\u9fa5a-zA-Z0-9_]+$/.test(name);
}
__name(isValidUsername, "isValidUsername");
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(jsonResponse, "jsonResponse");
async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
__name(parseJsonBody, "parseJsonBody");

// src/api.js
async function handleApiRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/api/room/create" && request.method === "POST") {
    return handleCreateRoom(request, env);
  }
  if (path === "/api/room/join" && request.method === "POST") {
    return handleJoinRoom(request, env);
  }
  const match = path.match(/^\/api\/room\/([A-Z0-9]+)$/);
  if (match && request.method === "GET") {
    return handleGetRoomInfo(match[1], env);
  }
  return jsonResponse({ error: "Not found" }, 404);
}
__name(handleApiRequest, "handleApiRequest");
async function handleCreateRoom(request, env) {
  const body = await parseJsonBody(request);
  if (!body) return jsonResponse({ error: "Invalid JSON" }, 400);
  const { username } = body;
  if (!isValidUsername(username)) return jsonResponse({ error: "Invalid username" }, 400);
  const roomId = generateRoomId();
  const id = env.ROOM.idFromName(roomId);
  const stub = env.ROOM.get(id);
  const joinReq = new Request("http://dummy/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, roomId })
  });
  const response = await stub.fetch(joinReq);
  const result = await response.json();
  if (response.ok) {
    return jsonResponse({ ...result, roomId });
  } else {
    return jsonResponse({ error: result.message || "Failed to create room" }, response.status);
  }
}
__name(handleCreateRoom, "handleCreateRoom");
async function handleJoinRoom(request, env) {
  const body = await parseJsonBody(request);
  if (!body) return jsonResponse({ error: "Invalid JSON" }, 400);
  const { roomId, username } = body;
  if (!roomId || typeof roomId !== "string" || !isValidUsername(username)) {
    return jsonResponse({ error: "Invalid roomId or username" }, 400);
  }
  const id = env.ROOM.idFromName(roomId);
  const stub = env.ROOM.get(id);
  const joinReq = new Request("http://dummy/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, roomId })
  });
  const response = await stub.fetch(joinReq);
  const result = await response.json();
  if (response.ok) {
    return jsonResponse({ ...result, roomId });
  } else {
    return jsonResponse({ error: result.message || "Failed to join room" }, response.status);
  }
}
__name(handleJoinRoom, "handleJoinRoom");
async function handleGetRoomInfo(roomId, env) {
  const id = env.ROOM.idFromName(roomId);
  const stub = env.ROOM.get(id);
  const response = await stub.fetch("http://dummy/");
  const data = await response.json();
  return jsonResponse(data);
}
__name(handleGetRoomInfo, "handleGetRoomInfo");

// src/room-http.js
init_game();
async function handleJoin(request) {
  console.log("[http] handleJoin");
  const body = await request.json();
  const { username, roomId } = body;
  if (!username) return this.jsonError("Username required", 400);
  let roomData = await this.state.storage.get("roomData") || {
    id: "",
    players: [],
    createdAt: Date.now(),
    status: "waiting",
    game: null
  };
  if (!roomData.id) {
    if (!roomId) return this.jsonError("Room ID required", 400);
    roomData.id = roomId;
  }
  let player = roomData.players.find((p) => p.name === username);
  if (player) {
    if (player.isOnline) {
      return this.jsonError("Username already exists", 409);
    }
    player.isOnline = true;
  } else {
    if (roomData.players.length >= 3) return this.jsonError("Room is full", 403);
    player = {
      id: crypto.randomUUID(),
      name: username,
      chips: 30,
      isReady: false,
      isOnline: true
    };
    roomData.players.push(player);
  }
  await this.state.storage.put("roomData", roomData);
  if (roomData.players.length === 3 && roomData.status === "waiting") {
    const { startGame: startGame2 } = await Promise.resolve().then(() => (init_room_game(), room_game_exports));
    await startGame2.call(this, roomData);
  }
  return new Response(JSON.stringify({
    success: true,
    playerId: player.id,
    players: roomData.players.map((p) => ({ id: p.id, name: p.name, chips: p.chips }))
  }), { headers: { "Content-Type": "application/json" } });
}
__name(handleJoin, "handleJoin");
async function handleGetInfo() {
  const roomData = await this.state.storage.get("roomData") || {};
  return new Response(JSON.stringify(roomData), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(handleGetInfo, "handleGetInfo");

// src/room-ws.js
function handleWebSocket(request) {
  console.log("[ws] handleWebSocket");
  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);
  server.accept();
  let currentPlayerId = null;
  server.addEventListener("message", async (event) => {
    try {
      await this.resetAlarm();
      const data = JSON.parse(event.data);
      console.log("[ws message]", data);
      switch (data.type) {
        case "identify":
          currentPlayerId = data.playerId;
          await handleIdentify.call(this, server, currentPlayerId);
          break;
        case "select_cards":
          await this.handleSelectCards(currentPlayerId, data.indices);
          break;
        case "card_revealed":
          await this.handleCardRevealed(currentPlayerId, data.cardIndex);
          break;
        case "transfer_request":
          await this.handleTransferRequest(currentPlayerId, data.toPlayerId, data.amount, data.requestType);
          break;
        case "transfer_response":
          await this.handleTransferResponse(currentPlayerId, data.accept);
          break;
        case "ready_for_next":
          await this.handleReadyForNext(currentPlayerId);
          break;
        case "all_cards_revealed":
          await this.handleAllCardsRevealed();
          break;
        case "restart_game":
          await this.restartGame();
          break;
        case "ping":
          server.send(JSON.stringify({ type: "pong" }));
          break;
        default:
          server.send(JSON.stringify({ type: "error", message: "Unknown type" }));
      }
    } catch (err) {
      console.error("[ws error]", err);
      server.send(JSON.stringify({ type: "error", message: "Invalid message" }));
    }
  });
  server.addEventListener("close", async () => {
    console.log("[ws close]", currentPlayerId);
    if (currentPlayerId) {
      this.connections.delete(currentPlayerId);
      await updatePlayerOnlineStatus.call(this, currentPlayerId, false);
    }
    await this.resetAlarm();
  });
  return new Response(null, { status: 101, webSocket: client });
}
__name(handleWebSocket, "handleWebSocket");
async function handleIdentify(ws, playerId) {
  console.log("[ws] handleIdentify", playerId);
  let roomData = await this.state.storage.get("roomData");
  if (!roomData) {
    ws.send(JSON.stringify({ type: "error", message: "Room not found" }));
    ws.close();
    return;
  }
  const player = roomData.players.find((p) => p.id === playerId);
  if (!player) {
    ws.send(JSON.stringify({ type: "error", message: "Player not found" }));
    ws.close();
    return;
  }
  const existing = this.connections.get(playerId);
  if (existing) existing.close();
  this.connections.set(playerId, ws);
  player.isOnline = true;
  await this.state.storage.put("roomData", roomData);
  broadcastPlayerList.call(this);
  if (roomData.status === "playing" && roomData.game) {
    ws.send(JSON.stringify({
      type: "game_started",
      river: roomData.game.river,
      currentRound: roomData.game.currentRound,
      stage: roomData.game.stage
    }));
    const playerIndex = roomData.players.findIndex((p) => p.id === playerId);
    if (playerIndex !== -1) {
      ws.send(JSON.stringify({ type: "your_hand", hand: roomData.game.hands[playerIndex] }));
    }
    ws.send(JSON.stringify({
      type: "round_started",
      round: roomData.game.currentRound,
      stage: roomData.game.stage
    }));
  }
}
__name(handleIdentify, "handleIdentify");
async function updatePlayerOnlineStatus(playerId, online) {
  let roomData = await this.state.storage.get("roomData");
  if (!roomData) return;
  const player = roomData.players.find((p) => p.id === playerId);
  if (player) {
    player.isOnline = online;
    await this.state.storage.put("roomData", roomData);
    broadcastPlayerList.call(this);
  }
}
__name(updatePlayerOnlineStatus, "updatePlayerOnlineStatus");
function broadcastPlayerList() {
  this.state.storage.get("roomData").then((roomData) => {
    if (!roomData) return;
    const players = roomData.players.map((p) => ({
      id: p.id,
      name: p.name,
      chips: p.chips,
      online: p.isOnline
    }));
    broadcast.call(this, { type: "player_list", players });
  });
}
__name(broadcastPlayerList, "broadcastPlayerList");
function broadcast(message) {
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
__name(broadcast, "broadcast");
function sendToPlayer(playerId, message) {
  const ws = this.connections.get(playerId);
  if (ws) {
    try {
      ws.send(JSON.stringify(message));
    } catch (err) {
      console.error(`send to ${playerId} failed`);
    }
  }
}
__name(sendToPlayer, "sendToPlayer");

// src/room-core.js
init_room_game();

// src/room-exchange.js
async function handleTransferRequest(fromPlayerId, toPlayerId, amount, requestType) {
  let roomData = await this.state.storage.get("roomData");
  if (!roomData) return;
  const fromPlayer = roomData.players.find((p) => p.id === fromPlayerId);
  const toPlayer = roomData.players.find((p) => p.id === toPlayerId);
  if (!fromPlayer || !toPlayer) {
    this.sendToPlayer(fromPlayerId, { type: "error", message: "\u73A9\u5BB6\u4E0D\u5B58\u5728" });
    return;
  }
  roomData.pendingTransfer = {
    from: fromPlayerId,
    to: toPlayerId,
    amount,
    requestType,
    timestamp: Date.now()
  };
  await this.state.storage.put("roomData", roomData);
  this.sendToPlayer(toPlayerId, {
    type: "transfer_request",
    from: fromPlayerId,
    fromName: fromPlayer.name,
    amount,
    requestType
  });
}
__name(handleTransferRequest, "handleTransferRequest");
async function handleTransferResponse(playerId, accept) {
  let roomData = await this.state.storage.get("roomData");
  if (!roomData) return;
  const pending = roomData.pendingTransfer;
  if (!pending || pending.to !== playerId) {
    this.sendToPlayer(playerId, { type: "error", message: "\u6CA1\u6709\u5F85\u5904\u7406\u7684\u8BF7\u6C42" });
    return;
  }
  if (accept) {
    const fromPlayer = roomData.players.find((p) => p.id === pending.from);
    const toPlayer = roomData.players.find((p) => p.id === pending.to);
    if (!fromPlayer || !toPlayer) {
      this.sendToPlayer(playerId, { type: "error", message: "\u73A9\u5BB6\u4E0D\u5B58\u5728" });
      return;
    }
    fromPlayer.chips -= pending.amount;
    toPlayer.chips += pending.amount;
    await this.state.storage.put("roomData", roomData);
    const playersInfo = roomData.players.map((p) => ({ id: p.id, chips: p.chips }));
    this.broadcast({ type: "chips_updated", players: playersInfo });
    this.sendToPlayer(pending.from, { type: "transfer_success" });
  } else {
    this.sendToPlayer(pending.from, { type: "transfer_rejected" });
  }
  delete roomData.pendingTransfer;
  await this.state.storage.put("roomData", roomData);
}
__name(handleTransferResponse, "handleTransferResponse");
async function handleReadyForNext(playerId) {
  let roomData = await this.state.storage.get("roomData");
  if (!roomData) return;
  const player = roomData.players.find((p) => p.id === playerId);
  if (!player) return;
  player.isReady = true;
  await this.state.storage.put("roomData", roomData);
  this.broadcast({ type: "player_ready", playerId });
  const allReady = roomData.players.every((p) => p.isReady);
  if (allReady) {
    const { nextStage: nextStage2 } = await Promise.resolve().then(() => (init_room_game(), room_game_exports));
    await nextStage2.call(this, roomData);
  }
}
__name(handleReadyForNext, "handleReadyForNext");

// src/room-core.js
var Room = class {
  static {
    __name(this, "Room");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.connections = /* @__PURE__ */ new Map();
    this.broadcast = broadcast.bind(this);
    this.sendToPlayer = sendToPlayer.bind(this);
    this.startGame = startGame.bind(this);
    this.handleSelectCards = handleSelectCards.bind(this);
    this.handleCardRevealed = handleCardRevealed.bind(this);
    this.handleAllCardsRevealed = handleAllCardsRevealed.bind(this);
    this.nextStage = nextStage.bind(this);
    this.restartGame = restartGame.bind(this);
    this.handleTransferRequest = handleTransferRequest.bind(this);
    this.handleTransferResponse = handleTransferResponse.bind(this);
    this.handleReadyForNext = handleReadyForNext.bind(this);
    this.lastActivity = Date.now();
    this.state.storage.setAlarm(Date.now() + 30 * 60 * 1e3);
  }
  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;
    console.log("[Room] fetch", method, url.pathname);
    await this.resetAlarm();
    if (request.headers.get("Upgrade") === "websocket") {
      return handleWebSocket.call(this, request);
    }
    if (method === "POST" && url.pathname === "/join") {
      return handleJoin.call(this, request);
    }
    if (method === "GET" && url.pathname === "/") {
      return handleGetInfo.call(this);
    }
    return new Response("Not found", { status: 404 });
  }
  /**
   * 重置活动时间并更新Alarm
   */
  async resetAlarm() {
    this.lastActivity = Date.now();
    await this.state.storage.setAlarm(this.lastActivity + 30 * 60 * 1e3);
  }
  /**
   * Alarm 回调：检查是否长时间无活动，是则清理房间数据
   */
  async alarm() {
    const now = Date.now();
    if (now - this.lastActivity > 30 * 60 * 1e3) {
      console.log("[Room] \u623F\u95F4\u65E0\u6D3B\u52A8\u8D85\u8FC730\u5206\u949F\uFF0C\u81EA\u52A8\u9500\u6BC1");
      await this.state.storage.deleteAll();
      for (const [playerId, ws] of this.connections.entries()) {
        try {
          ws.close(1e3, "\u623F\u95F4\u5DF2\u5173\u95ED");
        } catch (e) {
        }
      }
      this.connections.clear();
    } else {
      await this.state.storage.setAlarm(this.lastActivity + 30 * 60 * 1e3);
    }
  }
  jsonError(message, status) {
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }
};

// src/index.js
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/ws/")) {
      const roomId = url.pathname.substring(4);
      if (!roomId) return new Response("Missing room ID", { status: 400 });
      const id = env.ROOM.idFromName(roomId);
      const stub = env.ROOM.get(id);
      return stub.fetch(request);
    }
    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest(request, env);
    }
    return new Response("Not Found", { status: 404 });
  }
};
export {
  Room,
  index_default as default
};
//# sourceMappingURL=index.js.map
