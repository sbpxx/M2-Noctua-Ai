document.addEventListener('DOMContentLoaded', function() {
    const btnContinueGuest = document.getElementById('btn-continue-guest');
    const btnContinueGuestRegister = document.getElementById('btn-continue-guest-register');

    if (btnContinueGuest) {
        btnContinueGuest.addEventListener('click', function() {
            document.getElementById('loginModal').style.display = 'none';
            window.location.href = '/begin';
        });
    }

    if (btnContinueGuestRegister) {
        btnContinueGuestRegister.addEventListener('click', function() {
            document.getElementById('registerModal').style.display = 'none';
            window.location.href = '/begin';
        });
    }
});