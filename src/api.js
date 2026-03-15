// src/api.js

import { generateRoomId, isValidUsername, jsonResponse, parseJsonBody } from './utils.js';

export async function handleApiRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/room/create' && request.method === 'POST') {
    return handleCreateRoom(request, env);
  }
  if (path === '/api/room/join' && request.method === 'POST') {
    return handleJoinRoom(request, env);
  }
  const match = path.match(/^\/api\/room\/([A-Z0-9]+)$/);
  if (match && request.method === 'GET') {
    return handleGetRoomInfo(match[1], env);
  }
  return jsonResponse({ error: 'Not found' }, 404);
}

async function handleCreateRoom(request, env) {
  const body = await parseJsonBody(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON' }, 400);
  const { username } = body;
  if (!isValidUsername(username)) return jsonResponse({ error: 'Invalid username' }, 400);

  const roomId = generateRoomId();
  const id = env.ROOM.idFromName(roomId);
  const stub = env.ROOM.get(id);
  const joinReq = new Request('http://dummy/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, roomId }),
  });
  const response = await stub.fetch(joinReq);
  const result = await response.json();
  if (response.ok) {
    return jsonResponse({ ...result, roomId });
  } else {
    return jsonResponse({ error: result.message || 'Failed to create room' }, response.status);
  }
}

async function handleJoinRoom(request, env) {
  const body = await parseJsonBody(request);
  if (!body) return jsonResponse({ error: 'Invalid JSON' }, 400);
  const { roomId, username } = body;
  if (!roomId || typeof roomId !== 'string' || !isValidUsername(username)) {
    return jsonResponse({ error: 'Invalid roomId or username' }, 400);
  }
  const id = env.ROOM.idFromName(roomId);
  const stub = env.ROOM.get(id);
  const joinReq = new Request('http://dummy/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, roomId }),
  });
  const response = await stub.fetch(joinReq);
  const result = await response.json();
  if (response.ok) {
    return jsonResponse({ ...result, roomId });
  } else {
    return jsonResponse({ error: result.message || 'Failed to join room' }, response.status);
  }
}

async function handleGetRoomInfo(roomId, env) {
  const id = env.ROOM.idFromName(roomId);
  const stub = env.ROOM.get(id);
  const response = await stub.fetch('http://dummy/');
  const data = await response.json();
  return jsonResponse(data);
}