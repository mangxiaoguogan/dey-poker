// src/game.js - 后端游戏核心逻辑

export const SUITS = ['spade', 'heart', 'club', 'diamond'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/**
 * 生成一副54张牌（含大小王）
 */
export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  deck.push({ suit: 'joker', rank: 'big' });
  deck.push({ suit: 'joker', rank: 'small' });
  return deck;
}

/**
 * Fisher-Yates 洗牌
 */
export function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * 发牌：每人5张手牌，河牌4张
 */
export function deal(deck) {
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

/**
 * 初始化游戏状态
 */
export function initGame() {
  const deck = shuffle(createDeck());
  const { hands, river } = deal(deck);
  const riverWithState = river.map((card, index) => ({
    ...card,
    faceUp: index < 3, // 前三张明牌，第四张暗牌
  }));
  return {
    deck,                // 剩余牌堆
    hands,               // 三个玩家的手牌
    river: riverWithState,
    currentRound: 1,
    stage: 'select',
    selectedCards: [[], [], []],
    readyCount: 0,
  };
}