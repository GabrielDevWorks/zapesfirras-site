

let listenersConfigurados = false;



document.addEventListener('DOMContentLoaded', () => {

    const socket = io('/');
    const MERCADO_PAGO_PUBLIC_KEY = 'APP_USR-747c5ecf-6392-4bfa-9f6e-0dce6315bece';
    const API_BASE_URL = '';; 


    socket.on('menu_updated', () => {
        mostrarNotificacao('O cardápio foi atualizado!');
        carregarDadosDaAPI();
    });

    let carrinho = [];
    let taxaDeEntrega = 5.00;
    let produtosVisiveis = [];
    const metaEntregaGratis = 100.00;
    let promoDataDoDia = null;
    let produtoAtualModal = {};
    let timeoutNotificacao;
    let etapaAtualCarrinho = 'itens';
    let cupomAplicado = null;
    let pedido = {
        metodoEntrega: 'padrao'
    };
    let menuData = {};
    let activeTimers = [];
    let activeBrickController;
    let pixTimerInterval = null; 
    let processandoPagamento = false;


    const adicionaisPorCategoria = {
        'Esfirras Salgadas': [{ name: 'Bacon', price: 3.50 }, { name: 'Catupiry Extra', price: 3.00 }, { name: 'Cheddar', price: 3.00 }, { name: 'Alho Frito', price: 2.00 }],
        'Beirutes': [{ name: 'Ovo', price: 2.50 }, { name: 'Bacon', price: 4.00 }, { name: 'Catupiry', price: 3.50 }, { name: 'Dobro de Queijo', price: 5.00 }],
        'Lanches': [{ name: 'Ovo', price: 2.50 }, { name: 'Bacon', price: 4.00 }, { name: 'Cheddar', price: 3.00 }, { name: 'Hambúrguer Extra', price: 6.00 }],
        'default': [{ name: 'Bacon', price: 3.50 }, { name: 'Cheddar', price: 3.00 }, { name: 'Catupiry', price: 3.00 },]
    };

    const telaCarregamento = document.getElementById('tela-carregamento');
    const conteudoPrincipal = document.getElementById('conteudo-principal');
    const sobreposicaoModal = document.getElementById('modal-sobreposicao');
    const notificacao = document.getElementById('notificacao');
    const textoNotificacao = document.getElementById('texto-notificacao');
    const painelCarrinho = document.getElementById('painel-carrinho');
    const sobreposicaoCarrinho = document.getElementById('sobreposicao-carrinho');
    const tituloCarrinho = document.getElementById('titulo-carrinho');
    const btnVoltarCarrinho = document.getElementById('btn-voltar-carrinho');
    const btnContinuarCarrinho = document.getElementById('btn-continuar-carrinho');
    const telasCarrinho = document.querySelectorAll('.tela-carrinho');
    const todasEntradasPesquisa = document.querySelectorAll('.texto-pesquisa');
    const mensagemSemResultados = document.getElementById('sem-resultados');
    const barraFiltros = document.querySelector('.barra-filtros');
    const btnScrollLeft = document.getElementById('scroll-left');
    const btnScrollRight = document.getElementById('scroll-right');
    const btnCarrinhoMobile = document.getElementById('botao-carrinho-mobile');
    const contadorCarrinhoMobileEl = document.getElementById('contador-carrinho-mobile');
    const btnCarrinhoDesktop = document.getElementById('botao-carrinho-desktop');
    const contadorCarrinhoDesktopEl = document.getElementById('contador-carrinho-desktop');
    const toggleAdicionaisBtn = document.getElementById('toggle-adicionais');
    const listaAdicionaisContainer = document.getElementById('lista-adicionais');
    const formEndereco = document.getElementById('form-endereco');
    const formRetirada = document.getElementById('form-retirada');
    let todosCartoesProduto = [];
    let secoesProdutos = [];
    const closeBannerBtn = document.getElementById('zapclube-banner-close-btn');
    if (closeBannerBtn) {
        closeBannerBtn.addEventListener('click', (e) => {
            e.preventDefault(); 
            e.stopPropagation();

            const banner = document.getElementById('zapclube-cta-banner');
            if (banner) {
                banner.style.display = 'none';
            }
        });
    }

function showLoading(message) {
    hideLoading(); 

    const parentContainer = document.querySelector('.carrinho-corpo');
    if (!parentContainer) return;

    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
        <div class="loading-spinner"></div>
        <p>${message}</p>
    `;
    parentContainer.appendChild(overlay);
}
    
    function hideLoading() {
        const overlay = document.querySelector('.loading-overlay');
        if (overlay) {
            overlay.remove();
        }
    }
    
    function startPixCountdown(expirationISOString, pixContainer) {
        clearInterval(pixTimerInterval); 
    
        const timerElement = document.getElementById('pix-timer');
        if (!timerElement) return;

        const expirationTime = new Date(expirationISOString).getTime();
    
        pixTimerInterval = setInterval(() => {
            const now = new Date().getTime();
            const distance = expirationTime - now;
    
            if (distance < 0) {
                clearInterval(pixTimerInterval);
                pixContainer.innerHTML = '<h3 style="margin-bottom: 15px;">Tempo Esgotado</h3><p>Este QR Code Pix expirou. Por favor, volte e gere um novo pagamento.</p>';
                document.querySelector('.carrinho-rodape').style.display = 'flex';
                return;
            }
    
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);
            
            timerElement.textContent = `Expira em: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }, 1000);
    }

;
const loadCardBrick = async (total) => {
    showLoading('Carregando ambiente seguro...');
    document.getElementById('payment-selection-container').style.display = 'none';
    if (activeBrickController) await activeBrickController.unmount();
    const container = document.getElementById('debit-card-payment-container');
    container.innerHTML = '';
    container.style.display = 'block';
    const mp = new MercadoPago(MERCADO_PAGO_PUBLIC_KEY, { locale: 'pt-BR' });
    const bricksBuilder = mp.bricks();
    const settings = {
        initialization: { amount: total },
        customization: {
            visual: { style: { theme: 'default' } },
            paymentMethods: {
                creditCard: 'all',
                debitCard: 'all'
            }
        },
        callbacks: {
            onReady: () => {
                console.log('Brick de Cartão pronto!');
                hideLoading();
            },
            onSubmit: (formData) => new Promise((resolve, reject) => processPayment(formData).then(resolve).catch(reject)),
            onError: (error) => {
                console.error(error);
                hideLoading();
            },
        },
    };
    activeBrickController = await bricksBuilder.create('cardPayment', 'debit-card-payment-container', settings);
};

async function iniciarCheckoutPro() {
    showLoading('Redirecionando para o pagamento seguro...');

    const loggedInCustomer = JSON.parse(localStorage.getItem('customerInfo'));
    const { subtotal, descontoTotal, taxaEntregaReal, total } = calcularResumoFinanceiro();

    const clientInfo = {
        nome: document.getElementById('cliente-nome')?.value || document.getElementById('retirada-nome')?.value,
        telefone: document.getElementById('cliente-telefone')?.value || document.getElementById('retirada-telefone')?.value,
        cpf: document.getElementById('cliente-cpf')?.value || document.getElementById('retirada-cpf')?.value,
        email: loggedInCustomer ? loggedInCustomer.email : ''
    };
    const deliveryInfo = {
        tipo: pedido.metodoEntrega,
        rua: document.getElementById('endereco-rua')?.value,
        numero: document.getElementById('endereco-numero')?.value,
        bairro: document.getElementById('endereco-bairro')?.value,
        complemento: document.getElementById('endereco-complemento')?.value,
        referencia: document.getElementById('endereco-referencia')?.value,
        cep: document.getElementById('endereco-cep')?.value
    };
    
    const customerId = loggedInCustomer ? loggedInCustomer.id : null;
    const couponCode = cupomAplicado ? cupomAplicado.code : null;

    const data = {
        orderData: {
            items: carrinho,
            deliveryInfo,
            clientInfo,
            subtotal: subtotal,
            discountValue: descontoTotal,
            deliveryFee: taxaEntregaReal,
            totalValue: total
        },
        customerId: customerId,
        couponCode: couponCode
    };

    try {
        const response = await fetch(`${API_BASE_URL}/api/create-preference`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || 'Falha ao criar a preferência de pagamento.');
        }

        carrinho = [];
        cupomAplicado = null;
        salvarCarrinhoLocalStorage();

        window.location.href = result.init_point;

    } catch (error) {
        console.error('Erro ao iniciar Checkout Pro:', error);
        hideLoading();
        mostrarNotificacao(error.message, 'error');
    }
}
function renderizarTelaPix(pixData) {
    const pixContainer = document.getElementById('pix-display-container');
    if (!pixContainer) {
        console.error('O container do PIX #pix-display-container não foi encontrado no HTML.');
        return;
    }

    pixContainer.innerHTML = '';

    if (!document.getElementById('pix-copy-btn-styles')) {
        const style = document.createElement('style');
        style.id = 'pix-copy-btn-styles';
        style.innerHTML = `
            .copy-btn {
                background-color: white; color: black; border: 2px solid #d9534f;
                padding: 10px 15px; border-radius: 8px; cursor: pointer;
                font-weight: bold; font-size: 1em; margin-top: 10px;
                transition: background-color 0.2s, color 0.2s;
            }
            .copy-btn:hover { background-color: #f5f5f5; }
        `;
        document.head.appendChild(style);
    }

    pixContainer.style.textAlign = 'center';
    pixContainer.style.padding = '20px';
    pixContainer.style.color = '#333';

    const title = document.createElement('h3');
    title.innerText = 'Pague com Pix para finalizar';
    title.style.fontSize = '1.1em';
    title.style.marginBottom = '15px';

    const timer = document.createElement('div');
    timer.id = 'pix-timer';
    timer.style.fontWeight = 'bold';
    timer.style.marginBottom = '15px';
    timer.style.color = '#d9534f';

    const qrImg = document.createElement('img');
    qrImg.id = 'pix-qr-code-img';
    qrImg.src = `data:image/png;base64,${pixData.qr_code_base64}`;
    qrImg.alt = 'QR Code Pix';
    qrImg.style.cssText = 'max-width: 250px; margin: 10px auto; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);';

    const p1 = document.createElement('p');
    p1.innerText = 'Ou copie o código abaixo:';
    p1.style.fontSize = '0.9em';
    p1.style.marginTop = '15px';

    const codeTextarea = document.createElement('textarea');
    codeTextarea.id = 'pix-copy-paste-code';
    codeTextarea.rows = 3;
    codeTextarea.style.cssText = 'width: 100%; font-size: 13px; padding: 10px; border-radius: 5px; border: 1px solid #ccc; resize: none; background-color: #f4f4f4; margin-top: 5px;';
    codeTextarea.readOnly = true;
    codeTextarea.value = pixData.qr_code;

    const copyButton = document.createElement('button');
    copyButton.id = 'copy-pix-button';
    copyButton.className = 'copy-btn';
    copyButton.innerText = 'Copiar Código';

    const p2 = document.createElement('p');
    p2.innerText = 'Após o pagamento, seu pedido será confirmado.';
    p2.style.marginTop = '20px';
    p2.style.fontSize = '0.85em';
    p2.style.color = '#555';

    pixContainer.append(title, timer, qrImg, p1, codeTextarea, copyButton, p2);

    copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(codeTextarea.value).then(() => {
            const originalText = copyButton.innerText;
            copyButton.innerText = 'Copiado!';
            copyButton.style.borderColor = '#28a745';
            setTimeout(() => {
                copyButton.innerText = originalText;
                copyButton.style.borderColor = '#d9534f';
            }, 2000);
        }).catch(err => {
            console.error('Falha ao copiar o texto: ', err);
        });
    });

    pixContainer.style.display = 'block';
    startPixCountdown(pixData.expiration_time, pixContainer);
}




