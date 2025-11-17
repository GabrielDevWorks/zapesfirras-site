
document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = '';;
    
    const telaCarregamento = document.getElementById('tela-carregamento');
    const conteudoPrincipal = document.getElementById('conteudo-principal');
    const gradePromocoes = document.getElementById('grade-promocoes');

    const sobreposicaoModal = document.getElementById('modal-sobreposicao');
    const btnFecharModal = document.getElementById('botao-fechar-modal');
    const nomeProdutoModal = document.getElementById('nome-produto-modal');
    const descProdutoModal = document.getElementById('desc-produto-modal');
    const observacaoInput = document.getElementById('observacao-produto');
    const quantidadeInput = document.querySelector('.modal-produto .entrada-quantidade');
    const btnMenosModal = document.querySelector('.modal-produto .botao-menos');
    const btnMaisModal = document.querySelector('.modal-produto .botao-mais');
    const btnAdicionarModal = document.querySelector('.botao-adicionar-carrinho-modal');

    let produtoAtualModal = {}; 


    const formatCurrency = (value) => (parseFloat(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });


    function criarCardProdutoHTML(produto) {
        return `
            <div class="cartao-produto" data-id="${produto.id}" data-category="${produto.category_name}">
                <div class="container-detalhes-produto">
                    <div class="texto-info-produto">
                        <h3>${produto.name}</h3>
                        <h4>${produto.description || ''}</h4>
                    </div>
                </div>
                <div class="acoes-produto">
                    <div class="precos-container">
                        <span class="preco">${formatCurrency(produto.price)}</span>
                    </div>
                    <button class="botao-adicionar">
                        <ion-icon name="add-outline"></ion-icon>
                    </button>
                </div>
            </div>
        `;
    }


    function atualizarPrecoTotalModal() {
        const quantidade = parseInt(quantidadeInput.value);
        const precoFinal = (parseFloat(produtoAtualModal.price) || 0) * quantidade;
        btnAdicionarModal.textContent = `Adicionar ${formatCurrency(precoFinal)}`;
    }

    /**
     * Abre e preenche o modal com os detalhes do combo selecionado.
     * @param {object} produto - O objeto do combo.
     */
    function openProductModal(produto) {
        produtoAtualModal = produto;
        nomeProdutoModal.textContent = produto.name;
        descProdutoModal.textContent = produto.description;
        observacaoInput.value = '';
        quantidadeInput.value = 1;
        
        atualizarPrecoTotalModal();
        sobreposicaoModal.classList.add('ativo');
    }

    /**
     * @param {object} produto 
     * @param {number} quantidade 
     * @param {string|null} observacao 
     */
    function adicionarAoCarrinho(produto, quantidade, observacao) {
        let carrinho = JSON.parse(localStorage.getItem('carrinhoZapEsfirras')) || [];
        const itemParaCarrinho = {
            ...produto,
            quantity: quantidade,
            observacao: observacao,
            idUnico: `${produto.id}_${Date.now()}`
        };
        carrinho.push(itemParaCarrinho);
        localStorage.setItem('carrinhoZapEsfirras', JSON.stringify(carrinho));
        
        showNotification(`${produto.name} foi adicionado à sua sacola!`, 'success');

        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500); s
    }


    async function carregarPromocoes() {
        if (!gradePromocoes) return;
        try {
            const response = await fetch(`${API_BASE_URL}/api/products`);
            if (!response.ok) throw new Error('Erro ao buscar produtos.');
            const todosProdutos = await response.json();
            const combos = todosProdutos.filter(p => p.category_name === 'Combos' && p.available);

            if (combos.length > 0) {
                gradePromocoes.innerHTML = combos.map(criarCardProdutoHTML).join('');
            } else {
                gradePromocoes.innerHTML = '<p>Nenhuma promoção ou combo disponível no momento.</p>';
            }
        } catch (error) {
            console.error("Falha ao carregar promoções:", error);
            gradePromocoes.innerHTML = '<p>Não foi possível carregar as promoções. Tente novamente mais tarde.</p>';
        }
    }

    async function init() {
        await carregarPromocoes();

        setTimeout(() => {
            telaCarregamento.style.opacity = '0';
            telaCarregamento.addEventListener('transitionend', () => telaCarregamento.style.display = 'none');
            conteudoPrincipal.style.display = 'block';
        }, 200);


        gradePromocoes.addEventListener('click', async (e) => {
            const cartao = e.target.closest('.cartao-produto');
            if (!cartao) return;

            const produtoId = parseInt(cartao.dataset.id);
            const response = await fetch(`${API_BASE_URL}/api/products`);
            const todosProdutos = await response.json();
            const produtoSelecionado = todosProdutos.find(p => p.id === produtoId);

            if (!produtoSelecionado) return;

            openProductModal(produtoSelecionado);
        });

        btnFecharModal.addEventListener('click', () => sobreposicaoModal.classList.remove('ativo'));
        btnMenosModal.addEventListener('click', () => {
            if (parseInt(quantidadeInput.value) > 1) {
                quantidadeInput.value = parseInt(quantidadeInput.value) - 1;
                atualizarPrecoTotalModal();
            }
        });
        btnMaisModal.addEventListener('click', () => {
            quantidadeInput.value = parseInt(quantidadeInput.value) + 1;
            atualizarPrecoTotalModal();
        });
        btnAdicionarModal.addEventListener('click', () => {
            const quantidade = parseInt(quantidadeInput.value);
            const observacao = observacaoInput.value.trim();
            adicionarAoCarrinho(produtoAtualModal, quantidade, observacao);
            sobreposicaoModal.classList.remove('ativo'); 
        });
    }

    init();
});