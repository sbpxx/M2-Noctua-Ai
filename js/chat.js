document.addEventListener('DOMContentLoaded', function() {
    const sidebar = document.getElementById("sidebar");
    const collapseBtn = document.getElementById("btn-collapse");
    const submenuLinks = document.querySelectorAll(".menu-item.sub-menu > a");

    // Ouverture/fermeture de la sidebar
    collapseBtn.addEventListener("click", () => {
        sidebar.classList.toggle("collapsed");
    });

    // Ouverture/fermeture des sous-menus
    submenuLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const parent = link.parentElement;
            parent.classList.toggle("open");
        });
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
});