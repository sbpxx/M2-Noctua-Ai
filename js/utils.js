// utils.js
// Utilitaires partagés sur toutes les pages : notifications, authentification,
// paramètres utilisateur, session invité, panel admin et modals admin.

// ====== NOTIFICATIONS ======

function showError(message, duration) {
    const errorContainer = document.querySelector('.error-container');
    const errorMessage = document.querySelector('.error-message p');

    if (errorContainer && errorMessage) {
        errorMessage.textContent = message;
        errorContainer.style.display = 'block';

        setTimeout(() => {
            errorContainer.style.display = 'none';
        }, duration);
    }
}

function showSuccess(message, duration) {
    const successContainer = document.querySelector('.success-container');
    const successMessage = document.querySelector('.success-message p');

    if (successContainer && successMessage) {
        successMessage.textContent = message;
        successContainer.style.display = 'block';

        setTimeout(() => {
            successContainer.style.display = 'none';
        }, duration);
    }
}

// ====== AUTHENTIFICATION UTILISATEUR ======

// Vérifie que le JWT en session est encore valide côté serveur
async function verifyToken() {
    const token = sessionStorage.getItem('authToken');
    if (!token) return false;

    try {
        const response = await fetch('/protected', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error();
        return true;
    } catch {
        return false;
    }
}

// Vérifie le token et met à jour le bouton utilisateur dans la sidebar
async function updateInfo() {
    const token = sessionStorage.getItem('authToken');
    const userName = sessionStorage.getItem('userName');

    if (!token) {
        updateUserButton(false, null);
        return;
    }

    const isValid = await verifyToken();
    updateUserButton(isValid, isValid ? userName : null);
}

// Met à jour le bouton utilisateur selon l'état de connexion
function updateUserButton(isConnected, userName) {
    const userBtn = document.getElementById('user-connection-btn');
    const userText = userBtn?.querySelector('.user-text');
    const userIcon = userBtn?.querySelector('.user-icon i');

    if (!userBtn || !userText || !userIcon) return;

    if (isConnected && userName) {
        userText.textContent = userName;
        userIcon.className = 'ri-user-smile-fill';

        // Afficher le menu déroulant au clic
        userBtn.onclick = (e) => {
            e.stopPropagation();
            toggleDropdownMenu();
        };
    } else {
        userText.textContent = 'Connectez-vous';
        userIcon.className = 'ri-user-line';

        userBtn.onclick = () => {
            const loginModal = document.getElementById('loginModal');
            if (loginModal) loginModal.style.display = 'flex';
        };
    }
}

function toggleDropdownMenu() {
    const dropdownMenu = document.getElementById('user-dropdown-menu');
    if (!dropdownMenu) return;
    dropdownMenu.classList.toggle('show');
}

// Fermer le menu déroulant si on clique en dehors
document.addEventListener('click', (e) => {
    const dropdownMenu = document.getElementById('user-dropdown-menu');
    const userBtn = document.getElementById('user-connection-btn');

    if (dropdownMenu && !userBtn?.contains(e.target) && !dropdownMenu.contains(e.target)) {
        dropdownMenu.classList.remove('show');
    }
});

function handleLogout() {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('userName');
    sessionStorage.removeItem('userEmail');
    sessionStorage.removeItem('userAdmin');

    const dropdownMenu = document.getElementById('user-dropdown-menu');
    if (dropdownMenu) dropdownMenu.classList.remove('show');

    updateUserButton(false, null);
    showSuccess('Vous avez été déconnecté avec succès', 3000);

    // Rediriger vers begin si on est sur la page chat
    if (window.location.pathname === '/chat') {
        setTimeout(() => { window.location.href = '/begin'; }, 1500);
    }
}

// ====== PARAMÈTRES UTILISATEUR ======

function openSettingsModal() {
    const settingsModal = document.getElementById('settingsModal');
    const dropdownMenu = document.getElementById('user-dropdown-menu');
    const adminMenu = document.getElementById('settings-admin-menu');

    if (settingsModal) settingsModal.style.display = 'flex';

    // Afficher ou masquer le menu Administration selon le statut admin
    const isAdmin = sessionStorage.getItem('userAdmin') === 'true';
    if (adminMenu) adminMenu.style.display = isAdmin ? 'flex' : 'none';

    if (dropdownMenu) dropdownMenu.classList.remove('show');
}

// Gère la navigation entre les sections du modal paramètres
function initSettingsNavigation() {
    const menuItems = document.querySelectorAll('.settings-menu-item');
    const sections = document.querySelectorAll('.settings-section');

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            const sectionId = item.getAttribute('data-section');

            menuItems.forEach(mi => mi.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));

            item.classList.add('active');

            const targetSection = document.getElementById(`section-${sectionId}`);
            if (targetSection) targetSection.classList.add('active');
        });
    });

    loadUserEmail();
    initPasswordChange();
}

