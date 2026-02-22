// partial.js

document.addEventListener('DOMContentLoaded', function() {


    


    updateInfo();


    // Sélectionner les éléments de navigation
    const accueilNav = document.getElementById('accueil');
    const begin = document.getElementById('begin');

    // Ajouter des écouteurs d'événements pour les éléments de navigation
    if (accueilNav) {
        accueilNav.addEventListener('click', function() {
            window.location.href = '/'; // Rediriger vers la page d'accueil
        });
    }


    if (begin) {
        begin.addEventListener('click', async function() {
            const token = sessionStorage.getItem('authToken');
            if (token) {
                // vérification token
                const isValid = await verifyToken();
                if (isValid) {
                    window.location.href = '/begin';
                    return;
                }
            }
            showLoginModal();
        });
    }

    //Si il fait un click peut importe ou sur on verifier le jeton
    window.addEventListener('click', function() {
        updateInfo();
    });

    

    const loginModal = document.getElementById('loginModal');
    const registerModal = document.getElementById('registerModal');
    const loginButton = document.querySelector('.btn_login');
    const registerLink = document.querySelector('.register_link');
    const loginLink = document.querySelector('.login_link');
    const closeModalButtons = document.querySelectorAll('.close-modal');
    const images = document.querySelectorAll('.grid-container img');
    const btnContinueGuest = document.getElementById('btn-continue-guest');
    const btnContinueGuestRegister = document.getElementById('btn-continue-guest-register');
    

    // Fonction pour afficher le modal de connexion
    function showLoginModal() {
        loginModal.style.display = 'flex';
        registerModal.style.display = 'none';
        images.forEach(img => img.classList.add('no-grayscale')); // Ajouter la classe pour désactiver le filtre
    }

    // Fonction pour afficher le modal d'inscription
    function showRegisterModal() {
        registerModal.style.display = 'flex';
        loginModal.style.display = 'none';
        images.forEach(img => img.classList.add('no-grayscale')); // Ajouter la classe pour désactiver le filtre
    }
 

    // Ajouter des écouteurs d'événements
    if (loginButton) {
        loginButton.addEventListener('click', showLoginModal);
    }

    if (registerLink) {
        registerLink.addEventListener('click', showRegisterModal);
    }

    if (loginLink) {
        loginLink.addEventListener('click', showLoginModal);
    }

    if (btnContinueGuest) {
        btnContinueGuest.addEventListener('click', continueAsGuest);
    }

    if (btnContinueGuestRegister) {
        btnContinueGuestRegister.addEventListener('click', continueAsGuest);
    }

    // Fonction pour continuer sans compte
    function continueAsGuest() {
        loginModal.style.display = 'none';
        registerModal.style.display = 'none';
        window.location.href = '/begin';
    }




    // Fonction pour s'inscrire
    const btn_register = document.getElementById('btn-register');

    if (btn_register) {
        btn_register.addEventListener('click', registerAccount);
    }


    async function registerAccount() {
        const username = document.getElementById('register-username').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const verifpassword = document.getElementById('register-verifpassword').value;
        const error = document.getElementById('register-error');

        // Vérifications de sécurité côté client
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

        const data = { nom: username, email: email, mot_de_passe: password };

        try {
            const response = await fetch('/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
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






    // Fonction pour se connecter
    const btn_login = document.getElementById('btn-login');

    if(btn_login){
        btn_login.addEventListener('click', connectAccount);
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



    


    // Ajouter des écouteurs d'événements pour fermer les modals
    closeModalButtons.forEach(button => {
        button.addEventListener('click', function() {
            loginModal.style.display = 'none';
            registerModal.style.display = 'none';
            images.forEach(img => img.classList.remove('no-grayscale')); // Retirer la classe pour réactiver le filtre
        });
    });

    // Fermer le modal lorsque l'utilisateur clique en dehors du modal
    window.addEventListener('click', function(event) {
        if (event.target === loginModal) {
            loginModal.style.display = 'none';
            images.forEach(img => img.classList.remove('no-grayscale')); // Retirer la classe pour réactiver le filtre
        }
        if (event.target === registerModal) {
            registerModal.style.display = 'none';
            images.forEach(img => img.classList.remove('no-grayscale')); // Retirer la classe pour réactiver le filtre
        }
    });
});

document.addEventListener('DOMContentLoaded', function () {
    const sidebar = document.getElementById('sidebar');
    const collapseBtn = document.getElementById('btn-collapse');
    const logoDiv = document.querySelector('.pro-sidebar-logo div');

    function toggleSidebar() {
        sidebar.classList.toggle('collapsed');
        sidebar.classList.add('transitioning');
        setTimeout(() => {
            sidebar.classList.remove('transitioning');
        }, 300);
    }

    if (sidebar && collapseBtn) {
        collapseBtn.addEventListener('click', toggleSidebar);
    }
    if (logoDiv) {
        logoDiv.addEventListener('click', function() {
            if (sidebar.classList.contains('collapsed')) {
                toggleSidebar();
            }
        });
    }
});

// Charger les discussions de l'utilisateur dans la sidebar
async function loadDiscussions() {
    const token = sessionStorage.getItem('authToken');
    const email = sessionStorage.getItem('userEmail');

    if (!token || !email) {
        return;
    }

    try {
        const userResponse = await fetch(`/user?email=${encodeURIComponent(email)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const userData = await userResponse.json();

        if (!userData || !userData.id) return;

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

        // Vérifier s'il y a une nouvelle conversation à ajouter
        const newConvString = localStorage.getItem('newConversation');
        if (newConvString) {
            const newConv = JSON.parse(newConvString);

            // Vérifier si la conversation n'est pas déjà dans la liste
            const exists = conversations.some(conv => conv.id === newConv.id);
            if (!exists) {
                conversations.unshift(newConv);
            }

            // Supprimer du localStorage pour ne pas l'ajouter à nouveau
            localStorage.removeItem('newConversation');
        }

        const discussionsList = document.getElementById('discussions-list');
        if (!discussionsList) {
            return;
        }

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
                    <a href="#" class="dropdown-item" data-action="share">
                        <i class="ri-share-line"></i>
                        <span>Partager la conversation</span>
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

// Variable pour éviter les appels multiples
let isLoadingDiscussions = false;

async function safeLoadDiscussions() {
    if (isLoadingDiscussions) {
        return;
    }
    isLoadingDiscussions = true;
    await loadDiscussions();
    isLoadingDiscussions = false;
}

// Fonction pour gérer le toggle du menu d'options
function toggleDiscussionMenu(conversationId) {
    const menu = document.querySelector(`.discussion-dropdown-menu[data-conversation-id="${conversationId}"]`);
    const button = document.querySelector(`.discussion-options-btn[data-conversation-id="${conversationId}"]`);
    if (!menu || !button) return;

    // Fermer tous les autres menus
    document.querySelectorAll('.discussion-dropdown-menu.show').forEach(m => {
        if (m !== menu) m.classList.remove('show');
    });

    // Si on ouvre le menu, calculer sa position
    if (!menu.classList.contains('show')) {
        const buttonRect = button.getBoundingClientRect();
        const sidebar = document.getElementById('sidebar');
        const sidebarRect = sidebar.getBoundingClientRect();

        // Positionner le menu à droite de la sidebar
        menu.style.left = `${sidebarRect.right + 8}px`;
        menu.style.top = `${buttonRect.top + buttonRect.height / 2}px`;
        menu.style.transform = 'translateY(-50%)';
    }

    menu.classList.toggle('show');
}

// Fonction pour supprimer une conversation
async function deleteConversation(conversationId) {
    const token = sessionStorage.getItem('authToken');

    if (!token) {
        showError('Vous devez être connecté pour supprimer une conversation');
        return;
    }

    if (!confirm('Êtes-vous sûr de vouloir supprimer cette conversation ?')) {
        return;
    }

    try {
        const response = await fetch(`/conversations/${conversationId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            showSuccess('Conversation supprimée avec succès');

            // Vérifier si on est sur la conversation supprimée
            const urlParams = new URLSearchParams(window.location.search);
            const currentConvId = urlParams.get('conversationId');

            if (currentConvId && parseInt(currentConvId) === parseInt(conversationId)) {
                // Rediriger vers la page begin si on supprime la conversation actuelle
                window.location.href = '/begin';
                return;
            }

            // Sinon recharger la liste des discussions
            await loadDiscussions();
        } else {
            showError('Erreur lors de la suppression de la conversation');
        }
    } catch (error) {
        console.error('Erreur:', error);
        showError('Erreur lors de la suppression de la conversation');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(safeLoadDiscussions, 100);
});

// Recharger les discussions quand on navigue vers la page
window.addEventListener('pageshow', function() {
    setTimeout(safeLoadDiscussions, 100);
});

// Event delegation pour les boutons d'options et les actions
document.addEventListener('click', function(e) {
    // Gérer le clic sur un lien de discussion
    const discussionLink = e.target.closest('.discussion-link');
    if (discussionLink) {
        e.preventDefault();
        const conversationId = discussionLink.dataset.conversationId;
        if (conversationId) {
            // Stocker l'ID de la conversation et rediriger vers /chat
            localStorage.setItem('currentConversationId', conversationId);
            window.location.href = `/chat?conversationId=${conversationId}`;
        }
        return;
    }

    // Gérer le clic sur le bouton d'options
    const optionsBtn = e.target.closest('.discussion-options-btn');
    if (optionsBtn) {
        e.stopPropagation();
        const conversationId = optionsBtn.dataset.conversationId;
        toggleDiscussionMenu(conversationId);
        return;
    }

    // Gérer le clic sur une action du menu
    const dropdownItem = e.target.closest('.discussion-dropdown-menu .dropdown-item');
    if (dropdownItem) {
        e.preventDefault();
        e.stopPropagation();

        const menu = dropdownItem.closest('.discussion-dropdown-menu');
        const conversationId = menu.dataset.conversationId;
        const action = dropdownItem.dataset.action;

        // Fermer le menu
        menu.classList.remove('show');

        // Exécuter l'action
        if (action === 'delete') {
            deleteConversation(conversationId);
        } else if (action === 'edit') {
            const titleEl = document.querySelector(`.discussion-link[data-conversation-id="${conversationId}"] .menu-title`);
            const currentTitle = titleEl ? titleEl.textContent : '';
            openRenameModal(conversationId, currentTitle);
        } else if (action === 'archive') {
            archiveConversation(conversationId);
        } else if (action === 'share') {
            showError('Fonctionnalité en développement');
        }
        return;
    }

    // Fermer tous les menus si on clique ailleurs
    const clickedInsideMenu = e.target.closest('.discussion-dropdown-menu');
    if (!clickedInsideMenu) {
        document.querySelectorAll('.discussion-dropdown-menu.show').forEach(menu => {
            menu.classList.remove('show');
        });
    }
});

// ─── ARCHIVE ────────────────────────────────────────────────────────────────

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

        // Si on est sur cette conversation, rediriger
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
        await openArchiveModal(); // rafraîchir la liste
        await safeLoadDiscussions();
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

// ─── RENAME TITRE ─────────────────────────────────────────────────────────────────

let _renameConversationId = null;

function openRenameModal(conversationId, currentTitle) {
    _renameConversationId = conversationId;
    const modal = document.getElementById('renameModal');
    const input = document.getElementById('rename-input');
    if (!modal || !input) return;

    input.value = currentTitle || '';
    modal.style.display = 'flex';
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

// ─── Init listeners archive + rename ────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
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

    // Valider avec Entrée
    const renameInput = document.getElementById('rename-input');
    if (renameInput) {
        renameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') renameConversation();
            if (e.key === 'Escape') closeRenameModal();
        });
    }
});