function renderizarTelaPix(pixData) {
    const pixContainer = document.getElementById('pix-display-container');
    if (!pixContainer) {
        console.error('O container do PIX #pix-display-container não foi encontrado no HTML.');
        return;
    }

    pixContainer.innerHTML = '';

    if (!document.getElementById('pix-copy-btn-styles')) {
        const style = document.createElement('style');
        style.id = 'pix-copy-btn-styles';
        style.innerHTML = `
            .copy-btn {
                background-color: white; color: black; border: 2px solid #d9534f;
                padding: 10px 15px; border-radius: 8px; cursor: pointer;
                font-weight: bold; font-size: 1em; margin-top: 10px;
                transition: background-color 0.2s, color 0.2s;
            }
            .copy-btn:hover { background-color: #f5f5f5; }
        `;
        document.head.appendChild(style);
    }

    pixContainer.style.textAlign = 'center';
    pixContainer.style.padding = '20px';
    pixContainer.style.color = '#333';

    const title = document.createElement('h3');
    title.innerText = 'Pague com Pix para finalizar';
    title.style.fontSize = '1.1em';
    title.style.marginBottom = '15px';

    const timer = document.createElement('div');
    timer.id = 'pix-timer';
    timer.style.fontWeight = 'bold';
    timer.style.marginBottom = '15px';
    timer.style.color = '#d9534f'; 

    const qrImg = document.createElement('img');
    qrImg.id = 'pix-qr-code-img';
    qrImg.src = `data:image/png;base64,${pixData.qr_code_base64}`;
    qrImg.alt = 'QR Code Pix';
    qrImg.style.cssText = 'max-width: 250px; margin: 10px auto; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);';

    const p1 = document.createElement('p');
    p1.innerText = 'Ou copie o código abaixo:';
    p1.style.fontSize = '0.9em';
    p1.style.marginTop = '15px';

    const codeTextarea = document.createElement('textarea');
    codeTextarea.id = 'pix-copy-paste-code';
    codeTextarea.rows = 3;
    codeTextarea.style.cssText = 'width: 100%; font-size: 13px; padding: 10px; border-radius: 5px; border: 1px solid #ccc; resize: none; background-color: #f4f4f4; margin-top: 5px;';
    codeTextarea.readOnly = true;
    codeTextarea.value = pixData.qr_code;

    const copyButton = document.createElement('button');
    copyButton.id = 'copy-pix-button';
    copyButton.className = 'copy-btn';
    copyButton.innerText = 'Copiar Código';

    const p2 = document.createElement('p');
    p2.innerText = 'Após o pagamento, seu pedido será confirmado.';
    p2.style.marginTop = '20px';
    p2.style.fontSize = '0.85em';
    p2.style.color = '#555';

    pixContainer.append(title, timer, qrImg, p1, codeTextarea, copyButton, p2);

    copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(codeTextarea.value).then(() => {
            const originalText = copyButton.innerText;
            copyButton.innerText = 'Copiado!';
            copyButton.style.borderColor = '#28a745';
            setTimeout(() => {
                copyButton.innerText = originalText;
                copyButton.style.borderColor = '#d9534f';
            }, 2000);
        }).catch(err => {
            console.error('Falha ao copiar o texto: ', err);
        });
    });

    pixContainer.style.display = 'block';
    startPixCountdown(pixData.expiration_time, pixContainer);
}



async function gerarCobrancaPix() {
    // 1. TRAVA DE SEGURANÇA: Se já estiver processando, impede nova execução.
    if (processandoPagamento) return;

    try {
        // 2. ATIVA A TRAVA
        processandoPagamento = true;
        
        showLoading('Gerando seu QR Code Pix...');
        
        // Esconde outras opções de pagamento para evitar confusão
        const paymentSelectionContainer = document.getElementById('payment-selection-container');
        if (paymentSelectionContainer) paymentSelectionContainer.style.display = 'none';
        
        // Se houver um brick do Mercado Pago (cartão) ativo, desmonta ele
        if (activeBrickController) await activeBrickController.unmount();
        
        // Validação do CPF (Obrigatório para PIX)
        let cpfValue;
        if (pedido.metodoEntrega === 'padrao') {
            cpfValue = document.getElementById('cliente-cpf')?.value;
        } else {
            cpfValue = document.getElementById('retirada-cpf')?.value;
        }

        if (!cpfValue) {
            hideLoading();
            mostrarNotificacao('O CPF é obrigatório para pagamento com Pix.', 'error');
            // Redireciona o usuário para preencher os dados
            navegarCarrinho(pedido.metodoEntrega === 'padrao' ? 'dados-entrega' : 'dados-retirada');
            
            // LIBERA A TRAVA para o usuário tentar de novo após corrigir
            processandoPagamento = false; 
            return;
        }

        // Cálculos financeiros
        const { subtotal, descontoTotal, taxaEntregaReal, total } = calcularResumoFinanceiro();

        if (total <= 0) {
            hideLoading();
            mostrarNotificacao('Não é possível gerar um pagamento com valor zero ou negativo.', 'error');
            processandoPagamento = false; // LIBERA A TRAVA
            return;
        }

        // Preparação dos dados do Cliente
        const clientInfo = {
            nome: document.getElementById('cliente-nome')?.value || document.getElementById('retirada-nome')?.value,
            telefone: document.getElementById('cliente-telefone')?.value || document.getElementById('retirada-telefone')?.value,
            cpf: cpfValue
        };

        // Preparação dos dados de Entrega
        const deliveryInfo = {
            tipo: pedido.metodoEntrega,
            rua: document.getElementById('endereco-rua')?.value,
            numero: document.getElementById('endereco-numero')?.value,
            bairro: document.getElementById('endereco-bairro')?.value,
            complemento: document.getElementById('endereco-complemento')?.value,
            referencia: document.getElementById('endereco-referencia')?.value,
        };

        // Dados do usuário logado (se houver)
        const customerData = JSON.parse(localStorage.getItem('customerInfo'));
        const customerId = customerData ? customerData.id : null;

        // Chamada ao Backend
        const response = await fetch(`${API_BASE_URL}/api/criar-pagamento-pix`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orderData: { 
                    items: carrinho, 
                    deliveryInfo, 
                    clientInfo,
                    subtotal: subtotal,
                    discount_value: descontoTotal,
                    delivery_fee: taxaEntregaReal,
                    total_value: total
                },
                customerId: customerId,
                couponCode: cupomAplicado ? cupomAplicado.code : null
            }),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'Falha ao gerar Pix.');
        }
        
        // Sucesso na geração do PIX
        hideLoading();
        
        // Renderiza o QR Code na tela
        renderizarTelaPix(result);

        // Esconde o rodapé do carrinho para impedir edições enquanto paga
        const rodapeCarrinho = document.querySelector('.carrinho-rodape');
        if (rodapeCarrinho) rodapeCarrinho.style.display = 'none';

        console.log(`Entrando na sala de espera para o pedido #${result.orderId}`);
        
        // Conecta ao WebSocket para ouvir a confirmação de pagamento em tempo real
        socket.emit('join_order_room', result.orderId);
        
        // Ouve o evento de sucesso do pagamento
        socket.on('payment_success', (order) => {
            if (order.id === result.orderId) { 
                mostrarNotificacao('Pagamento confirmado! Redirecionando...', 'success');
                
                // Limpa o carrinho
                carrinho = [];
                salvarCarrinhoLocalStorage();
                
                // Lógica de redirecionamento
                const token = localStorage.getItem('authToken');
                if (token) {
                    setTimeout(() => { window.location.href = 'pedidos.html'; }, 1500);
                } else {
                    // Se for visitante, salva o pedido no localStorage para ele poder acompanhar
                    const orderId = order.id;
                    let guestOrders = JSON.parse(localStorage.getItem('guestOrders')) || [];
                    if (!guestOrders.includes(orderId)) {
                        guestOrders.push(orderId);
                    }
                    localStorage.setItem('guestOrders', JSON.stringify(guestOrders));
                    setTimeout(() => { window.location.href = 'pedidos.html'; }, 1500);
                }
            }
        });
        
        // Nota: Não liberamos 'processandoPagamento = false' aqui no sucesso imediato,
        // pois o usuário deve permanecer nesta tela até pagar ou fechar o modal.
        // Se ele fechar o modal ou recarregar a página, a variável reseta naturalmente.

    } catch (error) {
        console.error('Erro ao gerar cobrança Pix:', error);
        hideLoading();
        mostrarNotificacao(error.message, 'error');
        
        // Se deu erro, mostra as opções de pagamento novamente
        if (paymentSelectionContainer) paymentSelectionContainer.style.display = 'block';
        
        // LIBERA A TRAVA para permitir nova tentativa
        processandoPagamento = false; 
    }
}


function handleSuccessfulOrder(message = 'Pedido enviado com sucesso!', orderId, ratingToken) {
    navegarCarrinho('sucesso');
    const sucessoContainer = document.getElementById('tela-sucesso');
    if (sucessoContainer) {
        sucessoContainer.innerHTML = `
            <ion-icon name="checkmark-circle-outline"></ion-icon>
            <h3>Obrigado pela preferência!</h3>
            <p>Seu pedido foi recebido e já estamos preparando!</p>
            <p>Acompanhe na aba "Pedidos" para ver o status.</p>
        `;
    }

    carrinho = [];
    cupomAplicado = null;
    salvarCarrinhoLocalStorage();
    atualizarTodosResumos(); 

    const token = localStorage.getItem('authToken');
    if (!token && orderId && ratingToken) {
        let guestOrders = JSON.parse(localStorage.getItem('guestOrders')) || [];
        guestOrders.push({ id: orderId, token: ratingToken });
        localStorage.setItem('guestOrders', JSON.stringify(guestOrders));
    }

    setTimeout(() => {
        window.location.href = 'pedidos.html';
    }, 4000); 
}
// script.js

// script.js