// Pré-remplit les champs email et nom dans la section profil des paramètres
function loadUserEmail() {
    const userEmail = sessionStorage.getItem('userEmail');
    const userName = sessionStorage.getItem('userName');
    const emailInput = document.getElementById('profile-email');
    const usernameInput = document.getElementById('profile-username');

    if (emailInput && userEmail) emailInput.value = userEmail;
    if (usernameInput && userName) usernameInput.value = userName;
}

function openUsernameModal() {
    const modal = document.getElementById('usernameModal');
    const input = document.getElementById('username-modal-input');
    if (!modal || !input) return;

    input.value = sessionStorage.getItem('userName') || '';
    modal.style.display = 'flex';
    // Petit délai pour que le modal soit visible avant de mettre le focus
    setTimeout(() => { input.focus(); input.select(); }, 50);
}

function closeUsernameModal() {
    const modal = document.getElementById('usernameModal');
    if (modal) modal.style.display = 'none';
}

async function confirmUsernameChange() {
    const token = sessionStorage.getItem('authToken');
    const input = document.getElementById('username-modal-input');
    const newName = input ? input.value.trim() : '';

    if (!newName) { showError('Le nom ne peut pas être vide', 3000); return; }

    try {
        const res = await fetch('/user/name', {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });
        if (!res.ok) throw new Error();

        sessionStorage.setItem('userName', newName);
        const usernameInput = document.getElementById('profile-username');
        if (usernameInput) usernameInput.value = newName;
        updateUserButton(true, newName);
        showSuccess('Nom modifié avec succès', 2000);
        closeUsernameModal();
    } catch {
        showError('Erreur lors de la modification du nom', 3000);
    }
}

function initPasswordChange() {
    const changePasswordBtn = document.getElementById('change-password-btn');
    const passwordFields = document.getElementById('password-fields');
    const confirmPasswordBtn = document.getElementById('confirm-password-btn');
    const passwordError = document.getElementById('password-error');

    if (changePasswordBtn && passwordFields) {
        changePasswordBtn.addEventListener('click', () => {
            // Basculer l'affichage des champs
            if (passwordFields.style.display === 'none') {
                passwordFields.style.display = 'block';
                changePasswordBtn.textContent = 'Annuler';
            } else {
                passwordFields.style.display = 'none';
                changePasswordBtn.textContent = 'Modifier le mot de passe';
                document.getElementById('old-password').value = '';
                document.getElementById('new-password').value = '';
                document.getElementById('confirm-password').value = '';
                passwordError.style.display = 'none';
            }
        });
    }

    if (confirmPasswordBtn) {
        confirmPasswordBtn.addEventListener('click', async () => {
            const oldPassword = document.getElementById('old-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (!oldPassword || !newPassword || !confirmPassword) {
                passwordError.textContent = 'Veuillez remplir tous les champs';
                passwordError.style.display = 'block';
                return;
            }

            if (newPassword !== confirmPassword) {
                passwordError.textContent = 'Les mots de passe ne correspondent pas';
                passwordError.style.display = 'block';
                return;
            }

            if (newPassword.length < 8) {
                passwordError.textContent = 'Le mot de passe doit contenir au moins 8 caractères';
                passwordError.style.display = 'block';
                return;
            }

            try {
                const token = sessionStorage.getItem('authToken');
                const userEmail = sessionStorage.getItem('userEmail');

                const response = await fetch('/change-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        email: userEmail,
                        oldPassword,
                        newPassword
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    showSuccess('Mot de passe modifié avec succès', 3000);
                    document.getElementById('old-password').value = '';
                    document.getElementById('new-password').value = '';
                    document.getElementById('confirm-password').value = '';
                    passwordError.style.display = 'none';
                    passwordFields.style.display = 'none';
                    changePasswordBtn.textContent = 'Modifier le mot de passe';
                } else {
                    passwordError.textContent = data.error || 'Erreur lors du changement de mot de passe';
                    passwordError.style.display = 'block';
                }
            } catch (error) {
                console.error('Erreur:', error);
                passwordError.textContent = 'Erreur lors du changement de mot de passe';
                passwordError.style.display = 'block';
            }
        });
    }
}

