
document.addEventListener('DOMContentLoaded', () => {

    const adminToken = sessionStorage.getItem('adminAuthToken');
    const loggedInUser = sessionStorage.getItem('loggedInUser');

    if (!adminToken || !loggedInUser) {
        sessionStorage.clear();
        window.location.href = 'login.html';
        return;
    }

    const capitalizedUser = loggedInUser.charAt(0).toUpperCase() + loggedInUser.slice(1);
    document.getElementById('admin-user-name').textContent = `Olá, ${capitalizedUser}`;

    let state = {
        orders: [],
        menu: {},
        categories: [],
        rewards: [],
        currentView: 'dashboard',
        selectedOrderId: null,
        collapsedSections: new Set(['Finalizado']),
        theme: 'light',
        deliveryCounter: 0,
        lastCounterResetDate: null,
        newOrdersCount: 0,
        reportData: {} 

        
    };

    const pageTitle = document.getElementById('page-title');
    const notificationSound = document.getElementById('notification-sound');
    const audioUnlockPrompt = document.getElementById('audio-unlock-prompt');
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const logoutButton = document.getElementById('logout-button');
    let isAudioUnlocked = false;
    let listenersConfigurados = false; 
    let intervalId = null;
    const originalTitle = document.title;
    function startTitleNotification() { if (intervalId) return; intervalId = setInterval(() => { if (document.hasFocus()) { stopTitleNotification(); } else { document.title = document.title === originalTitle ? `(${state.newOrdersCount}) Novo Pedido!` : originalTitle; } }, 1000); }
    function stopTitleNotification() { clearInterval(intervalId); intervalId = null; state.newOrdersCount = 0; document.title = originalTitle; }
    window.addEventListener('focus', () => { if (intervalId) { stopTitleNotification(); } });
    function unlockAudio() { if (isAudioUnlocked) return; notificationSound.play().catch(() => {}).then(() => { notificationSound.pause(); notificationSound.currentTime = 0; isAudioUnlocked = true; console.log('Contexto de áudio liberado pelo usuário.'); if (audioUnlockPrompt) { audioUnlockPrompt.classList.remove('visible'); } }); }

    const socket = io('/');
    socket.on('new_order', (newOrder) => {
        console.log('Novo pedido recebido via WebSocket!', newOrder);
        if (isAudioUnlocked) { notificationSound.play().catch(e => console.error("Erro ao tocar som:", e)); } else { if (audioUnlockPrompt) { audioUnlockPrompt.classList.add('visible'); } console.warn('Áudio bloqueado...'); }
        showNotification(`Novo pedido #${newOrder.id} recebido!`, 'success');
        
        const processedOrder = {
            ...newOrder,
            items: typeof newOrder.items === 'string' ? JSON.parse(newOrder.items) : newOrder.items,
            client_info: typeof newOrder.client_info === 'string' ? JSON.parse(newOrder.client_info) : newOrder.client_info,
            delivery_info: typeof newOrder.delivery_info === 'string' ? JSON.parse(newOrder.delivery_info) : newOrder.delivery_info,
            payment_info: typeof newOrder.payment_info === 'string' ? JSON.parse(newOrder.payment_info) : newOrder.payment_info,
        };
        state.orders.unshift(processedOrder);

        if (state.currentView === 'pedidos' || state.currentView === 'dashboard') { renderView(state.currentView); }
        if (!document.hasFocus()) { state.newOrdersCount++; startTitleNotification(); }
    });
    
socket.on('menu_structure_changed', async () => {
    console.log('Estrutura do menu alterada. Recarregando a view completa...');
    showNotification('O cardápio foi atualizado.', 'info');
    await fetchCategoriesAndProducts();
    if (state.currentView === 'cardapio') {
        renderView('cardapio'); 
    }
});

socket.on('product_updated', (updatedProduct) => {
    console.log(`Produto #${updatedProduct.id} foi atualizado. Atualizando apenas o seu card...`);
    
    const categoryName = updatedProduct.category_name;
    if (state.menu[categoryName]) {
        const productIndex = state.menu[categoryName].findIndex(p => p.id === updatedProduct.id);
        if (productIndex > -1) {
            state.menu[categoryName][productIndex] = updatedProduct;
        }
    }
    
    updateProductCardInDOM(updatedProduct);
});

socket.on('product_deleted', (data) => {
    console.log(`Produto #${data.productId} foi deletado. Removendo o card...`);
    const cardElement = document.querySelector(`.product-card[data-product-id="${data.productId}"]`);
    if (cardElement) {
        cardElement.remove();
    }
});
    function saveData() { localStorage.setItem('zapEsfirrasAdminState', JSON.stringify({ deliveryCounter: state.deliveryCounter, lastCounterResetDate: state.lastCounterResetDate })); }
    function loadData() { const savedState = JSON.parse(localStorage.getItem('zapEsfirrasAdminState')); if (savedState) { state.deliveryCounter = savedState.deliveryCounter || 0; state.lastCounterResetDate = savedState.lastCounterResetDate || null; } }
    function saveTheme() { localStorage.setItem('zapEsfirrasTheme', state.theme); }
    function loadTheme() { const savedTheme = localStorage.getItem('zapEsfirrasTheme') || 'light'; applyTheme(savedTheme); }
    function applyTheme(theme) { document.body.classList.remove('light-mode', 'dark-mode'); document.body.classList.add(`${theme}-mode`); const themeToggle = document.getElementById('theme-toggle'); if (themeToggle) { themeToggle.checked = theme === 'dark'; } state.theme = theme; saveTheme(); }
async function fetchCategoriesAndProducts() {
    try {
        const catRes = await fetch('/api/admin/categories');
        if (!catRes.ok) throw new Error('Falha ao buscar categorias.');
        state.categories = await catRes.json();

        const prodRes = await fetch('/api/products', { cache: 'no-cache' });
        if (!prodRes.ok) throw new Error('Falha ao buscar produtos.');
        const prodsDB = await prodRes.json();

        console.log('✅ 2. DADOS RECEBIDOS DA API:', prodsDB);

        state.menu = prodsDB.reduce((acc, p) => {
            const cat = p.category_name;
            if (!acc[cat]) acc[cat] = [];
            p.available = !!p.available;
            acc[cat].push(p);
            return acc;
        }, {});
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        showNotification("Erro: Não foi possível carregar os dados.", "error");
    }
}
    function renderView(viewName) {
        document.querySelectorAll('.admin-view').forEach(v => v.classList.remove('active'));
        const viewEl = document.getElementById(`view-${viewName}`);
        viewEl.classList.add('active');
        pageTitle.textContent = document.querySelector(`.nav-link[data-view="${viewName}"] span`).textContent;
        state.currentView = viewName;
        viewEl.innerHTML = ''; 
        const renderMap = {
            dashboard: renderDashboard,
            pedidos: renderPedidosView,
            cardapio: renderCardapioView,
            recompensas: renderRecompensasView,
            assinantes: renderAssinantesView,
            clientes: renderClientesView,
            relatorios: renderRelatoriosView, 
            avaliacoes: renderAvaliacoesView, 
            configuracoes: renderConfiguracoesView
        };
        if (renderMap[viewName]) {
            renderMap[viewName](viewEl); 
        }
    }



// admin-script.js

// SUBSTITUA A FUNÇÃO renderDashboard ANTIGA POR ESTA VERSÃO COMPLETA
async function renderDashboard(viewElement) {
    viewElement.innerHTML = `
        <div id="dashboard-loading" style="text-align: center; padding: 40px;">
            Carregando dados do dashboard...
        </div>
    `;

    try {
        // Busca todos os pedidos não fechados
        const response = await fetch(`/api/admin/reports`);
        if (!response.ok) {
            throw new Error('Falha ao carregar dados do dashboard.');
        }
        const ordersToday = await response.json();

        // Busca o número de visitantes separadamente
        let visitorCount = '...';
        try {
            const visitorsResponse = await fetch('/api/admin/analytics/visitors');
            if (visitorsResponse.ok) {
                const data = await visitorsResponse.json();
                visitorCount = data.count;
            }
        } catch (e) {
            console.error("Erro ao buscar visitantes:", e);
        }

        // Calcula os totais de receita
        const revenueTotals = ordersToday.reduce((totals, order) => {
            const paymentInfo = (typeof order.payment_info === 'string'
                ? JSON.parse(order.payment_info)
                : order.payment_info) || {};
            const metodo = paymentInfo.metodo ? paymentInfo.metodo.toLowerCase() : '';
            const tipo = paymentInfo.tipo ? paymentInfo.tipo.toLowerCase() : '';
            const isOnline = ['pix', 'card_online', 'credit_card', 'debit_card', 'account_money']
                .includes(tipo) || metodo === 'pix';
            const orderTotal = parseFloat(order.total_value || 0);

            if (isOnline) {
                totals.online += orderTotal;
            } else {
                totals.onDelivery += orderTotal;
            }
            return totals;
        }, { online: 0, onDelivery: 0 });

        const ordersTodayCount = ordersToday.length;

        // Distribuição de pedidos por hora
        const hourlyCounts = Array(24).fill(0);
        ordersToday.forEach(order => {
            const orderDate = new Date(order.created_at);
            const saoPauloHour = new Date(orderDate.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })).getHours();
            hourlyCounts[saoPauloHour]++;
        });

        // Pega últimos 5 pedidos
        const recentOrders = (state.orders || []).slice(0, 5);

        // Renderiza o HTML
        viewElement.innerHTML = `
            <div class="dashboard-layout">
                <div class="dashboard-main-column">
                    <div class="report-kpi-grid dashboard-kpis">
                        <div class="kpi-card">
                            <div class="kpi-card-title">Visitas na Loja (Hoje)</div>
                            <div class="kpi-card-value">${visitorCount}</div>
                        </div>
                        <div class="kpi-card">
                            <div class="kpi-card-title">Recebido Online (Caixa)</div>
                            <div class="kpi-card-value">${formatCurrency(revenueTotals.online)}</div>
                        </div>
                        <div class="kpi-card">
                            <div class="kpi-card-title">A Receber na Entrega (Caixa)</div>
                            <div class="kpi-card-value">${formatCurrency(revenueTotals.onDelivery)}</div>
                        </div>
                        <div class="kpi-card">
                            <div class="kpi-card-title">Pedidos Pagos (Em Caixa)</div>
                            <div class="kpi-card-value">${ordersTodayCount}</div>
                        </div>
                    </div>

                    <div class="chart-container dashboard-chart-container">
                        <h3>Pedidos por Hora (Caixa Aberto)</h3>
                        <canvas id="hourly-chart"></canvas>
                    </div>
                </div>

                <div class="dashboard-side-column">
                    <div class="recent-orders-container">
                        <h3>Últimos 5 Pedidos</h3>
                        <div class="recent-orders-list" id="recent-orders-list">
                            ${recentOrders.length === 0
                                ? '<p>Nenhum pedido recente.</p>'
                                : recentOrders.map(order => {
                                    const clientInfo = (typeof order.client_info === 'string'
                                        ? JSON.parse(order.client_info)
                                        : order.client_info) || {};
                                    const statusClass = (order.status || 'novo')
                                        .toLowerCase()
                                        .replace(/\s+/g, '-');
                                    return `
                                        <div class="order-list-item">
                                            <div class="order-list-item-info">
                                                <p>#${order.id} - ${clientInfo.nome || 'Cliente'}</p>
                                                <span>${formatCurrency(order.total_value)}</span>
                                            </div>
                                            <span class="status-badge status-${statusClass}">${order.status}</span>
                                        </div>
                                    `;
                                }).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Gráfico de pedidos por hora
        const ctx = document.getElementById('hourly-chart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
                datasets: [{
                    label: 'Pedidos',
                    data: hourlyCounts,
                    borderColor: 'rgba(211, 47, 47, 1)',
                    backgroundColor: 'rgba(211, 47, 47, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 } },
                    x: { grid: { display: false } }
                }
            }
        });

    } catch (error) {
        console.error("Erro ao renderizar dashboard:", error);
        viewElement.innerHTML = `
            <p style="color: var(--primary-color);">
                Erro ao carregar os dados do dashboard. Tente atualizar a página.
            </p>
        `;
    }
}

function saveData() {
    localStorage.setItem('zapEsfirrasAdminState', JSON.stringify({
        deliveryCounter: state.deliveryCounter,
        lastCounterResetDate: state.lastCounterResetDate
    }));
}

function incrementAndGetDeliveryNumber() {
    const today = new Date().toISOString().split('T')[0];

    if (state.lastCounterResetDate !== today) {
        console.log("Novo dia! Zerando o contador de entregas.");
        state.deliveryCounter = 0;
        state.lastCounterResetDate = today;
    }

    state.deliveryCounter++;
    saveData(); 
    
    return `Z${String(state.deliveryCounter).padStart(2, '0')}`;
}

// admin-script.js

// SUBSTITUA A FUNÇÃO renderPedidosView
function renderPedidosView(viewElement) {
    // *** MUDANÇA AQUI: Adicionado 'Novo' no início do array ***
    const statuses = ['Novo', 'Em Preparo', 'Prontos', 'Em Entrega', 'Finalizado'];
    
    const statusConfig = { 
        // *** MUDANÇA AQUI: Configuração para o card 'Novo' ***
        'Novo': { icon: 'alert-circle-outline', title: 'Novos Pedidos' },
        'Em Preparo': { icon: 'flame-outline', title: 'Em Preparo' }, 
        'Prontos': { icon: 'checkmark-done-outline', title: 'Prontos (Retirada)' }, 
        'Em Entrega': { icon: 'bicycle-outline', title: 'Em Entrega' }, 
        'Finalizado': { icon: 'archive-outline', title: 'Finalizados' } 
    };
    viewElement.innerHTML = `<div class="pedidos-layout"><div class="pedidos-lista-vertical">${statuses.map(status => renderOrderStatusSection(status, statusConfig[status])).join('')}</div><div class="pedidos-detalhes-coluna" id="pedidos-detalhes-coluna"></div></div>`;
    renderOrderDetails(state.selectedOrderId);
}

    function renderOrderStatusSection(status, config) {
        const ordersInSection = state.orders.filter(order => order.status === status);
        const isCollapsed = state.collapsedSections.has(status);
        return `<div class="status-section ${isCollapsed ? 'collapsed' : ''}" data-status="${status}"><div class="section-header"><ion-icon name="${config.icon}"></ion-icon><h3>${config.title}</h3><span class="count">${ordersInSection.length}</span><ion-icon name="chevron-down-outline" class="toggle-arrow"></ion-icon></div><div class="section-body">${ordersInSection.length > 0 ? ordersInSection.map(renderOrderCard).join('') : '<p style="color: var(--text-secondary); text-align: center; padding: 16px 0;">Nenhum pedido nesta etapa.</p>'}</div></div>`;
    }

// admin-script.js

// SUBSTITUA A FUNÇÃO renderOrderCard POR ESTA VERSÃO COMPACTA
function renderOrderCard(order) {
    const { client_info, delivery_info } = order;
    let actionButtonHTML = '';

    // Estilo padrão para botões compactos
    const btnStyle = 'width: 100%; padding: 6px 0; font-size: 0.9rem; border-radius: 6px;';

    if (order.status === 'Novo') {
        actionButtonHTML = `<button class="btn btn-success action-button accept-print" data-order-id="${order.id}" style="${btnStyle}"><ion-icon name="print-outline"></ion-icon> Aceitar e Imprimir</button>`;
    } else if (order.status === 'Em Preparo') {
        actionButtonHTML = (delivery_info.tipo === 'Entrega' || delivery_info.tipo === 'padrao')
            ? `<button class="btn btn-primary action-button dispatch" data-order-id="${order.id}" data-next-status="Em Entrega" style="${btnStyle}"><ion-icon name="bicycle-outline"></ion-icon> Despachar</button>`
            : `<button class="btn btn-primary action-button ready" data-order-id="${order.id}" data-next-status="Prontos" style="${btnStyle}"><ion-icon name="checkmark-outline"></ion-icon> Pronto</button>`;
    } else if (order.status === 'Prontos' || order.status === 'Em Entrega') {
        actionButtonHTML = `<button class="btn btn-primary action-button complete" data-order-id="${order.id}" data-next-status="Finalizado" style="${btnStyle}"><ion-icon name="archive-outline"></ion-icon> Finalizar</button>`;
    }

    // Bloco de endereço compacto (sem tags <p>)
    let addressHTML = '';
    if (delivery_info.tipo === 'Entrega' || delivery_info.tipo === 'padrao') {
        const { rua, numero, bairro } = delivery_info;
        // Usamos background cinza claro e padding pequeno
        addressHTML = `
        <div class="order-card-address" style="background-color: #f8f9fa; padding: 6px 8px; border-radius: 6px; margin-top: 4px; font-size: 0.8rem; color: #555;">
            <div style="font-weight: 600; color: #333; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <ion-icon name="location-outline" style="vertical-align: text-bottom; font-size: 0.9rem;"></ion-icon> ${rua}, ${numero}
            </div>
            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${bairro}</div>
        </div>`;
    }

    const isNew = order.status === 'Em Preparo' || order.status === 'Novo';
    const orderTime = new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const deliveryTypeIcon = (delivery_info.tipo === 'Entrega' || delivery_info.tipo === 'padrao') ? 'bicycle-outline' : 'walk-outline';
    const deliveryTypeText = (delivery_info.tipo === 'Entrega' || delivery_info.tipo === 'padrao') ? 'Entrega' : 'Retirada';

    const displayId = order.delivery_number ? `<b>${order.delivery_number}</b>` : `#${order.id}`;

    // Estrutura do Card Compacta
    // Padding reduzido para 10px e gap para 6px
    return `
    <div class="order-card ${state.selectedOrderId == order.id ? 'active' : ''} ${isNew ? 'new-order' : ''}" data-order-id="${order.id}" style="padding: 10px 12px; gap: 6px; border-radius: 8px; border: 1px solid #e0e0e0; background: #fff; margin-bottom: 10px;">
        
        <div class="order-card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0;">
            <span style="font-size: 1.1rem; font-weight: 800; color: #333;">${displayId}</span>
            <span style="font-size: 0.95rem; font-weight: 700; color: var(--primary-color);">${formatCurrency(order.total_value)}</span>
        </div>
        
        <div class="order-card-customer" style="font-weight: 600; font-size: 0.9rem; margin: 0; color: #444; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${client_info.nome}
        </div>
        
        ${addressHTML}
        
        <div class="order-card-info" style="padding-top: 6px; border-top: 1px solid #eee; display: flex; justify-content: space-between; font-size: 0.8rem; color: #777;">
            <span style="display: flex; align-items: center; gap: 4px;"><ion-icon name="time-outline"></ion-icon> ${orderTime}</span>
            <span style="display: flex; align-items: center; gap: 4px;"><ion-icon name="${deliveryTypeIcon}"></ion-icon> ${deliveryTypeText}</span>
        </div>
        
        <div class="order-card-footer" style="margin-top: 2px;">${actionButtonHTML}</div>
    </div>`;
}
 function renderOrderDetails(orderId) {
    const detailsColumn = document.getElementById('pedidos-detalhes-coluna');
    const order = state.orders.find(o => o.id == orderId);

    if (!order) {
        detailsColumn.innerHTML = `<div class="placeholder-detalhes"><ion-icon name="receipt-outline"></ion-icon><h3>Selecione um Pedido</h3><p>Clique em um card para ver os detalhes.</p></div>`;
        return;
    }

    const { items, client_info, delivery_info, payment_info, status, total_value, subtotal, discount_value, delivery_fee } = order;

    const subtotalComEntrega = (parseFloat(subtotal) || 0) + (parseFloat(delivery_fee) || 0);

    const financialSummaryHtml = `
        <div class="financial-summary">
            <div class="summary-row">
                <span>Subtotal dos Itens</span>
                <span>${formatCurrency(subtotal)}</span>
            </div>
            <div class="summary-row">
                <span>Taxa de Entrega</span>
                <span>${formatCurrency(delivery_fee)}</span>
            </div>
            
            <hr class="resumo-divisor">
            
            <div class="summary-row subtotal-combinado">
                <span>Subtotal</span>
                <span>${formatCurrency(subtotalComEntrega)}</span>
            </div>
            
            ${discount_value > 0 ? `
                <div class="summary-row discount">
                    <span>Descontos</span>
                    <span>- ${formatCurrency(discount_value)}</span>
                </div>
            ` : ''}
            
            <hr class="resumo-divisor">

            <div class="summary-row total">
                <span>Total Pago</span>
                <span>${formatCurrency(total_value)}</span>
            </div>
        </div>
    `;

    const itemsHtml = items.map(item => {
        let itemHtml = `
            <div class="order-item-container">
                <div class="order-item-row">
                    <span>${item.quantity || 1}x ${item.name || 'Item não encontrado'}</span>
                    <span>${formatCurrency((item.price || 0) * (item.quantity || 1))}</span>
                </div>
        `;
        if (item.observacao) {
            const details = item.observacao.split('|').map(detail => detail.trim());
            itemHtml += `<div class="combo-components-list">`;
            details.forEach(detail => {
                itemHtml += `<div class="component-item">↳ ${detail}</div>`;
            });
            itemHtml += `</div>`;
        }
        if (item.adicionais && item.adicionais.length > 0) {
            item.adicionais.forEach(ad => {
                itemHtml += `<div class="combo-components-list"><div class="component-item" style="font-style: italic;">↳ + ${ad.name}</div></div>`;
            });
        }
        itemHtml += `</div>`;
        return itemHtml;
    }).join('');

    const deliveryHtml = formatarDetalhesEntrega(delivery_info);
    const paymentHtml = formatarDetalhesPagamento(payment_info, delivery_info, total_value, status);
    
    detailsColumn.innerHTML = `
        <div class="details-content">
            <div class="details-header"><h3>Pedido #${order.id}</h3></div>
            <div class="details-card-header"><ion-icon name="person-outline"></ion-icon>Cliente</div>
            <div class="details-card-body"><p><b>Nome:</b> ${client_info.nome}</p><p><b>Telefone:</b> ${client_info.telefone || 'Não informado'}</p></div>
            <div class="details-card-header"><ion-icon name="location-outline"></ion-icon>Entrega / Retirada</div>
            <div class="details-card-body">${deliveryHtml}</div>
            <div class="details-card-header"><ion-icon name="wallet-outline"></ion-icon>Pagamento</div>
            <div class="details-card-body">${paymentHtml}</div>
            <div class="details-card-header"><ion-icon name="fast-food-outline"></ion-icon>Itens</div>
            <div class="details-card-body">${itemsHtml}</div>
            <div class="details-card-header"><ion-icon name="cash-outline"></ion-icon>Resumo Financeiro</div>
            <div class="details-card-body">${financialSummaryHtml}</div>
        </div>
        <div class="details-footer"><button class="btn btn-primary print-button"><ion-icon name="print-outline"></ion-icon>Imprimir</button></div>
    `;
}


function renderCardapioView(viewElement) {
    const sortedCategories = [...state.categories].sort((a, b) => (a.display_order || 99) - (b.display_order || 99));
    let categoriesHTML = sortedCategories.map(category => {
        const productsInCategory = state.menu[category.name] || [];
        return `<div class="category-section" data-category-name="${category.name.toLowerCase()}"> <h3 class="category-header"> <span>${category.name}</span> <div class="category-actions"> <button class="btn-category-action btn-edit-category" data-category-id="${category.id}" title="Renomear Categoria"> <ion-icon name="pencil-outline"></ion-icon> </button> <button class="btn-category-action btn-toggle-visibility ${!category.is_visible ? 'invisible' : ''}" data-category-id="${category.id}" title="${category.is_visible ? 'Tornar Invisível' : 'Tornar Visível'}"> <ion-icon name="${category.is_visible ? 'eye-outline' : 'eye-off-outline'}"></ion-icon> </button> </div> </h3> <div class="product-grid"> ${productsInCategory.map(createProductCardHTML).join('')} </div> </div>`;
    }).join('');


    viewElement.innerHTML = ` <div class="view-header"> <div><h2>Cardápio</h2><p>Gerencie os produtos e categorias.</p></div> <div class="category-search-container"> <ion-icon name="search-outline"></ion-icon> <input type="search" id="product-search-input" placeholder="Pesquisar Produto..."> </div> <div class="view-header-actions"> <button class="btn btn-secondary" id="add-new-category-btn"><ion-icon name="add-outline"></ion-icon>Nova Categoria</button> <button class="btn btn-primary" id="add-new-product-btn"><ion-icon name="add-outline"></ion-icon>Adicionar Produto</button> </div> </div> <div class="cardapio-grid">${categoriesHTML}</div>`;
}
function createProductCardHTML(product) {
    const isPromo = product.is_promo_active;
    const priceHTML = isPromo
        ? `<div class="price"><span class="preco-antigo"><s>${formatCurrency(product.price)}</s></span><span class="preco-promocional">${formatCurrency(product.promo_price)}</span></div>`
        : `<div class="price">${formatCurrency(product.price)}</div>`;

    return `
        <div class="product-card ${isPromo ? 'em-promocao' : ''}" data-product-id="${product.id}">
            ${isPromo ? `<div class="promo-badge-estilizado">⚡ OFERTA</div>` : ''}
            <div class="product-options">
                <button class="options-button"><ion-icon name="ellipsis-vertical"></ion-icon></button>
                <div class="options-menu">
                    <button class="edit-product-btn" data-product-id="${product.id}">Editar</button>
                    <button class="delete-product-btn delete-btn" data-product-id="${product.id}">Excluir</button>
                </div>
            </div>
            <div class="product-info">
                <h4>${product.name}</h4>
                ${priceHTML}
                <p class="description">${product.description || 'Sem descrição.'}</p>
            </div>
            <div class="product-actions">
                <div class="product-availability-switch">
                    <span>Disponível</span>
                    <label class="switch"><input type="checkbox" class="availability-toggle" data-product-id="${product.id}" ${product.available ? 'checked' : ''}><span class="slider"></span></label>
                </div>
                <button class="btn-card-action btn-promo-toggle ${isPromo ? 'active' : ''}" title="Definir Promoção">
                    <ion-icon name="flash-outline"></ion-icon>
                </button>
            </div>
        </div>
    `;
}
function updateProductCardInDOM(product) {
   
    const cardElement = document.querySelector(`.product-card[data-product-id="${product.id}"]`);

    if (cardElement) {
        console.log(`Atualizando o card #${product.id} na tela...`);
        const newCardHTML = createProductCardHTML(product);
        cardElement.outerHTML = newCardHTML;
    }
}
// admin-script.js

// SUBSTITUA A FUNÇÃO renderRelatoriosView ANTIGA POR ESTA VERSÃO COMPLETA
function renderRelatoriosView(viewElement) {
    let chartInstance = null;

    viewElement.innerHTML = `
        <div class="view-header">
            <div><h2>Relatórios</h2><p>Analise o desempenho de suas vendas.</p></div>
            <div class="view-header-actions">
                <button class="btn btn-primary" id="print-report-btn" disabled><ion-icon name="print-outline"></ion-icon> Imprimir Relatório</button>
            </div>
        </div>
        <div class="report-filters" id="report-filters">
            <div>
                <button class="btn" data-period="today">Hoje</button>
                <button class="btn" data-period="yesterday">Ontem</button>
                <button class="btn" data-period="this_week">Esta Semana</button>
                <button class="btn" data-period="this_month">Este Mês</button>
            </div>
            <div class="date-range-picker">
                <input type="date" id="start-date-input">
                <span>até</span>
                <input type="date" id="end-date-input">
                <button class="btn btn-primary" id="custom-range-btn">Buscar</button>
            </div>
        </div>
        <div id="loading-indicator" style="text-align: center; padding: 40px; display: none;">Carregando dados...</div>
        <div id="report-content" style="display: none;">
            <div class="dashboard-main-column">
                <div class="report-kpi-grid">
                    <div class="kpi-card"><div class="kpi-card-title">Faturamento Total</div><div class="kpi-card-value" id="kpi-revenue">R$ 0,00</div></div>
                    <div class="kpi-card"><div class="kpi-card-title">Total de Pedidos</div><div class="kpi-card-value" id="kpi-orders">0</div></div>
                    <div class="kpi-card"><div class="kpi-card-title">Ticket Médio</div><div class="kpi-card-value" id="kpi-avg-ticket">R$ 0,00</div></div>
                </div>
                <div class="chart-container">
                    <h3>Top 10 Produtos Mais Vendidos</h3>
                    <canvas id="sales-chart"></canvas>
                </div>
                <div class="report-table-container">
                    <table class="report-table">
                        <thead><tr><th>Produto</th><th>Itens Vendidos</th><th>Receita Bruta</th></tr></thead>
                        <tbody id="report-table-body"></tbody>
                    </table>
                </div>
            </div>
        </div>
        <div id="no-data-indicator" style="text-align: center; padding: 40px; display: none;">
            <p>Nenhum dado encontrado para o período selecionado.</p>
        </div>
    `;

    const loadingIndicator = viewElement.querySelector('#loading-indicator');
    const reportContent = viewElement.querySelector('#report-content');
    const noDataIndicator = viewElement.querySelector('#no-data-indicator');
    const printButton = viewElement.querySelector('#print-report-btn');

    async function updateReportData(startDate, endDate, periodName) {
        loadingIndicator.style.display = 'block';
        reportContent.style.display = 'none';
        noDataIndicator.style.display = 'none';
        printButton.disabled = true;

        try {
            const response = await fetch(`/api/admin/reports?startDate=${startDate}&endDate=${endDate}`);
            if (!response.ok) {
                throw new Error('Falha ao buscar dados do relatório.');
            }
            const filteredOrders = await response.json();

            if (filteredOrders.length === 0) {
                noDataIndicator.style.display = 'block';
                return;
            }

            const revenueTotals = filteredOrders.reduce((totals, order) => {
                const paymentInfo = (typeof order.payment_info === 'string' ? JSON.parse(order.payment_info) : order.payment_info) || {};
                const metodo = paymentInfo.metodo ? paymentInfo.metodo.toLowerCase() : '';
                const tipo = paymentInfo.tipo ? paymentInfo.tipo.toLowerCase() : '';
                const isOnline = ['pix', 'credit_card', 'debit_card', 'account_money'].includes(tipo) || metodo === 'pix';
                const orderTotal = parseFloat(order.total_value || 0);
                if (isOnline) {
                    totals.online += orderTotal;
                } else {
                    totals.onDelivery += orderTotal;
                }
                return totals;
            }, { online: 0, onDelivery: 0 });

            const totalRevenue = revenueTotals.online + revenueTotals.onDelivery;
            const totalOrders = filteredOrders.length;
            const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

            viewElement.querySelector('#kpi-revenue').textContent = formatCurrency(totalRevenue);
            viewElement.querySelector('#kpi-orders').textContent = totalOrders;
            viewElement.querySelector('#kpi-avg-ticket').textContent = formatCurrency(avgTicket);
            
            state.reportData = {
                periodo: periodName,
                faturamentoOnline: revenueTotals.online,
                faturamentoEntrega: revenueTotals.onDelivery,
                faturamentoTotal: totalRevenue,
                totalPedidos: totalOrders,
                ticketMedio: avgTicket
            };
            
            printButton.disabled = false;

            const salesByProduct = filteredOrders.flatMap(order => (typeof order.items === 'string' ? JSON.parse(order.items) : order.items)).reduce((acc, item) => {
                const name = item.name || 'Item desconhecido';
                if (!acc[name]) { acc[name] = { quantity: 0, total: 0 }; }
                acc[name].quantity += (item.quantity || 1);
                acc[name].total += ((item.price || 0) * (item.quantity || 1));
                return acc;
            }, {});

            const sortedProducts = Object.entries(salesByProduct).sort(([, a], [, b]) => b.quantity - a.quantity);
            viewElement.querySelector('#report-table-body').innerHTML = sortedProducts.map(([name, data]) => `<tr><td>${name}</td><td>${data.quantity}</td><td>${formatCurrency(data.total)}</td></tr>`).join('');

            const topProducts = sortedProducts.slice(0, 10);
            const chartLabels = topProducts.map(([name]) => name);
            const chartData = topProducts.map(([, data]) => data.quantity);

            const ctx = viewElement.querySelector('#sales-chart').getContext('2d');
            if (chartInstance) {
                chartInstance.destroy();
            }
            chartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: 'Itens Vendidos',
                        data: chartData,
                        backgroundColor: 'rgba(211, 47, 47, 0.7)',
                        borderColor: 'rgba(211, 47, 47, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { precision: 0 } },
                        x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45 } }
                    }
                }
            });

        } catch (error) {
            loadingIndicator.textContent = `Erro ao carregar relatório: ${error.message}`;
        } finally {
            if (noDataIndicator.style.display !== 'block') {
                loadingIndicator.style.display = 'none';
                reportContent.style.display = 'block';
            } else {
                loadingIndicator.style.display = 'none';
            }
        }
    }

    const filterButtons = viewElement.querySelectorAll('#report-filters .btn[data-period]');
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            viewElement.querySelector('#start-date-input').value = '';
            viewElement.querySelector('#end-date-input').value = '';

            const period = button.dataset.period;
            const now = new Date();
            let startDate = new Date();
            let endDate = new Date();

            if (period === 'today') {
                // startDate e endDate já são 'hoje' por padrão
            } else if (period === 'yesterday') {
                startDate.setDate(now.getDate() - 1);
                endDate.setDate(now.getDate() - 1);
            } else if (period === 'this_week') {
                const firstDayOfWeek = now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1);
                startDate.setDate(firstDayOfWeek);
            } else if (period === 'this_month') {
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            }
            
            const startDateString = startDate.toISOString().slice(0, 10);
            const endDateString = endDate.toISOString().slice(0, 10);
            
            updateReportData(startDateString, endDateString, button.textContent);
        });
    });

    viewElement.querySelector('#custom-range-btn').addEventListener('click', () => {
        const startDate = viewElement.querySelector('#start-date-input').value;
        const endDate = viewElement.querySelector('#end-date-input').value;
        if (startDate && endDate) {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            const periodName = `De ${new Date(startDate + 'T00:00:00-03:00').toLocaleDateString('pt-BR')} a ${new Date(endDate + 'T00:00:00-03:00').toLocaleDateString('pt-BR')}`;
            updateReportData(startDate, endDate, periodName);
        } else {
            showNotification('Por favor, selecione as datas de início e fim.', 'error');
        }
    });

    viewElement.querySelector('.btn[data-period="today"]').click();
}
    function renderConfiguracoesView(viewElement) {
        viewElement.innerHTML = `<div class="view-header"><h2>Configurações</h2><p>Ajustes gerais do painel e da loja.</p></div><div class="settings-grid"><div class="settings-card"><h3>Aparência</h3><div class="setting-item"><label for="theme-toggle">Modo Escuro</label><label class="switch"><input type="checkbox" id="theme-toggle" ${state.theme === 'dark' ? 'checked' : ''}><span class="slider"></span></label></div></div><div class="settings-card"><h3>Loja (Em breve)</h3><p>Aqui você poderá editar informações como nome, endereço e horário de funcionamento.</p></div></div>`;
    }



