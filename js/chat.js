// Initialize Socket.io connection
const socket = io();
console.log('[CHAT.JS] Socket.io initialisé');

let currentConversationId = null;
let isConnected = false;

document.addEventListener('DOMContentLoaded', async function() {
    console.log('[CHAT.JS] DOM Content Loaded');

    // is logged?
    const token = sessionStorage.getItem('authToken');
    const isGuest = !token;

    const urlParams = new URLSearchParams(window.location.search);
    currentConversationId = urlParams.get('conversationId') || localStorage.getItem('currentConversationId');

    // Vérification session invité
    if (isGuest) {
        const guestConvId = sessionStorage.getItem('guestConversationId');

        // redirection begin si pas de session
        if (!guestConvId) {
            console.log('[CHAT.JS] Guest sans session, redirection /begin');
            window.location.href = '/begin';
            return;
        }

        if (currentConversationId !== guestConvId) {
            console.log('[CHAT.JS] ID mismatch, redirection /begin');
            clearGuestSession();
            window.location.href = '/begin';
            return;
        }
    }

    if (!currentConversationId) {
        const newConvString = localStorage.getItem('newConversation');
        if (newConvString) {
            const newConv = JSON.parse(newConvString);
            currentConversationId = newConv.id;
            localStorage.setItem('currentConversationId', currentConversationId);
        }
    }

    console.log('[CHAT.JS] Conversation ID:', currentConversationId);
    console.log('[CHAT.JS] Mode:', isGuest ? 'INVITÉ' : 'AUTHENTIFIÉ');

    if (currentConversationId) {
        await loadConversationMessages(currentConversationId);
        socket.emit('join-conversation', currentConversationId);
    } else {
        console.warn('[CHAT.JS] Pas de conversation ID trouvé!');
        window.location.href = '/begin';
    }

    setupEventListeners();
});

socket.on('connect', () => {
    console.log('Connected to server');
    isConnected = true;
    if (currentConversationId) {
        socket.emit('join-conversation', currentConversationId);
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    isConnected = false;
});

socket.on('receive-message', (data) => {
    hideTypingIndicator();
    displayMessage(data.sender, data.content);
});

socket.on('error', (error) => {
    console.error('Socket error:', error);
    hideTypingIndicator();
    showError('Une erreur est survenue lors de l\'envoi du message', 3000);
});

socket.on('reconnect', (attemptNumber) => {
    console.log('Reconnected after', attemptNumber, 'attempts');
    if (currentConversationId) {
        socket.emit('join-conversation', currentConversationId);
    }
});

// Chargement des conversations
async function loadConversationMessages(conversationId) {
    try {
        const response = await fetch(`/conversations/${conversationId}/messages`);
        if (!response.ok) throw new Error('Eche de chargement des messages');

        const messages = await response.json();

        // Clear existing static messages ( plus besoin ? à vérifier )
        const chatContainer = document.getElementById('chat-container');
        chatContainer.innerHTML = '';

        // Display des messages
        messages.forEach(message => {
            displayMessage(message.sender, message.content, false);
        });

        chatContainer.scrollTop = chatContainer.scrollHeight;

        // déclance une réponse de l'ia au début de la conversation
        if (messages.length === 1 && messages[0].sender === 'user') {
            console.log('[CHAT.JS] Premier message détecté, envoi automatique à l\'IA...');
            const token = sessionStorage.getItem('authToken');
            const email = sessionStorage.getItem('userEmail');
            const isGuest = !token;

            socket.emit('send-message', {
                conversationId: conversationId,
                userId: isGuest ? null : email,
                message: messages[0].content,
                isGuest: isGuest
            });

            // Afficher l'animation de chargement
            showTypingIndicator();
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

function displayMessage(sender, content, shouldScroll = true) {
    const chatContainer = document.getElementById('chat-container');

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${sender}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;

    bubble.appendChild(contentDiv);
    chatContainer.appendChild(bubble);

    if (shouldScroll) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// Event listeners pour envoie de messages
function setupEventListeners() {
    const sendBtn = document.getElementById('send-btn');
    const chatInput = document.getElementById('chat-input');

    console.log('[CHAT.JS] setupEventListeners - sendBtn:', sendBtn);
    console.log('[CHAT.JS] setupEventListeners - chatInput:', chatInput);

    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
        console.log('[CHAT.JS] Event listener ajouté au bouton');
    } else {
        console.error('[CHAT.JS] Bouton send-btn non trouvé!');
    }

    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        console.log('[CHAT.JS] Event listener ajouté à l\'input');
    } else {
        console.error('[CHAT.JS] Input chat-input non trouvé!');
    }
}

// Send message via Socket.io
function sendMessage() {
    console.log('[CHAT.JS] sendMessage appelée');
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();

    console.log('[CHAT.JS] Message:', message);
    console.log('[CHAT.JS] Conversation ID:', currentConversationId);

    if (!message || !currentConversationId) {
        console.warn('[CHAT.JS] Message vide ou pas de conversation ID');
        return;
    }

    if (!isConnected) {
        showError('Non connecté au serveur. Veuillez rafraîchir la page.', 3000);
        return;
    }

    // connecté ou non
    const token = sessionStorage.getItem('authToken');
    const email = sessionStorage.getItem('userEmail');
    const isGuest = !token;

    // Authentifiés : vérifier token valide
    if (!isGuest && (!token || !email)) {
        showError('Session expirée, veuillez vous reconnecter', 3000);
        setTimeout(() => {
            window.location.href = '/begin';
        }, 2000);
        return;
    }

    // Emit message au server
    socket.emit('send-message', {
        conversationId: currentConversationId,
        userId: isGuest ? null : email,
        message: message,
        isGuest: isGuest
    });
    chatInput.value = '';

    // Afficher l'animation de chargement
    showTypingIndicator();
}

function showTypingIndicator() {
    hideTypingIndicator(); 

    const chatContainer = document.getElementById('chat-container');
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.id = 'typing-indicator';
    indicator.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';

    chatContainer.appendChild(indicator);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.remove();
    }
}
