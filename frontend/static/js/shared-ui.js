/**
 * @param {string} message A mensagem a ser exibida.
 * @param {string} type O tipo de notificação ('success', 'error', 'loading').
 */
function showNotification(message, type = 'success') {
    const notifArea = document.getElementById('notification-area');
    
    
    const notif = notifArea ? null : document.getElementById('notificacao');
    const notifText = notifArea ? null : document.getElementById('texto-notificacao');

    if (notifArea) {
        const notification = document.createElement('div');
        notification.className = `notification-message ${type}`;
        notification.textContent = message;
        notifArea.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            notification.addEventListener('transitionend', () => notification.remove());
        }, 3000);
    } else if (notif && notifText) {
        notif.className = `notificacao ${type}`;
        notifText.textContent = message;
        notif.classList.add('mostrar');
        setTimeout(() => {
            notif.classList.remove('mostrar');
        }, 3000);
    }
}


document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('authToken');
    const customerInfo = JSON.parse(localStorage.getItem('customerInfo'));

    const botaoContaDesktop = document.getElementById('botao-conta-desktop');
    const infoUsuarioDesktop = document.getElementById('info-usuario-desktop');
    const nomeUsuarioDesktop = document.getElementById('nome-usuario-desktop');
    const botaoLogoutDesktop = document.getElementById('botao-logout-desktop');
    const botaoPerfilMobileLink = document.getElementById('botao-perfil-mobile');
    const botaoPerfilMobileText = botaoPerfilMobileLink ? botaoPerfilMobileLink.querySelector('.bottom-nav-text') : null;

    const btnsAbrirCarrinho = document.querySelectorAll('#botao-carrinho-mobile, #botao-carrinho-desktop');
    const contadorCarrinhoDesktop = document.getElementById('contador-carrinho-desktop');
    const contadorCarrinhoMobile = document.getElementById('contador-carrinho-mobile');

    const logout = () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('customerInfo');
        
        showNotification('Saindo...', 'loading');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 500);
    };

  const gerenciarEstadoLogin = () => {
    const token = localStorage.getItem('authToken');
    const customerInfo = JSON.parse(localStorage.getItem('customerInfo'));

    const botaoContaDesktop = document.getElementById('botao-conta-desktop');
    const infoUsuarioDesktop = document.getElementById('info-usuario-desktop');
    const nomeUsuarioDesktop = document.getElementById('nome-usuario-desktop');
    const botaoLogoutDesktop = document.getElementById('botao-logout-desktop');
    const botaoPerfilMobileLink = document.getElementById('botao-perfil-mobile');
    const botaoPerfilMobileText = botaoPerfilMobileLink ? botaoPerfilMobileLink.querySelector('.bottom-nav-text') : null;

    if (token && customerInfo) {
        
        if (botaoContaDesktop) botaoContaDesktop.style.display = 'none';
        if (infoUsuarioDesktop) infoUsuarioDesktop.style.display = 'flex';
        
        
        if (nomeUsuarioDesktop && customerInfo.nome) {
            nomeUsuarioDesktop.textContent = `Olá, ${customerInfo.nome.split(' ')[0]}!`;
        }

        if (botaoPerfilMobileText) botaoPerfilMobileText.textContent = 'Minha Conta';
        if (botaoPerfilMobileLink) botaoPerfilMobileLink.href = 'perfil.html';

        if (botaoLogoutDesktop) botaoLogoutDesktop.addEventListener('click', logout);

        
        if (customerInfo.isAdmin) {
            const navLinksDesktop = document.querySelector('.menu-navegacao .nav-links');
            const bottomNav = document.querySelector('.bottom-nav');

            
            if (navLinksDesktop && !navLinksDesktop.querySelector('.btn-admin')) {
                const adminLi = document.createElement('li');
                
                adminLi.innerHTML = `<a href="static/admin/login.html" class="btn-admin">PAINEL ADMIN</a>`;
                navLinksDesktop.appendChild(adminLi);
            }

            
            if (bottomNav && !bottomNav.querySelector('.btn-admin-mobile')) {
                const adminButtonMobile = document.createElement('a');
                
                adminButtonMobile.href = 'static/admin/login.html';
                adminButtonMobile.classList.add('bottom-nav-item', 'btn-admin-mobile');
                adminButtonMobile.innerHTML = `
                    <ion-icon name="cog-outline"></ion-icon>
                    <span class="bottom-nav-text">Admin</span>
                `;
                if (botaoPerfilMobileLink) {
                    bottomNav.insertBefore(adminButtonMobile, botaoPerfilMobileLink);
                } else {
                     bottomNav.appendChild(adminButtonMobile);
                }
            }
        }
        

    } else {
        
        if (botaoContaDesktop) botaoContaDesktop.style.display = 'flex';
        if (infoUsuarioDesktop) infoUsuarioDesktop.style.display = 'none';

        if (botaoPerfilMobileText) botaoPerfilMobileText.textContent = 'Perfil';
        if (botaoPerfilMobileLink) botaoPerfilMobileLink.href = 'login-cliente.html';
    }
};

    const atualizarContadorCarrinho = () => {
        const carrinho = JSON.parse(localStorage.getItem('carrinhoZapEsfirras')) || [];
        const totalItens = carrinho.reduce((acc, item) => acc + item.quantity, 0);

        if (contadorCarrinhoDesktop) {
            contadorCarrinhoDesktop.textContent = totalItens;
            contadorCarrinhoDesktop.classList.toggle('ativo', totalItens > 0);
        }
        if (contadorCarrinhoMobile) {
            contadorCarrinhoMobile.textContent = totalItens;
            contadorCarrinhoMobile.classList.toggle('ativo', totalItens > 0);
        }
    };

    btnsAbrirCarrinho.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            
            
            if (window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/') || window.location.pathname.endsWith('/frontend/')) {
                
                if (typeof togglePainelCarrinho === 'function') {
                    togglePainelCarrinho(true); 
                }
            } else {
                
                window.location.href = 'index.html';
            }
        });
    });


    const searchButtonDesktop = document.querySelector('.acoes-navegacao .botao-pesquisa');
    const searchBoxDesktop = document.querySelector('.acoes-navegacao .caixa-pesquisa');
    const searchInputDesktop = document.querySelector('.acoes-navegacao .texto-pesquisa');

    if (searchButtonDesktop && searchBoxDesktop && searchInputDesktop) {
        searchButtonDesktop.addEventListener('click', (e) => {
            e.preventDefault(); 
            searchBoxDesktop.classList.toggle('ativo'); 

            
            if (searchBoxDesktop.classList.contains('ativo')) {
                searchInputDesktop.focus();
            }
        });

        
        document.addEventListener('click', (e) => {
            if (!searchBoxDesktop.contains(e.target) && searchBoxDesktop.classList.contains('ativo')) {
                searchBoxDesktop.classList.remove('ativo');
            }
        });
    }
    
    
    gerenciarEstadoLogin();
    atualizarContadorCarrinho();
});