document.addEventListener('DOMContentLoaded', function () {
    const textarea = document.getElementById('user-input');
    if (textarea) {
        textarea.addEventListener('input', function () {
            this.style.height = 'auto';
            let newHeight = Math.min(this.scrollHeight, 800);
            this.style.height = newHeight + 'px';
        });
    }
});