// ====== SESSION INVITÉ ======

function isGuestUser() {
    return !sessionStorage.getItem('authToken');
}

// Génère ou récupère un identifiant de session invité unique
function getGuestSessionId() {
    let guestId = sessionStorage.getItem('guestSessionId');
    if (!guestId) {
        guestId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
        sessionStorage.setItem('guestSessionId', guestId);
    }
    return guestId;
}

function clearGuestSession() {
    sessionStorage.removeItem('guestSessionId');
    sessionStorage.removeItem('guestConversationId');
    localStorage.removeItem('currentConversationId');
}

function isGuestConversation(conversationId) {
    return sessionStorage.getItem('guestConversationId') === conversationId;
}

// ====== PANEL D'ADMINISTRATION — MISTRAL ======

// Met à jour l'affichage du statut du serveur Mistral
function updateMistralStatus(status) {
    const statusIndicator = document.querySelector('#mistral-status .status-indicator');
    const statusText = document.querySelector('#mistral-status .status-text');
    const startBtn = document.getElementById('start-mistral-btn');
    const stopBtn = document.getElementById('stop-mistral-btn');

    if (!statusIndicator || !statusText) return;

    statusIndicator.classList.remove('online', 'offline', 'loading');

    switch (status) {
        case 'running':
            statusIndicator.classList.add('online');
            statusText.textContent = 'Statut: En ligne';
            if (startBtn) startBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
            break;
        case 'stopped':
            statusIndicator.classList.add('offline');
            statusText.textContent = 'Statut: Arrêté';
            if (startBtn) startBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = true;
            break;
        case 'loading':
            statusIndicator.classList.add('loading');
            statusText.textContent = 'Statut: Chargement...';
            if (startBtn) startBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = true;
            break;
        default:
            statusIndicator.classList.add('offline');
            statusText.textContent = 'Statut: Inconnu';
            if (startBtn) startBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = false;
    }
}

