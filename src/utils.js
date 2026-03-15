// src/utils.js

/**
 * 生成一个6位随机房间号（数字+大写字母）
 */
export function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 验证用户名是否合法（非空，长度1-20，仅字母数字中文下划线）
 */
export function isValidUsername(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length < 1 || name.length > 20) return false;
  return /^[\u4e00-\u9fa5a-zA-Z0-9_]+$/.test(name);
}

/**
 * 创建标准 JSON 响应
 */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 安全解析请求体 JSON
 */
export async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}