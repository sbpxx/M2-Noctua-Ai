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

async function updateNavBar(){
    const isValidToken = await verifyToken();

    if(isValidToken === true){
        document.querySelector('.btn_login').style.display = 'none';
        document.querySelector('.btn_compte').style.display = 'block';
    }
    else{
        document.querySelector('.btn_login').style.display = 'block';
        document.querySelector('.btn_compte').style.display = 'none';
    }
}