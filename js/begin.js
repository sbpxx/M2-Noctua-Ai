// begin.js
// Point d'entrée quand l'utilisateur veut créer une nouvelle conversation.
// Gère le textarea de saisie initiale et la création de conversation via l'API.

document.addEventListener('DOMContentLoaded', function () {
    const textarea = document.getElementById('user-input');
    const startChatBtn = document.getElementById('start-chat-btn');

    // Le textarea grandit automatiquement jusqu'à 800px pour s'adapter
    // au message sans dépasser l'écran
    if (textarea) {
        textarea.addEventListener('input', function () {
            this.style.height = 'auto';
            let newHeight = Math.min(this.scrollHeight, 800);
            this.style.height = newHeight + 'px';
        });
    }

    if (startChatBtn) {
        startChatBtn.addEventListener('click', async function () {
            const message = textarea.value.trim();
            if (!message) {
                showError('Veuillez saisir un message', 2000);
                return;
            }

            const token = sessionStorage.getItem('authToken');
            const email = sessionStorage.getItem('userEmail');

            let userId = null;

            // Vérification si l'utilisateur est connecté
            // On récupère son ID depuis l'API pour l'associer à la conversation
            if (token && email) {
                try {
                    const userResponse = await fetch(`/user?email=${encodeURIComponent(email)}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (userResponse.ok) {
                        const userData = await userResponse.json();
                        userId = userData.id;
                    } else {
                        // Token invalide ou expiré, on nettoie la session
                        sessionStorage.removeItem('authToken');
                        sessionStorage.removeItem('userEmail');
                        sessionStorage.removeItem('userName');
                    }
                } catch (err) {
                    console.error('Erreur vérification utilisateur:', err);
                }
            }

            // Si pas connecté, on génère un identifiant de session invité local
            if (!userId) {
                getGuestSessionId();
            }

            try {
                // user_id est null pour les invités : le backend crée quand même la conversation
                const convResponse = await fetch('/conversations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: userId,
                        first_message: message
                    })
                });

                if (!convResponse.ok) {
                    throw new Error('Erreur création conversation');
                }

                const convData = await convResponse.json();

                if (userId) {
                    // Utilisateur connecté : on mémorise la nouvelle conversation
                    // pour l'afficher en tête de liste dans la sidebar au prochain chargement
                    localStorage.setItem('newConversation', JSON.stringify(convData));
                    localStorage.setItem('currentConversationId', convData.id);
                } else {
                    // Invité : on stocke en sessionStorage
                    sessionStorage.setItem('guestConversationId', convData.id);
                    localStorage.setItem('currentConversationId', convData.id);
                }

                window.location.href = '/chat?conversationId=' + convData.id;
            } catch (err) {
                console.error('begin.js - Erreur:', err);
                showError('Erreur lors de la création de la conversation', 3000);
            }
        });
    }
});