async function getMistralStatus() {
    const token = sessionStorage.getItem('authToken');
    if (!token) return;

    updateMistralStatus('loading');

    try {
        const response = await fetch('/api/admin/mistral/status', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        updateMistralStatus(data.status);
    } catch (error) {
        console.error('Erreur récupération statut Mistral:', error);
        updateMistralStatus('unknown');
    }
}

// Flag pour éviter les clics multiples pendant une action en cours
let mistralActionInProgress = false;

async function startMistral() {
    if (mistralActionInProgress) return;

    const token = sessionStorage.getItem('authToken');
    if (!token) return;

    mistralActionInProgress = true;
    updateMistralStatus('loading');

    try {
        const response = await fetch('/api/admin/mistral/start', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.status === 'loading') {
            // Le démarrage prend du temps, on revérifie le statut après 10s
            showSuccess(data.message, 5000);
            setTimeout(async () => {
                await getMistralStatus();
                mistralActionInProgress = false;
            }, 10000);
        } else {
            if (data.success) showSuccess(data.message, 3000);
            else showError(data.message, 3000);
            updateMistralStatus(data.status);
            mistralActionInProgress = false;
        }
    } catch (error) {
        console.error('Erreur démarrage Mistral:', error);
        showError('Erreur lors du démarrage de Mistral', 3000);
        updateMistralStatus('unknown');
        mistralActionInProgress = false;
    }
}

async function stopMistral() {
    if (mistralActionInProgress) return;

    const token = sessionStorage.getItem('authToken');
    if (!token) return;

    mistralActionInProgress = true;
    updateMistralStatus('loading');

    try {
        const response = await fetch('/api/admin/mistral/stop', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) showSuccess(data.message, 3000);
        else showError(data.message, 3000);
        updateMistralStatus(data.status);
    } catch (error) {
        console.error('Erreur arrêt Mistral:', error);
        showError('Erreur lors de l\'arrêt de Mistral', 3000);
        updateMistralStatus('unknown');
    } finally {
        mistralActionInProgress = false;
    }
}

function initAdminControls() {
    const startBtn = document.getElementById('start-mistral-btn');
    const stopBtn = document.getElementById('stop-mistral-btn');

    if (startBtn) startBtn.addEventListener('click', startMistral);
    if (stopBtn) stopBtn.addEventListener('click', stopMistral);
}

// ====== MODAL RECHERCHE DE CONVERSATIONS ======

let allConversationsCache = [];  // Cache pour ne pas refaire la requête à chaque frappe

function openSearchModal() {
    const searchModal = document.getElementById('searchModal');
    if (searchModal) {
        searchModal.style.display = 'flex';
        const searchInput = document.getElementById('search-conversations-input');
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
        loadConversationsForSearch();
    }
}

function closeSearchModal() {
    const searchModal = document.getElementById('searchModal');
    if (searchModal) searchModal.style.display = 'none';

    const searchResults = document.getElementById('search-results');
    if (searchResults) {
        searchResults.innerHTML = '<p class="search-empty-state">Commencez à taper pour rechercher vos conversations</p>';
    }
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';
}

async function loadConversationsForSearch() {
    const token = sessionStorage.getItem('authToken');
    const email = sessionStorage.getItem('userEmail');

    if (!token || !email) {
        const searchResults = document.getElementById('search-results');
        if (searchResults) {
            searchResults.innerHTML = '<p class="search-no-results"><i class="ri-user-line"></i>Connectez-vous pour accéder à vos conversations</p>';
        }
        return;
    }

    try {
        const userResponse = await fetch(`/user?email=${encodeURIComponent(email)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const userData = await userResponse.json();

        const conversationsResponse = await fetch(`/conversations/user/${userData.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        allConversationsCache = await conversationsResponse.json();

        displaySearchResults(allConversationsCache, '');
    } catch (error) {
        console.error('Erreur chargement conversations:', error);
        const searchResults = document.getElementById('search-results');
        if (searchResults) {
            searchResults.innerHTML = '<p class="search-no-results"><i class="ri-error-warning-line"></i>Erreur lors du chargement des conversations</p>';
        }
    }
}

function filterConversations(query) {
    const searchTerm = query.toLowerCase().trim();
    const clearBtn = document.getElementById('search-clear-btn');

    if (clearBtn) clearBtn.style.display = searchTerm ? 'flex' : 'none';

    if (!searchTerm) {
        displaySearchResults(allConversationsCache, '');
        return;
    }

    const filtered = allConversationsCache.filter(conv =>
        conv.title.toLowerCase().includes(searchTerm)
    );
    displaySearchResults(filtered, searchTerm);
}

function displaySearchResults(conversations, searchTerm) {
    const searchResults = document.getElementById('search-results');
    if (!searchResults) return;

    if (conversations.length === 0) {
        searchResults.innerHTML = searchTerm
            ? `<div class="search-no-results"><i class="ri-search-line"></i>Aucune conversation trouvée pour "${searchTerm}"</div>`
            : '<p class="search-no-results"><i class="ri-chat-3-line"></i>Aucune conversation</p>';
        return;
    }

    const html = conversations.map(conv => {
        const title = highlightText(conv.title, searchTerm);
        const date = formatRelativeDate(conv.updated_at || conv.created_at);

        return `
            <div class="search-result-item" data-conversation-id="${conv.id}">
                <div class="search-result-icon"><i class="ri-chat-3-line"></i></div>
                <div class="search-result-content">
                    <p class="search-result-title">${title}</p>
                    <p class="search-result-date">${date}</p>
                </div>
                <i class="ri-arrow-right-s-line search-result-arrow"></i>
            </div>
        `;
    }).join('');

    searchResults.innerHTML = html;

    searchResults.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            navigateToConversation(item.dataset.conversationId);
        });
    });
}

