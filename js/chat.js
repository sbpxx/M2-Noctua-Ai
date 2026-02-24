// =============================================================
// VARIABLES GLOBALES
// =============================================================

const socket = io();

let currentConversationId = null;
let isConnected = false;
let isWaitingForResponse = false;

// Chaque message bot a un index, on stocke ses sources dans cette map
let messageSourcesMap = new Map();
let botMessageCount = 0;


// =============================================================
// INITIALISATION
// =============================================================

document.addEventListener('DOMContentLoaded', async function() {
    const token = sessionStorage.getItem('authToken');
    const isGuest = !token;

    // On récupère l'ID de conversation depuis l'URL ou le localStorage
    const urlParams = new URLSearchParams(window.location.search);
    currentConversationId = urlParams.get('conversationId') || localStorage.getItem('currentConversationId');

    // Un invité n'a accès qu'à sa propre conversation de session
    if (isGuest) {
        const guestConvId = sessionStorage.getItem('guestConversationId');

        if (!guestConvId) {
            window.location.href = '/begin';
            return;
        }

        // Si l'invité essaie d'accéder à une autre conversation, on le vire
        if (currentConversationId !== guestConvId) {
            clearGuestSession();
            window.location.href = '/begin';
            return;
        }
    }

    // Cas où on vient juste de créer une nouvelle conversation depuis begin.js
    if (!currentConversationId) {
        const newConvString = localStorage.getItem('newConversation');
        if (newConvString) {
            const newConv = JSON.parse(newConvString);
            currentConversationId = newConv.id;
            localStorage.setItem('currentConversationId', currentConversationId);
        }
    }

    if (currentConversationId) {
        await loadConversationMessages(currentConversationId);
    } else {
        console.warn('[Chat] Aucun ID de conversation trouvé');
        window.location.href = '/begin';
    }

    setupEventListeners();
    initSourcesListeners();
});


// =============================================================
// SOCKET.IO — connexion et réception des messages
// =============================================================

socket.on('connect', () => {
    isConnected = true;
    // On rejoint la room de la conversation pour recevoir ses messages en temps réel
    if (currentConversationId) {
        socket.emit('join-conversation', currentConversationId);
    }
});

socket.on('disconnect', () => {
    isConnected = false;
});

socket.on('reconnect', () => {
    // Si la connexion est perdue et rétablie, on se remet dans la bonne room
    if (currentConversationId) {
        socket.emit('join-conversation', currentConversationId);
    }
});

socket.on('receive-message', (data) => {
    let content = data.content;

    // Mistral peut planter côté serveur, on remplace l'erreur technique par un message lisible
    if (content && (
        content.includes('[ERREUR RÉSEAU]') ||
        content.includes('Connection aborted') ||
        content.includes('ConnectionResetError')
    )) {
        content = "Désolé, le service IA est temporairement indisponible. Veuillez réessayer dans quelques instants.";
    }

    // Le serveur renvoie notre propre message en écho.
    // On l'ignore ici car on l'a déjà affiché localement dans sendMessage().
    // On profite de cet écho pour afficher l'indicateur de frappe.
    if (data.sender === 'user') {
        showTypingIndicator();
        return;
    }

    // Réponse du bot reçue, on l'affiche et on réactive la saisie
    displayMessage(data.sender, content, true, data.sources || [], data.id || null, null, data.created_at);
    hideTypingIndicator();
    enableSendControls();
});

socket.on('error', (error) => {
    console.error('[Socket] Erreur:', error);
    hideTypingIndicator();
    enableSendControls();
    showError('Une erreur est survenue lors de l\'envoi du message', 3000);
});


// =============================================================
// CHARGEMENT DE LA CONVERSATION
// =============================================================