// SUBSTITUA A FUNÇÃO FINALIZARPEDIDO POR ESTA
async function finalizarPedido(paymentMethod) {
    // 1. TRAVA DE SEGURANÇA: Se já estiver processando, para tudo.
    if (processandoPagamento) return;
    
    try {
        // 2. ATIVA A TRAVA
        processandoPagamento = true;
        
        // Desabilita o botão visualmente para o usuário saber que clicou
        const btnContinuar = document.getElementById('btn-continuar-carrinho');
        if (btnContinuar) {
            btnContinuar.disabled = true;
            btnContinuar.innerHTML = '<div class="spinner-moderno" style="width: 20px; height: 20px; border-width: 2px;"></div> Enviando...';
        }

        mostrarNotificacao("Enviando seu pedido...", "loading");

        const { subtotal, descontoTotal, taxaEntregaReal, total } = calcularResumoFinanceiro();
        let paymentInfo = { metodo: paymentMethod };

        if (paymentMethod === 'dinheiro') { 
            const precisaTroco = document.querySelector('input[name="precisa-troco"]:checked').value === 'sim';
            const valorTrocoInput = document.getElementById('valor-troco');
            const trocoPara = precisaTroco ? parseFloat(valorTrocoInput.value) : 0;

            if (precisaTroco && (isNaN(trocoPara) || trocoPara < total)) {
                mostrarNotificacao(`O valor do troco deve ser maior que ${formatCurrency(total)}`, 'error');
                // Se deu erro de validação, liberamos a trava
                processandoPagamento = false; 
                if (btnContinuar) {
                    btnContinuar.disabled = false;
                    btnContinuar.innerHTML = '<span>Finalizar Pedido</span>';
                }
                return;
            }
            paymentInfo.trocoPara = trocoPara;
        }
        
        const clientInfo = {
            nome: document.getElementById('cliente-nome')?.value || document.getElementById('retirada-nome')?.value,
            telefone: document.getElementById('cliente-telefone')?.value || document.getElementById('retirada-telefone')?.value,
            cpf: document.getElementById('cliente-cpf')?.value || document.getElementById('retirada-cpf')?.value
        };
        const deliveryInfo = {
            tipo: pedido.metodoEntrega,
            rua: document.getElementById('endereco-rua')?.value,
            numero: document.getElementById('endereco-numero')?.value,
            bairro: document.getElementById('endereco-bairro')?.value,
            complemento: document.getElementById('endereco-complemento')?.value,
            referencia: document.getElementById('endereco-referencia')?.value
        };
        const customerData = JSON.parse(localStorage.getItem('customerInfo'));
        const customerId = customerData ? customerData.id : null;

        const response = await fetch(`${API_BASE_URL}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_info: clientInfo,
                delivery_info: deliveryInfo,
                items: carrinho,
                payment_info: paymentInfo,
                customerId: customerId,
                couponCode: cupomAplicado ? cupomAplicado.code : null
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        
        handleSuccessfulOrder('Pedido enviado com sucesso!', result.orderId, result.ratingToken);
        
        // Nota: Não precisamos destravar aqui (processandoPagamento = false) 
        // porque o usuário será redirecionado ou a tela vai mudar para "Sucesso".

    } catch (error) {
        mostrarNotificacao(error.message, 'error');
        // 3. SE DER ERRO (no fetch), LIBERA A TRAVA para ele tentar de novo
        processandoPagamento = false;
        const btnContinuar = document.getElementById('btn-continuar-carrinho');
        if (btnContinuar) {
            btnContinuar.disabled = false;
            btnContinuar.innerHTML = '<span>Finalizar Pedido</span>';
        }
    }
}


function criarCardProdutoHTML(produto) {
    try {
        if (!produto || typeof produto.id === 'undefined') {
            console.error('Um item inválido foi recebido e ignorado:', produto);
            return ''; 
        }

        const isPromo = produto.is_promo_active;

        const priceHTML = isPromo
            ? `<span class="preco-antigo"><s>${formatCurrency(produto.price)}</s></span><span class="preco-promocional">${formatCurrency(produto.promo_price)}</span>`
            : `<span class="preco">${formatCurrency(produto.price)}</span>`;
            
        return `
            <div class="cartao-produto ${isPromo ? 'em-promocao' : ''}" data-id="${produto.id}" data-category="${produto.category_name}">
                ${isPromo ? `<div class="promo-badge-estilizado">⚡ OFERTA</div>` : ''}
                <div class="container-detalhes-produto">
                    <div class="texto-info-produto">
                        <h3>${produto.name}</h3>
                        <h4>${produto.description || ''}</h4>
                    </div>
                </div>
                <div class="acoes-produto">
                    <div class="precos-container">
                        ${priceHTML}
                    </div>
                    <button class="botao-adicionar">
                        <ion-icon name="add-outline"></ion-icon>
                    </button>
                </div>
            </div>
        `;

    } catch (error) {
        console.error(`Erro ao renderizar o card do produto: "${produto?.name}"`, error);
        return ''; 
    }
}


async function carregarDadosDaAPI() {
    try {
        console.log("Iniciando carregamento de dados da API...");
        const [categoriesResponse, productsResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/api/categories`),
            fetch(`${API_BASE_URL}/api/products`, { cache: 'no-cache' })
        ]);

        if (!categoriesResponse.ok) throw new Error('Erro ao buscar categorias.');
        if (!productsResponse.ok) throw new Error('Erro de rede ao buscar produtos.');

        const categoriasVisiveis = await categoriesResponse.json();
        const todosProdutos = await productsResponse.json();
        
        if (barraFiltros) renderizarFiltros(categoriasVisiveis);

        produtosVisiveis = todosProdutos.filter(p => p && p.available && p.category_is_visible);

        const secaoPromocoes = document.getElementById('secao-promocoes-relampago');
        const gradePromocoes = document.getElementById('grade-promocoes');
        const produtosEmPromocao = produtosVisiveis.filter(p => p.is_promo_active);
        
        if (secaoPromocoes && gradePromocoes) {
            if (produtosEmPromocao.length > 0) {
                gradePromocoes.innerHTML = produtosEmPromocao.map(criarCardProdutoHTML).join('');
                secaoPromocoes.style.display = 'block';
            } else {
                secaoPromocoes.style.display = 'none';
                gradePromocoes.innerHTML = '';
            }
        }

        const menuData = produtosVisiveis.reduce((acc, produto) => {
            const categoriaId = produto.category_id;
            if (!acc[categoriaId]) acc[categoriaId] = [];
            acc[categoriaId].push(produto);
            return acc;
        }, {});

        const containerPrincipal = document.querySelector('main.container-principal');
        if (containerPrincipal) {
            containerPrincipal.querySelectorAll('.container-secao[data-category]').forEach(s => s.remove());

            categoriasVisiveis.forEach(categoria => {
                const produtosDaCategoria = menuData[categoria.id];
                if (produtosDaCategoria && produtosDaCategoria.length > 0) {
                    const secao = document.createElement('section');
                    secao.className = 'container-secao';
                    secao.dataset.category = categoria.name;
                    secao.innerHTML = `<h2 class="titulo-secao">${categoria.name}</h2><div class="grade-produtos">${produtosDaCategoria.map(criarCardProdutoHTML).join('')}</div>`;
                    containerPrincipal.appendChild(secao);
                }
            });
            todosCartoesProduto = document.querySelectorAll('.cartao-produto');
            secoesProdutos = document.querySelectorAll('.container-secao[data-category]');
        }
        
        gerenciarSetasScroll();

    } catch (error) {
        console.error("Falha ao carregar cardápio:", error);
        const containerPrincipal = document.querySelector('main.container-principal');
        if (containerPrincipal) {
            containerPrincipal.innerHTML = '<p class="mensagem-erro-api">Não foi possível carregar o cardápio. Tente novamente mais tarde.</p>';
        }
    }
}
function calcularResumoFinanceiro() {

    const subtotalItens = carrinho.reduce((acc, item) => {
        const precoAdicionais = item.adicionais ? item.adicionais.reduce((sum, ad) => sum + (ad.price || 0), 0) : 0;
        const precoBase = parseFloat(item.price) || 0; 
        return acc + ((precoBase + precoAdicionais) * item.quantity);
    }, 0);

    let taxaEntregaReal = (etapaAtualCarrinho !== 'itens' && pedido.metodoEntrega === 'padrao') ? taxaDeEntrega : 0;
    
    let descontoCupom = 0;
    let descontoFrete = 0;
    
    let detalhesDescontoCupom = { aplicado: false, html: `<div class="linha-resumo desconto"><span>Descontos</span><span>- ${formatCurrency(0)}</span></div>` };
    let detalhesDescontoFrete = { aplicado: false, html: '' };

    if (cupomAplicado && subtotalItens >= cupomAplicado.min_purchase_value) {
        if (cupomAplicado.discount_type === 'percentage') {
            descontoCupom = subtotalItens * (parseFloat(cupomAplicado.discount_value) / 100);
        } else if (cupomAplicado.discount_type === 'fixed') {
            descontoCupom = parseFloat(cupomAplicado.discount_value);
        } else if (cupomAplicado.discount_type === 'free_delivery') {
            descontoFrete = taxaEntregaReal;
        }
    }
    
    const temEntregaGratisPorValor = subtotalItens >= metaEntregaGratis && pedido.metodoEntrega !== 'retirada';
    if (temEntregaGratisPorValor && descontoFrete === 0) {
        descontoFrete = taxaEntregaReal;
    }
    
    const descontoTotal = descontoCupom + descontoFrete;
    const total = subtotalItens + taxaEntregaReal - descontoTotal;
    const subtotalComEntrega = subtotalItens + taxaEntregaReal;

    if (descontoTotal > 0) {
        detalhesDescontoCupom.aplicado = true;
        detalhesDescontoCupom.html = `<div class="linha-resumo desconto"><span>Descontos</span><span>- ${formatCurrency(descontoTotal)}</span></div>`;
    }

    return { 
        subtotalItens, 
        descontoTotal, 
        taxaEntregaReal, 
        total, 
        detalhesDescontoCupom,
        temEntregaGratisPorValor,
        subtotalComEntrega
    };
}
async function renderCustomerCouponsInCart() {
    console.log("--- DEBUG ZAPCLUBE ---");
    console.log("1. Função renderCustomerCouponsInCart FOI CHAMADA.");

    const token = localStorage.getItem('authToken');
    if (!token) {
        console.log("2. FIM: Parou porque o cliente não está logado (sem token).");
        return;
    }
    console.log("2. OK: Cliente está logado (token encontrado).");

    const container = document.querySelector('.secao-cupom');
    if (!container) {
        console.log("3. ERRO CRÍTICO: Não encontrei o <div class='secao-cupom'> no HTML do carrinho para colocar os cupons.");
        return;
    }
    console.log("3. OK: Container de cupons encontrado no HTML.");

    const oldContainer = document.getElementById('available-coupons');
    if(oldContainer) oldContainer.remove();

    try {
        console.log("4. Buscando cupons na API em /api/customers/me/coupons...");
        const response = await fetch(`${API_BASE_URL}/api/customers/me/coupons`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log("5. Resposta da API recebida com status:", response.status);
        if (!response.ok) {
            console.log("ERRO: A resposta da API não foi bem-sucedida. Status:", response.status);
            return;
        }

        const coupons = await response.json();
        console.log("6. Cupons recebidos do servidor:", coupons);

        if (coupons.length > 0) {
    const couponsHTML = coupons.map(coupon => `
        <div class="coupon-available ${coupon.is_used ? 'used' : ''}" data-code="${coupon.code}">
            <ion-icon name="ticket"></ion-icon>
            <div class="coupon-info">
                <strong>${coupon.code}</strong>
                <p>${coupon.description}</p>
            </div>
            <button class="btn-aplicar-cupom" ${coupon.is_used ? 'disabled' : ''}>
                ${coupon.is_used ? 'Utilizado' : 'Usar'}
            </button>
        </div>
    `).join('');

            let availableCouponsContainer = document.createElement('div');
            availableCouponsContainer.id = 'available-coupons';
            availableCouponsContainer.innerHTML = `<h4>Seus cupons ZapClube</h4> ${couponsHTML}`;
            container.prepend(availableCouponsContainer);
        } else {
            console.log("7. FIM: A API funcionou, mas não retornou nenhum cupom para este cliente.");
        }
         console.log("--- FIM DO DEBUG ---");

    } catch (error) {
        console.error("8. ERRO CRÍTICO DENTRO DA FUNÇÃO:", error);
    }
}

    function renderizarFiltros(categorias) {
        if (!barraFiltros) return;
        barraFiltros.innerHTML = '<button class="botao-filtro ativo" data-categoria="Todos">Todos</button>';
        categorias.forEach(categoria => {
            barraFiltros.insertAdjacentHTML('beforeend', `<button class="botao-filtro" data-categoria="${categoria.name}">${categoria.name}</button>`);
        });
    }

    const formatCurrency = (value) => (value != null ? parseFloat(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00');


let modalListenersConfigurados = false;



function configurarModalProduto() {
    if (modalListenersConfigurados) {
        return;
    }

    console.log("DEBUG: Configurando listeners do modal pela primeira vez...");

    const sobreposicaoModal = document.getElementById('modal-sobreposicao');
    const fecharModalBtn = document.getElementById('botao-fechar-modal');
    const adicionarCarrinhoModalBtn = document.querySelector('.botao-adicionar-carrinho-modal');
    const suggestionsContainerModal = document.getElementById('modal-suggestions-container');
    const toggleAdicionaisBtn = document.getElementById('toggle-adicionais');
    const listaAdicionaisContainer = document.getElementById('lista-adicionais');

    const seletorQuantidade = document.querySelector('.modal-produto .seletor-quantidade');
    const botaoMenos = seletorQuantidade ? seletorQuantidade.querySelector('.botao-menos') : null;
    const botaoMais = seletorQuantidade ? seletorQuantidade.querySelector('.botao-mais') : null;
    const entradaQuantidade = seletorQuantidade ? seletorQuantidade.querySelector('.entrada-quantidade') : null;

    if (toggleAdicionaisBtn && listaAdicionaisContainer) {
        toggleAdicionaisBtn.addEventListener('click', () => {
            toggleAdicionaisBtn.classList.toggle('ativo');
            listaAdicionaisContainer.classList.toggle('ativo');
        });
    }

    if (botaoMenos && botaoMais && entradaQuantidade) {
        const updateQuantity = (amount) => {
            let currentQuantity = parseInt(entradaQuantidade.value) || 1;
            currentQuantity = Math.max(1, currentQuantity + amount);
            entradaQuantidade.value = currentQuantity;
            atualizarPrecoTotalModal();
        };

        botaoMenos.addEventListener('click', () => updateQuantity(-1));
        botaoMais.addEventListener('click', () => updateQuantity(1));

        listaAdicionaisContainer.addEventListener('change', (e) => {
            if (e.target.classList.contains('checkbox-adicional') || e.target.classList.contains('radio-adicional')) {
                atualizarPrecoTotalModal();
            }
        });
    }

    const fecharModal = () => {
        if (sobreposicaoModal) sobreposicaoModal.classList.remove('ativo');
    };

    if (fecharModalBtn) {
        fecharModalBtn.addEventListener('click', fecharModal);
    }

    if (sobreposicaoModal) {
        sobreposicaoModal.addEventListener('click', (e) => {
            if (e.target.id === 'modal-sobreposicao') {
                fecharModal();
            }
        });
    }

    if (adicionarCarrinhoModalBtn) {
        const oldAdicionarHandler = adicionarCarrinhoModalBtn.onclick;
        if(oldAdicionarHandler) adicionarCarrinhoModalBtn.removeEventListener('click', oldAdicionarHandler);

        adicionarCarrinhoModalBtn.addEventListener('click', () => {
            const adicionaisSelecionados = Array.from(document.querySelectorAll('#lista-adicionais input:checked'))
                .map(cb => ({ name: cb.dataset.nome, price: parseFloat(cb.dataset.preco) }));
            
            const precoUnitarioAtualizado = produtoAtualModal.precoFinal; 
            const produtoParaCarrinho = { ...produtoAtualModal, price: precoUnitarioAtualizado }; 
            
            const quantidade = parseInt(document.querySelector('.modal-produto .entrada-quantidade').value);
            const observacao = document.getElementById('observacao-produto').value.trim();
            adicionarAoCarrinho(produtoParaCarrinho, quantidade, observacao || null, adicionaisSelecionados);
            fecharModal();
        });
    }

    if (suggestionsContainerModal) {
        suggestionsContainerModal.addEventListener('click', (e) => {
            const sugestaoBtn = e.target.closest('.botao-add-sugestao-modal');
            if (sugestaoBtn) {
                const itemDiv = sugestaoBtn.closest('.item-sugestao-modal');
                const produtoId = parseInt(itemDiv.dataset.id);
                const produto = produtosVisiveis.find(p => p.id === produtoId);
                if (produto) adicionarAoCarrinho(produto, 1, null, []);
            }
        });
    }

    modalListenersConfigurados = true;
    console.log("DEBUG: Listeners do modal configurados com sucesso.");
}
function criarCardPromocionalHTML(item) {
    let description = item.description || '';
    if (item.item_type === 'single' && item.components && item.components.sabores) {
        description = `Sabores: ${item.components.sabores.join(', ')}.`;
    }
    
    return `
        <div class="cartao-produto promocional" data-item-id="${item.id}" data-item-type="${item.item_type}">
            <div class="container-detalhes-produto">
                <div class="texto-info-produto">
                    <h3>${item.name}</h3>
                    <h4>${description}</h4>
                </div>
            </div>
            <div class="acoes-produto">
                <div class="precos-container">
                    <span class="preco">${formatCurrency(item.price)}</span>
                </div>
                <button class="botao-adicionar btn-add-promo">
                    <ion-icon name="add-outline"></ion-icon>
                </button>
            </div>
        </div>
    `;
}


    function atualizarInfoCabecalho() {
        const greetingEl = document.getElementById('greeting');
        const dateEl = document.getElementById('current-date');
        const mobileGreetingContainer = document.getElementById('header-greeting-mobile');
        if (!greetingEl || !dateEl) return;
        const agora = new Date();
        const hora = agora.getHours();
        let saudacao;
        if (hora >= 5 && hora < 12) { saudacao = 'Bom dia!'; }
        else if (hora >= 12 && hora < 18) { saudacao = 'Boa tarde!'; }
        else { saudacao = 'Boa noite!'; }
        const opcoesData = { weekday: 'long', month: 'long', day: 'numeric' };
        let dataFormatada = agora.toLocaleDateString('pt-BR', opcoesData);
        dataFormatada = dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1);
        greetingEl.textContent = saudacao;
        dateEl.textContent = dataFormatada;
        if (mobileGreetingContainer) {
            mobileGreetingContainer.innerHTML = `<span>${saudacao}</span> &#8226; <span>${dataFormatada}</span>`;
        }
    }

    function ajustarPaddingCorpo() {
        const headerNav = document.querySelector('.barra-navegacao');
        const topInfoBar = document.querySelector('.barra-superior-info');
        const mainContent = document.querySelector('.container-principal');
        if (!mainContent || !headerNav) return;
        let totalHeaderHeight = 0;
        totalHeaderHeight += headerNav.offsetHeight;
        if (topInfoBar && topInfoBar.offsetHeight > 0) {
            totalHeaderHeight += topInfoBar.offsetHeight;
        }
        mainContent.style.paddingTop = `${totalHeaderHeight + 20}px`;
    }

    function filtrarEBuscarProdutos(termo) {
        if (!todosCartoesProduto) return;
        let produtoEncontrado = false;
        todosCartoesProduto.forEach(cartao => {
            const nomeProduto = cartao.querySelector('h3').textContent.toLowerCase();
            const deveMostrar = nomeProduto.includes(termo);
            cartao.style.display = deveMostrar ? '' : 'none';
            if (deveMostrar) produtoEncontrado = true;
        });
        secoesProdutos.forEach(secao => {
            const produtosVisiveis = secao.querySelectorAll('.cartao-produto:not([style*="display: none"])').length;
            secao.style.display = produtosVisiveis > 0 || termo === '' ? 'block' : 'none';
        });
        if (mensagemSemResultados) {
            mensagemSemResultados.style.display = !produtoEncontrado && termo !== '' ? 'block' : 'none';
        }
    }

function filtrarPorCategoria(categoriaAlvo) {
    if (!secoesProdutos) return;

    todosCartoesProduto.forEach(card => card.style.display = 'flex');
    secoesProdutos.forEach(secao => secao.style.display = 'block');
    
    if (categoriaAlvo !== 'Todos') {
        const targetSection = document.querySelector(`.container-secao[data-category="${categoriaAlvo}"]`);
        if (targetSection) {
            const headerOffset = 130;
            const elementPosition = targetSection.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            window.scrollTo({
                top: offsetPosition,
                behavior: "smooth"
            });
        }
    } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    todasEntradasPesquisa.forEach(input => input.value = '');
    if (mensagemSemResultados) mensagemSemResultados.style.display = 'none';
}

    function mostrarNotificacao(mensagem, type = '') {
        if (!notificacao || !textoNotificacao) return;
        clearTimeout(timeoutNotificacao);
        notificacao.className = 'notificacao';
        if (type) {
            notificacao.classList.add(type);
        }
        textoNotificacao.textContent = mensagem;
        notificacao.classList.add('mostrar');
        if (type !== 'loading') {
            timeoutNotificacao = setTimeout(() => notificacao.classList.remove('mostrar'), 2500);
        }
    }

    function gerenciarSetasScroll() {
        if (!barraFiltros || !btnScrollLeft || !btnScrollRight) return;
        const temScroll = barraFiltros.scrollWidth > barraFiltros.clientWidth;
        if (!temScroll) {
            btnScrollLeft.classList.remove('visivel');
            btnScrollRight.classList.remove('visivel');
            return;
        }
        btnScrollLeft.classList.toggle('visivel', barraFiltros.scrollLeft > 0);
        const maxScrollLeft = barraFiltros.scrollWidth - barraFiltros.clientWidth;
        btnScrollRight.classList.toggle('visivel', barraFiltros.scrollLeft < maxScrollLeft - 1);
    }

function popularAdicionais(produto) {
    if (!listaAdicionaisContainer || !toggleAdicionaisBtn) return;

    let adicionaisDisponiveis = [];

    if (produto.custom_additions && Array.isArray(produto.custom_additions) && produto.custom_additions.length > 0) {
        if (produto.custom_additions[0].group_name) {
            adicionaisDisponiveis = produto.custom_additions;
        } else {
            adicionaisDisponiveis = [{
                group_name: "Adicionais",
                type: "checkbox",
                required: false,
                options: produto.custom_additions
            }];
        }
    } else {
        const categoria = produto.category_name || 'default';
        const defaultAddons = adicionaisPorCategoria[categoria] || adicionaisPorCategoria['default'];
        adicionaisDisponiveis = [{
            "group_name": "Deseja algum adicional?",
            "type": "checkbox",
            "required": false,
            "options": defaultAddons
        }];
    }

    if (!adicionaisDisponiveis || adicionaisDisponiveis.length === 0 || adicionaisDisponiveis.every(g => !g.options || g.options.length === 0)) {
        toggleAdicionaisBtn.parentElement.style.display = 'none';
        return;
    }

    toggleAdicionaisBtn.parentElement.style.display = 'block';
    listaAdicionaisContainer.innerHTML = ''; 

    adicionaisDisponiveis.forEach((group, index) => {
        const groupName = group.group_name;
        const groupType = group.type || 'checkbox';
        const isRequired = group.required || false;

        if (!group.options) return;

        let optionsHTML = group.options.map(adicional => {
            const optionId = `adicional-${index}-${(adicional.name || '').replace(/\s+/g, '-')}`;
            if (groupType === 'radio') {
                return `
                    <div class="item-adicional">
                        <label for="${optionId}">
                            <input type="radio" id="${optionId}" class="radio-adicional" name="adicional-group-${index}" data-nome="${adicional.name}" data-preco="${adicional.price}" ${isRequired ? 'required' : ''}>
                            <span class="radio-visual"></span>
                            <span class="nome-adicional">${adicional.name}</span>
                        </label>
                        <span class="preco-adicional">+ ${formatCurrency(adicional.price)}</span>
                    </div>
                `;
            } else {
                return `
                    <div class="item-adicional">
                        <label for="${optionId}">
                            <input type="checkbox" id="${optionId}" class="checkbox-adicional" data-nome="${adicional.name}" data-preco="${adicional.price}">
                            <span class="checkmark-adicional"></span>
                            <span class="nome-adicional">${adicional.name}</span>
                        </label>
                        <span class="preco-adicional">+ ${formatCurrency(adicional.price)}</span>
                    </div>
                `;
            }
        }).join('');

        const groupHTML = `
            <div class="grupo-adicionais">
                <h4>${groupName} ${isRequired ? '*' : ''}</h4>
                ${optionsHTML}
            </div>
        `;
        listaAdicionaisContainer.insertAdjacentHTML('beforeend', groupHTML);
    });

    if (adicionaisDisponiveis.some(g => g.required)) {
        toggleAdicionaisBtn.classList.add('ativo');
        listaAdicionaisContainer.classList.add('ativo');
    } else {
        toggleAdicionaisBtn.classList.remove('ativo');
        listaAdicionaisContainer.classList.remove('ativo');
    }

    const toggleButtonSpan = toggleAdicionaisBtn.querySelector('span');
    if (toggleButtonSpan) {
        if (adicionaisDisponiveis.length === 1 && adicionaisDisponiveis[0].required) {
            toggleButtonSpan.textContent = adicionaisDisponiveis[0].group_name;
        } else {
            toggleButtonSpan.textContent = 'Deseja algum adicional?';
        }
    }
}    
    function atualizarPrecoTotalModal() {
        const quantidadeInput = document.querySelector('.modal-produto .entrada-quantidade');
        const botaoAdicionar = document.querySelector('.botao-adicionar-carrinho-modal');
        if (!quantidadeInput || !botaoAdicionar || !produtoAtualModal) return;
        const quantidade = parseInt(quantidadeInput.value);
        let precoTotalAdicionais = 0;
        document.querySelectorAll('.checkbox-adicional:checked').forEach(checkbox => {
            precoTotalAdicionais += parseFloat(checkbox.dataset.preco);
        });
        const precoBase = parseFloat(produtoAtualModal.precoBase) || 0;
        const precoFinal = (precoBase + precoTotalAdicionais) * quantidade;
        produtoAtualModal.precoFinal = precoFinal / quantidade;
        botaoAdicionar.textContent = `Adicionar ${formatCurrency(precoFinal)}`;
    }

    const salvarCarrinhoLocalStorage = () => localStorage.setItem('carrinhoZapEsfirras', JSON.stringify(carrinho));
    const carregarCarrinhoLocalStorage = () => { carrinho = JSON.parse(localStorage.getItem('carrinhoZapEsfirras')) || []; renderizarItensCarrinho(); };
    



const adicionarAoCarrinho = (produto, quantidade = 1, observacao = null, adicionais = []) => {

    const adicionaisValidos = (adicionais || []).filter(ad => ad && ad.name);
    const nomesAdicionais = adicionaisValidos.map(a => a.name).sort().join(',');
    const idUnicoItem = produto.id + (observacao || '').trim().toLowerCase() + nomesAdicionais;
    
    const itemExistente = carrinho.find(item => item.idUnico === idUnicoItem);

    const isPromoValida = produto.is_promo_active; 
    const precoFinal = isPromoValida ? parseFloat(produto.promo_price) : parseFloat(produto.price);

    if (itemExistente) {
        itemExistente.quantity += quantidade;
    } else {
        carrinho.push({
            ...produto,
            price: precoFinal,
            quantity: quantidade,
            observacao: observacao,
            adicionais: adicionaisValidos,
            idUnico: idUnicoItem
        });
    }

    salvarCarrinhoLocalStorage();
    renderizarItensCarrinho();
    mostrarNotificacao(`${quantidade} "${produto.name}" adicionado(s)!`, 'success');
};

    const removerItemDoCarrinho = (idUnico) => { carrinho = carrinho.filter(item => item.idUnico !== idUnico); cupomAplicado = null; salvarCarrinhoLocalStorage(); renderizarItensCarrinho(); };
    const atualizarQuantidade = (idUnico, novaQuantidade) => { const item = carrinho.find(i => i.idUnico === idUnico); if (item) { if (novaQuantidade > 0) { item.quantity = novaQuantidade; } else { removerItemDoCarrinho(idUnico); } } cupomAplicado = null; salvarCarrinhoLocalStorage(); renderizarItensCarrinho(); };
    const renderizarItensCarrinho = () => {
    const container = document.getElementById('lista-itens-carrinho');
    if (!container) return;

    if (carrinho.length === 0) {
        container.innerHTML = '<p class="mensagem-carrinho-vazio">Seu carrinho está vazio.</p>';
    } else {
        container.innerHTML = carrinho.map(item => {
           
            const adicionaisHtml = (item.adicionais && Array.isArray(item.adicionais))
                ? item.adicionais
                    .filter(ad => ad && ad.name) 
                    .map(ad => `<span>+ ${ad.name}</span>`)
                    .join('')
                : '';

            return `
                <div class="item-carrinho-novo" data-id-unico="${item.idUnico}">
                    <div class="info-item">
                        <p class="nome-item">${item.name}</p>
                        ${adicionaisHtml ? `<div class="adicionais-carrinho">${adicionaisHtml}</div>` : ''}
                        <span class="preco-unitario-item">${formatCurrency(item.price)}</span>
                        ${item.observacao ? `<p class="observacao-item">Obs: ${item.observacao}</p>` : ''}
                    </div>
                    <div class="acoes-item">
                        <div class="seletor-quantidade-carrinho">
                            <button class="diminuir-item">-</button>
                            <span>${item.quantity}</span>
                            <button class="aumentar-item">+</button>
                        </div>
                        <button class="botao-remover-item">
                            <ion-icon name="trash-outline"></ion-icon>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
    atualizarTodosResumos();
};


const atualizarTodosResumos = () => {
    const { subtotalItens, total, taxaEntregaReal, detalhesDescontoCupom, temEntregaGratisPorValor, subtotalComEntrega } = calcularResumoFinanceiro();

    const resumoContainer = document.getElementById('resumo-collapsible-container');
    if (resumoContainer) {
        if (carrinho.length === 0) {
            resumoContainer.style.display = 'none';
        } else {
            resumoContainer.style.display = 'block';
            const breakdownContainer = document.getElementById('resumo-breakdown-content');
            if (breakdownContainer) {
                let breakdownHTML = '';
                
                if (etapaAtualCarrinho !== 'itens') {
                    breakdownHTML += `<div class="linha-resumo"><span>Subtotal (Itens + Entrega)</span><span>${formatCurrency(subtotalComEntrega)}</span></div>`;
                    if (detalhesDescontoCupom.aplicado) {
                        breakdownHTML += detalhesDescontoCupom.html;
                    }
                } else {
                    breakdownHTML += `<div class="linha-resumo"><span>Subtotal dos Itens</span><span>${formatCurrency(subtotalItens)}</span></div>`;
                }
                breakdownContainer.innerHTML = breakdownHTML;
            }
            const totalValueEl = document.getElementById('resumo-footer-total-valor');
            if (totalValueEl) {
                totalValueEl.textContent = formatCurrency(total);
            }
        }
    }
    
    const trackerContainer = document.getElementById('entrega-gratis-tracker');
    const successContainer = document.getElementById('entrega-gratis-success');
    if (trackerContainer && successContainer) {
        if (etapaAtualCarrinho === 'itens' && carrinho.length > 0 && !(cupomAplicado && cupomAplicado.discount_type === 'free_delivery')) {
            if (temEntregaGratisPorValor) {
                trackerContainer.style.display = 'none';
                successContainer.style.display = 'flex';
            } else {
                trackerContainer.style.display = 'flex';
                successContainer.style.display = 'none';
                const valorFaltante = metaEntregaGratis - subtotalItens;
                const progresso = (subtotalItens / metaEntregaGratis) * 100;
                const textoEl = document.getElementById('entrega-gratis-texto');
                const progressBarEl = document.getElementById('entrega-gratis-progress');
                if (textoEl) textoEl.textContent = `Faltam ${formatCurrency(valorFaltante)} para entrega grátis!`;
                if (progressBarEl) progressBarEl.style.width = `${progresso}%`;
            }
        } else {
            trackerContainer.style.display = 'none';
            successContainer.style.display = 'none';
        }
    }
    
    const totalItens = carrinho.reduce((acc, item) => acc + item.quantity, 0);
    [contadorCarrinhoMobileEl, contadorCarrinhoDesktopEl].forEach(el => {
        if (el) {
            el.textContent = totalItens;
            el.classList.toggle('ativo', totalItens > 0);
        }
    });

    const guestPromptContainer = document.getElementById('guest-points-prompt');
    const token = localStorage.getItem('authToken');
    if (guestPromptContainer) {
        if (!token && subtotalItens > 0) {
            const potentialPoints = Math.floor(subtotalItens);
            if (potentialPoints > 0) {
                guestPromptContainer.style.display = 'block';
                guestPromptContainer.innerHTML = `
                    <p>Você ganharia <strong>${potentialPoints} ZapPontos</strong> com este pedido!</p>
                    <p><a href="login-cliente.html">Faça login</a> ou <a href="cadastro-cliente.html">crie uma conta</a> para acumular.</p>
                `;
            }
        } else {
            guestPromptContainer.style.display = 'none';
        }
    }
};

const navegarCarrinho = (novaEtapa) => {
    etapaAtualCarrinho = novaEtapa;
    telasCarrinho.forEach(tela => tela.classList.toggle('tela-ativa', tela.id === `tela-${novaEtapa}`));
    const textoBotao = document.querySelector('#btn-continuar-carrinho span');
    const rodapeCarrinho = document.querySelector('.carrinho-rodape');
    
    if (rodapeCarrinho) {
        rodapeCarrinho.style.display = (novaEtapa === 'sucesso') ? 'none' : 'flex';
    }
    
    if (activeBrickController) activeBrickController.unmount();

    const pixContainer = document.getElementById('pix-display-container');
    if (pixContainer) pixContainer.style.display = 'none';

    const cardContainer = document.getElementById('debit-card-payment-container');
    if (cardContainer) cardContainer.style.display = 'none';
    
    switch (novaEtapa) {
        case 'itens':
            if (tituloCarrinho) tituloCarrinho.textContent = 'Meu Carrinho';
            if (btnVoltarCarrinho) btnVoltarCarrinho.style.display = 'none';
            if (textoBotao) textoBotao.textContent = 'Continuar';
            break;
        case 'metodo-entrega':
            if (tituloCarrinho) tituloCarrinho.textContent = 'Como Deseja Receber?';
            if (btnVoltarCarrinho) btnVoltarCarrinho.style.display = 'block';
            if (textoBotao) textoBotao.textContent = 'Continuar';
            break;
        case 'dados-entrega':
        case 'dados-retirada':
            if (tituloCarrinho) tituloCarrinho.textContent = novaEtapa === 'dados-entrega' ? 'Endereço de Entrega' : 'Dados para Retirada';
            if (btnVoltarCarrinho) btnVoltarCarrinho.style.display = 'block';
            if (textoBotao) textoBotao.textContent = 'Ir para o Pagamento';
            break;
        
        case 'pagamento':
            if (tituloCarrinho) tituloCarrinho.textContent = 'Forma de Pagamento';
            if (btnVoltarCarrinho) btnVoltarCarrinho.style.display = 'block';
            if (textoBotao) textoBotao.textContent = 'Finalizar Pedido';
            
            const paymentSelectionContainer = document.getElementById('payment-selection-container');
            paymentSelectionContainer.style.display = 'block';
            
            let paymentOptionsHTML = `
                <div class="payment-options-container">
                    <label class="payment-option" id="opt-cartao">
                        <input type="radio" name="payment-method-choice" value="cartao" checked>
                        <ion-icon name="card-outline" class="icon"></ion-icon>
                        <span class="text">Pagar com Cartão (Online)</span>
                    </label>
                    <label class="payment-option" id="opt-pix">
                        <input type="radio" name="payment-method-choice" value="pix">
                        <ion-icon name="qr-code-outline" class="icon"></ion-icon>
                        <span class="text">Pagar com Pix (Online)</span>
                    </label>
            `;

            if (pedido.metodoEntrega === 'retirada') {
                paymentOptionsHTML += `
                    <label class="payment-option" id="opt-retirada">
                        <input type="radio" name="payment-method-choice" value="retirada">
                        <ion-icon name="storefront-outline" class="icon"></ion-icon>
                        <span class="text">Pagar na Retirada</span>
                    </label>
                `;
            } else {


                paymentOptionsHTML += `
                    <div class="payment-accordion">
                        <div class="payment-option-header" id="toggler-pagar-na-entrega">
                            <ion-icon name="bicycle-outline" class="icon"></ion-icon>
                            <span class="text">Pagar na Entrega</span>
                            <ion-icon name="chevron-down-outline" class="chevron"></ion-icon>
                        </div>
                        <div class="payment-accordion-content" id="content-pagar-na-entrega">
                            <label class="payment-option sub-option">
                                <input type="radio" name="payment-method-choice" value="cartao_maquininha">
                                <ion-icon name="card-outline" class="icon"></ion-icon>
                                <span class="text">Cartão de Crédito</span>
                            </label>
                            <label class="payment-option sub-option">
                                <input type="radio" name="payment-method-choice" value="cartao_maquininha_debito">
                                <ion-icon name="albums-outline" class="icon"></ion-icon>
                                <span class="text">Cartão de Débito</span>
                            </label>
                            <label class="payment-option sub-option" id="toggler-dinheiro">
                                <input type="radio" name="payment-method-choice" value="dinheiro">
                                <ion-icon name="cash-outline" class="icon"></ion-icon>
                                <span class="text">Dinheiro</span>
                            </label>
                            <div class="troco-section" id="content-dinheiro">
                                <div class="form-campo">
                                    <label>Precisa de troco?</label>
                                    <div class="radio-button-group">
                                        <label class="radio-label">
                                            <input type="radio" name="precisa-troco" value="nao" checked>
                                            <span class="radio-custom"></span>
                                            <span>Não</span>
                                        </label>
                                        <label class="radio-label">
                                            <input type="radio" name="precisa-troco" value="sim">
                                            <span class="radio-custom"></span>
                                            <span>Sim</span>
                                        </label>
                                    </div>
                                </div>
                                <div class="form-campo">
                                    <input type="number" id="valor-troco" placeholder="Troco para quanto? Ex: 50.00" style="display: none;">
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

            paymentOptionsHTML += `</div>`;
            paymentSelectionContainer.innerHTML = paymentOptionsHTML;
            
            const options = document.querySelectorAll('.payment-option, .payment-option-header, .payment-option.sub-option');
            const accordionHeader = document.getElementById('toggler-pagar-na-entrega');
            const accordionContent = document.getElementById('content-pagar-na-entrega');
            const dinheiroOption = document.getElementById('toggler-dinheiro');
            const trocoSection = document.getElementById('content-dinheiro');
            const valorTrocoInput = document.getElementById('valor-troco');

            function updateSelection(e) {
                const clickedLabel = e.currentTarget;
                
                options.forEach(opt => opt.classList.remove('selected'));
                
                if (!clickedLabel.classList.contains('payment-option-header')) {
                    clickedLabel.classList.add('selected');
                    const radio = clickedLabel.querySelector('input[type="radio"]');
                    if (radio) radio.checked = true;
                }

                if (clickedLabel.classList.contains('sub-option')) {
                    if (accordionHeader) accordionHeader.classList.add('selected');
                }
            }

            options.forEach(opt => opt.addEventListener('click', updateSelection));

            if (accordionHeader) {
                accordionHeader.addEventListener('click', () => {
                    accordionContent.classList.toggle('open');
                    accordionHeader.classList.toggle('open');
                });
            }

            if (dinheiroOption) {
                 dinheiroOption.addEventListener('click', () => {
                    trocoSection.classList.add('open');
                });
            }

            document.querySelectorAll('input[name="precisa-troco"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    if (valorTrocoInput) valorTrocoInput.style.display = e.target.value === 'sim' ? 'block' : 'none';
                });
            });

            document.querySelector('#opt-cartao').classList.add('selected');
            break;
            
        case 'sucesso':
            if (tituloCarrinho) tituloCarrinho.textContent = 'Pedido Finalizado';
            if (btnVoltarCarrinho) btnVoltarCarrinho.style.display = 'none';
            break;
    }
    atualizarTodosResumos();
};
const togglePainelCarrinho = (abrir = null) => {
    const painelCarrinho = document.getElementById('painel-carrinho');
    const sobreposicaoCarrinho = document.getElementById('sobreposicao-carrinho');

    if (!painelCarrinho || !sobreposicaoCarrinho) {
        console.error("Erro crítico: Não foi possível encontrar #painel-carrinho ou #sobreposicao-carrinho no HTML.");
        return;
    }

    const estaAtivo = painelCarrinho.classList.contains('ativo');
    const abrirPainel = abrir === null ? !estaAtivo : abrir;
    
    if (abrirPainel) {
        navegarCarrinho('itens'); 
        renderCustomerCouponsInCart(); 
    }

    painelCarrinho.classList.toggle('ativo', abrirPainel);
    sobreposicaoCarrinho.classList.toggle('ativo', abrirPainel);
};



async function gerenciarEstadoLogin() {
    const token = localStorage.getItem('authToken');
    const customerInfo = JSON.parse(localStorage.getItem('customerInfo'));
    
    const botaoContaDesktop = document.getElementById('botao-conta-desktop');
    const infoUsuarioDesktop = document.getElementById('info-usuario-desktop');
    const nomeUsuarioDesktop = document.getElementById('nome-usuario-desktop');
    const botaoLogoutDesktop = document.getElementById('botao-logout-desktop');
    const botaoPerfilMobileLink = document.getElementById('botao-perfil-mobile');
    const botaoPerfilMobileText = botaoPerfilMobileLink ? botaoPerfilMobileLink.querySelector('.bottom-nav-text') : null;
    const zapclubeCtaBanner = document.getElementById('zapclube-cta-banner');

    const showBanner = () => {
        if (zapclubeCtaBanner) {
            zapclubeCtaBanner.style.display = 'flex';
            document.body.classList.add('banner-visible');
        }
    };
    const hideBanner = () => {
        if (zapclubeCtaBanner) {
            zapclubeCtaBanner.style.display = 'none';
            document.body.classList.remove('banner-visible');
        }
    };

    if (token && customerInfo) {
        if (botaoContaDesktop) botaoContaDesktop.style.display = 'none';
        if (infoUsuarioDesktop) infoUsuarioDesktop.style.display = 'flex';
        
        if (nomeUsuarioDesktop) {
            const primeiroNome = (customerInfo.nome || '').split(' ')[0];
            nomeUsuarioDesktop.textContent = `Olá, ${primeiroNome}!`;
        }
        
        if (botaoPerfilMobileText) botaoPerfilMobileText.textContent = 'Minha Conta';
        if (botaoPerfilMobileLink) botaoPerfilMobileLink.href = 'perfil.html';
        
        if (botaoLogoutDesktop) {
            if (!botaoLogoutDesktop.dataset.listener) {
                botaoLogoutDesktop.addEventListener('click', () => {
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('customerInfo');
                    window.location.reload();
                });
                botaoLogoutDesktop.dataset.listener = 'true';
            }
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/customers/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Falha ao verificar assinatura.');
            const fullCustomerData = await response.json();
            
            if (!fullCustomerData.is_club_subscriber) {
                showBanner();
            } else {
                hideBanner();
            }
        } catch (error) {
            console.error(error);
            showBanner();
        }

    } else {
        if (botaoContaDesktop) botaoContaDesktop.style.display = 'flex';
        if (infoUsuarioDesktop) infoUsuarioDesktop.style.display = 'none';
        if (botaoPerfilMobileText) botaoPerfilMobileText.textContent = 'Perfil';
        if (botaoPerfilMobileLink) botaoPerfilMobileLink.href = 'login-cliente.html';
        showBanner();
    }
}
// SUBSTITUA A SUA FUNÇÃO handleStoreStatus() ATUAL POR ESTA:

function handleStoreStatus({ isOpen }) {
    const body = document.body;
    document.getElementById('store-status-banner')?.remove();

    if (isOpen) {
        body.classList.remove('store-closed');
    } else {
        body.classList.add('store-closed');
        const banner = document.createElement('div');
        banner.id = 'store-status-banner';
        banner.innerHTML = `
            <ion-icon name="time-outline"></ion-icon>
            <span>Nossa loja está fechada no momento. Não estamos aceitando pedidos.</span>
        `;
        body.prepend(banner);
    }
}
async function init() {
    try {
        const hoje = new Date().toISOString().slice(0, 10); 
        const ultimaVisita = localStorage.getItem('ultimaVisitaZapEsfirras');

        if (ultimaVisita !== hoje) {
            console.log('Registrando nova visita única para o dia.');
            await fetch(`${API_BASE_URL}/api/analytics/log-visit`, { method: 'POST' });
            localStorage.setItem('ultimaVisitaZapEsfirras', hoje);
        } else {
            console.log('Visitante já contabilizado hoje.');
        }
    } catch (error) {
        console.error('Falha ao registrar a visita:', error);
    }

    gerenciarEstadoLogin();
    atualizarInfoCabecalho();
    carregarCarrinhoLocalStorage();

    const telaCarregamento = document.getElementById('tela-carregamento');
    const conteudoPrincipal = document.getElementById('conteudo-principal');

    try {
        await carregarPromocaoAtiva();
        await carregarDadosDaAPI();

        const response = await fetch(`${API_BASE_URL}/api/store-status`);
        const data = await response.json();
        handleStoreStatus(data);

    } catch (error) {
        console.error("Ocorreu um erro na inicialização:", error);
        if (conteudoPrincipal) {
            conteudoPrincipal.innerHTML = '<p class="mensagem-erro-api">Não foi possível carregar o site. Tente novamente mais tarde.</p>';
        }
    } finally {

        if (telaCarregamento) {
            telaCarregamento.style.opacity = '0';
            telaCarregamento.addEventListener('transitionend', () => {
                telaCarregamento.style.display = 'none';
            }, { once: true }); 
        }
        if (conteudoPrincipal) {
            conteudoPrincipal.style.display = 'block';
            ajustarPaddingCorpo();
            if (barraFiltros) gerenciarSetasScroll();
        }
    }

    configurarEventListeners();
}

async function carregarPromocaoAtiva() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/active-promotion`);
        if (!response.ok) {
            console.error("API de promoção ativa falhou:", response.statusText);
            return;
        }
        
        promoDataDoDia = await response.json();

        if (!promoDataDoDia || !promoDataDoDia.event) {
            console.log("Nenhuma promoção especial ativa para hoje.");
            const secaoPromocoes = document.getElementById('secao-promocao-especial');
            if (secaoPromocoes) secaoPromocoes.style.display = 'none';
            return;
        }

        console.log("Promoção ativa encontrada:", promoDataDoDia.event.name);

        const containerPrincipal = document.querySelector('main.container-principal');
        const secaoFiltros = document.querySelector('.container-filtros-scroll'); 
        if (!containerPrincipal || !secaoFiltros) return;
        
        document.getElementById('secao-promocao-especial')?.remove();

        const promoSection = document.createElement('section');
        promoSection.id = 'secao-promocao-especial';
        promoSection.className = 'container-secao';
        
        let itemsHTML = promoDataDoDia.items.map(item => criarCardPromocionalHTML(item)).join('');

        promoSection.innerHTML = `
            <h2 class="titulo-secao-imperdivel" style="border-bottom: 3px solid var(--orange-accent-color);">
                <ion-icon name="calendar-outline"></ion-icon> ${promoDataDoDia.event.name}
            </h2>
            <p class="promo-description" style="color: var(--grey-dark); margin-top: -15px; margin-bottom: 25px;">
                ${promoDataDoDia.event.description}
            </p>
            <div class="grade-produtos">
                ${itemsHTML}
            </div>
        `;
        secaoFiltros.parentNode.insertBefore(promoSection, secaoFiltros.nextSibling);

    } catch (error) {
        console.error("Não foi possível carregar a promoção do dia:", error);
    }
}
function openComboModal(item) {
    const options = item.options ? JSON.parse(item.options) : {};
    const components = item.components ? JSON.parse(item.components) : {};
    
    const modal = document.getElementById('combo-modal-overlay');
    if (!modal) {
        return;
    }

    const titleEl = document.getElementById('combo-modal-title');
    const priceEl = document.getElementById('combo-modal-price');
    const flavorArea = document.getElementById('flavor-selection-area');
    const flavorList = document.getElementById('combo-flavor-list');
    const drinkArea = document.getElementById('drink-selection-area');
    const selectionCounter = document.querySelector('.selection-counter');
    const selectedCountEl = document.getElementById('combo-selected-count');
    const limitEl = document.getElementById('combo-limit');
    const addButton = document.getElementById('add-combo-to-cart-button');

    titleEl.textContent = item.name;
    priceEl.textContent = parseFloat(item.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    flavorList.innerHTML = '';
    drinkArea.innerHTML = '';

    let state = { limit: 0, selectedFlavors: {} };
    const isSingleEsfirra = item.item_type === 'single';

    if (options.sabores && options.sabores.length > 0) {
        if (isSingleEsfirra) {
            state.limit = Infinity; 
            if(selectionCounter) selectionCounter.style.display = 'none';
        } else {
            if(selectionCounter) selectionCounter.style.display = 'block';
            
            const name = item.name.toLowerCase();
            if (name.includes('100')) state.limit = 100;
            else if (name.includes('50')) state.limit = 50;
            else if (name.includes('10')) state.limit = 10;
            if (state.limit === 0) state.limit = 1; 

            limitEl.textContent = state.limit;
            selectedCountEl.textContent = '0';
        }
        
        const saboresDisponiveis = options.sabores;
        saboresDisponiveis.forEach(sabor => {
            const flavorItem = document.createElement('div');
            flavorItem.className = 'flavor-item';
            flavorItem.innerHTML = `
                <span class="flavor-name">${sabor}</span>
                <div class="quantity-selector">
                    <button class="btn-flavor-change" data-sabor="${sabor}" data-action="minus" disabled>-</button>
                    <span class="flavor-count" data-sabor="${sabor}">0</span>
                    <button class="btn-flavor-change" data-sabor="${sabor}" data-action="plus">+</button>
                </div>
            `;
            flavorList.appendChild(flavorItem);
        });
        flavorArea.style.display = 'block';
    } else {
        flavorArea.style.display = 'none';
    }

if (options.bebidas && options.bebidas.length > 0) {
    drinkArea.style.display = 'block';
    const drinkOptions = options.bebidas;

    const drinkOptionsHTML = drinkOptions.map(drink => `
        <label class="drink-option">
            <input type="radio" name="combo-drink-select" value="${drink}" required>
            <span class="radio-visual"></span>
            <span class="drink-name">${drink}</span>
        </label>
    `).join('');

    drinkArea.innerHTML = `
        <div class="drink-accordion">
            <button type="button" class="drink-accordion-header">
                <span>Escolha sua bebida:</span>
                <ion-icon name="chevron-down-outline"></ion-icon>
            </button>
            <div class="drink-options-list">${drinkOptionsHTML}</div>
        </div>
    `;

    const accordionHeader = drinkArea.querySelector('.drink-accordion-header');
    if (accordionHeader) {
        accordionHeader.addEventListener('click', () => {
            accordionHeader.parentElement.classList.toggle('open');
        });
    }
} else {
    drinkArea.style.display = 'none';
}
    function updateCounts() {
        const totalSelected = Object.values(state.selectedFlavors).reduce((sum, count) => sum + count, 0);
        if(!isSingleEsfirra) {
            selectedCountEl.textContent = totalSelected;
            document.querySelectorAll('.btn-flavor-change[data-action="plus"]').forEach(btn => btn.disabled = totalSelected >= state.limit);
        }
        document.querySelectorAll('.btn-flavor-change[data-action="minus"]').forEach(btn => btn.disabled = !state.selectedFlavors[btn.dataset.sabor] || state.selectedFlavors[btn.dataset.sabor] === 0);
    }

    flavorList.onclick = (e) => {
        const button = e.target.closest('.btn-flavor-change');
        if (!button) return;
        const { sabor, action } = button.dataset;
        state.selectedFlavors[sabor] = state.selectedFlavors[sabor] || 0;
        const totalSelected = Object.values(state.selectedFlavors).reduce((s, c) => s + c, 0);

        if (action === 'plus' && totalSelected < state.limit) {
            state.selectedFlavors[sabor]++;
        } else if (action === 'minus' && state.selectedFlavors[sabor] > 0) {
            state.selectedFlavors[sabor]--;
        }
        document.querySelector(`.flavor-count[data-sabor="${sabor}"]`).textContent = state.selectedFlavors[sabor];
        updateCounts();
    };
    
    const newAddButton = addButton.cloneNode(true);
    addButton.parentNode.replaceChild(newAddButton, addButton);
    
    newAddButton.onclick = () => {
        if (isSingleEsfirra) {
            const saboresSelecionados = Object.entries(state.selectedFlavors).filter(([_, count]) => count > 0);
            if (saboresSelecionados.length === 0) {
                showNotification('Escolha pelo menos uma esfiha para adicionar.', 'error');
                return;
            }
            
            saboresSelecionados.forEach(([sabor, quantidade]) => {
                const produtoParaCarrinho = {
                    id: `evento-${item.id}-${sabor}`,
                    name: `Mini Esfirra ${sabor}`,
                    price: parseFloat(item.price)
                };
                adicionarAoCarrinho(produtoParaCarrinho, quantidade, 'Item do Festival', []);
            });

        } else {
            const totalSelected = Object.values(state.selectedFlavors).reduce((sum, count) => sum + count, 0);
            if (state.limit > 0 && totalSelected !== state.limit) {
                showNotification(`Você deve escolher exatamente ${state.limit} sabores de esfiha.`, 'error');
                return;
            }
            let selectedDrinkValue = null;
            if (options.bebidas && options.bebidas.length > 0) {
                const selectedDrinkInput = document.querySelector('input[name="combo-drink-select"]:checked');
                if (!selectedDrinkInput) {
                    showNotification('Por favor, escolha sua bebida para continuar.', 'error');
                    return;
                }
                selectedDrinkValue = selectedDrinkInput.value;
            }
            const sabores = Object.entries(state.selectedFlavors).filter(([_, count]) => count > 0).map(([sabor, count]) => `${count}x ${sabor}`).join(', ');
            let observacao = `Sabores: ${sabores}`;
            if (selectedDrinkValue) {
                observacao += ` | Bebida: ${selectedDrinkValue}`;
            }
            
            const produtoParaCarrinho = { ...item, price: parseFloat(item.price) };
            adicionarAoCarrinho(produtoParaCarrinho, 1, observacao, []);
        }
        
        modal.classList.remove('ativo');
    };
    
    modal.classList.add('ativo');
    document.getElementById('close-combo-modal').onclick = () => modal.classList.remove('ativo');
}
    function configurarBuscaPorCEP() {
        const inputCEP = document.getElementById('endereco-cep');
        if (!inputCEP) return;
        inputCEP.addEventListener('input', (e) => {
            let cep = e.target.value.replace(/\D/g, '');
            cep = cep.replace(/^(\d{5})(\d)/, '$1-$2');
            e.target.value = cep;
            if (cep.replace('-', '').length === 8) {
                buscarEnderecoPorCEP(cep);
            }
        });
    }


/**
 * @param {object} item
 * @returns {string} 
 */
function criarCardPromocionalHTML(item) {
    let optionsHTML = '';
    let description = item.description || '';

    if (item.item_type === 'combo' && item.options) {
        const optionKey = Object.keys(item.options)[0]; 
        const drinkOptions = item.options[optionKey] || [];
        
        optionsHTML = `
            <div class="form-group-promo">
                <label for="select-${item.id}">Escolha sua bebida:</label>
                <select id="select-${item.id}" class="select-promo-item">
                    ${drinkOptions.map(drink => `<option value="${drink}">${drink}</option>`).join('')}
                </select>
            </div>
        `;
    }

    if (item.item_type === 'single' && item.components && item.components.sabores) {
        description = `Sabores: ${item.components.sabores.join(', ')}.`;
    }
    
    return `
        <div class="cartao-produto promocional" data-item-id="${item.id}" data-item-type="${item.item_type}">
            <div class="container-detalhes-produto">
                <div class="texto-info-produto">
                    <h3>${item.name}</h3>
                    <h4>${description}</h4>
                    ${optionsHTML}
                </div>
            </div>
            <div class="acoes-produto">
                <div class="precos-container">
                    <span class="preco">${formatCurrency(item.price)}</span>
                </div>
                <button class="botao-adicionar btn-add-promo">
                    <ion-icon name="add-outline"></ion-icon>
                </button>
            </div>
        </div>
    `;
}

    async function buscarEnderecoPorCEP(cep) {
        const inputRua = document.getElementById('endereco-rua');
        const inputBairro = document.getElementById('endereco-bairro');
        const inputNumero = document.getElementById('endereco-numero');
        try {
            const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep.replace('-', '')}`);
            if (!response.ok) throw new Error('CEP não encontrado.');
            const data = await response.json();
            if(inputRua) inputRua.value = data.street;
            if(inputBairro) inputBairro.value = data.neighborhood;
            if(inputRua) inputRua.readOnly = false;
            if(inputBairro) inputBairro.readOnly = false;
            if(inputNumero) inputNumero.focus();
            await calcularTaxaPorBairro(data.neighborhood);
        } catch (error) {
            console.error(error);
            mostrarNotificacao("CEP não encontrado. Verifique e tente novamente.", "error");
            if(inputRua) inputRua.value = '';
            if(inputBairro) inputBairro.value = '';
        }
    }

    async function calcularTaxaPorBairro(bairro) {
        if (!bairro) {
            taxaDeEntrega = 5.00;
            atualizarTodosResumos();
            return;
        }
        try {
            const response = await fetch('/api/calculate-delivery-fee', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bairro: bairro })
            });
            if (!response.ok) throw new Error('Não foi possível calcular a taxa.');
            const data = await response.json();
            taxaDeEntrega = data.taxaDeEntrega;
            mostrarNotificacao(`Taxa de entrega para ${bairro}: R$ ${taxaDeEntrega.toFixed(2).replace('.',',')}`);
            atualizarTodosResumos();
        } catch (error) {
            console.error(error);
            mostrarNotificacao("Erro ao buscar taxa. Taxa padrão aplicada.", "error");
            taxaDeEntrega = 5.00;
            atualizarTodosResumos();
        }
    }


