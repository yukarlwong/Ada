const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const exportBtn = document.getElementById('exportBtn');
const newChatBtn = document.getElementById('newChatBtn');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarToggleMobile = document.getElementById('sidebarToggleMobile');
const sidebar = document.getElementById('sidebar');
const conversationList = document.getElementById('conversationList');
const modelSelectorBtn = document.getElementById('modelSelectorBtn');
const modelDropdown = document.getElementById('modelDropdown');
const currentModelName = document.getElementById('currentModelName');
const modelOptions = document.querySelectorAll('.model-option');
const filesBtn = document.getElementById('filesBtn');
const filesModal = document.getElementById('filesModal');
const filesModalOverlay = document.getElementById('filesModalOverlay');
const filesModalClose = document.getElementById('filesModalClose');
const filesList = document.getElementById('filesList');
const filesCurrentPath = document.getElementById('filesCurrentPath');

// 确保所有元素都已加载
if (!sendBtn) {
    console.error('发送按钮未找到！');
}
if (!userInput) {
    console.error('输入框未找到！');
}

// API配置
const API_URL = '/api/chat';
const FS_LIST_URL = '/api/fs/list';
const FS_READ_URL = '/api/fs/read';
const FS_READ_CHUNK_URL = '/api/fs/readChunk';
const DEFAULT_CHUNK_CHARS = 7000;

// 模型配置
const modelConfig = {
    'llama-3.1-8b-instant': 'Llama 3.1 8B Instant',
    'llama-3.3-70b-versatile': 'Llama 3.3 70B Versatile'
};

// 从localStorage加载保存的模型，默认为llama-3.1-8b-instant
let currentModel = localStorage.getItem('selectedModel') || 'llama-3.1-8b-instant';

// 对话会话管理
let conversations = []; // 所有对话会话
let currentConversationId = null; // 当前对话ID

let fsCurrentRelPath = '';
const fileReadOffsetsKey = 'fileReadOffsets';

function loadFileReadOffsets() {
    try {
        return JSON.parse(localStorage.getItem(fileReadOffsetsKey) || '{}') || {};
    } catch {
        return {};
    }
}

function saveFileReadOffsets(map) {
    localStorage.setItem(fileReadOffsetsKey, JSON.stringify(map || {}));
}

function openFilesModal() {
    if (!filesModal) return;
    filesModal.classList.add('open');
    filesModal.setAttribute('aria-hidden', 'false');
    loadFsList('');
}

function closeFilesModal() {
    if (!filesModal) return;
    filesModal.classList.remove('open');
    filesModal.setAttribute('aria-hidden', 'true');
}

