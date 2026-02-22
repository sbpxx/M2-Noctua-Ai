document.addEventListener('DOMContentLoaded', function () {
    const textarea = document.getElementById('user-input');
    const startChatBtn = document.getElementById('start-chat-btn');

    if (textarea) {
        textarea.addEventListener('input', function () {
            this.style.height = 'auto';
            let newHeight = Math.min(this.scrollHeight, 800);
            this.style.height = newHeight + 'px';
        });
    }

    if (startChatBtn) {
        startChatBtn.addEventListener('click', async function() {
            const message = textarea.value.trim();
            if (!message) {
                showError('Veuillez saisir un message', 2000);
                return;
            }

            const token = sessionStorage.getItem('authToken');
            const email = sessionStorage.getItem('userEmail');

            let userId = null;

            // vérfcation user connectéé
            if (token && email) {
                try {
                    const userResponse = await fetch(`/user?email=${encodeURIComponent(email)}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (userResponse.ok) {
                        const userData = await userResponse.json();
                        userId = userData.id;
                    } else {
                            sessionStorage.removeItem('authToken');
                        sessionStorage.removeItem('userEmail');
                        sessionStorage.removeItem('userName');
                    }
                } catch (err) {
                    console.error('Erreur vérification utilisateur:', err);
                }
            }

            // Générer session invité  si pas de connexion
            if (!userId) {
                getGuestSessionId();
            }

            try {
                // user_id null 
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
                    // Authentifié persistant
                    localStorage.setItem('newConversation', JSON.stringify(convData));
                    localStorage.setItem('currentConversationId', convData.id);
                } else {
                    // Invité éphémère
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