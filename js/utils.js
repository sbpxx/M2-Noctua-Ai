function showError(message, duration) {
    const errorContainer = document.querySelector('.error-container');
    const errorMessage = document.querySelector('.error-message p');

    if (errorContainer && errorMessage) {
        errorMessage.textContent = message;
        errorContainer.style.display = 'block';

        // Masquer le message d'erreur après le délai spécifié
        setTimeout(() => {
            errorContainer.style.display = 'none';
        }, duration);
    } else {
        console.error('Error container or message element not found');
    }
}

function showSuccess(message, duration) {
    const successContainer = document.querySelector('.success-container');
    const successMessage = document.querySelector('.success-message p');

    if (successContainer && successMessage) {
        successMessage.textContent = message;
        successContainer.style.display = 'block';

        // Masquer le message de succès après le délai spécifié
        setTimeout(() => {
            successContainer.style.display = 'none';
        }, duration);
    } else {
        console.error('Success container or message element not found');
    }
}

// Fonction pour vérifier le JWT
async function verifyToken() {
    const token = sessionStorage.getItem('authToken');
    if (!token) {
        console.error('Jeton non trouvé. Veuillez vous connecter.');
        return false;
    }

    try {
        const response = await fetch('/protected', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }

        const data = await response.json();
        console.log('Jeton valide. Accès autorisé.');
        return true;
    } catch (error) {
        console.error('Error:', error);
        return false;
    }
}

// info de connexion dans la console
async function updateInfo() {
    const token = sessionStorage.getItem('authToken');
    const userName = sessionStorage.getItem('userName');

    console.log('=== Informations de connexion ===');

    if (!token) {
        console.log('État de connexion: NON CONNECTÉ');
        console.log('Nom d\'utilisateur: Aucun');
        console.log('Token JWT: Aucun');
        updateUserButton(false, null);
        return;
    }

    // validité du token
    const isValid = await verifyToken();

    if (isValid) {
        console.log('État de connexion: CONNECTÉ ');
        console.log('Nom d\'utilisateur:', userName || 'Non disponible');
        console.log('Token JWT:', token.substring(0, 20) + '...');
        updateUserButton(true, userName);
    } else {
        console.log('État de connexion: TOKEN INVALIDE/EXPIRÉ');
        console.log('Nom d\'utilisateur:', userName || 'Non disponible');
        console.log('Token JWT: Invalide ou expiré');
        updateUserButton(false, null);
    }

    console.log('================================');
}

// fonction pour mettre à jour le bouton utilisateur dans la sidebar
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
            if (loginModal) {
                loginModal.style.display = 'flex';
            }
        };
    }
}

// fonction pour afficher/masquer le menu déroulant
function toggleDropdownMenu() {
    const dropdownMenu = document.getElementById('user-dropdown-menu');
    if (!dropdownMenu) return;

    dropdownMenu.classList.toggle('show');
}

// fonction pour fermer le menu déroulant si on clique ailleurs
document.addEventListener('click', (e) => {
    const dropdownMenu = document.getElementById('user-dropdown-menu');
    const userBtn = document.getElementById('user-connection-btn');

    if (dropdownMenu && !userBtn?.contains(e.target) && !dropdownMenu.contains(e.target)) {
        dropdownMenu.classList.remove('show');
    }
});

// fonction pour gérer la déconnexion
function handleLogout() {
    // Supprimer les informations de session
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('userName');
    sessionStorage.removeItem('userEmail');
    sessionStorage.removeItem('userAdmin');

    // Fermer le menu déroulant
    const dropdownMenu = document.getElementById('user-dropdown-menu');
    if (dropdownMenu) {
        dropdownMenu.classList.remove('show');
    }

    // Mettre à jour l'interface
    updateUserButton(false, null);

    // Afficher un message de succès
    showSuccess('Vous avez été déconnecté avec succès', 3000);

    console.log('Déconnexion réussie');

    // Rediriger vers begin si on est sur la page chat
    if (window.location.pathname === '/chat') {
        setTimeout(() => {
            window.location.href = '/begin';
        }, 1500);
    }
}

// Attacher l'événement de déconnexion au bouton
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleLogout();
        });
    }

    // Gestion de l'ouverture de la modale paramètres
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openSettingsModal();
        });
    }

    // Gestion de la navigation dans les paramètres
    initSettingsNavigation();
});

// fonction pour ouvrir la modale paramètres
function openSettingsModal() {
    const settingsModal = document.getElementById('settingsModal');
    const dropdownMenu = document.getElementById('user-dropdown-menu');
    const adminMenu = document.getElementById('settings-admin-menu');

    if (settingsModal) {
        settingsModal.style.display = 'flex';
    }

    // Afficher/masquer le menu Administration selon le statut admin
    const isAdmin = sessionStorage.getItem('userAdmin') === 'true';
    if (adminMenu) {
        adminMenu.style.display = isAdmin ? 'flex' : 'none';
    }

    // Fermer le menu déroulant
    if (dropdownMenu) {
        dropdownMenu.classList.remove('show');
    }
}

// fonction pour initialiser la navigation dans les paramètres
function initSettingsNavigation() {
    const menuItems = document.querySelectorAll('.settings-menu-item');
    const sections = document.querySelectorAll('.settings-section');

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            // Récupérer la section à afficher
            const sectionId = item.getAttribute('data-section');

            // Retirer la classe active de tous les éléments
            menuItems.forEach(mi => mi.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));

            // Ajouter la classe active à l'élément cliqué
            item.classList.add('active');

            // Afficher la section correspondante
            const targetSection = document.getElementById(`section-${sectionId}`);
            if (targetSection) {
                targetSection.classList.add('active');
            }
        });
    });
}
