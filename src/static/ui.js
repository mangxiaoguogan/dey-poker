// ui.js - 最终版，清空手牌区域于秀牌阶段
import * as game from './game.js';
import { getWs } from './websocket.js';
import * as exchange from './exchange.js';

// DOM 元素
const lobby = document.getElementById('lobby');
const roomSection = document.getElementById('roomSection');
const gameSection = document.getElementById('gameSection');
const wsStatus = document.getElementById('wsStatus');
const sendPingBtn = document.getElementById('sendPingBtn');
const selectConfirmBtn = document.getElementById('selectConfirmBtn');
const roundSpan = document.getElementById('round');
const stageSpan = document.getElementById('stage');
const riverArea = document.getElementById('riverArea');
const showPiles = {
    left: document.getElementById('show-pile-left'),
    right: document.getElementById('show-pile-right'),
    bottom: document.getElementById('show-pile-bottom')
};
const myHandArea = document.getElementById('my-hand-area');
const playersContainer = document.getElementById('playersContainer');
const revealStatus = document.getElementById('revealStatus');

const readyLeft = document.getElementById('ready-left');
const readyRight = document.getElementById('ready-right');
const readyBottom = document.getElementById('ready-bottom');

// 玩家信息元素
const avatarLeft = document.getElementById('avatar-left');
const avatarRight = document.getElementById('avatar-right');
const avatarBottom = document.getElementById('avatar-bottom');
const nameLeft = document.getElementById('name-left');
const nameRight = document.getElementById('name-right');
const nameBottom = document.getElementById('name-bottom');
const chipsLeft = document.getElementById('chips-left');
const chipsRight = document.getElementById('chips-right');
const chipsBottom = document.getElementById('chips-bottom');
const onlineLeft = document.getElementById('online-left');
const onlineRight = document.getElementById('online-right');
const onlineBottom = document.getElementById('online-bottom');

// 秀牌相关
let currentCombinations = [];
let revealedState = [];
let playerSeatMap = {};
let playerIdToIdx = {};
let playerInfoMap = {};
let selectedTargetId = null;

// ==================== 辅助函数 ====================
function getSuitClass(suit) {
    if (suit === 'heart' || suit === 'diamond') return 'suit-red';
    if (suit === 'spade' || suit === 'club') return 'suit-black';
    if (suit === 'joker') return 'suit-joker';
    return '';
}

function getSuitSymbol(suit) {
    switch (suit) {
        case 'spade': return '♠';
        case 'heart': return '♥';
        case 'club': return '♣';
        case 'diamond': return '♦';
        case 'joker': return '🃏';
        default: return '?';
    }
}

function renderCard(card, isBack = false, clickable = false, selected = false, extraClass = '') {
    if (isBack) {
        return `<div class="poker-card back ${extraClass}">背面</div>`;
    }
    const suitClass = getSuitClass(card.suit);
    const symbol = getSuitSymbol(card.suit);
    const rank = card.rank === '10' ? '10' : card.rank.charAt(0);
    const clickableClass = clickable ? 'clickable' : '';
    const selectedClass = selected ? 'selected' : '';
    return `<div class="poker-card ${suitClass} ${clickableClass} ${selectedClass} ${extraClass}">
        <div>${rank}</div>
        <div style="font-size: 1.2em;">${symbol}</div>
    </div>`;
}

// ==================== 公开函数 ====================
export function showRoomSection(roomId) {
    console.log('[ui] showRoomSection', roomId);
    lobby.style.display = 'none';
    roomSection.style.display = 'block';
    document.getElementById('currentRoomId').textContent = roomId;
    sendPingBtn.disabled = false;
}

export function updateConnectionStatus(status) {
    wsStatus.textContent = status;
}

