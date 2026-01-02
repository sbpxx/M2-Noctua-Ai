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
                const userResponse = await fetch(`/user?email=${encodeURIComponent(email)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!userResponse.ok) {
                    throw new Error('Erreur récupération utilisateur');
                }

                const userData = await userResponse.json();

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

                localStorage.setItem('newConversation', JSON.stringify(convData));

                window.location.href = '/chat';
            } catch (err) {
                console.error('begin.js - Erreur:', err);
            }
        });
    }
});