async function loadFsList(relPath) {
    if (!filesList || !filesCurrentPath) return;
    fsCurrentRelPath = relPath || '';
    filesCurrentPath.textContent = fsCurrentRelPath ? `路径: ${fsCurrentRelPath}` : '路径: (根目录)';
    filesList.innerHTML = '';

    const url = `${FS_LIST_URL}?path=${encodeURIComponent(fsCurrentRelPath)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
        const errItem = document.createElement('div');
        errItem.className = 'file-item';
        errItem.innerHTML = '<div class="file-item-name">无法读取目录</div><div class="file-item-type">error</div>';
        filesList.appendChild(errItem);
        return;
    }

    const data = await resp.json();
    const items = Array.isArray(data.items) ? data.items : [];

    if (fsCurrentRelPath) {
        const upItem = document.createElement('div');
        upItem.className = 'file-item';
        upItem.innerHTML = '<div class="file-item-name">..</div><div class="file-item-type">dir</div>';
        upItem.addEventListener('click', () => {
            const parts = fsCurrentRelPath.split(/[/\\]+/).filter(Boolean);
            parts.pop();
            loadFsList(parts.join('/'));
        });
        filesList.appendChild(upItem);
    }

    items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'file-item';
        el.innerHTML = `<div class="file-item-name"></div><div class="file-item-type"></div>`;
        el.querySelector('.file-item-name').textContent = item.name;
        el.querySelector('.file-item-type').textContent = item.type;

        el.addEventListener('click', async () => {
            const nextRel = fsCurrentRelPath ? `${fsCurrentRelPath}/${item.name}` : item.name;
            if (item.type === 'dir') {
                await loadFsList(nextRel);
                return;
            }
            await attachFileToConversation(nextRel);
            closeFilesModal();
        });

        filesList.appendChild(el);
    });
}

async function attachFileToConversation(relFilePath) {
    let conversation = conversations.find(c => c.id === currentConversationId);
    if (!conversation) {
        createNewConversation();
        conversation = conversations.find(c => c.id === currentConversationId);
        if (!conversation) return;
    }

    const offsets = loadFileReadOffsets();
    const offset = Number(offsets[relFilePath] || 0);
    const loadingId = addMessage(`正在读取文件: ${relFilePath}（从 ${offset} 开始）`, 'bot', true);
    try {
        // Prefer chunked reading to avoid huge payloads hitting Groq limits.
        const chunkUrl = `${FS_READ_CHUNK_URL}?path=${encodeURIComponent(relFilePath)}&offset=${encodeURIComponent(offset)}&length=${encodeURIComponent(DEFAULT_CHUNK_CHARS)}`;
        const resp = await fetch(chunkUrl);
        if (!resp.ok) {
            throw new Error('文件读取失败');
        }
        const data = await resp.json();

        const chunk = data.chunk || '';
        const done = Boolean(data.done);
        const nextOffset = Number(data.nextOffset || 0);
        const totalChars = Number(data.totalChars || 0);
        const progress = totalChars ? `（进度 ${Math.min(nextOffset, totalChars)}/${totalChars} 字符）` : '';
        const content = `【文件分段：${relFilePath}】\n【本段 offset=${data.offset}, len=${data.length}, done=${done}】${progress}\n\n${chunk}`;

        conversation.messages.push({
            role: 'user',
            content,
            timestamp: new Date().toISOString()
        });

        removeMessage(loadingId);
        addMessage(`已附加文件分段：${relFilePath}${done ? '（已读完）' : '（可继续读下一段）'}`, 'bot');

        if (done) {
            delete offsets[relFilePath];
        } else {
            offsets[relFilePath] = nextOffset;
        }
        saveFileReadOffsets(offsets);

        conversation.updatedAt = new Date().toISOString();
        saveConversations();
        renderConversationList();
    } catch (e) {
        removeMessage(loadingId);
        addMessage('读取文件失败，请检查服务端配置与文件格式。', 'bot');
    }
}

// 对话数据结构：
// {
//   id: 'uuid',
//   title: '对话标题',
//   createdAt: 'ISO时间戳',
//   updatedAt: 'ISO时间戳',
//   messages: [{role, content, timestamp}],
//   model: '使用的模型'
// }


// 初始化模型选择器
function initModelSelector() {
    updateModelDisplay();
    
    // 标记当前选中的模型
    modelOptions.forEach(option => {
        if (option.dataset.model === currentModel) {
            option.classList.add('selected');
        }
    });
}

// 更新模型显示
function updateModelDisplay() {
    currentModelName.textContent = modelConfig[currentModel] || currentModel;
}

// 切换模型
function selectModel(model) {
    currentModel = model;
    localStorage.setItem('selectedModel', model);
    updateModelDisplay();
    
    // 更新选中状态
    modelOptions.forEach(option => {
        option.classList.remove('selected');
        if (option.dataset.model === model) {
            option.classList.add('selected');
        }
    });
    
    // 关闭下拉菜单
    modelSelectorBtn.parentElement.classList.remove('active');
}

// 模型选择器事件
modelSelectorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    modelSelectorBtn.parentElement.classList.toggle('active');
});

// 点击模型选项
modelOptions.forEach(option => {
    option.addEventListener('click', () => {
        selectModel(option.dataset.model);
    });
});

// 点击外部关闭下拉菜单
document.addEventListener('click', (e) => {
    if (!modelSelectorBtn.contains(e.target) && !modelDropdown.contains(e.target)) {
        modelSelectorBtn.parentElement.classList.remove('active');
    }
});

// 自动调整输入框高度
userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// 生成唯一ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 生成对话标题（基于第一条用户消息）
function generateConversationTitle(messages) {
    const firstUserMessage = messages.find(msg => msg.role === 'user');
    if (firstUserMessage) {
        const content = firstUserMessage.content.trim();
        // 取前30个字符作为标题
        return content.length > 30 ? content.substring(0, 30) + '...' : content;
    }
    return '新对话';
}

// 创建新对话
function createNewConversation() {
    const newId = generateId();
    const newConversation = {
        id: newId,
        title: '新对话',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [
            {
                role: 'assistant',
                content: '你好！我是AI助手，有什么可以帮助你的吗？',
                timestamp: new Date().toISOString()
            }
        ],
        model: currentModel
    };
    
    conversations.unshift(newConversation); // 添加到开头
    currentConversationId = newId;
    
    saveConversations();
    renderConversationList();
    loadConversation(newId);
    
    // 关闭移动端侧边栏
    if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
    }
}

// 切换到指定对话
function switchConversation(conversationId) {
    if (currentConversationId === conversationId) return;
    
    // 保存当前对话
    saveCurrentConversation();
    
    // 切换到新对话
    currentConversationId = conversationId;
    loadConversation(conversationId);
    
    // 关闭移动端侧边栏
    if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
    }
}

// 删除对话
function deleteConversation(conversationId, e) {
    e.stopPropagation(); // 阻止触发切换对话
    
    if (!confirm('确定要删除这个对话吗？')) {
        return;
    }
    
    const index = conversations.findIndex(c => c.id === conversationId);
    if (index === -1) return;
    
    conversations.splice(index, 1);
    
    // 如果删除的是当前对话，切换到其他对话或创建新对话
    if (currentConversationId === conversationId) {
        if (conversations.length > 0) {
            currentConversationId = conversations[0].id;
            loadConversation(currentConversationId);
        } else {
            createNewConversation();
        }
    }
    
    saveConversations();
    renderConversationList();
}

// 加载对话到界面
function loadConversation(conversationId) {
    const conversation = conversations.find(c => c.id === conversationId);
    if (!conversation) {
        createNewConversation();
        return;
    }
    
    // 清空当前界面
    chatMessages.innerHTML = '';
    
    // 恢复消息到界面
    conversation.messages.forEach(msg => {
        const sender = msg.role === 'user' ? 'user' : 'bot';
        addMessage(msg.content, sender, false, false);
    });
    
    // 更新当前模型
    if (conversation.model) {
        currentModel = conversation.model;
        updateModelDisplay();
        // 更新模型选择器的选中状态
        modelOptions.forEach(option => {
            option.classList.remove('selected');
            if (option.dataset.model === currentModel) {
                option.classList.add('selected');
            }
        });
    }
    
    // 滚动到底部
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    renderConversationList();
}

// 保存当前对话
function saveCurrentConversation() {
    if (!currentConversationId) return;
    
    const conversation = conversations.find(c => c.id === currentConversationId);
    if (conversation) {
        conversation.updatedAt = new Date().toISOString();
        conversation.model = currentModel;
        
        // 更新标题（如果还没有用户消息）
        if (conversation.title === '新对话') {
            const firstUserMessage = conversation.messages.find(msg => msg.role === 'user');
            if (firstUserMessage) {
                conversation.title = generateConversationTitle(conversation.messages);
            }
        }
    }
}

// 保存所有对话到localStorage
function saveConversations() {
    saveCurrentConversation();
    localStorage.setItem('conversations', JSON.stringify(conversations));
    localStorage.setItem('currentConversationId', currentConversationId);
}

// 从localStorage加载对话
function loadConversations() {
    const saved = localStorage.getItem('conversations');
    if (saved) {
        try {
            conversations = JSON.parse(saved);
            currentConversationId = localStorage.getItem('currentConversationId');
            
            // 验证当前对话是否存在
            if (currentConversationId && !conversations.find(c => c.id === currentConversationId)) {
                currentConversationId = conversations.length > 0 ? conversations[0].id : null;
            }
        } catch (e) {
            console.error('加载对话失败:', e);
            conversations = [];
            currentConversationId = null;
        }
    }
    
    // 如果没有对话，创建第一个
    if (conversations.length === 0) {
        createNewConversation();
    } else {
        // 加载当前对话或第一个对话
        const conversationId = currentConversationId || conversations[0].id;
        loadConversation(conversationId);
    }
    
    renderConversationList();
}

// 渲染对话列表
function renderConversationList() {
    if (!conversationList) return;
    
    conversationList.innerHTML = '';
    
    conversations.forEach(conversation => {
        const item = document.createElement('div');
        item.className = `conversation-item ${conversation.id === currentConversationId ? 'active' : ''}`;
        item.onclick = () => switchConversation(conversation.id);
        
        const content = document.createElement('div');
        content.className = 'conversation-item-content';
        
        const title = document.createElement('div');
        title.className = 'conversation-item-title';
        title.textContent = conversation.title;
        
        const time = document.createElement('div');
        time.className = 'conversation-item-time';
        const date = new Date(conversation.updatedAt);
        time.textContent = date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        content.appendChild(title);
        content.appendChild(time);
        
        const actions = document.createElement('div');
        actions.className = 'conversation-item-actions';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'conversation-item-delete';
        deleteBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        deleteBtn.onclick = (e) => deleteConversation(conversation.id, e);
        
        actions.appendChild(deleteBtn);
        
        item.appendChild(content);
        item.appendChild(actions);
        conversationList.appendChild(item);
    });
}

// 侧边栏切换
if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });
}

if (sidebarToggleMobile) {
    sidebarToggleMobile.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });
}

// 点击外部关闭侧边栏（移动端）
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && 
        sidebar.classList.contains('open') && 
        !sidebar.contains(e.target) && 
        !sidebarToggleMobile.contains(e.target)) {
        sidebar.classList.remove('open');
    }
});

// 发送消息
async function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;

    // 获取当前对话
    let conversation = conversations.find(c => c.id === currentConversationId);
    if (!conversation) {
        createNewConversation();
        // 等待新对话创建完成
        conversation = conversations.find(c => c.id === currentConversationId);
        if (!conversation) {
            console.error('无法创建新对话');
            return;
        }
    }
    
    // 添加用户消息到当前对话（包含时间戳）
    conversation.messages.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
    });
    
    // 更新对话标题（如果是第一条用户消息）
    if (conversation.title === '新对话') {
        conversation.title = generateConversationTitle(conversation.messages);
        renderConversationList();
    }
    
    // 添加用户消息到界面
    addMessage(message, 'user');
    userInput.value = '';
    userInput.style.height = 'auto';
    
    // 禁用发送按钮
    sendBtn.disabled = true;
    
    // 显示加载状态
    const loadingId = addMessage('正在思考', 'bot', true);
    
    try {
        // 发送请求到后端API，包含完整对话历史和模型参数
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                messages: conversation.messages, // 发送当前对话的完整历史
                model: currentModel
            })
        });

        if (!response.ok) {
            throw new Error('网络请求失败');
        }

        const data = await response.json();
        const reply = data.reply || '抱歉，我无法理解你的问题。';
        
        // 添加AI回复到当前对话（包含时间戳）
        conversation.messages.push({
            role: 'assistant',
            content: reply,
            timestamp: new Date().toISOString()
        });
        
        // 更新对话时间
        conversation.updatedAt = new Date().toISOString();
        
        // 移除加载消息，添加AI回复
        removeMessage(loadingId);
        addMessage(reply, 'bot');
        
        // 保存对话
        saveConversations();
        renderConversationList();
    } catch (error) {
        console.error('Error:', error);
        removeMessage(loadingId);
        const errorMsg = '抱歉，发生了错误。请检查后端服务是否正常运行。';
        addMessage(errorMsg, 'bot');
        // 错误消息不添加到历史，避免污染对话
    } finally {
        sendBtn.disabled = false;
        userInput.focus();
    }
}

// 添加消息到聊天界面
function addMessage(text, sender, isLoading = false, addToHistory = true) {
    const messageDiv = document.createElement('div');
    const messageId = 'msg-' + Date.now() + '-' + Math.random();
    messageDiv.id = messageId;
    messageDiv.className = `message ${sender}-message`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    if (isLoading) {
        contentDiv.classList.add('loading');
    }
    contentDiv.textContent = text;
    
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // 滚动到底部
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return messageId;
}

// 移除消息
function removeMessage(messageId) {
    const message = document.getElementById(messageId);
    if (message) {
        message.remove();
    }
}


// 导出对话记录为文本文件
function exportConversation() {
    const conversation = conversations.find(c => c.id === currentConversationId);
    if (!conversation) {
        alert('没有可导出的对话记录。');
        return;
    }
    
    // 过滤掉系统消息和欢迎消息，只保留实际对话
    const actualMessages = conversation.messages.filter(msg => 
        msg.role !== 'system' && 
        !(msg.role === 'assistant' && msg.content.includes('你好！我是AI助手'))
    );
    
    if (actualMessages.length === 0) {
        alert('没有可导出的对话记录。请先进行一些对话。');
        return;
    }
    
    // 格式化对话历史为文本
    let text = '═'.repeat(70) + '\n';
    text += ' '.repeat(25) + 'AI 聊天对话记录\n';
    text += '═'.repeat(70) + '\n\n';
    text += `对话标题: ${conversation.title}\n`;
    text += `导出时间: ${new Date().toLocaleString('zh-CN', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    })}\n`;
    text += `使用模型: ${modelConfig[conversation.model] || conversation.model || currentModel}\n`;
    text += `对话条数: ${actualMessages.length} 条\n`;
    text += '\n' + '─'.repeat(70) + '\n\n';
    
    // 遍历对话历史，格式化每条消息
    let messageCount = 0;
    actualMessages.forEach((msg) => {
        if (msg.role === 'system') {
            return; // 跳过系统消息
        }
        
        messageCount++;
        const role = msg.role === 'user' ? '👤 用户' : '🤖 AI助手';
        
        // 格式化时间戳
        let timeStr = '';
        if (msg.timestamp) {
            try {
                const date = new Date(msg.timestamp);
                timeStr = date.toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
            } catch (e) {
                timeStr = '时间未知';
            }
        } else {
            timeStr = '时间未知';
        }
        
        text += `[${role}] - ${timeStr}\n`;
        text += '─'.repeat(70) + '\n';
        text += msg.content + '\n';
        text += '\n' + '─'.repeat(70) + '\n\n';
    });
    
    text += '\n' + '═'.repeat(70) + '\n';
    text += ' '.repeat(30) + '对话记录结束\n';
    text += '═'.repeat(70) + '\n';
    text += `\n本文件由 AI 聊天助手自动生成\n`;
    text += `生成时间: ${new Date().toLocaleString('zh-CN')}\n`;
    
    // 创建Blob对象
    const blob = new Blob(['\ufeff' + text], { type: 'text/plain;charset=utf-8' }); // 添加BOM以支持中文
    
    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // 生成文件名（包含时间戳）
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    link.download = `AI对话记录_${timestamp}.txt`;
    
    // 触发下载
    document.body.appendChild(link);
    link.click();
    
    // 清理
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    // 显示成功提示
    const originalText = exportBtn.querySelector('span').textContent;
    exportBtn.querySelector('span').textContent = '已导出！';
    exportBtn.style.opacity = '0.7';
    
    setTimeout(() => {
        exportBtn.querySelector('span').textContent = originalText;
        exportBtn.style.opacity = '1';
    }, 2000);
}

// 事件监听
if (sendBtn) {
    sendBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('发送按钮被点击');
        sendMessage();
    });
    // 确保按钮初始状态是启用的
    sendBtn.disabled = false;
    sendBtn.style.pointerEvents = 'auto';
    sendBtn.style.cursor = 'pointer';
} else {
    console.error('无法绑定发送按钮事件：按钮不存在');
}

if (newChatBtn) {
    newChatBtn.addEventListener('click', createNewConversation);
}

if (exportBtn) {
    exportBtn.addEventListener('click', exportConversation);
}

if (filesBtn) {
    filesBtn.addEventListener('click', openFilesModal);
}
if (filesModalOverlay) {
    filesModalOverlay.addEventListener('click', closeFilesModal);
}
if (filesModalClose) {
    filesModalClose.addEventListener('click', closeFilesModal);
}

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    loadConversations();
    initModelSelector();
    
    // 确保发送按钮是启用的
    if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.pointerEvents = 'auto';
        sendBtn.style.cursor = 'pointer';
        console.log('发送按钮已初始化，状态：', sendBtn.disabled ? '禁用' : '启用');
    }
    
    if (userInput) {
        userInput.focus();
    }
});

// 如果DOM已经加载完成，立即执行
if (document.readyState === 'loading') {
    // DOM还在加载中，等待DOMContentLoaded事件
} else {
    // DOM已经加载完成，立即执行
    loadConversations();
    initModelSelector();
    
    if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.pointerEvents = 'auto';
        sendBtn.style.cursor = 'pointer';
    }
    
    if (userInput) {
        userInput.focus();
    }
}


