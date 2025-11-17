

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    const resetPasswordForm = document.getElementById('reset-password-form');
    const API_BASE_URL = '';



function validarCPF(cpf) {
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf === '') return false;
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    let soma = 0;
    let resto;
    for (let i = 1; i <= 9; i++) soma = soma + parseInt(cpf.substring(i - 1, i)) * (11 - i);
    resto = (soma * 10) % 11;
    if ((resto === 10) || (resto === 11)) resto = 0;
    if (resto !== parseInt(cpf.substring(9, 10))) return false;
    soma = 0;
    for (let i = 1; i <= 10; i++) soma = soma + parseInt(cpf.substring(i - 1, i)) * (12 - i);
    resto = (soma * 10) % 11;
    if ((resto === 10) || (resto === 11)) resto = 0;
    if (resto !== parseInt(cpf.substring(10, 11))) return false;
    return true;
}

function showNotification(message, type = 'success') {
    const notif = document.getElementById('notificacao');
    const notifText = document.getElementById('texto-notificacao');
    if (!notif || !notifText) return;

    notif.className = `notificacao ${type}`;
    notifText.textContent = message;
    notif.classList.add('mostrar');

    setTimeout(() => {
        notif.classList.remove('mostrar');
    }, 3000);
}
    if (loginForm) {
    const errorMessageEl = document.getElementById('error-message');
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessageEl.textContent = '';

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/customers/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Erro ao fazer login.');
            }

            localStorage.setItem('authToken', data.token);
            localStorage.setItem('customerInfo', JSON.stringify(data.customerInfo)); 

            window.location.href = 'index.html';

        } catch (error) {
            errorMessageEl.textContent = error.message;
        }
    });
}

if (registerForm) {
    const errorMessageEl = document.getElementById('error-message');
    const cpfInput = document.getElementById('cpf');
    const phoneInput = document.getElementById('phone');
    const submitButton = registerForm.querySelector('button[type="submit"]');

    if (cpfInput) {
        cpfInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            value = value.slice(0, 11);
            value = value.replace(/(\d{3})(\d)/, '$1.$2');
            value = value.replace(/(\d{3})(\d)/, '$1.$2');
            value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
            e.target.value = value;
        });
    }

    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            value = value.slice(0, 11); 
            if (value.length > 2) {
                value = `(${value.substring(0, 2)}) ${value.substring(2)}`;
            }
            if (value.length > 9) { 
                value = value.replace(/(\d{5})(\d)/, '$1-$2');
            } else if (value.length > 8) { 
                 value = value.replace(/(\d{4})(\d)/, '$1-$2');
            }
            e.target.value = value;
        });
    }

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessageEl.textContent = '';
        errorMessageEl.style.color = ''; 
        

        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const phone = document.getElementById('phone').value.replace(/\D/g, '');
        const password = document.getElementById('password').value;
        const passwordConfirm = document.getElementById('password-confirm').value;
        const cpf = document.getElementById('cpf').value.replace(/\D/g, '');

        if (phone.length < 10) { 
            errorMessageEl.textContent = 'Por favor, insira um número de telefone válido com DDD.';
            return;
        }
        if (!validarCPF(cpf)) {
            errorMessageEl.textContent = 'O CPF inserido não é válido. Verifique os dígitos.';
            return;
        }
        if (password !== passwordConfirm) {
            errorMessageEl.textContent = 'As senhas não coincidem.';
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Cadastrando...';
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/customers/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, phone, password, cpf })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || 'Ocorreu um erro.');
            }

            errorMessageEl.style.color = 'var(--success-color)';
            errorMessageEl.textContent = 'Cadastro realizado com sucesso! Redirecionando...';
            
            setTimeout(() => {
                window.location.href = 'login-cliente.html';
            }, 2000);

        } catch (error) {
            errorMessageEl.textContent = error.message;
            submitButton.disabled = false;
            submitButton.textContent = 'Finalizar Cadastro';
        }
    });

}
    if (forgotPasswordForm) {
        const messageEl = document.getElementById('message');
        forgotPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            messageEl.textContent = 'Enviando...';
            messageEl.style.color = 'var(--text-secondary-light)';

            const email = document.getElementById('email').value;

            try {
                const response = await fetch('/api/customers/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await response.json();
                if (!response.ok) { throw new Error(data.message); }
                messageEl.style.color = 'var(--success-color)';
                messageEl.textContent = data.message;
            } catch (error) {
                messageEl.style.color = 'var(--primary-color)';
                messageEl.textContent = error.message;
            }
        });
    }

    if (resetPasswordForm) {
        const errorMessageEl = document.getElementById('error-message');
        resetPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorMessageEl.textContent = '';

            const password = document.getElementById('password').value;
            const passwordConfirm = document.getElementById('password-confirm').value;

            if (password !== passwordConfirm) {
                errorMessageEl.textContent = 'As senhas não coincidem.';
                return;
            }

            const params = new URLSearchParams(window.location.search);
            const token = params.get('token');

            if (!token) {
                errorMessageEl.textContent = 'Token de redefinição não encontrado ou inválido. Por favor, solicite um novo link.';
                return;
            }

            try {
                const response = await fetch('/api/customers/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, password })
                });
                const data = await response.json();
                if (!response.ok) { throw new Error(data.message); }
                alert(data.message);
                window.location.href = 'login-cliente.html';
            } catch (error) {
                errorMessageEl.textContent = error.message;
            }
        });
    }
    
    const passwordToggles = document.querySelectorAll('.password-toggle-icon');
    passwordToggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            const inputWrapper = toggle.closest('.input-wrapper');
            const passwordInput = inputWrapper.querySelector('input');
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                toggle.setAttribute('name', 'eye-off-outline');
            } else {
                passwordInput.type = 'password';
                toggle.setAttribute('name', 'eye-outline');
            }
        });
    });

const modalTriggers = document.querySelectorAll('.modal-trigger');
modalTriggers.forEach(trigger => {
    trigger.addEventListener('click', (e) => {
        e.preventDefault(); 
        
        e.stopPropagation(); 
        
        const modalId = trigger.dataset.modalTarget;
        const modal = document.getElementById(modalId);
        
        if (modal) {
            modal.classList.add('active');
        }
    });
});

const modalOverlays = document.querySelectorAll('.modal-overlay');
modalOverlays.forEach(overlay => {
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            overlay.classList.remove('active');
        }
    });
});

const modalCloseBtns = document.querySelectorAll('.modal-close-btn');
modalCloseBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        btn.closest('.modal-overlay').classList.remove('active');
    });
});
});