function imprimirRelatorio() {
    const data = state.reportData;
    if (!data) {
        showNotification("Dados do relatório não encontrados. Por favor, selecione um período.", "error");
        return;
    }

    const now = new Date();
    const formattedDate = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    const relatorioHTML = `
        <div id="relatorio-para-imprimir">
            <div style="text-align: center;">
                <h2 style="font-size: 14pt; margin: 0; font-weight: bold;">Zap Esfirras</h2>
                <p style="font-size: 12pt; margin: 0; font-weight: bold;">Relatório de Fechamento</p>
            </div>
            <hr style="border: none; border-top: 1px dashed black; margin: 10px 0;">
            <p><strong>Período:</strong> ${data.periodo || 'N/A'}</p>
            <p><strong>Gerado em:</strong> ${formattedDate}</p>
            <hr style="border: none; border-top: 1px dashed black; margin: 10px 0;">
            
            <h3 style="font-size: 12pt; margin-bottom: 10px; font-weight: bold;">Resumo Financeiro</h3>
            <p><strong>Recebido Online:</strong> ${formatCurrency(data.faturamentoOnline)}</p>
            <p><strong>A Receber na Entrega:</strong> ${formatCurrency(data.faturamentoEntrega)}</p>
            <hr style="border: none; border-top: 1px dotted black; margin: 5px 0;">
            <p><strong>FATURAMENTO TOTAL:</strong> ${formatCurrency(data.faturamentoTotal)}</p>
            
            <hr style="border: none; border-top: 1px dashed black; margin: 10px 0;">
            
            <h3 style="font-size: 12pt; margin-bottom: 10px; font-weight: bold;">Resumo de Pedidos</h3>
            <p><strong>Total de Pedidos:</strong> ${data.totalPedidos}</p>
            <p><strong>Ticket Médio:</strong> ${formatCurrency(data.ticketMedio)}</p>
            <hr style="border: none; border-top: 1px dashed black; margin: 10px 0;">
        </div>
    `;

    printJS({
        printable: relatorioHTML,
        type: 'raw-html',
        documentTitle: `Relatorio Zap Esfirras - ${data.periodo}`,
        style: `@page { size: auto; margin: 0mm; } body { font-family: 'Courier New', monospace; font-size: 10pt; width: 280px; margin: 5mm; padding: 0; color: black; font-weight: bold; } h2, h3, p, strong { font-weight: bold; }`
    });
}
    function renderCustomAddition(addition = { name: '', price: '' }) {
        const list = document.getElementById('custom-additions-list');
        if (!list) return;
        const row = document.createElement('div');
        row.className = 'custom-addition-row';
        row.innerHTML = `
            <div class="form-group">
                <input type="text" class="custom-addition-name" placeholder="Nome do Adicional" value="${addition.name || ''}" required>
            </div>
            <div class="form-group">
                <input type="number" step="0.01" class="custom-addition-price" placeholder="Preço (Ex: 3.50)" value="${addition.price || ''}" required>
            </div>
            <button type="button" class="btn-remove-addition" title="Remover Adicional">
                <ion-icon name="trash-outline"></ion-icon>
            </button>
        `;
        list.appendChild(row);
    }
    
   function openProductModal(productData = null) {
    const modal = document.getElementById('product-modal-overlay');
    const title = document.getElementById('modal-title');
    const form = document.getElementById('product-form');
    form.reset();
    document.getElementById('product-id').value = '';
    document.getElementById('image-preview').src = 'https://via.placeholder.com/150x150.png?text=Sem+Imagem';
    
    const categorySelect = document.getElementById('product-category');
    categorySelect.innerHTML = '<option value="" disabled selected>Selecione uma categoria</option>';
    state.categories.forEach(category => { categorySelect.innerHTML += `<option value="${category.id}">${category.name}</option>`; });
    
    const customAdditionsContainer = document.getElementById('custom-additions-container');
    const customAdditionsList = document.getElementById('custom-additions-list');
    const defaultRadio = document.querySelector('input[name="adicionais-option"][value="default"]');
    const customRadio = document.querySelector('input[name="adicionais-option"][value="custom"]');
    customAdditionsList.innerHTML = '';

    if (productData) {
        title.textContent = "Editar Produto";
        document.getElementById('product-id').value = productData.id;
        document.getElementById('product-name').value = productData.name;
        document.getElementById('product-price').value = productData.price;
        document.getElementById('product-description').value = productData.description;
        if (productData.image) document.getElementById('image-preview').src = productData.image;
        categorySelect.value = productData.category_id;
        
        if (productData.custom_additions && Array.isArray(productData.custom_additions) && productData.custom_additions.length > 0) {
            const firstGroup = productData.custom_additions[0];
            if (firstGroup && firstGroup.options) {
                customRadio.checked = true;
                customAdditionsContainer.style.display = 'block';
                firstGroup.options.forEach(addition => renderCustomAddition(addition));
            }
        } else {
            defaultRadio.checked = true;
            customAdditionsContainer.style.display = 'none';
        }

    } else {
        title.textContent = "Adicionar Novo Produto";
        defaultRadio.checked = true;
        customAdditionsContainer.style.display = 'none';
    }
    modal.classList.add('visible');
}

   async function saveProduct(e) {
    e.preventDefault();
    const id = document.getElementById('product-id').value;
    let customAdditions = null;

    if (document.querySelector('input[name="adicionais-option"]:checked').value === 'custom') {
        const options = [];
        document.querySelectorAll('.custom-addition-row').forEach(row => {
            const name = row.querySelector('.custom-addition-name').value;
            const price = parseFloat(row.querySelector('.custom-addition-price').value);
            if (name && !isNaN(price)) {
                options.push({ name, price });
            }
        });
        
        if (options.length > 0) {
            customAdditions = [{
                group_name: "Adicionais", 
                type: "checkbox",
                required: false,
                options: options
            }];
        }
    }

    const productData = { 
        name: document.getElementById('product-name').value, 
        price: parseFloat(document.getElementById('product-price').value), 
        category_id: parseInt(document.getElementById('product-category').value), 
        description: document.getElementById('product-description').value, 
        image: document.getElementById('image-preview').src, 
        available: true, 
        custom_additions: customAdditions 
    };

    try {
        let response;
        if (id) {
            response = await fetch(`/api/products/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(productData) });
            if (!response.ok) throw new Error('Falha ao atualizar o produto.');
            showNotification('Produto atualizado com sucesso!', 'success');
        } else {
            response = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(productData) });
            if (!response.ok) throw new Error('Falha ao criar o produto.');
            showNotification('Produto adicionado com sucesso!', 'success');
        }
        closeProductModal();
    } catch (error) {
        console.error('Erro ao salvar produto:', error);
        showNotification(error.message, 'error');
    }
}
    
    function closeProductModal() { document.getElementById('product-modal-overlay').classList.remove('visible'); }



function openSimplePromoModal(productId) {
    const product = Object.values(state.menu).flat().find(p => p.id == productId);
    if (!product) return;

    document.getElementById('simple-promo-product-id').value = product.id;
    document.getElementById('simple-promo-title').textContent = `Promoção para: ${product.name}`;
    document.getElementById('simple-promo-price').value = product.promo_price || '';
    document.getElementById('simple-promo-modal-overlay').classList.add('visible');
}

async function setSimplePromotion(event) {
    event.preventDefault();
    const productId = document.getElementById('simple-promo-product-id').value;
    const promoPrice = document.getElementById('simple-promo-price').value;

    try {
        const response = await fetch(`/api/products/${productId}/set-promo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ promo_price: promoPrice }) 
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        alert('Promoção atualizada! A página será recarregada.');
        window.location.reload();
    } catch (error) {
        alert(`Erro: ${error.message}`);
    }
}
    async function openRewardModal(rewardData = null) {
        const modalId = 'reward-modal-overlay';
        document.getElementById(modalId)?.remove();

        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.id = modalId;

        modalOverlay.innerHTML = `
            <div class="modal-content">
                <h2 id="reward-modal-title">${rewardData ? 'Editar Recompensa' : 'Nova Recompensa'}</h2>
                <form id="reward-form">
                    <input type="hidden" id="reward-id" value="${rewardData?.id || ''}">
                    <div class="form-group">
                        <label for="reward-name">Nome da Recompensa</label>
                        <input type="text" id="reward-name" value="${rewardData?.name || ''}" placeholder="Ex: Bauru Grátis" required>
                    </div>
                    <div class="form-group">
                        <label for="reward-description">Descrição (Opcional)</label>
                        <textarea id="reward-description" rows="2" placeholder="Uma breve descrição para o cliente.">${rewardData?.description || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label for="reward-product-id">Produto Base (para cálculo de pontos)</label>
                        <select id="reward-product-id">
                            <option value="">Nenhum (definir pontos manualmente)</option>
                        </select>
                    </div>
                    <div class="form-group" id="difficulty-group" style="display: none;">
                        <label>Nível de Dificuldade</label>
                        <div class="radio-group">
                            <label><input type="radio" name="difficulty" value="easy"> Fácil (~10%)</label>
                            <label><input type="radio" name="difficulty" value="normal" checked> Normal (~7%)</label>
                            <label><input type="radio" name="difficulty" value="hard"> Difícil (~4%)</label>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="reward-points-cost">Custo em Pontos</label>
                        <input type="number" id="reward-points-cost" value="${rewardData?.points_cost || ''}" required>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" id="cancel-reward-modal">Cancelar</button>
                        <button type="submit" class="btn btn-primary">Salvar Recompensa</button>
                    </div>
                </form>
                <button class="close-modal-button" id="close-reward-modal"><ion-icon name="close-outline"></ion-icon></button>
            </div>
        `;
        document.body.appendChild(modalOverlay);
        
        const productSelect = document.getElementById('reward-product-id');
        const difficultyGroup = document.getElementById('difficulty-group');
        const pointsInput = document.getElementById('reward-points-cost');

        const calculatePoints = () => {
            const selectedOption = productSelect.options[productSelect.selectedIndex];
            if (!selectedOption || !selectedOption.value) {
                difficultyGroup.style.display = 'none';
                return;
            }
            const price = parseFloat(selectedOption.dataset.price);
            const difficulty = document.querySelector('input[name="difficulty"]:checked').value;
            
            difficultyGroup.style.display = 'block';

            let returnPercentage = 0.07;
            if (difficulty === 'easy') returnPercentage = 0.10;
            if (difficulty === 'hard') returnPercentage = 0.04;
            
            const spendingNeeded = price / returnPercentage;
            const calculatedPoints = spendingNeeded / 2;
            pointsInput.value = Math.ceil(calculatedPoints / 5) * 5;
        };
        
        productSelect.addEventListener('change', calculatePoints);
        document.querySelectorAll('input[name="difficulty"]').forEach(radio => radio.addEventListener('change', calculatePoints));
        
        modalOverlay.querySelector('#cancel-reward-modal').addEventListener('click', () => modalOverlay.remove());
        modalOverlay.querySelector('#close-reward-modal').addEventListener('click', () => modalOverlay.remove());

        try {
            const res = await fetch('/api/admin/products-list');
            const products = await res.json();
            products.forEach(p => {
                const option = document.createElement('option');
                option.value = p.id;
                option.textContent = `${p.name} (${formatCurrency(p.price)})`;
                option.dataset.price = p.price;
                productSelect.appendChild(option);
            });
            if (rewardData?.product_id) {
                productSelect.value = rewardData.product_id;
            }
            calculatePoints();
            modalOverlay.classList.add('visible');
        } catch (error) {
            showNotification('Erro ao carregar lista de produtos.', 'error');
            modalOverlay.remove();
        }
    }
    


