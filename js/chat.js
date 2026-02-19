// Initialize Socket.io connection
const socket = io();
console.log('[CHAT.JS] Socket.io initialisé');

let currentConversationId = null;
let isConnected = false;
let isWaitingForResponse = false;
let allSources = [];
let skipNextUserMessage = false;

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
    // Remplacer les messages d'erreur techniques

    let content = data.content;
    if (content && (content.includes('[ERREUR RÉSEAU]') || content.includes('Connection aborted') || content.includes('ConnectionResetError'))) {
        content = "Désolé, le service IA est temporairement indisponible. Veuillez réessayer dans quelques instants.";
    }

    // Éviter le doublon du premier message
    if (data.sender === 'user' && skipNextUserMessage) {
        skipNextUserMessage = false;
        showTypingIndicator();
        return;
    }

    // Passer les sources si disponibles
    displayMessage(data.sender, content, true, data.sources || []);

    // Afficher l'indicateur après le message utilisateur, le cacher après la réponse IA
    if (data.sender === 'user') {
        showTypingIndicator();
    } else {
        hideTypingIndicator();
        // Réactiver les contrôles après réception de la réponse du bot
        enableSendControls();
    }
});

socket.on('error', (error) => {
    console.error('Socket error:', error);
    hideTypingIndicator();
    // Réactiver les contrôles en cas d'erreur
    enableSendControls();
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

        // Clear existing messages et sources
        const chatContainer = document.getElementById('chat-container');
        chatContainer.innerHTML = '';
        allSources = [];
        const sourcesContainer = document.getElementById('sources-container');
        if (sourcesContainer) {
            sourcesContainer.innerHTML = '<p class="sources-empty">Les sources citées apparaîtront ici.</p>';
        }

        // Display des messages avec leurs sources
        messages.forEach(message => {
            const sources = message.sources || [];
            displayMessage(message.sender, message.content, false, sources);
        });

        chatContainer.scrollTop = chatContainer.scrollHeight;

        // Mettre à jour le bouton sources après chargement
        updateSourcesButton();

        // déclance une réponse de l'ia au début de la conversation
        if (messages.length === 1 && messages[0].sender === 'user') {
            console.log('[CHAT.JS] Premier message détecté, envoi automatique à l\'IA...');
            const token = sessionStorage.getItem('authToken');
            const email = sessionStorage.getItem('userEmail');
            const isGuest = !token;

            // Désactiver les contrôles pendant l'attente de la première réponse
            disableSendControls();

            skipNextUserMessage = true;

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

function displayMessage(sender, content, shouldScroll = true, serverSources = []) {
    const chatContainer = document.getElementById('chat-container');

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${sender}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // Pour les messages du bot, parser les sources
    if (sender === 'bot' || sender === 'assistant' || sender === 'ai') {
        const { html } = parseSourcesFromContent(content);
        contentDiv.innerHTML = html;

        // Utiliser les sources du serveur si disponibles
        if (serverSources && serverSources.length > 0) {
            serverSources.forEach(source => addSourceToSidebar(source));
            updateSourcesButton();
        }
    } else {
        contentDiv.textContent = content;
    }

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

// Désactiver les contrôles d'envoi
function disableSendControls() {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    if (chatInput) {
        chatInput.disabled = true;
        chatInput.placeholder = 'En attente de la réponse...';
    }
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.classList.add('disabled');
    }
    isWaitingForResponse = true;
}

// Réactiver les contrôles d'envoi
function enableSendControls() {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    if (chatInput) {
        chatInput.disabled = false;
        chatInput.placeholder = 'Écrivez votre message...';
    }
    if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.classList.remove('disabled');
    }
    isWaitingForResponse = false;
}

// Send message via Socket.io
function sendMessage() {
    console.log('[CHAT.JS] sendMessage appelée');

    // Bloquer si on attend déjà une réponse
    if (isWaitingForResponse) {
        console.log('[CHAT.JS] En attente de réponse, envoi bloqué');
        return;
    }

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

    // Désactiver les contrôles pendant l'attente
    disableSendControls();

    // Emit message au server
    socket.emit('send-message', {
        conversationId: currentConversationId,
        userId: isGuest ? null : email,
        message: message,
        isGuest: isGuest
    });
    chatInput.value = '';
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

// Gestion des sources

// Parser les sources du contenu du message
function parseSourcesFromContent(content) {
    const sources = [];
    const sourceNumbers = new Set();

    // Extraction des numéros de sources depuis tous les formats
    const parseNums = str => str.split(/[\s,]+|et/i).map(n => n.trim()).filter(n => /^\d+$/.test(n));

    const sourcePatterns = [
        /\[Sources?\s*([\d\s,et]+)\]/gi,
        /\(Sources?\s*([\d\s,et]+)\)/gi,
        /\bSources?\s+(\d+(?:\s*(?:,\s*|et\s+)\d+)*)/gi
    ];

    let match;
    for (const regex of sourcePatterns) {
        while ((match = regex.exec(content)) !== null) {
            parseNums(match[1]).forEach(num => sourceNumbers.add(num));
        }
    }
    const bareRefRegex = /\[(\d+)\]/g;
    while ((match = bareRefRegex.exec(content)) !== null) {
        sourceNumbers.add(match[1]);
    }

    sourceNumbers.forEach(num => {
        sources.push({
            id: `source-${Date.now()}-${num}`,
            number: num,
            title: `Source ${num}`,
            excerpt: `Document référencé dans la réponse`
        });
    });

    // Nettoyage des blocs de sources en fin de réponse
    content = content.replace(/^[ \t]*[-*]?\s*\*{0,2}\[?(?:Sources?\s*)?\d+\]?\*{0,2}\s*:.*$/gm, '');
    content = content.replace(/^[ \t]*\*{0,2}Sources?\s*:?\s*\*{0,2}$/gim, '');
    content = content.replace(/^.*(?:consulter|voir|référer|retrouver)\s+(?:les\s+)?sources?\s+(?:fournies?|ci-dessus|ci-dessous|mentionnées?|suivantes?).*$/gim, '');
    let processedContent = content.replace(/\n{3,}/g, '\n\n').trim();

    // Remplacement des refs par des placeholders avant le parsing markdown
    const sourcePlaceholders = [];
    const toPlaceholder = (match, numsStr) => {
        const placeholder = `%%SOURCE_${sourcePlaceholders.length}%%`;
        sourcePlaceholders.push(numsStr);
        return placeholder;
    };

    for (const regex of [
        /\[Sources?\s*([\d\s,et]+)\]/gi,
        /\(Sources?\s*([\d\s,et]+)\)/gi,
        /\bSources?\s+(\d+(?:\s*(?:,\s*|et\s+)\d+)*)/gi,
        /\[(\d+)\]/g
    ]) {
        processedContent = processedContent.replace(regex, toPlaceholder);
    }

    // Markdown + restauration en spans cliquables
    let html = marked.parse(processedContent, { breaks: true });

    sourcePlaceholders.forEach((numsStr, i) => {
        const nums = parseNums(numsStr);
        const sourceHtml = nums.map(num =>
            `<span class="source-ref" data-source="${num}" onclick="highlightSource(${num})">[${num}]</span>`
        ).join(' ');
        html = html.replace(`%%SOURCE_${i}%%`, sourceHtml);
    });

    return { html, sources };
}

// Ajouter une source à la sidebar
function addSourceToSidebar(source) {
    // Vérifier si la source existe déjà (par id)
    const sourceId = source.id || source.number;
    const existingSource = allSources.find(s => (s.id || s.number) === sourceId);
    if (existingSource) return;

    allSources.push(source);

    const sourcesContainer = document.getElementById('sources-container');

    // Supprimer le message "vide" si présent
    const emptyMsg = sourcesContainer.querySelector('.sources-empty');
    if (emptyMsg) emptyMsg.remove();

    // Extraire les infos de la source
    const title = source.title || `Source ${sourceId}`;
    const excerpt = source.excerpt || 'Document référencé dans la réponse';
    const url = source.url || '';

    // Créer la carte source
    const card = document.createElement('div');
    card.className = 'source-card';
    card.id = `source-card-${sourceId}`;
    card.innerHTML = `
        <div class="source-card-header">
            <span class="source-badge">Source ${sourceId}</span>
            <p class="source-title">${escapeHtml(title)}</p>
        </div>
        <p class="source-excerpt">${escapeHtml(excerpt)}</p>
        <div class="source-meta">
            ${url ? `<a href="${escapeHtml(url)}" target="_blank" class="source-link"><i class="ri-external-link-line"></i> Ouvrir le document</a>` : '<i class="ri-file-text-line"></i> <span>Document universitaire</span>'}
        </div>
    `;

    card.addEventListener('click', () => highlightSource(sourceId));
    sourcesContainer.appendChild(card);
}

// Mettre à jour le bouton des sources
function updateSourcesButton() {
    const btn = document.getElementById('open-sources-btn');
    const countEl = document.getElementById('sources-count');

    if (allSources.length > 0) {
        btn.classList.add('visible');
        countEl.textContent = allSources.length;
    } else {
        btn.classList.remove('visible');
    }
}

// Mettre en évidence une source
function highlightSource(sourceNumber) {
    // Ouvrir la sidebar
    openSourcesSidebar();

    // Scroll vers la source et la mettre en évidence
    const card = document.getElementById(`source-card-${sourceNumber}`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.borderColor = '#7A73D1';
        card.style.boxShadow = '0 4px 16px rgba(122, 115, 209, 0.3)';

        setTimeout(() => {
            card.style.borderColor = '';
            card.style.boxShadow = '';
        }, 2000);
    }
}

// Ouvrir la sidebar des sources
function openSourcesSidebar() {
    const sidebar = document.getElementById('sources-sidebar');
    sidebar.classList.add('open');
}

// Fermer la sidebar des sources
function closeSourcesSidebar() {
    const sidebar = document.getElementById('sources-sidebar');
    sidebar.classList.remove('open');
}

// Initialiser les event listeners pour les sources
function initSourcesListeners() {
    const openBtn = document.getElementById('open-sources-btn');
    const closeBtn = document.getElementById('close-sources-btn');

    if (openBtn) {
        openBtn.addEventListener('click', openSourcesSidebar);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSourcesSidebar);
    }
}

// Appeler l'initialisation au chargement
document.addEventListener('DOMContentLoaded', initSourcesListeners);
