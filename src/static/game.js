// src/static/game.js - 选牌核心逻辑
import { getWs } from './websocket.js';

// 选牌状态
let selectedIndices = [];
let hasConfirmed = false;
let myHand = null;

// 重置选牌状态（新轮次时调用）
export function resetSelection() {
    console.log('[game] resetSelection');
    selectedIndices = [];
    hasConfirmed = false;
}

// 清除选中索引（确认选牌后使用，不改变确认状态）
export function clearSelected() {
    console.log('[game] clearSelected');
    selectedIndices = [];
}

// 设置当前手牌（收到 your_hand 时调用）
export function setHand(hand) {
    console.log('[game] setHand', hand);
    myHand = hand;
    resetSelection();
}

// 手牌点击处理（由 UI 模块调用）
export function handleCardClick(index) {
    console.log('[game] handleCardClick', index, '当前选中:', selectedIndices, '已确认:', hasConfirmed);
    if (hasConfirmed) {
        alert('你已经确认选牌，无法更改');
        return false;
    }
    if (selectedIndices.includes(index)) {
        // 取消选中
        selectedIndices = selectedIndices.filter(i => i !== index);
    } else {
        if (selectedIndices.length >= 2) {
            alert('最多只能选2张牌');
            return false;
        }
        selectedIndices.push(index);
    }
    console.log('[game] 新选中状态:', selectedIndices);
    return selectedIndices; // 返回新数组供 UI 更新
}

// 获取当前选中索引
export function getSelectedIndices() {
    return selectedIndices;
}

// 确认选牌
export function confirmSelection() {
    console.log('[game] confirmSelection, 当前选中:', selectedIndices);
    if (selectedIndices.length !== 2) {
        alert('请先选择2张牌');
        return false;
    }
    if (hasConfirmed) return false;
    hasConfirmed = true;
    const ws = getWs();
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'select_cards',
            indices: selectedIndices
        }));
        console.log('[game] 已发送 select_cards');
        return true;
    } else {
        alert('WebSocket 未连接');
        return false;
    }
}

// 是否已确认
export function isConfirmed() {
    return hasConfirmed;
}