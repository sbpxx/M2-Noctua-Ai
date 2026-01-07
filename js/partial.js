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
            // sinon, afficher le modal de connexion
            showLoginModal();
        });
    }

    // NOTE: L'écouteur pour start-chat-btn a été supprimé car il est géré dans begin.js
    // qui crée la conversation avant de rediriger vers /chat

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


    function registerAccount() {
        console.log('registerAccount');
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

        console.log('Sending data:', data);

        fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => { throw new Error(data.error); });
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                showError(data.error, 3000);
            } else {
                // Rediriger vers la page de connexion ou une autre page
                window.location.href = '/';
            }
        })
        .catch((error) => {
            console.error('Error:', error);
            showError(error.message, 3000);
        });
    }






    // Fonction pour se connecter
    const btn_login = document.getElementById('btn-login');

    if(btn_login){
        btn_login.addEventListener('click', connectAccount);
    }
    

    
    function connectAccount() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const data = { email: email, password: password };

        fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => { throw new Error(data.error); });
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                showError(data.error, 3000);
            } else {
                // Stocker le jeton dans sessionStorage
                sessionStorage.setItem('authToken', data.token);
                
                // Récupérer les informations de l'utilisateur
                fetch(`/user?email=${encodeURIComponent(email)}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${data.token}`
                    }
                })
                .then(response => {
                    if (!response.ok) {
                        return response.json().then(data => { throw new Error(data.error); });
                    }
                    return response.json();
                })
                .then(userData => {

                    sessionStorage.setItem('userName', userData.name);
                    sessionStorage.setItem('userEmail', userData.email);

                    showSuccess('Connexion réussie. Bienvenue!', 1500);

                    // Redirection
                    setTimeout(() => {
                        window.location.href = '/begin';
                    }, 1500);
                })
                .catch((error) => {
                    console.error('Error:', error);
                    showError(error.message, 3000);
                });
            }
        })
        .catch((error) => {
            showError(error.message, 3000);
        });
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

// fonction pour ajouter des bulles de messages
function addMessageBubble(message, sender = 'user') {
    const chatContainer = document.getElementById('chat-container');
    if (!chatContainer) return;
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${sender}`;
    bubble.textContent = message;
    chatContainer.appendChild(bubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// event pour envoyer des messages ( géré actuellement par socket.io )
// if (document.getElementById('send-btn')) {
//     document.getElementById('send-btn').addEventListener('click', () => {
//         const input = document.getElementById('chat-input');
//         const message = input.value.trim();
//         if (message) {
//             addMessageBubble(message, 'user');
//             input.value = '';
//         }
//     });
//     document.getElementById('chat-input').addEventListener('keydown', (e) => {
//         if (e.key === 'Enter') {
//             document.getElementById('send-btn').click();
//         }
//     });
// }

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

        const conversationsResponse = await fetch(`/conversations/user/${userData.id}`);
        const conversations = await conversationsResponse.json();

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
                <a href="#" class="discussion-link">
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
            // Recharger la liste des discussions
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
            showError('Fonctionnalité en développement');
        } else if (action === 'archive') {
            showError('Fonctionnalité en développement');
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