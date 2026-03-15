// src/room-game.js
import { initGame } from './game.js';

export async function startGame(roomData) {
    console.log('[game] startGame', roomData.id);
    roomData.status = 'playing';
    roomData.game = initGame();
    roomData.game.revealedCards = [[false, false], [false, false], [false, false]];

    await this.state.storage.put('roomData', roomData);

    this.broadcast({
        type: 'game_started',
        river: roomData.game.river,
        currentRound: roomData.game.currentRound,
        stage: roomData.game.stage,
    });

    roomData.players.forEach((p, index) => {
        const hand = roomData.game.hands[index];
        this.sendToPlayer(p.id, { type: 'your_hand', hand });
    });

    this.broadcast({
        type: 'round_started',
        round: 1,
        stage: 'select',
    });
}

export async function handleSelectCards(playerId, indices) {
    console.log('[game] handleSelectCards', playerId, indices);
    let roomData = await this.state.storage.get('roomData');
    if (!roomData || roomData.status !== 'playing') return;

    const playerIndex = roomData.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;

    roomData.game.selectedCards[playerIndex] = indices.slice(0, 2);
    await this.state.storage.put('roomData', roomData);

    const player = roomData.players[playerIndex];
    const hand = roomData.game.hands[playerIndex];
    const selectedCards = indices.slice(0, 2).map(i => hand[i]);
    this.broadcast({
        type: 'player_selected',
        playerId: player.id,
        cards: selectedCards
    });

    await checkAllSelected.call(this, roomData);
}

async function checkAllSelected(roomData) {
    const allSelected = roomData.game.selectedCards.every(arr => arr.length === 2);
    if (!allSelected) return;

    console.log('[game] all players selected, entering show stage');

    // 第四轮不立即翻开河牌，留到所有牌翻开后处理
    roomData.game.revealedCards = roomData.game.selectedCards.map(cards => cards.map(() => false));

    const combinations = roomData.players.map((player, idx) => {
        const selectedIndices = roomData.game.selectedCards[idx];
        const hand = roomData.game.hands[idx];
        return selectedIndices.map(i => hand[i]);
    });

    const playersInfo = roomData.players.map(p => ({ id: p.id, name: p.name }));

    this.broadcast({
        type: 'show_cards',
        combinations,
        players: playersInfo
    });

    this.broadcast({ type: 'stage_changed', stage: 'show' });

    roomData.game.stage = 'show';
    await this.state.storage.put('roomData', roomData);
}

export async function handleCardRevealed(playerId, cardIndex) {
    console.log('[game] handleCardRevealed', playerId, cardIndex);
    let roomData = await this.state.storage.get('roomData');
    if (!roomData || roomData.status !== 'playing') return;

    const playerIdx = roomData.players.findIndex(p => p.id === playerId);
    if (playerIdx === -1) return;

    if (roomData.game.revealedCards[playerIdx][cardIndex]) return;

    roomData.game.revealedCards[playerIdx][cardIndex] = true;
    await this.state.storage.put('roomData', roomData);

    this.broadcast({
        type: 'card_revealed',
        playerId,
        cardIndex
    });

    const allRevealed = roomData.game.revealedCards.every(playerCards => playerCards.every(v => v === true));
    if (allRevealed) {
        await handleAllCardsRevealed.call(this);
    }
}

export async function handleAllCardsRevealed() {
    console.log('[game] all cards revealed');
    let roomData = await this.state.storage.get('roomData');
    if (!roomData || roomData.status !== 'playing') return;

    const currentRound = roomData.game.currentRound;

    // 第四轮特殊处理：等待5秒后翻开河牌
    if (currentRound === 4 && !roomData.game.river[3].faceUp) {
        console.log('[game] 第四轮秀牌完成，等待5秒后翻开河牌');
        setTimeout(async () => {
            console.log('[game] 5秒到，翻开河牌');
            let freshData = await this.state.storage.get('roomData');
            if (!freshData || freshData.status !== 'playing') return;

            freshData.game.river[3].faceUp = true;
            await this.state.storage.put('roomData', freshData);
            this.broadcast({
                type: 'river_updated',
                river: freshData.game.river
            });

            // 重置准备状态并进入筹码交换阶段
            freshData.players.forEach(p => p.isReady = false);
            freshData.game.stage = 'exchange';
            await this.state.storage.put('roomData', freshData);
            this.broadcast({ type: 'stage_changed', stage: 'exchange' });
        }, 5000);

        return;
    }

    // 非第四轮或河牌已翻开，直接进入筹码交换
    roomData.players.forEach(p => p.isReady = false);
    roomData.game.stage = 'exchange';
    await this.state.storage.put('roomData', roomData);
    this.broadcast({ type: 'stage_changed', stage: 'exchange' });
}

async function drawCards(roomData) {
    console.log('[game] drawCards');
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
                console.error('[game] deck empty!');
            }
        }
    }
    roomData.game.selectedCards = [[], [], []];
}

/**
 * 检查是否有玩家筹码为负数
 */