function criarCardPromocionalHTML(item) {
    let description = item.description || '';
    if (item.item_type === 'single' && item.components && item.components.sabores) {
        description = `Sabores: ${item.components.sabores.join(', ')}.`;
    }
    
    return `
        <div class="cartao-produto promocional" data-item-id="${item.id}" data-item-type="${item.item_type}">
            <div class="container-detalhes-produto">
                <div class="texto-info-produto">
                    <h3>${item.name}</h3>
                    <h4>${description}</h4>
                </div>
            </div>
            <div class="acoes-produto">
                <div class="precos-container">
                    <span class="preco">${formatCurrency(item.price)}</span>
                </div>
                <button class="botao-adicionar btn-add-promo">
                    <ion-icon name="add-outline"></ion-icon>
                </button>
            </div>
        </div>
    `;
}


function configurarEventListeners() {
    if (listenersConfigurados) return;

    configurarBuscaPorCEP();
    window.addEventListener('resize', ajustarPaddingCorpo);

    document.body.addEventListener('click', async (e) => {
        const target = e.target;

        if (target.closest('#botao-carrinho-mobile, #botao-carrinho-desktop')) {
            e.preventDefault();
            togglePainelCarrinho(true);
            return;
        }
        if (target.closest('#botao-fechar-painel-novo') || target.closest('#sobreposicao-carrinho') || target.closest('#adicionar-mais-itens')) {
            e.preventDefault();
            togglePainelCarrinho(false);
            return;
        }

        const filtroBtn = target.closest('.botao-filtro');
        if (filtroBtn && filtroBtn.closest('.barra-filtros')) {
            barraFiltros.querySelector('.ativo')?.classList.remove('ativo');
            filtroBtn.classList.add('ativo');
            filtrarPorCategoria(filtroBtn.dataset.categoria);
            return;
        }
        
        const mainContainer = document.getElementById('main-container');
        if (mainContainer && mainContainer.contains(target)) {
            const cartaoProduto = target.closest('.cartao-produto');
            if (cartaoProduto) {
                const isPromocional = cartaoProduto.classList.contains('promocional');

                if (isPromocional) {
                    const itemId = cartaoProduto.dataset.itemId;
                    const itemData = promoDataDoDia?.items?.find(i => i.id == itemId);

                    if (itemData) {
                        openComboModal(itemData);
                    } else {
                        mostrarNotificacao('Promoção indisponível no momento.', 'error');
                    }
                    return;
                }

                const produtoId = parseInt(cartaoProduto.dataset.id);
                const produto = produtosVisiveis.find(p => p.id === produtoId);
                if (!produto) return;

                if (e.target.closest('.botao-adicionar')) {
                    adicionarAoCarrinho(produto, 1, null, []);
                } else {
                    const comboModal = document.getElementById('combo-modal-overlay');
                    if (comboModal) comboModal.classList.remove('ativo');

                    produtoAtualModal = { 
                        ...produto, 
                        precoBase: parseFloat(produto.is_promo_active && produto.promo_price > 0 ? produto.promo_price : produto.price), 
                        precoFinal: parseFloat(produto.is_promo_active && produto.promo_price > 0 ? produto.promo_price : produto.price) 
                    };
                    
                    document.getElementById('nome-produto-modal').textContent = produto.name;
                    document.getElementById('desc-produto-modal').textContent = produto.description;
                    document.querySelector('.modal-produto .entrada-quantidade').value = 1;
                    document.getElementById('observacao-produto').value = '';
                    
                    popularAdicionais(produto);
                    atualizarPrecoTotalModal();
                    configurarModalProduto();
                    
                    if (sobreposicaoModal) sobreposicaoModal.classList.add('ativo');
                }
                return;
            }
        }
    });

    todasEntradasPesquisa.forEach(input => {
        input.addEventListener('input', () => filtrarEBuscarProdutos(input.value.toLowerCase().trim()));
    });

    if (barraFiltros) {
        if(btnScrollLeft) btnScrollLeft.addEventListener('click', () => barraFiltros.scrollBy({ left: -250, behavior: 'smooth' }));
        if(btnScrollRight) btnScrollRight.addEventListener('click', () => barraFiltros.scrollBy({ left: 250, behavior: 'smooth' }));
        barraFiltros.addEventListener('scroll', gerenciarSetasScroll);
    }
    
    const listaItensCarrinhoEl = document.getElementById('lista-itens-carrinho');
    if (listaItensCarrinhoEl) {
        listaItensCarrinhoEl.addEventListener('click', (e) => {
            const itemEl = e.target.closest('.item-carrinho-novo');
            if (!itemEl) return;
            const idUnico = itemEl.dataset.idUnico;
            const itemNoCarrinho = carrinho.find(i => i.idUnico === idUnico);
            if (!itemNoCarrinho) return;
            if (e.target.closest('.aumentar-item')) {
                atualizarQuantidade(idUnico, itemNoCarrinho.quantity + 1);
            } else if (e.target.closest('.diminuir-item')) {
                atualizarQuantidade(idUnico, itemNoCarrinho.quantity - 1);
            } else if (e.target.closest('.botao-remover-item')) {
                removerItemDoCarrinho(idUnico);
            }
        });
    }

    if (btnContinuarCarrinho) {
        btnContinuarCarrinho.addEventListener('click', () => {
            if (carrinho.length === 0) {
                mostrarNotificacao("Sua sacola está vazia!", "error");
                return;
            }
            switch (etapaAtualCarrinho) {
                case 'itens':
                    navegarCarrinho('metodo-entrega');
                    break;
                case 'metodo-entrega':
                    const metodoSelecionado = document.querySelector('input[name="tipo-entrega"]:checked').value;
                    pedido.metodoEntrega = metodoSelecionado;
                    navegarCarrinho(metodoSelecionado === 'padrao' ? 'dados-entrega' : 'dados-retirada');
                    break;
                case 'dados-entrega':
                    if (formEndereco?.checkValidity()) navegarCarrinho('pagamento');
                    else formEndereco?.reportValidity();
                    break;
                case 'dados-retirada':
                    if (formRetirada?.checkValidity()) navegarCarrinho('pagamento');
                    else formRetirada?.reportValidity();
                    break;
                case 'pagamento':
                    const metodoEscolhidoEl = document.querySelector('input[name="payment-method-choice"]:checked');
                    if (!metodoEscolhidoEl) return mostrarNotificacao("Por favor, selecione uma forma de pagamento.", "error");
                    const metodoEscolhido = metodoEscolhidoEl.value;
                    if (metodoEscolhido === 'dinheiro') {
                        const precisaTroco = document.querySelector('input[name="precisa-troco"]:checked').value === 'sim';
                        if (precisaTroco) {
                            finalizarPedido(metodoEscolhido);
                        } else {
                            const confirmModal = document.getElementById('change-confirm-modal');
                            if (confirmModal) confirmModal.classList.add('ativo');
                        }
                    } else {
                        if (metodoEscolhido === 'cartao') iniciarCheckoutPro();
                        else if (metodoEscolhido === 'pix') gerarCobrancaPix();
                        else finalizarPedido(metodoEscolhido);
                    }
                    break;
            }
        });
    }

    if (btnVoltarCarrinho) {
        btnVoltarCarrinho.addEventListener('click', () => {
            switch (etapaAtualCarrinho) {
                case 'pagamento':
                    navegarCarrinho(pedido.metodoEntrega === 'padrao' ? 'dados-entrega' : 'dados-retirada');
                    break;
                case 'dados-entrega':
                case 'dados-retirada':
                    navegarCarrinho('metodo-entrega');
                    break;
                case 'metodo-entrega':
                    navegarCarrinho('itens');
                    break;
            }
        });
    }

    const confirmModal = document.getElementById('change-confirm-modal');
    if (confirmModal) {
        const btnConfirmNoChange = document.getElementById('btn-confirm-no-change');
        const btnNeedsChange = document.getElementById('btn-needs-change');
        btnConfirmNoChange.addEventListener('click', () => {
            finalizarPedido('dinheiro');
            confirmModal.classList.remove('ativo');
        });
        btnNeedsChange.addEventListener('click', () => {
            confirmModal.classList.remove('ativo');
            const radioSim = document.querySelector('input[name="precisa-troco"][value="sim"]');
            if (radioSim) {
                radioSim.checked = true;
                radioSim.dispatchEvent(new Event('change'));
                document.getElementById('valor-troco')?.focus();
            }
        });
    }

    const cupomSection = document.querySelector('.secao-cupom');
    if (cupomSection) {
        cupomSection.addEventListener('click', async (e) => {
            const applyButton = e.target.closest('button');
            if (!applyButton) return;
            const inputCupom = document.querySelector('.secao-cupom input[type="text"]');
            let couponCode = applyButton.classList.contains('btn-aplicar-cupom') ? e.target.closest('.coupon-available').dataset.code : inputCupom?.value;
            if (applyButton.classList.contains('btn-aplicar-cupom') && inputCupom) inputCupom.value = couponCode;
            if (!couponCode) return mostrarNotificacao('Digite ou selecione um código de cupom.', 'error');
            const { subtotalItens } = calcularResumoFinanceiro();
            const token = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE_URL}/api/coupons/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ couponCode, subtotal: subtotalItens }) });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message);
                cupomAplicado = result.coupon;
                if (cupomAplicado.discount_type === 'free_item' && result.free_item_product) {
                    adicionarAoCarrinho({ ...result.free_item_product, price: 0, originalPrice: result.free_item_product.price }, 1, 'Mimo do ZapClube!', []);
                    mostrarNotificacao(`Cupom ${cupomAplicado.code} aplicado! Seu mimo foi adicionado ao carrinho.`, 'success');
                } else {
                    mostrarNotificacao(result.message, 'success');
                }
                atualizarTodosResumos();
            } catch (error) {
                mostrarNotificacao(error.message, 'error');
                cupomAplicado = null;
                if(inputCupom) inputCupom.value = '';
                atualizarTodosResumos();
            }
        });
    }
    
    // CÓDIGO NOVO ADICIONADO AQUI
    const resumoToggle = document.getElementById('resumo-footer-toggle');
    const resumoContainer = document.getElementById('resumo-collapsible-container');
    if (resumoToggle && resumoContainer) {
        resumoToggle.addEventListener('click', () => {
            resumoContainer.classList.toggle('expanded');
        });
    }

    listenersConfigurados = true;
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
            applicationServerKey: urlBase64ToUint8Array('BDeBFr3uzIHhlT4j-9Xu7s5c4PXcOTb4O9GMOeEjWN276jiWVIeZTpGGeiAftStrAGjFJzh_HrscbKfO6h0vqfA')
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
        
        if (typeof showNotification === 'function') {
            showNotification('Notificações ativadas com sucesso!', 'success');
        } else {
            alert('Notificações ativadas com sucesso!');
        }

    } catch (error) {
        console.error('Falha ao se inscrever para notificações push:', error);
        if (typeof showNotification === 'function') {
            showNotification('Não foi possível ativar as notificações.', 'error');
        } else {
            alert('Não foi possível ativar as notificações.');
        }
    }
}


function setupPushNotifications() {
    if ('Notification' in window && 'serviceWorker' in navigator) {
        if (Notification.permission === 'granted') {
            console.log('Permissão para notificações já concedida.');
            if (localStorage.getItem('authToken')) {
                subscribeUserToPush();
            }
        } else if (Notification.permission !== 'denied') {
            console.log('Usuário ainda não deu permissão para notificações.');
        }
    } else {
        console.warn('Este navegador não suporta notificações push.');
    }
}


(function createWhatsAppButton() {
    const phoneNumber = '5519991432597';
    const message = encodeURIComponent('Olá! Preciso de ajuda.');

    const whatsappLink = `https://wa.me/${phoneNumber}?text=${message}`;

    const button = document.createElement('a');
    button.href = whatsappLink;
    button.target = '_blank'; 
    button.className = 'whatsapp-float-btn'; 

    button.innerHTML = `
        <ion-icon name="logo-whatsapp"></ion-icon>
        <span>Precisa de ajuda?</span>
    `;

    document.body.appendChild(button);
})();

    init();
});
