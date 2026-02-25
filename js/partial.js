// partial.js
// Éléments partagés sur toutes les pages : sidebar, modals connexion/inscription,
// liste des conversations dans la sidebar, archivage et renommage.

// ====== VARIABLES GLOBALES ======

let isLoadingDiscussions = false;  // Empêche les appels parallèles à loadDiscussions
let _renameConversationId = null;  // ID de la conversation en cours de renommage

// ====== MODALS CONNEXION / INSCRIPTION ======

function showLoginModal() {
    document.getElementById('loginModal').style.display = 'flex';
    document.getElementById('registerModal').style.display = 'none';
    document.querySelectorAll('.grid-container img').forEach(img => img.classList.add('no-grayscale'));
}

function showRegisterModal() {
    document.getElementById('registerModal').style.display = 'flex';
    document.getElementById('loginModal').style.display = 'none';
    document.querySelectorAll('.grid-container img').forEach(img => img.classList.add('no-grayscale'));
}

function hideAuthModals() {
    const loginModal = document.getElementById('loginModal');
    const registerModal = document.getElementById('registerModal');
    if (loginModal) loginModal.style.display = 'none';
    if (registerModal) registerModal.style.display = 'none';
    // Remettre le filtre sur les images de fond
    document.querySelectorAll('.grid-container img').forEach(img => img.classList.remove('no-grayscale'));
}

function continueAsGuest() {
    hideAuthModals();
    window.location.href = '/begin';
}

async function registerAccount() {
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const verifpassword = document.getElementById('register-verifpassword').value;

    if (!username || !email || !password || !verifpassword) {
        showError('Tous les champs sont obligatoires.', 3000);
        return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
        showError('Adresse e-mail invalide.', 3000);
        return;
    }

    if (password !== verifpassword) {
        showError('Les mots de passe ne correspondent pas.', 3000);
        return;
    }

    if (password.length < 8) {
        showError('Le mot de passe doit contenir au moins 8 caractères.', 3000);
        return;
    }

    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nom: username, email, mot_de_passe: password })
        });
        const result = await response.json();
        if (!response.ok) {
            showError(result.error, 3000);
            return;
        }
        window.location.href = '/';
    } catch (error) {
        console.error('[Inscription] Erreur:', error.message);
        showError(error.message, 3000);
    }
}

async function connectAccount() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const loginRes = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const loginData = await loginRes.json();
        if (!loginRes.ok) {
            showError(loginData.error, 3000);
            return;
        }

        sessionStorage.setItem('authToken', loginData.token);

        // Récupérer les infos complètes de l'utilisateur pour les stocker en session
        const userRes = await fetch(`/user?email=${encodeURIComponent(email)}`, {
            headers: { 'Authorization': `Bearer ${loginData.token}` }
        });
        const userData = await userRes.json();
        if (!userRes.ok) {
            showError(userData.error, 3000);
            return;
        }

        sessionStorage.setItem('userName', userData.name);
        sessionStorage.setItem('userEmail', userData.email);
        sessionStorage.setItem('userAdmin', userData.admin ? 'true' : 'false');

        showSuccess('Connexion réussie. Bienvenue!', 1500);
        setTimeout(() => { window.location.href = '/begin'; }, 1500);
    } catch (error) {
        console.error('[Connexion] Erreur:', error.message);
        showError(error.message, 3000);
    }
}

function initAuthModals() {
    const accueilNav = document.getElementById('accueil');
    const begin = document.getElementById('begin');
    const loginButton = document.querySelector('.btn_login');
    const registerLink = document.querySelector('.register_link');
    const loginLink = document.querySelector('.login_link');
    const closeModalButtons = document.querySelectorAll('.close-modal');
    const btnContinueGuest = document.getElementById('btn-continue-guest');
    const btnContinueGuestRegister = document.getElementById('btn-continue-guest-register');
    const btnRegister = document.getElementById('btn-register');
    const btnLogin = document.getElementById('btn-login');

    if (accueilNav) accueilNav.addEventListener('click', () => window.location.href = '/');

    // Bouton "Commencer" : redirige vers /begin si connecté, sinon ouvre le modal
    if (begin) {
        begin.addEventListener('click', async function () {
            const token = sessionStorage.getItem('authToken');
            if (token) {
                const isValid = await verifyToken();
                if (isValid) { window.location.href = '/begin'; return; }
            }
            showLoginModal();
        });
    }

    if (loginButton) loginButton.addEventListener('click', showLoginModal);
    if (registerLink) registerLink.addEventListener('click', showRegisterModal);
    if (loginLink) loginLink.addEventListener('click', showLoginModal);
    if (btnContinueGuest) btnContinueGuest.addEventListener('click', continueAsGuest);
    if (btnContinueGuestRegister) btnContinueGuestRegister.addEventListener('click', continueAsGuest);
    if (btnRegister) btnRegister.addEventListener('click', registerAccount);
    if (btnLogin) btnLogin.addEventListener('click', connectAccount);

    // Fermer les modals avec les boutons "×"
    closeModalButtons.forEach(button => button.addEventListener('click', hideAuthModals));

    // Fermer en cliquant sur l'overlay
    window.addEventListener('click', function (event) {
        const loginModal = document.getElementById('loginModal');
        const registerModal = document.getElementById('registerModal');
        if (event.target === loginModal || event.target === registerModal) {
            hideAuthModals();
        }
    });
}