function renderRecompensasView(viewElement) {
    viewElement.innerHTML = `
        <div class="view-header">
            <div>
                <h2>Recompensas</h2>
                <p>Gerencie os prêmios do seu programa de fidelidade.</p>
            </div>
            <div class="view-header-actions">
                <button class="btn btn-primary" id="add-new-reward-btn"><ion-icon name="add-outline"></ion-icon>Nova Recompensa</button>
            </div>
        </div>
        <div class="rewards-grid" id="rewards-grid-container">
            <p>Carregando recompensas...</p>
        </div>
    `;
    fetchAndRenderRewards();
}

async function fetchAndRenderRewards() {
    try {
        const response = await fetch('/api/admin/rewards');
        if (!response.ok) throw new Error('Falha ao buscar recompensas.');
        state.rewards = await response.json();
    
        const container = document.getElementById('rewards-grid-container');
        if (!container) return; 

        if (state.rewards.length === 0) {
            container.innerHTML = '<p>Nenhuma recompensa cadastrada ainda. Clique em "Nova Recompensa" para começar.</p>';
            return;
        }
        container.innerHTML = state.rewards.map(createRewardCardHTML).join('');
    } catch (error) {
        console.error(error);
        showNotification(error.message, 'error');
        const container = document.getElementById('rewards-grid-container');
        if(container) container.innerHTML = '<p style="color: var(--primary-color);">Erro ao carregar recompensas.</p>';
    }
}