export function updatePlayerList(players) {
    console.log('[ui] updatePlayerList', players);
    if (roomSection.style.display !== 'none' && playersContainer) {
        playersContainer.innerHTML = '';
        players.forEach(p => {
            const div = document.createElement('div');
            div.className = 'player-item';
            const statusClass = p.online ? 'online' : 'offline';
            div.innerHTML = `<span class="${statusClass}">●</span> ${p.name} (筹码: ${p.chips})`;
            playersContainer.appendChild(div);
        });
    }

    if (gameSection.style.display !== 'none') {
        const currentPlayerId = window.currentPlayerId;
        if (!currentPlayerId) return;

        const currentIdx = players.findIndex(p => p.id === currentPlayerId);
        if (currentIdx === -1) return;

        const leftIdx = (currentIdx - 1 + 3) % 3;
        const rightIdx = (currentIdx + 1) % 3;

        const leftPlayer = players[leftIdx];
        const rightPlayer = players[rightIdx];
        const selfPlayer = players[currentIdx];

        playerSeatMap = {};
        playerInfoMap = {};

        if (leftPlayer) {
            playerSeatMap[leftPlayer.id] = 'left';
            nameLeft.textContent = leftPlayer.name;
            chipsLeft.textContent = leftPlayer.chips;
            avatarLeft.textContent = leftPlayer.name.charAt(0).toUpperCase();
            onlineLeft.className = leftPlayer.online ? 'online-dot online' : 'online-dot offline';
            playerInfoMap[leftPlayer.id] = { name: leftPlayer.name, seat: 'left' };
        }
        if (rightPlayer) {
            playerSeatMap[rightPlayer.id] = 'right';
            nameRight.textContent = rightPlayer.name;
            chipsRight.textContent = rightPlayer.chips;
            avatarRight.textContent = rightPlayer.name.charAt(0).toUpperCase();
            onlineRight.className = rightPlayer.online ? 'online-dot online' : 'online-dot offline';
            playerInfoMap[rightPlayer.id] = { name: rightPlayer.name, seat: 'right' };
        }
        if (selfPlayer) {
            playerSeatMap[selfPlayer.id] = 'bottom';
            nameBottom.textContent = selfPlayer.name;
            chipsBottom.textContent = selfPlayer.chips;
            avatarBottom.textContent = selfPlayer.name.charAt(0).toUpperCase();
            onlineBottom.className = selfPlayer.online ? 'online-dot online' : 'online-dot offline';
        }

        console.log('[ui] playerSeatMap', playerSeatMap);
    }
}

document.querySelector('.poker-table').addEventListener('click', (e) => {
    const target = e.target.closest('.player-left, .player-right');
    if (!target) return;
    const isLeft = target.classList.contains('player-left');
    const playerId = isLeft ? Object.keys(playerSeatMap).find(id => playerSeatMap[id] === 'left') :
        Object.keys(playerSeatMap).find(id => playerSeatMap[id] === 'right');
    if (!playerId) return;

    console.log('[ui] seat clicked, playerId', playerId);
    selectedTargetId = playerId;
    document.querySelectorAll('.player-left, .player-right').forEach(el => el.classList.remove('target'));
    target.classList.add('target');
    exchange.setTargetPlayer(playerId);
});

export function showGameSection() {
    console.log('[ui] showGameSection');
    roomSection.style.display = 'none';
    gameSection.style.display = 'block';
    clearAllReady(); // 新增

}

export function renderRiver(river) {
    console.log('[ui] renderRiver', river);
    let html = '';
    river.forEach(card => {
        html += renderCard(card, !card.faceUp, false, false);
    });
    riverArea.innerHTML = html;
}

export function renderHand(hand) {
    console.log('[ui] renderHand', hand);
    const selectedIndices = game.getSelectedIndices();
    let html = '';
    hand.forEach((card, index) => {
        const isSelected = selectedIndices.includes(index);
        html += renderCard(card, false, true, isSelected, 'hand-card').replace('<div', `<div data-index="${index}"`);
    });
    myHandArea.innerHTML = html;
}

myHandArea.addEventListener('click', (e) => {
    const cardDiv = e.target.closest('.poker-card.clickable');
    if (!cardDiv) return;
    const index = cardDiv.dataset.index;
    if (index === undefined) return;
    console.log('[ui] hand card clicked', index);
    const newSelection = game.handleCardClick(parseInt(index));
    if (newSelection !== false) {
        renderHand(window.myHand);
    }
});