async function loadConversationMessages(conversationId) {
    const chatContainer = document.getElementById('chat-container');

    // Spinner pendant le chargement
    chatContainer.innerHTML = '<div class="chat-loading-spinner"></div>';

    try {
        const token = sessionStorage.getItem('authToken');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const response = await fetch(`/conversations/${conversationId}/messages`, { headers });
        if (!response.ok) throw new Error('Échec de chargement des messages');

        const messages = await response.json();

        // On repart de zéro : on vide le chat et on réinitialise les sources
        chatContainer.innerHTML = '';
        messageSourcesMap = new Map();
        botMessageCount = 0;
        const sourcesContainer = document.getElementById('sources-container');
        if (sourcesContainer) {
            sourcesContainer.innerHTML = '<p class="sources-empty">Les sources citées apparaîtront ici.</p>';
        }

        // Affichage de tous les messages existants
        messages.forEach(message => {
            const sources = message.sources || [];
            displayMessage(message.sender, message.content, false, sources, message.id, message.note, message.created_at);
        });

        chatContainer.scrollTop = chatContainer.scrollHeight;
        showAllSources();

        // --- Gestion de l'état d'attente ---
        // Si l'utilisateur revient sur une conversation dont le LLM génère encore la réponse,
        // on remet l'interface en mode "attente" sans renvoyer le message au serveur.
        const lastMessage = messages[messages.length - 1];
        const waitingId = sessionStorage.getItem('waitingConversationId');
        const isAlreadyWaiting = waitingId === String(conversationId);

        if (messages.length === 1 && messages[0].sender === 'user') {
            // Nouvelle conversation : un seul message user sans réponse bot
            // → on déclenche la génération côté serveur
            const email = sessionStorage.getItem('userEmail');
            const isGuest = !token;

            disableSendControls();
            showTypingIndicator();

            if (!isAlreadyWaiting) {
                socket.emit('send-message', {
                    conversationId: conversationId,
                    userId: isGuest ? null : email,
                    message: messages[0].content,
                    isGuest: isGuest,
                    alreadySaved: true  // déjà en BDD, ne pas réinsérer
                });
            }
        } else if (lastMessage?.sender === 'user' && isAlreadyWaiting) {
            // L'utilisateur était parti pendant la génération et revient
            // → on remet juste le visuel "en attente", la réponse arrivera via socket
            disableSendControls();
            showTypingIndicator();
        }

    } catch (error) {
        console.error('[Chat] Erreur chargement messages:', error);
    }
}


// =============================================================
// AFFICHAGE DES MESSAGES
// =============================================================

function displayMessage(sender, content, shouldScroll = true, serverSources = [], messageId = null, note = null, createdAt = null) {
    const chatContainer = document.getElementById('chat-container');

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${sender}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if (sender === 'bot') {
        // Pour le bot on parse le markdown et on transforme les refs [1] en spans cliquables
        const msgIdx = botMessageCount++;
        bubble.dataset.messageIndex = msgIdx;

        const { html, referencedNumbers } = parseSourcesFromContent(content, msgIdx);
        contentDiv.innerHTML = html;

        // On garde uniquement les sources que le bot a vraiment citées dans sa réponse
        const filteredSources = filterSourcesForMessage(serverSources, referencedNumbers);
        messageSourcesMap.set(msgIdx, filteredSources);
        showAllSources();
    } else {
        contentDiv.textContent = content;
    }

    bubble.appendChild(contentDiv);

    // Footer : vote et heure
    const footerDiv = document.createElement('div');
    footerDiv.className = 'message-footer';

    if (sender === 'bot') {
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

function showTypingIndicator() {
    // On supprime l'ancien s'il existe pour éviter les doublons
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


// =============================================================
// ENVOI DE MESSAGES
// =============================================================

function setupEventListeners() {
    const sendBtn = document.getElementById('send-btn');
    const chatInput = document.getElementById('chat-input');

    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    } else {
        console.error('[Chat] Bouton d\'envoi introuvable');
    }

    if (chatInput) {
        // Entrée envoie le message, Shift+Entrée fait un saut de ligne
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    } else {
        console.error('[Chat] Input de message introuvable');
    }
}

function sendMessage() {
    if (isWaitingForResponse) return;

    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();

    if (!message || !currentConversationId) return;

    if (!isConnected) {
        showError('Non connecté au serveur. Veuillez rafraîchir la page.', 3000);
        return;
    }

    const token = sessionStorage.getItem('authToken');
    const email = sessionStorage.getItem('userEmail');
    const isGuest = !token;

    if (!isGuest && (!token || !email)) {
        showError('Session expirée, veuillez vous reconnecter', 3000);
        setTimeout(() => {
            window.location.href = '/begin';
        }, 2000);
        return;
    }

    disableSendControls();

    // On affiche le message localement tout de suite sans attendre l'écho socket
    displayMessage('user', message, true, [], null, null, new Date().toISOString());

    socket.emit('send-message', {
        conversationId: currentConversationId,
        userId: isGuest ? null : email,
        message: message,
        isGuest: isGuest
    });

    chatInput.value = '';
}

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
    // On persiste l'ID en session pour retrouver l'état si l'utilisateur change de page
    sessionStorage.setItem('waitingConversationId', currentConversationId);
}

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
    sessionStorage.removeItem('waitingConversationId');
}


// =============================================================
// SYSTÈME DE VOTE
// =============================================================

async function voteMessage(messageId, vote, thumbUpBtn, thumbDownBtn) {
    if (!messageId) return;

    // Si on reclique sur le bouton déjà actif, ça annule le vote
    const currentNote = thumbUpBtn.classList.contains('active') ? 1
                      : thumbDownBtn.classList.contains('active') ? -1
                      : null;
    const newNote = currentNote === vote ? null : vote;

    try {
        const token = sessionStorage.getItem('authToken');
        const response = await fetch(`/messages/${messageId}/note`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ note: newNote })
        });

        if (!response.ok) throw new Error('Erreur vote');

        thumbUpBtn.classList.toggle('active', newNote === 1);
        thumbDownBtn.classList.toggle('active', newNote === -1);
    } catch (err) {
        console.error('Erreur vote message:', err);
    }
}


