// src/index.js
import { handleApiRequest } from './api.js';
export { Room } from './room-core.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // WebSocket 连接
    if (url.pathname.startsWith('/ws/')) {
      const roomId = url.pathname.substring(4);
      if (!roomId) return new Response('Missing room ID', { status: 400 });
      const id = env.ROOM.idFromName(roomId);
      const stub = env.ROOM.get(id);
      return stub.fetch(request);
    }

    // API 请求
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, env);
    }

    // 其他路径由静态资产处理（通过 wrangler.toml 的 assets 配置）
    return new Response('Not Found', { status: 404 });
  },
};