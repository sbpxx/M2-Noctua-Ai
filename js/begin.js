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
            if (!message) return;

            const token = sessionStorage.getItem('authToken');
            const email = sessionStorage.getItem('userEmail');

            if (!token || !email) return;

            try {
                console.log('begin.js - Envoi du message');
                const userResponse = await fetch(`/user?email=${encodeURIComponent(email)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!userResponse.ok) {
                    throw new Error('Erreur récupération utilisateur');
                }

                const userData = await userResponse.json();
                console.log('begin.js - userData:', userData);

                const convResponse = await fetch('/conversations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: userData.id,
                        first_message: message
                    })
                });

                if (!convResponse.ok) {
                    throw new Error('Erreur création conversation');
                }

                const convData = await convResponse.json();
                console.log('begin.js - conversation créée:', convData);
                console.log('begin.js - REDIRECTION DANS 500ms');

                // Attendre un peu avant de rediriger pour être sûr
                await new Promise(resolve => setTimeout(resolve, 500));

                console.log('begin.js - REDIRECTION MAINTENANT');
                window.location.href = '/chat';
            } catch (err) {
                console.error('begin.js - Erreur:', err);
            }
        });
    }
});