// =============================================================
// SIDEBAR DES SOURCES
// =============================================================

// Extrait tous les numéros de sources du texte brut ([1], [Source 2], etc.)
// et retourne le HTML avec les références transformées en spans cliquables
function parseSourcesFromContent(content, messageIndex) {
    const sourceNumbers = new Set();

    const parseNums = str => str.split(/[\s,]+|et/i).map(n => n.trim()).filter(n => /^\d+$/.test(n));

    // On cherche les formats [Source 1], (Source 1,2), Source 3...
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
    // Format court [1]
    const bareRefRegex = /\[(\d+)\]/g;
    while ((match = bareRefRegex.exec(content)) !== null) {
        sourceNumbers.add(match[1]);
    }

    let processedContent = content.replace(/\n{3,}/g, '\n\n').trim();

    // On remplace les refs par des placeholders AVANT le parsing markdown
    // pour éviter que marked.js les transforme en liens ou les casse
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

    // Markdown → HTML
    let html = marked.parse(processedContent, { breaks: true });

    // Puis on remet les refs sous forme de spans cliquables
    sourcePlaceholders.forEach((numsStr, i) => {
        const nums = parseNums(numsStr);
        const sourceHtml = nums.map(num =>
            `<span class="source-ref" data-source="${num}" onclick="highlightSource(${num}, ${messageIndex})">[${num}]</span>`
        ).join(' ');
        html = html.replace(`%%SOURCE_${i}%%`, sourceHtml);
    });

    return { html, referencedNumbers: sourceNumbers };
}

// On garde uniquement les sources que le bot a réellement citées
// Si aucun numéro n'est détecté, on affiche tout par défaut
function filterSourcesForMessage(serverSources, referencedNumbers) {
    if (!serverSources || serverSources.length === 0) return [];
    if (!referencedNumbers || referencedNumbers.size === 0) return serverSources;
    return serverSources.filter(s => referencedNumbers.has(String(s.number || s.id)));
}

// Reconstruit toute la sidebar à partir de la map messageSourcesMap
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

// Crée et insère une carte source dans la sidebar
function renderSourceCard(source, messageIndex) {
    const sourcesContainer = document.getElementById('sources-container');
    const sourceId = source.number || source.id;
    const title = source.title || `Source ${sourceId}`;
    const excerpt = source.excerpt || 'Document référencé dans la réponse';
    const url = source.url || '';

    const card = document.createElement('div');
    card.className = 'source-card';
    // L'ID inclut l'index du message pour éviter les collisions entre messages
    card.id = `source-card-${messageIndex}-${sourceId}`;
    card.innerHTML = `
        <div class="source-card-header">
            <span class="source-badge">Source ${sourceId}</span>
            <p class="source-title">${escapeHtml(title)}</p>
        </div>
        <p class="source-excerpt">${escapeHtml(excerpt)}</p>
        <div class="source-meta">
            ${url
                ? `<a href="${escapeHtml(url)}" target="_blank" class="source-link"><i class="ri-external-link-line"></i> Ouvrir le document</a>`
                : '<i class="ri-file-text-line"></i> <span>Document universitaire</span>'
            }
        </div>
    `;

    card.addEventListener('click', () => highlightSource(sourceId, messageIndex));
    sourcesContainer.appendChild(card);
}

// Affiche ou cache le bouton flottant "Sources" selon qu'il y en a ou non
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

// Ouvre la sidebar et scroll jusqu'à la source cliquée, avec un flash visuel
function highlightSource(sourceNumber, messageIndex) {
    openSourcesSidebar();

    const card = document.getElementById(`source-card-${messageIndex}-${sourceNumber}`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.borderColor = '#7A73D1';
        card.style.boxShadow = '0 4px 16px rgba(122, 115, 209, 0.3)';

        // On enlève le flash après 2 secondes
        setTimeout(() => {
            card.style.borderColor = '';
            card.style.boxShadow = '';
        }, 2000);
    }
}

function openSourcesSidebar() {
    const sidebar = document.getElementById('sources-sidebar');
    sidebar.classList.add('open');
}

function closeSourcesSidebar() {
    const sidebar = document.getElementById('sources-sidebar');
    sidebar.classList.remove('open');
}

function initSourcesListeners() {
    const openBtn = document.getElementById('open-sources-btn');
    const closeBtn = document.getElementById('close-sources-btn');

    if (openBtn) openBtn.addEventListener('click', openSourcesSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSourcesSidebar);
}
