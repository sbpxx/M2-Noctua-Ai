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

    // Charger l'email de l'utilisateur dans les paramètres
    loadUserEmail();

    // Gérer l'affichage des champs de mot de passe
    initPasswordChange();
}

// fonction pour charger l'email de l'utilisateur
async function loadUserEmail() {
    const userEmail = sessionStorage.getItem('userEmail');
    const emailInput = document.getElementById('profile-email');

    if (emailInput && userEmail) {
        emailInput.value = userEmail;
    }
}

// fonction pour gérer le changement de mot de passe
function initPasswordChange() {
    const changePasswordBtn = document.getElementById('change-password-btn');
    const passwordFields = document.getElementById('password-fields');
    const confirmPasswordBtn = document.getElementById('confirm-password-btn');
    const passwordError = document.getElementById('password-error');

    if (changePasswordBtn && passwordFields) {
        changePasswordBtn.addEventListener('click', () => {
            // Afficher/masquer les champs de mot de passe
            if (passwordFields.style.display === 'none') {
                passwordFields.style.display = 'block';
                changePasswordBtn.textContent = 'Annuler';
            } else {
                passwordFields.style.display = 'none';
                changePasswordBtn.textContent = 'Modifier le mot de passe';
                // Réinitialiser les champs
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

            // Vérifier que tous les champs sont remplis
            if (!oldPassword || !newPassword || !confirmPassword) {
                passwordError.textContent = 'Veuillez remplir tous les champs';
                passwordError.style.display = 'block';
                return;
            }

            // Vérifier que les deux mots de passe correspondent
            if (newPassword !== confirmPassword) {
                passwordError.textContent = 'Les mots de passe ne correspondent pas';
                passwordError.style.display = 'block';
                return;
            }

            // Vérifier la longueur du mot de passe
            if (newPassword.length < 8) {
                passwordError.textContent = 'Le mot de passe doit contenir au moins 8 caractères';
                passwordError.style.display = 'block';
                return;
            }

            // Envoyer la requête au backend
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
                        oldPassword: oldPassword,
                        newPassword: newPassword
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    showSuccess('Mot de passe modifié avec succès', 3000);
                    // Réinitialiser les champs
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

// gestion invité 

function isGuestUser() {
    const token = sessionStorage.getItem('authToken');
    return !token || token === null;
}

function getGuestSessionId() {
    let guestId = sessionStorage.getItem('guestSessionId');
    if (!guestId) {
        guestId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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
    const guestConvId = sessionStorage.getItem('guestConversationId');
    return guestConvId === conversationId;
}

// Admin Panel

// Mettre à jour l'affichage du statut Mistral
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

// Récupérer le statut de Mistral
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

// Flag pour éviter les requêtes multiples
let mistralActionInProgress = false;

// Démarrer Mistral
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
            // Démarrage en cours, vérifier le statut après 10 secondes
            showSuccess(data.message, 5000);
            setTimeout(async () => {
                await getMistralStatus();
                mistralActionInProgress = false;
            }, 10000);
        } else {
            if (data.success) {
                showSuccess(data.message, 3000);
            } else {
                showError(data.message, 3000);
            }
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

// Arrêter Mistral
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

        if (data.success) {
            showSuccess(data.message, 3000);
        } else {
            showError(data.message, 3000);
        }
        updateMistralStatus(data.status);
    } catch (error) {
        console.error('Erreur arrêt Mistral:', error);
        showError('Erreur lors de l\'arrêt de Mistral', 3000);
        updateMistralStatus('unknown');
    } finally {
        mistralActionInProgress = false;
    }
}

// Initialiser les événements admin
function initAdminControls() {
    const startBtn = document.getElementById('start-mistral-btn');
    const stopBtn = document.getElementById('stop-mistral-btn');

    if (startBtn) {
        startBtn.addEventListener('click', startMistral);
    }
    if (stopBtn) {
        stopBtn.addEventListener('click', stopMistral);
    }
}

// Charger le statut Mistral quand on ouvre la section admin
document.addEventListener('DOMContentLoaded', () => {
    initAdminControls();

    // Observer les changements de section dans les paramètres
    const adminSection = document.getElementById('section-admin');
    if (adminSection) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.target.classList.contains('active')) {
                    getMistralStatus();
                }
            });
        });
        observer.observe(adminSection, { attributes: true, attributeFilter: ['class'] });
    }
});