export function updateRoundInfo(round, stage) {
    console.log('[ui] updateRoundInfo', round, stage);
    roundSpan.textContent = round;
    exchange.setCurrentRound(round);// 更新当前回合为筹码默认值
    let stageChinese = '';
    if (stage === 'select') stageChinese = '选牌';
    else if (stage === 'show') stageChinese = '秀牌';
    else if (stage === 'exchange') stageChinese = '筹码交换';
    else stageChinese = stage;
    stageSpan.textContent = stageChinese;

    // 确认选牌按钮：只在选牌阶段显示且可用
    if (stage === 'select') {
        selectConfirmBtn.style.display = 'inline-block';
        selectConfirmBtn.disabled = false;
    } else {
        selectConfirmBtn.style.display = 'none';
    }

    // 新的一轮选牌开始，清空秀牌区
    if (stage === 'select') {
        for (let seat in showPiles) {
            showPiles[seat].innerHTML = '';
            showPiles[seat].style.border = '';
        }
        clearAllReady(); // 新增

    }

    // 秀牌阶段，清空手牌区域（手牌已用于秀牌）
    if (stage === 'show' && round === 5) {
        myHandArea.innerHTML = '';
        window.myHand = null; // 可选，清除引用
    }

    highlightRiver(round);
}

function highlightRiver(round) {
    const riverCards = riverArea.querySelectorAll('.poker-card');
    riverCards.forEach((card, index) => {
        if (index === round - 1) {
            card.classList.add('current-river');
        } else {
            card.classList.remove('current-river');
        }
    });
}

export function handlePlayerSelected(data) {
    console.log('[ui] handlePlayerSelected', data);
    const { playerId, cards } = data;
    const seat = playerSeatMap[playerId];
    if (!seat) {
        console.warn('[ui] handlePlayerSelected: seat not found for player', playerId);
        return;
    }
    const pile = showPiles[seat];
    if (!pile) {
        console.warn('[ui] handlePlayerSelected: pile not found for seat', seat);
        return;
    }
    pile.innerHTML = '';
    cards.forEach(card => {
        pile.innerHTML += renderCard(card, true, false, false, '');
    });
    pile.style.border = '3px solid green'; // 调试用
    console.log('[ui] handlePlayerSelected: rendered cards for seat', seat);
}

function animateFlyCards(indices, targetPile) {
    console.log('[ui] animateFlyCards', indices, targetPile);
    const handCards = myHandArea.querySelectorAll('.poker-card');
    indices.forEach((index, i) => {
        const cardEl = handCards[index];
        if (!cardEl) return;
        const startRect = cardEl.getBoundingClientRect();
        const targetRect = targetPile.getBoundingClientRect();
        const targetX = targetRect.left + targetRect.width / 2 - startRect.left - startRect.width / 2;
        const targetY = targetRect.top + targetRect.height / 2 - startRect.top - startRect.height / 2;
        const rot = (Math.random() * 20 - 10).toFixed(1);

        const clone = cardEl.cloneNode(true);
        clone.style.position = 'fixed';
        clone.style.left = startRect.left + 'px';
        clone.style.top = startRect.top + 'px';
        clone.style.width = startRect.width + 'px';
        clone.style.height = startRect.height + 'px';
        clone.style.zIndex = '1000';
        clone.style.transition = 'none';
        clone.classList.add('flying-card');
        document.body.appendChild(clone);

        anime({
            targets: clone,
            left: startRect.left + targetX,
            top: startRect.top + targetY,
            rotate: rot,
            duration: 500,
            easing: 'easeInOutQuad',
            complete: () => {
                clone.remove();
            }
        });
    });
}

export function handleSelectConfirm() {
    console.log('[ui] handleSelectConfirm');
    const confirmed = game.confirmSelection();
    if (confirmed) {
        selectConfirmBtn.style.display = 'none'; // 隐藏按钮
        const indices = game.getSelectedIndices();
        if (window.myHand) {
            const sorted = [...indices].sort((a, b) => b - a);
            for (let idx of sorted) {
                window.myHand.splice(idx, 1);
            }
            game.clearSelected();
            renderHand(window.myHand);
        }
        const mySeat = playerSeatMap[window.currentPlayerId];
        if (mySeat && showPiles[mySeat]) {
            animateFlyCards(indices, showPiles[mySeat]);
        }
    }
    return confirmed;
}