function navigateToConversation(conversationId) {
    closeSearchModal();
    localStorage.setItem('currentConversationId', conversationId);
    window.location.href = `/chat?conversationId=${conversationId}`;
}

function initSearchModal() {
    const searchBtn = document.getElementById('search-conversations-btn');
    const searchInput = document.getElementById('search-conversations-input');
    const clearBtn = document.getElementById('search-clear-btn');
    const searchModal = document.getElementById('searchModal');

    if (searchBtn) {
        searchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openSearchModal();
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => filterConversations(e.target.value));
        searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSearchModal(); });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (searchInput) { searchInput.value = ''; searchInput.focus(); }
            filterConversations('');
        });
    }

    if (searchModal) {
        searchModal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) closeSearchModal();
        });
    }
}

// ====== MODAL GESTION DES UTILISATEURS (ADMIN) ======

let usersSearchTimeout = null;

function openUsersModal() {
    const usersModal = document.getElementById('usersModal');
    if (usersModal) {
        usersModal.style.display = 'flex';
        const searchInput = document.getElementById('users-search-input');
        if (searchInput) { searchInput.value = ''; searchInput.focus(); }
        loadUsersForManagement('');
    }
}

function closeUsersModal() {
    const usersModal = document.getElementById('usersModal');
    if (usersModal) usersModal.style.display = 'none';

    const clearBtn = document.getElementById('users-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';
}

async function loadUsersForManagement(search) {
    const token = sessionStorage.getItem('authToken');
    if (!token) return;

    const usersResults = document.getElementById('users-results');
    const usersCount = document.getElementById('users-count');

    if (usersResults) usersResults.innerHTML = '<p class="users-empty-state">Chargement...</p>';

    try {
        const url = search
            ? `/api/admin/users?search=${encodeURIComponent(search)}`
            : '/api/admin/users';

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Erreur lors de la récupération');

        const users = await response.json();
        displayUsersResults(users, search);

        if (usersCount) {
            usersCount.textContent = `${users.length} utilisateur${users.length > 1 ? 's' : ''} affiché${users.length > 1 ? 's' : ''} (max 25)`;
        }
    } catch (error) {
        console.error('Erreur chargement utilisateurs:', error);
        if (usersResults) {
            usersResults.innerHTML = '<p class="users-no-results"><i class="ri-error-warning-line"></i>Erreur lors du chargement</p>';
        }
    }
}

function displayUsersResults(users, searchTerm) {
    const usersResults = document.getElementById('users-results');
    if (!usersResults) return;

    if (users.length === 0) {
        usersResults.innerHTML = `
            <div class="users-no-results">
                <i class="ri-user-search-line"></i>
                ${searchTerm ? `Aucun utilisateur trouvé pour "${searchTerm}"` : 'Aucun utilisateur'}
            </div>
        `;
        return;
    }

    const currentUserId = getCurrentUserId();

    const html = users.map(user => {
        const isAdmin = user.admin;
        const isSelf = user.id === currentUserId;
        const emailDisplay = highlightText(user.email, searchTerm);

        return `
            <div class="user-item" data-user-id="${user.id}">
                <div class="user-avatar ${isAdmin ? 'is-admin' : ''}">
                    <i class="${isAdmin ? 'ri-shield-user-fill' : 'ri-user-fill'}"></i>
                </div>
                <div class="user-info">
                    <p class="user-name">${escapeHtml(user.name || 'Sans nom')}</p>
                    <p class="user-email">${emailDisplay}</p>
                </div>
                <span class="user-badge ${isAdmin ? 'admin' : 'user'}">${isAdmin ? 'Admin' : 'User'}</span>
                ${isSelf ? `
                    <button class="user-admin-btn promote" disabled title="Vous ne pouvez pas modifier votre propre statut">
                        <i class="ri-lock-line"></i><span>Vous</span>
                    </button>
                ` : `
                    <button class="user-admin-btn ${isAdmin ? 'demote' : 'promote'}"
                            onclick="toggleUserAdmin(${user.id})"
                            data-user-id="${user.id}">
                        <i class="${isAdmin ? 'ri-shield-cross-line' : 'ri-shield-check-line'}"></i>
                        <span>${isAdmin ? 'Retirer admin' : 'Promouvoir'}</span>
                    </button>
                `}
            </div>
        `;
    }).join('');

    usersResults.innerHTML = html;
}

// Décoder l'ID utilisateur depuis le payload JWT sans appel API
function getCurrentUserId() {
    const token = sessionStorage.getItem('authToken');
    if (!token) return null;

    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.id;
    } catch (e) {
        return null;
    }
}

