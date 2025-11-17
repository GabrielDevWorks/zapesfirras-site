document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    const passwordInput = document.getElementById('password');
    const togglePassword = document.getElementById('toggle-password');

    // Lógica para visualizar a senha
    togglePassword.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        
        // Troca o ícone
        togglePassword.setAttribute('name', type === 'password' ? 'eye-outline' : 'eye-off-outline');
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessage.textContent = '';

        const username = document.getElementById('username').value;
        const password = passwordInput.value;

        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Erro ao tentar fazer login.');
            }

            sessionStorage.setItem('adminAuthToken', data.token);
            sessionStorage.setItem('loggedInUser', data.admin.username);

            window.location.href = 'admin.html';

        } catch (error) {
            errorMessage.textContent = error.message;
        }
    });
});