export function renderShowCards(combinations, players, currentPlayerId, onAllRevealed) {
    console.log('[ui] renderShowCards', combinations, players);
    currentCombinations = combinations;
    revealedState = combinations.map(combo => combo.map(() => false));

    playerIdToIdx = {};
    players.forEach((player, idx) => {
        playerIdToIdx[player.id] = idx;
    });
    console.log('[ui] playerIdToIdx', playerIdToIdx);

    for (let seat in showPiles) {
        showPiles[seat].innerHTML = '';
        showPiles[seat].style.border = '';
    }

    players.forEach((player, playerIdx) => {
        const seat = playerSeatMap[player.id];
        if (!seat) {
            console.warn('[ui] renderShowCards: seat not found for player', player.id);
            return;
        }
        const pile = showPiles[seat];
        combinations[playerIdx].forEach((card, cardIdx) => {
            const cardId = `card-${playerIdx}-${cardIdx}`;
            pile.innerHTML += renderCard(card, true, false, false, `show-card`).replace('<div', `<div id="${cardId}" data-player="${playerIdx}" data-card="${cardIdx}"`);
        });
    });

    document.querySelectorAll('.show-card').forEach(cardDiv => {
        const playerIdx = parseInt(cardDiv.dataset.player);
        const cardIdx = parseInt(cardDiv.dataset.card);
        const isSelf = players[playerIdx].id === currentPlayerId;
        if (isSelf) {
            cardDiv.addEventListener('click', () => handleCardReveal(playerIdx, cardIdx));
        } else {
            cardDiv.style.cursor = 'not-allowed';
            cardDiv.title = '这是其他玩家的牌';
        }
    });

    updateRevealStatus();
}

async function handleCardReveal(playerIdx, cardIdx) {
    console.log('[ui] handleCardReveal', playerIdx, cardIdx);
    if (revealedState[playerIdx][cardIdx]) return;
    const cardDiv = document.getElementById(`card-${playerIdx}-${cardIdx}`);
    if (!cardDiv) {
        console.warn('[ui] handleCardReveal: cardDiv not found', `card-${playerIdx}-${cardIdx}`);
        return;
    }

    cardDiv.classList.add('animating');
    const card = currentCombinations[playerIdx][cardIdx];

    anime({
        targets: cardDiv,
        rotateY: 90,
        duration: 150,
        easing: 'easeInQuad',
        complete: () => {
            const newCardHtml = renderCard(card, false, false, false, 'show-card');
            const temp = document.createElement('div');
            temp.innerHTML = newCardHtml;
            const newDiv = temp.firstChild;
            newDiv.id = cardDiv.id;
            newDiv.dataset.player = playerIdx;
            newDiv.dataset.card = cardIdx;
            cardDiv.parentNode.replaceChild(newDiv, cardDiv);

            anime({
                targets: newDiv,
                rotateY: 0,
                duration: 150,
                easing: 'easeOutQuad',
                complete: () => {
                    newDiv.classList.remove('animating');
                    newDiv.classList.add('revealed');
                    revealedState[playerIdx][cardIdx] = true;
                    updateRevealStatus();

                    const ws = getWs();
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'card_revealed',
                            cardIndex: cardIdx
                        }));
                    }
                }
            });
        }
    });
}

export function revealCard(playerId, cardIndex) {
    console.log('[ui] revealCard', playerId, cardIndex);
    const playerIdx = playerIdToIdx[playerId];
    if (playerIdx === undefined) {
        console.warn('[ui] revealCard: playerIdx not found for playerId', playerId);
        return;
    }

    const seat = playerSeatMap[playerId];
    if (!seat) {
        console.warn('[ui] revealCard: seat not found for player', playerId);
        return;
    }
    const pile = showPiles[seat];
    if (!pile) {
        console.warn('[ui] revealCard: pile not found for seat', seat);
        return;
    }

    const cardDiv = document.getElementById(`card-${playerIdx}-${cardIndex}`);
    if (!cardDiv) {
        console.warn('[ui] revealCard: cardDiv not found', `card-${playerIdx}-${cardIndex}`);
        return;
    }

    if (!cardDiv.classList.contains('back')) return;

    const card = currentCombinations[playerIdx][cardIndex];
    const newCardHtml = renderCard(card, false, false, false, 'show-card');
    const temp = document.createElement('div');
    temp.innerHTML = newCardHtml;
    const newDiv = temp.firstChild;
    newDiv.id = cardDiv.id;
    newDiv.dataset.player = playerIdx;
    newDiv.dataset.card = cardIndex;
    cardDiv.parentNode.replaceChild(newDiv, cardDiv);

    revealedState[playerIdx][cardIndex] = true;
    updateRevealStatus();
}