async function toggleUserAdmin(userId) {
    const token = sessionStorage.getItem('authToken');
    if (!token) return;

    const btn = document.querySelector(`.user-admin-btn[data-user-id="${userId}"]`);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="ri-loader-4-line"></i> <span>...</span>';
    }

    try {
        const response = await fetch(`/api/admin/users/${userId}/toggle-admin`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        const data = await response.json();

        if (response.ok) {
            showSuccess(data.message, 3000);
            // Recharger la liste pour refléter le nouveau statut
            const searchInput = document.getElementById('users-search-input');
            loadUsersForManagement(searchInput ? searchInput.value : '');
        } else {
            showError(data.error || 'Erreur lors de la modification', 3000);
            if (btn) btn.disabled = false;
        }
    } catch (error) {
        console.error('Erreur toggle admin:', error);
        showError('Erreur lors de la modification', 3000);
        if (btn) btn.disabled = false;
    }
}

// Filtre avec debounce pour ne pas spammer l'API à chaque frappe
function filterUsers(query) {
    const clearBtn = document.getElementById('users-clear-btn');
    if (clearBtn) clearBtn.style.display = query ? 'flex' : 'none';

    if (usersSearchTimeout) clearTimeout(usersSearchTimeout);

    usersSearchTimeout = setTimeout(() => {
        loadUsersForManagement(query);
    }, 300);
}

function initUsersModal() {
    const manageUsersBtn = document.getElementById('manage-users-btn');
    const searchInput = document.getElementById('users-search-input');
    const clearBtn = document.getElementById('users-clear-btn');
    const usersModal = document.getElementById('usersModal');

    if (manageUsersBtn) {
        manageUsersBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openUsersModal();
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => filterUsers(e.target.value));
        searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeUsersModal(); });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (searchInput) { searchInput.value = ''; searchInput.focus(); }
            filterUsers('');
        });
    }

    if (usersModal) {
        usersModal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) closeUsersModal();
        });
    }
}

// ====== MODAL LOGS D'ADMINISTRATION ======

function openLogsModal() {
    const logsModal = document.getElementById('logsModal');
    if (logsModal) {
        logsModal.style.display = 'flex';
        loadAdminLogs();
    }
}

function closeLogsModal() {
    const logsModal = document.getElementById('logsModal');
    if (logsModal) logsModal.style.display = 'none';
}

