# dey-poker

一个基于 **Cloudflare Workers + Durable Objects + WebSocket** 的三人在线扑克游戏（逮二游）。

## 功能概览

- 三人房间：创建房间、加入房间、实时在线状态同步
- 游戏流程：选牌 → 秀牌 → 筹码交换 → 下一轮
- 多轮机制：前四轮常规流程，第五轮进入终局秀牌
- 实时交互：WebSocket 广播玩家操作、翻牌、筹码变化
- 断线重连：玩家重连后自动补发当前游戏状态
- 房间生命周期：30 分钟无活动自动清理 Durable Object 状态

## 技术栈

- Cloudflare Workers
- Durable Objects（房间状态与连接管理）
- 原生 WebSocket
- 前端：原生 JavaScript + HTML + CSS
- 动画：anime.js（CDN）

## 本地开发

### 环境要求

- Node.js 18+
- npm
- Wrangler CLI（项目已在 `devDependencies` 中声明）

### 安装依赖

```bash
npm install
```

### 启动开发服务

```bash
npm run dev
```

启动后用浏览器打开 Wrangler 提供的本地地址（通常是 `http://127.0.0.1:8787`）。

### 部署

```bash
npm run deploy
```

## 配置说明

`wrangler.toml` 关键配置：

- `main = "src/index.js"`：Worker 入口
- `[assets].directory = "./src/static"`：静态资源目录
- Durable Object 绑定：
  - `name = "ROOM"`
  - `class_name = "Room"`

## 目录结构

```text
src/
├─ index.js              # Worker 入口，路由 /api/* 与 /ws/*
├─ api.js                # HTTP API 路由处理
├─ room-core.js          # Room Durable Object 主类
├─ room-http.js          # Room 内部 HTTP（/join, /）
├─ room-ws.js            # WebSocket 消息分发与连接管理
├─ room-game.js          # 核心游戏流程（选牌/秀牌/轮次推进）
├─ room-exchange.js      # 筹码交换逻辑
├─ game.js               # 发牌、洗牌、初始化
└─ static/
   ├─ index.html         # 前端页面
   ├─ main.js            # 前端入口与消息处理
   ├─ ui.js              # UI 渲染与阶段切换
   ├─ exchange.js        # 筹码交换弹窗与滑块
   ├─ websocket.js       # 前端 WS 管理与重连
   ├─ api.js             # 前端 HTTP API 封装
   └─ style.css
```

## 游戏与阶段说明

- 初始发牌：每人 5 张，河牌 4 张（前 3 张明牌，第 4 张暗牌）
- 每轮阶段：
  1. `select`：每位玩家选择 2 张牌
  2. `show`：展示并翻开所选牌
  3. `exchange`：玩家间给予/索要筹码，确认后进入下一轮
- 第四轮特殊：秀牌完成后等待 5 秒翻开第 4 张河牌，再进入交换
- 第五轮：展示最终手牌组合，结束后按规则重开或结算

## HTTP API

### 创建房间

- `POST /api/room/create`
- 请求体：

```json
{ "username": "Alice" }
```

### 加入房间

- `POST /api/room/join`
- 请求体：

```json
{ "roomId": "ABC123", "username": "Bob" }
```

### 获取房间信息

- `GET /api/room/{roomId}`

## WebSocket 协议

### 客户端发送（示例）

- `identify`
- `select_cards`
- `card_revealed`
- `transfer_request`
- `transfer_response`
- `ready_for_next`
- `restart_game`
- `ping`

### 服务端广播/回包（示例）

- `player_list`
- `game_started`
- `round_started`
- `show_cards`
- `stage_changed`
- `card_revealed`
- `chips_updated`
- `player_ready`
- `game_over`
- `error`
- `pong`

## 开发建议

- 调整阶段逻辑时，优先同步检查：
  - `src/room-game.js`（服务端状态推进）
  - `src/static/main.js`（消息分发）
  - `src/static/ui.js`（界面展示）
- 调整筹码交换相关时，检查：
  - `src/static/exchange.js`（滑块默认值、弹窗交互）
  - `src/room-exchange.js`（转移校验与广播）

## License

仅供学习与内部开发使用。