function updateRevealStatus() {
    const total = revealedState.reduce((a, p) => a + p.length, 0);
    const revealed = revealedState.reduce((a, p) => a + p.filter(v => v).length, 0);
    if (revealStatus) {
        revealStatus.textContent = `已翻开 ${revealed}/${total} 张牌`;
    }
}

export function updatePlayersChips(players) {
    console.log('[ui] updatePlayersChips', players);
    players.forEach(p => {
        const seat = playerSeatMap[p.id];
        if (!seat) return;
        let chipsEl;
        if (seat === 'left') chipsEl = chipsLeft;
        else if (seat === 'right') chipsEl = chipsRight;
        else if (seat === 'bottom') chipsEl = chipsBottom;
        if (chipsEl) {
            // 强制显示负数值
            chipsEl.textContent = p.chips;
            // 如果筹码为负数，添加红色样式类
            if (p.chips < 0) {
                chipsEl.classList.add('negative-chips');
            } else {
                chipsEl.classList.remove('negative-chips');
            }
        }
    });
}

export function showStageChanged(stage) {
    console.log('[ui] showStageChanged', stage);
    // 控制翻开状态文字的显示：只在秀牌阶段显示
    if (revealStatus) {
        revealStatus.style.display = (stage === 'show') ? 'block' : 'none';
    }
    // 移除已有的筹码交换按钮
    const oldControls = document.getElementById('exchange-controls');
    if (oldControls) oldControls.remove();

    if (stage === 'exchange') {
        const controlsDiv = document.querySelector('.game-controls');
        const btnContainer = document.createElement('div');
        btnContainer.id = 'exchange-controls';
        btnContainer.style.marginTop = '10px';
        btnContainer.innerHTML = `
            <button id="giveChipsBtn" style="margin-right:5px;">给予筹码</button>
            <button id="askChipsBtn" style="margin-right:5px;">索要筹码</button>
            <button id="readyBtn">准备下一轮</button>
        `;
        controlsDiv.appendChild(btnContainer);

        document.getElementById('giveChipsBtn').addEventListener('click', () => {
            if (!selectedTargetId) {
                exchange.showToast('请先点击选择一名玩家', 'error');
                return;
            }
            const targetInfo = playerInfoMap[selectedTargetId];
            if (!targetInfo) return;
            exchange.showTransferSlider('give', selectedTargetId, targetInfo.name);
        });

        document.getElementById('askChipsBtn').addEventListener('click', () => {
            if (!selectedTargetId) {
                exchange.showToast('请先点击选择一名玩家', 'error');
                return;
            }
            const targetInfo = playerInfoMap[selectedTargetId];
            if (!targetInfo) return;
            exchange.showTransferSlider('ask', selectedTargetId, targetInfo.name);
        });

        document.getElementById('readyBtn').addEventListener('click', () => {
            exchange.onReadyClick();
        });
    } else {
        document.querySelectorAll('.player-left, .player-right').forEach(el => el.classList.remove('target'));
        selectedTargetId = null;
    }
}

export function showPlayerReady(playerId) {
    // 自己不显示
    if (playerId === window.currentPlayerId) return;
    const seat = playerSeatMap[playerId];
    if (!seat) return;
    const readyEl = seat === 'left' ? readyLeft : (seat === 'right' ? readyRight : readyBottom);
    if (readyEl) {
        readyEl.textContent = '已准备';
    }
}

export function clearAllReady() {
    [readyLeft, readyRight, readyBottom].forEach(el => {
        if (el) el.textContent = '';
    });
}