function createRewardCardHTML(reward) {
    return `
        <div class="reward-card" data-reward-id="${reward.id}">
            <div class="reward-card-header">
                <h4>${reward.name}</h4>
                <span class="reward-points"><ion-icon name="star"></ion-icon> ${reward.points_cost} Pts</span>
            </div>
            <p>${reward.description || 'Sem descrição.'}</p>
            <div class="reward-card-footer">
                <div class="product-availability-switch">
                    <span>Ativa</span>
                    <label class="switch">
                        <input type="checkbox" class="reward-status-toggle" data-reward-id="${reward.id}" ${reward.is_active ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="reward-card-actions">
                    <button class="btn-category-action btn-edit-reward" data-reward-id="${reward.id}" title="Editar"><ion-icon name="pencil-outline"></ion-icon></button>
                    <button class="btn-category-action btn-delete-reward" data-reward-id="${reward.id}" title="Excluir"><ion-icon name="trash-outline"></ion-icon></button>
                </div>
            </div>
        </div>
    `;
}

async function saveReward(e) {
    e.preventDefault();
    const id = document.getElementById('reward-id').value;
    const rewardData = {
        name: document.getElementById('reward-name').value,
        description: document.getElementById('reward-description').value,
        points_cost: parseInt(document.getElementById('reward-points-cost').value),
        productId: document.getElementById('reward-product-id').value,
        difficulty: document.querySelector('input[name="difficulty"]:checked').value,
        is_active: true
    };
    
    if (id) {
        delete rewardData.productId;
        delete rewardData.difficulty;
        const existingReward = state.rewards.find(r => r.id == id);
        rewardData.is_active = existingReward ? existingReward.is_active : true;
    }

    try {
        const url = id ? `/api/admin/rewards/${id}` : '/api/admin/rewards';
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rewardData)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Falha ao salvar recompensa.');
        }
        
        showNotification(`Recompensa ${id ? 'atualizada' : 'criada'} com sucesso!`, 'success');
        document.getElementById('reward-modal-overlay')?.remove();
        
        fetchAndRenderRewards();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function deleteReward(rewardId) {
    if (!confirm('Tem certeza que deseja excluir esta recompensa?')) return;
    try {
        const response = await fetch(`/api/admin/rewards/${rewardId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Falha ao excluir recompensa.');
        
        showNotification('Recompensa excluída com sucesso!', 'success');
        
        fetchAndRenderRewards();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function updateRewardStatus(rewardId, isActive) {
    const reward = state.rewards.find(r => r.id == rewardId);
    if (!reward) return;
    
    const updatedRewardData = {
        name: reward.name,
        description: reward.description,
        points_cost: reward.points_cost,
        is_active: isActive
    };

    try {
        const response = await fetch(`/api/admin/rewards/${rewardId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedRewardData)
        });
        if (!response.ok) throw new Error('Falha ao atualizar status.');
        
        showNotification('Status da recompensa atualizado!', 'success');
        reward.is_active = isActive;
    } catch (error) {
        showNotification(error.message, 'error');
        const toggle = document.querySelector(`.reward-status-toggle[data-reward-id="${rewardId}"]`);
        if (toggle) toggle.checked = !isActive;
    }
} 
    function openConfirmModal(productId) {
        const modal = document.getElementById('confirm-modal-overlay');
        modal.dataset.productIdToDelete = productId;
        modal.classList.add('visible');
    }

    function closeConfirmModal() { document.getElementById('confirm-modal-overlay').classList.remove('visible'); }

    async function deleteProduct(productId) {
        try {
            const response = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Falha ao excluir o produto.');
            showNotification('Produto excluído com sucesso!', 'success');
            closeConfirmModal();
            await fetchCategoriesAndProducts();
            renderView('cardapio');
        } catch (error) {
            console.error('Erro ao excluir produto:', error);
            showNotification(error.message, 'error');
        }
    }

    async function renameCategory(categoryId) {
        const category = state.categories.find(c => c.id === categoryId);
        if (!category) return;
        const newName = prompt(`Digite o novo nome para a categoria "${category.name}":`, category.name);
        if (newName && newName.trim() !== '' && newName !== category.name) {
            try {
                const updatedCategory = { ...category, name: newName.trim() };
                const response = await fetch(`/api/categories/${categoryId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedCategory) });
                if (!response.ok) throw new Error('Falha ao renomear a categoria.');
                showNotification('Categoria renomeada com sucesso!', 'success');
                await fetchCategoriesAndProducts();
                renderView('cardapio');
            } catch (error) { console.error('Erro ao renomear categoria:', error); showNotification(error.message, 'error'); }
        }
    }

    async function toggleCategoryVisibility(categoryId) {
        const category = state.categories.find(c => c.id === categoryId);
        if (!category) return;
        try {
            const updatedCategory = { ...category, is_visible: !category.is_visible };
            const response = await fetch(`/api/categories/${categoryId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedCategory) });
            if (!response.ok) throw new Error('Falha ao alterar a visibilidade.');
            showNotification('Visibilidade da categoria alterada!', 'success');
            await fetchCategoriesAndProducts();
            renderView('cardapio');
        } catch (error) { console.error('Erro ao alterar visibilidade:', error); showNotification(error.message, 'error'); }
    }

    async function createNewCategory() {
        const name = prompt("Digite o nome da nova categoria:");
        if (name && name.trim() !== '') {
            try {
                const response = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
                if (!response.ok) throw new Error('Falha ao criar a categoria.');
                showNotification('Nova categoria criada com sucesso!', 'success');
                await fetchCategoriesAndProducts();
                renderView('cardapio');
            } catch (error) { console.error('Erro ao criar categoria:', error); showNotification(error.message, 'error'); }
        }
    }
    
    function showNotification(message, type = "success") {
        const area = document.getElementById('notification-area');
        if (!area) return;
        const notification = document.createElement('div');
        notification.className = `notification-message ${type}`;
        notification.textContent = message;
        area.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => { notification.classList.remove('show'); notification.addEventListener('transitionend', () => notification.remove()); }, 3000);
    }

    function formatarDeliveryParaImpressao(delivery_info) {
    if (delivery_info.tipo === 'retirada' || delivery_info.tipo === 'Retirada') {
        return `<p class="center"><b>*** RETIRADA NO BALCÃO ***</b></p>`;
    }
    let text = `<p><b>*** ENDERECO DE ENTREGA ***</b></p>`;
    text += `<p><b>Rua:</b> ${delivery_info.rua}, ${delivery_info.numero}</p>`;
    text += `<p><b>Bairro:</b> ${delivery_info.bairro}</p>`;
    if (delivery_info.complemento) text += `<p><b>Comp:</b> ${delivery_info.complemento}</p>`;
    if (delivery_info.referencia) text += `<p><b>Ref:</b> ${delivery_info.referencia}</p>`;
    return text;
}


