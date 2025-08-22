document.addEventListener('DOMContentLoaded', () => {
    // --- REFERENCIAS AL DOM ---
    const promptInput = document.getElementById('prompt-input');
    const sendButton = document.getElementById('send-button');
    const chatBox = document.getElementById('chat-box');
    const loading = document.getElementById('loading');
    const newChatBtn = document.getElementById('new-chat-btn');
    const historyList = document.getElementById('history-list');
    const themeSwitch = document.getElementById('theme-switch');

    // --- VARIABLES DE ESTADO ---
    let allChats = [];
    let activeChatId = null;
    let textQueue = [];
    let isStreaming = false;
    let intervalId = null;
    const STREAM_SPEED_MS = 20;

    // --- MODO OSCURO ---
    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
            themeSwitch.checked = true;
        } else {
            document.body.classList.remove('dark-mode');
            themeSwitch.checked = false;
        }
    };

    themeSwitch.addEventListener('change', () => {
        const newTheme = themeSwitch.checked ? 'dark' : 'light';
        localStorage.setItem('gemini-theme', newTheme);
        applyTheme(newTheme);
    });
    
    // --- FUNCIONES DE GESTIÓN DE DATOS ---
    const saveChats = () => localStorage.setItem('gemini-chat-history', JSON.stringify(allChats));
    const loadChats = () => {
        const savedChats = localStorage.getItem('gemini-chat-history');
        allChats = savedChats ? JSON.parse(savedChats) : [];
    };
    const deleteChat = (chatIdToDelete) => {
        allChats = allChats.filter(chat => chat.id !== chatIdToDelete);
        if (activeChatId === chatIdToDelete) {
            activeChatId = null;
            chatBox.innerHTML = '';
        }
        saveChats();
        renderHistory();
    };

    // --- FUNCIONES DE RENDERIZADO ---
    const renderHistory = () => {
        historyList.innerHTML = '';
        allChats.forEach(chat => {
            const li = document.createElement('li');
            const titleSpan = document.createElement('span');
            titleSpan.textContent = chat.title;
            titleSpan.classList.add('chat-title');
            const deleteBtn = document.createElement('span');
            deleteBtn.textContent = '🗑️';
            deleteBtn.classList.add('delete-chat-btn');
            deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteChat(chat.id); });
            li.appendChild(titleSpan);
            li.appendChild(deleteBtn);
            li.dataset.id = chat.id;
            if (chat.id === activeChatId) li.classList.add('active-chat');
            li.addEventListener('click', () => loadChat(chat.id));
            historyList.appendChild(li);
        });
    };

    const addMessage = (text, sender) => {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', sender);
        messageElement.textContent = text;
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    };
    
    const loadChat = (chatId) => {
        if (intervalId) clearInterval(intervalId);
        textQueue = [];
        isStreaming = false;
        activeChatId = chatId;
        const chat = allChats.find(c => c.id === chatId);
        chatBox.innerHTML = '';
        if (chat) {
            chat.messages.forEach(msg => {
                if (msg.sender === 'user') {
                    addMessage(msg.text, 'user');
                } else {
                    const messageElement = document.createElement('div');
                    messageElement.classList.add('message', 'gemini');
                    const geminiContent = document.createElement('div');
                    geminiContent.innerHTML = marked.parse(msg.text);
                    const copyBtn = document.createElement('button');
                    copyBtn.textContent = '📋';
                    copyBtn.classList.add('copy-btn');
                    copyBtn.title = 'Copiar al portapapeles';
                    copyBtn.addEventListener('click', () => {
                        navigator.clipboard.writeText(msg.text).then(() => {
                            copyBtn.textContent = '✅';
                            setTimeout(() => { copyBtn.textContent = '📋'; }, 2000);
                        });
                    });
                    messageElement.appendChild(geminiContent);
                    messageElement.appendChild(copyBtn);
                    chatBox.appendChild(messageElement);
                }
            });
        }
        chatBox.scrollTop = chatBox.scrollHeight;
        renderHistory();
        promptInput.focus();
    };

    const startTextStreamRenderer = (geminiContentElement) => {
        isStreaming = true;
        intervalId = setInterval(() => {
            if (textQueue.length > 0) {
                geminiContentElement.innerHTML += textQueue.shift();
                chatBox.scrollTop = chatBox.scrollHeight;
            } else if (!isStreaming) {
                clearInterval(intervalId);
                intervalId = null;
                geminiContentElement.innerHTML = marked.parse(geminiContentElement.innerText);
            }
        }, STREAM_SPEED_MS);
    };
    
    const sendMessage = async () => {
        const prompt = promptInput.value.trim();
        if (!prompt) return;
        addMessage(prompt, 'user');
        let currentChat;
        if (activeChatId === null) {
            const newChatId = Date.now();
            currentChat = { id: newChatId, title: prompt.substring(0, 30) + (prompt.length > 30 ? '...' : ''), messages: [] };
            allChats.unshift(currentChat);
            activeChatId = newChatId;
        } else {
            currentChat = allChats.find(c => c.id === activeChatId);
        }
        currentChat.messages.push({ sender: 'user', text: prompt });
        promptInput.value = '';
        loading.style.display = 'block';
        sendButton.disabled = false;

        const geminiMessageElement = document.createElement('div');
        geminiMessageElement.classList.add('message', 'gemini');
        const geminiContent = document.createElement('div');
        geminiMessageElement.appendChild(geminiContent);
        chatBox.appendChild(geminiMessageElement);
        let fullResponse = "";
        startTextStreamRenderer(geminiContent);

        try {
            const response = await fetch('/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: prompt })
            });
            if (!response.ok) throw new Error('La respuesta del servidor no fue OK');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) { isStreaming = false; break; }
                const chunk = decoder.decode(value);
                fullResponse += chunk;
                textQueue.push(...chunk.split(''));
            }
            const copyBtn = document.createElement('button');
            copyBtn.textContent = '📋';
            copyBtn.classList.add('copy-btn');
            copyBtn.title = 'Copiar al portapapeles';
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(fullResponse).then(() => {
                    copyBtn.textContent = '✅';
                    setTimeout(() => { copyBtn.textContent = '📋'; }, 2000);
                });
            });
            geminiMessageElement.appendChild(copyBtn);
        } catch (error) {
            console.error('Error:', error);
            geminiContent.innerHTML = "<p style='color: red;'>Lo siento, ocurrió un error.</p>";
            isStreaming = false;
        } finally {
            loading.style.display = 'none';
            sendButton.disabled = false;
            if (fullResponse) { currentChat.messages.push({ sender: 'gemini', text: fullResponse }); }
            saveChats();
            renderHistory();
            promptInput.focus();
        }
    };

    // --- EVENT LISTENERS ---
    sendButton.addEventListener('click', sendMessage);
    promptInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    newChatBtn.addEventListener('click', () => {
        if (intervalId) clearInterval(intervalId);
        activeChatId = null;
        chatBox.innerHTML = '';
        renderHistory();
        promptInput.focus();
    });
    promptInput.addEventListener('input', () => {
        promptInput.style.height = 'auto';
        promptInput.style.height = `${promptInput.scrollHeight}px`;
    });

    // --- INICIALIZACIÓN ---
    loadChats();
    const savedTheme = localStorage.getItem('gemini-theme') || 'light';
    applyTheme(savedTheme);
    renderHistory();
    promptInput.focus();
});