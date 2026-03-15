// exchange.js - 筹码交换UI逻辑，使用Toast，支持目标玩家选择
import { getWs } from './websocket.js';

let pendingRequest = null;
let currentRound = 1;
let currentTargetPlayerId = null;

export function setCurrentRound(round) {
    currentRound = round;
}

export function setTargetPlayer(playerId) {
    currentTargetPlayerId = playerId;
}

export function clearTarget() {
    currentTargetPlayerId = null;
}

/**
 * 显示Toast消息
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 300);
    }, 3000);
}

/**
 * 显示筹码请求弹窗（目标玩家收到）
 */
export function showTransferRequest(fromPlayerId, fromPlayerName, amount, type = 'ask') {
    pendingRequest = { fromPlayerId, amount };
    
    const modal = document.getElementById('modal-overlay');
    document.getElementById('modal-title').textContent = type === 'ask' ? '筹码请求' : '筹码给予';
    document.getElementById('modal-message').textContent = type === 'ask' 
        ? `玩家 ${fromPlayerName} 向你索要 ${amount} 筹码，是否同意？`
        : `玩家 ${fromPlayerName} 要给予你 ${amount} 筹码，是否接受？`;
    
    document.querySelector('.slider-container').style.display = 'none';
    document.getElementById('modal-confirm').textContent = '同意';
    document.getElementById('modal-cancel').textContent = '拒绝';
    modal.style.display = 'flex';

    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');
    const newConfirm = confirmBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newConfirm.addEventListener('click', () => {
        const ws = getWs();
        if (ws) {
            ws.send(JSON.stringify({ type: 'transfer_response', accept: true }));
        }
        modal.style.display = 'none';
        showToast(type === 'ask' ? '已同意索要请求' : '已接受给予', 'success');
    });

    newCancel.addEventListener('click', () => {
        const ws = getWs();
        if (ws) {
            ws.send(JSON.stringify({ type: 'transfer_response', accept: false }));
        }
        modal.style.display = 'none';
        showToast('已拒绝请求', 'info');
    });
}

/**
 * 显示发起转移的滑块弹窗（发起方使用）
 */
export function showTransferSlider(type, targetPlayerId, targetPlayerName) {
    if (!targetPlayerId) {
        showToast('请先选择一名玩家', 'error');
        return;
    }
    
    pendingRequest = { targetPlayerId, type };
    const modal = document.getElementById('modal-overlay');
    const title = type === 'give' ? '给予筹码' : '索要筹码';
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = `向 ${targetPlayerName} ${type === 'give' ? '给予' : '索要'} 筹码数量：`;
    
    const sliderContainer = document.querySelector('.slider-container');
    sliderContainer.style.display = 'flex';
    
    const slider = document.getElementById('slider');
    const sliderValue = document.getElementById('slider-value');
    // 默认值为当前轮次（不再是轮次×2）
    const defaultValue = currentRound;
    slider.value = defaultValue;
    sliderValue.textContent = defaultValue;
    
    slider.oninput = () => {
        sliderValue.textContent = slider.value;
    };
    
    document.getElementById('modal-confirm').textContent = '确认';
    document.getElementById('modal-cancel').textContent = '取消';
    
    modal.style.display = 'flex';
    
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');
    const newConfirm = confirmBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    
    newConfirm.addEventListener('click', () => {
        const amount = parseInt(slider.value);
        const ws = getWs();
        if (ws) {
            ws.send(JSON.stringify({
                type: 'transfer_request',
                toPlayerId: targetPlayerId,
                amount: amount,
                requestType: type
            }));
        }
        modal.style.display = 'none';
        showToast(`已发送${type === 'give' ? '给予' : '索要'}请求`, 'info');
    });
    
    newCancel.addEventListener('click', () => {
        modal.style.display = 'none';
    });
}

export function showTransferFailed(reason) {
    showToast(`筹码转移失败: ${reason}`, 'error');
}

export function showTransferRejected() {
    showToast('对方拒绝了你的筹码请求', 'info');
}

export function showTransferSuccess() {
    showToast('筹码转移成功', 'success');
}

export function onReadyClick() {
    const ws = getWs();
    if (ws) {
        ws.send(JSON.stringify({ type: 'ready_for_next' }));
        document.getElementById('readyBtn').disabled = true;
        showToast('已准备，等待其他玩家', 'info');
    }
}