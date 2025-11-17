document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = '';;
    const containerListaPedidos = document.getElementById('lista-pedidos');
    const token = localStorage.getItem('authToken');
    let localOrdersCache = [];

    const statusInfo = {
        'Pendente de Pagamento': { texto: "Aguardando Pagamento", icone: "hourglass-outline", progresso: 0 },
        'Aguardando Pagamento': { texto: "Aguardando Pagamento", icone: "hourglass-outline", progresso: 0 },
        'Novo': { texto: "Pedido Recebido", icone: "receipt-outline", progresso: 10 },
        'Em Preparo': { texto: "Em Preparo", icone: "restaurant-outline", progresso: 33 },
        'Prontos': { texto: "Pronto para Retirada", icone: "bag-handle-outline", progresso: 66 },
        'Em Entrega': { texto: "Saiu para Entrega", icone: "bicycle-outline", progresso: 66 },
        'Finalizado': { texto: "Pedido Finalizado", icone: "checkmark-done-circle-outline", progresso: 100 },
        'Cancelado': { texto: "Pedido Cancelado", icone: "close-circle-outline", progresso: 0 }
    };


    function safeJSONParse(jsonString) {
        if (typeof jsonString !== 'string') return jsonString;
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            console.error("Erro ao fazer parse do JSON:", e, "String original:", jsonString);
            return null;
        }
    }
    
    function formatCurrency(value) {
        return (parseFloat(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function esconderCarregamento() {
        const telaCarregamento = document.getElementById('tela-carregamento');
        const conteudoPrincipal = document.getElementById('conteudo-principal');
        if (telaCarregamento) {
            telaCarregamento.style.opacity = '0';
            telaCarregamento.addEventListener('transitionend', () => telaCarregamento.style.display = 'none');
        }
        if (conteudoPrincipal) {
            conteudoPrincipal.style.display = 'block';
        }
    }


function criarCartaoPedidoHTML(pedido) {
    const dataPedido = new Date(pedido.created_at);
    const deliveryInfo = safeJSONParse(pedido.delivery_info);
    if (!deliveryInfo) return '';

    const dataFormatada = dataPedido.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const horaFormatada = dataPedido.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const etapaEntrega = (deliveryInfo.tipo === 'padrao' || deliveryInfo.tipo === 'Entrega') ? 'Em Entrega' : 'Prontos';
    const iconeEntrega = (deliveryInfo.tipo === 'padrao' || deliveryInfo.tipo === 'Entrega') ? 'bicycle-outline' : 'bag-handle-outline';
    const textoEntrega = (deliveryInfo.tipo === 'padrao' || deliveryInfo.tipo === 'Entrega') ? 'A caminho' : 'Retirada';
    
    let footerActionsHTML = `<a href="#" class="ver-detalhes" data-order-id="${pedido.id}">Ver detalhes</a>`;

    if (pedido.status === 'Em Entrega') {
        footerActionsHTML += `<button class="btn btn-primary btn-confirm-delivery" data-order-id="${pedido.id}">✅ Recebi meu pedido</button>`;
    } else {
        footerActionsHTML += `<button class="btn-ajuda" data-order-id="${pedido.id}">Ajuda</button>`;
    }

    let ratingHTML = '';
    if (pedido.rating === null) {
        ratingHTML = `
            <div class="rating-widget" data-order-id="${pedido.id}">
                <p>Como foi sua experiência com o site?</p>
                <div class="stars">
                    <ion-icon name="star-outline" data-value="1"></ion-icon>
                    <ion-icon name="star-outline" data-value="2"></ion-icon>
                    <ion-icon name="star-outline" data-value="3"></ion-icon>
                    <ion-icon name="star-outline" data-value="4"></ion-icon>
                    <ion-icon name="star-outline" data-value="5"></ion-icon>
                </div>
                <div class="rating-actions" style="display: none;">
                    <textarea placeholder="Deixe um comentário (opcional)"></textarea>
                    <button class="btn btn-primary btn-submit-rating">Enviar Avaliação</button>
                </div>
            </div>
        `;
    } else if (pedido.rating > 0) {
        ratingHTML = `<div class="rating-agradecimento"><ion-icon name="checkmark-circle"></ion-icon> Obrigado por sua avaliação!</div>`;
    }

    return `
    <div class="cartao-pedido" id="pedido-${pedido.id}">
        <div class="cabecalho-cartao-pedido"><h3>Pedido #${String(pedido.id)}</h3><span>${dataFormatada} às ${horaFormatada}</span></div>
        <div class="corpo-cartao-pedido">
            <div class="status-atual"><ion-icon name="receipt-outline"></ion-icon><div class="texto-status"><h4>Carregando...</h4><p>Previsão: --:--</p></div></div>
            <div class="linha-tempo-status">
                <div class="barra-progresso-status" style="width: 0%;"></div>
                <div class="etapa-status" data-etapa="Novo"><div class="icone-etapa"><ion-icon name="receipt-outline"></ion-icon></div><p>Recebido</p></div>
                <div class="etapa-status" data-etapa="Em Preparo"><div class="icone-etapa"><ion-icon name="restaurant-outline"></ion-icon></div><p>Preparando</p></div>
                <div class="etapa-status" data-etapa="${etapaEntrega}"><div class="icone-etapa"><ion-icon name="${iconeEntrega}"></ion-icon></div><p>${textoEntrega}</p></div>
                <div class="etapa-status" data-etapa="Finalizado"><div class="icone-etapa"><ion-icon name="checkmark-done-circle-outline"></ion-icon></div><p>Finalizado</p></div>
            </div>
            ${ratingHTML} 
        </div>
        <div class="rodape-cartao-pedido">
            ${footerActionsHTML} 
        </div>
    </div>`;
}
    function atualizarUIStatus(cartao, pedido) {
    if (!cartao || !pedido) return;

    const statusIconEl = cartao.querySelector('.status-atual ion-icon');
    const statusTextEl = cartao.querySelector('.status-atual h4');
    const previsaoEl = cartao.querySelector('.status-atual p');
    const barraProgresso = cartao.querySelector('.barra-progresso-status');
    const etapas = cartao.querySelectorAll('.etapa-status');

    const deliveryInfo = safeJSONParse(pedido.delivery_info);
    if (!deliveryInfo || !statusIconEl || !statusTextEl || !previsaoEl || !barraProgresso) return;

    const tipoEntrega = deliveryInfo.tipo;
    const status = pedido.status;
    const info = statusInfo[status];
    if (!info) return;

    statusIconEl.name = info.icone;
    statusTextEl.textContent = info.texto;
    barraProgresso.style.width = `${info.progresso}%`;

    const tempoDeCriacao = new Date(pedido.created_at);
    const tempoEstimadoEmMinutos = (tipoEntrega === 'retirada') ? 30 : 60; 
    const horaDaPrevisao = new Date(tempoDeCriacao.getTime() + tempoEstimadoEmMinutos * 60000);
    const horaFormatada = horaDaPrevisao.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });

    switch (status) {
        case 'Novo':
        case 'Em Preparo':
            previsaoEl.textContent = `Previsão de entrega: ~${horaFormatada}`;
            break;
        case 'Prontos':
            previsaoEl.textContent = `Ficou pronto! Previsão original: ~${horaFormatada}`;
            break;
        case 'Em Entrega':
            previsaoEl.textContent = `Já está a caminho! Previsão original: ~${horaFormatada}`;
            break;
        case 'Finalizado':
            const finishedTime = new Date(pedido.updated_at || pedido.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            previsaoEl.textContent = (tipoEntrega === 'padrao' || tipoEntrega === 'Entrega') ? `Entregue às ${finishedTime}` : `Retirado às ${finishedTime}`;
            break;
        case 'Cancelado':
            previsaoEl.textContent = 'Este pedido foi cancelado.';
            break;
        default:
            previsaoEl.textContent = 'Aguardando confirmação...';
            break;
    }

    const sequenciaStatus = ['Novo', 'Em Preparo', (tipoEntrega === 'padrao' || tipoEntrega === 'Entrega') ? 'Em Entrega' : 'Prontos', 'Finalizado'];
    const statusAtualIndex = sequenciaStatus.indexOf(status);
    etapas.forEach((etapa, index) => {
        etapa.classList.toggle('ativa', index <= statusAtualIndex);
    });
}
    function renderizarPedidos(pedidos) {
        localOrdersCache = pedidos;
        if (!containerListaPedidos) return;
        if (!pedidos || pedidos.length === 0) {
            containerListaPedidos.innerHTML = `
                <div id="sem-pedidos">
                    <ion-icon name="document-text-outline"></ion-icon>
                    <h3>Nenhum pedido por aqui</h3>
                    <p>Que tal fazer seu primeiro pedido?</p>
                    <a href="index.html" class="btn-ver-cardapio">Ver Cardápio</a>
                </div>`;
            return;
        }
        pedidos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        containerListaPedidos.innerHTML = pedidos.map(criarCartaoPedidoHTML).join('');
        pedidos.forEach(pedido => {
            const cartaoPedido = document.getElementById(`pedido-${pedido.id}`);
            if (cartaoPedido) {
                atualizarUIStatus(cartaoPedido, pedido);
            }
        });
    }


   async function confirmarEntrega(orderId) {
    if (!confirm('Você confirma o recebimento deste pedido?')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/status`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ status: 'Finalizado' }) 
        });

        const result = await response.json(); 
        if (!response.ok) {
            throw new Error(result.message || 'Não foi possível atualizar o status do pedido.');
        }

        showNotification('Obrigado por confirmar! Seu pedido foi finalizado.', 'success');

        const orderCard = document.getElementById(`pedido-${orderId}`);
        const orderData = localOrdersCache.find(o => o.id == orderId);
        if (orderCard && orderData) {
            orderData.status = 'Finalizado';
            orderData.updated_at = new Date().toISOString(); 
            atualizarUIStatus(orderCard, orderData);

            const footerActions = orderCard.querySelector('.rodape-cartao-pedido');
            if (footerActions) {
                footerActions.innerHTML = `
                    <a href="#" class="ver-detalhes" data-order-id="${orderId}">Ver detalhes</a>
                    <button class="btn-ajuda" data-order-id="${orderId}">Ajuda</button>
                `;
            }
        }

    } catch (error) {
        console.error('Erro ao confirmar entrega:', error);
        showNotification('Ocorreu um erro ao tentar finalizar o pedido. Tente novamente.', 'error');
    }
}
 
async function carregarPedidos() {
    let pedidos = [];
    const localToken = localStorage.getItem('authToken');

    if (localToken) { 
        try {
            const response = await fetch(`${API_BASE_URL}/api/customers/me/orders`, { headers: { 'Authorization': `Bearer ${localToken}` } });
            if (response.status === 401 || response.status === 403) {
                window.location.href = 'login-cliente.html';
                return;
            }
            if (!response.ok) throw new Error('Falha ao buscar pedidos da sua conta.');
            pedidos = await response.json();
        } catch (error) { console.error(error); }
    } else { 
        const guestOrdersData = JSON.parse(localStorage.getItem('guestOrders')) || [];
        const guestOrderIds = guestOrdersData.map(o => o.id); 
        if (guestOrderIds.length > 0) {
            try {
                const response = await fetch(`${API_BASE_URL}/api/orders/by-ids`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: guestOrderIds })
                });
                if (response.ok) {
                    pedidos = await response.json();
                }
            } catch (error) { console.error(error); }
        }
    }

    const pedidosVisiveis = pedidos.filter(p => p.status !== 'Pendente de Pagamento' && p.status !== 'Aguardando Pagamento');
    renderizarPedidos(pedidosVisiveis);
}

    const orderDetailsModal = document.getElementById('order-details-modal');
    function openOrderDetailsModal(order) {
        if (!orderDetailsModal) return;
        const modalTitle = document.getElementById('modal-order-title');
        const modalContent = document.getElementById('modal-order-content');
        if (!modalTitle || !modalContent) return;

        modalTitle.textContent = `Detalhes do Pedido #${order.id}`;
        const clientInfo = safeJSONParse(order.client_info);
        const deliveryInfo = safeJSONParse(order.delivery_info);
        const items = safeJSONParse(order.items);
        
        modalContent.innerHTML = `
            <div class="info-section"><h4>Cliente</h4><p><strong>Nome:</strong> ${clientInfo?.nome || 'N/A'}</p><p><strong>Telefone:</strong> ${clientInfo?.telefone || 'N/A'}</p></div>
            <div class="info-section"><h4>Entrega</h4><p><strong>Tipo:</strong> ${deliveryInfo?.tipo === 'retirada' ? 'Retirada' : 'Entrega'}</p>${deliveryInfo?.tipo !== 'retirada' ? `<p><strong>Endereço:</strong> ${deliveryInfo.rua}, ${deliveryInfo.numero} - ${deliveryInfo.bairro}</p>` : ''}</div>
            <div class="info-section"><h4>Itens</h4>${items?.map(item => `<div class="item-row"><span>${item.quantity}x ${item.name}</span><span>${formatCurrency(item.price * item.quantity)}</span></div>${item.observacao ? `<div class="item-obs">Obs: ${item.observacao}</div>` : ''}`).join('') || ''}</div>
            <div class="info-section"><h4>Pagamento</h4><div class="item-row"><strong>Total:</strong><strong>${formatCurrency(order.total_value)}</strong></div></div>`;
        orderDetailsModal.classList.add('visible');
    }
    function closeOrderDetailsModal() {
        if (orderDetailsModal) orderDetailsModal.classList.remove('visible');
    }


function configurarEventListeners() {
    const orderDetailsModal = document.getElementById('order-details-modal');
    const closeModalBtn = document.getElementById('close-order-modal-btn');
    const closeModalIcon = document.getElementById('close-order-modal-icon-btn');

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeOrderDetailsModal);
    if (closeModalIcon) closeModalIcon.addEventListener('click', closeOrderDetailsModal);
    if (orderDetailsModal) {
        orderDetailsModal.addEventListener('click', (e) => {
            if (e.target.id === 'order-details-modal') closeOrderDetailsModal();
        });
    }

    if (containerListaPedidos) {
        containerListaPedidos.addEventListener('click', async (e) => {
            const detailsButton = e.target.closest('.ver-detalhes');
            const helpButton = e.target.closest('.btn-ajuda');
            const confirmButton = e.target.closest('.btn-confirm-delivery');
            const starIcon = e.target.closest('.stars ion-icon');
            const submitRatingBtn = e.target.closest('.btn-submit-rating');

            if (detailsButton) {
                e.preventDefault();
                const orderCard = detailsButton.closest('.cartao-pedido');
                if (orderCard) {
                    const orderId = parseInt(orderCard.id.replace('pedido-', ''));
                    const orderData = localOrdersCache.find(o => o.id === orderId);
                    if (orderData) openOrderDetailsModal(orderData);
                }
            }

            if (helpButton) {
                e.preventDefault();
                const orderId = helpButton.dataset.orderId;
                const phoneNumber = '5519991432597'; 
                const message = encodeURIComponent(`Preciso de ajuda com meu pedido de número #${orderId}`);
                window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');
            }

            if (confirmButton) {
                e.preventDefault();
                const orderId = confirmButton.dataset.orderId;
                confirmarEntrega(orderId);
            }

            if (starIcon) {
                const ratingWidget = starIcon.closest('.rating-widget');
                const stars = ratingWidget.querySelectorAll('.stars ion-icon');
                const ratingValue = parseInt(starIcon.dataset.value);
                ratingWidget.dataset.rating = ratingValue;

                stars.forEach(star => {
                    const starValue = parseInt(star.dataset.value);
                    if (starValue <= ratingValue) {
                        star.setAttribute('name', 'star');
                    } else {
                        star.setAttribute('name', 'star-outline');
                    }
                });
                ratingWidget.querySelector('.rating-actions').style.display = 'block';
            }

            if (submitRatingBtn) {
                const ratingWidget = submitRatingBtn.closest('.rating-widget');
                const orderId = ratingWidget.dataset.orderId;
                const rating = parseInt(ratingWidget.dataset.rating);
                const comment = ratingWidget.querySelector('textarea').value;

                let ratingToken = null;
                const localToken = localStorage.getItem('authToken');
                if (localToken) {
                    const order = localOrdersCache.find(o => o.id == orderId);
                    ratingToken = order ? order.rating_token : null;
                } else {
                    const guestOrders = JSON.parse(localStorage.getItem('guestOrders')) || [];
                    const guestOrder = guestOrders.find(o => o.id == orderId);
                    ratingToken = guestOrder ? guestOrder.token : null;
                }

                if (!ratingToken) {
                    showNotification('Erro: Token de avaliação não encontrado.', 'error');
                    return;
                }

                submitRatingBtn.disabled = true;
                submitRatingBtn.textContent = 'Enviando...';

                try {
                    const response = await fetch(`${API_BASE_URL}/api/orders/rate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ orderId, ratingToken, rating, comment })
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.message);

                    showNotification('Obrigado pela sua avaliação!', 'success');
                    ratingWidget.innerHTML = `<div class="rating-agradecimento"><ion-icon name="checkmark-circle"></ion-icon> Obrigado por sua avaliação!</div>`;

                } catch (error) {
                    showNotification(error.message, 'error');
                    submitRatingBtn.disabled = false;
                    submitRatingBtn.textContent = 'Enviar Avaliação';
                }
            }
        });
    }
}
function configurarSocket() {
    const socket = io(API_BASE_URL);

    socket.on('connect', () => {
        console.log('Conectado ao servidor via WebSocket.');
        
        const localToken = localStorage.getItem('authToken');

        if (localToken) {
            console.log('Enviando token para autenticação de socket.');
            socket.emit('authenticate', localToken);
        } else {
            const guestOrdersData = JSON.parse(localStorage.getItem('guestOrders')) || [];
            const guestOrderIds = guestOrdersData.map(o => o.id);
            if (guestOrderIds.length > 0) {
                console.log('Visitante entrando nas salas de pedidos para monitoramento:', guestOrderIds);
                guestOrderIds.forEach(orderId => {
                    socket.emit('join_order_room', orderId);
                });
            }
        }
    });

    socket.on('order_status_updated', (updatedOrder) => {
        console.log('Status do pedido atualizado recebido:', updatedOrder);
        const index = localOrdersCache.findIndex(o => o.id === updatedOrder.id);
        
        if (index > -1) {
            localOrdersCache[index] = { ...localOrdersCache[index], ...updatedOrder };
        } else {
            localOrdersCache.unshift(updatedOrder);
        }
        const pedidosVisiveis = localOrdersCache.filter(p => p.status !== 'Pendente de Pagamento' && p.status !== 'Aguardando Pagamento');
        renderizarPedidos(pedidosVisiveis);
    });

    socket.on('order_created_for_customer', (newOrder) => {
        console.log('Novo pedido pessoal recebido via WebSocket:', newOrder);
        const existe = localOrdersCache.some(o => o.id === newOrder.id);
        if (!existe) {
            localOrdersCache.unshift(newOrder);
            const pedidosVisiveis = localOrdersCache.filter(p => p.status !== 'Pendente de Pagamento' && p.status !== 'Aguardando Pagamento');
            renderizarPedidos(pedidosVisiveis);
        }
    });

    socket.on('payment_success', (order) => {
        console.log('Pagamento de visitante confirmado via WebSocket:', order);
        
        const existe = localOrdersCache.some(o => o.id === order.id);
        if (!existe) {
            localOrdersCache.unshift(order);
            const pedidosVisiveis = localOrdersCache.filter(p => p.status !== 'Pendente de Pagamento' && p.status !== 'Aguardando Pagamento');
            renderizarPedidos(pedidosVisiveis);
        }
    });
}

    async function init() {
        try {
            await carregarPedidos();
            configurarEventListeners();
            configurarSocket();
        } catch (error) {
            console.error("Erro na inicialização:", error);
            if(containerListaPedidos) {
                containerListaPedidos.innerHTML = `<p class="error-message">Ocorreu um erro ao carregar a página. Tente novamente.</p>`;
            }
        } finally {
            esconderCarregamento();
        }
    }

    init();
});
