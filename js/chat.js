// Initialize Socket.io connection
const socket = io();
console.log('[CHAT.JS] Socket.io initialisé');

let currentConversationId = null;
let isConnected = false;
let isWaitingForResponse = false;
let messageSourcesMap = new Map(); 
let botMessageCount = 0;           // compteur pour indexer chaque message bot
let activeMessageIndex = null;     // index du message dont les sources sont affichées
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
    displayMessage(data.sender, content, true, data.sources || [], data.id || null, null, data.created_at);

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
        messageSourcesMap = new Map();
        botMessageCount = 0;
        activeMessageIndex = null;
        const sourcesContainer = document.getElementById('sources-container');
        if (sourcesContainer) {
            sourcesContainer.innerHTML = '<p class="sources-empty">Les sources citées apparaîtront ici.</p>';
        }

        // Display des messages avec leurs sources
        messages.forEach(message => {
            const sources = message.sources || [];
            displayMessage(message.sender, message.content, false, sources, message.id, message.note, message.created_at);
        });

        chatContainer.scrollTop = chatContainer.scrollHeight;

        // Afficher toutes les sources groupées par message
        showAllSources();

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

function displayMessage(sender, content, shouldScroll = true, serverSources = [], messageId = null, note = null, createdAt = null) {
    const chatContainer = document.getElementById('chat-container');

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${sender}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // Pour les messages du bot, parser les sources
    if (sender === 'bot' || sender === 'assistant' || sender === 'ai') {
        const msgIdx = botMessageCount++;
        bubble.dataset.messageIndex = msgIdx;

        const { html, referencedNumbers } = parseSourcesFromContent(content, msgIdx);
        contentDiv.innerHTML = html;

        const filteredSources = filterSourcesForMessage(serverSources, referencedNumbers);
        messageSourcesMap.set(msgIdx, filteredSources);
        activeMessageIndex = msgIdx;
        showAllSources();
    } else {
        contentDiv.textContent = content;
    }

    bubble.appendChild(contentDiv);

    //  boutons vote + heure
    const footerDiv = document.createElement('div');
    footerDiv.className = 'message-footer';

    if (sender === 'bot' || sender === 'assistant' || sender === 'ai') {
        const noteNum = note !== null && note !== undefined ? Number(note) : null;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';

        const thumbUp = document.createElement('button');
        thumbUp.className = 'vote-btn thumb-up' + (noteNum === 1 ? ' active' : '');
        thumbUp.title = 'Réponse utile';
        thumbUp.innerHTML = '<i class="ri-thumb-up-line"></i>';

        const thumbDown = document.createElement('button');
        thumbDown.className = 'vote-btn thumb-down' + (noteNum === -1 ? ' active' : '');
        thumbDown.title = 'Réponse inutile';
        thumbDown.innerHTML = '<i class="ri-thumb-down-line"></i>';

        thumbUp.addEventListener('click', () => voteMessage(messageId, 1, thumbUp, thumbDown));
        thumbDown.addEventListener('click', () => voteMessage(messageId, -1, thumbUp, thumbDown));

        actionsDiv.appendChild(thumbUp);
        actionsDiv.appendChild(thumbDown);
        footerDiv.appendChild(actionsDiv);
    }

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    const date = createdAt ? new Date(createdAt) : new Date();
    timeDiv.textContent = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    footerDiv.appendChild(timeDiv);

    bubble.appendChild(footerDiv);

    chatContainer.appendChild(bubble);

    if (shouldScroll) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// Vote pour msg bot
async function voteMessage(messageId, vote, thumbUpBtn, thumbDownBtn) {
    if (!messageId) return;

    const currentNote = thumbUpBtn.classList.contains('active') ? 1
                      : thumbDownBtn.classList.contains('active') ? -1
                      : null;

    // Cliquer sur le même bouton annule le vote
    const newNote = currentNote === vote ? null : vote;

    try {
        const response = await fetch(`/messages/${messageId}/note`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: newNote })
        });

        if (!response.ok) throw new Error('Erreur vote');

        thumbUpBtn.classList.toggle('active', newNote === 1);
        thumbDownBtn.classList.toggle('active', newNote === -1);
    } catch (err) {
        console.error('Erreur vote message:', err);
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
function parseSourcesFromContent(content, messageIndex) {
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
            `<span class="source-ref" data-source="${num}" onclick="highlightSource(${num}, ${messageIndex})">[${num}]</span>`
        ).join(' ');
        html = html.replace(`%%SOURCE_${i}%%`, sourceHtml);
    });

    return { html, sources, referencedNumbers: sourceNumbers };
}

// Filtrer les sources d'un message à celles citées dans le texte
function filterSourcesForMessage(serverSources, referencedNumbers) {
    if (!serverSources || serverSources.length === 0) return [];
    if (!referencedNumbers || referencedNumbers.size === 0) return serverSources;
    return serverSources.filter(s => referencedNumbers.has(String(s.number || s.id)));
}

// Afficher toutes les sources de tous les messages, groupées par message
function showAllSources() {
    const sourcesContainer = document.getElementById('sources-container');
    if (!sourcesContainer) return;
    sourcesContainer.innerHTML = '';

    let totalCount = 0;

    messageSourcesMap.forEach((sources, msgIdx) => {
        if (!sources || sources.length === 0) return;

        const groupHeader = document.createElement('div');
        groupHeader.className = 'sources-group-header';
        groupHeader.textContent = `Réponse ${msgIdx + 1}`;
        sourcesContainer.appendChild(groupHeader);

        sources.forEach(source => renderSourceCard(source, msgIdx));
        totalCount += sources.length;
    });

    if (totalCount === 0) {
        sourcesContainer.innerHTML = '<p class="sources-empty">Les sources citées apparaîtront ici.</p>';
    }

    updateSourcesButton(totalCount);
}

// Créer et insérer une source dans la sidebar
function renderSourceCard(source, messageIndex) {
    const sourcesContainer = document.getElementById('sources-container');
    const sourceId = source.number || source.id;
    const title = source.title || `Source ${sourceId}`;
    const excerpt = source.excerpt || 'Document référencé dans la réponse';
    const url = source.url || '';

    const card = document.createElement('div');
    card.className = 'source-card';
    card.id = `source-card-${messageIndex}-${sourceId}`;
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

    card.addEventListener('click', () => highlightSource(sourceId, messageIndex));
    sourcesContainer.appendChild(card);
}

// Mettre à jour le bouton des sources
function updateSourcesButton(count) {
    const btn = document.getElementById('open-sources-btn');
    const countEl = document.getElementById('sources-count');

    if (count > 0) {
        btn.classList.add('visible');
        countEl.textContent = count;
    } else {
        btn.classList.remove('visible');
    }
}

// Met en évidence une source dans le contexte d'un message donné
function highlightSource(sourceNumber, messageIndex) {
    openSourcesSidebar();

    const card = document.getElementById(`source-card-${messageIndex}-${sourceNumber}`);
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
