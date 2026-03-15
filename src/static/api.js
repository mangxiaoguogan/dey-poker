// api.js - 封装与后端 HTTP API 的交互

const API_BASE = '/api';

export async function createRoom(username) {
    try {
        const res = await fetch(`${API_BASE}/room/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        return await res.json();
    } catch (err) {
        return { error: err.message };
    }
}

export async function joinRoom(roomId, username) {
    try {
        const res = await fetch(`${API_BASE}/room/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId, username })
        });
        return await res.json();
    } catch (err) {
        return { error: err.message };
    }
}