let listenersConfigurados = false;

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('authToken');
    const customerInfo = JSON.parse(localStorage.getItem('customerInfo'));

    if (!token || !customerInfo) {
        window.location.href = 'login-cliente.html';
        return;
    }

    const API_BASE_URL = '';;


    const formatCurrency = (value) => {
    return (parseFloat(value) || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
};

    let state = {
        userData: {},
        userAddresses: [],
        userOrders: [], 
    };



    const telaCarregamento = document.getElementById('tela-carregamento');
    const conteudoPrincipal = document.getElementById('conteudo-principal');
    const nomeUsuarioDesktop = document.getElementById('nome-usuario-desktop');
    const perfilNav = document.querySelector('.perfil-nav-links');
    const perfilNavSelectMobile = document.getElementById('perfil-nav-select-mobile');
    const perfilSecoes = document.querySelectorAll('.perfil-secao');
    
    const profileForm = document.getElementById('profile-form');
    const nameInput = document.getElementById('profile-name');
    const emailInput = document.getElementById('profile-email');
    const phoneInput = document.getElementById('profile-phone');
    const editButton = document.getElementById('edit-button');
    const saveButton = document.getElementById('save-button');
    const cancelButton = document.getElementById('cancel-button');
    
    const passwordForm = document.getElementById('password-form');
    
    const listaEnderecosContainer = document.getElementById('lista-enderecos-container');
    const addAddressBtn = document.getElementById('btn-novo-endereco');
    const addressModal = document.getElementById('address-modal-overlay');
    const closeAddressModalBtn = document.getElementById('close-address-modal');
    const cancelAddressModalBtn = document.getElementById('cancel-address-modal');
    const addressForm = document.getElementById('address-form');
    
    const logoutButtonDesktop = document.getElementById('botao-logout-desktop');
    const linkLogout = document.getElementById('link-logout');
    const contadorCarrinhoDesktop = document.getElementById('contador-carrinho-desktop');
    const contadorCarrinhoMobile = document.getElementById('contador-carrinho-mobile');
    const btnCarrinhoMobile = document.getElementById('botao-carrinho-mobile');


    function renderUserData() {
        if (nameInput) nameInput.value = state.userData.name || '';
        if (emailInput) emailInput.value = state.userData.email || '';
        if (phoneInput) phoneInput.value = state.userData.phone || '';
    }


async function renderZapPontosView() {
    const container = document.getElementById('secao-zappontos');
    if (!container) return;

    const customerPoints = state.userData.points || 0;
    
    container.innerHTML = `
        <h2><ion-icon name="ribbon-outline"></ion-icon> ZapPontos</h2>
        <div class="zapclube-summary">
            <p>Seu saldo de pontos</p>
            <div class="points-balance">${customerPoints}<span> pontos</span></div>
        </div>
        
        <div class="points-history-container">
            <h3>Seu Extrato de Pontos</h3>
            <div class="points-history-filters">
                <button class="filter-btn active" data-period="all">Tudo</button>
                <button class="filter-btn" data-period="today">Hoje</button>
                <button class="filter-btn" data-period="7days">Últimos 7 dias</button>
                <button class="filter-btn" data-period="30days">Últimos 30 dias</button>
                <button class="filter-btn" data-period="90days">Últimos 3 meses</button>
            </div>
            <div id="points-history-list"><p>Carregando histórico...</p></div>
        </div>

        <div class="rewards-container" style="margin-top: 30px;">
            <h3>Recompensas Disponíveis para Resgate</h3>
            <div id="rewards-list-container"><p>Carregando recompensas...</p></div>
        </div>
    `;

    await fetchAndRenderPointsHistory('all');

    try {
        const response = await fetch(`${API_BASE_URL}/api/rewards`);
        if (!response.ok) throw new Error('Falha ao buscar recompensas');
        
        const rewards = await response.json();
        const rewardsContainer = document.getElementById('rewards-list-container');

        if (rewards.length > 0) {
            rewardsContainer.innerHTML = rewards.map(reward => `
                <div class="reward-card-cliente ${customerPoints >= reward.points_cost ? 'unlocked' : 'locked'}">
                    <div class="reward-info">
                        <h4>${reward.name}</h4>
                        <p>${reward.description || ''}</p>
                    </div>
                    <div class="reward-cost">
                        <span>${reward.points_cost} Pts</span>
                        <button class="btn btn-primary btn-resgatar" data-reward-id="${reward.id}" ${customerPoints >= reward.points_cost ? '' : 'disabled'}>
                            ${customerPoints >= reward.points_cost ? 'Resgatar' : `Faltam ${reward.points_cost - customerPoints}`}
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            rewardsContainer.innerHTML = '<p>Nenhuma recompensa disponível no momento.</p>';
        }
    } catch (error) {
        console.error("Erro ao carregar recompensas:", error);
        const rewardsContainer = document.getElementById('rewards-list-container');
        if(rewardsContainer) rewardsContainer.innerHTML = '<p style="color: var(--primary-color);">Não foi possível carregar as recompensas.</p>';
    }
}


async function fetchAndRenderPointsHistory(period = 'all') {
    const historyContainer = document.getElementById('points-history-list');
    if (!historyContainer) return;

    historyContainer.innerHTML = '<p>Carregando histórico...</p>';

    try {
        const response = await fetch(`${API_BASE_URL}/api/customers/me/points-log?period=${period}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Falha ao buscar histórico de pontos.');
        
        const logs = await response.json();
        
        if (logs.length > 0) {
            historyContainer.innerHTML = logs.map(log => {
                const isEarned = log.points_change > 0;
                return `
                    <div class="history-entry">
                        <div class="history-entry-details">
                            <p>${log.description}</p>
                            <small>${new Date(log.created_at).toLocaleString('pt-BR')}</small>
                        </div>
                        <div class="history-entry-points ${isEarned ? 'earned' : 'spent'}">
                            ${isEarned ? '+' : ''}${log.points_change}
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            historyContainer.innerHTML = '<p>Nenhuma transação de pontos encontrada para este período.</p>';
        }
    } catch (error) {
        historyContainer.innerHTML = '<p>Não foi possível carregar o histórico de pontos.</p>';
    }
}
async function renderZapClubeView() {
    const container = document.getElementById('secao-zapclube');
    if (!container) {
        console.error("Container #secao-zapclube não encontrado.");
        return;
    }

    container.innerHTML = '<p>Carregando informações do ZapClube...</p>';

    try {
        const profileRes = await fetch(`${API_BASE_URL}/api/customers/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!profileRes.ok) throw new Error('Falha ao buscar dados do perfil.');
        state.userData = await profileRes.json();
        
        const isSubscriber = state.userData.is_club_subscriber;

        if (isSubscriber) {
            const couponsRes = await fetch(`${API_BASE_URL}/api/customers/me/coupons`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!couponsRes.ok) throw new Error('Falha ao buscar cupons.');
            const availableCoupons = await couponsRes.json();

            let couponsHTML = '<p>Você não possui cupons de assinante ativos este mês.</p>';
            if (availableCoupons.length > 0) {
                couponsHTML = availableCoupons.map(coupon => `
                    <div class="coupon-card ${coupon.is_used ? 'used' : ''}">
                        <div class="coupon-icon"><ion-icon name="ticket-outline"></ion-icon></div>
                        <div class="coupon-details">
                            <h4>${coupon.description}</h4>
                            <p>Use o código: <strong>${coupon.code}</strong></p>
                            <small>Válido até: ${new Date(coupon.expires_at).toLocaleDateString('pt-BR')}</small>
                        </div>
                        ${coupon.is_used ? '<div class="coupon-status">Utilizado</div>' : ''}
                    </div>
                `).join('');
            }

            container.innerHTML = `
                <div class="profile-card-interno">
                    <h2>Sua Assinatura</h2>
                    <p>Status: <strong style="color: green;">Ativo</strong></p>
                    <p>Sua assinatura será renovada em: <strong>${new Date(state.userData.subscription_expires_at).toLocaleDateString('pt-BR')}</strong></p>
                    <div class="form-actions">
                        <button id="cancel-subscription-btn" class="btn btn-secondary">Cancelar Assinatura</button>
                    </div>
                </div>
                <div class="profile-card-interno">
                    <h2>Meus Cupons ZapClube</h2>
                    <div class="coupons-list">
                        ${couponsHTML}
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="zapclube-pitch">
                    <h3>✨ Seja membro do ZapClube!</h3>
                    <p>Tenha acesso a um mundo de vantagens por um preço simbólico.</p>
                    <ul class="benefits-list">
                        <li><ion-icon name="star"></ion-icon> <strong>Pontos em Dobro</strong> em todos os pedidos.</li>
                        <li><ion-icon name="pricetag"></ion-icon> <strong>1 Cupom de 15% OFF</strong> todo mês.</li>
                        <li><ion-icon name="bicycle"></ion-icon> <strong>1 Entrega Grátis</strong> todo mês.</li>
                        <li><ion-icon name="gift"></ion-icon> <strong>1 Mimo do Mês</strong> (item grátis).</li>
                    </ul>
                    <div class="subscription-price">Apenas <strong>R$ 7,00</strong> / mês</div>
                    <button id="subscribe-zapclube-btn" class="btn btn-primary">Quero Assinar Agora!</button>
                    <div id="subscription-payment-brick-container" class="payment-brick-container"></div>
                </div>
            `;
        }
    } catch (error) {
        console.error("Erro ao carregar dados do ZapClube:", error);
        container.innerHTML = '<p style="color: var(--primary-color);">Não foi possível carregar seus benefícios. Tente recarregar a página.</p>';
    }
}


    async function redeemReward(rewardId) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/rewards/redeem`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ rewardId: rewardId })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Não foi possível resgatar a recompensa.');
            
            const rewardedItem = result.rewardedItem;
            if (!rewardedItem) throw new Error('Recompensa resgatada, mas o item não foi encontrado.');

            let carrinho = JSON.parse(localStorage.getItem('carrinhoZapEsfirras')) || [];
            const cartItem = {
                ...rewardedItem,
                price: 0,
                originalPrice: rewardedItem.price,
                quantity: 1,
                adicionais: [],
                observacao: "Item resgatado com ZapClube!",
                idUnico: `reward_${rewardedItem.id}_${Date.now()}`
            };
            
            carrinho.push(cartItem);
            localStorage.setItem('carrinhoZapEsfirras', JSON.stringify(carrinho));
            
            showNotification("Item resgatado e adicionado ao carrinho!", 'success');
            
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
        } catch (error) {
            showNotification(error.message, 'error');
            loadInitialData(); 
        }
    }
    

    function updateHeaderAndCart() {
        if (nomeUsuarioDesktop && customerInfo.name) {
            nomeUsuarioDesktop.textContent = `Olá, ${customerInfo.name.split(' ')[0]}!`;
        }
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
    }

    function logout() {
        localStorage.clear();
        window.location.href = 'index.html';
    }
    
      const enableNotificationsButton = document.getElementById('enable-notifications-btn');
    const notificationStatusEl = document.getElementById('notification-status');
    
    const VAPID_PUBLIC_KEY = 'BDeBFr3uzIHhlT4j-9Xu7s5c4PXcOTb4O9GMOeEjWN276jiWVIeZTpGGeiAftStrAGjFJzh_HrscbKfO6h0vqfA';

    function setupNotifications() {
        if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            if (enableNotificationsButton) enableNotificationsButton.style.display = 'none';
            if (notificationStatusEl) notificationStatusEl.textContent = 'Seu navegador não suporta notificações.';
            return;
        }

        if (enableNotificationsButton) {
            enableNotificationsButton.addEventListener('click', askForNotificationPermission);
        }
        
        if (Notification.permission === 'granted') {
            if (notificationStatusEl) notificationStatusEl.textContent = 'As notificações já estão ativas.';
            if (enableNotificationsButton) enableNotificationsButton.style.display = 'none';
        } else if (Notification.permission === 'denied') {
            if (notificationStatusEl) notificationStatusEl.textContent = 'As notificações foram bloqueadas. Você precisa permitir nas configurações do seu navegador.';
            if (enableNotificationsButton) enableNotificationsButton.style.display = 'none';
        }
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    async function subscribeUserToPush() {
        try {
            const registration = await navigator.serviceWorker.register('/static/js/service-worker.js');
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });

            const token = localStorage.getItem('authToken');
            if (!token) return;

            await fetch(`${API_BASE_URL}/api/push/subscribe`, {
                method: 'POST',
                body: JSON.stringify(subscription),
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (notificationStatusEl) notificationStatusEl.textContent = 'Notificações ativadas!';
            if (enableNotificationsButton) enableNotificationsButton.style.display = 'none';

        } catch (error) {
            console.error('Falha ao se inscrever para notificações push:', error);
            if (notificationStatusEl) notificationStatusEl.textContent = 'Não foi possível ativar as notificações.';
        }
    }
    
    function askForNotificationPermission() {
        Notification.requestPermission(status => {
            if (status === 'granted') {
                subscribeUserToPush();
            } else {
                if (notificationStatusEl) notificationStatusEl.textContent = 'Você não permitiu as notificações.';
            }
        });
    }

async function loadInitialData() {
    try {
        const [userDataResponse, addressesResponse, ordersResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/api/customers/me`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_BASE_URL}/api/customers/me/addresses`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_BASE_URL}/api/customers/me/orders`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        if (userDataResponse.status === 401 || userDataResponse.status === 403) {
            logout();
            return;
        }

        if (!userDataResponse.ok) throw new Error('Falha ao carregar dados do perfil.');
        if (!addressesResponse.ok) throw new Error('Falha ao carregar endereços.');
        if (!ordersResponse.ok) throw new Error('Falha ao carregar histórico de pedidos.');

        state.userData = await userDataResponse.json();
        state.userOrders = await ordersResponse.json();

        renderUserData();
        renderOrderHistory(); 
        renderZapPontosView(); 
        await renderZapClubeView();

    } catch (error) {
        console.error("Erro ao carregar dados iniciais:", error);
        showNotification(error.message, 'error');
    }
}


function openOrderHistoryModal(order) {
    const modalOverlay = document.getElementById('history-modal-overlay');
    const modalContent = document.getElementById('history-modal-content');
    if (!modalOverlay || !modalContent) return;

    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    const deliveryInfo = typeof order.delivery_info === 'string' ? JSON.parse(order.delivery_info) : order.delivery_info;
    const paymentInfo = typeof order.payment_info === 'string' ? JSON.parse(order.payment_info) : order.payment_info;
    
    const itemsListHTML = items.map(item => {
        const itemTotalPrice = (parseFloat(item.price) || 0) * (item.quantity || 1);
        let itemHTML = `
            <div class="history-item-row">
                <span>${item.quantity || 1}x ${item.name}</span>
                <span>${formatCurrency(itemTotalPrice)}</span>
            </div>
        `;
        if (item.observacao) {
            itemHTML += `<small class="history-item-obs">Obs: ${item.observacao}</small>`;
        }
        if (item.adicionais && item.adicionais.length > 0) {
            const adicionaisText = item.adicionais.map(ad => `+ ${ad.name}`).join(', ');
            itemHTML += `<small class="history-item-addons">${adicionaisText}</small>`;
        }
        return itemHTML;
    }).join('');

    modalContent.innerHTML = `
        <h2><ion-icon name="document-text-outline"></ion-icon>Detalhes do Pedido #${order.id}</h2>
        
        <div class="detail-section">
            <h4><ion-icon name="cube-outline"></ion-icon>Itens do Pedido</h4>
            <div class="history-item-list">
                ${itemsListHTML}
            </div>
        </div>
        
        <div class="detail-section">
            <h4><ion-icon name="cash-outline"></ion-icon>Resumo Financeiro</h4>
            <div class="financial-summary">
                <div class="summary-row"><span>Subtotal</span><span>${formatCurrency(order.subtotal)}</span></div>
                ${order.discount_value > 0 ? `<div class="summary-row discount"><span>Descontos</span><span>- ${formatCurrency(order.discount_value)}</span></div>` : ''}
                <div class="summary-row"><span>Taxa de Entrega</span><span>${formatCurrency(order.delivery_fee)}</span></div>
                <div class="summary-row total"><span>Total Pago</span><span>${formatCurrency(order.total_value)}</span></div>
            </div>
        </div>

        <div class="detail-section">
            <h4><ion-icon name="card-outline"></ion-icon>Pagamento</h4>
            <p>Status: <strong>${order.status}</strong> <br> Método: ${paymentInfo.metodo}</p>
        </div>

        <div class="detail-section">
            <h4><ion-icon name="location-outline"></ion-icon>Entrega / Retirada</h4>
            <p>${deliveryInfo.tipo === 'retirada' ? 'Retirada no Balcão' : `Entrega em: ${deliveryInfo.rua}, ${deliveryInfo.numero}`}</p>
        </div>
        
        <button class="btn btn-primary btn-repeat-order" data-order-id="${order.id}"><ion-icon name="cart-outline"></ion-icon> Adicionar itens à sacola</button>
    `;

    modalOverlay.classList.add('ativo');
}
    function toggleEditMode(isEditing) {
        if (!nameInput || !emailInput || !phoneInput || !editButton || !saveButton || !cancelButton) return;
        nameInput.readOnly = !isEditing;
        emailInput.readOnly = !isEditing;
        phoneInput.readOnly = !isEditing;
        editButton.style.display = isEditing ? 'none' : 'inline-flex';
        saveButton.style.display = isEditing ? 'inline-flex' : 'none';
        cancelButton.style.display = isEditing ? 'inline-flex' : 'none';
    }

    function showSection(target) {
        perfilSecoes.forEach(secao => secao.classList.remove('active'));
        const targetSection = document.getElementById(`secao-${target}`);
        if (targetSection) targetSection.classList.add('active');
    }


function renderOrderHistory() {
    const container = document.getElementById('secao-historico-pedidos');
    if (!container) return;

    console.log("--- INICIANDO DIAGNÓSTICO AVANÇADO DE renderOrderHistory ---");
    console.log("Dados recebidos para renderizar:", state.userOrders);

    if (!state.userOrders || state.userOrders.length === 0) {
        container.innerHTML = '<h2>Histórico de Pedidos</h2><p>Você ainda não fez nenhum pedido.</p>';
        return;
    }

    const ordersHTML = state.userOrders.map((order, index) => {
        console.log(`--- Processando Pedido ${index + 1} (ID: ${order.id}) ---`);
        try {
            const orderId = order.id;
            const createdAt = new Date(order.created_at).toLocaleDateString('pt-BR', {day: '2-digit', month: 'long', year: 'numeric'});
            const totalValue = formatCurrency(order.total_value);
            
            console.log(`- ID: ${orderId} (OK)`);
            console.log(`- Data: ${createdAt} (OK)`);
            console.log(`- Valor Total: ${totalValue} (OK)`);

            const cardHTML = `
                <div class="history-order-card" data-order-id="${orderId}">
                    <div class="history-card-header">
                        <div class="history-card-header-info">
                            <strong>Pedido #${orderId}</strong><br>
                            <span>${createdAt}</span>
                        </div>
                        <div class="history-card-header-total">
                            ${totalValue}
                        </div>
                    </div>
                    <div class="history-card-body">
                        </div>
                </div>
            `;
            console.log(`- HTML para o pedido #${orderId} gerado com sucesso.`);
            return cardHTML;

        } catch (error) {
            console.error(`### ERRO ao processar o Pedido ID ${order.id}:`, error);
            console.log("   Objeto do pedido que causou o erro:", order);
            return ''; 
        }
    }).join('');
    
    console.log("--- DIAGNÓSTICO FINALIZADO ---");

    if (ordersHTML.trim() === '') {
        container.innerHTML = `<h2>Histórico de Pedidos</h2><p style="color:red;">Ocorreu um erro ao tentar exibir os pedidos. Verifique o console.</p>`;
    } else {
        container.innerHTML = `<h2>Histórico de Pedidos</h2><p>Clique em um pedido para ver os detalhes.</p>${ordersHTML}`;
    }
}
function repeatOrder(orderId) {
    const orderToRepeat = state.userOrders.find(o => o.id == orderId);
    if (!orderToRepeat) {
        showNotification('Erro: Pedido não encontrado para repetir.', 'error');
        return;
    }

    let carrinho = JSON.parse(localStorage.getItem('carrinhoZapEsfirras')) || [];
    const items = typeof orderToRepeat.items === 'string' ? JSON.parse(orderToRepeat.items) : orderToRepeat.items;

    items.forEach(item => {
        const itemParaCarrinho = { ...item, idUnico: `${item.id}_${Date.now()}_${Math.random()}` };
        carrinho.push(itemParaCarrinho);
    });

    localStorage.setItem('carrinhoZapEsfirras', JSON.stringify(carrinho));
    showNotification('Itens do pedido anterior foram adicionados à sua sacola!', 'success');
    updateHeaderAndCart(); 
}


const historicoSection = document.getElementById('secao-historico-pedidos');
if (historicoSection) {
    historicoSection.addEventListener('click', (e) => {
        const card = e.target.closest('.history-order-card');
        if (card) {
            const orderId = card.dataset.orderId;
            const orderData = state.userOrders.find(o => o.id == orderId);
            if (orderData) {
                openOrderHistoryModal(orderData);
            }
        }
    });
}

const historyModal = document.getElementById('history-modal-overlay');
if (historyModal) {
    historyModal.addEventListener('click', (e) => {
        const repeatBtn = e.target.closest('.btn-repeat-order');
        if (repeatBtn) {
            const orderId = repeatBtn.dataset.orderId;
            repeatOrder(orderId);
            historyModal.classList.remove('ativo'); 
            return;
        }

        if (e.target.id === 'history-modal-overlay' || e.target.closest('#close-history-modal')) {
            historyModal.classList.remove('ativo');
        }
    });
}

    function showNotification(message, type = 'success') {
        const notif = document.getElementById('notificacao');
        const notifText = document.getElementById('texto-notificacao');
        if (!notif || !notifText) {
            alert(message);
            return;
        }
        notif.className = `notificacao ${type}`;
        notifText.textContent = message;
        notif.classList.add('mostrar');
        
        setTimeout(() => {
            notif.classList.remove('mostrar');
        }, 3000);
    }
    


let subscriptionBrickController;

async function iniciarAssinaturaCheckoutPro() {
    showNotification('Redirecionando para o pagamento da assinatura...', 'loading');

    const token = localStorage.getItem('authToken');
    if (!token) {
        showNotification('Você precisa estar logado para assinar.', 'error');
        window.location.href = 'login-cliente.html'; 
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/zapclube/create-subscription`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || 'Não foi possível iniciar o processo de assinatura.');
        }

        window.location.href = result.init_point;

    } catch (error) {
        console.error('Erro ao iniciar assinatura:', error);
        showNotification(error.message, 'error');
    }
}
function setupEventListeners() {
    if (listenersConfigurados) return;

    if (perfilNav) {
        perfilNav.addEventListener('click', (e) => {
            const link = e.target.closest('.perfil-nav-link');
            if (!link) return;
            e.preventDefault();
            if (link.id === 'link-logout') {
                logout();
                return;
            }
            if (link.getAttribute('href') === 'pedidos.html') {
                window.location.href = 'pedidos.html';
                return;
            }
            perfilNav.querySelector('.active')?.classList.remove('active');
            link.classList.add('active');
            showSection(link.dataset.target);
            if (perfilNavSelectMobile) {
                perfilNavSelectMobile.value = link.dataset.target;
            }
        });
    }
    if (perfilNavSelectMobile) {
        perfilNavSelectMobile.addEventListener('change', (e) => {
            const selectedTarget = e.target.value;
            if (selectedTarget === 'logout') {
                logout();
            } else if (selectedTarget === 'historico-pedidos') {
                window.location.href = 'pedidos.html';
            } else {
                showSection(selectedTarget);
            }
            const correspondingLink = perfilNav.querySelector(`.perfil-nav-link[data-target="${selectedTarget}"]`);
            perfilNav.querySelector('.active')?.classList.remove('active');
            if (correspondingLink) correspondingLink.classList.add('active');
        });
    }

    if (logoutButtonDesktop) logoutButtonDesktop.addEventListener('click', logout);
    if (btnCarrinhoMobile) btnCarrinhoMobile.addEventListener('click', () => { window.location.href = 'index.html' });

    if (editButton) editButton.addEventListener('click', () => toggleEditMode(true));
    if (cancelButton) cancelButton.addEventListener('click', () => { renderUserData(); toggleEditMode(false); });
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            saveButton.disabled = true;
            saveButton.textContent = 'Salvando...';
            try {
                const response = await fetch(`${API_BASE_URL}/api/customers/me`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ name: nameInput.value, email: emailInput.value, phone: phoneInput.value })
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message);
                showNotification('Dados atualizados com sucesso!', 'success');
                state.userData = { ...state.userData, name: nameInput.value, email: emailInput.value, phone: phoneInput.value };
                localStorage.setItem('customerInfo', JSON.stringify({ ...customerInfo, name: nameInput.value }));
                updateHeaderAndCart();
                toggleEditMode(false);
            } catch (error) {
                showNotification(error.message, 'error');
            } finally {
                saveButton.disabled = false;
                saveButton.textContent = 'Salvar Alterações';
            }
        });
    }

    if (passwordForm) {
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentPassword = document.getElementById('current-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;
            if (newPassword !== confirmPassword) {
                showNotification('As novas senhas não coincidem.', 'error');
                return;
            }
            try {
                const response = await fetch(`${API_BASE_URL}/api/customers/me/password`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ currentPassword, newPassword })
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message);
                showNotification('Senha alterada com sucesso!', 'success');
                passwordForm.reset();
            } catch (error) {
                showNotification(error.message, 'error');
            }
        });
    }
    
    const perfilConteudo = document.querySelector('.perfil-conteudo');
    if (perfilConteudo) {
        perfilConteudo.addEventListener('click', (e) => {
            const target = e.target;

            if (target.closest('#subscribe-zapclube-btn')) {
                iniciarAssinaturaCheckoutPro();
            } else if (target.closest('#cancel-subscription-btn') || target.closest('#open-cancel-modal-btn')) {
                const modal = document.getElementById('cancel-confirm-modal');
                if(modal) modal.classList.add('ativo');
            }

            const filterBtn = target.closest('.filter-btn');
            if (filterBtn) {
                perfilConteudo.querySelector('.filter-btn.active')?.classList.remove('active');
                filterBtn.classList.add('active');
                fetchAndRenderPointsHistory(filterBtn.dataset.period);
            }
            const resgatarBtn = target.closest('.btn-resgatar');
            if (resgatarBtn && !resgatarBtn.disabled) {
                e.preventDefault();
                const rewardId = resgatarBtn.dataset.rewardId;
                const confirmModal = document.getElementById('redeem-confirm-modal');
                const confirmBtn = document.getElementById('confirm-redeem-btn');
                if (confirmModal && confirmBtn) {
                    confirmBtn.dataset.rewardId = rewardId;
                    confirmModal.classList.add('ativo');
                }
            }
        });
    }

    const cancelConfirmModal = document.getElementById('cancel-confirm-modal');
    if (cancelConfirmModal) {
        const confirmBtn = document.getElementById('confirm-cancel-btn');
        const keepBtn = document.getElementById('keep-subscription-btn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Cancelando...';
                try {
                    const response = await fetch(`${API_BASE_URL}/api/zapclube/cancel-subscription`, {
                        method: 'PUT',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.message);
                    
                    showNotification(result.message, 'success');
                    cancelConfirmModal.classList.remove('ativo');
                    await loadInitialData();
                    
                } catch (error) {
                    showNotification(error.message, 'error');
                } finally {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Sim, Cancelar';
                }
            });
        }
        if (keepBtn) {
            keepBtn.addEventListener('click', () => {
                cancelConfirmModal.classList.remove('ativo');
            });
        }
    }
    
    const redeemConfirmModal = document.getElementById('redeem-confirm-modal');
    if (redeemConfirmModal) {
        redeemConfirmModal.addEventListener('click', async (e) => {
            const target = e.target;
            const confirmBtn = document.getElementById('confirm-redeem-btn');
            if (target.id === 'confirm-redeem-btn') {
                const rewardId = confirmBtn.dataset.rewardId;
                confirmBtn.disabled = true;
                confirmBtn.textContent = "Resgatando...";
                await redeemReward(rewardId);
                confirmBtn.disabled = false;
                confirmBtn.textContent = "Sim, Resgatar";
                redeemConfirmModal.classList.remove('ativo');
            }
            if (target.id === 'cancel-redeem-btn' || target.id === 'redeem-confirm-modal') {
                redeemConfirmModal.classList.remove('ativo');
            }
        });
    }

    const addAddressBtn = document.getElementById('btn-novo-endereco');
    const addressModal = document.getElementById('address-modal-overlay');
    const closeAddressModalBtn = document.getElementById('close-address-modal');
    const cancelAddressModalBtn = document.getElementById('cancel-address-modal');
    const addressForm = document.getElementById('address-form');
    const listaEnderecosContainer = document.getElementById('lista-enderecos-container');

    if (addAddressBtn) addAddressBtn.addEventListener('click', () => { if (addressModal) addressModal.classList.add('ativo'); });
    if (closeAddressModalBtn) closeAddressModalBtn.addEventListener('click', () => { if (addressModal) addressModal.classList.remove('ativo'); });
    if (cancelAddressModalBtn) cancelAddressModalBtn.addEventListener('click', () => { if (addressModal) addressModal.classList.remove('ativo'); });
    if (addressForm) {
        addressForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const addressData = {
                    alias: document.getElementById('address-alias').value,
                    cep: document.getElementById('address-cep').value,
                    street: document.getElementById('address-street').value,
                    number: document.getElementById('address-number').value,
                    neighborhood: document.getElementById('address-neighborhood').value,
                    complement: document.getElementById('address-complement').value,
                    reference: document.getElementById('address-reference').value,
                };
                const response = await fetch(`${API_BASE_URL}/api/customers/me/addresses`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(addressData)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message);
                showNotification('Endereço salvo com sucesso!', 'success');
                addressForm.reset();
                addressModal.classList.remove('ativo');
                fetchAddresses();
            } catch (error) {
                showNotification(error.message, 'error');
            }
        });
    }

    if (listaEnderecosContainer) {
        listaEnderecosContainer.addEventListener('click', async (e) => {
            const deleteBtn = e.target.closest('.btn-delete-address');
            if (deleteBtn) {
                if (confirm('Tem certeza que deseja excluir este endereço?')) {
                    const addressCard = deleteBtn.closest('.endereco-card');
                    const addressId = addressCard.dataset.addressId;
                    try {
                        const response = await fetch(`${API_BASE_URL}/api/customers/me/addresses/${addressId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.message);
                        showNotification('Endereço excluído com sucesso!', 'success');
                        fetchAddresses();
                    } catch (error) {
                        showNotification(error.message, 'error');
                    }
                }
            }
        });
    }
    
    const cepInput = document.getElementById('address-cep');
    if (cepInput) {
        cepInput.addEventListener('input', async (e) => {
            let cep = e.target.value.replace(/\D/g, '');
            if (cep.length === 8) {
                try {
                    const res = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);
                    if (!res.ok) throw new Error('CEP não encontrado');
                    const data = await res.json();
                    document.getElementById('address-street').value = data.street;
                    document.getElementById('address-neighborhood').value = data.neighborhood;
                    document.getElementById('address-number').focus();
                } catch (error) {
                    showNotification(error.message, 'error');
                }
            }
        });
    }
    
    const historicoSection = document.getElementById('secao-historico-pedidos');
    if (historicoSection) {
        historicoSection.addEventListener('click', (e) => {
            const card = e.target.closest('.history-order-card');
            if (card) {
                const orderId = card.dataset.orderId;
                const orderData = state.userOrders.find(o => o.id == orderId);
                if (orderData) {
                    openOrderHistoryModal(orderData);
                }
            }
        });
    }
    const historyModal = document.getElementById('history-modal-overlay');
    if (historyModal) {
        historyModal.addEventListener('click', (e) => {
            const repeatBtn = e.target.closest('.btn-repeat-order');
            if (repeatBtn) {
                const orderId = repeatBtn.dataset.orderId;
                repeatOrder(orderId);
                historyModal.classList.remove('ativo');
                return;
            }
            if (e.target.id === 'history-modal-overlay' || e.target.closest('#close-history-modal')) {
                historyModal.classList.remove('ativo');
            }
        });
    }

    listenersConfigurados = true;
}
    async function init() {
        updateHeaderAndCart();
        if (telaCarregamento) telaCarregamento.style.display = 'flex';
        if (conteudoPrincipal) conteudoPrincipal.style.display = 'none';
        
        await loadInitialData();
        setupEventListeners();
        setupNotifications();


        if (telaCarregamento) {
            telaCarregamento.style.opacity = '0';
            telaCarregamento.addEventListener('transitionend', () => {
                telaCarregamento.style.display = 'none';
            });
        }
        if (conteudoPrincipal) {
            conteudoPrincipal.style.display = 'block';
        }
    }

    init();
});