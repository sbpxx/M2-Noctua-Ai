// partial.js

document.addEventListener('DOMContentLoaded', function() {


    


    updateNavBar();


    // Sélectionner les éléments de navigation
    const accueilNav = document.getElementById('accueil');
    const begin = document.getElementById('begin');
    const startChatBtn = document.getElementById('start-chat-btn');

    // Ajouter des écouteurs d'événements pour les éléments de navigation
    if (accueilNav) {
        accueilNav.addEventListener('click', function() {
            window.location.href = '/'; // Rediriger vers la page d'accueil
        });
    }


    if (begin) {
        begin.addEventListener('click', function() {
            window.location.href = 'begin'; // Rediriger vers la page "Begin"
        });
    }

    if (startChatBtn) {
        startChatBtn.addEventListener('click', function() {
            window.location.href = 'chat'; // Rediriger vers la page "Chat"
        });
    }

    //Si il fait un click peut importe ou sur on verifier le jeton
    window.addEventListener('click', function() {
        updateNavBar();
    });

    

    const loginModal = document.getElementById('loginModal');
    const registerModal = document.getElementById('registerModal');
    const loginButton = document.querySelector('.btn_login');
    const registerLink = document.querySelector('.register_link');
    const loginLink = document.querySelector('.login_link');
    const closeModalButtons = document.querySelectorAll('.close-modal');
    const images = document.querySelectorAll('.grid-container img');
    

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
                    // Stocker le nom de l'utilisateur dans sessionStorage
                    sessionStorage.setItem('userName', userData.nom);
                })
                .catch((error) => {
                    console.error('Error:', error);
                    showError(error.message, 3000);
                });

                showSuccess('Connexion réussie. Bienvenue!', 3000);
                updateNavBar();
                // Fermer le modal
                loginModal.style.display = 'none';
                verifyToken();
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

// event pour envoyer des messages
if (document.getElementById('send-btn')) {
    document.getElementById('send-btn').addEventListener('click', () => {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        if (message) {
            addMessageBubble(message, 'user');
            input.value = '';
        }
    });
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('send-btn').click();
        }
    });
}