function hasNegativeChips(roomData) {
    return roomData.players.some(p => p.chips < 0);
}

/**
 * 游戏结束，广播结算
 */
async function endGame(roomData) {
    console.log('[game] game over due to negative chips');
    roomData.status = 'ended';
    const finalChips = roomData.players.map(p => ({ id: p.id, name: p.name, chips: p.chips }));
    await this.state.storage.put('roomData', roomData);
    this.broadcast({ type: 'game_over', players: finalChips });
}

/**
 * 重新开始游戏（重置筹码）
 */
export async function restartGame() {
    let roomData = await this.state.storage.get('roomData');
    if (!roomData) return;

    // 重置筹码为30
    roomData.players.forEach(p => p.chips = 30);
    // 重新初始化游戏
    roomData.status = 'playing';
    roomData.game = initGame();
    roomData.game.revealedCards = [[false, false], [false, false], [false, false]];
    roomData.game.currentRound = 1;
    roomData.game.stage = 'select';
    roomData.players.forEach(p => p.isReady = false);
    await this.state.storage.put('roomData', roomData);
    // 广播玩家列表（包含最新筹码）
    const playersInfo = roomData.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, online: p.isOnline }));
    this.broadcast({ type: 'player_list', players: playersInfo });

    this.broadcast({
        type: 'game_started',
        river: roomData.game.river,
        currentRound: 1,
        stage: 'select'
    });
    roomData.players.forEach((p, index) => {
        const hand = roomData.game.hands[index];
        this.sendToPlayer(p.id, { type: 'your_hand', hand });
    });
    this.broadcast({
        type: 'round_started',
        round: 1,
        stage: 'select'
    });
}

export async function nextStage(roomData) {
    console.log('[game] nextStage', roomData.game.currentRound, roomData.game.stage);
    if (roomData.game.stage !== 'exchange') return;

    // 检查是否有玩家筹码为负数
    if (hasNegativeChips(roomData)) {
        await endGame.call(this, roomData);
        return; // 不再继续推进
    }

    const currentRound = roomData.game.currentRound;
    if (currentRound < 4) {
        await drawCards.call(this, roomData);
        roomData.game.currentRound++;
        roomData.game.stage = 'select';
        roomData.players.forEach(p => p.isReady = false);
        await this.state.storage.put('roomData', roomData);

        this.broadcast({
            type: 'round_started',
            round: roomData.game.currentRound,
            stage: 'select'
        });

        roomData.players.forEach((p, index) => {
            const hand = roomData.game.hands[index];
            this.sendToPlayer(p.id, { type: 'your_hand', hand });
        });
    } else if (currentRound === 4) {
        // 第四轮：移除选中的两张牌（不摸牌），进入第五轮秀牌
        for (let i = 0; i < roomData.players.length; i++) {
            const hand = roomData.game.hands[i];
            const selectedIndices = roomData.game.selectedCards[i];
            const sortedIndices = [...selectedIndices].sort((a, b) => b - a);
            for (const idx of sortedIndices) {
                hand.splice(idx, 1);
            }
        }
        roomData.game.selectedCards = [[], [], []];

        roomData.players.forEach(p => p.isReady = false);
        roomData.game.currentRound = 5;
        roomData.game.stage = 'show';
        roomData.game.revealedCards = roomData.game.hands.map(hand => hand.map(() => false));
        const combinations = roomData.game.hands;
        const playersInfo = roomData.players.map(p => ({ id: p.id, name: p.name }));
        await this.state.storage.put('roomData', roomData);

        this.broadcast({
            type: 'round_started',
            round: 5,
            stage: 'show'
        });
        this.broadcast({
            type: 'show_cards',
            combinations,
            players: playersInfo
        });
        this.broadcast({ type: 'stage_changed', stage: 'show' });
    } else if (currentRound === 5) {
        // 第五轮结束：检查筹码负数，若无则重新开始新局（筹码继承）
        if (hasNegativeChips(roomData)) {
            await endGame.call(this, roomData);
        } else {
            console.log('[game] game finished, starting new round with same chips');
            // 重新初始化游戏，但保留筹码
            const chips = roomData.players.map(p => p.chips);
            roomData.game = initGame();
            roomData.game.revealedCards = [[false, false], [false, false], [false, false]];
            roomData.players.forEach((p, idx) => p.chips = chips[idx]);
            roomData.status = 'playing';
            roomData.game.currentRound = 1;
            roomData.game.stage = 'select';
            roomData.players.forEach(p => p.isReady = false);
            await this.state.storage.put('roomData', roomData);

            this.broadcast({
                type: 'game_started',
                river: roomData.game.river,
                currentRound: 1,
                stage: 'select'
            });
            roomData.players.forEach((p, index) => {
                const hand = roomData.game.hands[index];
                this.sendToPlayer(p.id, { type: 'your_hand', hand });
            });
            this.broadcast({
                type: 'round_started',
                round: 1,
                stage: 'select'
            });
        }
    }
}