// ====== SIDEBAR ======

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    // La classe 'transitioning' bloque les interactions pendant l'animation CSS
    sidebar.classList.add('transitioning');
    setTimeout(() => sidebar.classList.remove('transitioning'), 300);
}

function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const collapseBtn = document.getElementById('btn-collapse');
    const logoDiv = document.querySelector('.pro-sidebar-logo div');

    if (sidebar && collapseBtn) {
        collapseBtn.addEventListener('click', toggleSidebar);
    }

    // Cliquer sur le logo quand la sidebar est réduite la réouvre
    if (logoDiv) {
        logoDiv.addEventListener('click', function () {
            if (document.getElementById('sidebar').classList.contains('collapsed')) {
                toggleSidebar();
            }
        });
    }
}

// ====== LISTE DES DISCUSSIONS ======

async function loadDiscussions() {
    const token = sessionStorage.getItem('authToken');
    const email = sessionStorage.getItem('userEmail');

    if (!token || !email) return;

    try {
        const userResponse = await fetch(`/user?email=${encodeURIComponent(email)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const userData = await userResponse.json();
        if (!userData || !userData.id) return;

        // Charger les conversations actives et archivées en parallèle
        const [conversationsResponse, archivedResponse] = await Promise.all([
            fetch(`/conversations/user/${userData.id}`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch('/api/user/archived-conversations', { headers: { 'Authorization': `Bearer ${token}` } })
        ]);
        let conversations = await conversationsResponse.json();
        const archivedIds = new Set(
            (await archivedResponse.json().catch(() => [])).map(c => c.id)
        );

        // Exclure les conversations archivées de la liste principale
        conversations = conversations.filter(c => !archivedIds.has(c.id));

        // Si une nouvelle conversation vient d'être créée,
        // on l'insère en tête de liste avant qu'elle n'apparaisse côté serveur
        const newConvString = localStorage.getItem('newConversation');
        if (newConvString) {
            const newConv = JSON.parse(newConvString);
            const exists = conversations.some(conv => conv.id === newConv.id);
            if (!exists) conversations.unshift(newConv);
            localStorage.removeItem('newConversation');
        }

        const discussionsList = document.getElementById('discussions-list');
        if (!discussionsList) return;

        // Vider la liste sauf le header
        while (discussionsList.children.length > 1) {
            discussionsList.removeChild(discussionsList.lastChild);
        }

        conversations.forEach(conv => {
            const li = document.createElement('li');
            li.className = 'menu-item discussion';
            li.innerHTML = `
                <a href="#" class="discussion-link" data-conversation-id="${conv.id}">
                    <span class="menu-title">${conv.title}</span>
                </a>
                <button class="discussion-options-btn" data-conversation-id="${conv.id}">
                    <i class="ri-more-fill"></i>
                </button>
                <div class="discussion-dropdown-menu" data-conversation-id="${conv.id}">
                    <a href="#" class="dropdown-item" data-action="edit">
                        <i class="ri-edit-line"></i>
                        <span>Modifier le titre</span>
                    </a>
                    <a href="#" class="dropdown-item" data-action="archive">
                        <i class="ri-archive-line"></i>
                        <span>Archiver la conversation</span>
                    </a>
                    <a href="#" class="dropdown-item" data-action="delete">
                        <i class="ri-delete-bin-line"></i>
                        <span>Supprimer la conversation</span>
                    </a>
                </div>
            `;
            discussionsList.appendChild(li);
        });
    } catch (err) {
        console.error('loadDiscussions - Erreur:', err);
    }
}

async function safeLoadDiscussions() {
    if (isLoadingDiscussions) return;
    isLoadingDiscussions = true;
    await loadDiscussions();
    isLoadingDiscussions = false;
}

// Affiche/cache le menu d'options d'une discussion, positionné à droite de la sidebar
function toggleDiscussionMenu(conversationId) {
    const menu = document.querySelector(`.discussion-dropdown-menu[data-conversation-id="${conversationId}"]`);
    const button = document.querySelector(`.discussion-options-btn[data-conversation-id="${conversationId}"]`);
    if (!menu || !button) return;

    // Fermer tous les autres menus ouverts d'abord
    document.querySelectorAll('.discussion-dropdown-menu.show').forEach(m => {
        if (m !== menu) m.classList.remove('show');
    });

    if (!menu.classList.contains('show')) {
        const buttonRect = button.getBoundingClientRect();
        const sidebarRect = document.getElementById('sidebar').getBoundingClientRect();
        menu.style.left = `${sidebarRect.right + 8}px`;
        menu.style.top = `${buttonRect.top + buttonRect.height / 2}px`;
        menu.style.transform = 'translateY(-50%)';
    }

    menu.classList.toggle('show');
}

async function deleteConversation(conversationId) {
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        showError('Vous devez être connecté pour supprimer une conversation');
        return;
    }

    if (!confirm('Êtes-vous sûr de vouloir supprimer cette conversation ?')) return;

    try {
        const response = await fetch(`/conversations/${conversationId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            showSuccess('Conversation supprimée avec succès');

            // Si on était sur cette conversation, rediriger vers le début
            const urlParams = new URLSearchParams(window.location.search);
            const currentConvId = urlParams.get('conversationId');
            if (currentConvId && parseInt(currentConvId) === parseInt(conversationId)) {
                window.location.href = '/begin';
                return;
            }

            await loadDiscussions();
        } else {
            showError('Erreur lors de la suppression de la conversation');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showError('Erreur lors de la suppression de la conversation');
    }
}

function initDiscussionsEvents() {
    // Délégation d'événements pour les clics dans la liste des discussions
    document.addEventListener('click', function (e) {

        // Clic sur un lien de discussion → naviguer vers la conversation
        const discussionLink = e.target.closest('.discussion-link');
        if (discussionLink) {
            e.preventDefault();
            const conversationId = discussionLink.dataset.conversationId;
            if (conversationId) {
                localStorage.setItem('currentConversationId', conversationId);
                window.location.href = `/chat?conversationId=${conversationId}`;
            }
            return;
        }

        // Clic sur le bouton "···" → ouvrir/fermer le menu d'options
        const optionsBtn = e.target.closest('.discussion-options-btn');
        if (optionsBtn) {
            e.stopPropagation();
            toggleDiscussionMenu(optionsBtn.dataset.conversationId);
            return;
        }

        // Clic sur une action du menu
        const dropdownItem = e.target.closest('.discussion-dropdown-menu .dropdown-item');
        if (dropdownItem) {
            e.preventDefault();
            e.stopPropagation();

            const menu = dropdownItem.closest('.discussion-dropdown-menu');
            const conversationId = menu.dataset.conversationId;
            const action = dropdownItem.dataset.action;
            menu.classList.remove('show');

            if (action === 'delete') {
                deleteConversation(conversationId);
            } else if (action === 'edit') {
                const titleEl = document.querySelector(`.discussion-link[data-conversation-id="${conversationId}"] .menu-title`);
                openRenameModal(conversationId, titleEl ? titleEl.textContent : '');
            } else if (action === 'archive') {
                archiveConversation(conversationId);
            }
            return;
        }

        // Clic n'importe où ailleurs → fermer tous les menus ouverts
        if (!e.target.closest('.discussion-dropdown-menu')) {
            document.querySelectorAll('.discussion-dropdown-menu.show').forEach(menu => {
                menu.classList.remove('show');
            });
        }
    });

    // Recharger les discussions au retour sur la page
    window.addEventListener('pageshow', function () {
        setTimeout(safeLoadDiscussions, 100);
    });
}

// ====== ARCHIVAGE ======

async function archiveConversation(conversationId) {
    const token = sessionStorage.getItem('authToken');
    if (!token) { showError('Vous devez être connecté'); return; }

    try {
        const res = await fetch(`/conversations/${conversationId}/archive`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error();

        showSuccess('Conversation archivée');

        // Rediriger si on était sur cette conversation
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('conversationId') == conversationId) {
            window.location.href = '/begin';
            return;
        }
        await safeLoadDiscussions();
    } catch {
        showError('Erreur lors de l\'archivage');
    }
}

async function unarchiveConversation(conversationId) {
    const token = sessionStorage.getItem('authToken');
    if (!token) return;

    try {
        const res = await fetch(`/conversations/${conversationId}/archive`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error();

        showSuccess('Conversation désarchivée');
        await openArchiveModal();     // Rafraîchir la liste du modal
        await safeLoadDiscussions();  // Rafraîchir la sidebar
    } catch {
        showError('Erreur lors du désarchivage');
    }
}

async function openArchiveModal() {
    const token = sessionStorage.getItem('authToken');
    const modal = document.getElementById('archiveModal');
    const resultsEl = document.getElementById('archive-results');
    if (!modal) return;

    modal.style.display = 'flex';

    if (!token) {
        resultsEl.innerHTML = '<p class="archive-empty-state">Vous devez être connecté.</p>';
        return;
    }

    resultsEl.innerHTML = '<p class="archive-empty-state">Chargement...</p>';

    try {
        const res = await fetch('/api/user/archived-conversations', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const conversations = await res.json();

        if (!conversations.length) {
            resultsEl.innerHTML = '<p class="archive-empty-state">Aucune conversation archivée.</p>';
            return;
        }

        resultsEl.innerHTML = '';
        conversations.forEach(conv => {
            const item = document.createElement('div');
            item.className = 'archive-item';
            item.innerHTML = `
                <a href="/chat?conversationId=${conv.id}" class="archive-item-title">${escapeHtml(conv.title)}</a>
                <button class="archive-unarchive-btn" title="Désarchiver">
                    <i class="ri-inbox-unarchive-line"></i>
                </button>
            `;
            item.querySelector('.archive-unarchive-btn').addEventListener('click', () => unarchiveConversation(conv.id));
            resultsEl.appendChild(item);
        });
    } catch {
        resultsEl.innerHTML = '<p class="archive-empty-state">Erreur de chargement.</p>';
    }
}

function closeArchiveModal() {
    const modal = document.getElementById('archiveModal');
    if (modal) modal.style.display = 'none';
}

// ====== RENOMMAGE ======

function openRenameModal(conversationId, currentTitle) {
    _renameConversationId = conversationId;
    const modal = document.getElementById('renameModal');
    const input = document.getElementById('rename-input');
    if (!modal || !input) return;

    input.value = currentTitle || '';
    modal.style.display = 'flex';
    // Petit délai pour que le modal soit visible avant de mettre le focus
    setTimeout(() => { input.focus(); input.select(); }, 50);
}

function closeRenameModal() {
    const modal = document.getElementById('renameModal');
    if (modal) modal.style.display = 'none';
    _renameConversationId = null;
}

async function renameConversation() {
    const token = sessionStorage.getItem('authToken');
    const input = document.getElementById('rename-input');
    const newTitle = input ? input.value.trim() : '';

    if (!newTitle) { showError('Le titre ne peut pas être vide'); return; }
    if (!_renameConversationId) return;

    try {
        const res = await fetch(`/conversations/${_renameConversationId}/title`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
        });
        if (!res.ok) throw new Error();

        showSuccess('Titre modifié');
        closeRenameModal();
        await safeLoadDiscussions();
    } catch {
        showError('Erreur lors de la modification du titre');
    }
}

function initArchiveRenameModal() {
    // Bouton Archives dans la sidebar
    const archiveBtn = document.getElementById('archive-conversations-btn');
    if (archiveBtn) {
        archiveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openArchiveModal();
        });
    }

    // Bouton Valider du modal rename
    const renameConfirmBtn = document.getElementById('rename-confirm-btn');
    if (renameConfirmBtn) {
        renameConfirmBtn.addEventListener('click', renameConversation);
    }

    // Clavier dans le champ rename
    const renameInput = document.getElementById('rename-input');
    if (renameInput) {
        renameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') renameConversation();
            if (e.key === 'Escape') closeRenameModal();
        });
    }
}

// ====== INITIALISATION ======

document.addEventListener('DOMContentLoaded', function () {
    updateInfo();              // Vérifier si l'utilisateur est connecté et mettre à jour l'UI
    initAuthModals();          // Modals connexion / inscription
    initSidebar();             // Collapse de la sidebar
    initDiscussionsEvents();   // Délégation de clics sur les discussions
    initArchiveRenameModal();  // Modals archivage et renommage

    // Charger les discussions avec un petit délai pour laisser le DOM se stabiliser
    setTimeout(safeLoadDiscussions, 100);
});
