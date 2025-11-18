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
        userBtn.onclick = () => {
            console.log('Profil utilisateur cliqué');
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