async function loadAdminLogs() {
    const token = sessionStorage.getItem('authToken');
    if (!token) return;

    const logsContainer = document.getElementById('logs-container');
    const logsCount = document.getElementById('logs-count');

    if (logsContainer) logsContainer.innerHTML = '<p class="logs-empty-state">Chargement...</p>';

    try {
        const response = await fetch('/api/admin/logs?limit=50', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Erreur lors de la récupération');

        const logs = await response.json();
        displayLogs(logs);

        if (logsCount) {
            logsCount.textContent = `${logs.length} log${logs.length > 1 ? 's' : ''} (50 derniers)`;
        }
    } catch (error) {
        console.error('Erreur chargement logs:', error);
        if (logsContainer) {
            logsContainer.innerHTML = '<p class="logs-empty-state">Erreur lors du chargement des logs</p>';
        }
    }
}

function displayLogs(logs) {
    const logsContainer = document.getElementById('logs-container');
    if (!logsContainer) return;

    if (logs.length === 0) {
        logsContainer.innerHTML = '<p class="logs-empty-state">Aucun log enregistré</p>';
        return;
    }

    const html = logs.map(log => {
        const iconClass = getLogIconClass(log.action);
        const icon = getLogIcon(log.action);
        const date = formatRelativeDate(log.created_at, true);

        return `
            <div class="log-item">
                <div class="log-icon ${iconClass}"><i class="${icon}"></i></div>
                <div class="log-content">
                    <p class="log-action">${escapeHtml(log.action)}</p>
                    <div class="log-meta">
                        <span><i class="ri-user-line"></i><span class="log-email">${escapeHtml(log.user_email)}</span></span>
                        <span><i class="ri-time-line"></i>${date}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    logsContainer.innerHTML = html;
}

function getLogIconClass(action) {
    if (action.includes('Promotion')) return 'admin';
    if (action.includes('Retrait')) return 'demote';
    return 'server';
}

function getLogIcon(action) {
    if (action.includes('Démarrage')) return 'ri-play-circle-line';
    if (action.includes('Arrêt')) return 'ri-stop-circle-line';
    if (action.includes('Promotion')) return 'ri-shield-check-line';
    if (action.includes('Retrait')) return 'ri-shield-cross-line';
    return 'ri-file-list-3-line';
}

function initLogsModal() {
    const viewLogsBtn = document.getElementById('view-logs-btn');
    const logsModal = document.getElementById('logsModal');

    if (viewLogsBtn) {
        viewLogsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openLogsModal();
        });
    }

    if (logsModal) {
        logsModal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) closeLogsModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && logsModal.style.display === 'flex') closeLogsModal();
        });
    }
}

// ====== SUPPRESSION DE L'HISTORIQUE ======

function openDeleteHistoryModal() {
    const modal = document.getElementById('confirmDeleteHistoryModal');
    if (modal) modal.style.display = 'flex';
}

function closeDeleteHistoryModal() {
    const modal = document.getElementById('confirmDeleteHistoryModal');
    if (modal) modal.style.display = 'none';
}

async function deleteAllHistory() {
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        showError('Vous devez être connecté pour supprimer votre historique', 3000);
        closeDeleteHistoryModal();
        return;
    }

    const confirmBtn = document.getElementById('confirm-delete-history');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="ri-loader-4-line"></i> Suppression...';
    }

    try {
        const response = await fetch('/api/user/conversations/all', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (response.ok) {
            showSuccess(`${data.deleted} conversation(s) supprimée(s)`, 3000);
            closeDeleteHistoryModal();

            if (typeof loadDiscussions === 'function') await loadDiscussions();

            if (window.location.pathname === '/chat') {
                setTimeout(() => { window.location.href = '/begin'; }, 1500);
            }
        } else {
            showError(data.error || 'Erreur lors de la suppression', 3000);
        }
    } catch (error) {
        console.error('Erreur suppression historique:', error);
        showError('Erreur lors de la suppression de l\'historique', 3000);
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="ri-delete-bin-line"></i> Supprimer';
        }
    }
}

function initDeleteHistoryModal() {
    const deleteBtn = document.getElementById('delete-history-btn');
    const cancelBtn = document.getElementById('cancel-delete-history');
    const confirmBtn = document.getElementById('confirm-delete-history');
    const modal = document.getElementById('confirmDeleteHistoryModal');

    if (deleteBtn) deleteBtn.addEventListener('click', openDeleteHistoryModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeDeleteHistoryModal);
    if (confirmBtn) confirmBtn.addEventListener('click', deleteAllHistory);

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('confirm-modal-overlay')) closeDeleteHistoryModal();
        });
    }
}

// ====== EXPORT DES DONNÉES UTILISATEUR ======

async function downloadUserData() {
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        showError('Vous devez être connecté pour télécharger vos données', 3000);
        return;
    }

    try {
        const response = await fetch('/api/user/export-data', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erreur lors du téléchargement');
        }

        const data = await response.json();

        // Créer un lien temporaire pour déclencher le téléchargement du fichier JSON
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `noctua-mes-donnees-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();

        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showSuccess('Vos données ont été téléchargées avec succès', 3000);
    } catch (error) {
        console.error('Erreur téléchargement données:', error);
        showError(error.message || 'Erreur lors du téléchargement des données', 3000);
    }
}

// ====== UTILITAIRES ======

// Met en surbrillance un terme recherché dans un texte
function highlightText(text, searchTerm) {
    if (!searchTerm) return escapeHtml(text);

    const escaped = escapeHtml(text);
    const regex = new RegExp(`(${escapeRegex(searchTerm)})`, 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Échapper le HTML pour éviter les injections XSS dans les contenus dynamiques
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Formate une date en texte relatif
// Le paramètre withTime ajoute l'heure pour les logs qui nécessitent plus de précision
function formatRelativeDate(dateString, withTime = false) {
    if (!dateString) return '';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (withTime) {
        if (diffMins < 1) return "À l'instant";
        if (diffMins < 60) return `Il y a ${diffMins} min`;
        if (diffHours < 24) return `Il y a ${diffHours}h`;
        if (diffDays < 7) return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
        return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return "Hier";
    if (diffDays < 7) return `Il y a ${diffDays} jours`;
    return date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
}

// ====== INITIALISATION ======

document.addEventListener('DOMContentLoaded', () => {
    // Bouton déconnexion
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleLogout();
        });
    }

    // Bouton paramètres
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openSettingsModal();
        });
    }

    // Navigation dans les sections du modal paramètres
    initSettingsNavigation();

    // Modal modification du nom d'utilisateur
    const changeUsernameBtn = document.getElementById('change-username-btn');
    if (changeUsernameBtn) changeUsernameBtn.addEventListener('click', openUsernameModal);

    const usernameConfirmBtn = document.getElementById('username-confirm-btn');
    if (usernameConfirmBtn) usernameConfirmBtn.addEventListener('click', confirmUsernameChange);

    const usernameModalInput = document.getElementById('username-modal-input');
    if (usernameModalInput) {
        usernameModalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmUsernameChange();
            if (e.key === 'Escape') closeUsernameModal();
        });
    }

    // Bouton téléchargement des données
    const downloadDataBtn = document.getElementById('download-data-btn');
    if (downloadDataBtn) downloadDataBtn.addEventListener('click', downloadUserData);

    // Tous les modals et contrôles admin
    initAdminControls();
    initSearchModal();
    initUsersModal();
    initLogsModal();
    initDeleteHistoryModal();

    // Charger le statut Mistral quand on ouvre la section admin dans les paramètres
    const adminSection = document.getElementById('section-admin');
    if (adminSection) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.target.classList.contains('active')) getMistralStatus();
            });
        });
        observer.observe(adminSection, { attributes: true, attributeFilter: ['class'] });
    }
});