// admin-script.js

function formatarPagamentoParaImpressao(payment_info, delivery_info, total_value, status) {
    const metodo = payment_info.metodo ? payment_info.metodo.toLowerCase() : '';

    if (status === 'Aguardando Pagamento' || status === 'Pendente de Pagamento') {
        return `<p><b>Status:</b> <span style="color: var(--orange-accent-color);">AGUARDANDO PAGAMENTO</span></p><p><b>Método:</b> ${payment_info.metodo.toUpperCase()}</p>`;
    }

    if (metodo.includes('pix') || metodo.includes('card_online') || (metodo.includes('card') && !metodo.includes('maquininha'))) {
        let paymentType = metodo.includes('pix') ? 'PIX' : 'CARTÃO';
        return `<p style="font-weight: bold; color: var(--secondary-color);">*** PAGO ONLINE (${paymentType}) ***</p>`;
    }
    
    if (metodo === 'cartao_maquininha') {
        return `<p>PAGAR NA ENTREGA (CARTÃO DE CRÉDITO)</p>`;
    }
    if (metodo === 'cartao_maquininha_debito') {
        return `<p>PAGAR NA ENTREGA (CARTÃO DE DÉBITO)</p>`;
    }
    
    if (metodo === 'dinheiro') {
        // *** ESTA É A CORREÇÃO ***
        const valorTroco = parseFloat(payment_info.trocoPara) || 0;
        const valorTotal = parseFloat(total_value) || 0;
        
        let text = `<p><b>Pagamento:</b> 💵 PAGAR NA ENTREGA (Dinheiro)</p>`;
        if (valorTroco > 0 && valorTroco > valorTotal) {
            const troco = valorTroco - valorTotal;
            text += `<p style="font-size: 1.2em; font-weight: bold; color: var(--primary-color);">LEVAR TROCO: ${formatCurrency(troco)}</p>
                     <p><b>Pagar com:</b> ${formatCurrency(valorTroco)}</p>`;
        } else {
            text += `<p>(Sem troco)</p>`;
        }
        return text;
    }
    
    if (metodo === 'retirada') {
        return `<p><b>Pagamento:</b> PAGAR NA RETIRADA</p>`;
    }

    return `<p>${payment_info.metodo.toUpperCase()}</p>`;
}
function imprimirRelatorioFechamento(data) {
    if (!data) {
        showNotification("Não há dados para imprimir no relatório.", "error");
        return;
    }

    const now = new Date();
    const formattedDate = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    const relatorioHTML = `
        <div id="relatorio-para-imprimir">
            <div style="text-align: center;">
                <h2 style="font-size: 14pt; margin: 0; font-weight: bold;">Zap Esfirras</h2>
                <p style="font-size: 12pt; margin: 0; font-weight: bold;">Relatório de Fechamento de Caixa</p>
            </div>
            <hr style="border: none; border-top: 1px dashed black; margin: 10px 0;">
            <p><strong>Período do Relatório:</strong> ${data.periodo || 'N/A'}</p>
            <p><strong>Gerado em:</strong> ${formattedDate}</p>
            <hr style="border: none; border-top: 1px dashed black; margin: 10px 0;">
            
            <h3 style="font-size: 12pt; margin-bottom: 10px; font-weight: bold;">Resumo Financeiro</h3>
            <p><strong>Recebido Online:</strong> ${formatCurrency(data.faturamentoOnline)}</p>
            <p><strong>A Receber (Entrega/Retirada):</strong> ${formatCurrency(data.faturamentoNaEntrega)}</p>
            <hr style="border: none; border-top: 1px dotted black; margin: 5px 0;">
            <p><strong>FATURAMENTO TOTAL:</strong> ${formatCurrency(data.faturamentoTotal)}</p>
            
            <hr style="border: none; border-top: 1px dashed black; margin: 10px 0;">
            
            <h3 style="font-size: 12pt; margin-bottom: 10px; font-weight: bold;">Resumo Operacional</h3>
            <p><strong>Total de Pedidos Pagos:</strong> ${data.totalPedidos}</p>
            <p><strong>Ticket Médio:</strong> ${formatCurrency(data.ticketMedio)}</p>
            <p><strong>Visitas na Loja (Hoje):</strong> ${data.visitasHoje}</p>
            <hr style="border: none; border-top: 1px dashed black; margin: 10px 0;">
        </div>
    `;

    printJS({
        printable: relatorioHTML,
        type: 'raw-html',
        documentTitle: `Fechamento de Caixa - ${data.periodo}`,
        style: `@page { size: auto; margin: 0mm; } body { font-family: 'Courier New', monospace; font-size: 10pt; width: 280px; margin: 5mm; padding: 0; color: black; font-weight: bold; } h2, h3, p, strong { font-weight: bold; }`
    });
}

