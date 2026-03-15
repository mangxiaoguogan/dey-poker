// src/room-exchange.js
/**
 * 处理筹码转移请求
 * @param {string} fromPlayerId - 发起方ID
 * @param {string} toPlayerId - 目标玩家ID
 * @param {number} amount - 筹码数量
 * @param {string} requestType - 'give' 或 'ask'
 */
export async function handleTransferRequest(fromPlayerId, toPlayerId, amount, requestType) {
    let roomData = await this.state.storage.get('roomData');
    if (!roomData) return;

    const fromPlayer = roomData.players.find(p => p.id === fromPlayerId);
    const toPlayer = roomData.players.find(p => p.id === toPlayerId);
    if (!fromPlayer || !toPlayer) {
        this.sendToPlayer(fromPlayerId, { type: 'error', message: '玩家不存在' });
        return;
    }
    // 移除筹码检查，允许负数

    // 暂存请求信息
    roomData.pendingTransfer = {
        from: fromPlayerId,
        to: toPlayerId,
        amount,
        requestType,
        timestamp: Date.now()
    };
    await this.state.storage.put('roomData', roomData);

    // 向目标玩家发送请求
    this.sendToPlayer(toPlayerId, {
        type: 'transfer_request',
        from: fromPlayerId,
        fromName: fromPlayer.name,
        amount,
        requestType
    });
}

/**
 * 处理目标玩家的响应
 * @param {string} playerId - 响应方ID（即接收方）
 * @param {boolean} accept - 是否同意
 */
export async function handleTransferResponse(playerId, accept) {
    let roomData = await this.state.storage.get('roomData');
    if (!roomData) return;

    const pending = roomData.pendingTransfer;
    if (!pending || pending.to !== playerId) {
        this.sendToPlayer(playerId, { type: 'error', message: '没有待处理的请求' });
        return;
    }

    if (accept) {
        const fromPlayer = roomData.players.find(p => p.id === pending.from);
        const toPlayer = roomData.players.find(p => p.id === pending.to);
        if (!fromPlayer || !toPlayer) {
            this.sendToPlayer(playerId, { type: 'error', message: '玩家不存在' });
            return;
        }
        // 直接执行筹码转移，不检查筹码
        fromPlayer.chips -= pending.amount;
        toPlayer.chips += pending.amount;
        await this.state.storage.put('roomData', roomData);

        const playersInfo = roomData.players.map(p => ({ id: p.id, chips: p.chips }));
        this.broadcast({ type: 'chips_updated', players: playersInfo });
        
        // 通知发起方成功（可选）
        this.sendToPlayer(pending.from, { type: 'transfer_success' });
    } else {
        this.sendToPlayer(pending.from, { type: 'transfer_rejected' });
    }

    delete roomData.pendingTransfer;
    await this.state.storage.put('roomData', roomData);
}

/**
 * 处理玩家点击"准备下一轮"
 * @param {string} playerId - 玩家ID
 */
export async function handleReadyForNext(playerId) {
    let roomData = await this.state.storage.get('roomData');
    if (!roomData) return;

    const player = roomData.players.find(p => p.id === playerId);
    if (!player) return;

    player.isReady = true;
    await this.state.storage.put('roomData', roomData);

    this.broadcast({ type: 'player_ready', playerId });

    const allReady = roomData.players.every(p => p.isReady);
    if (allReady) {
        const { nextStage } = await import('./room-game.js');
        await nextStage.call(this, roomData);
    }
}