function imprimirCupom(order) {
    const clientInfo = typeof order.client_info === 'string' ? JSON.parse(order.client_info) : order.client_info;
    const deliveryInfo = typeof order.delivery_info === 'string' ? JSON.parse(order.delivery_info) : order.delivery_info;
    const paymentInfo = typeof order.payment_info === 'string' ? JSON.parse(order.payment_info) : order.payment_info;
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    const now = new Date(order.created_at);
    const formattedDate = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    const isDelivery = deliveryInfo.tipo === 'padrao' || deliveryInfo.tipo === 'Entrega';

  
    const tipoPagamento = paymentInfo.tipo ? paymentInfo.tipo.toLowerCase() : '';
    const isOnlinePayment = ['credit_card', 'debit_card', 'account_money'].includes(tipoPagamento) || paymentInfo.metodo === 'pix';

    let itemsText = items.map(item => {
        let text = `<tr><td style="text-align: left; font-weight: bold; font-size: 11pt; padding-right: 5px; vertical-align: top;">${item.quantity || 1}x ${item.name || 'Item não encontrado'}</td><td style="text-align: right; font-weight: bold; font-size: 11pt; vertical-align: top;">${formatCurrency((item.price || 0) * (item.quantity || 1))}</td></tr>`;
        if (item.observacao) {
            item.observacao.split('|').forEach(detail => { text += `<tr><td colspan="2" style="font-size: 10pt; padding-left: 15px; font-weight: bold;">&nbsp;↳ ${detail.trim()}</td></tr>`; });
        }
        if (item.adicionais && item.adicionais.length > 0) {
            item.adicionais.forEach(ad => { text += `<tr><td colspan="2" style="font-size: 10pt; padding-left: 15px; font-weight: bold; font-style: italic;">&nbsp;↳ + ${ad.name}</td></tr>`; });
        }
        return text;
    }).join('');

    const deliveryText = formatarDeliveryParaImpressao(deliveryInfo);
    const paymentText = formatarPagamentoParaImpressao(paymentInfo, deliveryInfo, order.total_value, order.status);
    const subtotalComEntrega = (parseFloat(order.subtotal) || 0) + (parseFloat(order.delivery_fee) || 0);

    const financialTableHTML = `<table style="width: 100%; font-weight: bold;"><tr><td>Subtotal dos Itens:</td><td style="text-align: right;">${formatCurrency(order.subtotal)}</td></tr><tr><td>Taxa de Entrega:</td><td style="text-align: right;">${formatCurrency(order.delivery_fee)}</td></tr><tr><td colspan="2"><hr style="border: none; border-top: 1px dashed black; margin: 5px 0;"></td></tr><tr><td>Subtotal:</td><td style="text-align: right;">${formatCurrency(subtotalComEntrega)}</td></tr><tr><td>Descontos:</td><td style="text-align: right;">- ${formatCurrency(order.discount_value)}</td></tr><tr><td colspan="2"><hr style="border: none; border-top: 1px dashed black; margin: 5px 0;"></td></tr><tr style="font-size: 12pt;"><td>TOTAL:</td><td style="text-align: right;">${formatCurrency(order.total_value)}</td></tr></table>`;
    let deliveryNumberHeader = order.delivery_number ? `<div style="text-align: center; margin-bottom: 10px;"><h1 style="font-size: 22pt; font-weight: bold; margin: 0;">${order.delivery_number}</h1></div>` : '';

    let cobrarClienteFooter = '';
    if (!isOnlinePayment && order.total_value > 0) { 
        let trocoInfo = '';
        if (paymentInfo.metodo === 'Dinheiro' && paymentInfo.trocoPara && paymentInfo.trocoPara > order.total_value) {
            const troco = paymentInfo.trocoPara - order.total_value;
            trocoInfo = `<p style="font-size: 10pt; margin: 0; font-weight: bold;">LEVAR TROCO: ${formatCurrency(troco)} (Pagar com ${formatCurrency(paymentInfo.trocoPara)})</p>`;
        }
        cobrarClienteFooter = `${trocoInfo}<hr style="border: none; border-top: 1px dashed black; margin: 10px 0;"><table style="width: 100%;"><tr><td style="font-weight: bold; font-size: 14pt;">Cobrar do Cliente:</td><td style="text-align: right; font-weight: bold; font-size: 14pt;">${formatCurrency(order.total_value)}</td></tr></table>`;
    } else if (isOnlinePayment) {
        cobrarClienteFooter = `<hr style="border: none; border-top: 1px dashed black; margin: 10px 0;"><table style="width: 100%;"><tr><td style="font-weight: bold; font-size: 14pt;">Cobrar do Cliente:</td><td style="text-align: right; font-weight: bold; font-size: 14pt;">R$ 0,00</td></tr></table>`;
    }

    const cupomHTML = `... (o restante do seu HTML da impressão, que não precisa mudar) ...`; 
    const finalCupomHTML = `<div id="cupom-para-imprimir">${deliveryNumberHeader}<div style="text-align: center;"><h2 style="font-size: 14pt; margin: 0; font-weight: bold;">Zap Esfirras</h2><p style="font-size: 9pt; margin: 0; font-weight: bold;">Rua Gabriel Pinheiro, 75 - Centro</p><p style="font-size: 9pt; margin: 0; font-weight: bold;">CNPJ: 31.100.510/0001-64</p></div><hr style="border: none; border-top: 1px dashed black; margin: 10px 0;"><div style="text-align: center; font-size: 14pt; font-weight: bold; text-transform: uppercase;">${isDelivery ? "ENTREGA" : "VEM RETIRAR"}</div><hr style="border: none; border-top: 1px dashed black; margin: 10px 0;"><p style="font-weight: bold;"><b>Pedido:</b> #${order.id} | <b>Data:</b> ${formattedDate}</p><p style="font-weight: bold;"><b>Cliente:</b> ${clientInfo.nome}</p>${deliveryText}<hr style="border: none; border-top: 1px dashed black; margin: 10px 0;"><h3 style="font-size: 12pt; margin: 0; font-weight: bold;">Itens do Pedido</h3><table style="width: 100%; border-collapse: collapse;"><thead><tr><th style="text-align: left;">QTD DESCRICAO</th><th style="text-align: right;">VALOR</th></tr></thead><tbody>${itemsText}</tbody></table><hr style="border: none; border-top: 1px dashed black; margin: 10px 0;">${financialTableHTML}<hr style="border: none; border-top: 1px dashed black; margin: 10px 0;"><div style="text-align: center;"><p><b>FORMA DE PAGAMENTO:</b></p>${paymentText}</div>${cobrarClienteFooter}</div>`;

    printJS({ printable: finalCupomHTML, type: 'raw-html', documentTitle: `Pedido ${order.delivery_number || order.id}`, style: `@page { size: auto; margin: 0mm; } body { font-family: 'Courier New', monospace; font-size: 10pt; width: 280px; margin: 5mm; padding: 0; color: black; font-weight: bold; } h1, h2, h3, p, table, td, th { font-weight: bold; }` });
}
const formatCurrency = (value) => (parseFloat(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    const findCategoryByProductId = (productId) => {
        const product = Object.values(state.menu).flat().find(p => p.id == productId);
        return product ? state.categories.find(c => c.name === product.category_name) : null;
    };

    function formatarDetalhesEntrega(delivery_info) {
        if (delivery_info.tipo === 'retirada') {
            return `<p><b>Tipo:</b> <span style="font-weight: bold; color: var(--blue-accent-color);">RETIRADA NO BALCÃO</span></p>`;
        }
        let addressHTML = `<p><b>Tipo:</b> <span style="font-weight: bold; color: var(--secondary-color);">ENTREGA</span></p>`;
        addressHTML += `<p><b>Endereço:</b> ${delivery_info.rua}, ${delivery_info.numero}</p>`;
        addressHTML += `<p><b>Bairro:</b> ${delivery_info.bairro}</p>`;
        if (delivery_info.complemento) addressHTML += `<p><b>Comp:</b> ${delivery_info.complemento}</p>`;
        if (delivery_info.referencia) addressHTML += `<p><b>Ref:</b> ${delivery_info.referencia}</p>`;
        return addressHTML;
    }

   // admin-script.js

  // admin-script.js

function formatarDetalhesPagamento(payment_info, delivery_info, total_value, status) {
    if (status === 'Aguardando Pagamento' || status === 'Pendente de Pagamento') {
        return `<p><b>Status:</b> <span style="color: var(--orange-accent-color);">AGUARDANDO PAGAMENTO</span></p>`;
    }

    const metodo = payment_info.metodo ? payment_info.metodo.toLowerCase() : '';
    const tipo = payment_info.tipo ? payment_info.tipo.toLowerCase() : '';

    if (metodo === 'pix' || tipo === 'account_money') {
        return `<p><b>Pagamento:</b> <span style="font-weight: bold; color: var(--secondary-color);">✅ PAGO (PIX / Saldo MP)</span></p>`;
    }
    if (tipo === 'credit_card') {
        return `<p><b>Pagamento:</b> <span style="font-weight: bold; color: var(--secondary-color);">✅ PAGO (Cartão de Crédito)</span></p>`;
    }
    if (tipo === 'debit_card') {
        return `<p><b>Pagamento:</b> <span style="font-weight: bold; color: var(--secondary-color);">✅ PAGO (Cartão de Débito)</span></p>`;
    }
    if (metodo === 'dinheiro') {
        // *** ESTA É A CORREÇÃO ***
        const valorTroco = parseFloat(payment_info.trocoPara) || 0;
        const valorTotal = parseFloat(total_value) || 0;

        if (valorTroco > 0 && valorTroco > valorTotal) {
            const troco = valorTroco - valorTotal;
            return `<p><b>Pagamento:</b> 💵 PAGAR NA ENTREGA (Dinheiro)</p>
                    <p><b>Pagar com:</b> ${formatCurrency(valorTroco)}</p>
                    <p style="font-size: 1.2em; font-weight: bold; color: var(--primary-color);">LEVAR TROCO: ${formatCurrency(troco)}</p>`;
        }
        return `<p><b>Pagamento:</b> 💵 PAGAR NA ENTREGA (Dinheiro - Sem troco)</p>`;
    }
    if (metodo === 'retirada' || metodo === 'pagar na retirada') {
        return `<p><b>Pagamento:</b> PAGAR NA RETIRADA</p>`;
    }

    return `<p><b>Método:</b> ${payment_info.metodo || 'Não informado'}</p>`;
}
    async function toggleProductAvailability(productId, isAvailable) {
        const category = findCategoryByProductId(productId);
        if (!category) return;
        const product = state.menu[category.name].find(p => p.id == productId);
        if (product) {
            const updatedProduct = { ...product, available: isAvailable, category_id: product.category_id };
            try {
                const response = await fetch(`/api/products/${productId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedProduct) });
                if (!response.ok) throw new Error('Falha ao atualizar disponibilidade.');
                product.available = isAvailable;
                showNotification(`Disponibilidade atualizada.`, 'success');
            } catch (error) {
                console.error('Erro ao atualizar disponibilidade:', error);
                showNotification(error.message, 'error');
                const checkbox = document.querySelector(`.availability-toggle[data-product-id="${productId}"]`);
                if (checkbox) checkbox.checked = !isAvailable;
            }
        }
    }


async function updateOrderStatus(orderId, newStatus) {
    const order = state.orders.find(o => o.id == orderId);
    if (!order) return;

    const updateData = {
        status: newStatus
    };

    try {
        const response = await fetch(`/api/orders/${orderId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        if (!response.ok) {
            throw new Error('Falha ao atualizar o status do pedido no servidor.');
        }
        
        order.status = newStatus;
        renderView(state.currentView);
        
        showNotification(`Pedido #${orderId} atualizado para "${newStatus}".`, 'success');
    } catch (error) {
        console.error("Erro ao atualizar status:", error);
        showNotification(error.message, "error");
    }
}
    function toggleSidebar() {
        sidebar.classList.toggle('visible');
        sidebarOverlay.classList.toggle('active');
    }



function configurarEventListeners() {
    if (listenersConfigurados) return;

    document.body.addEventListener('click', unlockAudio, { once: true });
    if (menuToggle) menuToggle.addEventListener('click', toggleSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);
    if (logoutButton) logoutButton.addEventListener('click', (e) => {
        e.preventDefault();
        sessionStorage.clear();
        window.location.href = 'login.html';
    });

    const simplePromoForm = document.getElementById('simple-promo-form');
    if (simplePromoForm) {
        simplePromoForm.addEventListener('submit', setSimplePromotion);
    }
    const cancelSimplePromoBtn = document.getElementById('btn-cancel-simple-promo');
    if (cancelSimplePromoBtn) {
        cancelSimplePromoBtn.addEventListener('click', () => {
            document.getElementById('simple-promo-modal-overlay').classList.remove('visible');
        });
    }
    const removePromoBtn = document.getElementById('btn-remove-promo');
    if (removePromoBtn) {
        removePromoBtn.addEventListener('click', () => {
            document.getElementById('simple-promo-price').value = null;
            simplePromoForm.dispatchEvent(new Event('submit'));
        });
    }

    document.addEventListener('click', (e) => {
        const target = e.target;
        const navLink = target.closest('.nav-link');
        if (navLink) {
            if (window.innerWidth <= 992 && sidebar.classList.contains('visible')) { toggleSidebar(); }
            if (!navLink.classList.contains('active')) {
                e.preventDefault();
                document.querySelector('.nav-link.active')?.classList.remove('active');
                navLink.classList.add('active');
                renderView(navLink.dataset.view);
            }
            return;
        }

        // *** Listeners do Modal "Fechar Caixa" ***
        if (target.closest('#btn-fechar-caixa-header')) {
            const modal = document.getElementById('fechar-caixa-confirm-modal');
            if (modal) modal.classList.add('visible');
            return;
        }
        if (target.closest('#btn-cancelar-fechamento')) {
            document.getElementById('fechar-caixa-confirm-modal').classList.remove('visible');
            return;
        }
        if (target.closest('#btn-confirmar-fechamento')) {
            document.getElementById('fechar-caixa-confirm-modal').classList.remove('visible');
            executarFechamentoCaixa();
            return;
        }
        // *** FIM dos Listeners do Modal "Fechar Caixa" ***

        if (target.closest('.print-button')) { const order = state.orders.find(o => o.id == state.selectedOrderId); if (order) imprimirCupom(order); return; }
        if (target.closest('#print-report-btn')) { imprimirRelatorio(); return; }
        if (target.closest('#add-new-product-btn')) { openProductModal(); return; }
        if (target.closest('#add-new-category-btn')) { createNewCategory(); return; }
        if (target.closest('#add-new-reward-btn')) { openRewardModal(); return; }
        if (target.closest('#cancel-modal-button') || target.closest('#close-modal-button')) { closeProductModal(); return; }
        if (target.closest('#cancel-confirm-button')) { closeConfirmModal(); return; }
        if (target.closest('#confirm-delete-button')) { deleteProduct(document.getElementById('confirm-modal-overlay').dataset.productIdToDelete); return; }
     if (target.closest('#add-new-addition-btn')) { renderCustomAddition(); }
        if (target.closest('.btn-remove-addition')) { target.closest('.custom-addition-row').remove(); }

        switch (state.currentView) {
            case 'pedidos':
                handlePedidosClick(target, e);
                break;
            case 'cardapio':
                handleCardapioClick(target);
                break;
            case 'recompensas':
                handleRecompensasClick(target);
             break;
            case 'clientes':
                break;
            case 'avaliacoes': 
                break;
        }
    });

    document.addEventListener('input', (e) => {
        if (e.target.id === 'product-search-input') { 
            const searchTerm = e.target.value.toLowerCase().trim();
            
            document.querySelectorAll('.product-card').forEach(card => {
              const productName = card.querySelector('h4').textContent.toLowerCase();
                const shouldShow = productName.includes(searchTerm);
                card.style.display = shouldShow ? 'flex' : 'none';
            });

            document.querySelectorAll('.category-section').forEach(section => {
                const visibleProducts = section.querySelectorAll('.product-card:not([style*="display: none"])');
                section.style.display = visibleProducts.length > 0 ? 'block' : 'none';
            });
        }
    });

    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('availability-toggle')) { toggleProductAvailability(e.target.dataset.productId, e.target.checked); }
        if (e.target.id === 'theme-toggle') { applyTheme(e.target.checked ? 'dark' : 'light'); }
        if (e.target.classList.contains('reward-status-toggle')) { updateRewardStatus(e.target.dataset.rewardId, e.target.checked); }
        if (e.target.matches('input[name="adicionais-option"]')) {
            const customAdditionsContainer = document.getElementById('custom-additions-container');
            if (e.target.value === 'custom') {
                customAdditionsContainer.style.display = 'block';
                if (document.getElementById('custom-additions-list').children.length === 0) {
                    renderCustomAddition();
                }
            } else {
                customAdditionsContainer.style.display = 'none';
            }
        }
    });

    document.addEventListener('submit', (e) => {
        if (e.target.id === 'product-form') { e.preventDefault(); saveProduct(e); }
        if (e.target.id === 'reward-form') { e.preventDefault(); saveReward(e); }
    });

    listenersConfigurados = true;
}
// admin-script.js

// SUBSTITUA A FUNÇÃO handlePedidosClick
function handlePedidosClick(target, event) {
    const card = target.closest('.order-card');
    const button = target.closest('.action-button');
    const sectionHeader = target.closest('.section-header');

    if (button) {
        event.stopPropagation();
        
        // *** MUDANÇA AQUI: Lógica para o botão Aceitar e Imprimir ***
        if (button.classList.contains('accept-print')) {
            const orderId = button.dataset.orderId;
            // 1. Atualiza o status para 'Em Preparo'
            updateOrderStatus(orderId, 'Em Preparo');
            
            // 2. Encontra o pedido e manda imprimir
            const order = state.orders.find(o => o.id == orderId);
            if (order) {
                imprimirCupom(order);
            }
        } else {
            // Lógica padrão para os outros botões
            updateOrderStatus(button.dataset.orderId, button.dataset.nextStatus);
        }

    } else if (card) {
        state.selectedOrderId = card.dataset.orderId;
        document.querySelector('.order-card.active')?.classList.remove('active');
        card.classList.add('active');
        renderOrderDetails(state.selectedOrderId);
    } else if (sectionHeader) {
        const statusSection = sectionHeader.parentElement;
        const status = statusSection.dataset.status;
        statusSection.classList.toggle('collapsed');
        if (statusSection.classList.contains('collapsed')) {
            state.collapsedSections.add(status);
        } else {
            state.collapsedSections.delete(status);
        }
    }
}
async function renderClientesView(viewElement) {
    viewElement.innerHTML = `
        <div class="view-header">
            <div><h2>Clientes Cadastrados</h2><p>Visualize todos os clientes que criaram uma conta.</p></div>
        </div>
        <div id="customers-summary"></div>
        <div id="customers-list-container" class="subscriber-grid">Carregando clientes...</div>
    `;

    try {
        const response = await fetch('/api/admin/customers');
        if (!response.ok) throw new Error('Falha ao buscar a lista de clientes.');

        const customers = await response.json();
        const container = document.getElementById('customers-list-container');
        const summaryContainer = document.getElementById('customers-summary');

        if (customers.length === 0) {
            container.innerHTML = '<p>Nenhum cliente cadastrado ainda.</p>';
            summaryContainer.innerHTML = '';
            return;
        }

        summaryContainer.innerHTML = `
            <div class="report-kpi-grid" style="margin-bottom: 24px;">
                <div class="kpi-card">
                    <div class="kpi-card-title">Total de Clientes Cadastrados</div>
                    <div class="kpi-card-value">${customers.length}</div>
                </div>
            </div>
        `;

        container.innerHTML = customers.map(customer => {
            const registrationDate = new Date(customer.created_at).toLocaleDateString('pt-BR');
            const isClubMember = customer.is_club_subscriber 
                ? '<span class="status-badge active" style="background-color: #E3F2FD; color: #1E88E5;">Sim</span>' 
                : '<span class="status-badge inactive" style="background-color: #F1F3F5; color: #5a5a5a;">Não</span>';

            return `
                <div class="subscriber-card">
                    <div class="subscriber-card-header">
                        <ion-icon name="person-circle-outline"></ion-icon>
                        <span class="subscriber-name">#${customer.id} - ${customer.name}</span>
                    </div>
                    <div class="subscriber-card-body">
                        <div class="subscriber-info-item">
                            <ion-icon name="mail-outline"></ion-icon>
                            <span>${customer.email || 'Não informado'}</span>
                        </div>
                        <div class="subscriber-info-item">
                            <ion-icon name="call-outline"></ion-icon>
                            <span>${customer.phone}</span>
                        </div>
                        <div class="subscriber-info-item">
                            <ion-icon name="calendar-outline"></ion-icon>
                            <span>Cadastrado em: <strong>${registrationDate}</strong></span>
                        </div>
                        <div class="subscriber-info-item">
                            <ion-icon name="star-outline"></ion-icon>
                            <span>Membro ZapClube: ${isClubMember}</span>
                        </div>
                         <div class="subscriber-info-item">
                            <ion-icon name="ribbon-outline"></ion-icon>
                            <span>Pontos: <strong>${customer.points}</strong></span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error("Erro ao renderizar clientes:", error);
        document.getElementById('customers-list-container').innerHTML = '<p style="color: var(--primary-color);">Erro ao carregar a lista de clientes.</p>';
    }
}

async function renderAvaliacoesView(viewElement) {
    viewElement.innerHTML = `
        <div class="view-header">
            <div><h2>Avaliações de Clientes</h2><p>Veja o feedback sobre a experiência no site.</p></div>
        </div>
        <div id="ratings-summary"></div>
        <div id="ratings-list-container" class="ratings-list-container">Carregando avaliações...</div>
    `;

    try {
        const response = await fetch('/api/admin/ratings');
        if (!response.ok) throw new Error('Falha ao buscar avaliações.');

        const ratings = await response.json();
        const container = document.getElementById('ratings-list-container');
        const summaryContainer = document.getElementById('ratings-summary');

        if (ratings.length === 0) {
            container.innerHTML = '<p>Nenhuma avaliação recebida ainda.</p>';
            summaryContainer.innerHTML = '';
            return;
        }

        const totalRatings = ratings.length;
        const sumOfRatings = ratings.reduce((sum, r) => sum + r.rating, 0);
        const averageRating = (sumOfRatings / totalRatings).toFixed(2);

        summaryContainer.innerHTML = `
            <div class="report-kpi-grid">
                 <div class="kpi-card">
                    <div class="kpi-card-title">Média Geral</div>
                    <div class="kpi-card-value">${averageRating.replace('.', ',')} ⭐</div>
                </div>
                 <div class="kpi-card">
                    <div class="kpi-card-title">Total de Avaliações</div>
                    <div class="kpi-card-value">${totalRatings}</div>
                </div>
            </div>
        `;

        container.innerHTML = ratings.map(rating => {
            const clientInfo = typeof rating.client_info === 'string' ? JSON.parse(rating.client_info) : rating.client_info;
            const starsHTML = Array.from({ length: 5 }, (_, i) => 
                `<ion-icon name="${i < rating.rating ? 'star' : 'star-outline'}" style="color: #ffca28;"></ion-icon>`
            ).join('');

            return `
                <div class="rating-card">
                    <div class="rating-card-header">
                        <span class="rating-card-order">Pedido #${rating.id} - <strong>${clientInfo.nome}</strong></span>
                        <span class="rating-card-date">${new Date(rating.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                    <div class="rating-card-body">
                        <div class="rating-card-stars">${starsHTML}</div>
                        ${rating.rating_comment ? `<p class="rating-card-comment">"${rating.rating_comment}"</p>` : '<p class="rating-card-comment-empty">Nenhum comentário.</p>'}
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error("Erro ao renderizar avaliações:", error);
        document.getElementById('ratings-list-container').innerHTML = '<p style="color: var(--primary-color);">Erro ao carregar avaliações.</p>';
    }
}
function handleCardapioClick(target) {
    if (!target.closest('.product-options')) {
        document.querySelectorAll('.options-menu').forEach(m => m.style.display = 'none');
    }
    
    const optionsButton = target.closest('.options-button');
    if (optionsButton) {
        const menu = optionsButton.nextElementSibling;
        const isVisible = menu.style.display === 'block';
        document.querySelectorAll('.options-menu').forEach(m => m.style.display = 'none');
        menu.style.display = isVisible ? 'none' : 'block';
        return;
    }
    
    if (target.closest('.btn-promo-toggle')) {
        const pId = target.closest('.product-card').dataset.productId;
        openSimplePromoModal(pId);
        return;
    }

    if (target.closest('.edit-product-btn')) { const pId = target.closest('.edit-product-btn').dataset.productId; const p = Object.values(state.menu).flat().find(p => p.id == pId); if (p) openProductModal(p); return; }
    if (target.closest('.delete-product-btn')) { openConfirmModal(target.closest('.delete-product-btn').dataset.productId); return; }
    if (target.closest('.btn-edit-category')) { renameCategory(parseInt(target.closest('.btn-edit-category').dataset.categoryId)); return; }
    if (target.closest('.btn-toggle-visibility')) { toggleCategoryVisibility(parseInt(target.closest('.btn-toggle-visibility').dataset.categoryId)); return; }
}

function handleRecompensasClick(target) {
    const editBtn = target.closest('.btn-edit-reward');
    if (editBtn) {
        const reward = state.rewards.find(r => r.id == editBtn.dataset.rewardId);
        openRewardModal(reward);
        return;
    }
    const deleteBtn = target.closest('.btn-delete-reward');
    if (deleteBtn) {
        deleteReward(deleteBtn.dataset.rewardId);
        return;
    }
}
    function renderStoreStatus(statusData) {
    const statusLight = document.querySelector('.status-light');
    const statusLabel = document.getElementById('status-label');
    const toggleButton = document.getElementById('manual-toggle-button');

    if (!statusLight || !statusLabel || !toggleButton) return;

    statusLight.classList.toggle('open', statusData.isOpen);
    statusLight.classList.toggle('closed', !statusData.isOpen);
    
    let statusText = statusData.isOpen ? 'Aberta' : 'Fechada';
    statusText += statusData.manualOverride ? ' (Manual)' : ' (Automático)';
    statusLabel.textContent = statusText;

    toggleButton.textContent = statusData.manualOverride ? 'Voltar ao Automático' : (statusData.isOpen ? 'Forçar Fechar' : 'Forçar Abrir');
}

async function fetchStoreStatus() {
    try {
        const response = await fetch('/api/admin/store-status');
        if (!response.ok) throw new Error('Falha ao buscar status');
        const data = await response.json();
        renderStoreStatus(data);
    } catch (error) {
        console.error("Erro ao buscar status da loja:", error);
    }
}

async function toggleManualStoreStatus() {
    try {
        const response = await fetch('/api/admin/toggle-store-status', { method: 'POST' });
        if (!response.ok) throw new Error('Falha ao alterar status');
        const data = await response.json();
        renderStoreStatus(data); 
    } catch (error) {
        showNotification('Erro ao alterar o status da loja.', 'error');
    }
}

socket.on('store_status_updated', (statusData) => {
    console.log("Status da loja atualizado via WebSocket:", statusData);
    renderStoreStatus(statusData);
});

document.addEventListener('click', (e) => {
    if (e.target.closest('#manual-toggle-button')) {
        toggleManualStoreStatus();
        return;
    }
});



function renderAssinantesView(viewElement) {
    viewElement.innerHTML = `
        <div class="view-header">
            <div>
                <h2>Assinantes do ZapClube</h2>
                <p>Veja a lista de todos os seus clientes assinantes ativos.</p>
            </div>
        </div>
        <div class="subscriber-grid" id="subscribers-container">
            <p>Carregando assinantes...</p>
        </div>
    `;
    
    fetch('/api/admin/subscribers')
        .then(response => {
            if (!response.ok) {
                throw new Error('Falha ao buscar dados dos assinantes.');
            }
            return response.json();
        })
        .then(subscribers => {
            const container = document.getElementById('subscribers-container');
            if (!container) return;

            if (subscribers.length === 0) {
                container.innerHTML = '<p>Nenhum assinante encontrado.</p>';
                return;
            }

            const cardsHTML = subscribers.map(sub => {
                const expirationDate = sub.subscription_expires_at 
                    ? new Date(sub.subscription_expires_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    : 'N/A';
                
                return `
                    <div class="subscriber-card">
                        <div class="subscriber-card-header">
                            <ion-icon name="person-circle-outline"></ion-icon>
                            <span class="subscriber-name">${sub.name}</span>
                        </div>
                        <div class="subscriber-card-body">
                            <div class="subscriber-info-item">
                                <ion-icon name="mail-outline"></ion-icon>
                                <span>${sub.email || 'Não informado'}</span>
                            </div>
                            <div class="subscriber-info-item">
                                <ion-icon name="call-outline"></ion-icon>
                                <span>${sub.phone}</span>
                            </div>
                            <div class="subscriber-info-item">
                                <ion-icon name="calendar-outline"></ion-icon>
                                <span>Expira em: <strong>${expirationDate}</strong></span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = cardsHTML;
        })
        .catch(error => {
            console.error('Erro ao renderizar assinantes:', error);
            const container = document.getElementById('subscribers-container');
            if(container) container.innerHTML = '<p style="color: var(--primary-color);">Erro ao carregar a lista de assinantes.</p>';
        });
}

// admin-script.js

// ADICIONE ESTA NOVA FUNÇÃO
async function executarFechamentoCaixa() {
    // Mostra uma notificação de "carregando"
    const originalNotification = showNotification('Iniciando fechamento de caixa...', 'success');

    try {
        const response = await fetch('/api/admin/fechar-caixa', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Pega o token de admin que já está salvo na sessão
                'Authorization': `Bearer ${sessionStorage.getItem('adminAuthToken')}`
            }
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message);
        }

        // Se a API retornar os dados do relatório, manda imprimir
        if (result.reportData) {
            imprimirRelatorioFechamento(result.reportData);
        }

        // Mostra notificação de sucesso
        showNotification(`Caixa fechado! ${result.affectedRows} pedidos em aberto foram cancelados.`, 'success');
        
        // Recarrega todos os dados do painel (vai zerar a lista de pedidos)
        await fetchCategoriesAndProducts();
        const orderResponse = await fetch('/api/orders');
        const ordersFromDB = await orderResponse.json();
        state.orders = ordersFromDB.map(order => ({
            ...order,
            items: typeof order.items === 'string' ? JSON.parse(order.items) : order.items,
            client_info: typeof order.client_info === 'string' ? JSON.parse(order.client_info) : order.client_info,
            delivery_info: typeof order.delivery_info === 'string' ? JSON.parse(order.delivery_info) : order.delivery_info,
            payment_info: typeof order.payment_info === 'string' ? JSON.parse(order.payment_info) : order.payment_info,
        }));
        
        renderView('dashboard'); // Volta pro dashboard
        fetchStoreStatus(); // Atualiza o status da loja

    } catch (error) {
        console.error("Erro ao fechar caixa:", error);
        showNotification(error.message, "error");
    }
}
    async function init() {
        loadData();
        loadTheme();
        try {
            await fetchCategoriesAndProducts();
            const response = await fetch('/api/orders');
            if (!response.ok) throw new Error('Falha ao buscar histórico de pedidos.');
            
            const ordersFromDB = await response.json();
            state.orders = ordersFromDB.map(order => ({
                ...order,
                items: typeof order.items === 'string' ? JSON.parse(order.items) : order.items,
                client_info: typeof order.client_info === 'string' ? JSON.parse(order.client_info) : order.client_info,
                delivery_info: typeof order.delivery_info === 'string' ? JSON.parse(order.delivery_info) : order.delivery_info,
                payment_info: typeof order.payment_info === 'string' ? JSON.parse(order.payment_info) : order.payment_info,
            }));

            console.log('Histórico de pedidos carregado:', state.orders.length, 'pedidos encontrados.');
        } catch (error) {
            console.error("Erro na inicialização:", error);
            showNotification(error.message, "error");
        }
        renderView('dashboard');
        configurarEventListeners(); 
         await fetchStoreStatus();
        setInterval(fetchStoreStatus, 30000); 
    }

    init();
});
